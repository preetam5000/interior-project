"""AI Analyzer + Content Classifier + Caption/Hashtag Generator."""
import json
import re
import logging
import os

from openai import AsyncOpenAI, OpenAIError

from core.config import EMERGENT_LLM_KEY
from services.notification_service import track_usage

log = logging.getLogger("ai")

ROOM_TYPES = ["Living Room", "Bedroom", "Kitchen", "Dining", "Bathroom", "Wardrobe", "Office", "Staircase", "Exterior", "Landscape", "Commercial"]
STAGES = ["Site Visit", "Construction", "Brick Work", "Electrical", "Painting", "Wood Work", "Furniture", "Styling", "Completed"]
STYLES = ["Minimal", "Luxury", "Modern", "Industrial", "Traditional", "Scandinavian"]
TYPES = ["feed", "story", "carousel", "reel", "skip"]

SYSTEM = f"""You are the senior creative director of a luxury interior design studio's Instagram.
You analyse project media and plan social content. Always respond with ONE valid JSON object only, no markdown.
Allowed room_type: {ROOM_TYPES}. Allowed project_stage: {STAGES}. Allowed design_style: {STYLES}.
Allowed content_type: {TYPES}.
Rules for content_type: polished completed spaces with strong composition -> feed; behind-the-scenes, work-in-progress,
site visits, quick moments -> story; images clearly part of a multi-shot project series -> carousel; videos -> reel;
blurry, dark, duplicate, cluttered or non-interior images -> skip.
Write captions in a luxury editorial tone similar to Architectural Digest: evocative, precise, never salesy, no emojis spam."""

SCHEMA = """{
 "title": "short evocative title (max 5 words)",
 "room_type": "...", "project_stage": "...", "design_style": "...",
 "aesthetic_score": 0-10 number, "objects": ["key furniture/materials"], "mood": "3-4 words", "materials": ["..."],
 "content_type": "feed|story|carousel|reel|skip", "confidence": 0-1 number, "reason": "1-2 sentences why",
 "recommended_crop": "4:5|1:1|9:16", "editing_style": "e.g. Warm natural light, soft contrast", "priority": "high|medium|low",
 "caption": "Instagram caption 60-120 words, editorial, ends with a soft call to action",
 "editorial_description": "2-3 sentence magazine-style description",
 "seo_description": "1 sentence SEO description under 155 chars",
 "story_text": "max 8 words overlay text for a story",
 "alt_text": "accessible description of the image",
 "hashtags": ["15-20 relevant hashtags without #"],
 "music_suggestion": "2 royalty-free track mood suggestions (e.g. from YouTube Audio Library / Pixabay Music)"
}"""


def _key(settings: dict) -> str:
    return settings.get("openai_api_key") or EMERGENT_LLM_KEY


def _client_options(settings: dict) -> dict:
    api_key = _key(settings)
    options = {"api_key": api_key, "timeout": 120.0, "max_retries": 2}
    if api_key.startswith("sk-emergent-"):
        proxy_url = (
            os.environ.get("INTEGRATION_PROXY_URL")
            or os.environ.get("integration_proxy_url")
            or "https://integrations.emergentagent.com"
        ).rstrip("/")
        options["base_url"] = f"{proxy_url}/llm"
        app_url = os.environ.get("APP_URL") or os.environ.get("REACT_APP_BACKEND_URL")
        if app_url:
            options["default_headers"] = {"X-App-ID": app_url}
    return options


async def complete_text(
    settings: dict,
    system: str,
    prompt: str,
    image_b64: str | None = None,
) -> str:
    """Send a chat completion through OpenAI or the configured Emergent proxy."""
    user_content = [{"type": "text", "text": prompt}]
    if image_b64:
        user_content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
        })
    try:
        async with AsyncOpenAI(**_client_options(settings)) as client:
            response = await client.chat.completions.create(
                model=settings.get("openai_model") or "gpt-5.4",
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_content},
                ],
            )
    except OpenAIError:
        log.exception("OpenAI chat completion failed")
        raise
    if not response.choices or not response.choices[0].message.content:
        raise ValueError("OpenAI returned an empty chat completion")
    content = response.choices[0].message.content
    if not isinstance(content, str):
        raise ValueError("OpenAI returned a non-text chat completion")
    return content


def parse_json(text: str) -> dict:
    text = text.strip()
    m = re.search(r"\{.*\}", text, re.S)
    return json.loads(m.group(0) if m else text)


def _normalise(d: dict) -> dict:
    d["content_type"] = (d.get("content_type") or "feed").lower()
    if d["content_type"] not in TYPES:
        d["content_type"] = "feed"
    d["hashtags"] = [h.lstrip("#").strip() for h in d.get("hashtags", []) if h and h.strip()][:25]
    try:
        d["confidence"] = round(float(d.get("confidence", 0.7)), 2)
    except (TypeError, ValueError):
        d["confidence"] = 0.7
    return d


async def analyze_image(settings: dict, image_b64: str, context: dict) -> dict:
    prompt = (f"Analyse this interior design media and plan its Instagram content.\n"
              f"Context: {json.dumps(context)}\nBrand: {settings.get('brand_name')}. Tone: {settings.get('caption_tone')}.\n"
              f"Return JSON exactly in this schema:\n{SCHEMA}")
    resp = await complete_text(settings, SYSTEM, prompt, image_b64)
    await track_usage("openai", "analyze_image", cost_usd=settings.get("gpt_text_cost_per_request_usd"))
    return _normalise(parse_json(resp))


async def regenerate_caption(settings: dict, post: dict, tone: str, instructions: str) -> dict:
    prompt = (f"Rewrite the Instagram copy for this {post['type']} post.\nTitle: {post.get('title')}\n"
              f"Current caption: {post.get('caption')}\nRoom/style info: {json.dumps(post.get('ai', {}).get('analysis_summary', {}))}\n"
              f"Tone: {tone or settings.get('caption_tone')}. Extra instructions: {instructions or 'none'}.\n"
              'Return JSON: {"caption": "...", "hashtags": ["without #"], "story_text": "...", "alt_text": "..."}')
    resp = await complete_text(settings, SYSTEM, prompt)
    await track_usage("openai", "regenerate_caption", cost_usd=settings.get("gpt_text_cost_per_request_usd"))
    d = parse_json(resp)
    d["hashtags"] = [h.lstrip("#") for h in d.get("hashtags", [])][:25]
    return d


async def carousel_caption(settings: dict, slides: list[dict]) -> dict:
    summary = [{k: s.get(k) for k in ["title", "room_type", "design_style", "mood", "editorial_description"]} for s in slides]
    prompt = (f"These {len(slides)} images form one Instagram carousel for a single interior project.\n{json.dumps(summary)}\n"
              f"Brand: {settings.get('brand_name')}. Write one cohesive carousel caption.\n"
              'Return JSON: {"title": "...", "caption": "...", "hashtags": ["without #"], "reason": "why these belong together"}')
    resp = await complete_text(settings, SYSTEM, prompt)
    await track_usage("openai", "carousel_caption", cost_usd=settings.get("gpt_text_cost_per_request_usd"))
    d = parse_json(resp)
    d["hashtags"] = [h.lstrip("#") for h in d.get("hashtags", [])][:25]
    return d


async def ping(settings: dict) -> str:
    return await complete_text(settings, "Reply with OK.", "Say OK")

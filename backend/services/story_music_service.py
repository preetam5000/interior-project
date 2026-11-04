"""Database-backed royalty-free music catalog and story audio rendering."""
import asyncio
import json
import logging
import math
import re
import subprocess
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import imageio_ffmpeg
import numpy as np
from PIL import Image

from core.db import db, new_id, now_iso, NO_ID
from services import storage_service as st

log = logging.getLogger("story_music")
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
STORY_SECONDS = 12
ASSET_DIR = Path(__file__).resolve().parents[1] / "assets" / "music"
CATALOG_FILE = ASSET_DIR / "catalog.json"
MUSIC_WEIGHTS = {
    "room": 0.25,
    "project_stage": 0.17,
    "mood": 0.18,
    "lighting": 0.10,
    "color": 0.10,
    "scene_caption": 0.10,
    "popularity": 0.05,
    "approved": 0.05,
}


@dataclass(frozen=True)
class MusicProvider:
    """A source of tracks whose application-use rights have been verified."""
    name: str

    async def list_tracks(self) -> list[dict]:
        raise NotImplementedError

    async def get_track(self, track_id: str) -> dict | None:
        return next((track for track in await self.list_tracks() if track.get("id") == track_id), None)


class LocalRoyaltyFreeProvider(MusicProvider):
    def __init__(self):
        super().__init__("local")

    async def list_tracks(self) -> list[dict]:
        await ensure_catalog()
        rows = await db.music_tracks.find({"is_copyright_safe": True, "rights_status": "owned"}, NO_ID).to_list(500)
        safe = []
        for row in rows:
            try:
                track_path(row)
            except (ValueError, FileNotFoundError):
                continue
            safe.append(row)
        return safe


MUSIC_PROVIDERS: dict[str, MusicProvider] = {"local": LocalRoyaltyFreeProvider()}
_catalog_ready = False


def _normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


# These are semantic style mappings only. Search never contacts or resolves an
# external music service, and the input string is never treated as a song lookup.
SEARCH_CONCEPTS = {
    "perfect": ["romantic", "soft", "piano", "acoustic", "elegant", "evening", "gentle", "love story"],
    "shape of you": ["modern", "pop", "dance", "rhythmic", "guitar", "summer", "upbeat"],
    "interstellar": ["epic", "space", "cinematic", "orchestra", "ambient", "journey"],
    "coffee": ["warm", "lofi", "jazz", "acoustic", "cozy", "morning"],
    "beach": ["summer", "relaxing", "acoustic", "ambient", "ocean", "bright"],
    "dream": ["ambient", "gentle", "ethereal", "cinematic", "calm"],
}


def _track_text(track: dict) -> str:
    values = [track.get("title"), track.get("genre"), track.get("mood"), track.get("description")]
    for key in ("genre_tags", "mood_tags", "project_tags", "room_tags", "lighting_tags", "color_tags", "semantic_tags", "search_tags"):
        values.extend(track.get(key) or [])
    return _normalize(" ".join(str(value) for value in values if value))


def _search_terms(query: str) -> list[str]:
    normalized = _normalize(query)
    stopwords = {"of", "the", "a", "an", "you", "and", "in", "to", "for", "with"}
    terms = [term for term in normalized.split() if term not in stopwords]
    for phrase, concepts in SEARCH_CONCEPTS.items():
        if phrase in normalized:
            terms.extend(_normalize(" ".join(concepts)).split())
    return list(dict.fromkeys(term for term in terms if len(term) > 1))


def _search_score(track: dict, terms: list[str]) -> int:
    text = _track_text(track)
    title = _normalize(track.get("title", ""))
    if not terms:
        return 0
    hits = sum(1 for term in terms if term in text)
    title_hits = sum(1 for term in terms if term in title)
    return title_hits * 4 + hits


def _seed_catalog() -> list[dict]:
    if not CATALOG_FILE.is_file():
        return []
    return json.loads(CATALOG_FILE.read_text(encoding="utf-8"))


async def ensure_catalog() -> None:
    """Seed the globally shared track collection from app-owned music assets."""
    global _catalog_ready
    if _catalog_ready:
        return
    for track in _seed_catalog():
        if not (ASSET_DIR / track["filename"]).is_file():
            continue
        metadata = {key: value for key, value in track.items() if key not in {"times_used", "last_used", "rating", "favorite"}}
        metadata.update({"provider": "local", "rights_status": "owned", "is_copyright_safe": True,
                         "audio_url": f"/posts/story-music/{track['id']}/preview",
                         "cover_art": f"/posts/story-music/{track['id']}/cover",
                         "tempo": track.get("tempo", track.get("bpm", 0)),
                         "energy": int(track.get("energy", 50)),
                         "stage_tags": track.get("stage_tags", track.get("project_tags", []))})
        await db.music_tracks.update_one(
            {"id": track["id"]},
            {"$set": metadata, "$setOnInsert": {"created_at": now_iso(), "times_used": 0,
                                                   "rating": track.get("rating", 4.7), "last_used": None}},
            upsert=True,
        )
    _catalog_ready = True


def track_path(track: dict) -> Path:
    filename = Path(str(track.get("filename") or "")).name
    if not filename or Path(filename).suffix.lower() not in {".mp3", ".wav", ".m4a"}:
        raise ValueError("Invalid music asset filename")
    path = (ASSET_DIR / filename).resolve()
    if path.parent != ASSET_DIR.resolve() or not path.is_file():
        raise FileNotFoundError(filename)
    return path


async def get_track(track_id: str) -> dict | None:
    track = await MUSIC_PROVIDERS["local"].get_track(track_id)
    if not track:
        return None
    try:
        track_path(track)
    except (ValueError, FileNotFoundError):
        return None
    return track


def _contains_any(tags: list[str], values: list[str]) -> bool:
    normalized_tags = [str(tag).strip().lower() for tag in tags if tag]
    normalized_values = [str(value).strip().lower() for value in values if value]
    return any(tag == value or tag in value or value in tag for tag in normalized_tags for value in normalized_values)


async def list_tracks(user: dict, *, mood: str = "", genre: str = "", duration: int | None = None,
                      project_stage: str = "", room_type: str = "", q: str = "",
                      favorites: bool = False, recently_used: bool = False) -> list[dict]:
    await ensure_catalog()
    tracks = await MUSIC_PROVIDERS["local"].list_tracks()
    favorite_rows = await db.music_favorites.find({"user_id": user.get("id")}, NO_ID).to_list(500)
    favorite_ids = {row["track_id"] for row in favorite_rows}
    recent_posts = await db.posts.find(
        {"music_track_id": {"$exists": True, "$ne": None}}, {"music_track_id": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(500)
    recent_ids = list(dict.fromkeys(p["music_track_id"] for p in recent_posts if p.get("music_track_id")))
    recent_set = set(recent_ids)
    query = q.strip()
    search_terms = _search_terms(query)
    result = []
    for track in tracks:
        track["favorite"] = track["id"] in favorite_ids
        track["recently_used"] = track["id"] in recent_set
        if mood and mood.lower() not in [tag.lower() for tag in track.get("mood_tags", [])]:
            continue
        if genre and genre.lower() not in [tag.lower() for tag in track.get("genre_tags", [track.get("genre", "")])]:
            continue
        if duration is not None and int(track.get("duration", 0)) != int(duration):
            continue
        if project_stage and not _contains_any(track.get("project_tags", []), [project_stage]):
            continue
        if room_type and not _contains_any(track.get("room_tags", []), [room_type]):
            continue
        if favorites and track["id"] not in favorite_ids:
            continue
        if recently_used and track["id"] not in recent_set:
            continue
        track["preview_url"] = f"/posts/story-music/{track['id']}/preview"
        track["audio_url"] = track["preview_url"]
        track["tempo"] = track.get("tempo", track.get("bpm", 0))
        track["energy"] = int(track.get("energy", 50))
        track["search_score"] = _search_score(track, search_terms) if query else 0
        if query and track["search_score"] <= 0:
            continue
        result.append(track)
    if recently_used:
        result.sort(key=lambda track: track.get("last_used") or "", reverse=True)
    elif query:
        result.sort(key=lambda track: (track.get("search_score", 0), track.get("is_featured", False), track.get("rating", 0)), reverse=True)
    return result


async def toggle_favorite(track_id: str, user: dict) -> bool:
    if not await get_track(track_id):
        raise ValueError("Music track not found")
    query = {"track_id": track_id, "user_id": user.get("id")}
    existing = await db.music_favorites.find_one(query, NO_ID)
    if existing:
        await db.music_favorites.delete_one(query)
        return False
    await db.music_favorites.insert_one({"id": new_id(), **query, "created_at": now_iso()})
    return True


def _values(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return [str(item) for item in value if item]
    if isinstance(value, dict):
        return [str(v) for v in value.values() if v]
    return [str(value)]


def _dominant_color_names(media: dict) -> list[str]:
    scene = media.get("scene_analysis") or {}
    analysis = media.get("analysis") or {}
    explicit = _values(scene.get("dominant_colors") or scene.get("colors") or analysis.get("dominant_colors"))
    if explicit:
        return explicit
    try:
        file_name = (media.get("files") or {}).get("enhanced") or (media.get("files") or {}).get("opencv")
        if not file_name:
            return []
        path = st.work_path(file_name)
        if not path.is_file():
            return []
        with Image.open(path) as image:
            rgb = np.asarray(image.convert("RGB").resize((48, 48)))
        mean = rgb.reshape(-1, 3).mean(axis=0)
        red, green, blue = mean
        colors = []
        if red > 145 and green > 105 and blue < 150:
            colors.append("warm")
        if max(red, green, blue) - min(red, green, blue) < 24:
            colors.append("neutral")
        if blue > red + 12:
            colors.append("cool")
        if green > red * 0.88 and green > blue * 1.05:
            colors.append("sage")
        if float(mean.mean()) > 185:
            colors.append("bright")
        if float(mean.mean()) < 105:
            colors.append("dark")
        return colors
    except Exception:
        log.debug("Could not infer story colors for %s", media.get("id"), exc_info=True)
        return []


def scene_signals(media: dict) -> dict[str, list[str]]:
    analysis = media.get("analysis") or {}
    scene = media.get("scene_analysis") or {}
    predictions = scene.get("predictions") or {}
    return {
        "room": _values(analysis.get("room_type") or predictions.get("room_type")),
        "project_stage": _values(analysis.get("project_stage") or predictions.get("project_stage")),
        "mood": _values(analysis.get("mood") or predictions.get("mood")),
        "lighting": _values(analysis.get("lighting") or predictions.get("lighting_type") or scene.get("lighting")),
        "color": _dominant_color_names(media),
        "scene": _values(scene.get("scene_category") or scene.get("scene") or analysis.get("content_type")),
        "caption": _values(analysis.get("caption") or analysis.get("suggested_caption") or media.get("caption") or scene.get("description")),
    }


def _match_score(track_tags: list[str], signal_values: list[str]) -> float:
    if not track_tags or not signal_values:
        return 50.0
    tags = [str(tag).strip().lower() for tag in track_tags]
    signals = [str(value).strip().lower() for value in signal_values]
    best = 0.0
    for tag in tags:
        for signal in signals:
            if tag == signal:
                best = max(best, 100.0)
            elif tag in signal or signal in tag:
                best = max(best, 82.0)
            elif any(token in tag for token in signal.split() if len(token) > 3):
                best = max(best, 65.0)
    return best


async def recommend_tracks(media: dict, user: dict | None = None) -> list[dict]:
    """Score every database track and return the five best matches."""
    await ensure_catalog()
    tracks = await MUSIC_PROVIDERS["local"].list_tracks()
    if not tracks:
        return []
    ids = [track["id"] for track in tracks]
    approved_cursor = await db.posts.aggregate([
        {"$match": {"music_track_id": {"$in": ids}, "status": {"$in": ["approved", "published", "scheduled"]}}},
        {"$group": {"_id": "$music_track_id", "count": {"$sum": 1}}},
    ])
    approved_rows = await approved_cursor.to_list(500)
    approved_by_track = {row["_id"]: row["count"] for row in approved_rows}
    favorite_rows = await db.music_favorites.find({"user_id": (user or {}).get("id")}, NO_ID).to_list(500)
    favorite_ids = {row["track_id"] for row in favorite_rows}
    max_uses = max((int(track.get("times_used") or 0) for track in tracks), default=0)
    max_approved = max(approved_by_track.values(), default=0)
    signals = scene_signals(media)
    ranked = []
    for track in tracks:
        pieces = {
            "room": _match_score(track.get("room_tags", []), signals["room"] + signals["scene"]),
            "project_stage": _match_score(track.get("project_tags", []), signals["project_stage"]),
            "mood": _match_score(track.get("mood_tags", []), signals["mood"]),
            "lighting": _match_score(track.get("lighting_tags", []), signals["lighting"]),
            "color": _match_score(track.get("color_tags", []), signals["color"]),
            "scene_caption": _match_score(track.get("semantic_tags", []) + track.get("search_tags", []), signals["scene"] + signals["caption"]),
            "popularity": 100 * math.log1p(int(track.get("times_used") or 0)) / math.log1p(max_uses) if max_uses else 50.0,
            "approved": 100 * approved_by_track.get(track["id"], 0) / max_approved if max_approved else 50.0,
        }
        confidence = round(sum(pieces[key] * weight for key, weight in MUSIC_WEIGHTS.items()))
        matched_context = []
        for key, label in (("room", "room"), ("project_stage", "project stage"), ("mood", "mood"),
                           ("lighting", "lighting"), ("color", "colors"), ("scene_caption", "scene and caption")):
            if signals.get(key if key != "scene_caption" else "caption") and pieces[key] >= 65:
                matched_context.append(label)
        reason = ("Matches this scene's " + ", ".join(matched_context[:3]) + ".") if matched_context else \
                 f"A {str(track.get('mood') or 'balanced').lower()} {str(track.get('genre') or 'instrumental').lower()} fit for interior storytelling."
        track.update({"confidence": confidence, "match_percentage": confidence,
                      "score_breakdown": pieces,
                      "reason": reason,
                      "favorite": track["id"] in favorite_ids,
                      "preview_url": f"/posts/story-music/{track['id']}/preview",
                      "audio_url": f"/posts/story-music/{track['id']}/preview",
                      "tempo": track.get("tempo", track.get("bpm", 0)),
                      "energy": int(track.get("energy", 50))})
        try:
            track_path(track)
        except (ValueError, FileNotFoundError):
            continue
        ranked.append(track)
    ranked.sort(key=lambda track: (track["confidence"], track.get("rating", 0), track.get("is_featured", False)), reverse=True)
    return ranked[:5]


async def mark_track_used(track_id: str) -> None:
    await db.music_tracks.update_one({"id": track_id}, {"$inc": {"times_used": 1}, "$set": {"last_used": now_iso()}})


def _run_ffmpeg(args: list[str]):
    result = subprocess.run([FFMPEG, "-y", "-loglevel", "error", *args], capture_output=True,
                            text=True, timeout=180)
    if result.returncode:
        raise RuntimeError(result.stderr[-1000:] or "FFmpeg story rendering failed")


async def render_story(image_path: str, output_path: str, music_path: str | None = None):
    video_filter = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p"
    args = ["-loop", "1", "-framerate", "30", "-i", image_path]
    if music_path:
        audio_filter = (
            "loudnorm=I=-20:TP=-2:LRA=11,volume=0.20,"
            f"afade=t=in:st=0:d=1,afade=t=out:st={STORY_SECONDS - 1}:d=1,"
            f"atrim=duration={STORY_SECONDS},asetpts=N/SR/TB"
        )
        args += ["-stream_loop", "-1", "-i", music_path, "-map", "0:v:0", "-map", "1:a:0",
                 "-af", audio_filter, "-c:a", "aac", "-b:a", "128k"]
    else:
        args += ["-map", "0:v:0", "-an"]
    args += ["-vf", video_filter, "-t", str(STORY_SECONDS), "-c:v", "libx264", "-preset", "veryfast",
             "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output_path]
    await asyncio.to_thread(_run_ffmpeg, args)

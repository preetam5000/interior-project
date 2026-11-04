"""Generate the app's original royalty-free ambient preview tracks."""
import json
import math
import subprocess
import tempfile
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MUSIC_DIR = ROOT / "assets" / "music"
SAMPLE_RATE = 22050
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

TRACKS = [
    ("luxury-ambient", "Luxury Ambient", "Ambient", "Luxury, Calm, Premium, Elegant", 72, 60,
     ["Interior", "Villa", "Completed", "Styling"], ["Living Room", "Bedroom", "Villa"], ["Daylight", "Soft Light"], ["Warm Neutrals", "Cream", "Wood"]),
    ("soft-daylight", "Soft Daylight", "Ambient", "Calm, Minimal, Relaxing", 84, 30,
     ["Interior", "Painting", "Completed"], ["Bedroom", "Living Room", "Office"], ["Daylight", "Bright"], ["White", "Neutral", "Sage"]),
    ("modern-piano", "Modern Piano", "Piano", "Modern, Elegant, Motivational", 92, 45,
     ["Interior", "Villa", "Commercial"], ["Living Room", "Office", "Commercial"], ["Daylight", "Studio Light"], ["Stone", "White", "Black"]),
    ("warm-interior", "Warm Interior", "Acoustic", "Luxury, Relaxing, Elegant", 68, 30,
     ["Wood Work", "Furniture", "Interior"], ["Kitchen", "Bedroom", "Wardrobe"], ["Warm Light", "Evening"], ["Wood", "Earthy", "Terracotta"]),
    ("cinematic-minimal", "Cinematic Minimal", "Cinematic", "Premium, Minimal, Calm", 76, 60,
     ["Interior", "Exterior", "Villa", "Commercial"], ["Villa", "Living Room", "Commercial"], ["Soft Light", "Evening"], ["Stone", "Charcoal", "Sand"]),
    ("lofi-morning", "LoFi Morning", "LoFi", "Modern, Calm, Relaxing", 82, 90,
     ["Construction", "Wood Work", "Interior"], ["Bedroom", "Office", "Kitchen"], ["Daylight", "Overcast"], ["Sage", "Wood", "Neutral"]),
    ("gentle-acoustic", "Gentle Acoustic", "Acoustic", "Relaxing, Elegant, Calm", 88, 15,
     ["Painting", "Interior", "Completed"], ["Bedroom", "Living Room"], ["Daylight", "Warm Light"], ["Cream", "Wood", "White"]),
    ("bright-spaces", "Bright Spaces", "Corporate", "Motivational, Modern, Premium", 108, 45,
     ["Commercial", "Interior", "Villa"], ["Office", "Commercial", "Living Room"], ["Bright", "Studio Light"], ["White", "Blue", "Stone"]),
    ("elegant-piano", "Elegant Piano", "Piano", "Luxury, Elegant, Premium", 78, 60,
     ["Interior", "Villa", "Completed", "Styling"], ["Villa", "Bedroom", "Living Room"], ["Soft Light", "Warm Light"], ["Gold", "Cream", "Marble"]),
    ("energetic-spaces", "Energetic Spaces", "Electronic", "Energetic, Motivational, Modern", 120, 15,
     ["Construction", "Commercial", "Exterior"], ["Office", "Commercial", "Exterior"], ["Bright", "Daylight"], ["Blue", "White", "Concrete"]),
    ("soft-romantic-piano", "Soft Romantic Piano", "Piano", "Romantic, Calm, Elegant", 70, 30,
     ["Interior", "Completed", "Styling"], ["Bedroom", "Living Room"], ["Evening", "Warm Light"], ["Cream", "Rose", "Warm Neutrals"]),
    ("warm-acoustic-guitar", "Warm Acoustic Guitar", "Acoustic", "Romantic, Relaxing, Calm", 82, 45,
     ["Interior", "Furniture", "Completed"], ["Living Room", "Bedroom", "Kitchen"], ["Warm Light", "Daylight"], ["Wood", "Earthy", "Cream"]),
    ("elegant-evening", "Elegant Evening", "Jazz", "Luxury, Elegant, Romantic", 76, 60,
     ["Interior", "Villa", "Styling"], ["Living Room", "Dining", "Villa"], ["Evening", "Warm Light"], ["Gold", "Wood", "Warm Neutrals"]),
    ("modern-pop-beat", "Modern Pop Beat", "Pop", "Modern, Energetic, Motivational", 112, 30,
     ["Interior", "Commercial", "Construction"], ["Office", "Living Room", "Commercial"], ["Bright", "Daylight"], ["Blue", "White", "Modern"]),
    ("dance-pop-groove", "Dance Pop Groove", "Pop", "Energetic, Modern, Motivational", 118, 45,
     ["Interior", "Commercial", "Completed"], ["Commercial", "Office", "Living Room"], ["Bright", "Studio Light"], ["Blue", "Colorful", "Modern"]),
    ("rhythmic-guitar-pop", "Rhythmic Guitar Pop", "Pop", "Modern, Energetic, Relaxing", 104, 30,
     ["Interior", "Wood Work", "Furniture"], ["Kitchen", "Living Room", "Commercial"], ["Daylight", "Bright"], ["Wood", "Warm Neutrals", "Modern"]),
    ("summer-pop", "Summer Pop", "Pop", "Energetic, Relaxing, Modern", 108, 60,
     ["Interior", "Exterior", "Villa"], ["Villa", "Living Room", "Exterior"], ["Bright", "Daylight"], ["Blue", "Cream", "Green"]),
    ("epic-space-piano", "Epic Space Piano", "Cinematic", "Epic, Elegant, Minimal", 64, 45,
     ["Interior", "Villa", "Commercial"], ["Villa", "Living Room", "Commercial"], ["Evening", "Soft Light"], ["Blue", "Charcoal", "Stone"]),
    ("cinematic-orchestra", "Cinematic Orchestra", "Cinematic", "Epic, Motivational, Premium", 88, 60,
     ["Construction", "Interior", "Commercial"], ["Commercial", "Villa", "Office"], ["Evening", "Studio Light"], ["Charcoal", "Stone", "Warm Neutrals"]),
    ("ambient-journey", "Ambient Journey", "Ambient", "Epic, Calm, Minimal", 66, 45,
     ["Interior", "Exterior", "Villa"], ["Villa", "Bedroom", "Living Room"], ["Soft Light", "Daylight"], ["Blue", "Sage", "Neutral"]),
    ("cozy-coffee-jazz", "Cozy Coffee Jazz", "Jazz", "Calm, Warm, Relaxing", 80, 30,
     ["Interior", "Furniture", "Completed"], ["Kitchen", "Dining", "Living Room"], ["Warm Light", "Morning"], ["Wood", "Cream", "Earthy"]),
]

CHORDS = [
    (261.63, 329.63, 392.00, 493.88), (349.23, 440.00, 523.25, 659.25),
    (392.00, 493.88, 587.33, 698.46), (220.00, 261.63, 329.63, 392.00),
]


def main():
    MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    catalog = []
    for index, (track_id, title, genre, moods, bpm, duration, project_tags, room_tags, light_tags, color_tags) in enumerate(TRACKS):
        n = duration * SAMPLE_RATE
        t = np.arange(n, dtype=np.float64) / SAMPLE_RATE
        chord_ids = (np.floor(t / 4).astype(np.int32) + index) % len(CHORDS)
        signal = np.zeros(n, dtype=np.float64)
        for chord_id, chord in enumerate(CHORDS):
            mask = chord_ids == chord_id
            if not np.any(mask):
                continue
            local_t = t[mask]
            voice = np.zeros(local_t.shape, dtype=np.float64)
            for tone_no, freq in enumerate(chord):
                voice += (np.sin(2 * math.pi * freq * local_t) +
                          0.16 * np.sin(2 * math.pi * freq * 2 * local_t) +
                          0.05 * np.sin(2 * math.pi * freq * 3 * local_t)) / (1 + tone_no * 0.1)
            signal[mask] = voice / 4
        pulse = np.maximum(0.0, np.sin(2 * math.pi * bpm / 60 * t))
        if genre in {"Piano", "Acoustic"}:
            envelope = 0.50 + 0.50 * np.exp(-((t % (60 / bpm)) * 4.0))
        elif genre in {"LoFi", "Electronic", "Corporate"}:
            envelope = 0.82 + 0.12 * pulse
        else:
            envelope = 0.82 + 0.10 * np.sin(2 * math.pi * 0.12 * t + index)
        signal *= envelope * 0.16
        fade = min(SAMPLE_RATE, n // 4)
        signal[:fade] *= np.linspace(0, 1, fade)
        signal[-fade:] *= np.linspace(1, 0, fade)
        pcm = (np.clip(signal, -0.95, 0.95) * 32767).astype(np.int16)
        bins = np.array_split(pcm.astype(np.float32), 48)
        waveform = [round(float(np.sqrt(np.mean(np.square(chunk)))) / 32767, 3) for chunk in bins]
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as scratch:
            wav_path = Path(scratch.name)
        try:
            with wave.open(str(wav_path), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(SAMPLE_RATE)
                output.writeframes(pcm.tobytes())
            filename = f"{track_id}.mp3"
            out_path = MUSIC_DIR / filename
            result = subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(wav_path),
                                     "-codec:a", "libmp3lame", "-b:a", "96k", "-ar", "44100", str(out_path)],
                                    capture_output=True, text=True, timeout=180)
            if result.returncode:
                raise RuntimeError(result.stderr[-800:] or f"Could not encode {track_id}")
        finally:
            wav_path.unlink(missing_ok=True)
        catalog.append({
            "id": track_id, "title": title, "filename": filename, "genre": genre,
            "genre_tags": [genre, "Instrumental"],
            "mood": moods.split(", ")[0], "mood_tags": moods.split(", "),
            "duration": duration, "duration_seconds": duration, "bpm": bpm,
            "tempo": bpm, "energy": min(100, max(20, round((bpm - 50) * 1.2))),
            "project_tags": project_tags, "room_tags": room_tags,
            "lighting_tags": light_tags, "color_tags": color_tags,
            "is_featured": index < 5, "times_used": 0, "rating": round(4.6 + (index % 4) * 0.1, 1),
            "favorite": False, "last_used": None, "waveform": waveform,
            "preview_url": f"/posts/story-music/{track_id}/preview",
            "audio_url": f"/posts/story-music/{track_id}/preview",
            "cover_art": f"/posts/story-music/{track_id}/cover",
            "semantic_tags": list(dict.fromkeys(moods.split(", ") + [genre, title.split()[0]])),
            "search_tags": list(dict.fromkeys([title, genre] + moods.split(", ") + project_tags + room_tags)),
            "provider": "local", "rights_status": "owned", "is_copyright_safe": True,
            "license": "Original Interior Social AI ambient recording; royalty-free for account media.",
        })
        print(f"Generated {title} ({duration}s)")
    (MUSIC_DIR / "catalog.json").write_text(json.dumps(catalog, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

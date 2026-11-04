"""Reel Generator: video transcoding to 9:16 + Ken Burns slideshow reels via ffmpeg."""
import asyncio
import subprocess
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
CLIP = 3.5
FADE = 0.5


def _run(args: list):
    proc = subprocess.run([FFMPEG, "-y", "-loglevel", "error", *args], capture_output=True, text=True, timeout=600)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-800:] or "ffmpeg failed")


async def video_thumbnail(src: str, out: str):
    await asyncio.to_thread(_run, ["-ss", "1", "-i", src, "-frames:v", "1", "-q:v", "3", out])


async def video_to_reel(src: str, out: str):
    vf = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p"
    await asyncio.to_thread(_run, ["-i", src, "-t", "90", "-vf", vf, "-c:v", "libx264", "-preset", "veryfast",
                                   "-crf", "23", "-r", "30", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out])


async def slideshow(images: list[str], out: str):
    if not images:
        raise ValueError("No images for slideshow")
    args, filters = [], []
    frames = int(CLIP * 30)
    for i, img in enumerate(images):
        args += ["-i", img]
        zoom = "min(zoom+0.0012,1.15)" if i % 2 == 0 else "if(eq(on,1),1.15,max(zoom-0.0012,1.0))"
        filters.append(f"[{i}:v]scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304,setsar=1,"
                       f"zoompan=z='{zoom}':d={frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,"
                       f"setsar=1,format=yuv420p[v{i}]")
    last = "v0"
    for k in range(1, len(images)):
        offset = round(k * (CLIP - FADE), 2)
        filters.append(f"[{last}][v{k}]xfade=transition=fade:duration={FADE}:offset={offset}[x{k}]")
        last = f"x{k}"
    args += ["-filter_complex", ";".join(filters), "-map", f"[{last}]", "-c:v", "libx264", "-preset", "veryfast",
             "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
    await asyncio.to_thread(_run, args)

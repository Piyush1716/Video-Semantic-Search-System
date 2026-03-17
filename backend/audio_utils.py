"""
audio_utils.py
--------------
Extracts audio from a video file and saves it as a 16kHz mono WAV.
"""

def extract_audio(video_path: str, audio_path: str) -> None:
    """
    Extract audio from video_path and write to audio_path as WAV.
    Requires: pip install moviepy
    """
    from moviepy import VideoFileClip

    clip = VideoFileClip(video_path)
    clip.audio.write_audiofile(
        audio_path,
        fps=16000,
        nbytes=2,
        codec="pcm_s16le",
        ffmpeg_params=["-ac", "1"],   # mono
        logger=None,
    )
    clip.close()
    print(f"[audio_utils] Audio saved to {audio_path}")

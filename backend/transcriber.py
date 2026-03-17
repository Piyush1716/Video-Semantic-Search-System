"""
transcriber.py
--------------
Sends audio to Sarvam AI and returns the diarized transcript JSON.
Requires: pip install sarvamai
"""

import os
import json


SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")


def transcribe(audio_path: str, output_dir: str) -> dict:
    """
    Upload audio to Sarvam AI, wait for job to finish, and return the
    parsed transcript dict.

    Args:
        audio_path  : path to the .wav file
        output_dir  : folder where Sarvam downloads the JSON output

    Returns:
        Parsed JSON dict from Sarvam (contains diarized_transcript.entries)
    """
    from sarvamai import SarvamAI

    client = SarvamAI(api_subscription_key=SARVAM_API_KEY)

    print("[transcriber] Creating Sarvam job…")
    job = client.speech_to_text_job.create_job(
        model="saaras:v3",
        mode="transcribe",
        language_code="unknown",
        with_diarization=True,
        num_speakers=1,
    )

    job.upload_files(file_paths=[audio_path])
    job.start()

    print("[transcriber] Waiting for transcription to complete…")
    job.wait_until_complete()

    results = job.get_file_results()
    if not results["successful"]:
        raise RuntimeError("Sarvam transcription failed — no successful results.")

    os.makedirs(output_dir, exist_ok=True)
    job.download_outputs(output_dir=output_dir)

    # Find the downloaded JSON
    json_files = [f for f in os.listdir(output_dir) if f.endswith(".json")]
    if not json_files:
        raise RuntimeError(f"No JSON found in {output_dir} after Sarvam download.")

    json_path = os.path.join(output_dir, json_files[0])
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"[transcriber] Transcript loaded from {json_path}")
    return data


def save_transcript(data: dict, path: str) -> None:
    """Persist transcript JSON to disk for later re-use."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"[transcriber] Transcript saved to {path}")


def load_transcript(path: str) -> dict:
    """Load a previously saved transcript JSON."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

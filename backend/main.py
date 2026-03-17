"""
main.py
-------
FastAPI app for Video RAG.

Flow:
  POST /upload        → save video, kick off background job
  GET  /status/{id}   → poll job progress
  POST /query         → ask a question about the video
  GET  /health        → health check

Dependencies:
  pip install fastapi uvicorn python-multipart moviepy sarvamai \
              sentence-transformers faiss-cpu numpy langchain-core langchain-groq

Run:
  uvicorn main:app --reload --port 8000
"""

import shutil
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# ── Local modules ──────────────────────────────────────────────────────────────
from audio_utils import extract_audio
from transcriber import transcribe, save_transcript, load_transcript
from rag import build_index, answer as rag_answer

# ── Dirs ───────────────────────────────────────────────────────────────────────
UPLOAD_DIR = Path("./uploads")
OUTPUT_DIR = Path("./output")
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# ── In-memory state ────────────────────────────────────────────────────────────
_job_status: dict = {}      # video_id -> {"status": str, "message": str, ...}
_indices: dict = {}         # video_id -> (faiss_index, list[Chunk])

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(title="Video RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ──────────────────────────────────────────────────

class QueryRequest(BaseModel):
    question: str
    video_id: str

class QueryResponse(BaseModel):
    answer: str
    timestamps: list[dict]


# ── Background job ─────────────────────────────────────────────────────────────

def process_video(video_id: str, video_path: str):
    """Full pipeline: extract audio → transcribe → build index."""
    try:
        # Step 1 — audio
        _job_status[video_id] = {"status": "extracting_audio", "message": "Extracting audio..."}
        audio_path = str(UPLOAD_DIR / f"{video_id}.wav")
        extract_audio(video_path, audio_path)

        # Step 2 — transcribe
        _job_status[video_id] = {"status": "transcribing", "message": "Transcribing with Sarvam AI..."}
        sarvam_out_dir = str(OUTPUT_DIR / video_id)
        data = transcribe(audio_path, sarvam_out_dir)

        # Save transcript so we can reload without re-transcribing
        transcript_path = str(OUTPUT_DIR / f"{video_id}_transcript.json")
        save_transcript(data, transcript_path)

        # Step 3 — index
        _job_status[video_id] = {"status": "indexing", "message": "Building search index..."}
        index, chunks = build_index(data)
        _indices[video_id] = (index, chunks)

        # Simple timestamp list for the frontend
        entries = data["diarized_transcript"]["entries"]
        timestamps = [
            {
                "time": f"{int(e['start_time_seconds']) // 60}:{int(e['start_time_seconds']) % 60:02d}",
                "title": f"Speaker {e['speaker_id']}",
                "description": e["transcript"][:80],
            }
            for e in entries
        ]

        _job_status[video_id] = {
            "status": "done",
            "message": "Ready",
            "timestamps": timestamps,
        }

    except Exception as exc:
        _job_status[video_id] = {"status": "error", "message": str(exc)}


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.post("/upload")
async def upload_video(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Upload a video and start the processing pipeline."""
    video_id = Path(file.filename).stem.replace(" ", "_")
    video_path = str(UPLOAD_DIR / file.filename)

    with open(video_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    _job_status[video_id] = {"status": "queued", "message": "Job queued"}
    background_tasks.add_task(process_video, video_id, video_path)

    return {"video_id": video_id, "message": "Processing started"}


@app.get("/status/{video_id}")
async def get_status(video_id: str):
    """Poll processing progress."""
    if video_id not in _job_status:
        raise HTTPException(status_code=404, detail="Video not found")
    return _job_status[video_id]


@app.post("/query", response_model=QueryResponse)
async def query_video(req: QueryRequest):
    """Ask a question about the video. Returns answer + relevant timestamps."""
    if req.video_id not in _indices:
        transcript_path = OUTPUT_DIR / f"{req.video_id}_transcript.json"
        if not transcript_path.exists():
            raise HTTPException(
                status_code=404,
                detail="Video not found. Upload and wait for processing to finish first.",
            )
        data = load_transcript(str(transcript_path))
        index, chunks = build_index(data)
        _indices[req.video_id] = (index, chunks)

    index, chunks = _indices[req.video_id]
    result = rag_answer(req.question, index, chunks)
    return QueryResponse(answer=result.answer, timestamps=result.timestamps)


@app.get("/video/{video_id}")
async def serve_video(video_id: str):
    """Stream the uploaded video back to the browser."""
    for ext in ["mp4", "mov", "avi", "mkv", "webm"]:
        path = UPLOAD_DIR / f"{video_id}.{ext}"
        if path.exists():
            return FileResponse(str(path), media_type=f"video/{ext}")

    matches = list(UPLOAD_DIR.glob(f"{video_id}.*"))
    if matches:
        return FileResponse(str(matches[0]))

    raise HTTPException(status_code=404, detail="Video file not found")


@app.get("/health")
async def health():
    return {"status": "ok"}

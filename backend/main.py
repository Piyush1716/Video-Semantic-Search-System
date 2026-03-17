"""
FastAPI backend for Video RAG pipeline.
Integrates Sarvam AI transcription + FAISS + Groq LLaMA 3 RAG.

Install dependencies:
    pip install fastapi uvicorn python-multipart sarvamai sentence-transformers faiss-cpu numpy langchain-core langchain-groq

Run:
    uvicorn main:app --reload --port 8000
"""

import os
import json
import tempfile
import shutil
from pathlib import Path
from typing import Optional
import numpy as np

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ── Lazy imports (heavy libs) ──────────────────────────────────────────────────
_embed_model = None
_faiss_index = None
_docs = None
_llm = None
_job_status: dict = {}  # video_id -> {"status": ..., "message": ...}

UPLOAD_DIR = Path("./uploads")
OUTPUT_DIR = Path("./output")
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Video RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # dev: allow all origins
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ── Models ─────────────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    question: str
    video_id: str


class QueryResponse(BaseModel):
    answer: str
    timestamps: list[dict]


# ── Helpers ────────────────────────────────────────────────────────────────────

def get_embed_model():
    global _embed_model
    if _embed_model is None:
        from sentence_transformers import SentenceTransformer
        _embed_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    return _embed_model


def get_llm():
    global _llm
    if _llm is None:
        from langchain_groq import ChatGroq
        _llm = ChatGroq(
            model="llama-3.3-70b-versatile",
            api_key=os.getenv("GROQ_API_KEY",),
        )
    return _llm


def embed_texts(texts: list[str]) -> np.ndarray:
    return get_embed_model().encode(texts, normalize_embeddings=True)


def seconds_to_mmss(seconds: float) -> str:
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m}:{s:02d}"


# ── Step 1: Extract audio ──────────────────────────────────────────────────────

def extract_audio(video_path: str, audio_path: str):
    from moviepy import VideoFileClip

    clip = VideoFileClip(video_path)
    clip.audio.write_audiofile(
        audio_path,
        fps=16000,
        nbytes=2,
        codec="pcm_s16le",
        ffmpeg_params=["-ac", "1"],  # mono
        logger=None,
    )
    clip.close()


# ── Step 2: Transcribe with Sarvam ─────────────────────────────────────────────

def transcribe_with_sarvam(audio_path: str, output_dir: str) -> dict:
    from sarvamai import SarvamAI

    client = SarvamAI(
        api_subscription_key=os.getenv(
            "SARVAM_API_KEY"
        )
    )

    job = client.speech_to_text_job.create_job(
        model="saaras:v3",
        mode="transcribe",
        language_code="unknown",
        with_diarization=True,
        num_speakers=1,
    )
    job.upload_files(file_paths=[audio_path])
    job.start()
    job.wait_until_complete()

    file_results = job.get_file_results()
    if not file_results["successful"]:
        raise RuntimeError("Sarvam transcription produced no successful results.")

    job.download_outputs(output_dir=output_dir)

    json_files = [f for f in os.listdir(output_dir) if f.endswith(".json")]
    if not json_files:
        raise RuntimeError("No JSON output from Sarvam.")

    with open(os.path.join(output_dir, json_files[0]), "r", encoding="utf-8") as f:
        return json.load(f)


# ── Step 3: Build FAISS index from transcript ──────────────────────────────────

def build_index(data: dict):
    import faiss
    from langchain_core.documents import Document

    entries = data["diarized_transcript"]["entries"]
    docs = [
        Document(
            page_content=e["transcript"],
            metadata={
                "start": e["start_time_seconds"],
                "end": e["end_time_seconds"],
                "speaker": e["speaker_id"],
            },
        )
        for e in entries
    ]

    embeddings = embed_texts([d.page_content for d in docs])
    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(np.array(embeddings))

    return index, docs


# ── Step 4: RAG answer ─────────────────────────────────────────────────────────

def answer_query(question: str, index, docs) -> QueryResponse:
    import faiss
    from langchain_core.prompts import PromptTemplate

    q_emb = embed_texts([question])
    _, indices = index.search(np.array(q_emb), k=3)
    retrieved = [docs[i] for i in indices[0]]

    context = "\n".join(
        f"[{d.metadata['start']:.2f}s - {d.metadata['end']:.2f}s] "
        f"(Speaker {d.metadata['speaker']}): {d.page_content}"
        for d in retrieved
    )

    prompt = PromptTemplate(
        input_variables=["context", "question"],
        template="""You are a helpful video content assistant.
Use the context below to answer the question concisely.
Always mention timestamps when relevant.

Context:
{context}

Question:
{question}

Answer:""",
    )

    response = get_llm().invoke(prompt.format(context=context, question=question))

    timestamps = [
        {
            "time": seconds_to_mmss(d.metadata["start"]),
            "description": d.page_content[:80] + ("…" if len(d.page_content) > 80 else ""),
        }
        for d in retrieved
    ]

    return QueryResponse(answer=response.content, timestamps=timestamps)


# ── In-memory store for loaded indices ────────────────────────────────────────

_indices: dict = {}  # video_id -> (faiss_index, docs)


# ── Background job ─────────────────────────────────────────────────────────────

def process_video_job(video_id: str, video_path: str):
    try:
        _job_status[video_id] = {"status": "extracting_audio", "message": "Extracting audio…"}
        audio_path = str(UPLOAD_DIR / f"{video_id}.wav")
        extract_audio(video_path, audio_path)

        _job_status[video_id] = {"status": "transcribing", "message": "Transcribing with Sarvam AI…"}
        out_dir = str(OUTPUT_DIR / video_id)
        os.makedirs(out_dir, exist_ok=True)
        data = transcribe_with_sarvam(audio_path, out_dir)

        # Save transcript
        transcript_path = str(OUTPUT_DIR / f"{video_id}_transcript.json")
        with open(transcript_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        _job_status[video_id] = {"status": "indexing", "message": "Building search index…"}
        index, docs = build_index(data)
        _indices[video_id] = (index, docs)

        # Build frontend-friendly timestamps from transcript
        entries = data["diarized_transcript"]["entries"]
        timestamps = [
            {
                "time": seconds_to_mmss(e["start_time_seconds"]),
                "title": f"Speaker {e['speaker_id']}",
                "description": e["transcript"][:80],
            }
            for e in entries
        ]

        _job_status[video_id] = {
            "status": "done",
            "message": "Ready",
            "timestamps": timestamps,
            "transcript_path": transcript_path,
        }

    except Exception as exc:
        _job_status[video_id] = {"status": "error", "message": str(exc)}


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.post("/upload")
async def upload_video(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Upload a video file and start the transcription + indexing pipeline."""
    video_id = Path(file.filename).stem.replace(" ", "_")
    video_path = str(UPLOAD_DIR / file.filename)

    with open(video_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    _job_status[video_id] = {"status": "queued", "message": "Job queued"}
    background_tasks.add_task(process_video_job, video_id, video_path)

    return {"video_id": video_id, "message": "Processing started"}


@app.get("/status/{video_id}")
async def get_status(video_id: str):
    """Poll for transcription/indexing progress."""
    if video_id not in _job_status:
        raise HTTPException(status_code=404, detail="Video not found")
    return _job_status[video_id]


@app.post("/query", response_model=QueryResponse)
async def query_video(req: QueryRequest):
    """Ask a question about the video. Returns answer + relevant timestamps."""
    if req.video_id not in _indices:
        # Try loading from saved transcript
        transcript_path = OUTPUT_DIR / f"{req.video_id}_transcript.json"
        if not transcript_path.exists():
            raise HTTPException(status_code=404, detail="Video index not found. Upload and process the video first.")
        with open(transcript_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        index, docs = build_index(data)
        _indices[req.video_id] = (index, docs)

    index, docs = _indices[req.video_id]
    return answer_query(req.question, index, docs)


@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/video/{video_id}")
async def serve_video(video_id: str):
    """Stream the uploaded video file back to the browser."""
    from fastapi.responses import FileResponse
    import glob

    # Find the uploaded file — try common extensions
    for ext in ["mp4", "mov", "avi", "mkv", "webm"]:
        path = UPLOAD_DIR / f"{video_id}.{ext}"
        if path.exists():
            return FileResponse(str(path), media_type=f"video/{ext}")

    # Fallback: search for any file starting with video_id
    matches = list(UPLOAD_DIR.glob(f"{video_id}.*"))
    if matches:
        return FileResponse(str(matches[0]))

    raise HTTPException(status_code=404, detail="Video file not found")

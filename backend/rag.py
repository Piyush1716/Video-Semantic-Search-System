"""
rag.py
------
Builds a FAISS vector index from a transcript and answers questions with
Groq LLaMA 3 (RAG = Retrieve → Augment → Generate).

Requires:
    pip install sentence-transformers faiss-cpu numpy langchain-core langchain-groq
"""

import os
import numpy as np
from dataclasses import dataclass

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
EMBED_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
LLM_MODEL_NAME = "llama-3.3-70b-versatile"
TOP_K = 3   # how many transcript chunks to retrieve


# ── Lazy-loaded singletons ────────────────────────────────────────────────────

_embed_model = None
_llm = None


def _get_embed_model():
    global _embed_model
    if _embed_model is None:
        from sentence_transformers import SentenceTransformer
        print(f"[rag] Loading embedding model: {EMBED_MODEL_NAME}")
        _embed_model = SentenceTransformer(EMBED_MODEL_NAME)
    return _embed_model


def _get_llm():
    global _llm
    if _llm is None:
        from langchain_groq import ChatGroq
        print(f"[rag] Connecting to Groq model: {LLM_MODEL_NAME}")
        _llm = ChatGroq(model=LLM_MODEL_NAME, api_key=GROQ_API_KEY)
    return _llm


# ── Helpers ───────────────────────────────────────────────────────────────────

def _embed(texts: list[str]) -> np.ndarray:
    return _get_embed_model().encode(texts, normalize_embeddings=True)


def _seconds_to_mmss(seconds: float) -> str:
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m}:{s:02d}"


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class Chunk:
    text: str
    start: float
    end: float
    speaker: str


@dataclass
class RAGResponse:
    answer: str
    timestamps: list[dict]   # [{"time": "1:23", "description": "..."}]


# ── Core functions ────────────────────────────────────────────────────────────

def build_index(transcript_data: dict) -> tuple:
    """
    Build a FAISS index from Sarvam transcript data.

    Args:
        transcript_data: parsed JSON from Sarvam (contains diarized_transcript.entries)

    Returns:
        (faiss_index, list[Chunk])
    """
    import faiss

    entries = transcript_data["diarized_transcript"]["entries"]

    chunks = [
        Chunk(
            text=e["transcript"],
            start=e["start_time_seconds"],
            end=e["end_time_seconds"],
            speaker=e["speaker_id"],
        )
        for e in entries
    ]

    print(f"[rag] Embedding {len(chunks)} transcript chunks…")
    embeddings = _embed([c.text for c in chunks])

    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)   # inner-product = cosine similarity (normalized vecs)
    index.add(embeddings.astype(np.float32))

    print("[rag] FAISS index built.")
    return index, chunks


def answer(question: str, index, chunks: list[Chunk]) -> RAGResponse:
    """
    Retrieve relevant chunks and generate an answer with the LLM.

    Args:
        question : user question string
        index    : FAISS index (from build_index)
        chunks   : list of Chunk objects (from build_index)

    Returns:
        RAGResponse with .answer and .timestamps
    """
    # ── Retrieve ──────────────────────────────────────────────────────────────
    q_emb = _embed([question]).astype(np.float32)
    _, indices = index.search(q_emb, k=min(TOP_K, len(chunks)))
    retrieved = [chunks[i] for i in indices[0]]

    # ── Augment ───────────────────────────────────────────────────────────────
    context_lines = [
        f"[{c.start:.1f}s – {c.end:.1f}s] Speaker {c.speaker}: {c.text}"
        for c in retrieved
    ]
    context = "\n".join(context_lines)

    prompt = f"""You are a helpful video content assistant.
Use the transcript context below to answer the question concisely.
Mention timestamps when relevant.

Context:
{context}

Question: {question}

Answer:"""

    # ── Generate ──────────────────────────────────────────────────────────────
    llm_response = _get_llm().invoke(prompt)

    timestamps = [
        {
            "time": _seconds_to_mmss(c.start),
            "description": c.text[:80] + ("…" if len(c.text) > 80 else ""),
        }
        for c in retrieved
    ]

    return RAGResponse(answer=llm_response.content, timestamps=timestamps)

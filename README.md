# 🔍 Audio/Video Semantic Search System

## 📌 Project Overview

This project aims to create an intelligent system that allows users to search through audio or video content using natural language queries (text or audio). The system identifies speakers, transcribes audio into Hindi, and performs semantic segmentation to enable question-based search. 

Key components include:
- **Speech transcription** using OpenAI’s Whisper
- **Speaker diarization** using PyAnnote and Resemblyzer
- **Semantic search** via ChromaDB embeddings
- **Question answering** with Retrieval-Augmented Generation (RAG)
- **Web interface** for transcript search and media playback

---

## 🚀 Features

- 🎙️ Extract audio from video
- ✂️ Segment speech with timestamps
- 🧑‍🏫 Identify speaker roles (e.g., teacher vs student)
- 🗣️ Transcribe speech to Hindi with speaker & time metadata
- 🔍 Break content into semantic units for embedding
- ❓ Support question-based search (Hindi/English)
- 🎛️ Web interface for searching & playback with labeled transcript

---

## 💡 Use Cases

- 🎓 Educational lecture transcription and indexing
- 🧾 Automatic subtitle generation in Hindi
- 📊 Conversational analytics for meetings/interviews
- 🔎 Interactive semantic search over long-form speech
- 🧠 Real-time Q&A from recorded class videos

---

## ⚠️ Challenges Faced

- High computation cost for diarization (especially on CPU)
- Accurate speaker alignment with transcribed content
- Ensuring Whisper’s Hindi output retained contextual correctness
- Maintaining uniform output structure across pipeline stages


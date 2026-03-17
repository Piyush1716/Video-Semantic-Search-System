import { useState, useRef } from "react";
import { Play, Plus, Upload, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const API_BASE = "http://localhost:8000";

// Polling interval in ms
const POLL_INTERVAL = 2500;

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued…",
  extracting_audio: "Extracting audio…",
  transcribing: "Transcribing with Sarvam AI…",
  indexing: "Building search index…",
  done: "Ready",
  error: "Error",
};

interface VideoItem {
  id: string;
  title: string;
  duration?: string;
  status: "uploading" | "processing" | "done" | "error";
  statusMessage?: string;
  timestamps?: { time: string; title: string; description: string }[];
  errorMessage?: string;
}

export default function VideoRecommendations({ onVideoSelect }) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateVideo = (id: string, patch: Partial<VideoItem>) =>
    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const pollStatus = (videoId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/status/${videoId}`);
        const data = await res.json();

        if (data.status === "done") {
          clearInterval(interval);
          updateVideo(videoId, {
            status: "done",
            statusMessage: "Ready",
            timestamps: data.timestamps ?? [],
          });
        } else if (data.status === "error") {
          clearInterval(interval);
          updateVideo(videoId, {
            status: "error",
            statusMessage: "Error",
            errorMessage: data.message,
          });
        } else {
          updateVideo(videoId, {
            status: "processing",
            statusMessage: STATUS_LABELS[data.status] ?? data.message,
          });
        }
      } catch {
        // network blip — keep polling
      }
    }, POLL_INTERVAL);
  };

  const uploadFile = async (file: File) => {
    const videoId = file.name.replace(/\.[^/.]+$/, "").replace(/\s+/g, "_");

    const newVideo: VideoItem = {
      id: videoId,
      title: file.name,
      status: "uploading",
      statusMessage: "Uploading…",
    };
    setVideos((prev) => [newVideo, ...prev]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(await res.text());

      updateVideo(videoId, { status: "processing", statusMessage: "Queued…" });
      pollStatus(videoId);
    } catch (err: any) {
      updateVideo(videoId, { status: "error", statusMessage: "Upload failed", errorMessage: err.message });
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files)
      .filter((f) => f.type.startsWith("video/"))
      .forEach(uploadFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeVideo = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold mb-3">Sources</h2>

        {/* Upload area */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-blue-400 bg-blue-950/30"
              : "border-gray-600 hover:border-gray-400 hover:bg-gray-800/50"
          }`}
        >
          <Upload className="w-6 h-6 mx-auto mb-2 text-gray-400" />
          <p className="text-sm text-gray-400">
            Drop video files here or <span className="text-blue-400">browse</span>
          </p>
          <p className="text-xs text-gray-600 mt-1">MP4, MOV, AVI, MKV supported</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {videos.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Play className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Upload a video to get started</p>
          </div>
        )}

        {videos.map((video) => (
          <div
            key={video.id}
            onClick={() => video.status === "done" && onVideoSelect(video)}
            className={`bg-gray-800 rounded-lg p-3 transition-colors relative group ${
              video.status === "done"
                ? "cursor-pointer hover:bg-gray-700"
                : "cursor-default opacity-80"
            }`}
          >
            {/* Remove button */}
            <button
              onClick={(e) => removeVideo(video.id, e)}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-start gap-3 pr-5">
              {/* Thumbnail / status icon */}
              <div className="w-16 h-12 bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                {video.status === "uploading" || video.status === "processing" ? (
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                ) : video.status === "done" ? (
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm truncate mb-1">{video.title}</h3>

                {/* Status bar */}
                {video.status !== "done" && (
                  <div className="space-y-1">
                    <p className={`text-xs ${video.status === "error" ? "text-red-400" : "text-blue-400"}`}>
                      {video.statusMessage}
                    </p>
                    {video.status === "processing" && (
                      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full animate-pulse w-3/5" />
                      </div>
                    )}
                    {video.errorMessage && (
                      <p className="text-xs text-red-500 truncate">{video.errorMessage}</p>
                    )}
                  </div>
                )}

                {video.status === "done" && (
                  <p className="text-xs text-green-400">
                    {video.timestamps?.length ?? 0} segments indexed • Click to open
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

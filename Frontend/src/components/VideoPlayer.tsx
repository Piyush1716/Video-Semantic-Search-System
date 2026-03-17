import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const API_BASE = "http://localhost:8000";

export default function VideoPlayer({ selectedVideo, currentQuery }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState("0:00");
  const [duration, setDuration] = useState("0:00");
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("overview");
  const [notes, setNotes] = useState("");

  const timestamps: { time: string; title: string; description: string }[] =
    selectedVideo?.timestamps ?? [];

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime("0:00");
    setProgress(0);
  }, [selectedVideo?.id]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(formatTime(v.currentTime));
    setProgress(v.duration ? (v.currentTime / v.duration) * 100 : 0);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) setDuration(formatTime(videoRef.current.duration));
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const rect = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - rect.left) / rect.width) * v.duration;
  };

  const seekTo = (timeStr: string) => {
    const v = videoRef.current;
    if (!v) return;
    const [m, s] = timeStr.split(":").map(Number);
    v.currentTime = m * 60 + s;
    v.play();
    setIsPlaying(true);
  };

  const videoSrc = selectedVideo ? `${API_BASE}/video/${selectedVideo.id}` : undefined;

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold">Studio</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {selectedVideo ? (
          <div className="p-4 space-y-4">

            {/* Real HTML5 video player */}
            <div className="bg-black rounded-lg overflow-hidden relative group">
              <video
                ref={videoRef}
                src={videoSrc}
                className="w-full aspect-video cursor-pointer"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlaying(false)}
                onClick={togglePlay}
              />

              {/* Controls — visible on hover */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-3 pb-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Seek bar */}
                <div
                  className="w-full h-1.5 bg-white/20 rounded-full mb-3 cursor-pointer"
                  onClick={handleProgressClick}
                >
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button onClick={togglePlay} className="text-white hover:text-blue-400">
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </button>
                    <button onClick={toggleMute} className="text-white hover:text-blue-400">
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <span className="text-white text-xs font-mono">
                      {currentTime} / {duration}
                    </span>
                  </div>
                  <button
                    onClick={() => videoRef.current?.requestFullscreen?.()}
                    className="text-white hover:text-blue-400"
                  >
                    <Maximize className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-700">
              <div className="flex gap-6">
                {["overview", "timestamps", "notes"].map((tab) => (
                  <button
                    key={tab}
                    className={`pb-2 px-1 text-sm font-medium ${
                      activeTab === tab
                        ? "border-b-2 border-blue-500 text-blue-400"
                        : "text-gray-400 hover:text-white"
                    }`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab === "overview" ? "Audio Overview" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="space-y-4">
              {activeTab === "overview" && (
                <div className="space-y-4">
                  <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      <span className="text-sm text-blue-400">
                        {selectedVideo.status === "done"
                          ? `Transcription complete — ${timestamps.length} segments indexed`
                          : "Processing video…"}
                      </span>
                    </div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-gray-600 rounded flex items-center justify-center">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-medium">Deep Dive conversation</h3>
                        <p className="text-sm text-gray-400">Two hosts</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">Customize</Button>
                      <Button size="sm">Generate</Button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "timestamps" && (
                <div className="space-y-3">
                  {timestamps.length === 0 ? (
                    <p className="text-center py-8 text-gray-500 text-sm">No segments yet.</p>
                  ) : (
                    timestamps.map((ts, i) => (
                      <div
                        key={i}
                        onClick={() => seekTo(ts.time)}
                        className="bg-gray-800 rounded-lg p-3 hover:bg-gray-700 cursor-pointer transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <span className="bg-blue-600 px-2 py-1 rounded text-xs font-mono flex-shrink-0">
                            {ts.time}
                          </span>
                          <div>
                            <h4 className="font-medium text-sm mb-1">{ts.title}</h4>
                            <p className="text-xs text-gray-400">{ts.description}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "notes" && (
                <div className="space-y-4">
                  <Button className="w-full" variant="outline">
                    <Plus className="w-4 h-4 mr-2" /> Add note
                  </Button>
                  <Textarea
                    placeholder="Add your notes here…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-[200px] bg-gray-800 border-gray-600"
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 h-full flex items-center justify-center">
            <div className="text-center text-gray-500">
              <Play className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Select a processed video from Sources to start</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

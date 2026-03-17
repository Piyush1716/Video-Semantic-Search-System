import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_BASE = "http://localhost:8000";

interface Timestamp {
  time: string;
  description: string;
}

interface Message {
  type: "user" | "assistant";
  content: string;
  timestamps?: Timestamp[];
  loading?: boolean;
}

export default function ChatInterface({ messages, onQuerySubmit, selectedVideo }) {
  const [inputValue, setInputValue] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Sync externally managed messages (if any) with local ones
  useEffect(() => {
    if (messages?.length) setLocalMessages(messages);
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = inputValue.trim();
    if (!question) return;

    setInputValue("");

    // Optimistically add user message
    const userMsg: Message = { type: "user", content: question };
    const loadingMsg: Message = { type: "assistant", content: "", loading: true };

    setLocalMessages((prev) => [...prev, userMsg, loadingMsg]);
    setIsLoading(true);

    // Also notify parent if it wants to track messages
    onQuerySubmit?.(question);

    try {
      if (!selectedVideo?.id) {
        throw new Error("Please select a processed video first.");
      }

      const res = await fetch(`${API_BASE}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          video_id: selectedVideo.id,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Server error");
      }

      const data = await res.json();

      setLocalMessages((prev) => [
        ...prev.slice(0, -1), // remove loading bubble
        {
          type: "assistant",
          content: data.answer,
          timestamps: data.timestamps,
        },
      ]);
    } catch (err: any) {
      setLocalMessages((prev) => [
        ...prev.slice(0, -1),
        {
          type: "assistant",
          content: `⚠️ ${err.message}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const canSend = inputValue.trim() && !isLoading;
  const videoReady = selectedVideo?.status === "done";

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold">Chat</h2>
        {selectedVideo && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {videoReady
              ? `Chatting about: ${selectedVideo.title}`
              : `Waiting for processing: ${selectedVideo.title}`}
          </p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {localMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 text-sm px-4">
            {videoReady ? (
              <>
                <p className="mb-1">Ask anything about the video.</p>
                <p className="text-xs text-gray-600">The AI will answer with timestamps from the transcript.</p>
              </>
            ) : (
              <p>Upload and process a video, then ask questions here.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {localMessages.map((message, index) => (
              <div key={index}>
                {message.type === "user" ? (
                  <div className="flex justify-end">
                    <div className="bg-blue-600 text-white px-4 py-2 rounded-lg max-w-xs text-sm">
                      {message.content}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-start">
                    <div className="bg-gray-700 px-4 py-3 rounded-lg max-w-md">
                      {message.loading ? (
                        <div className="flex items-center gap-2 text-gray-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Thinking…</span>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm mb-2 whitespace-pre-wrap">{message.content}</p>
                          {message.timestamps && message.timestamps.length > 0 && (
                            <div className="space-y-1 pt-2 border-t border-gray-600">
                              <p className="text-xs text-gray-500 mb-1">Referenced segments:</p>
                              {message.timestamps.map((ts, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-sm">
                                  <span className="bg-blue-600 px-2 py-0.5 rounded text-xs font-mono flex-shrink-0">
                                    {ts.time}
                                  </span>
                                  <span className="text-gray-300 text-xs">{ts.description}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={
              videoReady
                ? "Ask a question about the video…"
                : "Select a processed video first…"
            }
            disabled={!videoReady || isLoading}
            className="flex-1 bg-gray-800 border-gray-600"
          />
          <Button type="submit" size="icon" disabled={!canSend || !videoReady}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
        <div className="flex items-center justify-between mt-2 text-sm text-gray-500">
          <span>
            {selectedVideo?.timestamps
              ? `${selectedVideo.timestamps.length} segments indexed`
              : "0 sources"}
          </span>
          {isLoading && <span className="text-blue-400 text-xs">Querying RAG…</span>}
        </div>
      </div>
    </div>
  );
}

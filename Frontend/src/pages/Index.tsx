import { useState } from "react";
import VideoRecommendations from "@/components/VideoRecommendations";
import ChatInterface from "@/components/ChatInterface";
import VideoPlayer from "@/components/VideoPlayer";

export default function Index() {
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [currentQuery, setCurrentQuery] = useState("");

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      {/* Left Panel - Sources / Upload */}
      <div className="w-80 border-r border-gray-700 flex flex-col">
        <VideoRecommendations onVideoSelect={setSelectedVideo} />
      </div>

      {/* Center Panel - Chat */}
      <div className="flex-1 border-r border-gray-700 flex flex-col">
        <ChatInterface
          messages={[]}
          onQuerySubmit={(q) => setCurrentQuery(q)}
          selectedVideo={selectedVideo}  
        />
      </div>

      {/* Right Panel - Studio / Video Player */}
      <div className="w-96 flex flex-col">
        <VideoPlayer
          selectedVideo={selectedVideo}
          currentQuery={currentQuery}
        />
      </div>
    </div>
  );
}

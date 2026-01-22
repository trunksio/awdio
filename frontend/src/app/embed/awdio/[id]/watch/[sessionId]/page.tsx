"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getEmbedAwdioSession, API_URL } from "@/lib/api";
import type { EmbedAwdioFull, SessionManifest } from "@/lib/types";
import { AwdioPlayer } from "@/components/awdio";

export default function EmbedWatchPage() {
  const params = useParams();
  const awdioId = params.id as string;
  const sessionId = params.sessionId as string;

  const [data, setData] = useState<EmbedAwdioFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  // Mark when we're on the client
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Compute WebSocket URL only on client
  const wsUrl = useMemo(() => {
    if (!isClient) return "";

    // If API_URL is a relative path (e.g., /awdio), construct WS URL from window.location
    if (API_URL.startsWith("/")) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${window.location.host}${API_URL}`;
    }

    // Otherwise, replace http with ws
    return API_URL.replace(/^http/, "ws");
  }, [isClient]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        const embedData = await getEmbedAwdioSession(awdioId, sessionId);

        if (!cancelled) {
          setData(embedData);
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to load embed data:", e);
          setError(e instanceof Error ? e.message : "Failed to load presentation");
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [awdioId, sessionId]);

  if (loading || !isClient) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <span className="text-white/60">Loading presentation...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <svg
            className="w-16 h-16 mx-auto text-red-500 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h1 className="text-white text-xl font-semibold mb-2">
            Unable to load presentation
          </h1>
          <p className="text-gray-400">
            {error || "This presentation is not available or has not been published."}
          </p>
        </div>
      </div>
    );
  }

  // Convert EmbedManifest to SessionManifest format for the player
  const manifest: SessionManifest = {
    id: data.manifest.id,
    session_id: data.manifest.session_id,
    total_duration_ms: data.manifest.total_duration_ms,
    segment_count: data.manifest.segment_count,
    manifest: data.manifest.manifest,
    created_at: new Date().toISOString(), // Not provided by embed API
  };

  const handleComplete = () => {
    // In embed mode, we could post a message to the parent frame
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: "awdio_complete", awdioId, sessionId },
        "*"
      );
    }
  };

  return (
    <div className="h-screen w-screen bg-black overflow-hidden">
      <AwdioPlayer
        manifest={manifest}
        audioBaseUrl={API_URL}
        slideBaseUrl={API_URL}
        wsBaseUrl={wsUrl}
        awdioId={awdioId}
        sessionId={sessionId}
        title={data.session.title}
        enableQA={true}
        onComplete={handleComplete}
      />

      {/* Powered by Awdio badge - subtle, bottom right */}
      <a
        href="https://awdio.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-2 right-2 text-white/30 hover:text-white/50 text-xs transition-colors z-50"
      >
        Powered by Awdio
      </a>
    </div>
  );
}

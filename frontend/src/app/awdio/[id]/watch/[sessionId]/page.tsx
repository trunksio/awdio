"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getAwdio, getAwdioSession, getAwdioSessionManifest } from "@/lib/api";
import type { Awdio, AwdioSession, SessionManifest } from "@/lib/types";
import { AwdioPlayer } from "@/components/awdio";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function WatchPage() {
  const params = useParams();
  const awdioId = params.id as string;
  const sessionId = params.sessionId as string;

  const [awdio, setAwdio] = useState<Awdio | null>(null);
  const [session, setSession] = useState<AwdioSession | null>(null);
  const [manifest, setManifest] = useState<SessionManifest | null>(null);
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
        const [awdioData, sessionData, manifestData] = await Promise.all([
          getAwdio(awdioId),
          getAwdioSession(awdioId, sessionId),
          getAwdioSessionManifest(awdioId, sessionId),
        ]);

        if (!cancelled) {
          setAwdio(awdioData);
          setSession(sessionData);
          setManifest(manifestData);
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to load session data:", e);
          setError(e instanceof Error ? e.message : "Failed to load session");
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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <span className="text-white/60">Loading presentation...</span>
        </div>
      </div>
    );
  }

  if (error || !awdio || !session || !manifest) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
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
          <p className="text-gray-400 mb-6">
            {error || "Session not found or audio not yet synthesized"}
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  const handleComplete = () => {
    console.log("Presentation complete");
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Navigation Header (shows on hover at top) */}
      <div className="fixed top-0 left-0 right-0 z-50 opacity-0 hover:opacity-100 transition-opacity duration-300">
        <div className="p-4 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="text-white/60 hover:text-white text-sm flex items-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Home
            </Link>
            <div className="text-white/60 text-sm">
              {awdio.title} - {session.title}
            </div>
          </div>
        </div>
      </div>

      {/* Main Player */}
      <div className="h-screen">
        <AwdioPlayer
          manifest={manifest}
          audioBaseUrl={API_URL}
          slideBaseUrl={API_URL}
          wsBaseUrl={wsUrl}
          awdioId={awdioId}
          sessionId={sessionId}
          title={session.title}
          enableQA={true}
          onComplete={handleComplete}
        />
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="fixed bottom-4 left-4 text-white/30 text-xs space-y-1 opacity-0 hover:opacity-100 transition-opacity duration-300">
        <div>Space: Play/Pause</div>
        <div>Arrows: Navigate</div>
        <div>F: Fullscreen</div>
        <div>M: Mute</div>
      </div>
    </div>
  );
}

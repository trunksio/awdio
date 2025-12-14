"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getAwdio,
  getAwdioSession,
  getAwdioSessionScript,
  getAwdioSessionManifest,
  generateAwdioSessionScript,
  synthesizeAwdioSession,
  listSlides,
} from "@/lib/api";
import type {
  Awdio,
  AwdioSession,
  NarrationScript,
  SessionManifest,
  Slide,
} from "@/lib/types";

export default function SessionDetailPage() {
  const params = useParams();
  const awdioId = params.id as string;
  const sessionId = params.sessionId as string;

  const [awdio, setAwdio] = useState<Awdio | null>(null);
  const [session, setSession] = useState<AwdioSession | null>(null);
  const [script, setScript] = useState<NarrationScript | null>(null);
  const [manifest, setManifest] = useState<SessionManifest | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [awdioData, sessionData] = await Promise.all([
        getAwdio(awdioId),
        getAwdioSession(awdioId, sessionId),
      ]);
      setAwdio(awdioData);
      setSession(sessionData);

      // Load slides if deck is assigned
      if (sessionData.slide_deck_id) {
        const slidesData = await listSlides(awdioId, sessionData.slide_deck_id);
        setSlides(slidesData);
      }

      // Try to load existing script
      try {
        const scriptData = await getAwdioSessionScript(awdioId, sessionId);
        setScript(scriptData);
      } catch {
        setScript(null);
      }

      // Try to load existing manifest
      try {
        const manifestData = await getAwdioSessionManifest(awdioId, sessionId);
        setManifest(manifestData);
      } catch {
        setManifest(null);
      }

      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [awdioId, sessionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleGenerateScript() {
    try {
      setGenerating(true);
      setError(null);
      const newScript = await generateAwdioSessionScript(awdioId, sessionId);
      setScript(newScript);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate script");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSynthesize() {
    try {
      setSynthesizing(true);
      setError(null);
      const manifestData = await synthesizeAwdioSession(awdioId, sessionId);
      setManifest(manifestData);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to synthesize audio");
    } finally {
      setSynthesizing(false);
    }
  }

  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  function getSlideForSegment(slideId: string): Slide | undefined {
    return slides.find((s) => s.id === slideId);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!awdio || !session) {
    return <div className="text-red-400">Session not found</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href={`/admin/awdios/${awdioId}`}
          className="text-gray-400 hover:text-white text-sm"
        >
          ← Back to {awdio.title}
        </Link>
        <h1 className="text-3xl font-bold mt-2">{session.title}</h1>
        {session.description && (
          <p className="text-gray-400 mt-1">{session.description}</p>
        )}
        <p className="text-sm text-gray-500 mt-1">
          Status: <span className={`px-2 py-0.5 rounded text-xs ${
            session.status === "synthesized"
              ? "bg-green-600/20 text-green-400"
              : session.status === "scripted"
              ? "bg-blue-600/20 text-blue-400"
              : "bg-gray-600/20 text-gray-400"
          }`}>{session.status}</span>
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Actions */}
        <div className="space-y-6">
          {/* Script Generation */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Generate Script</h2>
            <p className="text-sm text-gray-400 mb-4">
              Generate narration for each slide in the presentation.
              {slides.length > 0 && ` (${slides.length} slides)`}
            </p>
            <button
              onClick={handleGenerateScript}
              disabled={generating || slides.length === 0}
              className="w-full px-4 py-3 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {generating
                ? "Generating..."
                : script
                ? "Regenerate Script"
                : "Generate Script"}
            </button>
            {generating && (
              <p className="text-sm text-gray-400 text-center mt-2">
                This may take a minute...
              </p>
            )}
          </div>

          {/* Synthesis */}
          {script && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Audio Synthesis</h2>
              <p className="text-sm text-gray-400 mb-4">
                Synthesize audio for all narration segments.
              </p>
              <button
                onClick={handleSynthesize}
                disabled={synthesizing}
                className="w-full px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50"
              >
                {synthesizing
                  ? "Synthesizing..."
                  : manifest
                  ? "Re-synthesize Audio"
                  : "Synthesize Audio"}
              </button>
              {synthesizing && (
                <p className="text-sm text-gray-400 text-center mt-2">
                  Synthesizing audio for all segments...
                </p>
              )}

              {manifest && (
                <div className="mt-4 p-3 bg-gray-800 rounded-lg text-sm">
                  <div className="text-green-400 mb-2">Audio Ready</div>
                  <div className="text-gray-400 mb-3">
                    {manifest.segment_count} segments •{" "}
                    {manifest.total_duration_ms && formatDuration(manifest.total_duration_ms)}
                  </div>
                  <Link
                    href={`/awdio/${awdioId}/watch/${sessionId}`}
                    className="block w-full px-4 py-2 bg-green-600 text-white text-center font-medium rounded-lg hover:bg-green-500 transition-colors"
                  >
                    Watch Now
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Slides Preview */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">
              Slides ({slides.length})
            </h2>
            {slides.length === 0 ? (
              <p className="text-sm text-gray-400">No slides in the deck</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {slides.map((slide) => (
                  <div
                    key={slide.id}
                    className="p-2 bg-gray-800 rounded text-sm"
                  >
                    <div className="font-medium">
                      {slide.title || `Slide ${slide.slide_index + 1}`}
                    </div>
                    {slide.description && (
                      <p className="text-gray-400 text-xs line-clamp-2 mt-1">
                        {slide.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Script Preview */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">
            Script {script && `(${script.segments.length} segments)`}
            {manifest && (
              <span className="ml-2 text-sm font-normal text-green-400">
                Audio synthesized
              </span>
            )}
          </h2>

          {!script ? (
            <div className="text-center py-16 text-gray-400">
              <p>No script generated yet.</p>
              <p className="text-sm mt-2">
                Click &quot;Generate Script&quot; to create narration for your slides.
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {script.segments
                .sort((a, b) => a.segment_index - b.segment_index)
                .map((segment) => {
                  const slide = getSlideForSegment(segment.slide_id);
                  return (
                    <div
                      key={segment.id}
                      className="p-4 bg-gray-800 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-blue-400">
                            {slide?.title || `Slide ${segment.segment_index + 1}`}
                          </span>
                          <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-400">
                            {segment.speaker_name}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          #{segment.segment_index + 1}
                          {segment.audio_duration_ms ? (
                            <span className="text-green-400">
                              {" "}
                              • {Math.round(segment.audio_duration_ms / 1000)}s
                            </span>
                          ) : (
                            segment.duration_estimate_ms && (
                              <>
                                {" "}
                                • ~{Math.round(segment.duration_estimate_ms / 1000)}s
                              </>
                            )
                          )}
                        </span>
                      </div>
                      <p className="text-gray-300 whitespace-pre-wrap">
                        {segment.content}
                      </p>
                      {segment.audio_path && (
                        <div className="mt-2 text-xs text-green-400">
                          Audio ready
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

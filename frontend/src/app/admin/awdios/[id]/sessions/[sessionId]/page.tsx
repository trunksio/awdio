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
  updateNarrationSegment,
  synthesizeSegment,
  listSlides,
  validateSessionPublish,
  publishSession,
  unpublishSession,
  getSessionEmbedCode,
} from "@/lib/api";
import type {
  Awdio,
  AwdioSession,
  NarrationScript,
  NarrationSegment,
  SessionManifest,
  Slide,
  EmbedCodeResponse,
  PublishValidationResponse,
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

  // Segment editing
  const [editingSegment, setEditingSegment] = useState<NarrationSegment | null>(null);
  const [editContent, setEditContent] = useState("");
  const [savingSegment, setSavingSegment] = useState(false);
  const [synthesizingSegmentId, setSynthesizingSegmentId] = useState<string | null>(null);

  // Publishing
  const [publishing, setPublishing] = useState(false);
  const [publishValidation, setPublishValidation] = useState<PublishValidationResponse | null>(null);
  const [showEmbedModal, setShowEmbedModal] = useState(false);
  const [embedCode, setEmbedCode] = useState<EmbedCodeResponse | null>(null);
  const [embedCopied, setEmbedCopied] = useState(false);

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

      // Check publish validation
      try {
        const validation = await validateSessionPublish(awdioId, sessionId);
        setPublishValidation(validation);
      } catch {
        setPublishValidation(null);
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

  function openSegmentEditor(segment: NarrationSegment) {
    setEditingSegment(segment);
    setEditContent(segment.content);
  }

  function closeSegmentEditor() {
    setEditingSegment(null);
    setEditContent("");
  }

  async function handleSaveSegment() {
    if (!editingSegment) return;

    try {
      setSavingSegment(true);
      setError(null);
      const updatedSegment = await updateNarrationSegment(
        awdioId,
        sessionId,
        editingSegment.id,
        editContent
      );
      // Update local state
      if (script) {
        setScript({
          ...script,
          segments: script.segments.map((s) =>
            s.id === updatedSegment.id ? updatedSegment : s
          ),
        });
      }
      closeSegmentEditor();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save segment");
    } finally {
      setSavingSegment(false);
    }
  }

  async function handleSynthesizeSegment(segmentId: string) {
    try {
      setSynthesizingSegmentId(segmentId);
      setError(null);
      const updatedSegment = await synthesizeSegment(awdioId, sessionId, segmentId);
      // Update local state
      if (script) {
        setScript({
          ...script,
          segments: script.segments.map((s) =>
            s.id === updatedSegment.id ? updatedSegment : s
          ),
        });
      }
      // Reload manifest since it may have been updated
      try {
        const manifestData = await getAwdioSessionManifest(awdioId, sessionId);
        setManifest(manifestData);
      } catch {
        // Manifest may not exist yet
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to synthesize segment");
    } finally {
      setSynthesizingSegmentId(null);
    }
  }

  async function handlePublish() {
    try {
      setPublishing(true);
      setError(null);
      await publishSession(awdioId, sessionId);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to publish session");
    } finally {
      setPublishing(false);
    }
  }

  async function handleUnpublish() {
    try {
      setPublishing(true);
      setError(null);
      await unpublishSession(awdioId, sessionId);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unpublish session");
    } finally {
      setPublishing(false);
    }
  }

  async function handleShowEmbedCode() {
    try {
      setError(null);
      const code = await getSessionEmbedCode(awdioId, sessionId);
      setEmbedCode(code);
      setShowEmbedModal(true);
      setEmbedCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get embed code");
    }
  }

  function handleCopyEmbedCode() {
    if (embedCode) {
      navigator.clipboard.writeText(embedCode.embed_code);
      setEmbedCopied(true);
      setTimeout(() => setEmbedCopied(false), 2000);
    }
  }

  function handleCopyEmbedUrl() {
    if (embedCode) {
      navigator.clipboard.writeText(embedCode.embed_url);
      setEmbedCopied(true);
      setTimeout(() => setEmbedCopied(false), 2000);
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
            session.status === "published"
              ? "bg-purple-600/20 text-purple-400"
              : session.status === "synthesized"
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

          {/* Publishing */}
          {manifest && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Publishing</h2>

              {session.status === "published" ? (
                <>
                  <div className="p-3 bg-purple-900/30 border border-purple-700 rounded-lg mb-4">
                    <div className="flex items-center gap-2 text-purple-400 mb-1">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Published
                    </div>
                    <p className="text-sm text-gray-400">
                      This session is live and can be embedded on external sites.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <button
                      onClick={handleShowEmbedCode}
                      className="w-full px-4 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-500 transition-colors"
                    >
                      Get Embed Code
                    </button>
                    <button
                      onClick={handleUnpublish}
                      disabled={publishing}
                      className="w-full px-4 py-2 text-sm border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                      {publishing ? "Unpublishing..." : "Unpublish"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-400 mb-4">
                    Publish this session to make it available for embedding on external websites.
                  </p>
                  {publishValidation && !publishValidation.valid && (
                    <div className="p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg mb-4 text-sm">
                      <div className="text-yellow-400 font-medium mb-1">Cannot publish yet:</div>
                      <ul className="text-yellow-200/80 space-y-1">
                        {publishValidation.errors.map((err, i) => (
                          <li key={i}>• {err.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button
                    onClick={handlePublish}
                    disabled={publishing || !publishValidation?.valid}
                    className="w-full px-4 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-500 transition-colors disabled:opacity-50"
                  >
                    {publishing ? "Publishing..." : "Publish Session"}
                  </button>
                </>
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
                  const isSynthesizingThis = synthesizingSegmentId === segment.id;
                  return (
                    <div
                      key={segment.id}
                      className={`p-4 bg-gray-800 rounded-lg ${
                        isSynthesizingThis ? "ring-2 ring-blue-500" : ""
                      }`}
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
                        <div className="flex items-center gap-2">
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
                          <button
                            onClick={() => openSegmentEditor(segment)}
                            disabled={isSynthesizingThis}
                            className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleSynthesizeSegment(segment.id)}
                            disabled={!!synthesizingSegmentId || synthesizing}
                            className="px-2 py-1 text-xs bg-green-700 text-white rounded hover:bg-green-600 disabled:opacity-50"
                          >
                            {isSynthesizingThis ? "Synthesizing..." : segment.audio_path ? "Re-synth" : "Synthesize"}
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-300 whitespace-pre-wrap">
                        {segment.content}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        {segment.audio_path ? (
                          <span className="text-xs text-green-400">Audio ready</span>
                        ) : (
                          <span className="text-xs text-yellow-400">No audio</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Segment Edit Modal */}
      {editingSegment && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Edit Segment #{editingSegment.segment_index + 1}
              </h3>
              <button
                onClick={closeSegmentEditor}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Narration Content
                  <span className="text-gray-400 font-normal ml-2">
                    (Edit the text to be synthesized)
                  </span>
                </label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Enter the narration text..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm min-h-[200px] resize-y"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  After saving, click &quot;Re-synth&quot; to generate new audio for this segment.
                </p>
              </div>
              {editingSegment.audio_path && (
                <p className="text-xs text-yellow-400">
                  Note: Saving will clear the current audio. You&apos;ll need to re-synthesize after editing.
                </p>
              )}
            </div>
            <div className="p-4 border-t border-gray-800 flex justify-end gap-2">
              <button
                onClick={closeSegmentEditor}
                className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSegment}
                disabled={savingSegment || editContent === editingSegment.content}
                className="px-4 py-2 text-sm bg-white text-black font-medium rounded hover:bg-gray-200 disabled:opacity-50"
              >
                {savingSegment ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Embed Code Modal */}
      {showEmbedModal && embedCode && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Embed Code</h3>
              <button
                onClick={() => setShowEmbedModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-6">
              {/* Iframe Code */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Iframe Embed Code</label>
                  <button
                    onClick={handleCopyEmbedCode}
                    className="text-xs px-2 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                  >
                    {embedCopied ? "Copied!" : "Copy Code"}
                  </button>
                </div>
                <pre className="p-3 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 overflow-x-auto whitespace-pre-wrap">
                  {embedCode.embed_code}
                </pre>
                <p className="text-xs text-gray-500 mt-2">
                  Paste this code into your website&apos;s HTML to embed the presentation.
                </p>
              </div>

              {/* Direct URL */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Direct URL</label>
                  <button
                    onClick={handleCopyEmbedUrl}
                    className="text-xs px-2 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                  >
                    {embedCopied ? "Copied!" : "Copy URL"}
                  </button>
                </div>
                <div className="p-3 bg-gray-800 border border-gray-700 rounded text-sm">
                  <a
                    href={embedCode.embed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 break-all"
                  >
                    {embedCode.embed_url}
                  </a>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Share this link directly or open it to preview the embedded presentation.
                </p>
              </div>

              {/* Size Info */}
              <div className="p-3 bg-gray-800/50 rounded-lg text-sm text-gray-400">
                <p>Default size: {embedCode.width} x {embedCode.height} pixels</p>
                <p className="text-xs mt-1">
                  You can customize the width and height attributes in the iframe code.
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-gray-800 flex justify-end">
              <button
                onClick={() => setShowEmbedModal(false)}
                className="px-4 py-2 text-sm bg-white text-black font-medium rounded hover:bg-gray-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

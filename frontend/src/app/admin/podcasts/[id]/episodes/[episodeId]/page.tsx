"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  generateScript,
  getEpisode,
  getEpisodeManifest,
  getPodcast,
  getPodcastVoiceAssignments,
  getScript,
  listVoices,
  synthesizeEpisode,
} from "@/lib/api";
import type {
  Episode,
  EpisodeManifest,
  Podcast,
  Script,
  SpeakerConfig,
  Voice,
  VoiceAssignment,
} from "@/lib/types";

export default function EpisodeDetailPage() {
  const params = useParams();
  const podcastId = params.id as string;
  const episodeId = params.episodeId as string;

  const [podcast, setPodcast] = useState<Podcast | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceAssignments, setVoiceAssignments] = useState<VoiceAssignment[]>([]);
  const [manifest, setManifest] = useState<EpisodeManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Script generation config
  const [speakers, setSpeakers] = useState<SpeakerConfig[]>([
    { name: "Alice", role: "host", description: "Friendly, curious host" },
    { name: "Bob", role: "expert", description: "Knowledgeable co-host" },
  ]);
  const [duration, setDuration] = useState(5);
  const [tone, setTone] = useState("conversational and engaging");
  const [synthesisSpeed, setSynthesisSpeed] = useState(1.0);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [podcastData, episodeData, voicesData, assignmentsData] = await Promise.all([
        getPodcast(podcastId),
        getEpisode(podcastId, episodeId),
        listVoices(),
        getPodcastVoiceAssignments(podcastId),
      ]);
      setPodcast(podcastData);
      setEpisode(episodeData);
      setVoices(voicesData);
      setVoiceAssignments(assignmentsData);

      // Try to load existing script
      try {
        const scriptData = await getScript(podcastId, episodeId);
        setScript(scriptData);
      } catch {
        // No script yet
        setScript(null);
      }

      // Try to load existing manifest
      try {
        const manifestData = await getEpisodeManifest(podcastId, episodeId);
        setManifest(manifestData);
      } catch {
        // No manifest yet
        setManifest(null);
      }

      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [podcastId, episodeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleGenerateScript() {
    try {
      setGenerating(true);
      setError(null);
      const newScript = await generateScript(podcastId, episodeId, {
        speakers,
        target_duration_minutes: duration,
        tone,
      });
      setScript(newScript);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate script");
    } finally {
      setGenerating(false);
    }
  }

  function addSpeaker() {
    setSpeakers([
      ...speakers,
      { name: `Speaker ${speakers.length + 1}`, role: "guest", description: "" },
    ]);
  }

  function removeSpeaker(index: number) {
    if (speakers.length <= 2) return;
    setSpeakers(speakers.filter((_, i) => i !== index));
  }

  function updateSpeaker(index: number, field: keyof SpeakerConfig, value: string) {
    const updated = [...speakers];
    updated[index] = { ...updated[index], [field]: value };
    setSpeakers(updated);
  }

  async function handleSynthesize() {
    try {
      setSynthesizing(true);
      setError(null);
      const manifestData = await synthesizeEpisode(podcastId, episodeId, synthesisSpeed);
      setManifest(manifestData);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to synthesize audio");
    } finally {
      setSynthesizing(false);
    }
  }

  function getVoiceForSpeaker(speakerName: string): Voice | undefined {
    const assignment = voiceAssignments.find(a => a.speaker_name === speakerName);
    if (!assignment) return undefined;
    return voices.find(v => v.id === assignment.voice_id);
  }

  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!podcast || !episode) {
    return <div className="text-red-400">Episode not found</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href={`/admin/podcasts/${podcastId}`}
          className="text-gray-400 hover:text-white text-sm"
        >
          ← Back to {podcast.title}
        </Link>
        <h1 className="text-3xl font-bold mt-2">{episode.title}</h1>
        <p className="text-gray-400 mt-1">Episode • Status: {episode.status}</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Script Generation & Voice Assignment */}
        <div className="space-y-6">
          {/* Script Generation Config */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Generate Script</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Speakers
                </label>
                {speakers.map((speaker, i) => (
                  <div key={i} className="mb-3 p-3 bg-gray-800 rounded-lg">
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={speaker.name}
                        onChange={(e) => updateSpeaker(i, "name", e.target.value)}
                        placeholder="Name"
                        className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                      />
                      <input
                        type="text"
                        value={speaker.role}
                        onChange={(e) => updateSpeaker(i, "role", e.target.value)}
                        placeholder="Role"
                        className="w-24 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                      />
                      {speakers.length > 2 && (
                        <button
                          onClick={() => removeSpeaker(i)}
                          className="text-red-400 hover:text-red-300 px-2"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={speaker.description}
                      onChange={(e) => updateSpeaker(i, "description", e.target.value)}
                      placeholder="Description (optional)"
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                    />
                  </div>
                ))}
                <button
                  onClick={addSpeaker}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  + Add speaker
                </button>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Target Duration (minutes)
                </label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || 5)}
                  min={1}
                  max={60}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Tone</label>
                <input
                  type="text"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded"
                />
              </div>

              <button
                onClick={handleGenerateScript}
                disabled={generating}
                className="w-full px-4 py-3 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {generating ? "Generating..." : script ? "Regenerate Script" : "Generate Script"}
              </button>

              {generating && (
                <p className="text-sm text-gray-400 text-center">
                  This may take a minute...
                </p>
              )}
            </div>
          </div>

          {/* Synthesis */}
          {script && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Audio Synthesis</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Speed ({synthesisSpeed}x)
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={synthesisSpeed}
                    onChange={(e) => setSynthesisSpeed(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                <button
                  onClick={handleSynthesize}
                  disabled={synthesizing}
                  className="w-full px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50"
                >
                  {synthesizing ? "Synthesizing..." : manifest ? "Re-synthesize Audio" : "Synthesize Audio"}
                </button>

                {synthesizing && (
                  <p className="text-sm text-gray-400 text-center">
                    Synthesizing audio for all segments...
                  </p>
                )}

                {manifest && (
                  <div className="p-3 bg-gray-800 rounded-lg text-sm">
                    <div className="text-green-400 mb-2">Audio Ready</div>
                    <div className="text-gray-400 mb-3">
                      {manifest.segment_count} segments •{" "}
                      {manifest.total_duration_ms && formatDuration(manifest.total_duration_ms)}
                    </div>
                    <Link
                      href={`/podcast/${podcastId}/listen/${episodeId}`}
                      className="block w-full px-4 py-2 bg-green-600 text-white text-center font-medium rounded-lg hover:bg-green-500 transition-colors"
                    >
                      Listen Now
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
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
                Make sure you have documents uploaded to the knowledge base.
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {script.segments
                .sort((a, b) => a.segment_index - b.segment_index)
                .map((segment) => {
                  const assignedVoice = getVoiceForSpeaker(segment.speaker_name);
                  return (
                    <div
                      key={segment.id}
                      className="p-4 bg-gray-800 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-blue-400">
                            {segment.speaker_name}
                          </span>
                          {assignedVoice && (
                            <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-400">
                              {assignedVoice.name}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          #{segment.segment_index + 1}
                          {segment.audio_duration_ms ? (
                            <span className="text-green-400"> • {Math.round(segment.audio_duration_ms / 1000)}s</span>
                          ) : segment.duration_estimate_ms && (
                            <> • ~{Math.round(segment.duration_estimate_ms / 1000)}s</>
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

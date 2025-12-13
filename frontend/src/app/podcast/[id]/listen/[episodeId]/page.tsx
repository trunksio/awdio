"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getEpisode, getEpisodeManifest, getPodcast } from "@/lib/api";
import { PlaybackControls, SegmentManager, ProgressWaveform } from "@/components/player";
import { VoiceInterrupt } from "@/components/voice";
import { ListenerPrompt, useListener } from "@/components/listener/ListenerPrompt";
import { useSegmentSequencer } from "@/hooks/useSegmentSequencer";
import type { Episode, EpisodeManifest, Podcast } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WS_URL = API_URL.replace("http", "ws");

export default function ListenerPage() {
  const params = useParams();
  const podcastId = params.id as string;
  const episodeId = params.episodeId as string;

  const [podcast, setPodcast] = useState<Podcast | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [manifest, setManifest] = useState<EpisodeManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Listener auth (simple name-based)
  const { listener, showPrompt, isLoading: listenerLoading, handlePromptComplete } = useListener();

  // Interruption state
  const [isInterrupted, setIsInterrupted] = useState(false);
  const wasPlayingRef = useRef(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [podcastData, episodeData, manifestData] = await Promise.all([
          getPodcast(podcastId),
          getEpisode(podcastId, episodeId),
          getEpisodeManifest(podcastId, episodeId),
        ]);
        setPodcast(podcastData);
        setEpisode(episodeData);
        setManifest(manifestData);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load episode");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [podcastId, episodeId]);

  // Segment sequencer for main podcast
  const sequencer = useSegmentSequencer({
    manifest,
    audioBaseUrl: API_URL,
    onComplete: () => {
      console.log("Playback complete");
    },
  });

  // Track which segment we were on when interrupted
  const interruptedSegmentRef = useRef(0);

  // Handle interrupt start
  const handleInterruptStart = useCallback(() => {
    wasPlayingRef.current = sequencer.state.isPlaying;
    interruptedSegmentRef.current = sequencer.state.currentSegmentIndex;
    if (sequencer.state.isPlaying) {
      sequencer.pause();
    }
    setIsInterrupted(true);
  }, [sequencer]);

  // Handle interrupt end - restart from beginning of current segment
  const handleInterruptEnd = useCallback(() => {
    setIsInterrupted(false);
    // Restart from the beginning of the segment we were on
    if (wasPlayingRef.current) {
      // Seek to start of the segment we interrupted
      sequencer.seekToSegment(interruptedSegmentRef.current);
      // Small delay to let the seek complete, then play
      setTimeout(() => {
        sequencer.play();
      }, 100);
    }
  }, [sequencer]);

  // Audio is now handled by VoiceInterrupt component - these are just for state tracking
  const handleAnswerAudio = useCallback((_audioData: string, _format: string) => {
    // VoiceInterrupt handles playback - we just track state here if needed
  }, []);

  const handleBridgeAudio = useCallback((_audioData: string, _text: string) => {
    // VoiceInterrupt handles playback
  }, []);

  // Handle skip back/forward
  const handleSkipBack = useCallback(() => {
    if (sequencer.state.currentSegmentIndex > 0) {
      sequencer.seekToSegment(sequencer.state.currentSegmentIndex - 1);
    }
  }, [sequencer]);

  const handleSkipForward = useCallback(() => {
    if (sequencer.segments.length > 0 &&
        sequencer.state.currentSegmentIndex < sequencer.segments.length - 1) {
      sequencer.seekToSegment(sequencer.state.currentSegmentIndex + 1);
    }
  }, [sequencer]);

  if (loading || listenerLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading episode...</p>
        </div>
      </div>
    );
  }

  if (error || !podcast || !episode || !manifest) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">:(</div>
          <h1 className="text-xl font-bold mb-2">Unable to load episode</h1>
          <p className="text-gray-400 mb-6">
            {error || "Episode not found or audio not yet synthesized."}
          </p>
          <Link
            href={`/admin/podcasts/${podcastId}/episodes/${episodeId}`}
            className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors"
          >
            Go to Episode Editor
          </Link>
        </div>
      </div>
    );
  }

  const totalDuration = manifest.manifest.total_duration_ms / 1000;
  const minutes = Math.floor(totalDuration / 60);
  const seconds = Math.floor(totalDuration % 60);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            href="/listen"
            className="text-gray-400 hover:text-white text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <div className="text-sm text-gray-400">
            {manifest.segment_count} segments • {minutes}:{seconds.toString().padStart(2, "0")}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Episode Info */}
        <div className="text-center mb-8">
          <p className="text-sm text-gray-400 mb-2">{podcast.title}</p>
          <h1 className="text-3xl font-bold mb-2">{episode.title}</h1>
          {episode.description && (
            <p className="text-gray-400 max-w-2xl mx-auto">{episode.description}</p>
          )}
        </div>

        {/* Player */}
        <div className="bg-black rounded-2xl overflow-hidden">
          {/* Waveform */}
          <div className="p-6 pb-4">
            <div className="mb-6">
              <ProgressWaveform
                progress={
                  sequencer.state.totalDuration > 0
                    ? (sequencer.state.globalTime / sequencer.state.totalDuration) * 100
                    : 0
                }
                isPlaying={sequencer.state.isPlaying && !isInterrupted}
              />
            </div>

            {/* Playback Controls */}
            <PlaybackControls
              isPlaying={sequencer.state.isPlaying}
              isLoading={sequencer.state.isLoading}
              currentTime={sequencer.state.globalTime}
              duration={sequencer.state.totalDuration}
              playbackRate={sequencer.state.playbackRate}
              volume={sequencer.state.volume}
              onToggle={sequencer.toggle}
              onSeek={sequencer.seekToTime}
              onPlaybackRateChange={sequencer.setPlaybackRate}
              onVolumeChange={sequencer.setVolume}
              onSkipBack={sequencer.state.currentSegmentIndex > 0 ? handleSkipBack : undefined}
              onSkipForward={
                sequencer.state.currentSegmentIndex < sequencer.segments.length - 1
                  ? handleSkipForward
                  : undefined
              }
            />
          </div>

          {/* Segment Manager */}
          <div className="px-6 pb-6">
            <SegmentManager
              segments={sequencer.segments}
              currentSegmentIndex={sequencer.state.currentSegmentIndex}
              segmentStartTimes={sequencer.segmentStartTimes}
              onSegmentClick={sequencer.seekToSegment}
              showTranscript={true}
            />
          </div>

          {/* Error display */}
          {sequencer.state.error && (
            <div className="px-6 pb-6">
              <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
                {sequencer.state.error}
              </div>
            </div>
          )}
        </div>

        {/* Voice Interrupt Button */}
        <div className="flex justify-center mt-8">
          <VoiceInterrupt
            podcastId={podcastId}
            episodeId={episodeId}
            currentSegmentIndex={sequencer.state.currentSegmentIndex}
            wsBaseUrl={WS_URL}
            listenerName={listener?.name}
            listenerId={listener?.id}
            onInterruptStart={handleInterruptStart}
            onInterruptEnd={handleInterruptEnd}
            onAnswerAudio={handleAnswerAudio}
            onBridgeAudio={handleBridgeAudio}
            disabled={isInterrupted}
          />
        </div>

      </main>

      {/* Listener Prompt Modal */}
      {showPrompt && <ListenerPrompt onComplete={handlePromptComplete} />}

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-auto">
        <div className="max-w-4xl mx-auto px-4 py-4 text-center text-sm text-gray-500">
          Powered by Awdio • Hold SPACE to ask questions
        </div>
      </footer>
    </div>
  );
}

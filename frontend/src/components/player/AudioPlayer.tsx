"use client";

import type { EpisodeManifest } from "@/lib/types";
import { useSegmentSequencer } from "@/hooks/useSegmentSequencer";
import { PlaybackControls } from "./PlaybackControls";
import { SegmentManager, SegmentIndicator } from "./SegmentManager";
import { WaveformVisualizer, ProgressWaveform } from "./WaveformVisualizer";

interface AudioPlayerProps {
  manifest: EpisodeManifest;
  audioBaseUrl: string;
  title?: string;
  showTranscript?: boolean;
  showSegmentList?: boolean;
  compact?: boolean;
}

export function AudioPlayer({
  manifest,
  audioBaseUrl,
  title,
  showTranscript = true,
  showSegmentList = true,
  compact = false,
}: AudioPlayerProps) {
  const {
    state,
    currentSegment,
    segments,
    segmentStartTimes,
    play,
    pause,
    toggle,
    seekToTime,
    seekToSegment,
    setVolume,
    setPlaybackRate,
  } = useSegmentSequencer({
    manifest,
    audioBaseUrl,
    onComplete: () => {
      console.log("Playback complete");
    },
  });

  const handleSkipBack = () => {
    if (state.currentSegmentIndex > 0) {
      seekToSegment(state.currentSegmentIndex - 1);
    }
  };

  const handleSkipForward = () => {
    if (state.currentSegmentIndex < segments.length - 1) {
      seekToSegment(state.currentSegmentIndex + 1);
    }
  };

  if (compact) {
    return (
      <div className="bg-black p-4 rounded-xl">
        <div className="flex items-center gap-4">
          {/* Play/Pause */}
          <button
            onClick={toggle}
            disabled={state.isLoading}
            className="p-3 bg-white text-black rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {state.isLoading ? (
              <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : state.isPlaying ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {title && <p className="font-medium truncate">{title}</p>}
            {currentSegment && (
              <p className="text-sm text-gray-400 truncate">
                {currentSegment.speaker}: {currentSegment.text}
              </p>
            )}
          </div>

          {/* Segment indicator */}
          <SegmentIndicator
            segments={segments}
            currentSegmentIndex={state.currentSegmentIndex}
            onSegmentClick={seekToSegment}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black rounded-2xl overflow-hidden">
      {/* Header with title and waveform */}
      <div className="p-6 pb-4">
        {title && (
          <h2 className="text-xl font-bold mb-4 text-center">{title}</h2>
        )}

        {/* Waveform visualization */}
        <div className="mb-6">
          <ProgressWaveform
            progress={
              state.totalDuration > 0
                ? (state.globalTime / state.totalDuration) * 100
                : 0
            }
            isPlaying={state.isPlaying}
          />
        </div>

        {/* Playback Controls */}
        <PlaybackControls
          isPlaying={state.isPlaying}
          isLoading={state.isLoading}
          currentTime={state.globalTime}
          duration={state.totalDuration}
          playbackRate={state.playbackRate}
          volume={state.volume}
          onToggle={toggle}
          onSeek={seekToTime}
          onPlaybackRateChange={setPlaybackRate}
          onVolumeChange={setVolume}
          onSkipBack={state.currentSegmentIndex > 0 ? handleSkipBack : undefined}
          onSkipForward={
            state.currentSegmentIndex < segments.length - 1
              ? handleSkipForward
              : undefined
          }
        />
      </div>

      {/* Segment Manager */}
      {(showTranscript || showSegmentList) && (
        <div className="px-6 pb-6">
          <SegmentManager
            segments={segments}
            currentSegmentIndex={state.currentSegmentIndex}
            segmentStartTimes={segmentStartTimes}
            onSegmentClick={seekToSegment}
            showTranscript={showTranscript}
          />
        </div>
      )}

      {/* Error display */}
      {state.error && (
        <div className="px-6 pb-6">
          <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
            {state.error}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EpisodeManifest, ManifestSegment } from "@/lib/types";
import { useAudioPlayer } from "./useAudioPlayer";

export interface SegmentSequencerState {
  currentSegmentIndex: number;
  globalTime: number;
  totalDuration: number;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface UseSegmentSequencerOptions {
  manifest: EpisodeManifest | null;
  audioBaseUrl: string;
  onSegmentChange?: (segment: ManifestSegment, index: number) => void;
  onComplete?: () => void;
}

export function useSegmentSequencer(options: UseSegmentSequencerOptions) {
  const { manifest, audioBaseUrl } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [globalTime, setGlobalTime] = useState(0);
  const isAutoAdvancingRef = useRef(false);
  const hasLoadedFirstSegmentRef = useRef(false);

  const segments = useMemo(() => manifest?.manifest.segments || [], [manifest]);

  // Calculate segment start times
  const segmentStartTimes = useMemo(() => {
    const times: number[] = [];
    let cumulative = 0;
    for (const segment of segments) {
      times.push(cumulative);
      cumulative += segment.duration_ms / 1000;
    }
    return times;
  }, [segments]);

  const totalDuration = useMemo(() => {
    return (manifest?.manifest.total_duration_ms || 0) / 1000;
  }, [manifest]);

  // Get audio URL for segment
  const getAudioUrl = useCallback(
    (segment: ManifestSegment): string => {
      return `${audioBaseUrl}/api/v1/audio/${segment.audio_path}`;
    },
    [audioBaseUrl]
  );

  // Handle segment ended - advance to next
  const handleSegmentEnded = useCallback(() => {
    const currentIndex = currentSegmentIndex;
    const nextIndex = currentIndex + 1;
    if (nextIndex < segments.length) {
      isAutoAdvancingRef.current = true;
      setCurrentSegmentIndex(nextIndex);
    } else {
      optionsRef.current.onComplete?.();
    }
  }, [currentSegmentIndex, segments.length]);

  // Handle time updates
  const handleTimeUpdate = useCallback(
    (segmentTime: number) => {
      const segmentStart = segmentStartTimes[currentSegmentIndex] || 0;
      setGlobalTime(segmentStart + segmentTime);
    },
    [currentSegmentIndex, segmentStartTimes]
  );

  const audioPlayer = useAudioPlayer({
    onEnded: handleSegmentEnded,
    onTimeUpdate: handleTimeUpdate,
  });

  // Store audioPlayer functions in ref to avoid dependency issues
  const audioPlayerRef = useRef(audioPlayer);
  audioPlayerRef.current = audioPlayer;

  // Load first segment on mount
  useEffect(() => {
    if (segments.length === 0) return;
    if (hasLoadedFirstSegmentRef.current) return;

    const segment = segments[0];
    const url = getAudioUrl(segment);
    audioPlayerRef.current.load(url);
    hasLoadedFirstSegmentRef.current = true;
    optionsRef.current.onSegmentChange?.(segment, 0);
  }, [segments, getAudioUrl]);

  // Load segment when index changes (after initial load)
  useEffect(() => {
    if (segments.length === 0) return;
    if (currentSegmentIndex >= segments.length) return;
    if (currentSegmentIndex === 0 && !isAutoAdvancingRef.current) return; // Skip first load, handled above

    const segment = segments[currentSegmentIndex];
    const url = getAudioUrl(segment);

    audioPlayerRef.current.load(url);
    optionsRef.current.onSegmentChange?.(segment, currentSegmentIndex);

    // Auto-play if we're advancing from previous segment
    if (isAutoAdvancingRef.current) {
      setTimeout(() => {
        audioPlayerRef.current.play();
      }, 50);
      isAutoAdvancingRef.current = false;
    }
  }, [currentSegmentIndex, segments, getAudioUrl]);

  // Find segment at a given global time
  const findSegmentAtTime = useCallback(
    (time: number): number => {
      for (let i = segmentStartTimes.length - 1; i >= 0; i--) {
        if (time >= segmentStartTimes[i]) {
          return i;
        }
      }
      return 0;
    },
    [segmentStartTimes]
  );

  // Seek to global time
  const seekToTime = useCallback(
    (time: number) => {
      const clampedTime = Math.max(0, Math.min(time, totalDuration));
      const targetIndex = findSegmentAtTime(clampedTime);
      const segmentStart = segmentStartTimes[targetIndex] || 0;
      const timeInSegment = clampedTime - segmentStart;

      if (targetIndex !== currentSegmentIndex) {
        setCurrentSegmentIndex(targetIndex);
        setTimeout(() => {
          audioPlayerRef.current.seek(timeInSegment);
        }, 100);
      } else {
        audioPlayerRef.current.seek(timeInSegment);
      }
    },
    [totalDuration, findSegmentAtTime, segmentStartTimes, currentSegmentIndex]
  );

  // Seek to specific segment
  const seekToSegment = useCallback(
    (index: number) => {
      if (index < 0 || index >= segments.length) return;
      const wasPlaying = !audioPlayerRef.current.audioRef.current?.paused;
      if (wasPlaying) {
        isAutoAdvancingRef.current = true;
      }
      setCurrentSegmentIndex(index);
    },
    [segments.length]
  );

  // Play from beginning
  const playFromStart = useCallback(() => {
    setCurrentSegmentIndex(0);
    setGlobalTime(0);
    isAutoAdvancingRef.current = true;
  }, []);

  const currentSegment = segments[currentSegmentIndex] || null;

  return {
    state: {
      currentSegmentIndex,
      globalTime,
      totalDuration,
      isPlaying: audioPlayer.state.isPlaying,
      isLoading: audioPlayer.state.isLoading,
      error: audioPlayer.state.error,
      volume: audioPlayer.state.volume,
      playbackRate: audioPlayer.state.playbackRate,
    },
    currentSegment,
    segments,
    segmentStartTimes,
    play: audioPlayer.play,
    pause: audioPlayer.pause,
    toggle: audioPlayer.toggle,
    seekToTime,
    seekToSegment,
    playFromStart,
    setVolume: audioPlayer.setVolume,
    setPlaybackRate: audioPlayer.setPlaybackRate,
  };
}

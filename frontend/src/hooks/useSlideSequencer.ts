"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionManifest, SessionManifestSegment } from "@/lib/types";
import { useAudioPlayer } from "./useAudioPlayer";

export interface SlideSequencerState {
  currentSegmentIndex: number;
  currentSlideIndex: number;
  globalTime: number;
  totalDuration: number;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  volume: number;
  playbackRate: number;
}

export interface UseSlideSequencerOptions {
  manifest: SessionManifest | null;
  audioBaseUrl: string;
  slideBaseUrl: string;
  onSegmentChange?: (segment: SessionManifestSegment, index: number) => void;
  onSlideChange?: (slideIndex: number) => void;
  onComplete?: () => void;
}

export function useSlideSequencer(options: UseSlideSequencerOptions) {
  const { manifest, audioBaseUrl, slideBaseUrl } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [globalTime, setGlobalTime] = useState(0);
  const isAutoAdvancingRef = useRef(false);
  const hasLoadedFirstSegmentRef = useRef(false);

  const segments = useMemo(() => {
    const segs = manifest?.manifest.segments || [];
    console.log("[SlideSequencer] Segments loaded:", segs.length, "audioBaseUrl:", audioBaseUrl, "slideBaseUrl:", slideBaseUrl);
    return segs;
  }, [manifest, audioBaseUrl, slideBaseUrl]);

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
  // Paths are stored as "bucket/object/path" (e.g., "awdio/awdios/{id}/segments/0000.wav")
  // The audio endpoint expects /{bucket}/{path:path}
  const getAudioUrl = useCallback(
    (segment: SessionManifestSegment): string => {
      const url = `${audioBaseUrl}/api/v1/audio/${segment.audio_path}`;
      console.log("[SlideSequencer] Audio URL:", url, "baseUrl:", audioBaseUrl, "path:", segment.audio_path);
      return url;
    },
    [audioBaseUrl]
  );

  // Get slide image URL
  const getSlideUrl = useCallback(
    (segment: SessionManifestSegment): string => {
      const url = `${slideBaseUrl}/api/v1/audio/${segment.slide_path}`;
      console.log("[SlideSequencer] Slide URL:", url);
      return url;
    },
    [slideBaseUrl]
  );

  // Get thumbnail URL
  const getThumbnailUrl = useCallback(
    (segment: SessionManifestSegment): string | null => {
      if (!segment.thumbnail_path) return null;
      return `${slideBaseUrl}/api/v1/audio/${segment.thumbnail_path}`;
    },
    [slideBaseUrl]
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

  const audioPlayerRef = useRef(audioPlayer);
  audioPlayerRef.current = audioPlayer;

  // Current segment and slide
  const currentSegment = segments[currentSegmentIndex] || null;
  const currentSlideIndex = currentSegment?.slide_index ?? 0;

  // Load first segment on mount
  useEffect(() => {
    if (segments.length === 0) return;
    if (hasLoadedFirstSegmentRef.current) return;

    const segment = segments[0];
    const url = getAudioUrl(segment);
    audioPlayerRef.current.load(url);
    hasLoadedFirstSegmentRef.current = true;
    optionsRef.current.onSegmentChange?.(segment, 0);
    optionsRef.current.onSlideChange?.(segment.slide_index);
  }, [segments, getAudioUrl]);

  // Load segment when index changes
  useEffect(() => {
    if (segments.length === 0) return;
    if (currentSegmentIndex >= segments.length) return;
    if (currentSegmentIndex === 0 && !isAutoAdvancingRef.current) return;

    const segment = segments[currentSegmentIndex];
    const url = getAudioUrl(segment);

    audioPlayerRef.current.load(url);
    optionsRef.current.onSegmentChange?.(segment, currentSegmentIndex);
    optionsRef.current.onSlideChange?.(segment.slide_index);

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

  // Seek to specific slide (finds first segment for that slide)
  const seekToSlide = useCallback(
    (slideIndex: number) => {
      const segmentIndex = segments.findIndex((s) => s.slide_index === slideIndex);
      if (segmentIndex !== -1) {
        seekToSegment(segmentIndex);
      }
    },
    [segments, seekToSegment]
  );

  // Play from beginning
  const playFromStart = useCallback(() => {
    setCurrentSegmentIndex(0);
    setGlobalTime(0);
    isAutoAdvancingRef.current = true;
  }, []);

  // Get current slide URL
  const getCurrentSlideUrl = useCallback((): string | null => {
    if (!currentSegment) return null;
    return getSlideUrl(currentSegment);
  }, [currentSegment, getSlideUrl]);

  return {
    state: {
      currentSegmentIndex,
      currentSlideIndex,
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
    seekToSlide,
    playFromStart,
    setVolume: audioPlayer.setVolume,
    setPlaybackRate: audioPlayer.setPlaybackRate,
    getSlideUrl,
    getThumbnailUrl,
    getCurrentSlideUrl,
  };
}

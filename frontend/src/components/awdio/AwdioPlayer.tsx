"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { SessionManifest } from "@/lib/types";
import { useSlideSequencer } from "@/hooks/useSlideSequencer";
import { SlideViewer, SlideNavigator } from "./SlideViewer";
import { AwdioVoiceInterrupt, type SlideSelectEvent, type VisualSelectEvent } from "./AwdioVoiceInterrupt";

interface AwdioPlayerProps {
  manifest: SessionManifest;
  audioBaseUrl: string;
  slideBaseUrl: string;
  wsBaseUrl?: string;
  awdioId?: string;
  sessionId?: string;
  title?: string;
  listenerName?: string | null;
  enableQA?: boolean;
  onComplete?: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AwdioPlayer({
  manifest,
  audioBaseUrl,
  slideBaseUrl,
  wsBaseUrl,
  awdioId,
  sessionId,
  title,
  listenerName,
  enableQA = true,
  onComplete,
}: AwdioPlayerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [qaSlideUrl, setQaSlideUrl] = useState<string | null>(null);
  const [qaVisualType, setQaVisualType] = useState<"slide" | "kb_image" | null>(null);
  const [qaVisualSource, setQaVisualSource] = useState<"deck" | "presenter_kb" | "awdio_kb" | null>(null);
  const wasPlayingRef = useRef(false);

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
    seekToSlide,
    setVolume,
    setPlaybackRate,
    getSlideUrl,
    getThumbnailUrl,
    getCurrentSlideUrl,
  } = useSlideSequencer({
    manifest,
    audioBaseUrl,
    slideBaseUrl,
    onComplete,
  });

  // Get unique slides for navigator
  const uniqueSlides = useMemo(() => {
    const seen = new Set<number>();
    const slides: { url: string | null; index: number }[] = [];
    for (const segment of segments) {
      if (!seen.has(segment.slide_index)) {
        seen.add(segment.slide_index);
        slides.push({
          url: getThumbnailUrl(segment),
          index: segment.slide_index,
        });
      }
    }
    return slides.sort((a, b) => a.index - b.index);
  }, [segments, getThumbnailUrl]);

  // Determine if Q&A is enabled (needed for keyboard controls)
  const qaEnabled = enableQA && !!wsBaseUrl && !!awdioId && !!sessionId;

  // Handle fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Auto-hide controls
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    if (state.isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [state.isPlaying]);

  // Show controls when paused
  useEffect(() => {
    if (!state.isPlaying) {
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
    }
  }, [state.isPlaying]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.code) {
        case "Space":
          // Only toggle play/pause if Q&A is not enabled
          // When Q&A is enabled, Space is used for push-to-talk
          if (!qaEnabled) {
            e.preventDefault();
            toggle();
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekToTime(Math.max(0, state.globalTime - 10));
          break;
        case "ArrowRight":
          e.preventDefault();
          seekToTime(Math.min(state.totalDuration, state.globalTime + 10));
          break;
        case "ArrowUp":
          e.preventDefault();
          if (state.currentSlideIndex > 0) {
            seekToSlide(state.currentSlideIndex - 1);
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (state.currentSlideIndex < uniqueSlides.length - 1) {
            seekToSlide(state.currentSlideIndex + 1);
          }
          break;
        case "KeyF":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "KeyM":
          e.preventDefault();
          setVolume(state.volume === 0 ? 1 : 0);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    toggle,
    seekToTime,
    seekToSlide,
    toggleFullscreen,
    setVolume,
    state.globalTime,
    state.totalDuration,
    state.currentSlideIndex,
    state.volume,
    uniqueSlides.length,
    qaEnabled,
  ]);

  const progress = state.totalDuration > 0 ? (state.globalTime / state.totalDuration) * 100 : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    seekToTime(percent * state.totalDuration);
  };

  // Q&A interrupt handlers - use ref to avoid recreating callback on every isPlaying change
  const isPlayingRef = useRef(state.isPlaying);
  isPlayingRef.current = state.isPlaying;

  const handleInterruptStart = useCallback(() => {
    wasPlayingRef.current = isPlayingRef.current;
    if (isPlayingRef.current) {
      pause();
    }
    setIsInterrupted(true);
    setShowControls(true);
  }, [pause]);

  const handleInterruptEnd = useCallback(() => {
    setIsInterrupted(false);
    setQaSlideUrl(null);
    setQaVisualType(null);
    setQaVisualSource(null);
    if (wasPlayingRef.current) {
      play();
    }
  }, [play]);

  const handleSlideSelect = useCallback((event: SlideSelectEvent) => {
    // Show the selected slide during Q&A (legacy handler)
    // slidePath is stored as "bucket/object/path" (e.g., "awdio/awdios/{id}/slides/xxx.png")
    const url = `${slideBaseUrl}/api/v1/audio/${event.slidePath}`;
    setQaSlideUrl(url);
    setQaVisualType("slide");
    setQaVisualSource("deck");
  }, [slideBaseUrl]);

  const handleSlideClear = useCallback((returnToSlideIndex: number) => {
    setQaSlideUrl(null);
    setQaVisualType(null);
    setQaVisualSource(null);
  }, []);

  const handleVisualSelect = useCallback((event: VisualSelectEvent) => {
    // Show the selected visual (slide or KB image) during Q&A
    // visualPath is stored as "bucket/object/path"
    const url = `${slideBaseUrl}/api/v1/audio/${event.visualPath}`;
    setQaSlideUrl(url);
    setQaVisualType(event.visualType);
    setQaVisualSource(event.source);
  }, [slideBaseUrl]);

  const handleVisualClear = useCallback((returnToSlideIndex: number) => {
    setQaSlideUrl(null);
    setQaVisualType(null);
    setQaVisualSource(null);
  }, []);

  const currentSlideUrl = getCurrentSlideUrl();
  const displaySlideUrl = qaSlideUrl || currentSlideUrl;

  return (
    <div
      className={`relative w-full h-full bg-black ${isFullscreen ? "fixed inset-0 z-50" : ""}`}
      onMouseMove={handleMouseMove}
    >
      {/* Main Slide Display */}
      <SlideViewer
        slideUrl={displaySlideUrl}
        slideIndex={state.currentSlideIndex}
        totalSlides={uniqueSlides.length}
        isLoading={state.isLoading && !isInterrupted}
        onSlideClick={isInterrupted ? undefined : toggle}
        showSlideNumber={showControls && !isInterrupted}
      />

      {/* Q&A Indicator */}
      {isInterrupted && qaSlideUrl && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 bg-blue-500/80 backdrop-blur-sm rounded-lg text-white text-sm">
          {qaVisualType === "kb_image"
            ? qaVisualSource === "presenter_kb"
              ? "Showing presenter reference image"
              : "Showing related reference image"
            : "Showing related slide"}
        </div>
      )}

      {/* Overlay Controls */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-auto">
          <div className="flex items-center justify-between">
            <h1 className="text-white text-lg font-medium truncate">{title}</h1>
            <button
              onClick={toggleFullscreen}
              className="p-2 text-white/80 hover:text-white transition-colors"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Center Play Button (when paused) */}
        {!state.isPlaying && !state.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
            <button
              onClick={play}
              className="p-6 bg-white/20 backdrop-blur-sm rounded-full hover:bg-white/30 transition-colors"
            >
              <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          </div>
        )}

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pointer-events-auto">
          {/* Progress Bar */}
          <div className="px-4 py-2">
            <div
              className="h-1 bg-white/30 rounded-full cursor-pointer group"
              onClick={handleProgressClick}
            >
              <div
                className="h-full bg-white rounded-full relative transition-all"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>

          {/* Control Bar */}
          <div className="px-4 pb-4 flex items-center gap-4">
            {/* Play/Pause */}
            <button
              onClick={toggle}
              disabled={state.isLoading}
              className="p-2 text-white hover:text-white/80 transition-colors disabled:opacity-50"
            >
              {state.isLoading ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
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

            {/* Time */}
            <div className="text-white text-sm font-mono">
              {formatTime(state.globalTime)} / {formatTime(state.totalDuration)}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Playback Speed */}
            <select
              value={state.playbackRate}
              onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
              className="bg-transparent text-white text-sm border border-white/30 rounded px-2 py-1"
            >
              <option value="0.5" className="bg-gray-900">0.5x</option>
              <option value="0.75" className="bg-gray-900">0.75x</option>
              <option value="1" className="bg-gray-900">1x</option>
              <option value="1.25" className="bg-gray-900">1.25x</option>
              <option value="1.5" className="bg-gray-900">1.5x</option>
              <option value="2" className="bg-gray-900">2x</option>
            </select>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setVolume(state.volume === 0 ? 1 : 0)}
                className="text-white hover:text-white/80"
              >
                {state.volume === 0 ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={state.volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-20 accent-white"
              />
            </div>
          </div>

          {/* Slide Navigator */}
          {uniqueSlides.length > 1 && (
            <div className="border-t border-white/10">
              <SlideNavigator
                thumbnails={uniqueSlides}
                currentSlideIndex={state.currentSlideIndex}
                onSlideSelect={seekToSlide}
              />
            </div>
          )}
        </div>
      </div>

      {/* Error display */}
      {state.error && (
        <div className="absolute top-16 left-4 right-4 p-4 bg-red-900/80 border border-red-700 rounded-lg text-red-200 text-sm">
          {state.error}
        </div>
      )}

      {/* Voice Interrupt Button */}
      {qaEnabled && (
        <div className="absolute bottom-32 right-8 pointer-events-auto z-20">
          <AwdioVoiceInterrupt
            awdioId={awdioId}
            sessionId={sessionId}
            currentSegmentIndex={state.currentSegmentIndex}
            currentSlideIndex={state.currentSlideIndex}
            wsBaseUrl={wsBaseUrl}
            listenerName={listenerName}
            onInterruptStart={handleInterruptStart}
            onInterruptEnd={handleInterruptEnd}
            onSlideSelect={handleSlideSelect}
            onSlideClear={handleSlideClear}
            onVisualSelect={handleVisualSelect}
            onVisualClear={handleVisualClear}
            disabled={isInterrupted}
          />
        </div>
      )}
    </div>
  );
}

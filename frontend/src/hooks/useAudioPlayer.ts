"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AudioPlayerState {
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  error: string | null;
}

export interface UseAudioPlayerOptions {
  onEnded?: () => void;
  onTimeUpdate?: (time: number) => void;
  onError?: (error: string) => void;
}

export function useAudioPlayer(options: UseAudioPlayerOptions = {}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    playbackRate: 1.0,
    error: null,
  });

  // Initialize audio element
  useEffect(() => {
    if (typeof window !== "undefined" && !audioRef.current) {
      console.log("[AudioPlayer] Initializing audio element");
      audioRef.current = new Audio();
      audioRef.current.preload = "auto";
      // Note: crossOrigin removed - backend CORS middleware handles this
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  // Set up event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadStart = () => {
      console.log("[AudioPlayer] loadstart event, setting isLoading=true");
      setState((s) => ({ ...s, isLoading: true, error: null }));
    };

    const handleCanPlay = () => {
      console.log("[AudioPlayer] canplay event, setting isLoading=false, duration:", audio.duration);
      setState((s) => ({
        ...s,
        isLoading: false,
        duration: audio.duration || 0,
      }));
    };

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setState((s) => ({ ...s, currentTime: time }));
      optionsRef.current.onTimeUpdate?.(time);
    };

    const handleEnded = () => {
      setState((s) => ({ ...s, isPlaying: false }));
      optionsRef.current.onEnded?.();
    };

    const handleError = (e: Event) => {
      const audioEl = e.target as HTMLAudioElement;
      // Ignore errors if src is empty or is the current page URL (no src set yet)
      if (!audioEl?.src || audioEl.src === window.location.href || !audioEl.src.includes('/api/v1/audio/')) {
        console.log("[AudioPlayer] Ignoring error for invalid/empty src:", audioEl?.src);
        return;
      }
      const mediaError = audioEl?.error;
      let errorMsg = "Audio playback error";
      if (mediaError) {
        switch (mediaError.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMsg = "Audio playback aborted";
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMsg = "Network error while loading audio";
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMsg = "Audio decode error";
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMsg = `Audio format not supported (src: ${audioEl?.src?.substring(0, 100)}...)`;
            break;
        }
      }
      console.error("Audio error:", errorMsg, mediaError, audioEl?.src);
      setState((s) => ({ ...s, error: errorMsg, isPlaying: false, isLoading: false }));
      optionsRef.current.onError?.(errorMsg);
    };

    const handlePlay = () => {
      setState((s) => ({ ...s, isPlaying: true }));
    };

    const handlePause = () => {
      setState((s) => ({ ...s, isPlaying: false }));
    };

    const handleProgress = () => {
      console.log("[AudioPlayer] progress event, buffered:", audio.buffered.length > 0 ? `${audio.buffered.start(0)}-${audio.buffered.end(0)}` : "none");
    };

    const handleLoadedData = () => {
      console.log("[AudioPlayer] loadeddata event");
    };

    const handleLoadedMetadata = () => {
      console.log("[AudioPlayer] loadedmetadata event, duration:", audio.duration);
    };

    const handleStalled = () => {
      console.log("[AudioPlayer] stalled event - data loading stalled");
    };

    const handleSuspend = () => {
      console.log("[AudioPlayer] suspend event - loading suspended");
    };

    const handleWaiting = () => {
      console.log("[AudioPlayer] waiting event - waiting for data");
    };

    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("progress", handleProgress);
    audio.addEventListener("loadeddata", handleLoadedData);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("stalled", handleStalled);
    audio.addEventListener("suspend", handleSuspend);
    audio.addEventListener("waiting", handleWaiting);

    return () => {
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("progress", handleProgress);
      audio.removeEventListener("loadeddata", handleLoadedData);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("stalled", handleStalled);
      audio.removeEventListener("suspend", handleSuspend);
      audio.removeEventListener("waiting", handleWaiting);
    };
  }, []);

  const load = useCallback(async (url: string) => {
    console.log("[AudioPlayer] load called with url:", url);

    // Test if URL is accessible via fetch
    try {
      console.log("[AudioPlayer] Testing URL accessibility via fetch...");
      const response = await fetch(url, { method: 'HEAD' });
      console.log("[AudioPlayer] Fetch response:", response.status, response.headers.get('content-type'), response.headers.get('content-length'));
    } catch (e) {
      console.error("[AudioPlayer] Fetch test failed:", e);
    }

    if (!audioRef.current) {
      console.warn("[AudioPlayer] audioRef.current is null, creating new Audio element");
      audioRef.current = new Audio();
      audioRef.current.preload = "auto";
    }
    console.log("[AudioPlayer] Setting src to:", url);
    console.log("[AudioPlayer] Audio element state before load:", {
      src: audioRef.current.src,
      readyState: audioRef.current.readyState,
      networkState: audioRef.current.networkState,
      error: audioRef.current.error,
    });
    audioRef.current.src = url;
    audioRef.current.load();
    console.log("[AudioPlayer] Audio element state after load:", {
      src: audioRef.current.src,
      readyState: audioRef.current.readyState,
      networkState: audioRef.current.networkState,
    });
  }, []);

  const play = useCallback(async () => {
    if (!audioRef.current) return;
    try {
      await audioRef.current.play();
    } catch (error) {
      setState((s) => ({ ...s, error: `Play failed: ${error}` }));
    }
  }, []);

  const pause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
  }, []);

  const toggle = useCallback(async () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      await play();
    } else {
      pause();
    }
  }, [play, pause]);

  const seek = useCallback((time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(time, audioRef.current.duration || 0));
  }, []);

  const setVolume = useCallback((volume: number) => {
    if (!audioRef.current) return;
    const clamped = Math.max(0, Math.min(1, volume));
    audioRef.current.volume = clamped;
    setState((s) => ({ ...s, volume: clamped }));
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    if (!audioRef.current) return;
    const clamped = Math.max(0.5, Math.min(2, rate));
    audioRef.current.playbackRate = clamped;
    setState((s) => ({ ...s, playbackRate: clamped }));
  }, []);

  return {
    state,
    audioRef,
    load,
    play,
    pause,
    toggle,
    seek,
    setVolume,
    setPlaybackRate,
  };
}

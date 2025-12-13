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
      audioRef.current = new Audio();
      audioRef.current.preload = "auto";
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
      setState((s) => ({ ...s, isLoading: true, error: null }));
    };

    const handleCanPlay = () => {
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

    const handleError = () => {
      const errorMsg = "Audio playback error";
      setState((s) => ({ ...s, error: errorMsg, isPlaying: false, isLoading: false }));
      optionsRef.current.onError?.(errorMsg);
    };

    const handlePlay = () => {
      setState((s) => ({ ...s, isPlaying: true }));
    };

    const handlePause = () => {
      setState((s) => ({ ...s, isPlaying: false }));
    };

    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, []);

  const load = useCallback((url: string) => {
    if (!audioRef.current) return;
    audioRef.current.src = url;
    audioRef.current.load();
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

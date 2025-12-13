"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { EpisodeManifest, ManifestSegment } from "@/lib/types";

export interface PlayerState {
  isPlaying: boolean;
  isLoading: boolean;
  currentSegmentIndex: number;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  manifest: EpisodeManifest | null;
  error: string | null;
}

export interface PlayerControls {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (time: number) => void;
  seekToSegment: (index: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  loadManifest: (manifest: EpisodeManifest) => void;
  getCurrentSegment: () => ManifestSegment | null;
}

interface PlayerContextValue {
  state: PlayerState;
  controls: PlayerControls;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

const initialState: PlayerState = {
  isPlaying: false,
  isLoading: false,
  currentSegmentIndex: 0,
  currentTime: 0,
  duration: 0,
  playbackRate: 1.0,
  volume: 1.0,
  manifest: null,
  error: null,
};

interface PlayerProviderProps {
  children: ReactNode;
  audioBaseUrl?: string;
}

export function PlayerProvider({ children, audioBaseUrl = "" }: PlayerProviderProps) {
  const [state, setState] = useState<PlayerState>(initialState);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const segmentStartTimesRef = useRef<number[]>([]);

  // Calculate segment start times from manifest
  useEffect(() => {
    if (state.manifest) {
      const startTimes: number[] = [];
      let cumulative = 0;
      for (const segment of state.manifest.manifest.segments) {
        startTimes.push(cumulative);
        cumulative += segment.duration_ms / 1000;
      }
      segmentStartTimesRef.current = startTimes;
      setState((s) => ({ ...s, duration: cumulative }));
    }
  }, [state.manifest]);

  // Find current segment based on playback time
  const findSegmentAtTime = useCallback(
    (time: number): number => {
      const startTimes = segmentStartTimesRef.current;
      if (!startTimes.length) return 0;

      for (let i = startTimes.length - 1; i >= 0; i--) {
        if (time >= startTimes[i]) {
          return i;
        }
      }
      return 0;
    },
    []
  );

  // Get audio URL for a segment
  const getAudioUrl = useCallback(
    (segment: ManifestSegment): string => {
      // Audio path is relative to MinIO, need to construct full URL
      return `${audioBaseUrl}/api/v1/audio/${segment.audio_path}`;
    },
    [audioBaseUrl]
  );

  // Load and play a specific segment
  const loadSegment = useCallback(
    async (index: number, autoPlay: boolean = false) => {
      if (!state.manifest || !audioRef.current) return;

      const segments = state.manifest.manifest.segments;
      if (index < 0 || index >= segments.length) return;

      const segment = segments[index];
      const url = getAudioUrl(segment);

      setState((s) => ({ ...s, isLoading: true, currentSegmentIndex: index }));

      try {
        audioRef.current.src = url;
        audioRef.current.load();

        if (autoPlay) {
          await audioRef.current.play();
          setState((s) => ({ ...s, isPlaying: true, isLoading: false }));
        } else {
          setState((s) => ({ ...s, isLoading: false }));
        }
      } catch (error) {
        setState((s) => ({
          ...s,
          isLoading: false,
          error: `Failed to load segment: ${error}`,
        }));
      }
    },
    [state.manifest, getAudioUrl]
  );

  // Handle segment end - advance to next
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      if (!state.manifest) return;

      const nextIndex = state.currentSegmentIndex + 1;
      if (nextIndex < state.manifest.manifest.segments.length) {
        loadSegment(nextIndex, true);
      } else {
        // Episode finished
        setState((s) => ({ ...s, isPlaying: false, currentSegmentIndex: 0 }));
      }
    };

    const handleTimeUpdate = () => {
      // Calculate global time
      const segmentStartTime =
        segmentStartTimesRef.current[state.currentSegmentIndex] || 0;
      const globalTime = segmentStartTime + audio.currentTime;
      setState((s) => ({ ...s, currentTime: globalTime }));
    };

    const handleError = () => {
      setState((s) => ({
        ...s,
        error: "Audio playback error",
        isPlaying: false,
        isLoading: false,
      }));
    };

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("error", handleError);
    };
  }, [state.currentSegmentIndex, state.manifest, loadSegment]);

  // Controls
  const controls: PlayerControls = {
    play: useCallback(async () => {
      if (!audioRef.current) return;

      if (!audioRef.current.src && state.manifest) {
        await loadSegment(0, true);
      } else {
        await audioRef.current.play();
        setState((s) => ({ ...s, isPlaying: true }));
      }
    }, [state.manifest, loadSegment]),

    pause: useCallback(() => {
      if (!audioRef.current) return;
      audioRef.current.pause();
      setState((s) => ({ ...s, isPlaying: false }));
    }, []),

    toggle: useCallback(async () => {
      if (state.isPlaying) {
        controls.pause();
      } else {
        await controls.play();
      }
    }, [state.isPlaying]),

    seek: useCallback(
      (time: number) => {
        if (!state.manifest) return;

        const segmentIndex = findSegmentAtTime(time);
        const segmentStartTime = segmentStartTimesRef.current[segmentIndex] || 0;
        const timeInSegment = time - segmentStartTime;

        if (segmentIndex !== state.currentSegmentIndex) {
          // Need to load different segment
          loadSegment(segmentIndex, state.isPlaying).then(() => {
            if (audioRef.current) {
              audioRef.current.currentTime = timeInSegment;
            }
          });
        } else if (audioRef.current) {
          audioRef.current.currentTime = timeInSegment;
        }
      },
      [state.manifest, state.currentSegmentIndex, state.isPlaying, findSegmentAtTime, loadSegment]
    ),

    seekToSegment: useCallback(
      (index: number) => {
        loadSegment(index, state.isPlaying);
      },
      [state.isPlaying, loadSegment]
    ),

    setPlaybackRate: useCallback((rate: number) => {
      if (audioRef.current) {
        audioRef.current.playbackRate = rate;
      }
      setState((s) => ({ ...s, playbackRate: rate }));
    }, []),

    setVolume: useCallback((volume: number) => {
      if (audioRef.current) {
        audioRef.current.volume = volume;
      }
      setState((s) => ({ ...s, volume }));
    }, []),

    loadManifest: useCallback((manifest: EpisodeManifest) => {
      setState((s) => ({
        ...initialState,
        manifest,
        playbackRate: s.playbackRate,
        volume: s.volume,
      }));
    }, []),

    getCurrentSegment: useCallback((): ManifestSegment | null => {
      if (!state.manifest) return null;
      return state.manifest.manifest.segments[state.currentSegmentIndex] || null;
    }, [state.manifest, state.currentSegmentIndex]),
  };

  return (
    <PlayerContext.Provider value={{ state, controls, audioRef }}>
      <audio ref={audioRef} preload="auto" />
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
}

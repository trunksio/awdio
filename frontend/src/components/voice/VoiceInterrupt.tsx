"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket, type WebSocketMessage } from "@/hooks/useWebSocket";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

export type InterruptState =
  | "idle"
  | "listening"
  | "processing"
  | "answering"
  | "bridge"
  | "error";

export interface VoiceInterruptProps {
  podcastId: string;
  episodeId: string;
  currentSegmentIndex: number;
  wsBaseUrl: string;
  onInterruptStart?: () => void;
  onInterruptEnd?: () => void;
  onAnswerAudio?: (audioData: string, format: string) => void;
  onBridgeAudio?: (audioData: string, text: string) => void;
  disabled?: boolean;
}

export function VoiceInterrupt({
  podcastId,
  episodeId,
  currentSegmentIndex,
  wsBaseUrl,
  onInterruptStart,
  onInterruptEnd,
  onAnswerAudio,
  onBridgeAudio,
  disabled = false,
}: VoiceInterruptProps) {
  const [state, setState] = useState<InterruptState>("idle");
  const [answerText, setAnswerText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pendingResume, setPendingResume] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  const answerAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<Array<{ data: string; format: string }>>([]);
  const isPlayingRef = useRef(false);
  const pendingResumeRef = useRef(false);

  // Push-to-talk state
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const isSpaceHeldRef = useRef(false);
  const transcriptRef = useRef("");

  // Stop all audio and clear queue
  const stopAllAudio = useCallback(() => {
    // Stop current playback
    if (answerAudioRef.current) {
      answerAudioRef.current.pause();
      answerAudioRef.current.currentTime = 0;
      answerAudioRef.current.onended = null; // Remove handler to prevent queue processing
    }
    // Clear the queue
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    pendingResumeRef.current = false;
    setPendingResume(false);
  }, []);

  // Process audio queue
  const processAudioQueue = useCallback(() => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      // If queue is empty and we're waiting to resume, add a pause then resume
      if (audioQueueRef.current.length === 0 && pendingResumeRef.current) {
        pendingResumeRef.current = false;
        setPendingResume(false);
        // Add a 1.5 second pause before resuming for a natural transition
        setTimeout(() => {
          // Safety check: ensure audio is definitely stopped before resuming main podcast
          if (answerAudioRef.current) {
            answerAudioRef.current.pause();
            answerAudioRef.current.currentTime = 0;
          }
          setState("idle");
          setAnswerText("");
          onInterruptEnd?.();
        }, 1500);
      }
      return;
    }

    const audio = answerAudioRef.current;
    if (!audio) return;

    const next = audioQueueRef.current.shift();
    if (!next) return;

    const byteCharacters = atob(next.data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: `audio/${next.format}` });
    const url = URL.createObjectURL(blob);

    audio.src = url;
    isPlayingRef.current = true;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      isPlayingRef.current = false;
      // Process next in queue
      processAudioQueue();
    };

    audio.play().catch((e) => {
      console.error("Failed to play audio:", e);
      isPlayingRef.current = false;
      processAudioQueue();
    });
  }, [onInterruptEnd]);

  // Initialize audio element
  useEffect(() => {
    if (typeof window !== "undefined") {
      answerAudioRef.current = new Audio();
    }
    return () => {
      // Full cleanup on unmount
      if (answerAudioRef.current) {
        answerAudioRef.current.pause();
        answerAudioRef.current.src = "";
        answerAudioRef.current.onended = null;
      }
      audioQueueRef.current = [];
      isPlayingRef.current = false;
      pendingResumeRef.current = false;
    };
  }, []);

  // WebSocket connection
  const wsUrl = `${wsBaseUrl}/ws/listen/${podcastId}/${episodeId}`;

  // Queue audio for playback
  const queueAudio = useCallback((audioData: string, format: string) => {
    audioQueueRef.current.push({ data: audioData, format });
    processAudioQueue();
  }, [processAudioQueue]);

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      switch (message.type) {
        case "connected":
          console.log("WebSocket connected:", message);
          break;

        case "interruption_started":
          // Only set to listening if we're still in idle state
          // With push-to-talk, we may have already moved to processing
          if (stateRef.current === "idle") {
            setState("listening");
            stateRef.current = "listening";
          }
          break;

        case "question_received":
          setState("processing");
          stateRef.current = "processing";
          break;

        case "acknowledgment_audio":
          // Play acknowledgment immediately - this fills the gap while answer generates
          console.log("[Q&A] Received acknowledgment:", message.text);
          queueAudio(message.audio as string, "wav");
          break;

        case "answer_text":
          setAnswerText(message.text as string);
          break;

        case "synthesizing_audio":
          setState("answering");
          break;

        case "answer_audio":
          // Queue audio for playback
          queueAudio(message.audio as string, message.format as string);
          onAnswerAudio?.(message.audio as string, message.format as string);
          break;

        case "bridge_audio":
          setState("bridge");
          // Queue bridge audio (will play after answer finishes)
          queueAudio(message.audio as string, "wav");
          onBridgeAudio?.(message.audio as string, message.text as string);
          break;

        case "ready_to_resume":
          // Wait for all queued audio to finish before resuming
          if (isPlayingRef.current || audioQueueRef.current.length > 0) {
            pendingResumeRef.current = true;
            setPendingResume(true);
          } else {
            setState("idle");
            setAnswerText("");
            onInterruptEnd?.();
          }
          break;

        case "interruption_cancelled":
          stopAllAudio(); // Stop any playing audio
          setState("idle");
          setAnswerText("");
          onInterruptEnd?.();
          break;

        case "error":
          stopAllAudio(); // Stop any playing audio on error
          setError(message.error as string);
          setState("error");
          setTimeout(() => {
            setState("idle");
            setError(null);
            onInterruptEnd?.();
          }, 3000);
          break;

        case "pong":
          // Keep-alive response
          break;

        default:
          console.log("Unknown message type:", message);
      }
    },
    [onAnswerAudio, onBridgeAudio, onInterruptEnd, queueAudio, stopAllAudio]
  );

  const ws = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    reconnect: true,
  });

  // Connect WebSocket on mount
  useEffect(() => {
    ws.connect();
    return () => ws.disconnect();
  }, [wsUrl]);

  // Update segment index
  useEffect(() => {
    if (ws.isConnected) {
      ws.send({ type: "segment_update", segment_index: currentSegmentIndex });
    }
  }, [currentSegmentIndex, ws.isConnected]);

  // Speech recognition - accumulate transcript while spacebar is held
  const handleSpeechResult = useCallback(
    (transcript: string, isFinal: boolean) => {
      // Always update the transcript ref with latest
      transcriptRef.current = transcript;
      // Note: We don't send immediately anymore - we wait for spacebar release
    },
    []
  );

  const handleSpeechEnd = useCallback(() => {
    // With push-to-talk, speech end is handled by spacebar release
    // This may fire if the browser stops listening, but we handle it gracefully
  }, []);

  const speech = useSpeechRecognition({
    onResult: handleSpeechResult,
    onEnd: handleSpeechEnd,
    continuous: true, // Keep listening while spacebar is held
    interimResults: true,
  });

  // Send the accumulated transcript and stop listening
  const finishAndSend = useCallback(() => {
    const transcript = transcriptRef.current.trim() || speech.transcript.trim();
    console.log("[PTT] finishAndSend called, transcript:", transcript);
    speech.stopListening();

    if (transcript && stateRef.current === "listening") {
      console.log("[PTT] Sending question:", transcript);
      ws.send({ type: "question", question: transcript });
      setState("processing");
      stateRef.current = "processing";
    } else if (stateRef.current === "listening") {
      // No transcript captured, cancel the interruption
      console.log("[PTT] No transcript, cancelling");
      stopAllAudio();
      ws.send({ type: "cancel_interruption" });
      setState("idle");
      stateRef.current = "idle";
      setAnswerText("");
      onInterruptEnd?.();
    }

    transcriptRef.current = "";
  }, [ws, speech, stopAllAudio, onInterruptEnd]);

  // Start interrupt (called on spacebar down)
  const startInterrupt = useCallback(() => {
    if (!ws.isConnected || disabled) return;
    if (stateRef.current !== "idle") return; // Don't start if already active

    setError(null);
    setAnswerText("");
    transcriptRef.current = "";
    setState("listening");
    stateRef.current = "listening"; // Update ref immediately for keyup handler
    onInterruptStart?.();

    ws.send({ type: "start_interruption" });
    speech.startListening();
  }, [ws, disabled, onInterruptStart, speech]);

  // Cancel interrupt (for button click while active)
  const cancelInterrupt = useCallback(() => {
    speech.stopListening();
    stopAllAudio();
    ws.send({ type: "cancel_interruption" });
    setState("idle");
    setAnswerText("");
    transcriptRef.current = "";
    onInterruptEnd?.();
  }, [ws, speech, onInterruptEnd, stopAllAudio]);

  // Spacebar push-to-talk handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle spacebar, ignore if in input/textarea
      if (e.code !== "Space") return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.repeat) return; // Ignore key repeat

      e.preventDefault();

      if (!isSpaceHeldRef.current && stateRef.current === "idle") {
        console.log("[PTT] Space pressed, starting recording");
        isSpaceHeldRef.current = true;
        setIsSpaceHeld(true);
        startInterrupt();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;

      // Always handle keyup if we started with spacebar, regardless of current focus
      // This handles the case where focus moved during the press
      if (!isSpaceHeldRef.current) return;

      e.preventDefault();

      console.log("[PTT] Space released, state:", stateRef.current);
      isSpaceHeldRef.current = false;
      setIsSpaceHeld(false);

      if (stateRef.current === "listening") {
        console.log("[PTT] Calling finishAndSend");
        finishAndSend();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [startInterrupt, finishAndSend]);

  const isActive = state !== "idle" && state !== "error";

  return (
    <div className="relative">
      {/* Main interrupt button */}
      <button
        onClick={isActive ? cancelInterrupt : startInterrupt}
        disabled={disabled || !ws.isConnected || !speech.isSupported}
        className={`
          relative w-16 h-16 rounded-full flex items-center justify-center
          transition-all duration-200
          ${
            isActive
              ? "bg-red-500 hover:bg-red-600 scale-110"
              : "bg-gray-700 hover:bg-gray-600"
          }
          ${disabled || !ws.isConnected ? "opacity-50 cursor-not-allowed" : ""}
        `}
        title={
          !speech.isSupported
            ? "Speech recognition not supported in this browser"
            : !ws.isConnected
            ? "Connecting..."
            : isActive
            ? "Cancel question (or release spacebar)"
            : "Hold SPACE to ask a question"
        }
      >
        {/* Mic icon */}
        {state === "idle" && (
          <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
          </svg>
        )}

        {/* Listening indicator */}
        {state === "listening" && (
          <div className="flex items-center justify-center gap-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-1 bg-white rounded-full animate-pulse"
                style={{
                  height: `${12 + Math.random() * 12}px`,
                  animationDelay: `${i * 100}ms`,
                }}
              />
            ))}
          </div>
        )}

        {/* Processing spinner */}
        {state === "processing" && (
          <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
        )}

        {/* Answering indicator */}
        {(state === "answering" || state === "bridge") && (
          <svg className="w-8 h-8 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
          </svg>
        )}

        {/* Error state */}
        {state === "error" && (
          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
        )}

        {/* Pulsing ring when active */}
        {isActive && (
          <div className="absolute inset-0 rounded-full border-2 border-red-400 animate-ping" />
        )}
      </button>

      {/* Status text */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-gray-400">
        {state === "idle" && ws.isConnected && "Hold SPACE to ask"}
        {state === "idle" && !ws.isConnected && "Connecting..."}
        {state === "listening" && (speech.transcript || transcriptRef.current || "Listening...")}
        {state === "processing" && "Thinking..."}
        {state === "answering" && ""}
        {state === "bridge" && ""}
        {state === "error" && (error || "Error")}
      </div>

      {/* Answer display overlay */}
      {answerText && (state === "answering" || state === "bridge") && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-80 p-4 bg-gray-800 rounded-lg shadow-lg">
          <p className="text-sm text-gray-200">{answerText}</p>
        </div>
      )}
    </div>
  );
}

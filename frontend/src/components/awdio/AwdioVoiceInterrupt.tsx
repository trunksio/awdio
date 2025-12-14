"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWebSocket, type WebSocketMessage } from "@/hooks/useWebSocket";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

export type InterruptState =
  | "idle"
  | "listening"
  | "processing"
  | "answering"
  | "bridge"
  | "error";

export interface SlideSelectEvent {
  slideId: string;
  slideIndex: number;
  slidePath: string;
  reason: string;
  confidence: number;
}

export interface VisualSelectEvent {
  visualType: "slide" | "kb_image";
  visualId: string;
  visualPath: string;
  thumbnailPath: string | null;
  source: "deck" | "presenter_kb" | "awdio_kb";
  slideIndex: number | null;
  reason: string;
  confidence: number;
}

export interface AwdioVoiceInterruptProps {
  awdioId: string;
  sessionId: string;
  currentSegmentIndex: number;
  currentSlideIndex: number;
  wsBaseUrl: string;
  listenerName?: string | null;
  listenerId?: string | null;
  onInterruptStart?: () => void;
  onInterruptEnd?: () => void;
  onAnswerAudio?: (audioData: string, format: string) => void;
  onBridgeAudio?: (audioData: string, text: string) => void;
  onSlideSelect?: (event: SlideSelectEvent) => void;
  onVisualSelect?: (event: VisualSelectEvent) => void;
  onVisualClear?: (returnToSlideIndex: number) => void;
  onSlideClear?: (returnToSlideIndex: number) => void;
  disabled?: boolean;
}

export const AwdioVoiceInterrupt = memo(function AwdioVoiceInterrupt({
  awdioId,
  sessionId,
  currentSegmentIndex,
  currentSlideIndex,
  wsBaseUrl,
  listenerName,
  listenerId,
  onInterruptStart,
  onInterruptEnd,
  onAnswerAudio,
  onBridgeAudio,
  onSlideSelect,
  onVisualSelect,
  onVisualClear,
  onSlideClear,
  disabled = false,
}: AwdioVoiceInterruptProps) {
  const [state, setState] = useState<InterruptState>("idle");
  const [answerText, setAnswerText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [selectedSlide, setSelectedSlide] = useState<SlideSelectEvent | null>(null);
  const [selectedVisual, setSelectedVisual] = useState<VisualSelectEvent | null>(null);
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
    if (answerAudioRef.current) {
      answerAudioRef.current.pause();
      answerAudioRef.current.currentTime = 0;
      answerAudioRef.current.onended = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    pendingResumeRef.current = false;
    setPendingResume(false);
  }, []);

  // Process audio queue
  const processAudioQueue = useCallback(() => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      if (audioQueueRef.current.length === 0 && pendingResumeRef.current) {
        pendingResumeRef.current = false;
        setPendingResume(false);
        setTimeout(() => {
          if (answerAudioRef.current) {
            answerAudioRef.current.pause();
            answerAudioRef.current.currentTime = 0;
          }
          setState("idle");
          setAnswerText("");
          setSelectedSlide(null);
          setSelectedVisual(null);
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

  // WebSocket URL for awdio
  const wsUrl = useMemo(() => {
    if (!wsBaseUrl) {
      console.log("[AwdioVoiceInterrupt] wsBaseUrl is empty");
      return "";
    }
    let url = `${wsBaseUrl}/ws/awdio/${awdioId}/${sessionId}`;
    const params = new URLSearchParams();
    if (listenerName) params.set("listener_name", listenerName);
    if (listenerId) params.set("listener_id", listenerId);
    const queryString = params.toString();
    if (queryString) url += `?${queryString}`;
    console.log("[AwdioVoiceInterrupt] wsUrl created:", url);
    return url;
  }, [wsBaseUrl, awdioId, sessionId, listenerName, listenerId]);

  // Queue audio for playback
  const queueAudio = useCallback((audioData: string, format: string) => {
    audioQueueRef.current.push({ data: audioData, format });
    processAudioQueue();
  }, [processAudioQueue]);

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      console.log("[Awdio WS] Received message:", message.type, message);
      switch (message.type) {
        case "connected":
          console.log("[Awdio] WebSocket connected:", message);
          break;

        case "interruption_started":
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
          console.log("[Awdio Q&A] Received acknowledgment:", message.text);
          queueAudio(message.audio as string, "wav");
          break;

        case "qa_slide_select":
          // Legacy: AI selected a slide to show during Q&A
          const slideEvent: SlideSelectEvent = {
            slideId: message.slide_id as string,
            slideIndex: message.slide_index as number,
            slidePath: message.slide_path as string,
            reason: message.reason as string,
            confidence: message.confidence as number,
          };
          console.log("[Awdio Q&A] Slide selected:", slideEvent);
          setSelectedSlide(slideEvent);
          onSlideSelect?.(slideEvent);
          break;

        case "qa_visual_select":
          // New: AI selected a visual (slide or KB image) to show during Q&A
          const visualEvent: VisualSelectEvent = {
            visualType: message.visual_type as "slide" | "kb_image",
            visualId: message.visual_id as string,
            visualPath: message.visual_path as string,
            thumbnailPath: message.thumbnail_path as string | null,
            source: message.source as "deck" | "presenter_kb" | "awdio_kb",
            slideIndex: message.slide_index as number | null,
            reason: message.reason as string,
            confidence: message.confidence as number,
          };
          console.log("[Awdio Q&A] Visual selected:", visualEvent);
          setSelectedVisual(visualEvent);
          onVisualSelect?.(visualEvent);
          break;

        case "answer_text":
          setAnswerText(message.text as string);
          break;

        case "synthesizing_audio":
          setState("answering");
          break;

        case "answer_audio":
          queueAudio(message.audio as string, message.format as string);
          onAnswerAudio?.(message.audio as string, message.format as string);
          break;

        case "qa_slide_clear":
          // Legacy: Return to original slide after Q&A
          const returnIndex = message.return_to_slide_index as number;
          console.log("[Awdio Q&A] Clearing slide, return to:", returnIndex);
          setSelectedSlide(null);
          onSlideClear?.(returnIndex);
          break;

        case "qa_visual_clear":
          // New: Return to original slide after Q&A (works with both slides and KB images)
          const returnSlideIndex = message.return_to_slide_index as number;
          console.log("[Awdio Q&A] Clearing visual, return to:", returnSlideIndex);
          setSelectedVisual(null);
          onVisualClear?.(returnSlideIndex);
          break;

        case "bridge_audio":
          setState("bridge");
          queueAudio(message.audio as string, "wav");
          onBridgeAudio?.(message.audio as string, message.text as string);
          break;

        case "ready_to_resume":
          if (isPlayingRef.current || audioQueueRef.current.length > 0) {
            pendingResumeRef.current = true;
            setPendingResume(true);
          } else {
            setState("idle");
            setAnswerText("");
            setSelectedSlide(null);
            setSelectedVisual(null);
            onInterruptEnd?.();
          }
          break;

        case "interruption_cancelled":
          stopAllAudio();
          setState("idle");
          setAnswerText("");
          setSelectedSlide(null);
          setSelectedVisual(null);
          onInterruptEnd?.();
          break;

        case "error":
          stopAllAudio();
          setError(message.error as string);
          setState("error");
          setTimeout(() => {
            setState("idle");
            setError(null);
            setSelectedSlide(null);
            setSelectedVisual(null);
            onInterruptEnd?.();
          }, 3000);
          break;

        case "pong":
          break;

        default:
          console.log("[Awdio] Unknown message type:", message);
      }
    },
    [onAnswerAudio, onBridgeAudio, onInterruptEnd, onSlideSelect, onSlideClear, onVisualSelect, onVisualClear, queueAudio, stopAllAudio]
  );

  const ws = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    reconnect: true,
  });

  const wsRef = useRef(ws);
  wsRef.current = ws;

  // Connect WebSocket on mount
  useEffect(() => {
    console.log("[AwdioVoiceInterrupt] wsUrl:", wsUrl);
    if (!wsUrl) {
      console.log("[AwdioVoiceInterrupt] wsUrl is empty, skipping connect");
      return;
    }
    ws.connect();
    return () => {
      ws.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl]);

  // Update segment index - only when segment changes, not on connect/disconnect
  const lastSentSegmentRef = useRef<number>(-1);
  useEffect(() => {
    if (wsRef.current.isConnected && currentSegmentIndex !== lastSentSegmentRef.current) {
      wsRef.current.send({ type: "segment_update", segment_index: currentSegmentIndex });
      lastSentSegmentRef.current = currentSegmentIndex;
    }
  }, [currentSegmentIndex]);

  // Update slide index - only when slide changes, not on connect/disconnect
  const lastSentSlideRef = useRef<number>(-1);
  useEffect(() => {
    if (wsRef.current.isConnected && currentSlideIndex !== lastSentSlideRef.current) {
      wsRef.current.send({ type: "slide_update", slide_index: currentSlideIndex });
      lastSentSlideRef.current = currentSlideIndex;
    }
  }, [currentSlideIndex]);

  // Speech recognition handlers
  const handleSpeechResult = useCallback(
    (transcript: string, isFinal: boolean) => {
      transcriptRef.current = transcript;
    },
    []
  );

  const handleSpeechEnd = useCallback(() => {}, []);

  const speech = useSpeechRecognition({
    onResult: handleSpeechResult,
    onEnd: handleSpeechEnd,
    continuous: true,
    interimResults: true,
  });

  // Stable ref for speech functions to avoid callback recreation
  const speechRef = useRef(speech);
  speechRef.current = speech;

  // Send transcript and stop listening
  const finishAndSend = useCallback(() => {
    // Use transcriptRef only - it's always updated by handleSpeechResult
    const transcript = transcriptRef.current.trim();
    console.log("[Awdio PTT] finishAndSend, transcript:", transcript);
    speechRef.current.stopListening();

    if (transcript && stateRef.current === "listening") {
      console.log("[Awdio PTT] Sending question:", transcript);
      wsRef.current.send({ type: "question", question: transcript });
      setState("processing");
      stateRef.current = "processing";
    } else if (stateRef.current === "listening") {
      console.log("[Awdio PTT] No transcript, cancelling");
      stopAllAudio();
      wsRef.current.send({ type: "cancel_interruption" });
      setState("idle");
      stateRef.current = "idle";
      setAnswerText("");
      setSelectedSlide(null);
      setSelectedVisual(null);
      onInterruptEnd?.();
    }

    transcriptRef.current = "";
  }, [stopAllAudio, onInterruptEnd]);

  // Start interrupt
  const startInterrupt = useCallback(() => {
    if (!wsRef.current.isConnected || disabled) return;
    if (stateRef.current !== "idle") return;

    setError(null);
    setAnswerText("");
    setSelectedSlide(null);
    setSelectedVisual(null);
    transcriptRef.current = "";
    setState("listening");
    stateRef.current = "listening";
    onInterruptStart?.();

    wsRef.current.send({ type: "start_interruption" });
    speechRef.current.startListening();
  }, [disabled, onInterruptStart]);

  // Cancel interrupt
  const cancelInterrupt = useCallback(() => {
    speechRef.current.stopListening();
    stopAllAudio();
    wsRef.current.send({ type: "cancel_interruption" });
    setState("idle");
    setAnswerText("");
    setSelectedSlide(null);
    setSelectedVisual(null);
    transcriptRef.current = "";
    onInterruptEnd?.();
  }, [onInterruptEnd, stopAllAudio]);

  // Spacebar push-to-talk
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.repeat) return;

      e.preventDefault();

      if (!isSpaceHeldRef.current && stateRef.current === "idle") {
        console.log("[Awdio PTT] Space pressed, starting recording");
        isSpaceHeldRef.current = true;
        setIsSpaceHeld(true);
        startInterrupt();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (!isSpaceHeldRef.current) return;

      e.preventDefault();

      console.log("[Awdio PTT] Space released, state:", stateRef.current);
      isSpaceHeldRef.current = false;
      setIsSpaceHeld(false);

      if (stateRef.current === "listening") {
        console.log("[Awdio PTT] Calling finishAndSend");
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
              : "bg-white/10 backdrop-blur-sm hover:bg-white/20"
          }
          ${disabled || !ws.isConnected ? "opacity-50 cursor-not-allowed" : ""}
        `}
        title={
          !speech.isSupported
            ? "Speech recognition not supported"
            : !ws.isConnected
            ? "Connecting..."
            : isActive
            ? "Cancel question"
            : "Hold SPACE to ask"
        }
      >
        {/* Mic icon */}
        {state === "idle" && (
          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
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
          <svg className="w-8 h-8 text-white animate-pulse" fill="currentColor" viewBox="0 0 24 24">
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
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-white/60">
        {state === "idle" && ws.isConnected && "Hold SPACE to ask"}
        {state === "idle" && !ws.isConnected && "Connecting..."}
        {state === "listening" && (transcriptRef.current || "Listening...")}
        {state === "processing" && "Thinking..."}
        {state === "error" && (error || "Error")}
      </div>

      {/* Slide selection indicator (legacy) */}
      {selectedSlide && !selectedVisual && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-500/80 backdrop-blur-sm rounded-lg text-white text-xs whitespace-nowrap">
          Showing slide {selectedSlide.slideIndex + 1}
        </div>
      )}

      {/* Visual selection indicator (new - supports both slides and KB images) */}
      {selectedVisual && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-500/80 backdrop-blur-sm rounded-lg text-white text-xs whitespace-nowrap">
          {selectedVisual.visualType === "slide"
            ? `Showing slide ${(selectedVisual.slideIndex ?? 0) + 1}`
            : selectedVisual.source === "presenter_kb"
            ? "Showing presenter image"
            : "Showing related image"}
        </div>
      )}

      {/* Answer display overlay */}
      {answerText && (state === "answering" || state === "bridge") && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-80 max-h-40 overflow-y-auto p-4 bg-black/80 backdrop-blur-sm rounded-lg shadow-lg">
          <p className="text-sm text-white">{answerText}</p>
        </div>
      )}
    </div>
  );
});

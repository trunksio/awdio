"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseSpeechRecognitionOptions {
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

export interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
}

// Extend Window interface for SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const {
    onResult,
    onError,
    onEnd,
    language = "en-US",
    continuous = false,
    interimResults = true,
  } = options;

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Check for browser support
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      setIsSupported(!!SpeechRecognition);
    }
  }, []);

  // Initialize recognition
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.lang = language;

    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      const currentTranscript = finalTranscript || interimTranscript;
      setTranscript(currentTranscript);

      if (finalTranscript) {
        optionsRef.current.onResult?.(finalTranscript, true);
      } else if (interimTranscript) {
        optionsRef.current.onResult?.(interimTranscript, false);
      }
    };

    recognition.onerror = (event) => {
      const errorMessage = `Speech recognition error: ${event.error}`;
      setError(errorMessage);
      setIsListening(false);
      optionsRef.current.onError?.(errorMessage);
    };

    recognition.onend = () => {
      setIsListening(false);
      optionsRef.current.onEnd?.();
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [continuous, interimResults, language]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setError("Speech recognition not supported");
      return;
    }

    setError(null);
    setTranscript("");

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (e) {
      // May already be listening
      console.warn("Speech recognition start error:", e);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  return {
    isListening,
    isSupported,
    transcript,
    error,
    startListening,
    stopListening,
  };
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { Listener } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ListenerPromptProps {
  onComplete: (listener: Listener | null) => void;
}

export function ListenerPrompt({ onComplete }: ListenerPromptProps) {
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE}/api/v1/listeners/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });

        if (!response.ok) {
          throw new Error("Failed to register");
        }

        const listener: Listener = await response.json();

        // Save to localStorage
        localStorage.setItem("listener_id", listener.id);
        localStorage.setItem("listener_name", listener.name);

        onComplete(listener);
      } catch (err) {
        console.error("Failed to register listener:", err);
        setError("Something went wrong. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [name, onComplete]
  );

  const handleSkip = useCallback(() => {
    localStorage.setItem("listener_skipped", "true");
    onComplete(null);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl p-6 max-w-md w-full border border-zinc-700 shadow-2xl">
        <h2 className="text-xl font-semibold text-white mb-2">
          Welcome to the Podcast
        </h2>
        <p className="text-zinc-400 mb-6">
          What should we call you? This helps us personalize your experience.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-600 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            autoFocus
            disabled={isLoading}
          />

          {error && (
            <p className="mt-2 text-red-400 text-sm">{error}</p>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleSkip}
              className="flex-1 px-4 py-2 text-zinc-400 hover:text-white transition-colors"
              disabled={isLoading}
            >
              Skip
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isLoading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "..." : "Continue"}
            </button>
          </div>
        </form>

        <p className="mt-4 text-xs text-zinc-500 text-center">
          You can always change this later in settings
        </p>
      </div>
    </div>
  );
}

export function useListener() {
  const [listener, setListener] = useState<Listener | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check localStorage for existing listener
    const listenerId = localStorage.getItem("listener_id");
    const listenerName = localStorage.getItem("listener_name");
    const skipped = localStorage.getItem("listener_skipped");

    if (listenerId && listenerName) {
      setListener({
        id: listenerId,
        name: listenerName,
        listener_metadata: {},
        first_seen_at: "",
        last_seen_at: "",
      });
      setShowPrompt(false);
    } else if (skipped) {
      setShowPrompt(false);
    } else {
      setShowPrompt(true);
    }

    setIsLoading(false);
  }, []);

  const handlePromptComplete = useCallback((newListener: Listener | null) => {
    setListener(newListener);
    setShowPrompt(false);
  }, []);

  return {
    listener,
    showPrompt,
    isLoading,
    handlePromptComplete,
  };
}

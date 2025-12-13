"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listVoices, syncVoices } from "@/lib/api";
import type { Voice } from "@/lib/types";

export default function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadVoices() {
    try {
      setLoading(true);
      const data = await listVoices();
      setVoices(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load voices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVoices();
  }, []);

  async function handleSync() {
    try {
      setSyncing(true);
      setError(null);
      const data = await syncVoices();
      setVoices(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sync voices");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading voices...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <Link href="/admin" className="text-gray-400 hover:text-white text-sm">
          ← Back to Admin
        </Link>
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-3xl font-bold">Voices</h1>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 bg-white text-black rounded hover:bg-gray-200 disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync from Neuphonic"}
          </button>
        </div>
        <p className="text-gray-400 mt-1">
          Manage voices from Neuphonic for your podcasts
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {voices.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">
            No voices synced yet. Click &quot;Sync from Neuphonic&quot; to fetch available voices.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {voices.map((voice) => (
            <div
              key={voice.id}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-lg">{voice.name}</h3>
                {voice.is_cloned && (
                  <span className="text-xs px-2 py-1 bg-purple-900 text-purple-200 rounded">
                    Cloned
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 font-mono truncate">
                {voice.neuphonic_voice_id}
              </p>
              {voice.voice_metadata?.tags && Array.isArray(voice.voice_metadata.tags) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(voice.voice_metadata.tags as string[]).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

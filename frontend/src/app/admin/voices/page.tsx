"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listVoices, syncNeuphonicsVoices, syncElevenLabsVoices } from "@/lib/api";
import type { Voice, TTSProvider } from "@/lib/types";

export default function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingNeuphonic, setSyncingNeuphonic] = useState(false);
  const [syncingElevenLabs, setSyncingElevenLabs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<TTSProvider | "all">("all");

  async function loadVoices() {
    try {
      setLoading(true);
      const data = await listVoices(providerFilter === "all" ? undefined : providerFilter);
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
  }, [providerFilter]);

  async function handleSyncNeuphonic() {
    try {
      setSyncingNeuphonic(true);
      setError(null);
      await syncNeuphonicsVoices();
      await loadVoices();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sync Neuphonic voices");
    } finally {
      setSyncingNeuphonic(false);
    }
  }

  async function handleSyncElevenLabs() {
    try {
      setSyncingElevenLabs(true);
      setError(null);
      await syncElevenLabsVoices();
      await loadVoices();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sync ElevenLabs voices");
    } finally {
      setSyncingElevenLabs(false);
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
          <div className="flex gap-2">
            <button
              onClick={handleSyncNeuphonic}
              disabled={syncingNeuphonic || syncingElevenLabs}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {syncingNeuphonic ? "Syncing..." : "Sync Neuphonic"}
            </button>
            <button
              onClick={handleSyncElevenLabs}
              disabled={syncingNeuphonic || syncingElevenLabs}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {syncingElevenLabs ? "Syncing..." : "Sync ElevenLabs"}
            </button>
          </div>
        </div>
        <p className="text-gray-400 mt-1">
          Manage voices from Neuphonic and ElevenLabs for your presentations
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setProviderFilter("all")}
            className={`px-3 py-1 rounded text-sm ${
              providerFilter === "all"
                ? "bg-white text-black"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setProviderFilter("neuphonic")}
            className={`px-3 py-1 rounded text-sm ${
              providerFilter === "neuphonic"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            Neuphonic
          </button>
          <button
            onClick={() => setProviderFilter("elevenlabs")}
            className={`px-3 py-1 rounded text-sm ${
              providerFilter === "elevenlabs"
                ? "bg-purple-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            ElevenLabs
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {voices.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">
            No voices synced yet. Click &quot;Sync Neuphonic&quot; or &quot;Sync ElevenLabs&quot; to fetch available voices.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {voices.map((voice) => (
            <div
              key={voice.id}
              className={`bg-gray-900 border rounded-lg p-4 ${
                voice.tts_provider === "elevenlabs"
                  ? "border-purple-800"
                  : "border-blue-800"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-lg">{voice.name}</h3>
                <div className="flex gap-1">
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      voice.tts_provider === "elevenlabs"
                        ? "bg-purple-900 text-purple-200"
                        : "bg-blue-900 text-blue-200"
                    }`}
                  >
                    {voice.tts_provider === "elevenlabs" ? "ElevenLabs" : "Neuphonic"}
                  </span>
                  {voice.is_cloned && (
                    <span className="text-xs px-2 py-1 bg-green-900 text-green-200 rounded">
                      Clone
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-500 font-mono truncate">
                {voice.provider_voice_id || voice.neuphonic_voice_id}
              </p>
              {voice.voice_metadata?.tags && Array.isArray(voice.voice_metadata.tags) ? (
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
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

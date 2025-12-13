"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  createPresenter,
  deletePresenter,
  listPresenters,
  listVoices,
} from "@/lib/api";
import type { Presenter, Voice } from "@/lib/types";

export default function PresentersPage() {
  const [presenters, setPresenters] = useState<Presenter[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBio, setNewBio] = useState("");
  const [newTraits, setNewTraits] = useState("");
  const [newVoiceId, setNewVoiceId] = useState("");
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [presentersData, voicesData] = await Promise.all([
        listPresenters(),
        listVoices(),
      ]);
      setPresenters(presentersData);
      setVoices(voicesData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load presenters");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      setCreating(true);
      const traits = newTraits
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      await createPresenter({
        name: newName.trim(),
        bio: newBio.trim() || undefined,
        traits: traits.length > 0 ? traits : undefined,
        voice_id: newVoiceId || undefined,
      });

      setNewName("");
      setNewBio("");
      setNewTraits("");
      setNewVoiceId("");
      setShowCreate(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create presenter");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this presenter?")) return;

    try {
      await deletePresenter(id);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete presenter");
    }
  }

  function getVoiceName(voiceId: string | null): string {
    if (!voiceId) return "No voice assigned";
    const voice = voices.find((v) => v.id === voiceId);
    return voice ? voice.name : "Unknown voice";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Presenters</h1>
          <p className="text-gray-400 mt-1">
            Manage presenter personalities and their knowledge bases
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors"
        >
          Create Presenter
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {showCreate && (
        <div className="mb-8 p-6 bg-gray-900 border border-gray-800 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Create New Presenter</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500"
                placeholder="Dr. Sarah"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Bio (optional)
              </label>
              <textarea
                value={newBio}
                onChange={(e) => setNewBio(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500"
                placeholder="Expert in machine learning with 10 years of experience..."
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Personality Traits (comma-separated)
              </label>
              <input
                type="text"
                value={newTraits}
                onChange={(e) => setNewTraits(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500"
                placeholder="technical expert, conversational, witty, empathetic"
              />
              <p className="text-xs text-gray-500 mt-1">
                These traits influence how the presenter answers questions
              </p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Voice</label>
              <select
                value={newVoiceId}
                onChange={(e) => setNewVoiceId(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500"
              >
                <option value="">No voice (assign later)</option>
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 border border-gray-600 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {presenters.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>No presenters yet. Create your first one!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {presenters.map((presenter) => (
            <div
              key={presenter.id}
              className="p-6 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <Link
                    href={`/admin/presenters/${presenter.id}`}
                    className="text-xl font-semibold hover:underline"
                  >
                    {presenter.name}
                  </Link>
                  {presenter.bio && (
                    <p className="text-gray-400 mt-1 line-clamp-2">
                      {presenter.bio}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {presenter.traits.length > 0 ? (
                      presenter.traits.map((trait, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 text-xs bg-gray-800 text-gray-300 rounded"
                        >
                          {trait}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-500">
                        No traits defined
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                    <span>{getVoiceName(presenter.voice_id)}</span>
                    <span>
                      Created{" "}
                      {new Date(presenter.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <Link
                    href={`/admin/presenters/${presenter.id}`}
                    className="px-3 py-1 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
                  >
                    Manage
                  </Link>
                  <button
                    onClick={() => handleDelete(presenter.id)}
                    className="px-3 py-1 text-sm border border-red-800 text-red-400 rounded hover:bg-red-900/30 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

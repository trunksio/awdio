"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPodcast, deletePodcast, listPodcasts } from "@/lib/api";
import type { Podcast } from "@/lib/types";

export default function AdminPage() {
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadPodcasts();
  }, []);

  async function loadPodcasts() {
    try {
      setLoading(true);
      const data = await listPodcasts();
      setPodcasts(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load podcasts");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      setCreating(true);
      await createPodcast({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
      });
      setNewTitle("");
      setNewDescription("");
      setShowCreate(false);
      await loadPodcasts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create podcast");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this podcast?")) return;

    try {
      await deletePodcast(id);
      await loadPodcasts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete podcast");
    }
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
        <h1 className="text-3xl font-bold">Podcasts</h1>
        <div className="flex gap-4">
          <Link
            href="/admin/voices"
            className="px-4 py-2 border border-gray-600 rounded-lg hover:bg-gray-800 transition-colors"
          >
            Manage Voices
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Create Podcast
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {showCreate && (
        <div className="mb-8 p-6 bg-gray-900 border border-gray-800 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Create New Podcast</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500"
                placeholder="My Podcast"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Description (optional)
              </label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500"
                placeholder="A podcast about..."
                rows={3}
              />
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

      {podcasts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>No podcasts yet. Create your first one!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {podcasts.map((podcast) => (
            <div
              key={podcast.id}
              className="p-6 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <Link
                    href={`/admin/podcasts/${podcast.id}`}
                    className="text-xl font-semibold hover:underline"
                  >
                    {podcast.title}
                  </Link>
                  {podcast.description && (
                    <p className="text-gray-400 mt-1">{podcast.description}</p>
                  )}
                  <p className="text-sm text-gray-500 mt-2">
                    Created {new Date(podcast.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/podcasts/${podcast.id}`}
                    className="px-3 py-1 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
                  >
                    Manage
                  </Link>
                  <button
                    onClick={() => handleDelete(podcast.id)}
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

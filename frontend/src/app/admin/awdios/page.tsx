"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createAwdio, deleteAwdio, listAwdios, listPresenters } from "@/lib/api";
import type { Awdio, Presenter } from "@/lib/types";

export default function AwdiosPage() {
  const [awdios, setAwdios] = useState<Awdio[]>([]);
  const [presenters, setPresenters] = useState<Presenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPresenterId, setNewPresenterId] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [awdiosData, presentersData] = await Promise.all([
        listAwdios(),
        listPresenters(),
      ]);
      setAwdios(awdiosData);
      setPresenters(presentersData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      setCreating(true);
      await createAwdio({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        presenter_id: newPresenterId || undefined,
      });
      setNewTitle("");
      setNewDescription("");
      setNewPresenterId("");
      setShowCreate(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create awdio");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this awdio?")) return;

    try {
      await deleteAwdio(id);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete awdio");
    }
  }

  function getPresenterName(presenterId: string | null): string {
    if (!presenterId) return "No presenter";
    const presenter = presenters.find((p) => p.id === presenterId);
    return presenter?.name || "Unknown";
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
        <h1 className="text-3xl font-bold">Awdios</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors"
        >
          Create Awdio
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {showCreate && (
        <div className="mb-8 p-6 bg-gray-900 border border-gray-800 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Create New Awdio</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500"
                placeholder="My Awdio Presentation"
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
                placeholder="A presentation about..."
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Presenter (optional)
              </label>
              <select
                value={newPresenterId}
                onChange={(e) => setNewPresenterId(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500"
              >
                <option value="">Select a presenter...</option>
                {presenters.map((presenter) => (
                  <option key={presenter.id} value={presenter.id}>
                    {presenter.name}
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

      {awdios.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>No awdios yet. Create your first interactive presentation!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {awdios.map((awdio) => (
            <div
              key={awdio.id}
              className="p-6 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <Link
                    href={`/admin/awdios/${awdio.id}`}
                    className="text-xl font-semibold hover:underline"
                  >
                    {awdio.title}
                  </Link>
                  {awdio.description && (
                    <p className="text-gray-400 mt-1">{awdio.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span>Presenter: {getPresenterName(awdio.presenter_id)}</span>
                    <span>Status: {awdio.status}</span>
                    <span>
                      Created {new Date(awdio.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/awdios/${awdio.id}`}
                    className="px-3 py-1 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
                  >
                    Manage
                  </Link>
                  <button
                    onClick={() => handleDelete(awdio.id)}
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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listSurveys, createSurvey, deleteSurvey } from "@/lib/api";
import type { Survey } from "@/lib/types";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-gray-500/20 text-gray-400",
    published: "bg-green-500/20 text-green-400",
    closed: "bg-red-500/20 text-red-400",
  };

  return (
    <span className={`px-2 py-1 text-xs rounded ${colors[status] || colors.draft}`}>
      {status}
    </span>
  );
}

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadSurveys();
  }, []);

  async function loadSurveys() {
    try {
      setLoading(true);
      const data = await listSurveys();
      setSurveys(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load surveys");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      setCreating(true);
      const survey = await createSurvey({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
      });
      setSurveys([survey, ...surveys]);
      setNewTitle("");
      setNewDescription("");
      setShowCreate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create survey");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this survey?")) return;

    try {
      await deleteSurvey(id);
      setSurveys(surveys.filter((s) => s.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete survey");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading surveys...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Surveys</h1>
          <p className="text-gray-400 mt-1">
            Create and manage surveys for collecting feedback
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          Create Survey
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Create Survey</h2>
            <form onSubmit={handleCreate}>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                  placeholder="Customer Satisfaction Survey"
                  autoFocus
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                  placeholder="Help us improve our service..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newTitle.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Survey List */}
      {surveys.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="mb-4">No surveys yet</p>
          <button
            onClick={() => setShowCreate(true)}
            className="text-blue-400 hover:text-blue-300"
          >
            Create your first survey
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {surveys.map((survey) => (
            <div
              key={survey.id}
              className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Link
                      href={`/admin/surveys/${survey.id}`}
                      className="text-lg font-medium hover:text-blue-400 transition-colors"
                    >
                      {survey.title}
                    </Link>
                    <StatusBadge status={survey.status} />
                  </div>
                  {survey.description && (
                    <p className="text-gray-400 text-sm mb-2">{survey.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{survey.question_count} questions</span>
                    <span>{survey.submission_count} responses</span>
                    <span>
                      Created {new Date(survey.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/surveys/${survey.id}`}
                    className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                  >
                    Edit
                  </Link>
                  {survey.status === "published" && (
                    <Link
                      href={`/survey/${survey.id}/take`}
                      target="_blank"
                      className="px-3 py-1 text-sm bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded transition-colors"
                    >
                      Preview
                    </Link>
                  )}
                  <button
                    onClick={() => handleDelete(survey.id)}
                    className="px-3 py-1 text-sm text-red-400 hover:bg-red-600/20 rounded transition-colors"
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

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  createPresenterKnowledgeBase,
  deletePresenterDocument,
  deletePresenterKnowledgeBase,
  getPresenter,
  listPresenterDocuments,
  listPresenterKnowledgeBases,
  listVoices,
  updatePresenter,
  uploadPresenterDocument,
  type PresenterDocument,
  type PresenterKnowledgeBase,
} from "@/lib/api";
import type { Presenter, Voice } from "@/lib/types";

export default function PresenterDetailPage() {
  const params = useParams();
  const presenterId = params.id as string;

  const [presenter, setPresenter] = useState<Presenter | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<PresenterKnowledgeBase[]>([]);
  const [selectedKB, setSelectedKB] = useState<string | null>(null);
  const [documents, setDocuments] = useState<PresenterDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editTraits, setEditTraits] = useState("");
  const [editVoiceId, setEditVoiceId] = useState("");
  const [saving, setSaving] = useState(false);

  // Forms
  const [showCreateKB, setShowCreateKB] = useState(false);
  const [newKBName, setNewKBName] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [presenterData, voicesData, kbData] = await Promise.all([
        getPresenter(presenterId),
        listVoices(),
        listPresenterKnowledgeBases(presenterId),
      ]);
      setPresenter(presenterData);
      setVoices(voicesData);
      setKnowledgeBases(kbData);

      // Set edit form values
      setEditName(presenterData.name);
      setEditBio(presenterData.bio || "");
      setEditTraits(presenterData.traits.join(", "));
      setEditVoiceId(presenterData.voice_id || "");

      if (kbData.length > 0 && !selectedKB) {
        setSelectedKB(kbData[0].id);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [presenterId, selectedKB]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedKB) {
      listPresenterDocuments(presenterId, selectedKB)
        .then(setDocuments)
        .catch(console.error);
    }
  }, [presenterId, selectedKB]);

  async function handleSave() {
    try {
      setSaving(true);
      const traits = editTraits
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      await updatePresenter(presenterId, {
        name: editName.trim(),
        bio: editBio.trim() || undefined,
        traits,
        voice_id: editVoiceId || undefined,
      });
      await loadData();
      setIsEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save presenter");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateKB(e: React.FormEvent) {
    e.preventDefault();
    if (!newKBName.trim()) return;

    try {
      const kb = await createPresenterKnowledgeBase(presenterId, {
        name: newKBName.trim(),
      });
      setNewKBName("");
      setShowCreateKB(false);
      setSelectedKB(kb.id);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create knowledge base");
    }
  }

  async function handleDeleteKB(kbId: string) {
    if (!confirm("Delete this knowledge base and all its documents?")) return;

    try {
      await deletePresenterKnowledgeBase(presenterId, kbId);
      if (selectedKB === kbId) setSelectedKB(null);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedKB) return;

    try {
      setUploading(true);
      setError(null);
      await uploadPresenterDocument(presenterId, selectedKB, file);
      const docs = await listPresenterDocuments(presenterId, selectedKB);
      setDocuments(docs);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload document");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDeleteDoc(docId: string) {
    if (!selectedKB) return;
    if (!confirm("Delete this document?")) return;

    try {
      await deletePresenterDocument(presenterId, selectedKB, docId);
      const docs = await listPresenterDocuments(presenterId, selectedKB);
      setDocuments(docs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete document");
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

  if (!presenter) {
    return <div className="text-red-400">Presenter not found</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/admin/presenters"
          className="text-gray-400 hover:text-white text-sm"
        >
          ← Back to Presenters
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Presenter Info Section */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Presenter Info</h2>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="text-sm px-3 py-1 border border-gray-600 rounded hover:bg-gray-800"
              >
                Edit
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Bio</label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Personality Traits (comma-separated)
                </label>
                <input
                  type="text"
                  value={editTraits}
                  onChange={(e) => setEditTraits(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500"
                  placeholder="technical expert, conversational, witty"
                />
                <p className="text-xs text-gray-500 mt-1">
                  These traits influence how the presenter answers questions
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Voice</label>
                <select
                  value={editVoiceId}
                  onChange={(e) => setEditVoiceId(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500"
                >
                  <option value="">No voice</option>
                  {voices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditName(presenter.name);
                    setEditBio(presenter.bio || "");
                    setEditTraits(presenter.traits.join(", "));
                    setEditVoiceId(presenter.voice_id || "");
                  }}
                  className="px-4 py-2 border border-gray-600 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-2xl font-bold">{presenter.name}</h3>
                {presenter.bio && (
                  <p className="text-gray-400 mt-2">{presenter.bio}</p>
                )}
              </div>
              <div>
                <h4 className="text-sm text-gray-500 mb-2">Personality Traits</h4>
                <div className="flex flex-wrap gap-2">
                  {presenter.traits.length > 0 ? (
                    presenter.traits.map((trait, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 bg-gray-800 text-gray-300 rounded-full text-sm"
                      >
                        {trait}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500 text-sm">
                      No traits defined
                    </span>
                  )}
                </div>
              </div>
              <div>
                <h4 className="text-sm text-gray-500 mb-1">Voice</h4>
                <p className="text-gray-300">
                  {getVoiceName(presenter.voice_id)}
                </p>
              </div>
              <div className="text-sm text-gray-500">
                Created {new Date(presenter.created_at).toLocaleDateString()}
              </div>
            </div>
          )}
        </div>

        {/* Knowledge Base Section */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Knowledge Base</h2>
            <button
              onClick={() => setShowCreateKB(true)}
              className="text-sm px-3 py-1 border border-gray-600 rounded hover:bg-gray-800"
            >
              + New
            </button>
          </div>

          <p className="text-sm text-gray-400 mb-4">
            Upload documents to give this presenter specialized knowledge for
            answering questions.
          </p>

          {showCreateKB && (
            <form
              onSubmit={handleCreateKB}
              className="mb-4 p-4 bg-gray-800 rounded-lg"
            >
              <input
                type="text"
                value={newKBName}
                onChange={(e) => setNewKBName(e.target.value)}
                placeholder="Knowledge base name"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded mb-2"
                required
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-3 py-1 bg-white text-black rounded text-sm"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateKB(false)}
                  className="px-3 py-1 border border-gray-600 rounded text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {knowledgeBases.length === 0 ? (
            <p className="text-gray-500 text-sm">
              Create a knowledge base to upload documents.
            </p>
          ) : (
            <div className="space-y-2">
              {knowledgeBases.map((kb) => (
                <div
                  key={kb.id}
                  className={`p-3 rounded-lg cursor-pointer flex justify-between items-center ${
                    selectedKB === kb.id
                      ? "bg-gray-700 border border-gray-600"
                      : "bg-gray-800 hover:bg-gray-700"
                  }`}
                  onClick={() => setSelectedKB(kb.id)}
                >
                  <div>
                    <span className="font-medium">{kb.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteKB(kb.id);
                    }}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedKB && (
            <div className="mt-6">
              <h3 className="text-lg font-medium mb-3">Documents</h3>
              <div className="mb-4">
                <label className="block">
                  <span className="sr-only">Upload document</span>
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="block w-full text-sm text-gray-400
                      file:mr-4 file:py-2 file:px-4
                      file:rounded file:border-0
                      file:text-sm file:font-medium
                      file:bg-gray-700 file:text-white
                      hover:file:bg-gray-600
                      disabled:opacity-50"
                  />
                </label>
                {uploading && (
                  <p className="text-sm text-gray-400 mt-1">
                    Uploading and processing...
                  </p>
                )}
              </div>

              {documents.length === 0 ? (
                <p className="text-gray-500 text-sm">No documents yet.</p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3 bg-gray-800 rounded-lg flex justify-between items-center"
                    >
                      <div>
                        <span className="font-medium">{doc.filename}</span>
                        {!doc.processed && (
                          <span className="text-yellow-500 text-sm ml-2">
                            Processing...
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

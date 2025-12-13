"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  createEpisode,
  createKnowledgeBase,
  deleteDocument,
  deleteKnowledgeBase,
  getPodcast,
  listDocuments,
  listEpisodes,
  listKnowledgeBases,
  uploadDocument,
} from "@/lib/api";
import type { Episode, KnowledgeBase, Podcast, Document } from "@/lib/types";

export default function PodcastDetailPage() {
  const params = useParams();
  const podcastId = params.id as string;

  const [podcast, setPodcast] = useState<Podcast | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKB, setSelectedKB] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Forms
  const [showCreateEpisode, setShowCreateEpisode] = useState(false);
  const [showCreateKB, setShowCreateKB] = useState(false);
  const [newEpisodeTitle, setNewEpisodeTitle] = useState("");
  const [newKBName, setNewKBName] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [podcastData, episodesData, kbData] = await Promise.all([
        getPodcast(podcastId),
        listEpisodes(podcastId),
        listKnowledgeBases(podcastId),
      ]);
      setPodcast(podcastData);
      setEpisodes(episodesData);
      setKnowledgeBases(kbData);

      if (kbData.length > 0 && !selectedKB) {
        setSelectedKB(kbData[0].id);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [podcastId, selectedKB]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedKB) {
      listDocuments(podcastId, selectedKB).then(setDocuments).catch(console.error);
    }
  }, [podcastId, selectedKB]);

  async function handleCreateEpisode(e: React.FormEvent) {
    e.preventDefault();
    if (!newEpisodeTitle.trim()) return;

    try {
      await createEpisode(podcastId, { title: newEpisodeTitle.trim() });
      setNewEpisodeTitle("");
      setShowCreateEpisode(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create episode");
    }
  }

  async function handleCreateKB(e: React.FormEvent) {
    e.preventDefault();
    if (!newKBName.trim()) return;

    try {
      const kb = await createKnowledgeBase(podcastId, { name: newKBName.trim() });
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
      await deleteKnowledgeBase(podcastId, kbId);
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
      await uploadDocument(podcastId, selectedKB, file);
      const docs = await listDocuments(podcastId, selectedKB);
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
      await deleteDocument(podcastId, selectedKB, docId);
      const docs = await listDocuments(podcastId, selectedKB);
      setDocuments(docs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete document");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!podcast) {
    return <div className="text-red-400">Podcast not found</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <Link href="/admin" className="text-gray-400 hover:text-white text-sm">
          ← Back to Podcasts
        </Link>
        <h1 className="text-3xl font-bold mt-2">{podcast.title}</h1>
        {podcast.description && (
          <p className="text-gray-400 mt-1">{podcast.description}</p>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Knowledge Bases Section */}
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

          {showCreateKB && (
            <form onSubmit={handleCreateKB} className="mb-4 p-4 bg-gray-800 rounded-lg">
              <input
                type="text"
                value={newKBName}
                onChange={(e) => setNewKBName(e.target.value)}
                placeholder="Knowledge base name"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded mb-2"
                required
              />
              <div className="flex gap-2">
                <button type="submit" className="px-3 py-1 bg-white text-black rounded text-sm">
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
                    <span className="text-sm text-gray-400 ml-2">
                      ({kb.document_count} docs)
                    </span>
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
                        <span className="text-sm text-gray-400 ml-2">
                          ({doc.chunk_count} chunks)
                        </span>
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

        {/* Episodes Section */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Episodes</h2>
            <button
              onClick={() => setShowCreateEpisode(true)}
              className="text-sm px-3 py-1 border border-gray-600 rounded hover:bg-gray-800"
            >
              + New Episode
            </button>
          </div>

          {showCreateEpisode && (
            <form onSubmit={handleCreateEpisode} className="mb-4 p-4 bg-gray-800 rounded-lg">
              <input
                type="text"
                value={newEpisodeTitle}
                onChange={(e) => setNewEpisodeTitle(e.target.value)}
                placeholder="Episode title"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded mb-2"
                required
              />
              <div className="flex gap-2">
                <button type="submit" className="px-3 py-1 bg-white text-black rounded text-sm">
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateEpisode(false)}
                  className="px-3 py-1 border border-gray-600 rounded text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {episodes.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No episodes yet. Create one to generate a script.
            </p>
          ) : (
            <div className="space-y-2">
              {episodes.map((episode) => (
                <Link
                  key={episode.id}
                  href={`/admin/podcasts/${podcastId}/episodes/${episode.id}`}
                  className="block p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <div className="font-medium">{episode.title}</div>
                  <div className="text-sm text-gray-400 mt-1">
                    Status: {episode.status} •{" "}
                    {new Date(episode.created_at).toLocaleDateString()}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

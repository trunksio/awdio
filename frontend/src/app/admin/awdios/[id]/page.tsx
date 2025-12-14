"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  createSlideDeck,
  deleteSlideDeck,
  deleteSlide,
  getAwdio,
  listSlideDecks,
  listSlides,
  uploadSlidesBulk,
  listPresenters,
  updateAwdio,
  updateSlide,
  processAllSlides,
  listAwdioSessions,
  createAwdioSession,
  deleteAwdioSession,
  createAwdioKnowledgeBase,
  deleteAwdioKnowledgeBase,
  listAwdioKnowledgeBases,
  listAwdioKBImages,
  uploadAwdioKBImage,
  deleteAwdioKBImage,
  API_URL,
} from "@/lib/api";
import type { Awdio, AwdioKBImage, AwdioKnowledgeBase, AwdioSession, Presenter, Slide, SlideDeck } from "@/lib/types";

export default function AwdioDetailPage() {
  const params = useParams();
  const awdioId = params.id as string;

  const [awdio, setAwdio] = useState<Awdio | null>(null);
  const [slideDecks, setSlideDecks] = useState<SlideDeck[]>([]);
  const [sessions, setSessions] = useState<AwdioSession[]>([]);
  const [presenters, setPresenters] = useState<Presenter[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<SlideDeck | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create slide deck
  const [showCreateDeck, setShowCreateDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [newDeckDescription, setNewDeckDescription] = useState("");
  const [creatingDeck, setCreatingDeck] = useState(false);

  // Upload slides
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<{
    current: number;
    total: number;
    currentSlideId?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create session
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState("");
  const [newSessionDescription, setNewSessionDescription] = useState("");
  const [newSessionDeckId, setNewSessionDeckId] = useState("");
  const [creatingSession, setCreatingSession] = useState(false);

  // Edit slide
  const [editingSlide, setEditingSlide] = useState<Slide | null>(null);
  const [editSpeakerNotes, setEditSpeakerNotes] = useState("");
  const [savingSlide, setSavingSlide] = useState(false);

  // Knowledge Base
  const [knowledgeBases, setKnowledgeBases] = useState<AwdioKnowledgeBase[]>([]);
  const [selectedKB, setSelectedKB] = useState<string | null>(null);
  const [kbImages, setKBImages] = useState<AwdioKBImage[]>([]);
  const [showCreateKB, setShowCreateKB] = useState(false);
  const [newKBName, setNewKBName] = useState("");
  const [showImageForm, setShowImageForm] = useState(false);
  const [imageTitle, setImageTitle] = useState("");
  const [imageDescription, setImageDescription] = useState("");
  const [imageAssociatedText, setImageAssociatedText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [awdioData, decksData, sessionsData, presentersData, kbData] = await Promise.all([
        getAwdio(awdioId),
        listSlideDecks(awdioId),
        listAwdioSessions(awdioId),
        listPresenters(),
        listAwdioKnowledgeBases(awdioId),
      ]);
      setAwdio(awdioData);
      setSlideDecks(decksData);
      setSessions(sessionsData);
      setPresenters(presentersData);
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
  }, [awdioId, selectedKB]);

  const loadSlides = useCallback(
    async (deckId: string) => {
      try {
        const slidesData = await listSlides(awdioId, deckId);
        setSlides(slidesData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load slides");
      }
    },
    [awdioId]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedDeck) {
      loadSlides(selectedDeck.id);
    } else {
      setSlides([]);
    }
  }, [selectedDeck, loadSlides]);

  useEffect(() => {
    if (selectedKB) {
      listAwdioKBImages(awdioId, selectedKB)
        .then(setKBImages)
        .catch(console.error);
    } else {
      setKBImages([]);
    }
  }, [awdioId, selectedKB]);

  async function handleCreateDeck(e: React.FormEvent) {
    e.preventDefault();
    if (!newDeckName.trim()) return;

    try {
      setCreatingDeck(true);
      const deck = await createSlideDeck(awdioId, {
        name: newDeckName.trim(),
        description: newDeckDescription.trim() || undefined,
      });
      setNewDeckName("");
      setNewDeckDescription("");
      setShowCreateDeck(false);
      await loadData();
      setSelectedDeck(deck);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create slide deck");
    } finally {
      setCreatingDeck(false);
    }
  }

  async function handleDeleteDeck(deckId: string) {
    if (!confirm("Are you sure you want to delete this slide deck and all its slides?"))
      return;

    try {
      await deleteSlideDeck(awdioId, deckId);
      if (selectedDeck?.id === deckId) {
        setSelectedDeck(null);
      }
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete slide deck");
    }
  }

  async function handleUploadSlides(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedDeck) return;

    try {
      setUploading(true);
      await uploadSlidesBulk(awdioId, selectedDeck.id, Array.from(files));
      await loadSlides(selectedDeck.id);
      await loadData(); // Refresh deck slide count
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload slides");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleDeleteSlide(slideId: string) {
    if (!selectedDeck) return;
    if (!confirm("Are you sure you want to delete this slide?")) return;

    try {
      await deleteSlide(awdioId, selectedDeck.id, slideId);
      await loadSlides(selectedDeck.id);
      await loadData(); // Refresh deck slide count
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete slide");
    }
  }

  async function handlePresenterChange(presenterId: string) {
    try {
      await updateAwdio(awdioId, {
        presenter_id: presenterId || undefined,
      });
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update presenter");
    }
  }

  async function handleProcessAllSlides() {
    if (!selectedDeck) return;

    setProcessing(true);
    setProcessingProgress(null);
    setError(null);

    const eventSource = new EventSource(
      `${API_URL}/api/v1/awdios/${awdioId}/slide-decks/${selectedDeck.id}/process-all`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "start":
            setProcessingProgress({ current: 0, total: data.total });
            break;

          case "processing":
            setProcessingProgress({
              current: data.index,
              total: data.total,
              currentSlideId: data.slide_id,
            });
            break;

          case "slide_complete":
            // Update the slide in the local state
            setSlides((prev) =>
              prev.map((s) =>
                s.id === data.slide.id
                  ? {
                      ...s,
                      title: data.slide.title,
                      description: data.slide.description,
                      keywords: data.slide.keywords,
                      thumbnail_path: data.slide.thumbnail_path,
                    }
                  : s
              )
            );
            setProcessingProgress({
              current: data.index + 1,
              total: data.total,
            });
            break;

          case "error":
            setError(`Error processing slide ${data.index + 1}: ${data.error}`);
            break;

          case "complete":
            eventSource.close();
            setProcessing(false);
            setProcessingProgress(null);
            break;
        }
      } catch (e) {
        console.error("Failed to parse SSE event:", e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setProcessing(false);
      setProcessingProgress(null);
      setError("Connection lost while processing slides");
    };
  }

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    if (!newSessionTitle.trim() || !newSessionDeckId) return;

    try {
      setCreatingSession(true);
      await createAwdioSession(awdioId, {
        title: newSessionTitle.trim(),
        description: newSessionDescription.trim() || undefined,
        slide_deck_id: newSessionDeckId,
      });
      setNewSessionTitle("");
      setNewSessionDescription("");
      setNewSessionDeckId("");
      setShowCreateSession(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setCreatingSession(false);
    }
  }

  async function handleDeleteSession(sessionId: string) {
    if (!confirm("Are you sure you want to delete this session?")) return;

    try {
      await deleteAwdioSession(awdioId, sessionId);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete session");
    }
  }

  function openSlideEditor(slide: Slide) {
    setEditingSlide(slide);
    setEditSpeakerNotes(slide.speaker_notes || "");
  }

  function closeSlideEditor() {
    setEditingSlide(null);
    setEditSpeakerNotes("");
  }

  async function handleSaveSlide() {
    if (!editingSlide || !selectedDeck) return;

    try {
      setSavingSlide(true);
      await updateSlide(awdioId, selectedDeck.id, editingSlide.id, {
        speaker_notes: editSpeakerNotes,
      });
      await loadSlides(selectedDeck.id);
      closeSlideEditor();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save slide");
    } finally {
      setSavingSlide(false);
    }
  }

  async function handleCreateKB(e: React.FormEvent) {
    e.preventDefault();
    if (!newKBName.trim()) return;

    try {
      const kb = await createAwdioKnowledgeBase(awdioId, { name: newKBName.trim() });
      setNewKBName("");
      setShowCreateKB(false);
      setSelectedKB(kb.id);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create knowledge base");
    }
  }

  async function handleDeleteKB(kbId: string) {
    if (!confirm("Delete this knowledge base and all its content?")) return;

    try {
      await deleteAwdioKnowledgeBase(awdioId, kbId);
      if (selectedKB === kbId) setSelectedKB(null);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete knowledge base");
    }
  }

  async function handleImageUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedKB || !imageFile || !imageAssociatedText.trim()) return;

    try {
      setUploadingImage(true);
      setError(null);
      await uploadAwdioKBImage(
        awdioId,
        selectedKB,
        imageFile,
        imageTitle.trim() || null,
        imageDescription.trim() || null,
        imageAssociatedText.trim()
      );
      const images = await listAwdioKBImages(awdioId, selectedKB);
      setKBImages(images);
      setShowImageForm(false);
      setImageTitle("");
      setImageDescription("");
      setImageAssociatedText("");
      setImageFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleDeleteImage(imageId: string) {
    if (!selectedKB) return;
    if (!confirm("Delete this image?")) return;

    try {
      await deleteAwdioKBImage(awdioId, selectedKB, imageId);
      const images = await listAwdioKBImages(awdioId, selectedKB);
      setKBImages(images);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete image");
    }
  }

  function getDeckName(deckId: string | null): string {
    if (!deckId) return "No deck";
    const deck = slideDecks.find((d) => d.id === deckId);
    return deck?.name || "Unknown";
  }

  function getSlideImageUrl(slide: Slide): string {
    // image_path is stored as "bucket/object/path" (e.g., "awdio/awdios/{id}/slides/xxx.png")
    // The audio endpoint expects /{bucket}/{path:path}
    return `${API_URL}/api/v1/audio/${slide.image_path}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!awdio) {
    return <div className="text-red-400">Awdio not found</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/admin/awdios"
          className="text-gray-400 hover:text-white text-sm"
        >
          ← Back to Awdios
        </Link>
        <h1 className="text-3xl font-bold mt-2">{awdio.title}</h1>
        {awdio.description && (
          <p className="text-gray-400 mt-1">{awdio.description}</p>
        )}
        <div className="flex items-center gap-4 mt-2">
          <span className="text-sm text-gray-500">Status: {awdio.status}</span>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Presenter:</label>
            <select
              value={awdio.presenter_id || ""}
              onChange={(e) => handlePresenterChange(e.target.value)}
              className="px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded"
            >
              <option value="">None</option>
              {presenters.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Slide Decks Column */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Slide Decks</h2>
            <button
              onClick={() => setShowCreateDeck(true)}
              className="px-3 py-1 text-sm bg-white text-black font-medium rounded hover:bg-gray-200 transition-colors"
            >
              + New Deck
            </button>
          </div>

          {showCreateDeck && (
            <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
              <form onSubmit={handleCreateDeck} className="space-y-3">
                <input
                  type="text"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  placeholder="Deck name"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                  required
                />
                <input
                  type="text"
                  value={newDeckDescription}
                  onChange={(e) => setNewDeckDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={creatingDeck}
                    className="px-3 py-1 text-sm bg-white text-black font-medium rounded hover:bg-gray-200 disabled:opacity-50"
                  >
                    {creatingDeck ? "Creating..." : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateDeck(false)}
                    className="px-3 py-1 text-sm border border-gray-600 rounded hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {slideDecks.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No slide decks yet
            </div>
          ) : (
            <div className="space-y-2">
              {slideDecks.map((deck) => (
                <div
                  key={deck.id}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedDeck?.id === deck.id
                      ? "bg-gray-800 border-white"
                      : "bg-gray-900 border-gray-800 hover:border-gray-700"
                  }`}
                  onClick={() => setSelectedDeck(deck)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{deck.name}</div>
                      <div className="text-sm text-gray-400">
                        {deck.slide_count} slides • v{deck.version}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDeck(deck.id);
                      }}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Slides Column */}
        <div className="lg:col-span-2">
          {selectedDeck ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {selectedDeck.name} - Slides
                </h2>
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleUploadSlides}
                    className="hidden"
                    id="slide-upload"
                  />
                  <label
                    htmlFor="slide-upload"
                    className={`px-3 py-1 text-sm bg-white text-black font-medium rounded cursor-pointer hover:bg-gray-200 transition-colors ${
                      uploading ? "opacity-50 pointer-events-none" : ""
                    }`}
                  >
                    {uploading ? "Uploading..." : "+ Upload Slides"}
                  </label>
                  {slides.length > 0 && (
                    <button
                      onClick={handleProcessAllSlides}
                      disabled={processing}
                      className="px-3 py-1 text-sm bg-blue-600 text-white font-medium rounded hover:bg-blue-500 transition-colors disabled:opacity-50 min-w-[120px]"
                    >
                      {processing && processingProgress
                        ? `Processing ${processingProgress.current + 1}/${processingProgress.total}...`
                        : processing
                        ? "Starting..."
                        : "Process All"}
                    </button>
                  )}
                </div>
              </div>

              {slides.length === 0 ? (
                <div className="text-center py-16 text-gray-400 border border-dashed border-gray-700 rounded-lg">
                  <p>No slides yet</p>
                  <p className="text-sm mt-1">
                    Upload images to add slides to this deck
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {slides.map((slide) => {
                    const isProcessingThisSlide = processingProgress?.currentSlideId === slide.id;
                    return (
                    <div
                      key={slide.id}
                      className={`relative group rounded-lg overflow-hidden bg-gray-900 border transition-colors ${
                        isProcessingThisSlide
                          ? "border-blue-500 ring-2 ring-blue-500/50"
                          : "border-gray-800"
                      }`}
                    >
                      <div className="relative">
                        <img
                          src={getSlideImageUrl(slide)}
                          alt={slide.title || `Slide ${slide.slide_index + 1}`}
                          className={`w-full aspect-video object-cover ${
                            isProcessingThisSlide ? "opacity-50" : ""
                          }`}
                        />
                        {isProcessingThisSlide && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 rounded-full text-sm">
                              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Processing...
                            </div>
                          </div>
                        )}
                        {slide.thumbnail_path && !isProcessingThisSlide && (
                          <span className="absolute top-2 right-2 px-1.5 py-0.5 text-xs bg-green-600/80 text-white rounded">
                            Processed
                          </span>
                        )}
                        <span className="absolute top-2 left-2 px-1.5 py-0.5 text-xs bg-black/60 text-white rounded">
                          #{slide.slide_index + 1}
                        </span>
                      </div>
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          onClick={() => openSlideEditor(slide)}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-500"
                        >
                          Edit Notes
                        </button>
                        <button
                          onClick={() => handleDeleteSlide(slide.id)}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-500"
                        >
                          Delete
                        </button>
                      </div>
                      <div className="p-2">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium truncate flex-1">
                            {slide.title || `Slide ${slide.slide_index + 1}`}
                          </div>
                          {slide.speaker_notes && (
                            <span className="px-1.5 py-0.5 text-xs bg-blue-600/80 text-white rounded" title="Has speaker notes">
                              Notes
                            </span>
                          )}
                        </div>
                        {slide.speaker_notes ? (
                          <p className="text-xs text-blue-400 mt-1 line-clamp-2">
                            {slide.speaker_notes}
                          </p>
                        ) : slide.description ? (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                            {slide.description}
                          </p>
                        ) : null}
                        {slide.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {slide.keywords.slice(0, 3).map((kw, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 text-xs bg-gray-800 rounded"
                              >
                                {kw}
                              </span>
                            ))}
                            {slide.keywords.length > 3 && (
                              <span className="text-xs text-gray-500">
                                +{slide.keywords.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16 text-gray-400 border border-dashed border-gray-700 rounded-lg">
              <p>Select a slide deck to view its slides</p>
              <p className="text-sm mt-1">
                Or create a new deck to get started
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Sessions Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Sessions</h2>
          <button
            onClick={() => setShowCreateSession(true)}
            disabled={slideDecks.length === 0}
            className="px-3 py-1 text-sm bg-white text-black font-medium rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + New Session
          </button>
        </div>

        {slideDecks.length === 0 && (
          <div className="text-sm text-gray-400 mb-4">
            Create a slide deck first before creating sessions.
          </div>
        )}

        {showCreateSession && (
          <div className="mb-4 p-4 bg-gray-900 border border-gray-800 rounded-lg">
            <form onSubmit={handleCreateSession} className="space-y-3">
              <input
                type="text"
                value={newSessionTitle}
                onChange={(e) => setNewSessionTitle(e.target.value)}
                placeholder="Session title"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                required
              />
              <input
                type="text"
                value={newSessionDescription}
                onChange={(e) => setNewSessionDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
              />
              <select
                value={newSessionDeckId}
                onChange={(e) => setNewSessionDeckId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                required
              >
                <option value="">Select slide deck...</option>
                {slideDecks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name} ({deck.slide_count} slides)
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={creatingSession}
                  className="px-3 py-1 text-sm bg-white text-black font-medium rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  {creatingSession ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateSession(false)}
                  className="px-3 py-1 text-sm border border-gray-600 rounded hover:bg-gray-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {sessions.length === 0 ? (
          <div className="text-center py-8 text-gray-400 border border-dashed border-gray-700 rounded-lg">
            <p>No sessions yet</p>
            <p className="text-sm mt-1">
              Create a session to generate narration for your slides
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <Link
                      href={`/admin/awdios/${awdioId}/sessions/${session.id}`}
                      className="font-medium hover:underline"
                    >
                      {session.title}
                    </Link>
                    {session.description && (
                      <p className="text-sm text-gray-400 mt-1">
                        {session.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span>Deck: {getDeckName(session.slide_deck_id)}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        session.status === "synthesized"
                          ? "bg-green-600/20 text-green-400"
                          : session.status === "scripted"
                          ? "bg-blue-600/20 text-blue-400"
                          : "bg-gray-600/20 text-gray-400"
                      }`}>
                        {session.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/admin/awdios/${awdioId}/sessions/${session.id}`}
                      className="px-3 py-1 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
                    >
                      Manage
                    </Link>
                    <button
                      onClick={() => handleDeleteSession(session.id)}
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

      {/* Knowledge Base Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Knowledge Base Images</h2>
          <button
            onClick={() => setShowCreateKB(true)}
            className="px-3 py-1 text-sm bg-white text-black font-medium rounded hover:bg-gray-200 transition-colors"
          >
            + New KB
          </button>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          Upload images with text context for Q&A visual responses. These images can be shown during the presentation when answering related questions.
        </p>

        {showCreateKB && (
          <div className="mb-4 p-4 bg-gray-900 border border-gray-800 rounded-lg">
            <form onSubmit={handleCreateKB} className="space-y-3">
              <input
                type="text"
                value={newKBName}
                onChange={(e) => setNewKBName(e.target.value)}
                placeholder="Knowledge base name"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                required
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-3 py-1 text-sm bg-white text-black font-medium rounded"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateKB(false)}
                  className="px-3 py-1 text-sm border border-gray-600 rounded"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {knowledgeBases.length === 0 ? (
          <div className="text-center py-8 text-gray-400 border border-dashed border-gray-700 rounded-lg">
            <p>No knowledge bases yet</p>
            <p className="text-sm mt-1">Create one to upload images for Q&A</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* KB List */}
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
                  <span className="font-medium text-sm">{kb.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteKB(kb.id);
                    }}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>

            {/* Images Grid */}
            <div className="lg:col-span-3">
              {selectedKB ? (
                <div>
                  <button
                    onClick={() => setShowImageForm(true)}
                    className="mb-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                  >
                    + Add Image
                  </button>

                  {showImageForm && (
                    <form
                      onSubmit={handleImageUpload}
                      className="mb-4 p-4 bg-gray-800 rounded-lg space-y-3"
                    >
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Image File *</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                          className="block w-full text-sm text-gray-400"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Title</label>
                        <input
                          type="text"
                          value={imageTitle}
                          onChange={(e) => setImageTitle(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm"
                          placeholder="Optional title"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">
                          Associated Text * (for semantic search)
                        </label>
                        <textarea
                          value={imageAssociatedText}
                          onChange={(e) => setImageAssociatedText(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm"
                          rows={3}
                          placeholder="Describe when this image should be shown during Q&A..."
                          required
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={uploadingImage || !imageFile || !imageAssociatedText.trim()}
                          className="px-4 py-2 bg-white text-black rounded text-sm disabled:opacity-50"
                        >
                          {uploadingImage ? "Uploading..." : "Upload"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowImageForm(false);
                            setImageTitle("");
                            setImageDescription("");
                            setImageAssociatedText("");
                            setImageFile(null);
                          }}
                          className="px-4 py-2 border border-gray-600 rounded text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {kbImages.length === 0 ? (
                    <p className="text-gray-500 text-sm">No images in this knowledge base.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {kbImages.map((image) => (
                        <div
                          key={image.id}
                          className="bg-gray-800 rounded-lg overflow-hidden"
                        >
                          <div className="aspect-video bg-gray-700 flex items-center justify-center">
                            {image.thumbnail_path ? (
                              <img
                                src={`${API_URL}/api/v1/audio/${image.thumbnail_path}`}
                                alt={image.title || image.filename}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-gray-500 text-sm">No preview</span>
                            )}
                          </div>
                          <div className="p-3">
                            <p className="font-medium text-sm truncate">
                              {image.title || image.filename}
                            </p>
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                              {image.associated_text}
                            </p>
                            <button
                              onClick={() => handleDeleteImage(image.id)}
                              className="mt-2 text-red-400 hover:text-red-300 text-xs"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400 border border-dashed border-gray-700 rounded-lg">
                  Select a knowledge base to manage images
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Edit Speaker Notes Modal */}
      {editingSlide && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Edit Speaker Notes - Slide {editingSlide.slide_index + 1}
              </h3>
              <button
                onClick={closeSlideEditor}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Slide preview */}
              <div className="flex gap-4">
                <div className="w-48 flex-shrink-0">
                  <img
                    src={getSlideImageUrl(editingSlide)}
                    alt={editingSlide.title || `Slide ${editingSlide.slide_index + 1}`}
                    className="w-full rounded border border-gray-700"
                  />
                </div>
                <div className="flex-1 text-sm">
                  <div className="font-medium mb-1">
                    {editingSlide.title || `Slide ${editingSlide.slide_index + 1}`}
                  </div>
                  {editingSlide.description && (
                    <p className="text-gray-400 text-xs">
                      AI Description: {editingSlide.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Speaker notes textarea */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Speaker Notes
                  <span className="text-gray-400 font-normal ml-2">
                    (Used for narration instead of AI-generated description)
                  </span>
                </label>
                <textarea
                  value={editSpeakerNotes}
                  onChange={(e) => setEditSpeakerNotes(e.target.value)}
                  placeholder="Enter what you want to say for this slide. These notes will be used to generate the narration audio..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm min-h-[200px] resize-y"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Tip: Write naturally as if speaking. Aim for 30-60 seconds per slide (~75-150 words).
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-gray-800 flex justify-end gap-2">
              <button
                onClick={closeSlideEditor}
                className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSlide}
                disabled={savingSlide}
                className="px-4 py-2 text-sm bg-white text-black font-medium rounded hover:bg-gray-200 disabled:opacity-50"
              >
                {savingSlide ? "Saving..." : "Save Notes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

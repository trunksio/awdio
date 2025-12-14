import type {
  Awdio,
  AwdioDocument,
  AwdioKBImage,
  AwdioKnowledgeBase,
  AwdioSession,
  Document,
  Episode,
  EpisodeManifest,
  KnowledgeBase,
  Listener,
  NarrationScript,
  NarrationSegment,
  Podcast,
  PodcastPresenter,
  Presenter,
  PresenterKBImage,
  Script,
  SessionManifest,
  Slide,
  SlideDeck,
  SpeakerConfig,
  Voice,
  VoiceAssignment,
} from "./types";

// Presenter Knowledge Base type (different from podcast KB)
export interface PresenterKnowledgeBase {
  id: string;
  presenter_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface PresenterDocument {
  id: string;
  knowledge_base_id: string;
  filename: string;
  file_path: string;
  file_type: string | null;
  processed: boolean;
  created_at: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface HealthResponse {
  status: string;
  database: string;
  version: string;
}

async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export async function checkHealth(): Promise<HealthResponse> {
  return fetchAPI<HealthResponse>("/api/v1/health");
}

// Podcasts
export async function listPodcasts(): Promise<Podcast[]> {
  return fetchAPI<Podcast[]>("/api/v1/podcasts");
}

export async function createPodcast(data: {
  title: string;
  description?: string;
}): Promise<Podcast> {
  return fetchAPI<Podcast>("/api/v1/podcasts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getPodcast(id: string): Promise<Podcast> {
  return fetchAPI<Podcast>(`/api/v1/podcasts/${id}`);
}

export async function deletePodcast(id: string): Promise<void> {
  await fetchAPI(`/api/v1/podcasts/${id}`, { method: "DELETE" });
}

// Episodes
export async function listEpisodes(podcastId: string): Promise<Episode[]> {
  return fetchAPI<Episode[]>(`/api/v1/podcasts/${podcastId}/episodes`);
}

export async function createEpisode(
  podcastId: string,
  data: { title: string; description?: string }
): Promise<Episode> {
  return fetchAPI<Episode>(`/api/v1/podcasts/${podcastId}/episodes`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getEpisode(
  podcastId: string,
  episodeId: string
): Promise<Episode> {
  return fetchAPI<Episode>(
    `/api/v1/podcasts/${podcastId}/episodes/${episodeId}`
  );
}

// Knowledge Bases
export async function listKnowledgeBases(
  podcastId: string
): Promise<KnowledgeBase[]> {
  return fetchAPI<KnowledgeBase[]>(
    `/api/v1/podcasts/${podcastId}/knowledge-bases`
  );
}

export async function createKnowledgeBase(
  podcastId: string,
  data: { name: string; description?: string }
): Promise<KnowledgeBase> {
  return fetchAPI<KnowledgeBase>(
    `/api/v1/podcasts/${podcastId}/knowledge-bases`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
}

export async function deleteKnowledgeBase(
  podcastId: string,
  kbId: string
): Promise<void> {
  await fetchAPI(`/api/v1/podcasts/${podcastId}/knowledge-bases/${kbId}`, {
    method: "DELETE",
  });
}

// Documents
export async function listDocuments(
  podcastId: string,
  kbId: string
): Promise<Document[]> {
  return fetchAPI<Document[]>(
    `/api/v1/podcasts/${podcastId}/knowledge-bases/${kbId}/documents`
  );
}

export async function uploadDocument(
  podcastId: string,
  kbId: string,
  file: File
): Promise<Document> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${API_URL}/api/v1/podcasts/${podcastId}/knowledge-bases/${kbId}/documents`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

export async function deleteDocument(
  podcastId: string,
  kbId: string,
  docId: string
): Promise<void> {
  await fetchAPI(
    `/api/v1/podcasts/${podcastId}/knowledge-bases/${kbId}/documents/${docId}`,
    { method: "DELETE" }
  );
}

// Scripts
export async function getScript(
  podcastId: string,
  episodeId: string
): Promise<Script> {
  return fetchAPI<Script>(
    `/api/v1/podcasts/${podcastId}/episodes/${episodeId}/script`
  );
}

export async function generateScript(
  podcastId: string,
  episodeId: string,
  config: {
    speakers: SpeakerConfig[];
    target_duration_minutes?: number;
    tone?: string;
    additional_instructions?: string;
  }
): Promise<Script> {
  return fetchAPI<Script>(
    `/api/v1/podcasts/${podcastId}/episodes/${episodeId}/script/generate`,
    {
      method: "POST",
      body: JSON.stringify(config),
    }
  );
}

// Voices
export async function listVoices(provider?: string): Promise<Voice[]> {
  const params = provider ? `?provider=${provider}` : "";
  return fetchAPI<Voice[]>(`/api/v1/voices${params}`);
}

export async function syncVoices(): Promise<Voice[]> {
  return fetchAPI<Voice[]>("/api/v1/voices/sync", { method: "POST" });
}

export async function syncNeuphonicsVoices(): Promise<Voice[]> {
  return fetchAPI<Voice[]>("/api/v1/voices/sync/neuphonic", { method: "POST" });
}

export async function syncElevenLabsVoices(): Promise<Voice[]> {
  return fetchAPI<Voice[]>("/api/v1/voices/sync/elevenlabs", { method: "POST" });
}

export async function getVoice(voiceId: string): Promise<Voice> {
  return fetchAPI<Voice>(`/api/v1/voices/${voiceId}`);
}

export async function assignVoiceToPodcast(
  podcastId: string,
  data: { voice_id: string; role: string; speaker_name: string }
): Promise<VoiceAssignment> {
  return fetchAPI<VoiceAssignment>(
    `/api/v1/voices/podcasts/${podcastId}/assign`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
}

export async function getPodcastVoiceAssignments(
  podcastId: string
): Promise<VoiceAssignment[]> {
  return fetchAPI<VoiceAssignment[]>(
    `/api/v1/voices/podcasts/${podcastId}/assignments`
  );
}

// Synthesis
export async function synthesizeEpisode(
  podcastId: string,
  episodeId: string,
  speed: number = 1.0
): Promise<EpisodeManifest> {
  return fetchAPI<EpisodeManifest>(
    `/api/v1/podcasts/${podcastId}/episodes/${episodeId}/synthesize`,
    {
      method: "POST",
      body: JSON.stringify({ speed }),
    }
  );
}

export async function getEpisodeManifest(
  podcastId: string,
  episodeId: string
): Promise<EpisodeManifest> {
  return fetchAPI<EpisodeManifest>(
    `/api/v1/podcasts/${podcastId}/episodes/${episodeId}/manifest`
  );
}

// Presenters
export async function listPresenters(): Promise<Presenter[]> {
  return fetchAPI<Presenter[]>("/api/v1/presenters");
}

export async function createPresenter(data: {
  name: string;
  bio?: string;
  traits?: string[];
  voice_id?: string;
}): Promise<Presenter> {
  return fetchAPI<Presenter>("/api/v1/presenters", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getPresenter(id: string): Promise<Presenter> {
  return fetchAPI<Presenter>(`/api/v1/presenters/${id}`);
}

export async function updatePresenter(
  id: string,
  data: {
    name?: string;
    bio?: string;
    traits?: string[];
    voice_id?: string;
  }
): Promise<Presenter> {
  return fetchAPI<Presenter>(`/api/v1/presenters/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deletePresenter(id: string): Promise<void> {
  await fetchAPI(`/api/v1/presenters/${id}`, { method: "DELETE" });
}

// Presenter Knowledge Bases
export async function listPresenterKnowledgeBases(
  presenterId: string
): Promise<PresenterKnowledgeBase[]> {
  return fetchAPI<PresenterKnowledgeBase[]>(
    `/api/v1/presenters/${presenterId}/knowledge-bases`
  );
}

export async function createPresenterKnowledgeBase(
  presenterId: string,
  data: { name: string; description?: string }
): Promise<PresenterKnowledgeBase> {
  return fetchAPI<PresenterKnowledgeBase>(
    `/api/v1/presenters/${presenterId}/knowledge-bases`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
}

export async function deletePresenterKnowledgeBase(
  presenterId: string,
  kbId: string
): Promise<void> {
  await fetchAPI(`/api/v1/presenters/${presenterId}/knowledge-bases/${kbId}`, {
    method: "DELETE",
  });
}

// Presenter Documents
export async function listPresenterDocuments(
  presenterId: string,
  kbId: string
): Promise<PresenterDocument[]> {
  return fetchAPI<PresenterDocument[]>(
    `/api/v1/presenters/${presenterId}/knowledge-bases/${kbId}/documents`
  );
}

export async function uploadPresenterDocument(
  presenterId: string,
  kbId: string,
  file: File
): Promise<PresenterDocument> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${API_URL}/api/v1/presenters/${presenterId}/knowledge-bases/${kbId}/documents`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

export async function deletePresenterDocument(
  presenterId: string,
  kbId: string,
  docId: string
): Promise<void> {
  await fetchAPI(
    `/api/v1/presenters/${presenterId}/knowledge-bases/${kbId}/documents/${docId}`,
    { method: "DELETE" }
  );
}

// Podcast Presenters (assignments)
export async function listPodcastPresenters(
  podcastId: string
): Promise<PodcastPresenter[]> {
  return fetchAPI<PodcastPresenter[]>(
    `/api/v1/podcasts/${podcastId}/presenters`
  );
}

export async function addPresenterToPodcast(
  podcastId: string,
  data: { presenter_id: string; role: string; display_name?: string }
): Promise<PodcastPresenter> {
  return fetchAPI<PodcastPresenter>(
    `/api/v1/podcasts/${podcastId}/presenters`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
}

export async function removePresenterFromPodcast(
  podcastId: string,
  presenterId: string
): Promise<void> {
  await fetchAPI(`/api/v1/podcasts/${podcastId}/presenters/${presenterId}`, {
    method: "DELETE",
  });
}

// Listeners
export async function registerListener(data: { name: string }): Promise<Listener> {
  return fetchAPI<Listener>("/api/v1/listeners/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getListener(id: string): Promise<Listener> {
  return fetchAPI<Listener>(`/api/v1/listeners/${id}`);
}

// ============================================
// Awdios
// ============================================

export async function listAwdios(): Promise<Awdio[]> {
  return fetchAPI<Awdio[]>("/api/v1/awdios");
}

export async function createAwdio(data: {
  title: string;
  description?: string;
  presenter_id?: string;
}): Promise<Awdio> {
  return fetchAPI<Awdio>("/api/v1/awdios", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getAwdio(id: string): Promise<Awdio> {
  return fetchAPI<Awdio>(`/api/v1/awdios/${id}`);
}

export async function updateAwdio(
  id: string,
  data: {
    title?: string;
    description?: string;
    presenter_id?: string;
    status?: string;
  }
): Promise<Awdio> {
  return fetchAPI<Awdio>(`/api/v1/awdios/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteAwdio(id: string): Promise<void> {
  await fetchAPI(`/api/v1/awdios/${id}`, { method: "DELETE" });
}

// Slide Decks
export async function listSlideDecks(awdioId: string): Promise<SlideDeck[]> {
  return fetchAPI<SlideDeck[]>(`/api/v1/awdios/${awdioId}/slide-decks`);
}

export async function createSlideDeck(
  awdioId: string,
  data: { name: string; description?: string }
): Promise<SlideDeck> {
  return fetchAPI<SlideDeck>(`/api/v1/awdios/${awdioId}/slide-decks`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getSlideDeck(
  awdioId: string,
  deckId: string
): Promise<SlideDeck> {
  return fetchAPI<SlideDeck>(`/api/v1/awdios/${awdioId}/slide-decks/${deckId}`);
}

export async function deleteSlideDeck(
  awdioId: string,
  deckId: string
): Promise<void> {
  await fetchAPI(`/api/v1/awdios/${awdioId}/slide-decks/${deckId}`, {
    method: "DELETE",
  });
}

// Slides
export async function listSlides(
  awdioId: string,
  deckId: string
): Promise<Slide[]> {
  return fetchAPI<Slide[]>(
    `/api/v1/awdios/${awdioId}/slide-decks/${deckId}/slides`
  );
}

export async function uploadSlide(
  awdioId: string,
  deckId: string,
  file: File
): Promise<Slide> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${API_URL}/api/v1/awdios/${awdioId}/slide-decks/${deckId}/slides`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

export async function uploadSlidesBulk(
  awdioId: string,
  deckId: string,
  files: File[]
): Promise<Slide[]> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });

  const response = await fetch(
    `${API_URL}/api/v1/awdios/${awdioId}/slide-decks/${deckId}/slides/bulk`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

export async function updateSlide(
  awdioId: string,
  deckId: string,
  slideId: string,
  data: { title?: string; description?: string; keywords?: string[]; speaker_notes?: string }
): Promise<Slide> {
  return fetchAPI<Slide>(
    `/api/v1/awdios/${awdioId}/slide-decks/${deckId}/slides/${slideId}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    }
  );
}

export async function deleteSlide(
  awdioId: string,
  deckId: string,
  slideId: string
): Promise<void> {
  await fetchAPI(
    `/api/v1/awdios/${awdioId}/slide-decks/${deckId}/slides/${slideId}`,
    { method: "DELETE" }
  );
}

export async function reorderSlides(
  awdioId: string,
  deckId: string,
  slideIds: string[]
): Promise<Slide[]> {
  return fetchAPI<Slide[]>(
    `/api/v1/awdios/${awdioId}/slide-decks/${deckId}/slides/reorder`,
    {
      method: "POST",
      body: JSON.stringify({ slide_ids: slideIds }),
    }
  );
}

export async function processSlide(
  awdioId: string,
  deckId: string,
  slideId: string
): Promise<Slide> {
  return fetchAPI<Slide>(
    `/api/v1/awdios/${awdioId}/slide-decks/${deckId}/slides/${slideId}/process`,
    { method: "POST" }
  );
}

export async function processAllSlides(
  awdioId: string,
  deckId: string
): Promise<Slide[]> {
  return fetchAPI<Slide[]>(
    `/api/v1/awdios/${awdioId}/slide-decks/${deckId}/process-all`,
    { method: "POST" }
  );
}

// Awdio Sessions
export async function listAwdioSessions(
  awdioId: string
): Promise<AwdioSession[]> {
  return fetchAPI<AwdioSession[]>(`/api/v1/awdios/${awdioId}/sessions`);
}

export async function createAwdioSession(
  awdioId: string,
  data: { title: string; description?: string; slide_deck_id?: string }
): Promise<AwdioSession> {
  return fetchAPI<AwdioSession>(`/api/v1/awdios/${awdioId}/sessions`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getAwdioSession(
  awdioId: string,
  sessionId: string
): Promise<AwdioSession> {
  return fetchAPI<AwdioSession>(
    `/api/v1/awdios/${awdioId}/sessions/${sessionId}`
  );
}

export async function deleteAwdioSession(
  awdioId: string,
  sessionId: string
): Promise<void> {
  await fetchAPI(`/api/v1/awdios/${awdioId}/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export async function getAwdioSessionScript(
  awdioId: string,
  sessionId: string
): Promise<NarrationScript> {
  return fetchAPI<NarrationScript>(
    `/api/v1/awdios/${awdioId}/sessions/${sessionId}/script`
  );
}

export async function getAwdioSessionManifest(
  awdioId: string,
  sessionId: string
): Promise<SessionManifest> {
  return fetchAPI<SessionManifest>(
    `/api/v1/awdios/${awdioId}/sessions/${sessionId}/manifest`
  );
}

export async function generateAwdioSessionScript(
  awdioId: string,
  sessionId: string
): Promise<NarrationScript> {
  return fetchAPI<NarrationScript>(
    `/api/v1/awdios/${awdioId}/sessions/${sessionId}/script/generate`,
    { method: "POST" }
  );
}

export async function synthesizeAwdioSession(
  awdioId: string,
  sessionId: string
): Promise<SessionManifest> {
  return fetchAPI<SessionManifest>(
    `/api/v1/awdios/${awdioId}/sessions/${sessionId}/synthesize`,
    { method: "POST" }
  );
}

// Narration Segments
export async function updateNarrationSegment(
  awdioId: string,
  sessionId: string,
  segmentId: string,
  content: string
): Promise<NarrationSegment> {
  return fetchAPI<NarrationSegment>(
    `/api/v1/awdios/${awdioId}/sessions/${sessionId}/segments/${segmentId}`,
    {
      method: "PUT",
      body: JSON.stringify({ content }),
    }
  );
}

export async function synthesizeSegment(
  awdioId: string,
  sessionId: string,
  segmentId: string
): Promise<NarrationSegment> {
  return fetchAPI<NarrationSegment>(
    `/api/v1/awdios/${awdioId}/sessions/${sessionId}/segments/${segmentId}/synthesize`,
    { method: "POST" }
  );
}

// Awdio Knowledge Bases
export async function listAwdioKnowledgeBases(
  awdioId: string
): Promise<AwdioKnowledgeBase[]> {
  return fetchAPI<AwdioKnowledgeBase[]>(
    `/api/v1/awdios/${awdioId}/knowledge-bases`
  );
}

export async function createAwdioKnowledgeBase(
  awdioId: string,
  data: { name: string; description?: string }
): Promise<AwdioKnowledgeBase> {
  return fetchAPI<AwdioKnowledgeBase>(
    `/api/v1/awdios/${awdioId}/knowledge-bases`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
}

export async function deleteAwdioKnowledgeBase(
  awdioId: string,
  kbId: string
): Promise<void> {
  await fetchAPI(`/api/v1/awdios/${awdioId}/knowledge-bases/${kbId}`, {
    method: "DELETE",
  });
}

// Awdio Documents
export async function listAwdioDocuments(
  awdioId: string,
  kbId: string
): Promise<AwdioDocument[]> {
  return fetchAPI<AwdioDocument[]>(
    `/api/v1/awdios/${awdioId}/knowledge-bases/${kbId}/documents`
  );
}

export async function uploadAwdioDocument(
  awdioId: string,
  kbId: string,
  file: File
): Promise<AwdioDocument> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${API_URL}/api/v1/awdios/${awdioId}/knowledge-bases/${kbId}/documents`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

export async function deleteAwdioDocument(
  awdioId: string,
  kbId: string,
  docId: string
): Promise<void> {
  await fetchAPI(
    `/api/v1/awdios/${awdioId}/knowledge-bases/${kbId}/documents/${docId}`,
    { method: "DELETE" }
  );
}

// ============================================
// Presenter KB Images
// ============================================

export async function listPresenterKBImages(
  presenterId: string,
  kbId: string
): Promise<PresenterKBImage[]> {
  return fetchAPI<PresenterKBImage[]>(
    `/api/v1/presenters/${presenterId}/knowledge-bases/${kbId}/images`
  );
}

export async function uploadPresenterKBImage(
  presenterId: string,
  kbId: string,
  file: File,
  title: string | null,
  description: string | null,
  associatedText: string
): Promise<PresenterKBImage> {
  const formData = new FormData();
  formData.append("file", file);
  if (title) formData.append("title", title);
  if (description) formData.append("description", description);
  formData.append("associated_text", associatedText);

  const response = await fetch(
    `${API_URL}/api/v1/presenters/${presenterId}/knowledge-bases/${kbId}/images`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

export async function deletePresenterKBImage(
  presenterId: string,
  kbId: string,
  imageId: string
): Promise<void> {
  await fetchAPI(
    `/api/v1/presenters/${presenterId}/knowledge-bases/${kbId}/images/${imageId}`,
    { method: "DELETE" }
  );
}

// ============================================
// Awdio KB Images
// ============================================

export async function listAwdioKBImages(
  awdioId: string,
  kbId: string
): Promise<AwdioKBImage[]> {
  return fetchAPI<AwdioKBImage[]>(
    `/api/v1/awdios/${awdioId}/knowledge-bases/${kbId}/images`
  );
}

export async function uploadAwdioKBImage(
  awdioId: string,
  kbId: string,
  file: File,
  title: string | null,
  description: string | null,
  associatedText: string
): Promise<AwdioKBImage> {
  const formData = new FormData();
  formData.append("file", file);
  if (title) formData.append("title", title);
  if (description) formData.append("description", description);
  formData.append("associated_text", associatedText);

  const response = await fetch(
    `${API_URL}/api/v1/awdios/${awdioId}/knowledge-bases/${kbId}/images`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

export async function deleteAwdioKBImage(
  awdioId: string,
  kbId: string,
  imageId: string
): Promise<void> {
  await fetchAPI(
    `/api/v1/awdios/${awdioId}/knowledge-bases/${kbId}/images/${imageId}`,
    { method: "DELETE" }
  );
}

export { API_URL };

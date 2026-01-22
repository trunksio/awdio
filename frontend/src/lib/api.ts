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

// Token storage keys (matching AuthContext)
const ACCESS_TOKEN_KEY = "awdio_access_token";
const REFRESH_TOKEN_KEY = "awdio_refresh_token";

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      setTokens(data.access_token, data.refresh_token);
      return true;
    }

    clearTokens();
    return false;
  } catch {
    clearTokens();
    return false;
  }
}

export interface HealthResponse {
  status: string;
  database: string;
  version: string;
}

async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit,
  skipAuth: boolean = false
): Promise<T> {
  const token = getAccessToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  // Add auth header if token exists and not skipping auth
  if (token && !skipAuth) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 401 - try to refresh token and retry
  if (response.status === 401 && token && !skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // Retry with new token
      const newToken = getAccessToken();
      headers["Authorization"] = `Bearer ${newToken}`;
      response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });
    } else {
      // Redirect to login
      if (typeof window !== "undefined") {
        window.location.href = "/auth/login";
      }
      throw new Error("Session expired");
    }
  }

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

export async function updatePresenterKBImage(
  presenterId: string,
  kbId: string,
  imageId: string,
  data: { title?: string | null; description?: string | null; associated_text?: string | null }
): Promise<PresenterKBImage> {
  return fetchAPI<PresenterKBImage>(
    `/api/v1/presenters/${presenterId}/knowledge-bases/${kbId}/images/${imageId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
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

export async function updateAwdioKBImage(
  awdioId: string,
  kbId: string,
  imageId: string,
  data: { title?: string | null; description?: string | null; associated_text?: string | null }
): Promise<AwdioKBImage> {
  return fetchAPI<AwdioKBImage>(
    `/api/v1/awdios/${awdioId}/knowledge-bases/${kbId}/images/${imageId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
}

// ============================================
// Publishing
// ============================================

import type {
  PublishValidationResponse,
  PublishResponse,
  EmbedCodeResponse,
  EmbedAwdioFull,
} from "./types";

export async function validateSessionPublish(
  awdioId: string,
  sessionId: string
): Promise<PublishValidationResponse> {
  return fetchAPI<PublishValidationResponse>(
    `/api/v1/awdios/${awdioId}/sessions/${sessionId}/validate-publish`
  );
}

export async function publishSession(
  awdioId: string,
  sessionId: string
): Promise<PublishResponse> {
  return fetchAPI<PublishResponse>(
    `/api/v1/awdios/${awdioId}/sessions/${sessionId}/publish`,
    { method: "POST" }
  );
}

export async function unpublishSession(
  awdioId: string,
  sessionId: string
): Promise<PublishResponse> {
  return fetchAPI<PublishResponse>(
    `/api/v1/awdios/${awdioId}/sessions/${sessionId}/unpublish`,
    { method: "POST" }
  );
}

export async function getSessionEmbedCode(
  awdioId: string,
  sessionId: string,
  width?: number,
  height?: number
): Promise<EmbedCodeResponse> {
  const params = new URLSearchParams();
  if (width) params.append("width", width.toString());
  if (height) params.append("height", height.toString());
  const queryString = params.toString() ? `?${params.toString()}` : "";
  return fetchAPI<EmbedCodeResponse>(
    `/api/v1/awdios/${awdioId}/sessions/${sessionId}/embed-code${queryString}`
  );
}

// ============================================
// Embed API (public, no auth required)
// ============================================

export async function getEmbedAwdioSession(
  awdioId: string,
  sessionId: string
): Promise<EmbedAwdioFull> {
  // Use skipAuth=true for public embed endpoints
  return fetchAPI<EmbedAwdioFull>(
    `/api/v1/embed/awdios/${awdioId}/sessions/${sessionId}`,
    undefined,
    true // skipAuth
  );
}

export { API_URL };

// ============================================
// Surveys
// ============================================

import type {
  Survey,
  SurveyWithQuestions,
  SurveyQuestion,
  SurveySubmission,
  SurveyResults,
  QuestionOption,
} from "./types";

export async function listSurveys(): Promise<Survey[]> {
  return fetchAPI<Survey[]>("/api/v1/surveys");
}

export async function createSurvey(data: {
  title: string;
  description?: string;
  is_anonymous?: boolean;
  collect_pii_at_end?: boolean;
  allow_voice_input?: boolean;
  presenter_id?: string;
}): Promise<Survey> {
  return fetchAPI<Survey>("/api/v1/surveys", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getSurvey(id: string): Promise<SurveyWithQuestions> {
  return fetchAPI<SurveyWithQuestions>(`/api/v1/surveys/${id}`);
}

export async function updateSurvey(
  id: string,
  data: {
    title?: string;
    description?: string;
    is_anonymous?: boolean;
    collect_pii_at_end?: boolean;
    allow_voice_input?: boolean;
    presenter_id?: string;
    status?: string;
    closes_at?: string;
  }
): Promise<Survey> {
  return fetchAPI<Survey>(`/api/v1/surveys/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteSurvey(id: string): Promise<void> {
  await fetchAPI(`/api/v1/surveys/${id}`, { method: "DELETE" });
}

export async function publishSurvey(id: string): Promise<Survey> {
  return fetchAPI<Survey>(`/api/v1/surveys/${id}/publish`, { method: "POST" });
}

export async function closeSurvey(id: string): Promise<Survey> {
  return fetchAPI<Survey>(`/api/v1/surveys/${id}/close`, { method: "POST" });
}

// Survey Questions
export async function createSurveyQuestion(
  surveyId: string,
  data: {
    question_text: string;
    description?: string;
    question_type: string;
    options?: QuestionOption[];
    min_value?: number;
    max_value?: number;
    min_label?: string;
    max_label?: string;
    is_required?: boolean;
    order_index?: number;
  }
): Promise<SurveyQuestion> {
  return fetchAPI<SurveyQuestion>(`/api/v1/surveys/${surveyId}/questions`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateSurveyQuestion(
  surveyId: string,
  questionId: string,
  data: {
    question_text?: string;
    description?: string;
    question_type?: string;
    options?: QuestionOption[];
    min_value?: number;
    max_value?: number;
    min_label?: string;
    max_label?: string;
    is_required?: boolean;
    order_index?: number;
  }
): Promise<SurveyQuestion> {
  return fetchAPI<SurveyQuestion>(
    `/api/v1/surveys/${surveyId}/questions/${questionId}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    }
  );
}

export async function deleteSurveyQuestion(
  surveyId: string,
  questionId: string
): Promise<void> {
  await fetchAPI(`/api/v1/surveys/${surveyId}/questions/${questionId}`, {
    method: "DELETE",
  });
}

export async function reorderSurveyQuestions(
  surveyId: string,
  questionIds: string[]
): Promise<SurveyQuestion[]> {
  return fetchAPI<SurveyQuestion[]>(
    `/api/v1/surveys/${surveyId}/questions/reorder`,
    {
      method: "POST",
      body: JSON.stringify({ question_ids: questionIds }),
    }
  );
}

// Survey Synthesis
export interface SynthesisResponse {
  survey_id: string;
  synthesis_status: string;
  questions_synthesized: number;
  total_duration_ms: number;
}

export async function synthesizeSurvey(surveyId: string): Promise<SynthesisResponse> {
  return fetchAPI<SynthesisResponse>(`/api/v1/surveys/${surveyId}/synthesize`, {
    method: "POST",
  });
}

export async function synthesizeSurveyQuestion(
  surveyId: string,
  questionId: string
): Promise<SurveyQuestion> {
  return fetchAPI<SurveyQuestion>(
    `/api/v1/surveys/${surveyId}/questions/${questionId}/synthesize`,
    {
      method: "POST",
    }
  );
}

// Survey Results
export async function getSurveyResults(surveyId: string): Promise<SurveyResults> {
  return fetchAPI<SurveyResults>(`/api/v1/surveys/${surveyId}/results`);
}

export function getSurveyExportUrl(surveyId: string): string {
  const token = getAccessToken();
  return `${API_URL}/api/v1/surveys/${surveyId}/export?token=${token}`;
}

// Public Survey Taking (no auth required)
export async function getSurveyForTaking(id: string): Promise<SurveyWithQuestions> {
  return fetchAPI<SurveyWithQuestions>(`/api/v1/surveys/take/${id}`, undefined, true);
}

export async function startSurveySubmission(
  surveyId: string,
  data: { listener_id?: string; source?: string }
): Promise<SurveySubmission> {
  return fetchAPI<SurveySubmission>(
    `/api/v1/surveys/take/${surveyId}/start`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    true
  );
}

export async function submitSurveyAnswer(
  surveyId: string,
  submissionId: string,
  data: {
    question_id: string;
    answer_value: Record<string, unknown>;
    voice_transcript?: string;
  }
): Promise<{ status: string }> {
  return fetchAPI<{ status: string }>(
    `/api/v1/surveys/take/${surveyId}/submissions/${submissionId}/answer`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    true
  );
}

export async function completeSurveySubmission(
  surveyId: string,
  submissionId: string
): Promise<{ status: string; collect_pii: boolean; submission_id: string }> {
  return fetchAPI<{ status: string; collect_pii: boolean; submission_id: string }>(
    `/api/v1/surveys/take/${surveyId}/submissions/${submissionId}/complete`,
    { method: "POST" },
    true
  );
}

export async function submitSurveyPII(
  surveyId: string,
  submissionId: string,
  data: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    additional?: Record<string, unknown>;
  }
): Promise<{ status: string }> {
  return fetchAPI<{ status: string }>(
    `/api/v1/surveys/take/${surveyId}/submissions/${submissionId}/pii`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    true
  );
}

// ============================================
// Generic API Request (for custom endpoints)
// ============================================

/**
 * Generic API request function for custom endpoints.
 * Handles authentication, token refresh, and error handling.
 * @param endpoint - API endpoint (e.g., "/analytics/dashboard")
 * @param options - Fetch options (method, body, etc.)
 * @param skipAuth - Whether to skip authentication
 */
export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit,
  skipAuth: boolean = false
): Promise<T> {
  return fetchAPI<T>(endpoint, options, skipAuth);
}

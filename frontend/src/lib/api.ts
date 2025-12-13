import type {
  Document,
  Episode,
  EpisodeManifest,
  KnowledgeBase,
  Podcast,
  Script,
  SpeakerConfig,
  Voice,
  VoiceAssignment,
} from "./types";

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
export async function listVoices(): Promise<Voice[]> {
  return fetchAPI<Voice[]>("/api/v1/voices");
}

export async function syncVoices(): Promise<Voice[]> {
  return fetchAPI<Voice[]>("/api/v1/voices/sync", { method: "POST" });
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

export { API_URL };

export interface Podcast {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Episode {
  id: string;
  podcast_id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
}

export interface KnowledgeBase {
  id: string;
  podcast_id: string;
  name: string;
  description: string | null;
  created_at: string;
  document_count: number;
}

export interface Document {
  id: string;
  knowledge_base_id: string;
  filename: string;
  file_path: string;
  file_type: string | null;
  processed: boolean;
  created_at: string;
  chunk_count: number;
}

export interface ScriptSegment {
  id: string;
  segment_index: number;
  speaker_name: string;
  content: string;
  duration_estimate_ms: number | null;
  audio_path: string | null;
  audio_duration_ms: number | null;
}

export interface Script {
  id: string;
  episode_id: string;
  title: string | null;
  status: string;
  generation_prompt: string | null;
  raw_content: string | null;
  created_at: string;
  updated_at: string;
  segments: ScriptSegment[];
}

export interface SpeakerConfig {
  name: string;
  role: string;
  description: string;
}

export interface Voice {
  id: string;
  name: string;
  neuphonic_voice_id: string;
  is_cloned: boolean;
  voice_metadata: Record<string, unknown>;
}

export interface VoiceAssignment {
  id: string;
  podcast_id: string;
  voice_id: string;
  role: string;
  speaker_name: string;
}

export interface ManifestSegment {
  index: number;
  speaker: string;
  audio_path: string;
  duration_ms: number;
  text: string;
}

export interface EpisodeManifest {
  id: string;
  episode_id: string;
  total_duration_ms: number | null;
  segment_count: number | null;
  manifest: {
    segments: ManifestSegment[];
    total_duration_ms: number;
    generated_at: string;
  };
  created_at: string;
}

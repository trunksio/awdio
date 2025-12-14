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
  tts_provider: "neuphonic" | "elevenlabs";
  provider_voice_id: string | null;
  neuphonic_voice_id: string | null;  // Legacy field
  is_cloned: boolean;
  voice_metadata: Record<string, unknown>;
}

export type TTSProvider = "neuphonic" | "elevenlabs";

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

export interface Presenter {
  id: string;
  name: string;
  bio: string | null;
  traits: string[];
  voice_id: string | null;
  presenter_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PodcastPresenter {
  id: string;
  podcast_id: string;
  presenter_id: string;
  role: string;
  display_name: string | null;
  created_at: string;
  presenter?: Presenter;
}

export interface Listener {
  id: string;
  name: string;
  listener_metadata: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
}

// Awdio types
export interface Awdio {
  id: string;
  title: string;
  description: string | null;
  status: string;
  presenter_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SlideDeck {
  id: string;
  awdio_id: string;
  name: string;
  description: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  slide_count: number;
}

export interface Slide {
  id: string;
  slide_deck_id: string;
  slide_index: number;
  image_path: string;
  thumbnail_path: string | null;
  speaker_notes: string | null;
  title: string | null;
  description: string | null;
  keywords: string[];
  transcript_summary: string | null;
  slide_metadata: Record<string, unknown>;
  created_at: string;
}

export interface AwdioSession {
  id: string;
  awdio_id: string;
  slide_deck_id: string | null;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface NarrationSegment {
  id: string;
  script_id: string;
  slide_id: string;
  segment_index: number;
  content: string;
  speaker_name: string;
  duration_estimate_ms: number | null;
  audio_path: string | null;
  audio_duration_ms: number | null;
  slide_start_offset_ms: number;
}

export interface NarrationScript {
  id: string;
  session_id: string;
  status: string;
  generation_prompt: string | null;
  raw_content: string | null;
  script_metadata: Record<string, unknown>;
  synthesis_started_at: string | null;
  synthesis_completed_at: string | null;
  created_at: string;
  updated_at: string;
  segments: NarrationSegment[];
}

export interface SessionManifestSegment {
  index: number;
  slide_id: string;
  slide_index: number;
  slide_path: string;
  thumbnail_path: string | null;
  audio_path: string;
  duration_ms: number;
  text: string;
}

export interface SessionManifest {
  id: string;
  session_id: string;
  total_duration_ms: number | null;
  segment_count: number | null;
  manifest: {
    segments: SessionManifestSegment[];
    total_duration_ms: number;
    generated_at: string;
  };
  created_at: string;
}

export interface AwdioKnowledgeBase {
  id: string;
  awdio_id: string;
  name: string;
  description: string | null;
  created_at: string;
  document_count: number;
}

export interface AwdioDocument {
  id: string;
  knowledge_base_id: string;
  filename: string;
  file_path: string;
  file_type: string | null;
  processed: boolean;
  created_at: string;
  chunk_count: number;
}

// KB Image types
export interface KBImage {
  id: string;
  knowledge_base_id: string;
  filename: string;
  image_path: string;
  thumbnail_path: string | null;
  title: string | null;
  description: string | null;
  associated_text: string;
  image_metadata: Record<string, unknown>;
  created_at: string;
}

export type PresenterKBImage = KBImage;

export type AwdioKBImage = KBImage;

// Presenter Knowledge Base
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

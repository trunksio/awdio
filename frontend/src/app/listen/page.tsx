"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listPodcasts, listEpisodes, getEpisodeManifest } from "@/lib/api";
import type { Episode, EpisodeManifest, Podcast } from "@/lib/types";

interface PodcastWithEpisodes {
  podcast: Podcast;
  episodes: Array<{
    episode: Episode;
    manifest: EpisodeManifest | null;
  }>;
}

export default function ListenPage() {
  const [podcasts, setPodcasts] = useState<PodcastWithEpisodes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const podcastList = await listPodcasts();

        const podcastsWithEpisodes: PodcastWithEpisodes[] = [];

        for (const podcast of podcastList) {
          const episodes = await listEpisodes(podcast.id);
          const episodesWithManifests = await Promise.all(
            episodes.map(async (episode) => {
              try {
                const manifest = await getEpisodeManifest(podcast.id, episode.id);
                return { episode, manifest };
              } catch {
                return { episode, manifest: null };
              }
            })
          );

          // Only include podcasts with at least one synthesized episode
          const synthesizedEpisodes = episodesWithManifests.filter((e) => e.manifest);
          if (synthesizedEpisodes.length > 0) {
            podcastsWithEpisodes.push({
              podcast,
              episodes: synthesizedEpisodes,
            });
          }
        }

        setPodcasts(podcastsWithEpisodes);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load podcasts");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading podcasts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Link href="/" className="text-2xl font-bold">
            Awdio
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Listen</h1>

        {error && (
          <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200 mb-8">
            {error}
          </div>
        )}

        {podcasts.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">:/</div>
            <h2 className="text-xl font-semibold mb-2">No podcasts available yet</h2>
            <p className="text-gray-400 mb-6">
              Create a podcast and synthesize an episode in the admin panel.
            </p>
            <Link
              href="/admin"
              className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors"
            >
              Go to Admin Panel
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {podcasts.map(({ podcast, episodes }) => (
              <div key={podcast.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-gray-800">
                  <h2 className="text-xl font-bold">{podcast.title}</h2>
                  {podcast.description && (
                    <p className="text-gray-400 mt-1">{podcast.description}</p>
                  )}
                </div>

                <div className="divide-y divide-gray-800">
                  {episodes.map(({ episode, manifest }) => (
                    <Link
                      key={episode.id}
                      href={`/podcast/${podcast.id}/listen/${episode.id}`}
                      className="block p-6 hover:bg-gray-800/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-lg">{episode.title}</h3>
                          {episode.description && (
                            <p className="text-gray-400 text-sm mt-1">{episode.description}</p>
                          )}
                          {manifest && (
                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                              <span>{manifest.segment_count} segments</span>
                              <span>{formatDuration(manifest.total_duration_ms || 0)}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0 ml-4">
                          <div className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-gray-800 mt-auto">
        <div className="max-w-4xl mx-auto px-4 py-4 text-center text-sm text-gray-500">
          <Link href="/admin" className="hover:text-white">
            Admin Panel
          </Link>
        </div>
      </footer>
    </div>
  );
}

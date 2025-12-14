"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listAwdios, listAwdioSessions } from "@/lib/api";
import type { Awdio, AwdioSession } from "@/lib/types";

interface AwdioWithSessions extends Awdio {
  sessions: AwdioSession[];
}

export default function AwdioListPage() {
  const [awdios, setAwdios] = useState<AwdioWithSessions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const awdioList = await listAwdios();

        // Load sessions for each awdio
        const awdiosWithSessions = await Promise.all(
          awdioList.map(async (awdio) => {
            try {
              const sessions = await listAwdioSessions(awdio.id);
              // Filter to only show sessions with synthesized audio
              const readySessions = sessions.filter(s => s.status === "synthesized");
              return { ...awdio, sessions: readySessions };
            } catch {
              return { ...awdio, sessions: [] };
            }
          })
        );

        // Only show awdios that have at least one ready session
        setAwdios(awdiosWithSessions.filter(a => a.sessions.length > 0));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load presentations");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <span className="text-white/60">Loading presentations...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-gray-400 hover:text-white text-sm mb-2 inline-block">
              &larr; Back to Home
            </Link>
            <h1 className="text-3xl font-bold">Watch Presentations</h1>
            <p className="text-gray-400 mt-2">
              Interactive presentations you can watch and ask questions about
            </p>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200 mb-6">
            {error}
          </div>
        )}

        {awdios.length === 0 ? (
          <div className="text-center py-16">
            <svg
              className="w-16 h-16 mx-auto text-gray-600 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
              />
            </svg>
            <h2 className="text-xl font-semibold text-gray-400 mb-2">
              No presentations available
            </h2>
            <p className="text-gray-500">
              Check back later or create one in the Admin Panel
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {awdios.map((awdio) => (
              <div
                key={awdio.id}
                className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
              >
                <div className="p-6">
                  <h2 className="text-xl font-semibold mb-2">{awdio.title}</h2>
                  {awdio.description && (
                    <p className="text-gray-400 mb-4">{awdio.description}</p>
                  )}

                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                      Available Sessions
                    </h3>
                    {awdio.sessions.map((session) => (
                      <Link
                        key={session.id}
                        href={`/awdio/${awdio.id}/watch/${session.id}`}
                        className="flex items-center justify-between p-4 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors group"
                      >
                        <div>
                          <h4 className="font-medium group-hover:text-blue-400 transition-colors">
                            {session.title}
                          </h4>
                          {session.description && (
                            <p className="text-sm text-gray-400 mt-1">
                              {session.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-green-500 bg-green-500/10 px-2 py-1 rounded">
                            Ready
                          </span>
                          <svg
                            className="w-5 h-5 text-gray-500 group-hover:text-blue-400 transition-colors"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

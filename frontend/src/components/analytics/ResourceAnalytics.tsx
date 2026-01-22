"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

interface AnalyticsSummary {
  resource_type: string;
  resource_id: string;
  total_views: number;
  unique_viewers: number;
  completions: number;
  completion_rate: number;
  avg_duration_ms: number | null;
  qa_interactions: number;
  embed_views: number;
  direct_views: number;
}

interface DailyMetric {
  date: string;
  views: number;
  unique_viewers: number;
  completions: number;
  qa_interactions: number;
}

interface RecentSession {
  id: string;
  started_at: string;
  source: string;
  completed: boolean;
  completion_percentage: number;
  duration_ms: number | null;
  qa_interactions: number;
}

interface AnalyticsDetail {
  summary: AnalyticsSummary;
  daily_metrics: DailyMetric[];
  recent_sessions: RecentSession[];
}

interface ResourceAnalyticsProps {
  resourceType: "awdio" | "podcast";
  resourceId: string;
  days?: number;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "-";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ResourceAnalytics({
  resourceType,
  resourceId,
  days = 30,
}: ResourceAnalyticsProps) {
  const [analytics, setAnalytics] = useState<AnalyticsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        setLoading(true);
        const data = await apiRequest<AnalyticsDetail>(
          `/api/v1/analytics/${resourceType}s/${resourceId}?days=${days}`
        );
        setAnalytics(data);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    }

    loadAnalytics();
  }, [resourceType, resourceId, days]);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-gray-400 text-sm">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  const { summary, daily_metrics, recent_sessions } = analytics;

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <svg
            className="w-5 h-5 text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <span className="font-medium">Analytics</span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <span className="text-gray-400">
            <span className="text-white font-medium">{summary.total_views}</span> views
          </span>
          <span className="text-gray-400">
            <span className="text-white font-medium">{summary.completion_rate}%</span> completion
          </span>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-700 p-4 space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-gray-400 text-xs mb-1">Total Views</p>
              <p className="text-xl font-semibold">{summary.total_views}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-1">Unique Viewers</p>
              <p className="text-xl font-semibold">{summary.unique_viewers}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-1">Completions</p>
              <p className="text-xl font-semibold">{summary.completions}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-1">Q&A Interactions</p>
              <p className="text-xl font-semibold">{summary.qa_interactions}</p>
            </div>
          </div>

          {/* Source Breakdown */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-700/30 rounded p-3">
              <p className="text-gray-400 text-xs mb-1">Direct Views</p>
              <p className="text-lg font-medium">{summary.direct_views}</p>
            </div>
            <div className="bg-gray-700/30 rounded p-3">
              <p className="text-gray-400 text-xs mb-1">Embed Views</p>
              <p className="text-lg font-medium">{summary.embed_views}</p>
            </div>
          </div>

          {/* Avg Duration */}
          {summary.avg_duration_ms && (
            <div>
              <p className="text-gray-400 text-xs mb-1">Average Watch Time</p>
              <p className="text-lg font-medium">
                {formatDuration(summary.avg_duration_ms)}
              </p>
            </div>
          )}

          {/* Daily Chart (simple bar representation) */}
          {daily_metrics.length > 0 && (
            <div>
              <p className="text-gray-400 text-xs mb-2">Daily Views (Last {days} days)</p>
              <div className="flex items-end gap-1 h-16">
                {daily_metrics.slice(-14).map((day) => {
                  const maxViews = Math.max(...daily_metrics.map((d) => d.views), 1);
                  const height = (day.views / maxViews) * 100;
                  return (
                    <div
                      key={day.date}
                      className="flex-1 bg-blue-500/60 hover:bg-blue-500 transition-colors rounded-t"
                      style={{ height: `${Math.max(height, 4)}%` }}
                      title={`${formatDate(day.date)}: ${day.views} views`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{formatDate(daily_metrics[Math.max(0, daily_metrics.length - 14)].date)}</span>
                <span>{formatDate(daily_metrics[daily_metrics.length - 1].date)}</span>
              </div>
            </div>
          )}

          {/* Recent Sessions */}
          {recent_sessions.length > 0 && (
            <div>
              <p className="text-gray-400 text-xs mb-2">Recent Sessions</p>
              <div className="space-y-2">
                {recent_sessions.slice(0, 5).map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-2 bg-gray-700/30 rounded text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          session.source === "embed"
                            ? "bg-purple-500/20 text-purple-400"
                            : "bg-green-500/20 text-green-400"
                        }`}
                      >
                        {session.source}
                      </span>
                      <span className="text-gray-400">
                        {formatDateTime(session.started_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      {session.qa_interactions > 0 && (
                        <span className="text-blue-400 text-xs">
                          {session.qa_interactions} Q&A
                        </span>
                      )}
                      <span
                        className={
                          session.completed ? "text-green-400" : "text-gray-400"
                        }
                      >
                        {session.completed
                          ? "Completed"
                          : `${Math.round(session.completion_percentage)}%`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

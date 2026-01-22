"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";

interface DashboardSummary {
  total_views: number;
  total_unique_viewers: number;
  total_completions: number;
  total_qa_interactions: number;
  views_today: number;
  views_this_week: number;
  top_resources: {
    resource_type: string;
    resource_id: string;
    view_count: number;
  }[];
}

interface ResourceInfo {
  id: string;
  title: string;
  type: string;
}

function StatCard({
  label,
  value,
  subValue,
}: {
  label: string;
  value: number | string;
  subValue?: string;
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      {subValue && <p className="text-gray-500 text-xs mt-1">{subValue}</p>}
    </div>
  );
}

export default function AnalyticsDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [resourceInfo, setResourceInfo] = useState<Record<string, ResourceInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        const data = await apiRequest<DashboardSummary>("/api/v1/analytics/dashboard");
        setSummary(data);

        // Load resource info for top resources
        const infoMap: Record<string, ResourceInfo> = {};
        for (const resource of data.top_resources) {
          try {
            if (resource.resource_type === "awdio") {
              const awdio = await apiRequest<{ id: string; title: string }>(
                `/api/v1/awdios/${resource.resource_id}`
              );
              infoMap[resource.resource_id] = {
                id: awdio.id,
                title: awdio.title,
                type: "awdio",
              };
            } else if (resource.resource_type === "podcast") {
              const podcast = await apiRequest<{ id: string; title: string }>(
                `/api/v1/podcasts/${resource.resource_id}`
              );
              infoMap[resource.resource_id] = {
                id: podcast.id,
                title: podcast.title,
                type: "podcast",
              };
            }
          } catch {
            // Resource might have been deleted
            infoMap[resource.resource_id] = {
              id: resource.resource_id,
              title: "Unknown",
              type: resource.resource_type,
            };
          }
        }
        setResourceInfo(infoMap);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
        {error}
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="text-gray-400 text-center py-12">
        No analytics data available yet.
      </div>
    );
  }

  const completionRate =
    summary.total_views > 0
      ? ((summary.total_completions / summary.total_views) * 100).toFixed(1)
      : "0";

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-gray-400 mt-1">
          Overview of views, engagement, and interactions across all content
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Views"
          value={summary.total_views.toLocaleString()}
          subValue={`${summary.views_today} today`}
        />
        <StatCard
          label="Unique Viewers"
          value={summary.total_unique_viewers.toLocaleString()}
        />
        <StatCard
          label="Completions"
          value={summary.total_completions.toLocaleString()}
          subValue={`${completionRate}% completion rate`}
        />
        <StatCard
          label="Q&A Interactions"
          value={summary.total_qa_interactions.toLocaleString()}
        />
      </div>

      {/* Period Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-medium mb-4">Views This Week</h3>
          <p className="text-4xl font-bold text-blue-400">
            {summary.views_this_week.toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-medium mb-4">Views Today</h3>
          <p className="text-4xl font-bold text-green-400">
            {summary.views_today.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Top Resources */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-medium mb-4">Top Viewed Content</h3>
        {summary.top_resources.length === 0 ? (
          <p className="text-gray-500">No views recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {summary.top_resources.map((resource, index) => {
              const info = resourceInfo[resource.resource_id];
              const linkPath =
                resource.resource_type === "awdio"
                  ? `/admin/awdios/${resource.resource_id}`
                  : `/admin/podcasts/${resource.resource_id}`;

              return (
                <div
                  key={resource.resource_id}
                  className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold text-gray-500">
                      #{index + 1}
                    </span>
                    <div>
                      <Link
                        href={linkPath}
                        className="font-medium hover:text-blue-400 transition-colors"
                      >
                        {info?.title || resource.resource_id}
                      </Link>
                      <p className="text-sm text-gray-500 capitalize">
                        {resource.resource_type}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-semibold">
                      {resource.view_count.toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-500">views</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="mt-8 text-gray-400 text-sm">
        <p>
          View detailed analytics for specific content from the{" "}
          <Link href="/admin/awdios" className="text-blue-400 hover:underline">
            Awdios
          </Link>{" "}
          or{" "}
          <Link href="/admin" className="text-blue-400 hover:underline">
            Podcasts
          </Link>{" "}
          pages.
        </p>
      </div>
    </div>
  );
}

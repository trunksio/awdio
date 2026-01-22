"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  oauth_provider: string;
  is_admin: boolean;
  is_approved: boolean;
  created_at: string;
  last_login_at: string | null;
}

export default function UsersPage() {
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!currentUser || !currentUser.is_admin)) {
      router.push("/admin");
    }
  }, [currentUser, authLoading, router]);

  useEffect(() => {
    if (currentUser?.is_admin) {
      loadUsers();
    }
  }, [currentUser]);

  async function loadUsers() {
    try {
      setLoading(true);
      const token = localStorage.getItem("awdio_access_token");
      const response = await fetch("/awdio/api/v1/auth/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to load users");
      }
      const data = await response.json();
      setUsers(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(userId: string, approve: boolean) {
    try {
      setUpdating(userId);
      setError(null);
      const token = localStorage.getItem("awdio_access_token");
      const response = await fetch(`/awdio/api/v1/auth/users/${userId}/approve`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_approved: approve }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to update user");
      }
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update user");
    } finally {
      setUpdating(null);
    }
  }

  async function handleDelete(userId: string, userName: string) {
    if (!confirm(`Are you sure you want to delete ${userName}? This cannot be undone.`)) {
      return;
    }

    try {
      setUpdating(userId);
      setError(null);
      const token = localStorage.getItem("awdio_access_token");
      const response = await fetch(`/awdio/api/v1/auth/users/${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to delete user");
      }
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete user");
    } finally {
      setUpdating(null);
    }
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!currentUser?.is_admin) {
    return null;
  }

  const pendingUsers = users.filter((u) => !u.is_approved);
  const approvedUsers = users.filter((u) => u.is_approved);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-gray-400 mt-1">
          Approve or revoke user access to the platform
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {/* Pending Approval */}
      {pendingUsers.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
            Pending Approval ({pendingUsers.length})
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Provider
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Registered
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {pendingUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={user.name}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-medium">{user.name}</div>
                          <div className="text-sm text-gray-400">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 capitalize">
                      {user.oauth_provider}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleApprove(user.id, true)}
                          disabled={updating === user.id}
                          className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-500 transition-colors disabled:opacity-50"
                        >
                          {updating === user.id ? "..." : "Approve"}
                        </button>
                        <button
                          onClick={() => handleDelete(user.id, user.name)}
                          disabled={updating === user.id}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-500 transition-colors disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approved Users */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-3 h-3 bg-green-500 rounded-full"></span>
          Approved Users ({approvedUsers.length})
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                  User
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                  Last Login
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {approvedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {user.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt={user.name}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {user.name}
                          {user.id === currentUser?.id && (
                            <span className="text-xs text-blue-400">(you)</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-400">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.is_admin ? (
                      <span className="px-2 py-1 text-xs bg-purple-600/20 text-purple-400 rounded">
                        Admin
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs bg-gray-600/20 text-gray-400 rounded">
                        User
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {formatDate(user.last_login_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {user.id !== currentUser?.id && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleApprove(user.id, false)}
                          disabled={updating === user.id}
                          className="px-3 py-1 text-sm border border-gray-600 text-gray-300 rounded hover:bg-gray-800 transition-colors disabled:opacity-50"
                        >
                          Revoke
                        </button>
                        <button
                          onClick={() => handleDelete(user.id, user.name)}
                          disabled={updating === user.id}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-500 transition-colors disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

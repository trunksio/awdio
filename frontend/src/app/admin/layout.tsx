"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

function UserMenu() {
  const { user, logout } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.name}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-sm">{user.name}</span>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-lg z-20 py-1">
            <div className="px-4 py-2 border-b border-gray-700">
              <p className="text-sm text-white">{user.name}</p>
              <p className="text-xs text-gray-400">{user.email}</p>
            </div>
            {user.is_admin && (
              <div className="px-4 py-1">
                <span className="text-xs text-blue-400">Admin</span>
              </div>
            )}
            <button
              onClick={() => {
                setShowMenu(false);
                logout();
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AuthRequired({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthRequired>
      <div className="min-h-screen bg-background">
        <nav className="border-b border-gray-800 bg-gray-900/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center gap-8">
                <Link href="/" className="text-xl font-bold">
                  Awdio
                </Link>
                <Link
                  href="/admin"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  Podcasts
                </Link>
                <Link
                  href="/admin/awdios"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  Awdios
                </Link>
                <Link
                  href="/admin/presenters"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  Presenters
                </Link>
              </div>
              <div className="flex items-center">
                <UserMenu />
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>
    </AuthRequired>
  );
}

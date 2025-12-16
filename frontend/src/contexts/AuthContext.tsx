"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (provider: "google" | "github") => void;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Token storage keys
const ACCESS_TOKEN_KEY = "awdio_access_token";
const REFRESH_TOKEN_KEY = "awdio_refresh_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Fetch current user
  const fetchUser = useCallback(async (): Promise<User | null> => {
    const token = getAccessToken();
    if (!token) return null;

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        return await response.json();
      }

      // Token might be expired, try refresh
      if (response.status === 401) {
        const refreshed = await refreshTokenInternal();
        if (refreshed) {
          // Retry with new token
          const newToken = getAccessToken();
          const retryResponse = await fetch(`${API_URL}/api/v1/auth/me`, {
            headers: {
              Authorization: `Bearer ${newToken}`,
            },
          });
          if (retryResponse.ok) {
            return await retryResponse.json();
          }
        }
      }

      // Clear invalid tokens
      clearTokens();
      return null;
    } catch (error) {
      console.error("Failed to fetch user:", error);
      return null;
    }
  }, []);

  // Refresh access token
  const refreshTokenInternal = async (): Promise<boolean> => {
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

      // Refresh token invalid
      clearTokens();
      return false;
    } catch (error) {
      console.error("Failed to refresh token:", error);
      clearTokens();
      return false;
    }
  };

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      const user = await fetchUser();
      setState({
        user,
        isLoading: false,
        isAuthenticated: !!user,
      });
    };

    initAuth();
  }, [fetchUser]);

  // Login redirect
  const login = useCallback((provider: "google" | "github") => {
    // Store current URL to redirect back after login
    if (typeof window !== "undefined") {
      sessionStorage.setItem("awdio_redirect_after_login", window.location.pathname);
    }

    // Fetch login URL and redirect
    fetch(`${API_URL}/api/v1/auth/login/${provider}`)
      .then((res) => res.json())
      .then((data) => {
        // Store state for CSRF validation
        sessionStorage.setItem("awdio_oauth_state", data.state);
        window.location.href = data.authorization_url;
      })
      .catch((error) => {
        console.error("Failed to initiate login:", error);
      });
  }, []);

  // Logout
  const logout = useCallback(async () => {
    const token = getAccessToken();
    if (token) {
      try {
        await fetch(`${API_URL}/api/v1/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (error) {
        console.error("Failed to logout:", error);
      }
    }

    clearTokens();
    setState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  // Public refresh method
  const refreshToken = useCallback(async (): Promise<boolean> => {
    const success = await refreshTokenInternal();
    if (success) {
      const user = await fetchUser();
      setState({
        user,
        isLoading: false,
        isAuthenticated: !!user,
      });
    }
    return success;
  }, [fetchUser]);

  // Handle token received from OAuth callback
  useEffect(() => {
    const handleAuthCallback = () => {
      if (typeof window === "undefined") return;

      const params = new URLSearchParams(window.location.search);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        // Store tokens
        setTokens(accessToken, refreshToken);

        // Clean URL
        window.history.replaceState({}, "", window.location.pathname);

        // Fetch user
        fetchUser().then((user) => {
          setState({
            user,
            isLoading: false,
            isAuthenticated: !!user,
          });

          // Redirect to stored URL or admin
          const redirectUrl = sessionStorage.getItem("awdio_redirect_after_login") || "/admin";
          sessionStorage.removeItem("awdio_redirect_after_login");
          window.location.href = redirectUrl;
        });
      }
    };

    handleAuthCallback();
  }, [fetchUser]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        refreshToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setTokens } from "@/contexts/AuthContext";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const authCode = searchParams.get("code");

    if (!authCode) {
      // Error case - redirect to login
      router.push("/auth/login?error=auth_failed");
      return;
    }

    // Exchange auth code for tokens via POST request
    // This is more secure than receiving tokens in URL parameters
    async function exchangeCode() {
      try {
        const response = await fetch("/awdio/api/v1/auth/exchange", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code: authCode }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.detail || "Failed to exchange auth code");
        }

        const data = await response.json();

        // Store tokens securely
        setTokens(data.access_token, data.refresh_token);

        // Get redirect URL
        const redirectUrl = sessionStorage.getItem("awdio_redirect_after_login") || "/admin";
        sessionStorage.removeItem("awdio_redirect_after_login");

        // Redirect
        router.push(redirectUrl);
      } catch (e) {
        console.error("Auth exchange failed:", e);
        setError(e instanceof Error ? e.message : "Authentication failed");
        // Redirect to login after a short delay
        setTimeout(() => {
          router.push("/auth/login?error=auth_failed");
        }, 2000);
      }
    }

    exchangeCode();
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <p className="text-red-400 mb-2">{error}</p>
          <p className="text-gray-400 text-sm">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-300">Completing login...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading...</p>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}

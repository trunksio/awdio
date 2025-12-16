"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setTokens } from "@/contexts/AuthContext";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const accessToken = searchParams.get("access_token");
    const refreshToken = searchParams.get("refresh_token");

    if (accessToken && refreshToken) {
      // Store tokens
      setTokens(accessToken, refreshToken);

      // Get redirect URL
      const redirectUrl = sessionStorage.getItem("awdio_redirect_after_login") || "/admin";
      sessionStorage.removeItem("awdio_redirect_after_login");

      // Redirect
      router.push(redirectUrl);
    } else {
      // Error case - redirect to login
      router.push("/auth/login?error=auth_failed");
    }
  }, [router, searchParams]);

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

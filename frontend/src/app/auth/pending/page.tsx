"use client";

import Link from "next/link";

export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="max-w-md w-full space-y-8 p-8 text-center">
        <div>
          <svg
            className="mx-auto h-16 w-16 text-yellow-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h1 className="mt-6 text-3xl font-bold text-white">
            Pending Approval
          </h1>
          <p className="mt-4 text-gray-400">
            Your account has been created but requires administrator approval
            before you can access the platform.
          </p>
          <p className="mt-2 text-gray-500 text-sm">
            Please contact an administrator to request access.
          </p>
        </div>

        <div className="mt-8">
          <Link
            href="/auth/login"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}

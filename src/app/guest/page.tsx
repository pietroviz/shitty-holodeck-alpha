"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

function generateGuestId(): string {
  return "guest_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function getOrCreateGuestId(): string {
  if (typeof window === "undefined") return generateGuestId();

  const existing = document.cookie
    .split("; ")
    .find((c) => c.startsWith("guest_id="))
    ?.split("=")[1];

  if (existing) return existing;

  const newId = generateGuestId();
  // Set cookie for 7 days
  document.cookie = `guest_id=${newId}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
  return newId;
}

export default function GuestPage() {
  const [guestId, setGuestId] = useState<string>("");

  useEffect(() => {
    setGuestId(getOrCreateGuestId());
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">Guest Mode</h1>
          <div className="flex items-center gap-4">
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full font-medium">
              Guest Session
            </span>
            <Link
              href="/auth/login"
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              Sign up to save
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8">
          <p className="text-amber-800 text-sm">
            <strong>You&apos;re browsing as a guest.</strong> Your session data
            will be saved temporarily. Sign up with your email to keep your work
            permanently.
          </p>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Try the Simulators
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link
            href="/simulators/example"
            className="block bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-lg font-semibold text-gray-900">
                Example Simulator
              </h3>
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-800">
                live
              </span>
            </div>
            <p className="text-gray-600 text-sm">
              Try out the example simulator as a guest.
            </p>
          </Link>

          <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex items-center justify-center text-gray-400">
            <span className="text-sm">More simulators coming soon...</span>
          </div>
        </div>

        {guestId && (
          <p className="mt-8 text-xs text-gray-400 text-center">
            Session: {guestId.slice(0, 16)}...
          </p>
        )}
      </main>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "password" | "choose";

export default function GatePage() {
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      setStep("choose");
    } else {
      setError("Wrong password. Try again.");
    }
    setLoading(false);
  };

  const handleGuest = () => {
    // Generate a guest ID cookie and go to guest page
    const guestId =
      "guest_" +
      Math.random().toString(36).substring(2, 15) +
      Date.now().toString(36);
    document.cookie = `guest_id=${guestId}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
    router.push("/guest");
  };

  const handleSignIn = () => {
    router.push("/auth/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="max-w-sm w-full space-y-6 p-8 bg-gray-800/50 backdrop-blur rounded-2xl border border-gray-700 shadow-2xl">
        {step === "password" && (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white">
                Pietro&apos;s Simulator Lab
              </h1>
              <p className="mt-2 text-sm text-gray-400">
                This site is in private beta. Enter the password to continue.
              </p>
            </div>
            <form onSubmit={handlePassword} className="space-y-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? "Checking..." : "Enter"}
              </button>
            </form>
          </>
        )}

        {step === "choose" && (
          <>
            <div className="text-center">
              <div className="text-3xl mb-2">&#10024;</div>
              <h1 className="text-2xl font-bold text-white">You&apos;re in!</h1>
              <p className="mt-2 text-sm text-gray-400">
                How would you like to explore?
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={handleSignIn}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Sign in with Email
              </button>
              <p className="text-xs text-gray-500 text-center -mt-1">
                We&apos;ll send you a magic link — no password needed
              </p>
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-gray-700" />
                <span className="text-xs text-gray-500">or</span>
                <div className="flex-1 h-px bg-gray-700" />
              </div>
              <button
                onClick={handleGuest}
                className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium rounded-lg transition-colors"
              >
                Continue as Guest
              </button>
              <p className="text-xs text-gray-500 text-center -mt-1">
                Try things out — you can sign up later
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

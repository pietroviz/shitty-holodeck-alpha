"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // This ensures a magic LINK is sent, not an OTP code
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1A2332]">
        <div className="max-w-sm w-full p-8 bg-[#1E2530] rounded-2xl border border-[#2A3240] shadow-2xl text-center space-y-5">
          <div className="text-4xl">&#9993;&#65039;</div>
          <h2 className="text-xl font-bold text-white">Check your email</h2>
          <p className="text-sm text-gray-300">
            We sent a magic link to{" "}
            <span className="font-semibold text-[#00D9D9]">{email}</span>
          </p>
          <p className="text-sm text-[#5A6676]">
            Click the link in the email to sign in. It may take a minute to
            arrive.
          </p>
          <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3">
            <p className="text-xs text-amber-300">
              <span className="font-semibold">Don&apos;t see it?</span> Check
              your spam or junk folder. The email comes from{" "}
              <span className="text-amber-200">noreply@mail.app.supabase.io</span>
            </p>
          </div>
          <div className="pt-2 space-y-3">
            <button
              onClick={() => {
                setSent(false);
                setEmail("");
              }}
              className="w-full py-2.5 bg-[#2A3240] hover:bg-[#2A3240]/80 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Try a different email
            </button>
            <Link
              href="/"
              className="block text-xs text-[#5A6676] hover:text-[#00D9D9] transition-colors"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1A2332]">
      <div className="max-w-sm w-full space-y-6 p-8 bg-[#1E2530] rounded-2xl border border-[#2A3240] shadow-2xl">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">Sign in</h2>
          <p className="mt-2 text-sm text-[#5A6676]">
            Enter your email and we&apos;ll send you a magic link
          </p>
        </div>
        <form className="space-y-4" onSubmit={handleLogin}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
            className="w-full px-4 py-3 bg-[#2A3240] border border-[#2A3240] rounded-lg text-white placeholder-[#5A6676] focus:ring-2 focus:ring-[#00D9D9] focus:border-transparent outline-none"
          />
          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#00D9D9] hover:bg-[#00B8B8] text-[#1A2332] font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Sending..." : "Send Magic Link"}
          </button>
        </form>
        <Link
          href="/"
          className="block text-center text-xs text-[#5A6676] hover:text-[#00D9D9] transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}

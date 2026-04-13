"use client";

import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AccountSetupPage() {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "available" | "taken"
  >("idle");
  const router = useRouter();

  // Redirect away if user already has a profile set up
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/auth/login");
        return;
      }
      // Check if they already have a username
      supabase
        .from("profiles")
        .select("username, full_name")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.username) {
            // Already set up — go to dashboard
            router.push("/");
          } else {
            setChecking(false);
          }
        });
    });
  }, [router]);

  // Debounced username availability check
  useEffect(() => {
    if (!username || username.length < 3) {
      setUsernameStatus("idle");
      return;
    }

    // Basic validation: lowercase alphanumeric + underscores
    if (!/^[a-z0-9_]+$/.test(username)) {
      setUsernameStatus("idle");
      return;
    }

    setUsernameStatus("checking");
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      setUsernameStatus(data ? "taken" : "available");
    }, 400);

    return () => clearTimeout(timer);
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (username.length < 3) {
      setError("Username must be at least 3 characters.");
      setLoading(false);
      return;
    }

    if (!/^[a-z0-9_]+$/.test(username)) {
      setError("Username can only contain lowercase letters, numbers, and underscores.");
      setLoading(false);
      return;
    }

    if (usernameStatus === "taken") {
      setError("That username is already taken.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Session expired. Please sign in again.");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        username: username.trim().toLowerCase(),
        display_name: fullName.trim() || username.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      if (updateError.code === "23505") {
        setError("That username is already taken. Try another one.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      setLoading(false);
      return;
    }

    router.push("/");
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1A2332]">
        <p className="text-[#5A6676] text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1A2332]">
      <div className="max-w-sm w-full space-y-6 p-8 bg-[#1E2530] rounded-2xl border border-[#2A3240] shadow-2xl">
        <div className="text-center">
          <div className="text-3xl mb-2">&#128075;</div>
          <h1 className="text-2xl font-bold text-white">
            Welcome! Let&apos;s set up your account
          </h1>
          <p className="mt-2 text-sm text-[#5A6676]">
            Just a couple quick things and you&apos;re all set.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Jane Doe"
              required
              autoFocus
              className="w-full px-4 py-3 bg-[#2A3240] border border-[#2A3240] rounded-lg text-white placeholder-[#5A6676] focus:ring-2 focus:ring-[#00D9D9] focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6676] text-sm">
                @
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                }
                placeholder="your_username"
                required
                minLength={3}
                maxLength={24}
                className="w-full pl-8 pr-10 py-3 bg-[#2A3240] border border-[#2A3240] rounded-lg text-white placeholder-[#5A6676] focus:ring-2 focus:ring-[#00D9D9] focus:border-transparent outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                {usernameStatus === "checking" && (
                  <span className="text-[#5A6676]">...</span>
                )}
                {usernameStatus === "available" && (
                  <span className="text-green-400">&#10003;</span>
                )}
                {usernameStatus === "taken" && (
                  <span className="text-red-400">&#10007;</span>
                )}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#5A6676]">
              Lowercase letters, numbers, and underscores only
            </p>
            {usernameStatus === "taken" && (
              <p className="mt-1 text-xs text-red-400">
                That username is taken — try another
              </p>
            )}
          </div>
          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || usernameStatus === "taken" || usernameStatus === "checking"}
            className="w-full py-3 bg-[#00D9D9] hover:bg-[#00B8B8] text-[#1A2332] font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Saving..." : "Let's go"}
          </button>
        </form>
      </div>
    </div>
  );
}

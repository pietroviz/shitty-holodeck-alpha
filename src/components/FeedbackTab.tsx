"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function FeedbackTab() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user);
    });
  }, []);

  // Don't render at all if not logged in
  if (!isLoggedIn) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    setStatus("sending");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          pageUrl: window.location.href,
        }),
      });

      if (!res.ok) throw new Error("Failed");

      setStatus("sent");
      setMessage("");
      setTimeout(() => {
        setStatus("idle");
        setIsOpen(false);
      }, 1500);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2500);
    }
  }

  return (
    <>
      {/* The vertical tab on the right edge */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-50
            bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
            px-2 py-3 rounded-l-lg shadow-lg transition-colors
            writing-vertical"
          style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            letterSpacing: "0.05em",
          }}
          aria-label="Open feedback form"
        >
          Feedback
        </button>
      )}

      {/* The expanded panel */}
      {isOpen && (
        <div
          className="fixed right-0 top-1/2 -translate-y-1/2 z-50
            w-72 bg-gray-900 border border-gray-700 rounded-l-xl shadow-2xl
            p-4 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold text-sm">
              Quick Note
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white text-lg leading-none"
              aria-label="Close feedback form"
            >
              &times;
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What did you notice?"
              maxLength={2000}
              rows={4}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg
                text-white text-sm p-2.5 placeholder-gray-500
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                resize-none"
              autoFocus
            />

            <div className="flex items-center justify-between">
              <span className="text-gray-500 text-xs">
                {message.length}/2000
              </span>

              <button
                type="submit"
                disabled={!message.trim() || status === "sending"}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700
                  disabled:text-gray-500 text-white text-sm font-medium rounded-lg
                  transition-colors"
              >
                {status === "sending"
                  ? "Saving..."
                  : status === "sent"
                    ? "Saved!"
                    : status === "error"
                      ? "Failed"
                      : "Save"}
              </button>
            </div>
          </form>

          <p className="text-gray-600 text-xs">
            Page: {typeof window !== "undefined" ? window.location.pathname : ""}
          </p>
        </div>
      )}
    </>
  );
}

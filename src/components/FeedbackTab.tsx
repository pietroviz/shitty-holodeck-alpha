"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function getHolodeckContext(): string {
  try {
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    if (!iframe?.contentWindow) return "";
    const ctx = (iframe.contentWindow as any).__getHolodeckContext?.();
    return typeof ctx === "string" ? ctx : "";
  } catch {
    return "";
  }
}

function getBrowserInfo(): string {
  try {
    const ua = navigator.userAgent;
    let browser = "Unknown";
    if (ua.includes("Firefox/")) browser = "Firefox";
    else if (ua.includes("Edg/")) browser = "Edge";
    else if (ua.includes("Chrome/")) browser = "Chrome";
    else if (ua.includes("Safari/")) browser = "Safari";
    const w = window.innerWidth;
    const h = window.innerHeight;
    return `${browser} (${w}x${h})`;
  } catch {
    return "";
  }
}

export default function FeedbackTab() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [holodeckContext, setHolodeckContext] = useState("");
  const [isChromeFaded, setIsChromeFaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user);
    });
  }, []);

  // Listen for UI-fade signals from the holodeck iframe so the feedback
  // tab can hide while the user is interacting with the 3D viewport.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e?.data?.type === "holodeck-ui-fade") {
        setIsChromeFaded(!!e.data.faded);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // When panel opens, capture holodeck context
  useEffect(() => {
    if (isOpen) {
      setHolodeckContext(getHolodeckContext());
    }
  }, [isOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    setStatus("sending");

    try {
      const contextParts: string[] = [];
      if (holodeckContext) contextParts.push(holodeckContext);
      contextParts.push(`URL: ${window.location.pathname}`);
      const browserInfo = getBrowserInfo();
      if (browserInfo) contextParts.push(`Browser: ${browserInfo}`);

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          pageUrl: window.location.href,
          context: contextParts.join("\n"),
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

  // Hide on the password gate and auth screens — the feedback tab shouldn't
  // appear before the user is past the sign-in flow.
  if (pathname === "/gate" || pathname?.startsWith("/auth")) {
    return null;
  }

  return (
    <>
      {/* The vertical tab on the right edge */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed right-0 top-20 z-50
            bg-[#00D9D9] hover:bg-[#00B8B8] text-[#1A2332] text-sm font-medium
            px-2 py-3 rounded-l-lg shadow-lg
            transition-opacity duration-200
            ${isChromeFaded ? "opacity-0 pointer-events-none" : "opacity-100"}
            writing-vertical`}
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
          className="fixed top-20 right-0 left-0 sm:left-auto z-50
            w-auto sm:w-80 bg-[#1E2530] border border-[#2A3240] sm:rounded-l-xl shadow-2xl
            p-4 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold text-sm">
              Quick Note
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-[#5A6676] hover:text-white text-lg leading-none"
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
              className="w-full bg-[#2A3240] border border-[#2A3240] rounded-lg
                text-white text-sm p-2.5 placeholder-[#5A6676]
                focus:outline-none focus:ring-2 focus:ring-[#00D9D9] focus:border-transparent
                resize-none"
              autoFocus
            />

            {holodeckContext && (
              <p className="text-[#5A6676] text-xs truncate" title={holodeckContext}>
                {holodeckContext}
              </p>
            )}

            <div className="flex items-center justify-between">
              <span className="text-[#5A6676] text-xs">
                {message.length}/2000
              </span>

              <button
                type="submit"
                disabled={!message.trim() || status === "sending"}
                className="px-4 py-1.5 bg-[#00D9D9] hover:bg-[#00B8B8] disabled:bg-[#2A3240]
                  disabled:text-[#5A6676] text-[#1A2332] text-sm font-medium rounded-lg
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

          {!isLoggedIn && (
            <p className="text-[#5A6676] text-xs">
              Submitting as guest
            </p>
          )}
        </div>
      )}
    </>
  );
}

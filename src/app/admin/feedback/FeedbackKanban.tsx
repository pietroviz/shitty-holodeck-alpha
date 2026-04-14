"use client";

import { useState } from "react";
import Link from "next/link";
import type { Feedback, FeedbackStatus } from "@/lib/supabase/types";

type Column = { id: FeedbackStatus; label: string; accent: string };

const COLUMNS: Column[] = [
  { id: "todo",  label: "To Do",  accent: "#00D9D9" },
  { id: "doing", label: "Doing",  accent: "#F0A050" },
  { id: "done",  label: "Done",   accent: "#5CC085" },
];

function parseMessage(raw: string): { body: string; context: string | null } {
  const sep = "\n\n--- Context ---\n";
  const idx = raw.indexOf(sep);
  if (idx === -1) return { body: raw, context: null };
  return {
    body: raw.slice(0, idx).trim(),
    context: raw.slice(idx + sep.length).trim(),
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const opts: Intl.DateTimeFormatOptions = sameDay
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" };
  return d.toLocaleString("en-US", opts);
}

export default function FeedbackKanban({
  initialFeedback,
}: {
  initialFeedback: Feedback[];
}) {
  const [items, setItems] = useState<Feedback[]>(initialFeedback);
  const [pending, setPending] = useState<Set<string>>(new Set());

  async function moveItem(id: string, newStatus: FeedbackStatus) {
    // Optimistic update
    const prev = items;
    setItems((xs) =>
      xs.map((it) => (it.id === id ? { ...it, status: newStatus } : it))
    );
    setPending((s) => new Set(s).add(id));

    try {
      const res = await fetch("/api/admin/feedback/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      console.error("Failed to update status:", e);
      setItems(prev); // Revert
      alert("Failed to update status. Please try again.");
    } finally {
      setPending((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  const counts = {
    todo: items.filter((i) => i.status === "todo").length,
    doing: items.filter((i) => i.status === "doing").length,
    done: items.filter((i) => i.status === "done").length,
  };

  return (
    <div className="min-h-screen bg-[#1A2332] text-white">
      <header className="border-b border-[#2A3240] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Feedback Kanban</h1>
          <p className="text-xs text-[#8494A7] mt-0.5">
            {counts.todo} to do · {counts.doing} in progress · {counts.done} done
          </p>
        </div>
        <Link
          href="/"
          className="text-xs text-[#8494A7] hover:text-[#00D9D9] transition-colors"
        >
          ← Back to app
        </Link>
      </header>

      <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const colItems = items.filter((i) => i.status === col.id);
          return (
            <div
              key={col.id}
              className="bg-[#1E2530] rounded-xl border border-[#2A3240] flex flex-col"
            >
              <div
                className="px-4 py-3 border-b border-[#2A3240] flex items-center justify-between"
                style={{ borderTopColor: col.accent, borderTopWidth: 3 }}
              >
                <h2 className="font-semibold text-sm uppercase tracking-wide">
                  {col.label}
                </h2>
                <span className="text-xs text-[#8494A7] bg-[#2A3240] px-2 py-0.5 rounded-full">
                  {colItems.length}
                </span>
              </div>
              <div className="p-3 space-y-3 min-h-[200px]">
                {colItems.length === 0 && (
                  <div className="text-center text-xs text-[#5A6676] py-8">
                    No items
                  </div>
                )}
                {colItems.map((item) => {
                  const { body, context } = parseMessage(item.message);
                  const isPending = pending.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`bg-[#2A3240] rounded-lg p-3 space-y-2 transition-opacity ${
                        isPending ? "opacity-50" : ""
                      }`}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {body || "(no message)"}
                      </p>
                      {context && (
                        <div className="text-[11px] text-[#8494A7] bg-[#1A2332] rounded p-2 whitespace-pre-wrap font-mono">
                          {context}
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-[#5A6676]">
                          {formatDate(item.created_at)}
                        </span>
                        <div className="flex gap-1">
                          {COLUMNS.filter((c) => c.id !== item.status).map(
                            (c) => (
                              <button
                                key={c.id}
                                disabled={isPending}
                                onClick={() => moveItem(item.id, c.id)}
                                className="text-[10px] px-2 py-1 rounded bg-[#1A2332] hover:bg-[#1A2332]/60 text-[#8494A7] hover:text-white transition-colors disabled:opacity-50"
                                title={`Move to ${c.label}`}
                              >
                                → {c.label}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

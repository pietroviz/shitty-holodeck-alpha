"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import type { Feedback, FeedbackStatus } from "@/lib/supabase/types";

type Column = { id: FeedbackStatus; label: string; accent: string };

const COLUMNS: Column[] = [
  { id: "todo",  label: "To Do",  accent: "#00D9D9" },
  { id: "doing", label: "Doing",  accent: "#F0A050" },
  { id: "done",  label: "Done",   accent: "#5CC085" },
];

const CONTEXT_SEP = "\n\n--- Context ---\n";
const COLLAPSE_KEY = "feedbackKanbanCollapsed";

function parseMessage(raw: string): { body: string; context: string | null } {
  const idx = raw.indexOf(CONTEXT_SEP);
  if (idx === -1) return { body: raw, context: null };
  return {
    body: raw.slice(0, idx).trim(),
    context: raw.slice(idx + CONTEXT_SEP.length).trim(),
  };
}

// Derive a cluster name from the first line of the context field.
// "Environment Builder > Editing 'Default'"  →  "Environment Builder"
// "Explore (Home)"                           →  "Explore (Home)"
// null / empty                                →  "General"
function clusterOf(context: string | null): string {
  if (!context) return "General";
  const firstLine = context.split("\n")[0].trim();
  const beforeArrow = firstLine.split(/\s*>\s*/)[0].trim();
  return beforeArrow || "General";
}

function shortId(id: string): string {
  return id.slice(0, 8);
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
  const [pendingStatus, setPendingStatus] = useState<Set<string>>(new Set());
  const [pendingPriority, setPendingPriority] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  // Load collapsed groups from localStorage after mount (SSR-safe)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsedGroups(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, []);

  function persistCollapsed(next: Set<string>) {
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
    } catch { /* ignore */ }
  }

  function toggleExpanded(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleGroupCollapsed(key: string) {
    setCollapsedGroups((s) => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      persistCollapsed(next);
      return next;
    });
  }

  async function moveItem(id: string, newStatus: FeedbackStatus) {
    const prev = items;
    setItems((xs) =>
      xs.map((it) => (it.id === id ? { ...it, status: newStatus } : it))
    );
    setPendingStatus((s) => new Set(s).add(id));

    try {
      const res = await fetch("/api/admin/feedback/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      console.error("Failed to update status:", e);
      setItems(prev);
      alert("Failed to update status. Please try again.");
    } finally {
      setPendingStatus((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  async function setPriority(ids: string[], newValue: boolean) {
    const idSet = new Set(ids);
    const prev = items;
    setItems((xs) =>
      xs.map((it) => (idSet.has(it.id) ? { ...it, is_priority: newValue } : it))
    );
    setPendingPriority((s) => {
      const next = new Set(s);
      ids.forEach((id) => next.add(id));
      return next;
    });
    try {
      const res = await fetch("/api/admin/feedback/priority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, is_priority: newValue }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      console.error("Failed to update priority:", e);
      setItems(prev);
      alert("Failed to update priority. Please try again.");
    } finally {
      setPendingPriority((s) => {
        const next = new Set(s);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

  const filterLower = filter.toLowerCase().trim();
  const filtered = useMemo(() => {
    if (!filterLower) return items;
    return items.filter((it) => {
      if (it.id.toLowerCase().includes(filterLower)) return true;
      const { body, context } = parseMessage(it.message);
      if (body.toLowerCase().includes(filterLower)) return true;
      if (context && context.toLowerCase().includes(filterLower)) return true;
      if (clusterOf(context).toLowerCase().includes(filterLower)) return true;
      return false;
    });
  }, [items, filterLower]);

  const totalPriority = items.filter((i) => i.is_priority).length;
  const counts = {
    todo: items.filter((i) => i.status === "todo").length,
    doing: items.filter((i) => i.status === "doing").length,
    done: items.filter((i) => i.status === "done").length,
  };

  return (
    <div className="h-screen bg-[#1A2332] text-white flex flex-col overflow-hidden">
      <header className="border-b border-[#2A3240] px-4 py-3 flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div>
          <h1 className="text-lg font-bold leading-tight">Feedback Kanban</h1>
          <p className="text-[11px] text-[#8494A7] mt-0.5">
            {counts.todo} to do · {counts.doing} in progress · {counts.done} done
            {totalPriority > 0 && <span className="text-[#F0A050]"> · {totalPriority} priority</span>}
          </p>
        </div>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by text, cluster, or id..."
          className="flex-1 min-w-[200px] max-w-md bg-[#2A3240] border border-[#2A3240] rounded-md px-3 py-1.5 text-sm text-white placeholder-[#5A6676] focus:outline-none focus:ring-2 focus:ring-[#00D9D9] focus:border-transparent"
        />
        <Link
          href="/"
          className="text-xs text-[#8494A7] hover:text-[#00D9D9] transition-colors whitespace-nowrap"
        >
          ← Back to app
        </Link>
      </header>

      <div className="flex-1 min-h-0 p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        {COLUMNS.map((col) => {
          const colItems = filtered.filter((i) => i.status === col.id);

          // Group by cluster
          const groups = new Map<string, Feedback[]>();
          for (const it of colItems) {
            const { context } = parseMessage(it.message);
            const key = clusterOf(context);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(it);
          }
          // Sort each group: priority first, then newest first
          for (const arr of groups.values()) {
            arr.sort((a, b) => {
              if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
          }
          // Sort groups: those containing any priority first, then alphabetical
          const groupEntries = [...groups.entries()].sort((a, b) => {
            const aPri = a[1].some((i) => i.is_priority);
            const bPri = b[1].some((i) => i.is_priority);
            if (aPri !== bPri) return aPri ? -1 : 1;
            return a[0].localeCompare(b[0]);
          });

          return (
            <div
              key={col.id}
              className="bg-[#1E2530] rounded-xl border border-[#2A3240] flex flex-col min-h-0"
            >
              <div
                className="px-3 py-2 border-b border-[#2A3240] flex items-center justify-between shrink-0"
                style={{ borderTopColor: col.accent, borderTopWidth: 3 }}
              >
                <h2 className="font-semibold text-xs uppercase tracking-wide">
                  {col.label}
                </h2>
                <span className="text-[10px] text-[#8494A7] bg-[#2A3240] px-2 py-0.5 rounded-full">
                  {colItems.length}
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-3">
                {colItems.length === 0 && (
                  <div className="text-center text-xs text-[#5A6676] py-8">
                    No items
                  </div>
                )}
                {groupEntries.map(([clusterName, clusterItems]) => {
                  const groupKey = `${col.id}::${clusterName}`;
                  const isCollapsed = collapsedGroups.has(groupKey);
                  const allPriority = clusterItems.every((i) => i.is_priority);
                  const anyPriority = clusterItems.some((i) => i.is_priority);
                  const clusterPending = clusterItems.some((i) => pendingPriority.has(i.id));

                  return (
                    <div key={clusterName} className="space-y-1.5">
                      <div
                        className="flex items-center justify-between gap-1 px-1.5 py-1 rounded-md bg-[#1A2332]/60 sticky top-0 z-10 backdrop-blur-sm"
                      >
                        <button
                          onClick={() => toggleGroupCollapsed(groupKey)}
                          className="flex-1 text-left flex items-center gap-1.5 text-[11px] font-semibold text-[#C7D0DC] hover:text-white"
                          title={isCollapsed ? "Expand group" : "Collapse group"}
                        >
                          <span className="text-[#5A6676] text-[9px]">
                            {isCollapsed ? "▶" : "▼"}
                          </span>
                          <span className="uppercase tracking-wide truncate">{clusterName}</span>
                          <span className="text-[10px] font-normal text-[#8494A7]">({clusterItems.length})</span>
                        </button>
                        <button
                          onClick={() => {
                            const ids = clusterItems.map((i) => i.id);
                            setPriority(ids, !allPriority);
                          }}
                          disabled={clusterPending}
                          title={
                            allPriority
                              ? "Unflag all in this cluster"
                              : "Flag all in this cluster as priority"
                          }
                          className={`text-sm leading-none px-1 disabled:opacity-40 ${
                            allPriority
                              ? "text-[#F0A050]"
                              : anyPriority
                                ? "text-[#F0A050]/50"
                                : "text-[#5A6676] hover:text-[#F0A050]"
                          }`}
                        >
                          ★
                        </button>
                      </div>

                      {!isCollapsed && clusterItems.map((item) => {
                        const { body, context } = parseMessage(item.message);
                        const isPendingStatus = pendingStatus.has(item.id);
                        const isPendingPriority = pendingPriority.has(item.id);
                        const isExpanded = expanded.has(item.id);
                        return (
                          <div
                            key={item.id}
                            className={`bg-[#2A3240] rounded-md p-2 space-y-1.5 transition-opacity ${
                              isPendingStatus ? "opacity-50" : ""
                            } ${
                              item.is_priority ? "ring-1 ring-[#F0A050]/60" : ""
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setPriority([item.id], !item.is_priority)}
                                disabled={isPendingPriority}
                                title={item.is_priority ? "Unflag priority" : "Flag as priority"}
                                className={`text-sm leading-none disabled:opacity-40 ${
                                  item.is_priority
                                    ? "text-[#F0A050]"
                                    : "text-[#5A6676] hover:text-[#F0A050]"
                                }`}
                              >
                                ★
                              </button>
                              <code className="text-[10px] text-[#8494A7] font-mono">
                                {shortId(item.id)}
                              </code>
                              <span className="text-[10px] text-[#5A6676]">·</span>
                              <span className="text-[10px] text-[#5A6676]">
                                {formatDate(item.created_at)}
                              </span>
                              <div className="ml-auto flex gap-1">
                                {COLUMNS.filter((c) => c.id !== item.status).map(
                                  (c) => (
                                    <button
                                      key={c.id}
                                      disabled={isPendingStatus}
                                      onClick={() => moveItem(item.id, c.id)}
                                      className="text-[9px] px-1.5 py-0.5 rounded bg-[#1A2332] hover:bg-[#1A2332]/60 text-[#8494A7] hover:text-white transition-colors disabled:opacity-50"
                                      title={`Move to ${c.label}`}
                                    >
                                      → {c.label}
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => toggleExpanded(item.id)}
                              className="block w-full text-left text-[13px] leading-snug text-white hover:text-[#C7D0DC]"
                              title={isExpanded ? "Collapse" : "Expand"}
                            >
                              <p className={`whitespace-pre-wrap ${isExpanded ? "" : "line-clamp-2"}`}>
                                {body || "(no message)"}
                              </p>
                            </button>
                            {isExpanded && context && (
                              <div className="text-[10px] text-[#8494A7] bg-[#1A2332] rounded p-2 whitespace-pre-wrap font-mono">
                                {context}
                              </div>
                            )}
                          </div>
                        );
                      })}
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

import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Check auth — but don't reject guests
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const body = await request.json();
  const rawMessage = body.message?.trim();
  const pageUrl = body.pageUrl || null;
  const context = body.context?.trim() || null;

  if (!rawMessage) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  if (rawMessage.length > 2000) {
    return Response.json(
      { error: "Message too long (max 2000 chars)" },
      { status: 400 }
    );
  }

  // Build the stored message: append context if provided
  let message = rawMessage;
  if (context) {
    message = `${rawMessage}\n\n--- Context ---\n${context}`;
  }

  const insertData: { user_id: string | null; page_url: string | null; message: string } = {
    user_id: user?.id ?? null,
    page_url: pageUrl,
    message,
  };

  const { error } = await supabase.from("feedback").insert(insertData);

  if (error) {
    console.error("Feedback insert error:", error);
    // If RLS blocks guest inserts, return success silently
    if (!user && error.code === "42501") {
      return Response.json({ success: true, note: "guest feedback not stored (RLS)" });
    }
    return Response.json({ error: "Failed to save feedback" }, { status: 500 });
  }

  return Response.json({ success: true });
}

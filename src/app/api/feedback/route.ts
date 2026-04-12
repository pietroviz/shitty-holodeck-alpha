import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Check auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const message = body.message?.trim();
  const pageUrl = body.pageUrl || null;

  if (!message) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  if (message.length > 2000) {
    return Response.json(
      { error: "Message too long (max 2000 chars)" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    page_url: pageUrl,
    message,
  });

  if (error) {
    console.error("Feedback insert error:", error);
    return Response.json({ error: "Failed to save feedback" }, { status: 500 });
  }

  return Response.json({ success: true });
}

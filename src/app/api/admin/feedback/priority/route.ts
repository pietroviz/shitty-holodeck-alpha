import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

const ADMIN_EMAIL = "pbgagliano@gmail.com";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { ids, is_priority } = body;

  if (!Array.isArray(ids) || ids.length === 0 || ids.some((x) => typeof x !== "string")) {
    return Response.json({ error: "ids must be a non-empty string[]" }, { status: 400 });
  }

  if (typeof is_priority !== "boolean") {
    return Response.json({ error: "is_priority must be boolean" }, { status: 400 });
  }

  const { error } = await supabase
    .from("feedback")
    .update({ is_priority })
    .in("id", ids);

  if (error) {
    console.error("Feedback priority update error:", error);
    return Response.json({ error: "Failed to update priority" }, { status: 500 });
  }

  return Response.json({ success: true });
}

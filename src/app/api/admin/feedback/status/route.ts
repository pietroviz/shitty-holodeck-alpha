import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

const ADMIN_EMAIL = "pbgagliano@gmail.com";
const VALID_STATUSES = ["todo", "doing", "done"] as const;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, status } = body;

  if (!id || typeof id !== "string") {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  if (!VALID_STATUSES.includes(status)) {
    return Response.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("feedback")
    .update({ status })
    .eq("id", id);

  if (error) {
    console.error("Feedback status update error:", error);
    return Response.json({ error: "Failed to update status" }, { status: 500 });
  }

  return Response.json({ success: true });
}

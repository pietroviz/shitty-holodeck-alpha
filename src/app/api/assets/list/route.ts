import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_TYPES = new Set([
  "character", "environment", "music", "voice",
  "object", "image", "story", "simulation",
]);

// GET /api/assets/list?type=character
// Returns the signed-in user's assets of the given type, newest-first.
// Returns 401 if the user is not signed in.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get("type");
  if (!type || !ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("user_assets")
    .select("*")
    .eq("user_id", user.id)
    .eq("type", type)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[assets/list]", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // Reshape DB row → in-browser asset shape that db.js expects.
  const assets = (data || []).map(rowToAsset);
  return NextResponse.json({ assets });
}

function rowToAsset(row: Record<string, unknown>) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    tags: row.tags ?? [],
    meta: row.meta ?? {},
    payload: row.payload ?? {},
    refs: row.refs ?? [],
  };
}

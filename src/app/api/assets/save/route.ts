import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_TYPES = new Set([
  "character", "environment", "music", "voice",
  "object", "image", "story", "simulation",
]);

// POST /api/assets/save
// Body: { id, type, name, tags?, meta?, payload?, refs? }
// Upserts the asset for the signed-in user. id is the asset's own id
// (e.g. "char_abc123"); the (user_id, id) pair is the DB primary key.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : null;
  const type = typeof body.type === "string" ? body.type : null;
  const name = typeof body.name === "string" ? body.name : null;

  if (!id || !type || !name) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }

  const row = {
    id,
    user_id: user.id,
    type,
    name,
    tags:    body.tags    ?? [],
    meta:    body.meta    ?? {},
    payload: body.payload ?? {},
    refs:    body.refs    ?? [],
  };

  const { error } = await supabase
    .from("user_assets")
    .upsert(row, { onConflict: "user_id,id" });

  if (error) {
    console.error("[assets/save]", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ success: true, id });
}

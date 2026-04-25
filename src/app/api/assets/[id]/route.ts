import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/assets/:id — fetch a single asset for the signed-in user.
// Returns 404 if the asset doesn't exist (or belongs to another user;
// RLS makes those indistinguishable from the client side, which is fine).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const { id } = await params;
  const { data, error } = await supabase
    .from("user_assets")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[assets/get]", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    asset: {
      id:      data.id,
      type:    data.type,
      name:    data.name,
      tags:    data.tags    ?? [],
      meta:    data.meta    ?? {},
      payload: data.payload ?? {},
      refs:    data.refs    ?? [],
    },
  });
}

// DELETE /api/assets/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const { id } = await params;
  const { error } = await supabase
    .from("user_assets")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id);

  if (error) {
    console.error("[assets/delete]", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

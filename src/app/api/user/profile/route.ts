import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ authenticated: false, guest: true });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, full_name, email")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    authenticated: true,
    guest: false,
    user: {
      id: user.id,
      email: user.email,
      displayName: profile?.full_name || profile?.display_name || user.email,
      username: profile?.username || null,
      fullName: profile?.full_name || null,
    },
  });
}

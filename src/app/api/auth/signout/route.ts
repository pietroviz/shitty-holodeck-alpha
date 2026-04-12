import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const { origin } = new URL(request.url);
  // Redirect to home page — they'll still have the site_access cookie
  // so they won't hit the gate again
  return NextResponse.redirect(`${origin}/`, {
    status: 302,
  });
}

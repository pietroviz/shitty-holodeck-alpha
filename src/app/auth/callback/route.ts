import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if there's a guest session to link
      const cookieStore = await cookies();
      const guestId = cookieStore.get("guest_id")?.value;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (guestId && user) {
        // Link guest data to the newly authenticated user
        await supabase
          .from("simulation_runs")
          .update({ user_id: user.id, guest_id: null })
          .eq("guest_id", guestId);

        // Clear the guest cookie
        cookieStore.set("guest_id", "", { maxAge: 0, path: "/" });
      }

      // Check if user needs to complete account setup
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();

        if (!profile?.username) {
          // New user — send them to account setup
          return NextResponse.redirect(`${origin}/auth/setup`);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(
    `${origin}/auth/login?error=auth_callback_error`
  );
}

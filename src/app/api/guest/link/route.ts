import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/guest/link
// Called after a guest user signs up to link their guest session data
// to their new authenticated account
export async function POST(request: Request) {
  const { guestId } = await request.json();

  if (!guestId) {
    return NextResponse.json(
      { error: "Missing guestId" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  // Update any simulation_runs that were saved with this guest_id
  // to point to the real user
  const { error } = await supabase
    .from("simulation_runs")
    .update({ user_id: user.id, guest_id: null })
    .eq("guest_id", guestId);

  if (error) {
    console.error("Failed to link guest data:", error);
    return NextResponse.json(
      { error: "Failed to link data" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, linked_to: user.id });
}

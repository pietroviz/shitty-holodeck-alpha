import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Feedback } from "@/lib/supabase/types";
import FeedbackKanban from "./FeedbackKanban";

const ADMIN_EMAIL = "pbgagliano@gmail.com";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Gate: must be logged in as admin
  if (!user) {
    redirect("/auth/login");
  }
  if (user.email !== ADMIN_EMAIL) {
    redirect("/");
  }

  const { data: feedback, error } = await supabase
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="min-h-screen bg-[#1A2332] text-white p-8">
        <h1 className="text-2xl font-bold mb-4">Admin / Feedback</h1>
        <p className="text-red-400">Failed to load feedback: {error.message}</p>
      </div>
    );
  }

  return <FeedbackKanban initialFeedback={(feedback as Feedback[]) || []} />;
}

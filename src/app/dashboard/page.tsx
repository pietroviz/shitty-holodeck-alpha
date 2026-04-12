import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Fetch profile for display name
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, full_name")
    .eq("id", user.id)
    .single();

  // If no username set, redirect to setup
  if (!profile?.username) {
    redirect("/auth/setup");
  }

  const displayName = profile?.full_name || profile?.display_name || user.email;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="text-xl font-bold text-gray-900 hover:text-gray-700 transition-colors">
            Shitty Holodeck (Alpha)
          </Link>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{displayName}</p>
              {profile?.username && (
                <p className="text-xs text-gray-500">@{profile.username}</p>
              )}
            </div>
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Your Experiences
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Placeholder cards - replace with your actual simulators */}
          <ExperienceCard
            title="Experience 1"
            description="Drop your first experience here"
            href="/simulators/example"
            status="placeholder"
          />
          <ExperienceCard
            title="Experience 2"
            description="Drop your second experience here"
            href="/simulators/example"
            status="placeholder"
          />
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex items-center justify-center text-gray-400 hover:text-gray-500 hover:border-gray-400 transition-colors cursor-pointer">
            <span className="text-lg">+ Add Experience</span>
          </div>
        </div>
      </main>
    </div>
  );
}

function ExperienceCard({
  title,
  description,
  href,
  status,
}: {
  title: string;
  description: string;
  href: string;
  status: "live" | "draft" | "placeholder";
}) {
  const statusColors = {
    live: "bg-green-100 text-green-800",
    draft: "bg-yellow-100 text-yellow-800",
    placeholder: "bg-gray-100 text-gray-500",
  };

  return (
    <Link
      href={href}
      className="block bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
    >
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[status]}`}
        >
          {status}
        </span>
      </div>
      <p className="text-gray-600 text-sm">{description}</p>
    </Link>
  );
}

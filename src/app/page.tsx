import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center space-y-6 max-w-2xl px-4">
        <h1 className="text-5xl font-bold text-gray-900">
          Pietro&apos;s Simulator Lab
        </h1>
        <p className="text-xl text-gray-600">
          A collection of interactive simulators and tools.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          {user ? (
            <Link
              href="/dashboard"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-center"
            >
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-center"
              >
                Sign in with Email
              </Link>
              <Link
                href="/guest"
                className="px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-lg border border-gray-300 transition-colors text-center"
              >
                Continue as Guest
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

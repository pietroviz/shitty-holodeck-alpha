import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow access to the gate page, its API, auth routes, and static assets
  if (
    pathname === "/gate" ||
    pathname === "/api/gate" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    // Still run session refresh for auth routes so cookies stay fresh
    if (pathname.startsWith("/auth/") || pathname.startsWith("/api/auth/")) {
      return await updateSession(request);
    }
    return NextResponse.next();
  }

  // Check for site-wide password gate
  const siteAccess = request.cookies.get("site_access")?.value;
  if (siteAccess !== "granted") {
    return NextResponse.redirect(new URL("/gate", request.url));
  }

  // If past the gate, run Supabase session refresh
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

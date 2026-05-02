import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Dev-only: list / serve the MixamoForSimbox FBX files that live outside `public/`
 * so the in-browser animation converter (/holodeck/animation-converter.html)
 * can read them without us copying them into `public/`.
 *
 *   GET /api/admin/fbx-animations              → JSON list of available files
 *   GET /api/admin/fbx-animations?name=X.fbx   → raw FBX bytes
 *
 * Returns 403 in production. The source FBX files are reference assets that
 * stay in _refs/ and never deploy to Vercel.
 */

const FBX_DIR = path.join(
  process.cwd(),
  "_refs",
  "_FBX-Animations",
  "MixamoForSimbox"
);

// Strict whitelist: only filenames that came from a directory listing of FBX_DIR.
// This is the safety net against `?name=../../etc/passwd` style traversal.
async function isAllowedFile(name: string): Promise<boolean> {
  if (!name.toLowerCase().endsWith(".fbx")) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  try {
    const entries = await fs.readdir(FBX_DIR);
    return entries.includes(name);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "dev only" }, { status: 403 });
  }

  const name = request.nextUrl.searchParams.get("name");

  // List mode
  if (!name) {
    try {
      const entries = await fs.readdir(FBX_DIR);
      const files = entries
        .filter((f) => f.toLowerCase().endsWith(".fbx"))
        .sort();
      return Response.json({ ok: true, dir: FBX_DIR, files });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json(
        { error: "could not read fbx dir", detail: msg, dir: FBX_DIR },
        { status: 500 }
      );
    }
  }

  // Serve mode
  if (!(await isAllowedFile(name))) {
    return Response.json({ error: "file not allowed" }, { status: 400 });
  }

  try {
    const buf = await fs.readFile(path.join(FBX_DIR, name));
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buf.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "read failed", detail: msg }, { status: 500 });
  }
}

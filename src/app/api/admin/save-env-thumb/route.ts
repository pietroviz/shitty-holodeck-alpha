import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Dev-only: write a captured env thumbnail JPEG to
 * public/holodeck/thumbnails/{envId}.jpg. Used by the one-shot
 * /holodeck/env-thumb-farm.html page to batch-refresh stock thumbnails
 * from the real 3D preview. 403 in production — Vercel's FS is read-only,
 * and we don't want a public write endpoint anyway.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "dev only" }, { status: 403 });
  }

  let body: { envId?: string; dataURL?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const envId = body.envId;
  const dataURL = body.dataURL;
  if (!envId || !dataURL) {
    return Response.json({ error: "envId + dataURL required" }, { status: 400 });
  }

  // Only allow safe env ids (no traversal, must start with env_)
  if (!/^env_[a-z0-9_]+$/i.test(envId)) {
    return Response.json({ error: "invalid envId" }, { status: 400 });
  }

  const m = /^data:image\/jpeg;base64,(.+)$/.exec(dataURL);
  if (!m) {
    return Response.json({ error: "expected image/jpeg data URL" }, { status: 400 });
  }

  const buf = Buffer.from(m[1], "base64");
  const outDir = path.join(process.cwd(), "public", "holodeck", "thumbnails");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${envId}.jpg`);
  await fs.writeFile(outPath, buf);

  return Response.json({ ok: true, bytes: buf.length });
}

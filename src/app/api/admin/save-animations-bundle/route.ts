import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Dev-only: write a JSON animation bundle produced by the in-browser
 * converter (/holodeck/animation-converter.html) to
 * public/holodeck/global_assets/animations/{name}.json.
 *
 * The bundle for ~30 Mixamo clips comes out to ~15 MB, which exceeds
 * Next.js's default request body limit. So we accept it in chunks via
 * three actions:
 *
 *   { action: "init",     name, meta }       — wipes staging, writes meta
 *   { action: "append",   name, animation }  — appends one animation as JSONL
 *   { action: "finalize", name }              — assembles final bundle
 *
 * Staging lives in `<animations>/.staging-<name>/` and is removed on
 * successful finalize.
 *
 * 403 in production — Vercel's filesystem is read-only and we don't
 * want a public write endpoint anyway.
 */

const SAFE_NAME = /^[a-z0-9_-]+$/i;

function paths(name: string) {
  const outDir = path.join(
    process.cwd(),
    "public",
    "holodeck",
    "global_assets",
    "animations"
  );
  const stagingDir = path.join(outDir, `.staging-${name}`);
  return {
    outDir,
    finalPath: path.join(outDir, `${name}.json`),
    stagingDir,
    metaPath: path.join(stagingDir, "meta.json"),
    animsPath: path.join(stagingDir, "animations.jsonl"),
  };
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "dev only" }, { status: 403 });
  }

  let body: {
    action?: "init" | "append" | "finalize";
    name?: string;
    meta?: Record<string, unknown>;
    animation?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const name = body.name ?? "mixamo-simbox";
  if (!SAFE_NAME.test(name)) {
    return Response.json({ error: "invalid name" }, { status: 400 });
  }

  const p = paths(name);

  try {
    if (body.action === "init") {
      if (!body.meta || typeof body.meta !== "object") {
        return Response.json({ error: "meta required" }, { status: 400 });
      }
      // Wipe + recreate staging
      await fs.rm(p.stagingDir, { recursive: true, force: true });
      await fs.mkdir(p.stagingDir, { recursive: true });
      await fs.writeFile(p.metaPath, JSON.stringify(body.meta), "utf8");
      await fs.writeFile(p.animsPath, "", "utf8");
      return Response.json({ ok: true });
    }

    if (body.action === "append") {
      if (!body.animation || typeof body.animation !== "object") {
        return Response.json({ error: "animation required" }, { status: 400 });
      }
      // One animation per line, JSONL — easy to stream-read at finalize.
      await fs.appendFile(
        p.animsPath,
        JSON.stringify(body.animation) + "\n",
        "utf8"
      );
      return Response.json({ ok: true });
    }

    if (body.action === "finalize") {
      const metaRaw = await fs.readFile(p.metaPath, "utf8");
      const meta = JSON.parse(metaRaw) as Record<string, unknown>;
      const animsRaw = await fs.readFile(p.animsPath, "utf8");
      const animations = animsRaw
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line));

      const bundle = { ...meta, animations };
      const json = JSON.stringify(bundle, null, 2);
      await fs.mkdir(p.outDir, { recursive: true });
      await fs.writeFile(p.finalPath, json, "utf8");

      // Clean up staging
      await fs.rm(p.stagingDir, { recursive: true, force: true });

      return Response.json({
        ok: true,
        path: `public/holodeck/global_assets/animations/${name}.json`,
        bytes: Buffer.byteLength(json, "utf8"),
        animationCount: animations.length,
      });
    }

    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "save failed", detail: msg }, { status: 500 });
  }
}

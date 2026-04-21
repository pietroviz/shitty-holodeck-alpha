#!/usr/bin/env node
// List / update feedback rows from Supabase.
//
//   node scripts/list-feedback.js                  # open items (todo + doing), newest first
//   node scripts/list-feedback.js --status todo    # only todo
//   node scripts/list-feedback.js --status all     # everything
//   node scripts/list-feedback.js --json           # machine-readable
//   node scripts/list-feedback.js --set <id> doing # update status (id may be short prefix)

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const ENV_PATH = path.join(__dirname, "..", ".env.local");
const CONTEXT_SEP = "\n\n--- Context ---\n";

function loadEnv(file) {
  if (!fs.existsSync(file)) {
    console.error(`Missing ${file}. Run ./scripts/bootstrap.sh first.`);
    process.exit(1);
  }
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function parseArgs(argv) {
  const args = { status: "open", json: false, set: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--status") args.status = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--set") args.set = { id: argv[++i], status: argv[++i] };
    else if (a === "-h" || a === "--help") {
      console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 9).map(l => l.replace(/^\/\/ ?/, "")).join("\n"));
      process.exit(0);
    }
  }
  return args;
}

function parseMessage(raw) {
  const idx = raw.indexOf(CONTEXT_SEP);
  if (idx === -1) return { body: raw, context: null };
  return { body: raw.slice(0, idx).trim(), context: raw.slice(idx + CONTEXT_SEP.length).trim() };
}

function short(id) {
  return id.slice(0, 8);
}

function formatRow(row) {
  const { body, context } = parseMessage(row.message);
  const when = new Date(row.created_at).toISOString().replace("T", " ").slice(0, 16);
  const lines = [
    `[${row.status.toUpperCase()}] ${short(row.id)}  ${when} UTC`,
    row.page_url ? `  page: ${row.page_url}` : null,
    `  ${body.split("\n").join("\n  ")}`,
    context ? `  context: ${context.split("\n").join("\n    ")}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

async function resolveId(supabase, prefix) {
  if (/^[0-9a-f-]{36}$/i.test(prefix)) return prefix;
  const { data, error } = await supabase.from("feedback").select("id");
  if (error) throw error;
  const matches = (data || []).filter((r) => r.id.startsWith(prefix.toLowerCase()));
  if (matches.length === 0) throw new Error(`No feedback id starts with "${prefix}"`);
  if (matches.length > 1) throw new Error(`Ambiguous prefix "${prefix}" matches ${matches.length} rows`);
  return matches[0].id;
}

async function main() {
  loadEnv(ENV_PATH);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const args = parseArgs(process.argv.slice(2));

  if (args.set) {
    const VALID = ["todo", "doing", "done"];
    if (!VALID.includes(args.set.status)) {
      console.error(`status must be one of: ${VALID.join(", ")}`);
      process.exit(1);
    }
    const fullId = await resolveId(supabase, args.set.id);
    const { error } = await supabase.from("feedback").update({ status: args.set.status }).eq("id", fullId);
    if (error) { console.error(error.message); process.exit(1); }
    console.log(`✓ ${short(fullId)} → ${args.set.status}`);
    return;
  }

  let query = supabase.from("feedback").select("*").order("created_at", { ascending: false });
  if (args.status === "open") query = query.in("status", ["todo", "doing"]);
  else if (args.status !== "all") query = query.eq("status", args.status);

  const { data, error } = await query;
  if (error) { console.error(error.message); process.exit(1); }

  if (args.json) { console.log(JSON.stringify(data, null, 2)); return; }

  if (!data || data.length === 0) {
    console.log(`No feedback rows (filter: ${args.status}).`);
    return;
  }

  console.log(`${data.length} feedback item(s) — filter: ${args.status}\n`);
  for (const row of data) {
    console.log(formatRow(row));
    console.log("");
  }
  console.log(`Start one:  node scripts/list-feedback.js --set <id-prefix> doing`);
  console.log(`Finish one: node scripts/list-feedback.js --set <id-prefix> done`);
}

main().catch((e) => { console.error(e); process.exit(1); });

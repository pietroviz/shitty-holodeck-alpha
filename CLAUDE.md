@AGENTS.md
@PROJECT_GUIDE.md

# Feedback workflow

This project collects in-app feedback into a Supabase `feedback` table, surfaced as a Kanban at `/admin/feedback` (admin: `pbgagliano@gmail.com`). When the user asks to "address feedback" or similar:

1. Ensure credentials are linked: `./scripts/bootstrap.sh` (idempotent; symlinks `~/.config/shitty-holodeck/.env.local` into the repo).
2. Load the open queue: `node scripts/list-feedback.js` (shows `todo` + `doing`, newest first).
3. Mark an item `doing` before starting work: `node scripts/list-feedback.js --set <id-prefix> doing`.
4. Mark `done` after the fix lands: `node scripts/list-feedback.js --set <id-prefix> done`.

The Kanban UI is the source of truth for status; the script reads/writes the same `status` column, so updates show up there immediately. Do not track feedback progress in todos, memory, or notes — use the DB.

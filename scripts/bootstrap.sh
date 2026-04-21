#!/usr/bin/env bash
# Bootstrap local dev: link .env.local from the canonical stash at
# ~/.config/shitty-holodeck/.env.local so credentials survive re-clones.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CANONICAL_DIR="$HOME/.config/shitty-holodeck"
CANONICAL="$CANONICAL_DIR/.env.local"
TARGET="$REPO_ROOT/.env.local"

if [ -e "$TARGET" ] && [ ! -L "$TARGET" ]; then
  echo "✓ .env.local already exists (regular file — leaving untouched)"
  exit 0
fi

if [ -L "$TARGET" ]; then
  if [ -e "$TARGET" ]; then
    echo "✓ .env.local already symlinked → $(readlink "$TARGET")"
    exit 0
  else
    echo "! .env.local symlink is broken — removing"
    rm "$TARGET"
  fi
fi

if [ ! -f "$CANONICAL" ]; then
  mkdir -p "$CANONICAL_DIR"
  cp "$REPO_ROOT/.env.local.example" "$CANONICAL"
  echo "! No canonical .env.local found. Created template at:"
  echo "    $CANONICAL"
  echo ""
  echo "  Edit it with your Supabase URL, anon key, and SERVICE_ROLE_KEY"
  echo "  (service role is required for scripts/list-feedback.js), then re-run this script."
  exit 1
fi

ln -s "$CANONICAL" "$TARGET"
echo "✓ Linked .env.local → $CANONICAL"

if [ ! -d "$REPO_ROOT/node_modules" ]; then
  echo "! node_modules missing — running npm install..."
  (cd "$REPO_ROOT" && npm install)
fi

echo ""
echo "Ready. Next: node scripts/list-feedback.js"

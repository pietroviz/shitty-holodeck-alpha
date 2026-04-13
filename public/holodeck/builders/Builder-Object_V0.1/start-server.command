#!/bin/bash
# PropBox V1 — Local Dev Server
# Double-click this file in Finder to start the server.
# Uses port 5501 to avoid conflicts with ImageBox (5500).
cd "$(dirname "$0")"
echo "  ✦ PropBox V1 — Starting server..."
echo "    http://localhost:5501"
echo "    http://localhost:5501/batch-import.html  (batch import)"
echo ""
echo "  Press Ctrl+C to stop."
npx serve . -p 5501

#!/bin/bash
# MusicBox — Local Development Server
# Double-click this file to start the server, then open http://localhost:8080

cd "$(dirname "$0")"
echo ""
echo "  ♪  MusicBox — Simbox Music Theme Builder"
echo "  ─────────────────────────────────────────"
echo "  Server running at: http://localhost:8080"
echo "  Press Ctrl+C to stop"
echo ""
python3 -m http.server 8080

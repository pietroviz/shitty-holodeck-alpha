#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "  ✦ ImageBox V2 — Starting server..."
echo ""
npx serve . -p 5500

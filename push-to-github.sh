#!/bin/bash
# Run this script once from your project folder to push to GitHub
# Usage: Open Terminal, cd to your project folder, then run: bash push-to-github.sh

echo "🚀 Pushing your project to GitHub..."
echo ""

# Add the remote (ignore error if already exists)
git remote add origin https://github.com/pietroviz/shitty-holodeck-alpha.git 2>/dev/null

# Stage all files
git add .

# Create the initial commit
git commit -m "Initial scaffold: Next.js + Supabase + Auth + Dashboard"

# Force push to overwrite the GitHub-created initial commit
git push -u origin main --force

echo ""
echo "✅ Done! Your code is now on GitHub."
echo "🔗 https://github.com/pietroviz/shitty-holodeck-alpha"

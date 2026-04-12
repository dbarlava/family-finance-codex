#!/bin/bash
# Run this once to push the invite email changes to GitHub
cd "$(dirname "$0")"
rm -f .git/index.lock
git config user.email "dnbrlv45@gmail.com"
git config user.name "Dylan"
git add app/api/users/route.ts app/users/page.tsx app/accept-invite/ .env.local.example
git commit -m "Add invite emails via Resend and accept-invite onboarding page"
git push origin main
echo "Done! You can delete this file."

#!/bin/bash
# Auto-push daily reports to GitHub
# Run via cron: 0 2 * * * /www/ai-agent/scripts/auto-push.sh >> /www/ai-agent/data/push.log 2>&1

cd /www/ai-agent
git add data/daily/ data/visitors.json 2>/dev/null
git add index.html dashboard.html 2>/dev/null
if git diff --cached --quiet; then
  echo "$(date): No changes to push"
  exit 0
fi
git commit -m "Auto: daily report update $(date +%Y-%m-%d)"
git push origin main 2>&1
echo "$(date): Pushed successfully"

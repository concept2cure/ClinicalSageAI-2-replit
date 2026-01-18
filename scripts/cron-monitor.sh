#!/bin/bash
# Add to crontab: */5 * * * * cd /app && node scripts/monitor-regulatory-health.js
set -e
cd /workspaces/ClinicalSageAI-2-replit
node scripts/monitor-regulatory-health.js

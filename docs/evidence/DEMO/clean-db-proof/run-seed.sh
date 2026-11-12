#!/usr/bin/env bash
# usage: run-seed.sh <pack> <label>   — runs the demo seed the way post-start.sh does, against :5100
SC=/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/0d57ee1e-feb7-587e-9df6-b4664672a1d4/scratchpad/clean-db
EV=/home/user/ClinicalSageAI-2-replit/docs/evidence/DEMO/clean-db-proof
pack="$1"; label="$2"
cd /home/user/ClinicalSageAI-2-replit || exit 99
email="$(sed -n 's/^DEMO_SEED_EMAIL=//p' "$SC/state/app.env")"
start=$(date -u +%FT%TZ)
env C2C_ENVIRONMENT=development C2C_CODESPACE=1 RLS_ENFORCE=on C2C_AGENT_MODE=active NODE_ENV=development \
  DEMO_MANIFEST_ROOT="$SC/manifests" \
  node scripts/demo/launch-demo/seed.mjs --pack "$pack" --base-url http://127.0.0.1:5100 --email "$email" \
  > "$EV/$label.log" 2>&1
rc=$?
end=$(date -u +%FT%TZ)
mkdir -p "$SC/manifests-snap/$label"; cp -r "$SC/manifests/." "$SC/manifests-snap/$label/" 2>/dev/null
echo "$label pack=$pack exit=$rc start=$start end=$end" | tee -a "$EV/exit-codes.txt"

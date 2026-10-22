#!/bin/bash
# HT-01 red/green on a database provisioned from empty, through the running app.
# Red: trunk's seed-admin.mjs → no workspace → POST /api/c2c/projects refused.
# Green: this change's seed-admin.mjs → marked workspace → the same POST creates the program.
set -u
# Usage: bash fresh-database-red-green.sh   (needs a local PostgreSQL 16 with pgvector;
#        OWNER_PG=postgres://user:pw@127.0.0.1:5432 overrides the owner connection)
S=${OUT:-$(mktemp -d)}
R=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
DB=c2c_ht01
OWNER=${OWNER_PG:-postgres://postgres:postgres@127.0.0.1:5432}/$DB
PW=$(node -e 'console.log(require("crypto").randomBytes(18).toString("hex"))')
APP=postgres://app_service:$PW@127.0.0.1:5432/$DB
L=$S/ht01-boot.log
PORT=5057
EMAIL=tester@example.com
PASS='Correct-Horse-Battery-9'
q() { psql "$OWNER" -Atc "$1"; }
ws() { q "SELECT count(*)||' workspace(s); marked own: '||coalesce(bool_or((metadata->>'defaultForOrganization')='true')::text,'none') FROM client_workspaces w JOIN organizations o ON o.id=w.organization_id WHERE o.slug='concept2cure'"; }

echo "== head: $(git -C $R rev-parse --short HEAD) (+ working tree: $(git -C $R status --short | wc -l) changed files)"
dropdb -h 127.0.0.1 -U postgres --if-exists $DB && createdb -h 127.0.0.1 -U postgres $DB
cd $R
T0=$(date +%s)
env DATABASE_OWNER_URL=$OWNER APP_SERVICE_DB_PASSWORD=$PW APP_DATABASE_URL=$APP npm run db:provision > $S/ht01-provision.log 2>&1 || { echo "PROVISION FAILED"; tail -30 $S/ht01-provision.log; exit 1; }
echo "== provisioned from empty in $(( $(date +%s) - T0 ))s: $(grep -oE '[0-9]+/[0-9]+ migration' $S/ht01-provision.log | tail -1)"

echo "== RED: trunk's scripts/seed-admin.mjs"
git show HEAD:scripts/seed-admin.mjs > scripts/.seed-admin-trunk.mjs
env -i PATH="$PATH" HOME="$HOME" DATABASE_URL=$OWNER ADMIN_EMAIL=$EMAIL ADMIN_PASSWORD=$PASS node scripts/.seed-admin-trunk.mjs 2>&1 | grep -E 'upserted|rror' | head -3
rm -f scripts/.seed-admin-trunk.mjs
echo "   concept2cure: $(ws)"

env -i PATH="$PATH" HOME="$HOME" NODE_ENV=development PORT=$PORT RLS_ENFORCE=on DATABASE_URL=$APP \
  JWT_SECRET=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))') \
  timeout 600 ./node_modules/.bin/tsx server/index.ts > $L 2>&1 &
for i in $(seq 1 150); do curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/healthz 2>/dev/null | grep -q 200 && break; sleep 2; done
echo "   app up (healthz 200) after $(( $(date +%s) - T0 ))s total"

before=$(grep -c 'Dev OTP code' $L)
LR=$(curl -s -X POST http://127.0.0.1:$PORT/api/auth/login -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOK=$(echo "$LR" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s); console.log(j.mfaRequired===false?(j.accessToken||""):"")}catch{console.log("")}})')
if [ -n "$TOK" ]; then
  echo "   signed in (login issued the session; no second factor asked of this account in development)"
else
  CH=$(echo "$LR" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).challengeId||"")}catch{console.log("")}})')
  for i in $(seq 1 20); do [ "$(grep -c 'Dev OTP code' $L)" -gt "$before" ] && break; sleep 0.5; done
  CODE=$(grep 'Dev OTP code' $L | tail -1 | grep -oE '"code":"[0-9]+"' | grep -oE '[0-9]+')
  TOK=$(curl -s -X POST http://127.0.0.1:$PORT/api/auth/mfa/verify -H 'content-type: application/json' -d "{\"challengeId\":\"$CH\",\"code\":\"$CODE\",\"method\":\"email\"}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s); console.log(j.accessToken||j.token||(j.data&&j.data.accessToken)||"")}catch{console.log("")}})')
  [ -n "$TOK" ] && echo "   signed in with the emailed second factor" || echo "   SIGN-IN FAILED: $(echo "$LR" | head -c 200)"
fi
create() {
  curl -s -o $S/ht01-create-$1.json -w '%{http_code}' -X POST http://127.0.0.1:$PORT/api/c2c/projects -H "Authorization: Bearer $TOK" -H 'content-type: application/json' \
    -d "{\"name\":\"HT-01 $1\",\"productName\":\"HTX-$1\",\"programType\":\"ind\",\"productType\":\"drug\",\"primaryAgency\":\"FDA\",\"indication\":\"test indication\"}"
}
code=$(create red); echo "   POST /api/c2c/projects → HTTP $code: $(head -c 240 $S/ht01-create-red.json)"

echo "== GREEN: this change's scripts/seed-admin.mjs (same database, same running app)"
env -i PATH="$PATH" HOME="$HOME" DATABASE_URL=$OWNER ADMIN_EMAIL=$EMAIL ADMIN_PASSWORD=$PASS node scripts/seed-admin.mjs 2>&1 | grep -E 'upserted|Workspace|rror' | head -3
echo "   concept2cure: $(ws)"
code=$(create green); echo "   POST /api/c2c/projects → HTTP $code: $(head -c 240 $S/ht01-create-green.json)"
echo "   anchored projects in the org: $(q "SELECT count(*) FROM projects p JOIN organizations o ON o.id=p.organization_id WHERE o.slug='concept2cure'")"

echo "== GREEN as the runtime role (scripts/dev/up.mjs seeds as app_service): second run is a no-op"
env -i PATH="$PATH" HOME="$HOME" DATABASE_URL=$APP ADMIN_EMAIL=$EMAIL ADMIN_PASSWORD=$PASS node scripts/seed-admin.mjs 2>&1 | grep -E 'Workspace|rror' | head -3
echo "   concept2cure: $(ws)"
pkill -f "PORT=$PORT" 2>/dev/null; pkill -f "tsx server/index.ts" 2>/dev/null; true

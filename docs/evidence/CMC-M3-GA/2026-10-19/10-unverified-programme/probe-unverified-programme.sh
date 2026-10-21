#!/usr/bin/env bash
# Does a CMC route judge, derive from, or file a record under a programme this
# organisation does not hold?
#
# Four ids, each a different way of being wrong: a well-formed uuid naming no
# programme, another organisation's programme, a string that is not a uuid, and
# — as the control — this organisation's own programme, which must still work.
set -uo pipefail
BASE="${BASE:-http://127.0.0.1:5000}"
TOKEN=$(curl -sS -X POST "$BASE/api/auth/dev-login" -H 'Content-Type: application/json' \
  -H "Origin: $BASE" -d '{"email":"jonmichaelpsmith@gmail.com"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
A=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H "Origin: $BASE")
STAMP=$(date +%H%M%S)
GHOST="99999999-9999-4999-8999-999999999999"
FOREIGN="${FOREIGN_PROJECT_ID:-}"
BAD="not-a-uuid"

MINE=$(curl -sS -X POST "$BASE/api/c2c/projects" "${A[@]}" -d "{
  \"name\":\"Membership probe $STAMP\",\"productName\":\"MEM-$STAMP\",\"programType\":\"ind\",\"productType\":\"drug\",
  \"applicationNumber\":\"88$STAMP\",\"primaryAgency\":\"FDA\",\"priority\":\"high\",\"indication\":\"Probe\"}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("data") or d).get("id",""))')

verdict() { # verdict <label> <method> <url> [body]
  local code
  if [ "$2" = GET ]; then
    code=$(curl -sS -o /tmp/mem.body -w '%{http_code}' "$3" "${A[@]}")
  else
    code=$(curl -sS -o /tmp/mem.body -w '%{http_code}' -X "$2" "$3" "${A[@]}" -d "${4:-{\}}")
  fi
  printf '  %-46s %s  %s\n' "$1" "$code" "$(python3 -c "
import json
try: d=json.load(open('/tmp/mem.body'))
except Exception: print('(unparsable)'); raise SystemExit
if d.get('error'): print(str(d['error'])[:72]); raise SystemExit
data = d.get('data') or {}
if isinstance(data, dict) and 'guidelineStatus' in data:
    print('VERDICT: %d guideline(s), %d finding(s), overall=%s' % (len(data.get('guidelineStatus') or {}), len(data.get('findings') or []), data.get('overallStatus')))
elif isinstance(data, dict) and ('cqas' in data or 'cpps' in data):
    print('DERIVED: %d CQA(s), %d CPP(s)' % (len(data.get('cqas') or []), len(data.get('cpps') or [])))
elif isinstance(data, dict) and data.get('id'):
    print('FILED: id=%s projectId=%s' % (data.get('id'), data.get('projectId') or data.get('project_id')))
else:
    print(json.dumps(data)[:72])")"
}

for id in "$GHOST" "$BAD" ${FOREIGN:+"$FOREIGN"} "$MINE"; do
  label=$([ "$id" = "$MINE" ] && echo "this organisation's own programme" || echo "$id")
  echo
  echo "── $label ──"
  verdict "POST /ich-compliance"             POST "$BASE/api/cmc/ich-compliance"            "{\"projectId\":\"$id\"}"
  verdict "GET  /quality/qbd/:projectId"     GET  "$BASE/api/cmc/quality/qbd/$id"
  verdict "POST /control-strategy"           POST "$BASE/api/cmc/control-strategy"          "{\"projectId\":\"$id\",\"scope\":\"both\"}"
  verdict "POST /container-closures"         POST "$BASE/api/cmc/container-closures" \
    "{\"projectId\":\"$id\",\"systemName\":\"Probe CCS $STAMP\",\"containerDescription\":\"HDPE bottle\",\"closureDescription\":\"CR cap\",\"status\":\"draft\"}"
  verdict "POST /comparability-studies"      POST "$BASE/api/cmc/comparability-studies" \
    "{\"projectId\":\"$id\",\"title\":\"Probe comparability\",\"type\":\"process\",\"product\":\"Scale\",\"status\":\"draft\"}"
  verdict "POST /material-specs"             POST "$BASE/api/cmc/material-specs" \
    "{\"projectId\":\"$id\",\"materialName\":\"Probe excipient\",\"materialRole\":\"excipient\",\"grade\":\"USP\"}"
done

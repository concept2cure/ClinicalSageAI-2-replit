#!/usr/bin/env bash
# Does an ordinary register EDIT leave a chained audit row naming who changed
# what? One create and one edit per register, then the ledger read back through
# the product's own route.
set -uo pipefail
BASE="${BASE:-http://127.0.0.1:5000}"
TOKEN=$(curl -sS -X POST "$BASE/api/auth/dev-login" -H 'Content-Type: application/json' \
  -H "Origin: $BASE" -d '{"email":"jonmichaelpsmith@gmail.com"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
A=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H "Origin: $BASE")
STAMP=$(date +%H%M%S)

PROJ=$(curl -sS -X POST "$BASE/api/c2c/projects" "${A[@]}" -d "{
  \"name\":\"Edit audit $STAMP\",\"productName\":\"EDA-$STAMP\",\"programType\":\"ind\",\"productType\":\"drug\",
  \"applicationNumber\":\"44$STAMP\",\"primaryAgency\":\"FDA\",\"priority\":\"high\",\"indication\":\"Probe\"}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("data") or d).get("id",""))')

ids=()
one() { # one <label> <path> <createBody> <editBody>
  local created id code
  created=$(curl -sS -X POST "$BASE/api/cmc/$2" "${A[@]}" -d "$3")
  id=$(echo "$created" | python3 -c 'import sys,json
try: d=json.load(sys.stdin)
except Exception: print(""); raise SystemExit
print((d.get("data") or d).get("id",""))')
  if [ -z "$id" ]; then printf '%-24s %s\n' "$1" "CREATE FAILED: $(echo "$created" | head -c 110)"; return; fi
  code=$(curl -sS -o /tmp/eda.body -w '%{http_code}' -X PUT "$BASE/api/cmc/$2/$id" "${A[@]}" -d "$4")
  printf '%-24s create ok  edit %s\n' "$1" "$code"
  ids+=("$1:$id")
}

one "analytical-method" "analytical-methods" \
  "{\"projectId\":\"$PROJ\",\"methodCode\":\"EDA-$STAMP\",\"title\":\"Probe assay\",\"purpose\":\"Assay\",\"analyte\":\"API\",\"matrix\":\"Drug substance\",\"technique\":\"HPLC\",\"status\":\"development\"}" \
  '{"title":"Probe assay (rev 2)","status":"validation"}'

one "stability-study" "stability-studies" \
  "{\"projectId\":\"$PROJ\",\"productName\":\"EDA-$STAMP\",\"batchNumber\":\"B-1\",\"dosageForm\":\"tablet\",\"scope\":\"DP\",\"climaticZone\":\"II\",\"studyType\":\"long_term\",\"storageConditions\":[\"25C/60%RH\"],\"duration\":24,\"testParameters\":[\"assay\"],\"timePoints\":[\"0\",\"12\"],\"status\":\"ACTIVE\",\"startDate\":\"2026-01-01T00:00:00.000Z\"}" \
  '{"status":"PAUSED"}'

one "drug-substance" "drug-substances" \
  "{\"projectId\":\"$PROJ\",\"substanceName\":\"EDA-$STAMP\",\"status\":\"development\"}" \
  '{"status":"characterized"}'

one "change-control" "change-control" \
  "{\"projectId\":\"$PROJ\",\"changeNumber\":\"CC-$STAMP\",\"changeType\":\"process\",\"status\":\"draft\",\"description\":\"A probe change\",\"justification\":\"Probe\"}" \
  '{"status":"under-review","regulatoryFiling":"CBE-30"}'

one "comparability" "comparability-studies" \
  "{\"projectId\":\"$PROJ\",\"title\":\"Probe comparability\",\"type\":\"process\",\"product\":\"Scale\",\"status\":\"draft\"}" \
  '{"outcome":"Comparable on every attribute."}'

echo
echo "— the chained ledger, rows recorded for these records —"
curl -sS -X GET "$BASE/api/audit-trail/ledger?limit=400" "${A[@]}" | python3 -c "
import sys, json
d = json.load(sys.stdin)
rows = d.get('data') if isinstance(d.get('data'), list) else (d if isinstance(d, list) else [])
wanted = set('''$(printf '%s ' "${ids[@]}")'''.split())
ids = {w.split(':', 1)[1] for w in wanted if ':' in w}
hits = [r for r in rows if any(str(r.get('target', '')).endswith(':' + i) for i in ids)]
by = {}
for r in hits:
    by.setdefault(str(r.get('target')), []).append(str(r.get('event') or r.get('action')))
for t in sorted(by):
    print('  %-46s %s' % (t, ', '.join(sorted(set(by[t])))))
print()
chain = d.get('meta', {}).get('chain', {}) if isinstance(d, dict) else {}
print('  chain verified:', chain.get('ok'), 'over', chain.get('rows'), 'row(s)')
"

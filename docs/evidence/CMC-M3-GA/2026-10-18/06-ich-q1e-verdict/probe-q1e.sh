#!/usr/bin/env bash
# The Q1E verdict, end to end, over five programmes that differ from the first
# in exactly one way each: the coverage, the accelerated study, the claim's
# text, or whether anything has actually been pulled.
set -uo pipefail
BASE="${BASE:-http://127.0.0.1:5000}"
TOKEN=$(curl -sS -X POST "$BASE/api/auth/dev-login" -H 'Content-Type: application/json' \
  -H "Origin: $BASE" -d '{"email":"jonmichaelpsmith@gmail.com"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
A=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H "Origin: $BASE")
STAMP=$(date +%H%M%S)

# The RECORDED pull points out to <months>. A study carrying only its planned
# schedule has produced nothing, and the rule reports a claim over it rather
# than reading the plan as coverage.
results_to() {
  python3 -c 'import sys, json; m = int(sys.argv[1]); print(json.dumps([{"timePoint": str(t), "parameter": "assay", "result": "99.6"} for t in [0,3,6,9,12,18,24,36] if t <= m]))' "$1"
}

mk() { # mk <label> <claim> <duration> <timePoints> [--no-accelerated|--unpulled]
  local proj ltdata
  proj=$(curl -sS -X POST "$BASE/api/c2c/projects" "${A[@]}" -d "{
    \"name\":\"Q1E $1 $STAMP\",\"productName\":\"Q1E-$1\",\"programType\":\"ind\",\"productType\":\"drug\",
    \"applicationNumber\":\"66$STAMP$RANDOM\",\"primaryAgency\":\"FDA\",\"priority\":\"high\",\"indication\":\"Probe\"}" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("data") or d).get("id",""))')
  if [ "${5:-}" = "--unpulled" ]; then ltdata=null; else ltdata=$(results_to "$3"); fi
  curl -sS -o /dev/null -X POST "$BASE/api/cmc/stability-studies" "${A[@]}" -d "{
    \"projectId\":\"$proj\",\"productName\":\"Q1E-$1\",\"batchNumber\":\"B-1\",\"dosageForm\":\"tablet\",\"scope\":\"DP\",
    \"climaticZone\":\"II\",\"studyType\":\"long_term\",\"storageConditions\":[\"25C/60%RH\"],\"duration\":$3,
    \"testParameters\":[\"assay\"],\"timePoints\":[$4],\"shelfLife\":\"$2\",\"status\":\"ACTIVE\",
    \"startDate\":\"2026-01-01T00:00:00.000Z\",\"stabilityData\":$ltdata}"
  if [ "${5:-}" != "--no-accelerated" ]; then
    curl -sS -o /dev/null -X POST "$BASE/api/cmc/stability-studies" "${A[@]}" -d "{
      \"projectId\":\"$proj\",\"productName\":\"Q1E-$1\",\"batchNumber\":\"B-1\",\"dosageForm\":\"tablet\",\"scope\":\"DP\",
      \"climaticZone\":\"II\",\"studyType\":\"accelerated\",\"storageConditions\":[\"40C/75%RH\"],\"duration\":6,
      \"testParameters\":[\"assay\"],\"timePoints\":[\"0\",\"3\",\"6\"],\"shelfLife\":\"\",\"status\":\"ACTIVE\",
      \"startDate\":\"2026-01-01T00:00:00.000Z\",\"stabilityData\":$(results_to 6)}"
  fi
  echo "$proj"
}

report() { # report <label> <projectId>
  curl -sS -X POST "$BASE/api/cmc/ich-compliance" "${A[@]}" -d "{\"projectId\":\"$2\"}" \
    | python3 -c "
import sys, json
d = json.load(sys.stdin).get('data', {})
q1e = [f for f in d.get('findings', []) if f.get('guideline') == 'Q1E']
print('$1:')
print('  guidelineStatus[Q1E] =', d.get('guidelineStatus', {}).get('Q1E'))
for f in q1e:
    print('  %-40s %-13s %s' % (f['ruleId'], f['status'], f['message'][:118]))
    for e in f.get('evidence', [])[:4]:
        print('      ·', e[:108])
    print('      cite:', f.get('citation', '')[:95])
"
}

P1=$(mk within '24 months at 25C/60%RH' 24 '"0","3","6","12","24"')
report "a claim within the data (24 claimed, 24 recorded)" "$P1"
P2=$(mk beyond '36 months at 25C/60%RH' 12 '"0","3","6","12"')
report "a claim beyond the data (36 claimed, 12 recorded)" "$P2"
P3=$(mk noaccel '24 months at 25C/60%RH' 12 '"0","3","6","12"' --no-accelerated)
report "beyond the data with no accelerated study" "$P3"
P4=$(mk unreadable 'to be determined' 12 '"0","3","6","12"')
report "a claim that states no period" "$P4"
P5=$(mk planned '24 months at 25C/60%RH' 24 '"0","3","6","12","24"' --unpulled)
report "a 24-month plan with nothing pulled yet" "$P5"

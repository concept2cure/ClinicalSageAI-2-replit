#!/usr/bin/env bash
# Probe each register's signed state through the API. Prints one line per probe:
#   <register> <http status> <code-or-note>
# Run against a server BEFORE the change (every signed state is accepted) and
# AFTER it (every one is refused 409 and names the governed path).
set -uo pipefail
BASE="${BASE:-http://127.0.0.1:5000}"
EMAIL="${EMAIL:-jonmichaelpsmith@gmail.com}"

TOKEN=$(curl -sS -X POST "$BASE/api/auth/dev-login" -H 'Content-Type: application/json' \
  -H "Origin: $BASE" -d "{\"email\":\"$EMAIL\"}" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("accessToken",""))')
[ -n "$TOKEN" ] || { echo "LOGIN FAILED"; exit 1; }
A=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H "Origin: $BASE")

STAMP=$(date +%H%M%S)
PROJ=$(curl -sS -X POST "$BASE/api/c2c/projects" "${A[@]}" -d "{
  \"name\":\"Signed-state probe $STAMP\",\"productName\":\"PRB-$STAMP\",\"programType\":\"ind\",
  \"productType\":\"drug\",\"applicationNumber\":\"99$STAMP\",\"primaryAgency\":\"FDA\",
  \"priority\":\"high\",\"indication\":\"Probe\"}" | python3 -c 'import sys,json
d=json.load(sys.stdin); p=d.get("data") or d
print(p.get("id") or p.get("projectId") or "")')
echo "project: ${PROJ:-NONE}"

probe() { # name, path, body
  local out code
  out=$(curl -sS -o /tmp/probe.body -w '%{http_code}' -X POST "$BASE$2" "${A[@]}" -d "$3")
  code=$(python3 -c '
import json,sys
try: d=json.load(open("/tmp/probe.body"))
except Exception: print("(unparsable)"); raise SystemExit
e=d.get("error"); c=d.get("code") or (e.get("code") if isinstance(e,dict) else None)
if c: print(c, "-", (e.get("message") if isinstance(e,dict) else "")[:90]); raise SystemExit
if isinstance(e,str): print(e[:150]); raise SystemExit
st=(d.get("data") or {}).get("status") if isinstance(d.get("data"),dict) else None
print("ACCEPTED status=%s reviewed_by=%s" % (st, (d.get("data") or {}).get("reviewedBy") if isinstance(d.get("data"),dict) else None))')
  printf '%-22s %s  %s\n' "$1" "$out" "$code"
}

probe "analytical-method" /api/cmc/analytical-methods "{\"projectId\":\"$PROJ\",\"methodCode\":\"PRB-$STAMP\",\"title\":\"Probe assay\",\"purpose\":\"Assay\",\"analyte\":\"API\",\"matrix\":\"Drug substance\",\"technique\":\"HPLC\",\"status\":\"validated\",\"validatedBy\":1,\"validationDate\":\"2026-01-01\"}"
probe "process-validation" /api/cmc/process-validation "{\"projectId\":\"$PROJ\",\"processName\":\"Probe PPQ\",\"stage\":\"qualification\",\"status\":\"approved\",\"approvedBy\":1,\"approvalDate\":\"2026-01-01\"}"
probe "comparability" /api/cmc/comparability-studies "{\"projectId\":\"$PROJ\",\"title\":\"Probe comparability\",\"type\":\"process\",\"product\":\"Scale\",\"status\":\"approved\",\"owner\":\"Dr Nobody\",\"outcome\":\"Comparable\"}"
probe "qc-testing" /api/cmc/qc-testing "{\"projectId\":\"$PROJ\",\"sampleId\":\"PRB-$STAMP\",\"sampleType\":\"finished-product\",\"testMethod\":\"HPLC assay\",\"passFailStatus\":\"pass\",\"testDate\":\"2026-01-01\",\"reviewedBy\":1,\"releaseDate\":\"2026-01-02\"}"

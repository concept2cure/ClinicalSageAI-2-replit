#!/usr/bin/env bash
# The replacement each refusal names, exercised end to end: the precondition,
# the reason, the re-authentication, and the signature itself.
set -uo pipefail
BASE="${BASE:-http://127.0.0.1:5000}"
EMAIL="${EMAIL:-jonmichaelpsmith@gmail.com}"
PW="${SIGNER_PASSWORD:-}"

TOKEN=$(curl -sS -X POST "$BASE/api/auth/dev-login" -H 'Content-Type: application/json' \
  -H "Origin: $BASE" -d "{\"email\":\"$EMAIL\"}" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("accessToken",""))')
[ -n "$TOKEN" ] || { echo "LOGIN FAILED"; exit 1; }
A=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H "Origin: $BASE")
STAMP=$(date +%H%M%S)

say() { printf '%-46s %s  %s\n' "$1" "$2" "$3"; }
call() { # method path body -> sets RC and BODY
  RC=$(curl -sS -o /tmp/cer.body -w '%{http_code}' -X "$1" "$BASE$2" "${A[@]}" -d "$3")
  BODY=$(python3 -c '
import json
try: d=json.load(open("/tmp/cer.body"))
except Exception: print("(unparsable)"); raise SystemExit
e=d.get("error"); c=d.get("code") or (e.get("code") if isinstance(e,dict) else None)
if isinstance(e,str): print(e[:140]); raise SystemExit
if c: print(c); raise SystemExit
dd=d.get("data") or {}
print("status=%s validated_by=%s validation_date=%s approved_by=%s reviewed_by=%s" % (
  dd.get("status"), dd.get("validatedBy"), str(dd.get("validationDate"))[:10],
  dd.get("approvedBy"), dd.get("owner")))')
}

PROJ=$(curl -sS -X POST "$BASE/api/c2c/projects" "${A[@]}" -d "{
  \"name\":\"Ceremony probe $STAMP\",\"productName\":\"CER-$STAMP\",\"programType\":\"ind\",
  \"productType\":\"drug\",\"applicationNumber\":\"88$STAMP\",\"primaryAgency\":\"FDA\",
  \"priority\":\"high\",\"indication\":\"Probe\"}" | python3 -c 'import sys,json
d=json.load(sys.stdin); p=d.get("data") or d; print(p.get("id") or "")')

# ── 1. a method with NO ICH Q2 parameters: the precondition refuses ─────────
call POST /api/cmc/analytical-methods "{\"projectId\":\"$PROJ\",\"methodCode\":\"CER-$STAMP\",\"title\":\"Probe assay\",\"purpose\":\"Assay\",\"analyte\":\"API\",\"matrix\":\"Drug substance\",\"technique\":\"HPLC\",\"status\":\"development\"}"
MID=$(python3 -c 'import json; print((json.load(open("/tmp/cer.body")).get("data") or {}).get("id",""))')
say "create an ordinary method" "$RC" "id=$MID"

call POST "/api/cmc/analytical-methods/$MID/validate" '{}'
say "validate with no reason" "$RC" "$BODY"

call POST "/api/cmc/analytical-methods/$MID/validate" '{"reason":"Q2 report AM-RPT-001 accepted.","meaning":"approval"}'
say "validate, reason, no re-auth" "$RC" "$BODY"

call POST "/api/cmc/analytical-methods/$MID/validate" "{\"reason\":\"Q2 report AM-RPT-001 accepted.\",\"meaning\":\"approval\",\"reauth\":{\"password\":\"${PW:-wrong}\"}}"
say "validate, no Q2 parameters recorded" "$RC" "$BODY"

# ── 2. the same method WITH its Q2 package: the signature lands ─────────────
call PUT "/api/cmc/analytical-methods/$MID" '{"ichQ2Parameters":{"characteristics":["Specificity","Accuracy","Precision","Range","Linearity"],"summary":"All characteristics met their acceptance criteria."}}'
say "record the Q2 package (ordinary edit)" "$RC" "$BODY"

call POST "/api/cmc/analytical-methods/$MID/validate" "{\"reason\":\"Q2 report AM-RPT-001 accepted; all characteristics met.\",\"meaning\":\"approval\",\"reauth\":{\"password\":\"${PW:-wrong}\"}}"
say "validate with the package + password" "$RC" "$BODY"

# ── 3. a validated method is closed to ordinary edits ──────────────────────
call PUT "/api/cmc/analytical-methods/$MID" '{"title":"Rewritten after signing"}'
say "edit a validated method" "$RC" "$BODY"

call PUT "/api/cmc/analytical-methods/$MID" '{"status":"development"}'
say "un-validate by an ordinary edit" "$RC" "$BODY"

# ── 4. the other two preconditions ────────────────────────────────────────
call POST /api/cmc/process-validation "{\"projectId\":\"$PROJ\",\"processName\":\"Probe PPQ\",\"stage\":\"qualification\",\"status\":\"planning\"}"
PID=$(python3 -c 'import json; print((json.load(open("/tmp/cer.body")).get("data") or {}).get("id",""))')
call POST "/api/cmc/process-validation/$PID/approve" "{\"reason\":\"PPQ report accepted.\",\"meaning\":\"approval\",\"reauth\":{\"password\":\"${PW:-wrong}\"}}"
say "approve a PV record naming no report" "$RC" "$BODY"

call POST /api/cmc/comparability-studies "{\"projectId\":\"$PROJ\",\"title\":\"Probe comparability\",\"type\":\"process\",\"product\":\"Scale\",\"status\":\"draft\"}"
CID=$(python3 -c 'import json; print((json.load(open("/tmp/cer.body")).get("data") or {}).get("id",""))')
call POST "/api/cmc/comparability-studies/$CID/approve" "{\"reason\":\"Comparable on all attributes.\",\"meaning\":\"approval\",\"reauth\":{\"password\":\"${PW:-wrong}\"}}"
say "approve an assessment stating no case" "$RC" "$BODY"

# ── 5. the same two, with the thing the approval accepts recorded ──────────
call PUT "/api/cmc/process-validation/$PID" '{"validationReport":"PV-RPT-011","validationProtocol":"PV-PROT-011"}'
say "record the PV report (ordinary edit)" "$RC" "$BODY"
call POST "/api/cmc/process-validation/$PID/approve" "{\"reason\":\"PPQ report PV-RPT-011 accepted; three consecutive batches met every CQA.\",\"meaning\":\"approval\",\"reauth\":{\"password\":\"${PW:-wrong}\"}}"
say "approve the PV record" "$RC" "$BODY"

call PUT "/api/cmc/comparability-studies/$CID" '{"outcome":"Comparable on all attributes against the pre-change acceptance criteria."}'
say "record the Q5E justification" "$RC" "$BODY"
call POST "/api/cmc/comparability-studies/$CID/approve" "{\"reason\":\"Q5E comparability accepted: all attributes within the pre-change ranges.\",\"meaning\":\"approval\",\"reauth\":{\"password\":\"${PW:-wrong}\"}}"
say "approve the comparability assessment" "$RC" "$BODY"

# ── 6. what the three signatures left behind ───────────────────────────────
echo
echo "— the 21 CFR Part 11 signature rows these three acts wrote —"
psql "$DATABASE_URL" -tAc "
  SELECT signed_target || '  meaning=' || signature_meaning || '  signer=' || signer_name
         || '  act=' || (signature_manifest::json->>'act')
         || '  auth=' || authentication_method
         || '  basis=' || binding_basis
    FROM electronic_signatures
   WHERE signed_target IN ('analytical_method:$MID','process_validation:$PID','comparability_study:$CID')
   ORDER BY signed_target" 2>&1
echo "— the chained audit rows the same transactions wrote —"
psql "$DATABASE_URL" -tAc "
  SELECT target || '  ' || action || '  user=' || user_id || '  chain=' || substring(sha256_chain,1,16) || '  seq=' || chain_seq
    FROM audit_logs
   WHERE target IN ('analytical_method:$MID','process_validation:$PID','comparability_study:$CID')
   ORDER BY chain_seq" 2>&1

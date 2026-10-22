#!/usr/bin/env bash
# The shelf life §3.2.S.7.1 / §3.2.P.8.1 prints as the dossier's claim: is it
# recorded under a signature, or by an ordinary PUT?
#
# Every half of the ceremony, in the order a scientist meets them.
set -uo pipefail
BASE="${BASE:-http://127.0.0.1:5000}"
PW="${SIGNER_PASSWORD:-pass-word}"
TOKEN=$(curl -sS -X POST "$BASE/api/auth/dev-login" -H 'Content-Type: application/json' \
  -H "Origin: $BASE" -d '{"email":"jonmichaelpsmith@gmail.com"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
A=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H "Origin: $BASE")
S=$(date +%H%M%S)
say() { printf '  %-54s %s  %s\n' "$1" "$2" "$3"; }
code() { curl -sS -o /tmp/clo.body -w '%{http_code}' "$@"; }
err() { python3 -c "
import json
try: d=json.load(open('/tmp/clo.body'))
except Exception: print('(unparsable)'); raise SystemExit
print(str(d.get('error') or d.get('message') or '')[:92])"; }
row() { python3 -c "
import json
d=json.load(open('/tmp/clo.body'))
r=d.get('data') or d.get('batchRecord') or {}
print('status=%s shelfLife=%r signedBy=%s signedAt=%s' % (r.get('status'), r.get('shelfLife'), r.get('shelfLifeSignedBy'), str(r.get('shelfLifeSignedAt'))[:19]))"; }

PROJ=$(curl -sS -X POST "$BASE/api/c2c/projects" "${A[@]}" -d "{
  \"name\":\"Close-out probe $S\",\"productName\":\"CLO-$S\",\"programType\":\"ind\",\"productType\":\"drug\",
  \"applicationNumber\":\"11$S\",\"primaryAgency\":\"FDA\",\"priority\":\"high\",\"indication\":\"Probe\"}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("data") or d).get("id",""))')

echo "── the create ──"
say "a study created already COMPLETED" "$(code -X POST "$BASE/api/cmc/stability-studies" "${A[@]}" -d "{
  \"projectId\":\"$PROJ\",\"productName\":\"CLO-$S\",\"batchNumber\":\"B-1\",\"dosageForm\":\"tablet\",\"scope\":\"DP\",
  \"climaticZone\":\"II\",\"studyType\":\"long_term\",\"storageConditions\":[\"25C/60%RH\"],\"duration\":24,
  \"testParameters\":[\"assay\"],\"timePoints\":[\"0\",\"12\",\"24\"],\"status\":\"COMPLETED\",
  \"shelfLife\":\"36 months at 25C/60%RH\",\"startDate\":\"2026-01-01T00:00:00.000Z\"}")" "$(err)"

ID=$(curl -sS -X POST "$BASE/api/cmc/stability-studies" "${A[@]}" -d "{
  \"projectId\":\"$PROJ\",\"productName\":\"CLO-$S\",\"batchNumber\":\"B-1\",\"dosageForm\":\"tablet\",\"scope\":\"DP\",
  \"climaticZone\":\"II\",\"studyType\":\"long_term\",\"storageConditions\":[\"25C/60%RH\"],\"duration\":24,
  \"testParameters\":[\"assay\"],\"timePoints\":[\"0\",\"12\",\"24\"],\"status\":\"ACTIVE\",
  \"startDate\":\"2026-01-01T00:00:00.000Z\"}" | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("data") or d).get("id",""))')
say "an ordinary study" "ok" "id=$ID"

echo
echo "── the ordinary edit ──"
say "PUT status COMPLETED with a shelf life" "$(code -X PUT "$BASE/api/cmc/stability-studies/$ID" "${A[@]}" \
  -d '{"status":"COMPLETED","shelfLife":"36 months at 25C/60%RH"}')" "$(err)"
say "PUT the signature columns directly" "$(code -X PUT "$BASE/api/cmc/stability-studies/$ID" "${A[@]}" \
  -d '{"shelfLifeSignedBy":1,"shelfLifeSignedAt":"2026-01-01T00:00:00.000Z"}')" "$(err)"
curl -sS -o /tmp/clo.body "$BASE/api/cmc/stability-studies?projectId=$PROJ" "${A[@]}"
printf '  %-54s %s\n' "the stored row after both attempts" "$(python3 -c "
import json
d=json.load(open('/tmp/clo.body'))
r=[x for x in (d.get('data') or []) if str(x.get('id'))=='$ID']
r=r[0] if r else {}
print('status=%s shelfLife=%r' % (r.get('status'), r.get('shelfLife')))")"

echo
echo "── the ceremony ──"
say "close out with no reason" "$(code -X POST "$BASE/api/cmc/stability-studies/$ID/close-out" "${A[@]}" -d '{}')" "$(err)"
say "with a reason, no re-authentication" "$(code -X POST "$BASE/api/cmc/stability-studies/$ID/close-out" "${A[@]}" \
  -d '{"reason":"The 24-month data support the claim.","meaning":"approval"}')" "$(err)"
say "with both, but no shelf life recorded" "$(code -X POST "$BASE/api/cmc/stability-studies/$ID/close-out" "${A[@]}" \
  -d "{\"reason\":\"The 24-month data support the claim.\",\"meaning\":\"approval\",\"reauth\":{\"password\":\"$PW\"}}")" "$(err)"

curl -sS -o /dev/null -X PUT "$BASE/api/cmc/stability-studies/$ID" "${A[@]}" -d '{"shelfLife":"24 months at 25C/60%RH"}'
say "shelf life recorded, but no results pulled" "$(code -X POST "$BASE/api/cmc/stability-studies/$ID/close-out" "${A[@]}" \
  -d "{\"reason\":\"The 24-month data support the claim.\",\"meaning\":\"approval\",\"reauth\":{\"password\":\"$PW\"}}")" "$(err)"

curl -sS -o /dev/null -X PUT "$BASE/api/cmc/stability-studies/$ID" "${A[@]}" -d '{"stabilityData":"not json at all"}'
say "a recorded series that cannot be read" "$(code -X POST "$BASE/api/cmc/stability-studies/$ID/close-out" "${A[@]}" \
  -d "{\"reason\":\"The 24-month data support the claim.\",\"meaning\":\"approval\",\"reauth\":{\"password\":\"$PW\"}}")" "$(err)"

curl -sS -o /dev/null -X PUT "$BASE/api/cmc/stability-studies/$ID" "${A[@]}" -d '{"stabilityData":[{"timePoint":"0","parameter":"assay","result":"99.8"},{"timePoint":"12","parameter":"assay","result":"99.4"},{"timePoint":"24","parameter":"assay","result":"99.1"}]}'
say "with everything recorded" "$(code -X POST "$BASE/api/cmc/stability-studies/$ID/close-out" "${A[@]}" \
  -d "{\"reason\":\"The 24-month long-term data support a 24-month shelf life.\",\"meaning\":\"approval\",\"reauth\":{\"password\":\"$PW\"}}")" "$(row)"

echo
echo "── after the signature ──"
say "an ordinary edit of the closed-out study" "$(code -X PUT "$BASE/api/cmc/stability-studies/$ID" "${A[@]}" \
  -d '{"shelfLife":"36 months at 25C/60%RH"}')" "$(err)"
say "returning it to ACTIVE" "$(code -X PUT "$BASE/api/cmc/stability-studies/$ID" "${A[@]}" -d '{"status":"ACTIVE"}')" "$(err)"
# A reason long enough to parse, so what this line reports is the DOUBLE
# SIGNATURE refusal and not the reason's minimum length. The first attempt here
# used "Again." and reported 400 Invalid input data — which hid that a second
# close-out was being accepted, 200, re-stamping the signature date.
say "closing it out twice" "$(code -X POST "$BASE/api/cmc/stability-studies/$ID/close-out" "${A[@]}" \
  -d "{\"reason\":\"A second close-out attempt on a study that is already closed out.\",\"meaning\":\"approval\",\"reauth\":{\"password\":\"$PW\"}}")" "$(err)"
printf '  %-54s %s\n' "the §11.50 signature row" "$(curl -sS "$BASE/api/part11/signatures/by-target?target=stability_study:$ID" "${A[@]}" | python3 -c "
import sys, json
d = json.load(sys.stdin)
rows = d.get('data') or d.get('signatures') or []
print('%d row(s)%s' % (len(rows), (': meaning=%s signer=%s' % (rows[0].get('signature_meaning') or rows[0].get('meaning'), rows[0].get('signer_name'))) if rows else ''))")"

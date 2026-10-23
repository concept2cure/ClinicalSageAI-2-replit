#!/usr/bin/env bash
# The reading half of §11.10(e): can a reviewer see what a register record said
# before it was changed, through the product's own route?
#
# One record per shape — a serial register, a uuid register — created, edited
# twice, then read back; plus every refusal the route has to make.
set -uo pipefail
BASE="${BASE:-http://127.0.0.1:5000}"
TOKEN=$(curl -sS -X POST "$BASE/api/auth/dev-login" -H 'Content-Type: application/json' \
  -H "Origin: $BASE" -d '{"email":"jonmichaelpsmith@gmail.com"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
A=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H "Origin: $BASE")
STAMP=$(date +%H%M%S)
H="$BASE/api/cmc/register-history"

PROJ=$(curl -sS -X POST "$BASE/api/c2c/projects" "${A[@]}" -d "{
  \"name\":\"History probe $STAMP\",\"productName\":\"HIS-$STAMP\",\"programType\":\"ind\",\"productType\":\"drug\",
  \"applicationNumber\":\"77$STAMP\",\"primaryAgency\":\"FDA\",\"priority\":\"high\",\"indication\":\"Probe\"}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("data") or d).get("id",""))')

idof() { python3 -c 'import sys,json
try: d=json.load(sys.stdin)
except Exception: print(""); raise SystemExit
print((d.get("data") or d).get("id",""))'; }

show() { # show <label> <register> <id>
  echo
  echo "── $1 ──"
  curl -sS "$H/$2/$3" "${A[@]}" | python3 -c "
import sys, json
b = json.load(sys.stdin)
d = b.get('data') or {}
print('  register=%s  recordId=%s  acts=%d  note=%s' % (d.get('register'), d.get('recordId'), len(d.get('entries') or []), d.get('note')))
for e in d.get('entries') or []:
    moved = '; '.join('%s: %r → %r' % (f, e['changed'][f]['from'], e['changed'][f]['to']) for f in e.get('changedFields') or []) or '—'
    print('  %-19s %-9s %-10s seq=%-6s sealed=%-5s %s' % (e['at'][:19], e['label'], e.get('actor') or 'none', e.get('seq'), e.get('sealed'), moved[:120]))
"
}

# ── a serial register ────────────────────────────────────────────────────────
M=$(curl -sS -X POST "$BASE/api/cmc/analytical-methods" "${A[@]}" -d "{
  \"projectId\":\"$PROJ\",\"methodCode\":\"HIS-$STAMP\",\"title\":\"Assay by HPLC\",\"purpose\":\"Assay\",
  \"analyte\":\"API\",\"matrix\":\"Drug substance\",\"technique\":\"HPLC\",\"status\":\"development\"}" | idof)
curl -sS -o /dev/null -X PUT "$BASE/api/cmc/analytical-methods/$M" "${A[@]}" -d '{"title":"Assay by RP-HPLC"}'
curl -sS -o /dev/null -X PUT "$BASE/api/cmc/analytical-methods/$M" "${A[@]}" -d '{"purpose":"Assay and related substances","matrix":"Drug product"}'
show "an analytical method, created then edited twice" "analytical-methods" "$M"

# ── a uuid register ──────────────────────────────────────────────────────────
C=$(curl -sS -X POST "$BASE/api/cmc/comparability-studies" "${A[@]}" -d "{
  \"projectId\":\"$PROJ\",\"title\":\"Scale-up comparability\",\"type\":\"process\",\"product\":\"HIS-$STAMP\",\"status\":\"draft\"}" | idof)
curl -sS -o /dev/null -X PUT "$BASE/api/cmc/comparability-studies/$C" "${A[@]}" \
  -d '{"outcome":"Comparable on every attribute against the pre-change criteria."}'
show "a comparability assessment (uuid-keyed)" "comparability-studies" "$C"

# ── the refusals ─────────────────────────────────────────────────────────────
echo
echo "── what the route refuses ──"
r() { printf '  %-44s %s  %s\n' "$1" "$(curl -sS -o /tmp/rh.body -w '%{http_code}' "$2" "${A[@]}")" "$(head -c 118 /tmp/rh.body)"; }
r "a record that does not exist"            "$H/analytical-methods/99999999"
r "a uuid register given an integer id"     "$H/manufacturing-processes/7"
r "a register that keeps no history"        "$H/qbd-elements/3"
r "specifications — its own history route"  "$H/specifications/1"
echo
echo "── and the route specifications has kept all along ──"
# `GET /api/cmc/specifications` is NOT a list route — the register's list is
# `/:projectId` — so a probe that read the bare path concluded this
# organisation holds no specification, which was not true.
SPEC=$(curl -sS -X POST "$BASE/api/cmc/specifications" "${A[@]}" -d "{
  \"projectId\":\"$PROJ\",\"materialType\":\"drug_substance\",\"materialName\":\"HIS-$STAMP\",
  \"testParameters\":{\"assay\":\"HPLC\"},\"acceptanceCriteria\":{\"assay\":\"98.0-102.0%\"},
  \"approvalStatus\":\"draft\"}" | idof)
r "GET /api/cmc/specifications/<projectId>"       "$BASE/api/cmc/specifications/$PROJ"
r "GET /api/cmc/specifications/<id>/history"      "$BASE/api/cmc/specifications/$SPEC/history"

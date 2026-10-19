#!/usr/bin/env bash
# Does the composed §3.2.P.8 say whether its shelf-life claim was signed for?
#
# Two programmes, identical but for the signature: same claim, same three
# recorded results, same condition. The only difference is whether a close-out
# was signed — so any difference in the section is that, and nothing else.
set -uo pipefail
BASE="${BASE:-http://127.0.0.1:5000}"
PW="${SIGNER_PASSWORD:-pass-word}"
TOKEN=$(curl -sS -X POST "$BASE/api/auth/dev-login" -H 'Content-Type: application/json' \
  -H "Origin: $BASE" -d '{"email":"jonmichaelpsmith@gmail.com"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
A=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H "Origin: $BASE")
S=$(date +%H%M%S)
idof() { python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("data") or d).get("id",""))'; }

RESULTS='[{"timePoint":"0","parameter":"assay","result":"99.8"},{"timePoint":"12","parameter":"assay","result":"99.4"},{"timePoint":"24","parameter":"assay","result":"99.1"}]'

programme() { # programme <label> <suffix>
  curl -sS -X POST "$BASE/api/c2c/projects" "${A[@]}" -d "{
    \"name\":\"Provenance $1 $S\",\"productName\":\"PRV-$1\",\"programType\":\"ind\",\"productType\":\"drug\",
    \"applicationNumber\":\"22$S$2\",\"primaryAgency\":\"FDA\",\"priority\":\"high\",\"indication\":\"Probe\"}" | idof
}

# Module 3 composes only for a programme that records the material it is
# about: the compile refuses "This program records no drug substance…" and
# says so rather than composing an empty section.
materials() { # materials <projectId>
  curl -sS -o /dev/null -X POST "$BASE/api/cmc/drug-substances" "${A[@]}" -d "{
    \"projectId\":\"$1\",\"substanceName\":\"PRV-$S\",\"inn\":\"probastat\",\"casNumber\":\"1234-56-7\",
    \"molecularFormula\":\"C17H19N3O2\",\"molecularWeight\":\"297.36\",\"status\":\"development\",
    \"developmentPhase\":\"phase1\",\"modality\":\"small_molecule\"}"
  curl -sS -o /dev/null -X POST "$BASE/api/cmc/drug-products" "${A[@]}" -d "{
    \"projectId\":\"$1\",\"productName\":\"PRV-$S 5 mg tablet\",\"dosageForm\":\"Film-coated tablet\",
    \"strength\":\"5 mg\",\"routeOfAdministration\":\"oral\",\"status\":\"development\"}"
}

study() { # study <projectId>
  curl -sS -X POST "$BASE/api/cmc/stability-studies" "${A[@]}" -d "{
    \"projectId\":\"$1\",\"productName\":\"PRV-$S\",\"batchNumber\":\"B-1\",\"dosageForm\":\"tablet\",\"scope\":\"DP\",
    \"climaticZone\":\"II\",\"studyType\":\"long_term\",\"storageConditions\":[\"25C/60%RH\"],\"duration\":24,
    \"testParameters\":[\"assay\"],\"timePoints\":[\"0\",\"12\",\"24\"],\"status\":\"ACTIVE\",
    \"startDate\":\"2026-01-01T00:00:00.000Z\",\"stabilityData\":$RESULTS}" | idof
}

section() { # section <projectId>
  curl -sS -X POST "$BASE/api/cmc/module3-os/compile/$1" "${A[@]}" -d '{}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
data = d.get('data') or d
secs = data.get('sections') or data.get('compiled') or []
hit = [s for s in secs if str(s.get('sectionKey') or s.get('section_key')) == '3.2.P.8']
if not hit:
    print('  (no §3.2.P.8 composed — %s)' % (str(d.get('error') or list(data.keys()))[:90]))
else:
    text = str(hit[0].get('narrativeDraft') or hit[0].get('narrative_draft') or '')
    import re
    m = re.search(r'A shelf life of [^.]*\.', text)
    print('  ' + (m.group(0) if m else '(no shelf-life sentence) ' + text[:160]))
"
}

# ── a claim nobody has signed for ────────────────────────────────────────────
P1=$(programme running 1)
materials "$P1"
S1=$(study "$P1")
curl -sS -o /dev/null -X PUT "$BASE/api/cmc/stability-studies/$S1" "${A[@]}" -d '{"shelfLife":"24 months at 25C/60%RH"}'
echo "── a running study, shelf life recorded by an ordinary edit ──"
section "$P1"

# ── the same claim, accepted under a signed close-out ────────────────────────
P2=$(programme signed 2)
materials "$P2"
S2=$(study "$P2")
curl -sS -o /dev/null -X PUT "$BASE/api/cmc/stability-studies/$S2" "${A[@]}" -d '{"shelfLife":"24 months at 25C/60%RH"}'
RC=$(curl -sS -o /tmp/prv.body -w '%{http_code}' -X POST "$BASE/api/cmc/stability-studies/$S2/close-out" "${A[@]}" -d "{
  \"reason\":\"The 24-month long-term data support a 24-month shelf life at the labelled condition.\",
  \"meaning\":\"approval\",\"reauth\":{\"password\":\"$PW\"}}")
echo
echo "── the same study, closed out under a signature (HTTP $RC) ──"
section "$P2"

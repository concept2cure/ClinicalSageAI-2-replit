#!/usr/bin/env bash
# A batch signed REJECTED, then the contradiction sweep, then the export gate.
#
# `batch_rejected` is the only critical-severity CMC contradiction, and the
# final-export gate keeps only critical findings — so this is the one chain that
# can stop a rejected batch reaching a dossier. Run it before and after pointing
# the sweep at the column the signature writes.
set -uo pipefail
BASE="${BASE:-http://127.0.0.1:5000}"
PW="${SIGNER_PASSWORD:-pass-word}"
TOKEN=$(curl -sS -X POST "$BASE/api/auth/dev-login" -H 'Content-Type: application/json' \
  -H "Origin: $BASE" -d '{"email":"jonmichaelpsmith@gmail.com"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
A=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H "Origin: $BASE")
STAMP=$(date +%H%M%S)
say() { printf '%-48s %s  %s\n' "$1" "$2" "$3"; }

PROJ=$(curl -sS -X POST "$BASE/api/c2c/projects" "${A[@]}" -d "{
  \"name\":\"Disposition probe $STAMP\",\"productName\":\"DSP-$STAMP\",\"programType\":\"ind\",\"productType\":\"drug\",
  \"applicationNumber\":\"55$STAMP\",\"primaryAgency\":\"FDA\",\"priority\":\"high\",\"indication\":\"Probe\"}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("data") or d).get("id",""))')

# A batch, and one QC result against it, reviewed — the release gate needs
# recorded results it can evaluate.
B=$(curl -sS -X POST "$BASE/api/cmc/batch-records" "${A[@]}" -d "{
  \"projectId\":\"$PROJ\",\"batchNumber\":\"DSP-B-$STAMP\",\"productName\":\"DSP-$STAMP\",\"batchSize\":\"100 kg\",
  \"manufacturingDate\":\"2026-02-01T00:00:00.000Z\",\"manufacturingSite\":\"Site A\",\"status\":\"in-progress\"}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("data") or d).get("id",""))')
say "batch created" "" "id=$B"

QC=$(curl -sS -X POST "$BASE/api/cmc/qc-testing" "${A[@]}" -d "{
  \"projectId\":\"$PROJ\",\"sampleId\":\"DSP-S-$STAMP\",\"batchNumber\":\"DSP-B-$STAMP\",\"sampleType\":\"finished-product\",
  \"testMethod\":\"HPLC assay\",\"testResults\":{\"value\":\"88.0\",\"unit\":\"%\"},
  \"specifications\":{\"acceptanceCriteria\":\"95.0-105.0%\"},\"passFailStatus\":\"fail\",
  \"testDate\":\"2026-02-02T00:00:00.000Z\"}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("data") or d).get("id",""))')
curl -sS -o /dev/null -X PUT "$BASE/api/cmc/qc-testing/$QC" "${A[@]}" -d '{"reviewedBy":1,"passFailStatus":"fail"}'
say "QC result recorded and reviewed (a FAIL)" "" "id=$QC"

# The governed release: decision 'rejected'.
RC=$(curl -sS -o /tmp/dsp.body -w '%{http_code}' -X POST "$BASE/api/cmc/batch-records/$B/release" "${A[@]}" -d "{
  \"decision\":\"rejected\",\"reason\":\"Assay out of specification at release; batch rejected.\",
  \"releaseTesting\":{\"assay\":\"88.0%\"},\"reauth\":{\"password\":\"$PW\"}}")
say "signed release, decision=rejected" "$RC" "$(python3 -c '
import json
try: d=json.load(open("/tmp/dsp.body"))
except Exception: print("(unparsable)"); raise SystemExit
b=d.get("batchRecord") or d.get("data") or {}
print("release_status=%s  disposition=%s  status=%s" % (b.get("release_status"), b.get("disposition"), b.get("status")))')"

# What the sweep hands the engine, and what the engine makes of it.
SC=$(curl -sS -o /tmp/dsp.sweep -w '%{http_code}' -X POST "$BASE/api/cmc/module3-os/contradictions/$PROJ" "${A[@]}" -d '{}')
say "contradiction sweep" "$SC" "$(python3 -c '
import json
try: d=json.load(open("/tmp/dsp.sweep"))
except Exception: print("(unparsable)"); raise SystemExit
data = d.get("data") or d
rows = data.get("contradictions") or data.get("findings") or (data if isinstance(data, list) else [])
crit = [r for r in rows if str(r.get("severity")) == "critical"]
print("%d finding(s), %d critical: %s" % (len(rows), len(crit),
      ", ".join(sorted({str(r.get("contradictionType")) for r in crit})) or "none"))')"

# And the gate the critical finding is supposed to reach.
GC=$(curl -sS -o /tmp/dsp.gate -w '%{http_code}' -X GET "$BASE/api/cmc/module3-os/readiness/$PROJ" "${A[@]}")
say "export readiness" "$GC" "$(python3 -c '
import json
try: d=json.load(open("/tmp/dsp.gate"))
except Exception: print("(unparsable)"); raise SystemExit
data = d.get("data") or d
print(json.dumps({k: v for k, v in data.items() if k in ("ready","verdict","blockers","openCriticalContradictions","criticalContradictions")})[:200])')"

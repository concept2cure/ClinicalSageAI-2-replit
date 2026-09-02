#!/bin/bash
# CMC staff-workflow simulation — capture → write-through → compile → approve →
# export gate → placement into the IND spine → data room. Each step is a real
# API call the corresponding CMC role would make from the UI.
set -u
BASE="http://127.0.0.1:${PORT:-5000}"
OUT="${SIM_OUT:-/tmp/cmc-sim}"
mkdir -p "$OUT"
PASS=0; FAIL=0
step() { echo; echo "── $1"; }
ok()   { PASS=$((PASS+1)); echo "   ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "   ✗ $1"; }
JQ() { jq -r "$1" 2>/dev/null; }

req() { # req NAME METHOD PATH [JSON_BODY]
  local name="$1" method="$2" path="$3" body="${4:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" "$BASE$path" -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json' -d "$body" -o "$OUT/$name.json" -w '%{http_code}'
  else
    curl -sS -X "$method" "$BASE$path" -H "Authorization: Bearer $TOKEN" \
      -o "$OUT/$name.json" -w '%{http_code}'
  fi
}

step "0. Sign in (dev-login, seeded admin)"
CODE=$(curl -sS -X POST "$BASE/api/auth/dev-login" -H 'Content-Type: application/json' \
  -d '{"email":"jm.smith@concept2cure.pro"}' -o "$OUT/login.json" -w '%{http_code}')
TOKEN=$(cat "$OUT/login.json" | JQ '.accessToken // .data.accessToken // .token // empty')
[ "$CODE" = 200 ] && [ -n "$TOKEN" ] && ok "signed in" || { bad "login failed ($CODE): $(head -c300 "$OUT/login.json")"; exit 1; }

step "1. Nav entitlements — the rail's licence verdicts include cmc"
CODE=$(req nav GET /api/module-subscriptions/navigation)
CMC_ENTITLED=$(cat "$OUT/nav.json" | JQ '(.data.entitlements // .entitlements // empty) | map(select(.moduleId=="cmc" or .id=="cmc")) | .[0] | .entitled')
[ "$CODE" = 200 ] && ok "navigation verdicts served ($CODE); cmc entitled=$CMC_ENTITLED" || bad "navigation failed ($CODE)"

step "2. Regulatory lead creates the program (one project: spine + anchor)"
CODE=$(req program POST /api/c2c/projects '{"name":"BX-701 IND","productName":"BX-701","programType":"ind","primaryAgency":"FDA","priority":"high","indication":"Relapsed multiple myeloma"}')
PROGRAM=$(cat "$OUT/program.json" | JQ '.data.id // .id // empty')
[ "$CODE" = 201 ] && [ -n "$PROGRAM" ] && ok "program $PROGRAM created" || { bad "program create failed ($CODE): $(head -c400 "$OUT/program.json")"; exit 1; }
echo "   meta: $(cat "$OUT/program.json" | JQ '.meta // .data.meta // empty' | head -c 400)"

step "3. Process development registers the drug substance (feeds 3.2.S.1/S.2)"
CODE=$(req ds POST /api/cmc/drug-substances "{\"substanceName\":\"BX-701\",\"inn\":\"belantezumab\",\"casNumber\":\"1234-56-7\",\"molecularFormula\":\"C6H8O6\",\"manufacturingProcess\":{\"manufacturer\":\"Acme Biologics\",\"route\":\"CHO cell culture\",\"site\":\"Basel\"},\"status\":\"development\",\"developmentPhase\":\"phase1\",\"projectId\":\"$PROGRAM\"}")
[ "$CODE" = 200 -o "$CODE" = 201 ] && ok "drug substance registered ($CODE)" || bad "drug substance failed ($CODE): $(head -c300 "$OUT/ds.json")"

step "4. Analytical development registers the assay method (feeds 3.2.S.4)"
CODE=$(req method POST /api/cmc/analytical-methods "{\"methodCode\":\"AM-001\",\"title\":\"RP-HPLC Assay\",\"purpose\":\"assay\",\"analyte\":\"BX-701\",\"matrix\":\"drug substance\",\"technique\":\"HPLC\",\"status\":\"validated\",\"validationDate\":\"2026-06-01T00:00:00.000Z\",\"ichQ2Parameters\":{\"characteristics\":[\"accuracy\",\"precision\",\"specificity\"]},\"projectId\":\"$PROGRAM\"}")
[ "$CODE" = 200 -o "$CODE" = 201 ] && ok "method registered ($CODE)" || bad "method failed ($CODE): $(head -c300 "$OUT/method.json")"

step "5. QC runs the test; a second person reviews (feeds 3.2.S.4)"
CODE=$(req qc POST /api/cmc/qc-testing "{\"sampleId\":\"S-2026-001\",\"sampleType\":\"drug substance\",\"testMethod\":\"AM-001\",\"testDate\":\"2026-07-01T00:00:00.000Z\",\"testResults\":{\"value\":\"99.2\",\"unit\":\"%\"},\"specifications\":{\"acceptanceCriteria\":\"98.0-102.0%\"},\"passFailStatus\":\"pass\",\"projectId\":\"$PROGRAM\"}")
[ "$CODE" = 200 -o "$CODE" = 201 ] && ok "QC result recorded ($CODE)" || bad "QC failed ($CODE): $(head -c300 "$OUT/qc.json")"

step "5b. The QC reviewer is the session, not the request body — and never the analyst"
QCID=$(cat "$OUT/qc.json" | JQ '.data.id // .id // empty')
# A forged reviewer is ignored: who verified a release result is a fact about
# who was signed in, not a number a caller can choose.
CODE=$(req qcrev PUT "/api/cmc/qc-testing/$QCID" '{"reviewedBy":999999,"passFailStatus":"pass"}')
REVBY=$(cat "$OUT/qcrev.json" | JQ '.data.reviewedBy // empty')
[ "$CODE" = 200 ] && [ -n "$REVBY" ] && [ "$REVBY" != "999999" ] \
  && ok "review recorded against the signed-in user ($REVBY), not the body's 999999" \
  || bad "QC review attribution: code=$CODE reviewedBy=$REVBY"
# Second-person review, enforced by the API and not only by the button.
CODE=$(req qcself POST /api/cmc/qc-testing "{\"sampleId\":\"S-2026-002\",\"sampleType\":\"drug substance\",\"testMethod\":\"AM-001\",\"testDate\":\"2026-07-02T00:00:00.000Z\",\"testResults\":{\"value\":\"99.0\",\"unit\":\"%\"},\"passFailStatus\":\"pass\",\"analyst\":$REVBY,\"projectId\":\"$PROGRAM\"}")
SELFID=$(cat "$OUT/qcself.json" | JQ '.data.id // empty')
CODE=$(req qcselfrev PUT "/api/cmc/qc-testing/$SELFID" '{"reviewedBy":1}')
[ "$CODE" = 409 ] && ok "the analyst cannot review their own result (409)" \
  || bad "self-review was accepted ($CODE): $(head -c200 "$OUT/qcselfrev.json")"

step "6. QA sets the specification (feeds 3.2.S.4.1)"
CODE=$(req spec POST /api/cmc/specifications "{\"projectId\":\"$PROGRAM\",\"materialType\":\"drug_substance\",\"materialName\":\"BX-701\",\"acceptanceCriteria\":{\"release\":\"98.0-102.0%\",\"shelf\":\"95.0-105.0%\"},\"testMethods\":{\"method\":\"AM-001\"},\"regulatoryBasis\":{\"ich\":\"ICH Q6B\"},\"justification\":\"Batch history n=12 supports the limits\",\"approvalStatus\":\"draft\"}")
[ "$CODE" = 200 -o "$CODE" = 201 ] && ok "specification created ($CODE)" || bad "spec failed ($CODE): $(head -c300 "$OUT/spec.json")"

step "7. Stability manager registers the study + a pull point (feeds 3.2.S.7)"
CODE=$(req stab POST /api/cmc/stability-studies "{\"productName\":\"BX-701\",\"batchNumber\":\"B-001\",\"dosageForm\":\"solution\",\"scope\":\"DS\",\"climaticZone\":\"II\",\"studyType\":\"long_term\",\"storageConditions\":[\"LT\",\"25C/60%RH\"],\"duration\":24,\"testParameters\":[\"assay\",\"aggregation\"],\"timePoints\":[\"0\",\"3\",\"6\",\"12\",\"24\"],\"status\":\"ACTIVE\",\"startDate\":\"2026-01-01T00:00:00.000Z\",\"projectId\":\"$PROGRAM\"}")
[ "$CODE" = 200 -o "$CODE" = 201 ] && ok "stability study registered ($CODE)" || bad "stability failed ($CODE): $(head -c300 "$OUT/stab.json")"

step "8. Manufacturing logs a batch (feeds 3.2.P.3 / batch analyses)"
CODE=$(req batch POST /api/cmc/batch-records "{\"batchNumber\":\"B-001\",\"productName\":\"Drug substance\",\"status\":\"in-progress\",\"yieldData\":{\"percent\":94},\"deviations\":{\"open\":0},\"projectId\":\"$PROGRAM\"}")
[ "$CODE" = 200 -o "$CODE" = 201 ] && ok "batch logged ($CODE)" || bad "batch failed ($CODE): $(head -c300 "$OUT/batch.json")"

step "8b. Packaging engineering records the container closure system + E&L (feeds 3.2.P.7)"
# The register neither section had. `scope` decides which of 3.2.S.6 / 3.2.P.7
# the system files under, and the response says whether the row reached Module 3
# at all rather than reporting an unqualified success.
CODE=$(req ccs POST /api/cmc/container-closures "{\"projectId\":\"$PROGRAM\",\"scope\":\"drug_product\",\"systemName\":\"10 mL Type I vial / 20 mm stopper\",\"componentType\":\"primary\",\"containerDescription\":\"10 mL clear Type I borosilicate glass vial\",\"closureDescription\":\"20 mm bromobutyl stopper with aluminium flip-off seal\",\"supplier\":\"Schott / West\",\"compendialStandards\":[\"USP <660>\",\"USP <381>\"],\"suitabilityJustification\":\"Protection and compatibility demonstrated over 12 months at 25C/60%RH.\",\"materialsOfConstruction\":[{\"component\":\"Vial\",\"material\":\"Type I borosilicate glass\",\"supplier\":\"Schott\",\"specification\":\"SPEC-VIAL-01\",\"compendialReference\":\"USP <660>\"}],\"extractablesLeachables\":{\"studyType\":\"Controlled extraction 40C/75%RH 6 months\",\"protocol\":\"PR-EL-014\",\"analyticalEvaluationThreshold\":\"1.5 ug/day\",\"conclusion\":\"All extractables below the AET.\",\"results\":[{\"analyte\":\"Zinc dibutyldithiocarbamate\",\"level\":\"0.4\",\"unit\":\"ug/day\",\"threshold\":\"1.5 ug/day\",\"assessment\":\"below AET\"}]},\"integrityTesting\":{\"method\":\"Helium leak (USP <1207>)\",\"acceptanceCriteria\":\"<= 6e-6 mbar L/s\",\"result\":\"2.1e-6 mbar L/s\"}}")
CCLINK=$(cat "$OUT/ccs.json" | JQ '.module3Linked // empty')
[ "$CODE" = 200 -o "$CODE" = 201 ] && [ "$CCLINK" = "true" ] \
  && ok "container closure system recorded and linked to Module 3 ($CODE)" \
  || bad "container closure failed ($CODE, module3Linked=$CCLINK): $(head -c300 "$OUT/ccs.json")"

step "8c. Analytical development records the reference standard (feeds 3.2.S.5)"
CODE=$(req rstd POST /api/cmc/reference-standards "{\"projectId\":\"$PROGRAM\",\"scope\":\"drug_substance\",\"standardCode\":\"RS-DS-001\",\"standardName\":\"BX-701 primary reference standard\",\"standardType\":\"primary\",\"materialSource\":\"DS lot B-001\",\"lotNumber\":\"RS-LOT-2405\",\"assignedValue\":\"98.7% (as-is)\",\"characterization\":[{\"attribute\":\"Identity\",\"method\":\"FTIR\",\"result\":\"Conforms to reference spectrum\"},{\"attribute\":\"Purity\",\"method\":\"RP-HPLC\",\"result\":\"99.4% area\"}],\"certificateOfAnalysis\":\"CoA-RS-001-2405\",\"qualificationProtocol\":\"PR-RS-002\",\"storageConditions\":\"-70C desiccated\",\"retestDate\":\"2027-05-01T00:00:00.000Z\"}")
RSLINK=$(cat "$OUT/rstd.json" | JQ '.module3Linked // empty')
[ "$CODE" = 200 -o "$CODE" = 201 ] && [ "$RSLINK" = "true" ] \
  && ok "reference standard recorded and linked to Module 3 ($CODE)" \
  || bad "reference standard failed ($CODE, module3Linked=$RSLINK): $(head -c300 "$OUT/rstd.json")"

step "8d. Qualification is a signature, not a field — the ungoverned path refuses, the governed one records who"
CCSID=$(cat "$OUT/ccs.json" | JQ '.data.id // empty')
RSTDID=$(cat "$OUT/rstd.json" | JQ '.data.id // empty')
# An ordinary save cannot reach 'qualified': it would record a qualification
# with no signer, no reason and no re-authentication.
CODE=$(req ccsq0 PUT "/api/cmc/container-closures/$CCSID" '{"status":"qualified"}')
[ "$CODE" = 409 ] && ok "self-declared qualification refused (409), governed path named" \
  || bad "an ordinary PUT set status=qualified ($CODE): $(head -c200 "$OUT/ccsq0.json")"
# Attribution is never caller-supplied either.
CODE=$(req ccsq1 POST "/api/cmc/container-closures/$CCSID/qualify" '{"reason":"Qualification report QR-014 accepted; E&L below the AET.","meaning":"approval","reauth":{"password":"pass-word"}}')
QBY=$(cat "$OUT/ccsq1.json" | JQ '.data.qualifiedBy // empty')
QST=$(cat "$OUT/ccsq1.json" | JQ '.data.status // empty')
QSIG=$(cat "$OUT/ccsq1.json" | JQ '.governance.actionId // empty')
[ "$CODE" = 200 ] && [ "$QST" = "qualified" ] && [ -n "$QBY" ] && [ -n "$QSIG" ] \
  && ok "container closure qualified under signature $QSIG by user $QBY" \
  || bad "governed qualify failed ($CODE): $(head -c250 "$OUT/ccsq1.json")"
# Signing twice would stamp a second person over the first.
CODE=$(req ccsq2 POST "/api/cmc/container-closures/$CCSID/qualify" '{"reason":"Attempting to re-sign an already qualified system.","meaning":"approval","reauth":{"password":"pass-word"}}')
[ "$CODE" = 409 ] && ok "a second signature over an already-qualified system is refused" \
  || bad "re-qualification was accepted ($CODE)"
CODE=$(req rstdq POST "/api/cmc/reference-standards/$RSTDID/qualify" '{"reason":"Characterisation complete; standard released for use.","meaning":"approval","reauth":{"password":"pass-word"}}')
RQST=$(cat "$OUT/rstdq.json" | JQ '.data.status // empty')
[ "$CODE" = 200 ] && [ "$RQST" = "qualified" ] && ok "reference standard qualified under signature" \
  || bad "reference standard qualify failed ($CODE): $(head -c250 "$OUT/rstdq.json")"
# The program a record is evidence for is fixed at creation.
CODE=$(req ccsmove PUT "/api/cmc/container-closures/$CCSID" '{"projectId":"00000000-0000-4000-8000-000000000000","supplier":"Schott / West Pharmaceutical"}')
MOVED=$(cat "$OUT/ccsmove.json" | JQ '.data.projectId // empty')
[ "$CODE" = 200 ] && [ "$MOVED" = "$PROGRAM" ] \
  && ok "an edit cannot repoint a record at another program (still $PROGRAM)" \
  || bad "projectId was moved by an ordinary edit ($CODE, now $MOVED)"

step "8e. Analytical development records the impurity file (feeds 3.2.S.3.2)"
# One row per impurity. The ICH threshold that governs each level is derived
# from the recorded maximum daily dose, not typed in.
CODE=$(req imp1 POST /api/cmc/impurity-profiles "{\"projectId\":\"$PROGRAM\",\"scope\":\"drug_substance\",\"materialName\":\"BX-701 drug substance\",\"impurityName\":\"Impurity A (desmethyl analogue)\",\"impurityType\":\"process-related\",\"origin\":\"Incomplete methylation at step 3\",\"observedLevel\":\"0.08\",\"levelUnit\":\"%\",\"maximumDailyDose\":\"500 mg\",\"specificationLimit\":\"NMT 0.15%\",\"analyticalMethod\":\"AM-001\",\"relativeRetentionTime\":\"0.78\",\"structure\":\"CC1=CC(=O)N\",\"controlStrategy\":\"Purged at the recrystallisation step; controlled in the DS specification.\"}")
IMPLINK=$(cat "$OUT/imp1.json" | JQ '.module3Linked // empty')
IMPID=$(cat "$OUT/imp1.json" | JQ '.data.id // empty')
[ "$CODE" = 200 -o "$CODE" = 201 ] && [ "$IMPLINK" = "true" ] \
  && ok "impurity recorded and linked to Module 3 ($CODE)" \
  || bad "impurity failed ($CODE, module3Linked=$IMPLINK): $(head -c250 "$OUT/imp1.json")"
# A residual solvent in ppm — the class ICH Q3A does not set a threshold for,
# and the unit the old table would have printed as a percentage.
CODE=$(req imp2 POST /api/cmc/impurity-profiles "{\"projectId\":\"$PROGRAM\",\"scope\":\"drug_substance\",\"materialName\":\"BX-701 drug substance\",\"impurityName\":\"Methanol\",\"impurityType\":\"residual-solvent\",\"observedLevel\":\"300\",\"levelUnit\":\"ppm\",\"maximumDailyDose\":\"500 mg\",\"analyticalMethod\":\"GC headspace\"}")
[ "$CODE" = 200 -o "$CODE" = 201 ] && ok "residual solvent recorded in ppm ($CODE)" || bad "residual solvent failed ($CODE)"
# Qualification is a signature over a RECORDED basis; with none, it refuses.
CODE=$(req impq0 POST "/api/cmc/impurity-profiles/$IMPID/qualify" '{"reason":"Attempting to qualify with no basis on file.","meaning":"approval","reauth":{"password":"pass-word"}}')
[ "$CODE" = 409 ] && ok "qualification refused over an empty qualification basis (409)" \
  || bad "signed a qualification with no basis ($CODE)"
CODE=$(req impb PUT "/api/cmc/impurity-profiles/$IMPID" '{"qualificationBasis":"Qualified by the 90-day rat study TX-114 at 12x the clinical exposure."}')
[ "$CODE" = 200 ] && ok "qualification basis recorded" || bad "could not record the basis ($CODE)"
CODE=$(req impq1 POST "/api/cmc/impurity-profiles/$IMPID/qualify" '{"reason":"Study TX-114 accepted; the level is qualified at 12x exposure.","meaning":"approval","reauth":{"password":"pass-word"}}')
IMPSIG=$(cat "$OUT/impq1.json" | JQ '.governance.actionId // empty')
[ "$CODE" = 200 ] && [ -n "$IMPSIG" ] && ok "impurity qualified under signature $IMPSIG" || bad "impurity qualify failed ($CODE)"

step "8f. Formulation development records the dissolution profiles (feeds 3.2.P.2 and 3.2.P.5)"
CODE=$(req dis1 POST /api/cmc/dissolution-profiles "{\"projectId\":\"$PROGRAM\",\"purpose\":\"development\",\"productName\":\"BX-701 film-coated tablet\",\"batchNumber\":\"BX701-DP-2406\",\"strength\":\"5 mg\",\"apparatus\":\"USP II (paddle)\",\"rotationSpeed\":\"50 rpm\",\"medium\":\"pH 6.8 phosphate buffer\",\"mediumVolume\":\"900 mL\",\"temperature\":\"37.0 +/- 0.5 C\",\"unitsTested\":12,\"results\":[{\"timepoint\":\"10\",\"meanPercent\":\"42\",\"sd\":\"3.1\",\"rsd\":\"7.4\",\"n\":\"12\"},{\"timepoint\":\"20\",\"meanPercent\":\"78\",\"sd\":\"2.6\",\"rsd\":\"3.3\",\"n\":\"12\"},{\"timepoint\":\"30\",\"meanPercent\":\"94\",\"sd\":\"1.9\",\"rsd\":\"2.0\",\"n\":\"12\"}]}")
DISLINK=$(cat "$OUT/dis1.json" | JQ '.module3Linked // empty')
[ "$CODE" = 200 -o "$CODE" = 201 ] && [ "$DISLINK" = "true" ] \
  && ok "development dissolution profile recorded and linked ($CODE)" \
  || bad "dissolution failed ($CODE, module3Linked=$DISLINK): $(head -c250 "$OUT/dis1.json")"
CODE=$(req dis2 POST /api/cmc/dissolution-profiles "{\"projectId\":\"$PROGRAM\",\"purpose\":\"release-specification\",\"productName\":\"BX-701 film-coated tablet\",\"batchNumber\":\"BX701-DP-2407\",\"apparatus\":\"USP II (paddle)\",\"rotationSpeed\":\"50 rpm\",\"medium\":\"pH 6.8 phosphate buffer\",\"mediumVolume\":\"900 mL\",\"unitsTested\":12,\"specification\":\"Q = 80% at 30 min\",\"results\":[{\"timepoint\":\"30\",\"meanPercent\":\"96\",\"sd\":\"1.4\",\"rsd\":\"1.5\",\"n\":\"12\"}]}")
[ "$CODE" = 200 -o "$CODE" = 201 ] && ok "release-specification dissolution profile recorded ($CODE)" || bad "release profile failed ($CODE)"

step "9. Change manager proposes a governed change WITH project (marks 3.2 stale)"
CODE=$(req change POST /api/cmc-changes "{\"title\":\"Bioreactor scale-up 500L→2000L\",\"dosageFormFamily\":\"biologic\",\"changeCategory\":\"scale_up\",\"scaleChangeFactor\":\"within_10x\",\"touchesCriticalStep\":true,\"affects\":\"drug_substance\",\"cmcProjectId\":\"$PROGRAM\"}")
WT=$(cat "$OUT/change.json" | JQ '.meta.module3WriteThrough // empty')
[ "$CODE" = 201 ] && ok "governed change proposed; module3WriteThrough=$WT" || bad "change failed ($CODE): $(head -c300 "$OUT/change.json")"

step "10. Build state BEFORE compile — the seam fix: 200, honest registry"
CODE=$(req bs1 GET "/api/cmc/module3-os/build-state/$PROGRAM")
REG=$(cat "$OUT/bs1.json" | JQ '.data.artifactRegistry.state // empty')
[ "$CODE" = 200 ] && ok "build-state 200 (was 500 pre-fix); artifactRegistry=$REG" || bad "build-state failed ($CODE): $(head -c300 "$OUT/bs1.json")"

step "11. Regulatory CMC author compiles Module 3"
CODE=$(req compile POST "/api/cmc/module3-os/compile/$PROGRAM" '{}')
COMPILED=$(cat "$OUT/compile.json" | JQ '.compiledCount // 0')
BRIDGED=$(cat "$OUT/compile.json" | JQ '.bridgedArtifacts | length')
SKIPPED=$(cat "$OUT/compile.json" | JQ '.bridgeSkips | length')
[ "$CODE" = 200 ] && ok "compiled $COMPILED sections; bridged=$BRIDGED artifacts; bridgeSkips=$SKIPPED" || bad "compile failed ($CODE): $(head -c400 "$OUT/compile.json")"
[ "${BRIDGED:-0}" -gt 0 ] && ok "auto-bridge created governed artifacts (pre-fix: 0, silently)" || bad "no artifacts bridged: $(cat "$OUT/compile.json" | JQ '.bridgeSkips' | head -c 300)"

step "11b. The compiled §3.2.S.4 CONTAINS the recorded QC result — captured data reaches the document"
# The whole point of QC capture: the batch-analyses table §3.2.S.4.4 exists to
# carry. It gated completeness while being absent from the composed section.
S4=$(cat "$OUT/compile.json" | jq -r '[.sections[]? | select(.sectionKey=="3.2.S.4")][0]' 2>/dev/null)
BATAB=$(echo "$S4" | jq -r '[.tables[]? | select(.title | test("Batch Analyses"))] | length' 2>/dev/null)
HASSAMPLE=$(echo "$S4" | jq -r '[.tables[]? | select(.title | test("Batch Analyses")) | .rows[]? | select(.[0]=="S-2026-001")] | length' 2>/dev/null)
NARR=$(echo "$S4" | jq -r '.narrativeDraft // ""' 2>/dev/null | grep -c "recorded QC result")
[ "${BATAB:-0}" -ge 1 ] && [ "${HASSAMPLE:-0}" -ge 1 ] && [ "${NARR:-0}" -ge 1 ] \
  && ok "§3.2.S.4 renders the batch-analyses table with sample S-2026-001 and reports it in the narrative" \
  || bad "batch analyses missing from the composed §3.2.S.4: tables=$BATAB sampleRows=$HASSAMPLE narrative=$NARR"

step "11c. The recorded shelf-life engine answers over the study on file (the AnA tools' engine)"
# One implementation, two callers: this route and AnA's
# estimate_recorded_shelf_life. A study with no recorded pull points must
# REFUSE, not fit nothing.
STABID=$(cat "$OUT/stab.json" | JQ '.data.id // .id // empty')
CODE=$(req shelf POST "/api/cmc/stability-studies/$STABID/shelf-life" '{}')
SHELFERR=$(cat "$OUT/shelf.json" | JQ '.error // empty')
if [ "$CODE" = 409 ] && echo "$SHELFERR" | grep -q "no recorded pull-point results"; then
  ok "shelf-life engine refuses a study with no recorded results (shared engine, honest refusal)"
elif [ "$CODE" = 200 ]; then
  LIMIT=$(cat "$OUT/shelf.json" | JQ '.data.limitingParameter // empty')
  ok "shelf-life estimated from recorded results (limiting attribute: $LIMIT)"
else
  bad "shelf-life engine: code=$CODE err=$(echo "$SHELFERR" | head -c 160)"
fi

step "11d. §3.2.P.7 and §3.2.S.5 compose from the two new registers — and the unrecorded side stays honestly empty"
# Four sections that could never leave zero completeness because no table
# anywhere held their source. The drug-substance container closure was NOT
# recorded, so §3.2.S.6 must still say so: a drug-product blister greening the
# drug-substance section is the exact cross-bleed the side-scoped rules prevent.
P7=$(cat "$OUT/compile.json" | jq -r '[.sections[]? | select(.sectionKey=="3.2.P.7")][0]' 2>/dev/null)
P7C=$(echo "$P7" | jq -r '.completeness // 0' 2>/dev/null)
P7MAT=$(echo "$P7" | jq -r '[.tables[]? | select(.title | test("Materials of Construction"))] | length' 2>/dev/null)
P7EL=$(echo "$P7" | jq -r '[.tables[]? | .rows[]? | select(.[] | tostring | test("Zinc dibutyldithiocarbamate"))] | length' 2>/dev/null)
[ "${P7C:-0}" = "100" ] && [ "${P7MAT:-0}" -ge 1 ] && [ "${P7EL:-0}" -ge 1 ] \
  && ok "§3.2.P.7 complete, with materials of construction and the E&L analyte rendered" \
  || bad "§3.2.P.7: completeness=$P7C materialsTables=$P7MAT elRows=$P7EL"

S5=$(cat "$OUT/compile.json" | jq -r '[.sections[]? | select(.sectionKey=="3.2.S.5")][0]' 2>/dev/null)
S5C=$(echo "$S5" | jq -r '.completeness // 0' 2>/dev/null)
S5RS=$(echo "$S5" | jq -r '[.tables[]? | .rows[]? | select(.[] | tostring | test("RS-DS-001"))] | length' 2>/dev/null)
S5CH=$(echo "$S5" | jq -r '[.tables[]? | select(.title | test("Characterisation"))] | length' 2>/dev/null)
[ "${S5C:-0}" = "100" ] && [ "${S5RS:-0}" -ge 1 ] && [ "${S5CH:-0}" -ge 1 ] \
  && ok "§3.2.S.5 complete, with the standard and its characterisation rendered" \
  || bad "§3.2.S.5: completeness=$S5C standardRows=$S5RS characterisationTables=$S5CH"

S6=$(cat "$OUT/compile.json" | jq -r '[.sections[]? | select(.sectionKey=="3.2.S.6")][0]' 2>/dev/null)
S6C=$(echo "$S6" | jq -r '.completeness // 0' 2>/dev/null)
S6N=$(echo "$S6" | jq -r '.narrativeDraft // ""' 2>/dev/null | grep -c "No container closure system is recorded for the drug substance")
[ "${S6C:-0}" = "0" ] && [ "${S6N:-0}" -ge 1 ] \
  && ok "§3.2.S.6 stays at 0% and says the drug-substance system is not recorded — no cross-bleed from the product side" \
  || bad "§3.2.S.6 wrongly served by the drug-product record: completeness=$S6C honestNarrative=$S6N"

step "11e. The impurity and dissolution registers compose into their OWN sections"
# The two defects this closes were both live in the composer: the impurity table
# appended a percent sign to whatever number it found, and both dissolution
# sections read the same first-match keys so one record served both.
S3=$(cat "$OUT/compile.json" | jq -r '[.sections[]? | select(.sectionKey=="3.2.S.3")][0]' 2>/dev/null)
S3PPM=$(echo "$S3" | jq -r '[.tables[]? | .rows[]? | select(.[] | tostring | test("300 ppm"))] | length' 2>/dev/null)
S3PCT=$(echo "$S3" | jq -r '[.tables[]? | .rows[]? | select(.[] | tostring | test("300%"))] | length' 2>/dev/null)
S3THR=$(echo "$S3" | jq -r '[.tables[]? | select(.title | test("ICH Threshold Basis"))] | length' 2>/dev/null)
[ "${S3PPM:-0}" -ge 1 ] && [ "${S3PCT:-0}" = "0" ] && [ "${S3THR:-0}" -ge 1 ] \
  && ok "§3.2.S.3.2 renders 300 ppm as ppm (never 300%) and states the ICH threshold basis" \
  || bad "§3.2.S.3.2: ppmRows=$S3PPM percentRows=$S3PCT thresholdTables=$S3THR"
# The residual solvent is refused BY CLASS and routed to the guideline that does
# govern it, and the section says which impurities it actually compared.
S3OUT=$(echo "$S3" | jq -r '.narrativeDraft // ""' 2>/dev/null | grep -c "Q3C")
S3CMP=$(echo "$S3" | jq -r '.narrativeDraft // ""' 2>/dev/null | grep -c "compared to an ICH threshold")
[ "${S3OUT:-0}" -ge 1 ] && [ "${S3CMP:-0}" -ge 1 ] \
  && ok "§3.2.S.3.2 routes the residual solvent to ICH Q3C and claims only what it compared" \
  || bad "§3.2.S.3.2 out-of-scope routing: Q3C=$S3OUT comparedClaim=$S3CMP"

P2=$(cat "$OUT/compile.json" | jq -r '[.sections[]? | select(.sectionKey=="3.2.P.2")][0]' 2>/dev/null)
P2DEV=$(echo "$P2" | jq -r '[.tables[]? | .rows[]? | select(.[] | tostring | test("BX701-DP-2406"))] | length' 2>/dev/null)
P2REL=$(echo "$P2" | jq -r '[.tables[]? | .rows[]? | select(.[] | tostring | test("BX701-DP-2407"))] | length' 2>/dev/null)
[ "${P2DEV:-0}" -ge 1 ] && [ "${P2REL:-0}" = "0" ] \
  && ok "§3.2.P.2 carries the development batch and NOT the release-specification batch" \
  || bad "§3.2.P.2 purpose bleed: developmentRows=$P2DEV releaseRows=$P2REL"
P5=$(cat "$OUT/compile.json" | jq -r '[.sections[]? | select(.sectionKey=="3.2.P.5")][0]' 2>/dev/null)
P5REL=$(echo "$P5" | jq -r '[.tables[]? | .rows[]? | select(.[] | tostring | test("BX701-DP-2407"))] | length' 2>/dev/null)
P5DEV=$(echo "$P5" | jq -r '[.tables[]? | .rows[]? | select(.[] | tostring | test("BX701-DP-2406"))] | length' 2>/dev/null)
[ "${P5REL:-0}" -ge 1 ] && [ "${P5DEV:-0}" = "0" ] \
  && ok "§3.2.P.5 carries the release-specification batch and NOT the development batch" \
  || bad "§3.2.P.5 purpose bleed: releaseRows=$P5REL developmentRows=$P5DEV"

step "12. Contradiction sweep"
CODE=$(req sweep POST "/api/cmc/module3-os/contradictions/$PROGRAM" '{}')
FOUND=$(cat "$OUT/sweep.json" | JQ '.contradictions | length')
[ "$CODE" = 200 ] && ok "sweep complete — $FOUND finding(s)" || bad "sweep failed ($CODE)"

step "12b. QA resolves each open finding with a recorded note"
CODE=$(req open GET "/api/cmc/module3-os/contradictions/$PROGRAM")
RESOLVED=0
for CID in $(cat "$OUT/open.json" | jq -r '(.data // []) | map(select(.status != "resolved")) | .[].id' 2>/dev/null); do
  CODE=$(req "resolve-$CID" PATCH "/api/cmc/module3-os/contradictions/$CID/resolve" '{"resolutionNote":"Method AM-001 validation report VR-021 attached; status corrected in the method library."}')
  [ "$CODE" = 200 ] && RESOLVED=$((RESOLVED+1)) || echo "     resolve $CID -> $CODE"
done
ok "resolved $RESOLVED finding(s) with notes in the provenance chain"

step "13. Export gate MUST refuse now (nothing approved) — fail closed"
CODE=$(req gate1 POST "/api/cmc/module3-os/guard/final-export/$PROGRAM" '{}')
[ "$CODE" = 409 ] && ok "gate refused (409): $(cat "$OUT/gate1.json" | JQ '.error' | head -c120)" || bad "gate did NOT refuse an unapproved project ($CODE)"

step "14. Placement MUST refuse the same way — same gate, before any write"
LEAVES_BEFORE=$(PGPASSWORD=c2c_local psql -h 127.0.0.1 -U c2c -d clinicalsage -tAc "SELECT count(*) FROM submission_leaves")
CODE=$(req place1 POST "/api/cmc/module3-os/place-into-submission/$PROGRAM" '{"submissionId":1,"sequenceId":1}')
LEAVES_AFTER=$(PGPASSWORD=c2c_local psql -h 127.0.0.1 -U c2c -d clinicalsage -tAc "SELECT count(*) FROM submission_leaves")
[ "$CODE" = 409 ] && [ "$LEAVES_BEFORE" = "$LEAVES_AFTER" ] && ok "placement refused (409), zero leaves written" || bad "placement did not refuse cleanly ($CODE; leaves $LEAVES_BEFORE→$LEAVES_AFTER)"

step "15. QA approves every compiled section (Part 11 re-auth each time)"
SECTIONS=$(cat "$OUT/compile.json" | jq -r '.sections[].sectionKey' 2>/dev/null)
APPROVED=0; APPROVE_FAIL=0
for SK in $SECTIONS; do
  CODE=$(req "approve-$SK" POST "/api/cmc/module3-os/sections/$PROGRAM/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$SK")/approve" \
    '{"reason":"Section content verified against source data","meaning":"TECHNICAL_APPROVAL","reauth":{"password":"pass-word"}}')
  if [ "$CODE" = 200 ]; then APPROVED=$((APPROVED+1)); else APPROVE_FAIL=$((APPROVE_FAIL+1)); echo "     approve $SK -> $CODE $(head -c200 "$OUT/approve-$SK.json")"; fi
done
[ "$APPROVE_FAIL" = 0 ] && ok "approved $APPROVED sections" || bad "$APPROVE_FAIL section approvals failed"

step "16. Export gate now"
CODE=$(req gate2 POST "/api/cmc/module3-os/guard/final-export/$PROGRAM" '{}')
if [ "$CODE" = 200 ]; then ok "gate passed"; else bad "gate still refuses ($CODE): $(cat "$OUT/gate2.json" | JQ '.error')"; fi

step "17. Find the submission spine the program intake created"
CODE=$(req subs GET /api/submissions)
SUBMISSION=$(cat "$OUT/subs.json" | jq -r 'if type=="array" then . else (.data // []) end | map(select((.title=="BX-701 IND") or (.productName=="BX-701"))) | .[0].id // empty' 2>/dev/null)
[ -n "$SUBMISSION" ] && ok "submission spine id=$SUBMISSION" || bad "submission spine not found: $(head -c300 "$OUT/subs.json")"

step "18. Create sequence 0001 for it"
CODE=$(req seq POST "/api/submissions/$SUBMISSION/sequences" '{"sequenceNumber":"0001","type":"original","region":"fda"}')
SEQ=$(cat "$OUT/seq.json" | jq -r 'if type=="array" then .[0] else (.data // .) end | .id // empty' 2>/dev/null)
[ -n "$SEQ" ] && ok "sequence id=$SEQ" || bad "sequence create failed ($CODE): $(head -c300 "$OUT/seq.json")"

step "19. Place the approved Module 3 into the sequence"
CODE=$(req place2 POST "/api/cmc/module3-os/place-into-submission/$PROGRAM" "{\"submissionId\":$SUBMISSION,\"sequenceId\":$SEQ}")
PLACED=$(cat "$OUT/place2.json" | JQ '.data.placements | length')
PSKIP=$(cat "$OUT/place2.json" | JQ '.data.skipped | length')
[ "$CODE" = 200 ] && [ "${PLACED:-0}" -gt 0 ] && ok "$PLACED section(s) placed as leaves ($PSKIP skipped with reasons)" || bad "placement failed ($CODE): $(head -c400 "$OUT/place2.json")"
echo "   placed: $(cat "$OUT/place2.json" | jq -r '.data.placements[].leafSectionCode' 2>/dev/null | tr '\n' ' ')"

step "19b. The REAL eCTD generator materializes the placed Module 3"
CODE=$(req ectd POST "/api/ectd-compile/$PROGRAM/compile" '{}')
RENDERED=$(cat "$OUT/ectd.json" | JQ '.leafFilesRendered // .data.leafFilesRendered // 0')
UNRENDERED=$(cat "$OUT/ectd.json" | jq -r '.xmlBackbone // .data.xmlBackbone // ""' 2>/dev/null | grep -c 'rendered="false"')
STATUS=$(cat "$OUT/ectd.json" | JQ '.status // .data.status // empty')
if [ "$CODE" = 200 ] && [ "$STATUS" = "completed" ] && [ "${RENDERED:-0}" -ge 17 ] && [ "${UNRENDERED:-1}" = 0 ]; then
  ok "eCTD compile completed — $RENDERED real PDF leaves, zero placeholder leaves"
else
  bad "eCTD compile: code=$CODE status=$STATUS rendered=$RENDERED placeholders=$UNRENDERED"
fi
# The initial-sequence gate RECOGNIZES the placed Module 3: no required 3.2.*
# section (3.2.S / 3.2.P / 3.2.R) may read as unplaced. This pins two fixes at
# once — the gate's 'm'-prefix blindness, and 3.2.R being composable at all.
M3REQ=$(cat "$OUT/ectd.json" | jq '[.validationResults[]? | select(.rule=="REQUIRED_SECTION_UNPLACED" and ((.sectionCode // "")|startswith("3.2")))] | length' 2>/dev/null)
[ "${M3REQ:-1}" = 0 ] && ok "every required Module 3 section (3.2.S / 3.2.P / 3.2.R) is placed and recognized" || bad "required Module 3 sections still unplaced: $M3REQ"

step "20. The IND checklist sees the M3 leaves"
CODE=$(req checklist GET /api/ind-checklist)
M3=$(cat "$OUT/checklist.json" | jq '[.data[0].sections[]? | select(.code | tostring | startswith("m3"))] | length' 2>/dev/null)
[ "$CODE" = 200 ] && [ "${M3:-0}" -ge 17 ] && ok "checklist shows $M3 Module 3 sections" || bad "checklist m3 sections=$M3 ($CODE)"

step "21. The data room lists the Module 3 branch + an upload"
echo 'stability summary placeholder' > /tmp/stab-summary.txt
UPCODE=$(curl -sS -X POST "$BASE/api/vault/ingest" -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/stab-summary.txt" -F "programId=$PROGRAM" -F "documentCode=stab-summary.txt" \
  -F "documentTitle=Stability summary" -F "documentType=MODULE_3" -o "$OUT/upload.json" -w '%{http_code}')
CODE=$(req vault GET "/api/c2c/project-vault/$PROGRAM")
M3BRANCH=$(cat "$OUT/vault.json" | jq -r '.data.tree[] | select(.id=="m3-cmc") | .children | length' 2>/dev/null)
# The uploads branch is evolving into the filing cabinet (id 'cabinet', per
# the vault workstream); accept either shape so this check tracks the intent —
# "the ingested file is listed" — not one workstream's branch id.
UPBRANCH=$(cat "$OUT/vault.json" | jq -r '[.data.tree[] | select(.id=="vault-uploads" or .id=="cabinet")] | map(.. | objects | select(has("title"))) | length' 2>/dev/null)
[ "$CODE" = 200 ] && ok "vault read-model 200" || bad "vault failed ($CODE)"
[ -n "$M3BRANCH" ] && [ "${M3BRANCH:-0}" -gt 0 ] && ok "Module 3 (CMC) branch lists $M3BRANCH artifacts" || bad "Module 3 branch missing: unavailable=$(cat "$OUT/vault.json" | JQ '.data.unavailable')"
[ "$UPCODE" = 200 -o "$UPCODE" = 201 ] && [ -n "$UPBRANCH" ] && [ "${UPBRANCH:-0}" -gt 0 ] && ok "upload ($UPCODE) appears in Uploaded files branch ($UPBRANCH)" || bad "upload branch: ingest=$UPCODE listed=$UPBRANCH $(head -c200 "$OUT/upload.json")"

step "22. Governed change marked sections stale → gate refuses again (fail closed end-to-end)"
CODE=$(req change2 POST /api/cmc-changes "{\"title\":\"Filter membrane change\",\"dosageFormFamily\":\"biologic\",\"changeCategory\":\"manufacturing_process\",\"processChangeKind\":\"minor_adjustment\",\"cmcProjectId\":\"$PROGRAM\"}")
WT2=$(cat "$OUT/change2.json" | JQ '.meta.module3WriteThrough // empty')
CODE=$(req gate3 POST "/api/cmc/module3-os/guard/final-export/$PROGRAM" '{}')
if [ "$WT2" = "recorded" ] && [ "$CODE" = 409 ]; then
  ok "change write-through=$WT2; gate now refuses (409): $(cat "$OUT/gate3.json" | JQ '.error' | head -c100)"
else
  bad "convergence loop: writeThrough=$WT2 gate=$CODE"
fi

step "23. Regulatory lead logs an agency question (the correspondence WRITE half)"
CODE=$(req qlog POST /api/cmc/agency-questions '{"questionText":"[SIM] Provide leachables data for the container closure system.","sectionReference":"3.2.P.7","region":"EMA","priority":"high","dueDate":"2027-01-15"}')
QID=$(cat "$OUT/qlog.json" | JQ '.data.id // empty')
[ "$CODE" = 201 ] && [ -n "$QID" ] && ok "question logged (id=$QID, OPEN, org-stamped)" || bad "log question: $CODE $(head -c150 "$OUT/qlog.json")"

step "24. The board's correspondence lists it, ordered into the open set"
CODE=$(req board2 GET /api/cmc/module3-board)
LISTED=$(cat "$OUT/board2.json" | jq --argjson id "${QID:-0}" '[.data.correspondence[]? | select(.id == $id)] | length' 2>/dev/null)
[ "$CODE" = 200 ] && [ "${LISTED:-0}" = 1 ] && ok "board correspondence lists question $QID" || bad "board listing: code=$CODE listed=$LISTED"

step "25. Triage: DRAFTED with a LINKED response draft, then CLOSED — the row leaves the open list, stays in the record"
# The response draft is a real governed authoring document; the link is
# refused unless the doc exists in THIS org (a dangling "Open draft" would be
# a door that opens nothing).
CODE=$(req rdoc POST /api/authoring/docs '{"title":"[SIM] Response to agency question — §3.2.P.7","module":"M3"}')
RDOC=$(cat "$OUT/rdoc.json" | JQ '.document.id // empty')
[ "$CODE" = 200 -o "$CODE" = 201 ] && [ -n "$RDOC" ] && ok "response draft created ($RDOC)" || bad "response draft create: $CODE $(head -c150 "$OUT/rdoc.json")"
# A bogus link is refused outright — nothing recorded.
CODE=$(req qbadlink PATCH "/api/cmc/agency-questions/$QID" '{"responseDocId":"00000000-0000-4000-8000-000000000000"}')
[ "$CODE" = 400 ] && ok "dangling responseDocId refused (400, nothing linked)" || bad "dangling link accepted?! code=$CODE"
CODE=$(req qdraft PATCH "/api/cmc/agency-questions/$QID" "{\"status\":\"DRAFTED\",\"assignedTo\":\"reg.author@sim\",\"responseDocId\":\"$RDOC\"}")
ST=$(cat "$OUT/qdraft.json" | JQ '.data.status // empty')
LNK=$(cat "$OUT/qdraft.json" | JQ '.data.responseDocId // empty')
[ "$CODE" = 200 ] && [ "$ST" = "DRAFTED" ] && [ "$LNK" = "$RDOC" ] && ok "status → DRAFTED, response draft linked" || bad "draft patch: $CODE $ST link=$LNK"
# The board serves the link, so "Open draft" works after any reload.
CODE=$(req board2b GET /api/cmc/module3-board)
BLNK=$(cat "$OUT/board2b.json" | jq -r --argjson id "${QID:-0}" '[.data.correspondence[]? | select(.id == $id)][0].responseDocId // empty' 2>/dev/null)
[ "$CODE" = 200 ] && [ "$BLNK" = "$RDOC" ] && ok "board serves the linked draft id" || bad "board link: code=$CODE link=$BLNK"
# The review leg: DRAFTED → IN_REVIEW, guarded on the status the screen read.
CODE=$(req qreview PATCH "/api/cmc/agency-questions/$QID" '{"status":"IN_REVIEW","expectedStatus":"DRAFTED"}')
ST=$(cat "$OUT/qreview.json" | JQ '.data.status // empty')
[ "$CODE" = 200 ] && [ "$ST" = "IN_REVIEW" ] && ok "sent for review (IN_REVIEW)" || bad "send for review: $CODE $ST"
# A STALE transition (a screen that still thought DRAFTED) is a stated 409 —
# never a silent overwrite of the reviewer's state.
CODE=$(req qstale PATCH "/api/cmc/agency-questions/$QID" '{"status":"IN_REVIEW","expectedStatus":"DRAFTED"}')
[ "$CODE" = 409 ] && ok "stale transition answers 409 (row is IN_REVIEW now)" || bad "stale transition: $CODE"
CODE=$(req qclose PATCH "/api/cmc/agency-questions/$QID" '{"status":"CLOSED"}')
ST=$(cat "$OUT/qclose.json" | JQ '.data.status // empty')
CODE2=$(req board3 GET /api/cmc/module3-board)
GONE=$(cat "$OUT/board3.json" | jq --argjson id "${QID:-0}" '[.data.correspondence[]? | select(.id == $id)] | length' 2>/dev/null)
[ "$CODE" = 200 ] && [ "$ST" = "CLOSED" ] && [ "${GONE:-1}" = 0 ] && ok "closed: off the open list ($GONE), kept in the store" || bad "close: code=$CODE st=$ST stillListed=$GONE"
# "Stays in the record" is now READABLE: the closed file serves the row…
CODE=$(req qclosedlist GET "/api/cmc/agency-questions?status=CLOSED")
INFILE=$(cat "$OUT/qclosedlist.json" | jq --argjson id "${QID:-0}" '[.data[]? | select(.id == $id)] | length' 2>/dev/null)
[ "$CODE" = 200 ] && [ "${INFILE:-0}" = 1 ] && ok "closed file lists the answered question" || bad "closed file: code=$CODE listed=$INFILE"
# …and a mistaken close can be UNDONE, guarded on CLOSED, back to the truthful
# state (DRAFTED — its response draft is linked).
CODE=$(req qreopen PATCH "/api/cmc/agency-questions/$QID" '{"status":"DRAFTED","expectedStatus":"CLOSED"}')
ST=$(cat "$OUT/qreopen.json" | JQ '.data.status // empty')
[ "$CODE" = 200 ] && [ "$ST" = "DRAFTED" ] && ok "reopened to DRAFTED (guarded on CLOSED)" || bad "reopen: $CODE $ST"
req qreclose PATCH "/api/cmc/agency-questions/$QID" '{"status":"CLOSED","expectedStatus":"DRAFTED"}' >/dev/null

echo; echo "════ RESULT: $PASS passed, $FAIL failed ════"
exit $([ "$FAIL" = 0 ] && echo 0 || echo 1)

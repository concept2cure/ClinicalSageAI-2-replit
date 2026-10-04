# Reporting & analytics review, 2026-10-01: Provenance (deterministic engines, model narrates)

Generated from workflow `wf_527b6067-e34`: the lens's own report, then the refuting verifier's verdict on every blocker, high and medium. Low findings were not independently verified. Paths are as the agents wrote them. Line numbers are at the head they read and may have moved since. The README in this directory records which findings were fixed afterwards, and by which commit.

## PROVENANCE-1. [blocker] The prediction report types seal as 'final' because the truthfulness gate never reads forbidFinal or requireDisclosure

- **Where:** `server/services/report-os/truthfulness.ts:17`
- **Impact:** Take an owner, admin or manager on the Professional plan. They click the suggested chip 'What is my CRL risk?' (Insights.tsx:396) and then 'Export report'. POST /runs/:id/finalize seals a 'CRL / RTF Pre-Mortem' or 'Predictive Regulatory Forecast' run as final: the toast reads 'Sealed · sha256 … · run locked final'. The governed PDF then prints 'Status: final'. That happens even though the type declares forbidFinal, three blockers are outstanding and the report carries no disclosure block. Moments earlier the canvas told the user the result is 'held at partial, never final' (Insights.tsx:525). The result is a sealed Part 11 record that contradicts its own type definition.
- **Evidence:** taxonomy.ts:462 and :480 both read `truthfulnessRules: { allowPartial: true, forbidFinal: true, requireDisclosure: true }`. The deployed registry carries the same rules (migrations/20260930_report_type_registry_seed.sql:80-81). truthfulness.ts:17-24 `interface TruthfulnessRules { allowPartial?; requireBlockers?; requireConfidence?; forbidFinalIfMissingCritical?; requireExplicitGaps?; ... }` declares neither key. A grep for `forbidFinal\b|requireDisclosure` across server, shared, scripts and migrations matches only the seed data and nothing that enforces them. report-os.ts:1872 `if (truthfulness.allowedStatus !== 'final') {` is followed by report-os.ts:1880 `const seal = buildSealedRecord(rendered);`, and report-os.ts:741 prints `Confidence: ${params.run.confidence ?? 'N/A'}` with the run status. I ran the real evaluateTruthfulness, renderReport and buildSealedRecord in a scratchpad on what orchestrator.ts returns for program scope. Output: `prediction.regulatory_forecast | finalize -> final | confidence 35 | disclosure block: false | atoms: 0`, `prediction.crl_rtf_premortem | finalize -> final | ...`. The control case was held: `readiness.executive_digest | finalize -> partial`. No test covers forbidFinal (grep of server/services/report-os/__tests__ and server/routes/__tests__ finds none).
- **Suggested fix:** Implement both rules in evaluateTruthfulness. forbidFinal: allowedStatus can never be 'final', so finalize answers 409. requireDisclosure: refuse to render or seal without a disclosure block. Add red-then-green tests for both prediction types through POST /finalize.
- **Verifier:** real = `False`, severity = `none`.

  > The finding is not open at HEAD. It describes code from before commit f6d2c089, "Reporting: a prediction is never sealed final, and 'No gaps detected' is printed only after a gap check" (2026-10-01 06:43). That commit is an ancestor of HEAD 08ed96a9 on concept2cure-v2.
  > 
  > What HEAD actually contains:
  > - server/services/report-os/truthfulness.ts:24-26 declares `forbidFinal?: boolean;` and `requireDisclosure?: boolean;`. RunTruthfulnessState:43 adds `disclosure: boolean`. The cited line 17 is now only the opening of the interface.
  > - truthfulness.ts:73 reads `if (rules.requireDisclosure && !state.disclosure && status !== 'draft') { status = 'draft'; ... }`.
  > - truthfulness.ts:79 reads `if (rules.forbidFinal && status === 'final') { status = rules.allowPartial === true ? 'partial' : 'draft'; ... }`.
  > - The only seal path is POST /runs/:id/finalize. At server/routes/report-os.ts:1756-1765, buildRenderedFromRun calls evaluateTruthfulness with `disclosure: false`, using the registry rules read at :1867-1871. Then report-os.ts:1874 `if (truthfulness.allowedStatus !== 'final') { return res.status(409)... }` refuses before `buildSealedRecord` at :1882.
  > - For both prediction types, requireDisclosure holds the run at draft, so finalize returns 409 "Report is not eligible to be finalized" with the reasons. The run is never sealed and the PDF never prints "Status: final".
  > - No other path writes `status = 'final'`. The only UPDATE (report-os.ts:486) sits inside finalizeOnChain, and finalize is its only caller.
  > - The canvas render path (canvas/render-report.ts:55-64) also passes `disclosure: false` and requests partial.
  > - The deployed registry carries the rules: migrations/20260930_report_type_registry_seed.sql:80-81 has `"forbidFinal":true,"requireDisclosure":true`. Its `ON CONFLICT (type_id) DO UPDATE SET` (:114) means existing rows are refreshed on every deploy.
  > - Tests: server/services/report-os/__tests__/truthfulness.test.ts:250-272 adds an "advisory report types" suite. It covers: no disclosure leads to draft; never final even with a disclosure; forbidFinal without allowPartial leads to draft. I ran it at HEAD and all 21 tests passed.
  > 
  > The mechanism was real before f6d2c089, but it is fixed at HEAD. The only remaining gap is test coverage: there is no route-level red-then-green test through POST /finalize, only the unit test. That is a test-coverage note, not an open defect.

  Correction: Refuted at HEAD: the fix is already in commit f6d2c089. truthfulness.ts:73 enforces requireDisclosure (drops the run to draft) and :79 enforces forbidFinal. report-os.ts:1874 then returns 409 before buildSealedRecord, so neither prediction type can be sealed final. What's still missing is a route-level test that runs POST /runs/:id/finalize on a prediction.* run and expects a 409; today only the unit test covers it.

## PROVENANCE-2. [high] The canvas 'Predictive Regulatory Forecast' and 'CRL/RTF Pre-Mortem' run no prediction model: they are the generic readiness run under a prediction title, sold behind the Professional lock

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:525`
- **Impact:** A Professional customer asks for a forecast or their CRL risk. What comes back is the same blocker-count 'Confidence' and provider table the Standard digest shows, titled as a prediction. It contains no RTF, CRL or approval probability and no method disclosure. Yet the pane says 'every projected value carries a disclosure'. The plan lock ('Professional plan unlocks CRL / RTF Pre-Mortem', Insights.tsx:1142) advertises a capability this surface never delivers. Classification: a constant label over a deterministic heuristic. No model is involved, and no figure exists for what the title names.
- **Evidence:** Insights.tsx:522 `const t = RO_TYPES.find(x => x.typeId === (isPre ? 'prediction.crl_rtf_premortem' : 'prediction.regulatory_forecast'))!;` leads to Insights.tsx:525 `It is advisory — the model is not validated, so every projected value carries a disclosure and the result is held at partial, never final.`, and runReport then posts to `'/api/report-os/runs'` (Insights.tsx:870). On the server, report-os.ts:1493 `const computed = await computeInitialRun(orgId, scopeType, scopeId, {` runs for every type and has no prediction branch. render.ts:76 `execBlocks.push({ kind: 'metric', label: 'Confidence', value: input.confidence, unit: '%' });` and the renderer emits no 'disclosure' block. The real prediction path, report-os-insights.ts:281 `router.post('/predictions/run'` with `assertHasDisclosure(report)` at :349, has no client caller: a grep of client/src for `/api/insights/` finds nothing, and the only reference is a comment at insights-canvas-routes.ts:23.
- **Suggested fix:** Route prediction intents to POST /api/insights/predictions/run, which has an honest 422 when no assessment exists. Until a prediction model backs these types, remove them from the canvas and from the plan-lock copy.
- **Verifier:** real = `True`, severity = `high`.

  > I confirmed the finding at HEAD 726fd207 on concept2cure-v2. It is not in the DP-45..DP-57 register or the D2 README. Commit f6d2c089 (2026-10-01) lists it in its own message as still open: "Still open from the same review, next: the canvas sends prediction intents to the generic run instead of /api/insights/predictions/run, which carries a real disclosure".
  > 
  > How it works, read at HEAD:
  > 
  > 1. **A real user can reach it, two ways.**
  >    - Typing anything with predict, forecast or risk routes to get_prediction (Insights.tsx:346). Insights.tsx:520-525 picks `prediction.crl_rtf_premortem` or `prediction.regulatory_forecast` and replies: "It is advisory — the model is not validated, so every projected value carries a disclosure and the result is held at partial, never final." The type then goes to runReport, which calls `apiRequest('POST', '/api/report-os/runs', …)` (Insights.tsx:875).
  >    - The "Pre-approval command pack" and "BLA assembly pack" preset tiles (Insights.tsx:272, :276) also run these types through runReport.
  > 
  > 2. **The server accepts the request.** Both type IDs are seeded into the deployed registry (migrations/20260930_report_type_registry_seed.sql:80-81), so POST /runs returns 201 for a Professional org rather than an honest 404.
  > 
  > 3. **No prediction runs.** The handler (report-os.ts:1421) has no prediction branch. computeInitialRun (report-os.ts:1493) is the generic readiness run. computeDomainReport only covers the fcoi, ha, iacuc, irb and ibc registers. The confidence is the heuristic `Math.max(25, Math.min(95, 95 - blockers.length * 20))` (orchestrator.ts:340), or a blend of it with the readiness score (orchestrator.ts:318).
  > 
  > 4. **The rendered report has no disclosure or prediction content.** buildRenderedFromRun hardcodes `disclosure: false` (report-os.ts:1763-1764). renderReport puts out a summary, `{ kind: 'metric', label: 'Confidence', … }` (render/render.ts:128, not render.ts:76), the readiness score and level, a provider table, blockers and gaps. There is no disclosure block and no RTF, CRL or approval figure.
  > 
  > 5. **The real path has no caller.** `router.post('/predictions/run'` is at report-os-insights.ts:281, with `assertHasDisclosure(report)` at :349, mounted at /api/insights (register-inline-routes.ts:217). Grepping client/src finds no caller. The only reference is a comment at insights-canvas-routes.ts:23.
  > 
  > 6. **The plan lock sells it.** Insights.tsx:1147-1148 (not 1142) shows "{Professional} plan unlocks CRL / RTF Pre-Mortem … No estimated result is shown on a plan that has not unlocked the governed model." The server gate requireReportEntitlement also requires Professional.
  > 
  > **What softens it, partly.** Since f6d2c089, truthfulness.ts:73 holds these types at draft when there is no disclosure. The on-screen report therefore starts with "Status downgraded … held at draft. Reasons: This report type must disclose its method and limits, and this rendering carries no disclosure". On screen, the report admits it has no disclosure. It does not say that no prediction model ran. It also contradicts the canvas's "held at partial" claim, which is now wrong twice over.
  > 
  > **Why I keep it at high.**
  > - The draft hold does not reach the downloaded file. exportRep (Insights.tsx:1032) fetches export.pdf after finalize returns 409.
  > - createRunPdf (report-os.ts:738-741) prints `Report Type: CRL / RTF Pre-Mortem`, `Status: ${run.status}` and `Confidence: ${run.confidence}`. That status is the stored 'completed' when there are no blockers, otherwise 'partial'.
  > - The PDF has no disclosure and no draft reason.
  > - So a paying customer can download a "CRL / RTF Pre-Mortem" reading "Status: completed, Confidence: 95". It is a blocker-count heuristic, and nothing in it says no prediction model was involved.
  > - This breaks the repo's "fail closed, never fabricate" rule for a gated, paid capability.
  > 
  > **Why not blocker.** The figures come from a deterministic readiness heuristic, not invented ones. The on-screen report is held at draft with a stated reason.
  > 
  > **Citation corrections.** render.ts:76 is actually server/services/report-os/render/render.ts:128. Insights.tsx:870 is :875. Insights.tsx:1142 is :1147-1148. The server now holds these runs at draft, not partial.

  Correction: Keep the finding at high and correct its citations and reasoning:
- **Citations:** the Confidence metric is at server/services/report-os/render/render.ts:128. The POST call is at Insights.tsx:875. The plan-lock copy is at Insights.tsx:1147-1148.
- **Status:** since f6d2c089, the screen shows these runs held at draft with a "carries no disclosure" reason. That partly softens the screen view, but it still never says that no prediction model ran.
- **Add to the impact:** the canvas export (Insights.tsx:1032) still downloads report-os.ts createRunPdf (:738-741). That PDF prints "Report Type: CRL / RTF Pre-Mortem", the stored "Status: completed|partial" and the heuristic "Confidence", with no disclosure and no draft reason.
- **Suggested fix, step one:** send get_prediction intents and prediction-type pack tiles to POST /api/insights/predictions/run. Its body has a different shape: `kind`, plus `scopeId`/`submissionType`/`agency` for the forecast and `projectId`/`submissionId`/`targetAgency` for the pre-mortem. Show its 422 `no_assessment` as an honest empty state.
- **Suggested fix, step two:** in POST /api/report-os/runs, refuse family 'prediction' (for example 409 or 422 with a pointer to /api/insights/predictions/run). This stops a direct API caller or a scheduled run from producing a generic run titled as a prediction.
- **Suggested fix, step three:** make createRunPdf print the truthfulness-evaluated status, not the raw run.status.

## PROVENANCE-3. [high] The headline 'readiness %' is a blocker-count heuristic clamped to [25, 95]: an empty program reads '25% ready' and the 'not yet computed' branch can never run

- **Where:** `server/services/report-os/orchestrator.ts:340`
- **Impact:** The opener, the regional comparison and the portfolio rings show 'X is 25% ready' for a program with no artifacts, no sections and no registry context. A fully approved program can never exceed 95. The figure is the run's 'confidence' (95 minus 20 per blocker string, floored at 25), not readiness. The report for the same program shows a different 'Readiness score' (evaluateReadiness), so the screen gives two readiness numbers for one program. The same floored value is printed as 'Confidence' in the exported PDF. Classification: deterministic, with a constant floor and ceiling that fabricate a value where nothing was measured.
- **Evidence:** orchestrator.ts:340 `const confidence = Math.max(25, Math.min(95, 95 - blockers.length * 20));` and orchestrator.ts:317-321 (the same clamp, blended 0.55/0.45 with readiness.score). fetch.ts:60 clamps the value and fetch.ts:71 sets `readinessScore: confidence,`. insights-canvas-routes.ts:196 `readiness: insight.readinessScore,` is always a number, so Insights.tsx:386 (`…submission readiness is not yet computed`) is unreachable. Insights.tsx:387 renders `${p.code} is ${p.readiness}% ready`. Insights.tsx:197-203 itself quotes a real screen reading "1 is 25% ready". render.ts:80-87 shows the separate 'Readiness score' (regulatory.readinessScore). report-os.ts:741 prints `Confidence: ${params.run.confidence ?? 'N/A'}` in the PDF.
- **Suggested fix:** Expose evaluateReadiness's score (or null when no registry context or no artifacts) as readiness. Keep 'confidence' under its own name. Remove the 25 floor, or return null and let the existing 'not yet computed' branch render.
- **Verifier:** real = `False`, severity = `none`.

  > The finding is refuted at HEAD: it describes code that was already fixed. The mechanism was real at the diff the lens reviewed. But commit 798bb6ef ("Reporting: 'readiness' is the evaluated readiness, or it says it was not computed", 2026-10-01, from this same reporting review) is an ancestor of HEAD 726fd207 on concept2cure-v2, and it removes every path the finding cites:
  > 
  > - The cited line is gone. `fetch.ts:71 readinessScore: confidence,` no longer exists. At HEAD, server/services/report-os/portfolio/fetch.ts:81 reads `readinessScore: evaluatedReadiness(computed),`. Per fetch.ts:57-61, evaluatedReadiness returns `summary.regulatory.readinessScore` (the evaluateReadiness score, clamped 0..100), or `null` when the run evaluated none. The doc comment at fetch.ts:48-54 records the old bug ("a program with nothing in it read '25% ready'").
  > - An empty program now reads "not yet computed". With no registry context the orchestrator returns no `summary.regulatory` (orchestrator.ts:340-357), so readiness is null. insights-canvas-routes.ts:198/216 pass that null through (the types at :103/:124 are `number | null`), and Insights.tsx:385-386 renders "…submission readiness is not yet computed". That branch is now reachable.
  > - The screen no longer shows two readiness numbers. The canvas figure and the report's "Readiness score" (render.ts) now share one source, evaluateReadiness. "Confidence" keeps its own name in toLeadProgram and toPortfolioProgram (insights-canvas-routes.ts:199/217).
  > - The board view and the per-market note handle null. The board average uses only programs that have a readiness and labels the rest "not computed" (Insights.tsx:721-731). The per-market note shows only when `prog.readiness != null` (:760-762). aggregate.ts:85 uses roundedMeanOrNull, and the ranking at :66-67 treats null explicitly.
  > - No other route still does this. Searching server, client/src/concept2cure and shared for a `readiness…: …confidence` mapping finds nothing.
  > - The fix's tests pass at HEAD. fetch.test.ts, portfolio.test.ts and insightsReadinessHonesty.test.tsx ran 28/28, including "reads no readiness when the run evaluated none, whatever its confidence".
  > 
  > **What is still at HEAD (not this finding; low at most):** orchestrator.ts:317-321 and :340 still clamp `confidence` to [25, 95]. An empty project scope collects 4 blockers (orchestrator.ts:94, 111, 128, 153): 95 − 80 = 15, floored to 25. The 25 is shown only under the label "Confidence": the executive summary (render.ts:126 "Overall confidence 25", :128 metric 'Confidence') and the PDF (report-os.ts:726 `Confidence: ${params.run.confidence ?? 'N/A'}`). Because status is still derived from confidence (fetch.ts:72-76 `confidence > 0 ? 'partial' : 'missing'`), an empty program with no critical blockers is counted under "Programs partial", never "missing" (aggregate.ts:148-149). These are labeled honestly as confidence and status, so they do not support the high-severity claim that a fabricated readiness % is shown. Note also that the working tree has uncommitted edits to server/routes/report-os.ts; this verdict is based on committed HEAD.

  Correction: Refuted at HEAD: commit 798bb6ef (an ancestor of HEAD 726fd207) fixed it. fetch.ts:81 now sets `readinessScore: evaluatedReadiness(computed)` (the evaluateReadiness score, or null), so "not yet computed" (Insights.tsx:386) is reachable and an empty program no longer reads "25% ready". The 28 tests in the fix's three suites pass. If anything is filed, re-scope it to the low-severity residual: orchestrator.ts:340 (and :317-321) still floors `confidence` at 25 and caps it at 95. That value is printed as "Overall confidence 25" / "Confidence" in render.ts:126-128 and the PDF (report-os.ts:726). It also drives member status (fetch.ts:72-76), so an empty program with no critical blockers counts as "partial", never "missing". Fix for that residual: drop the 25 floor (or return null when no artifacts exist), and derive "missing" from artifactCount === 0 instead of confidence > 0.

## PROVENANCE-4. [high] A 'No gaps detected' verdict is printed when no gap check ran, and requireExplicitGaps is vacuous, so the Compliance & Audit Assurance Pack seals final over its own blockers

- **Where:** `server/services/report-os/render/render.ts:138`
- **Impact:** Every canvas report is program-scoped, so every one shows 'No gaps detected as of …'. So does every project without registry metadata, even though the regional gap evaluation only runs for project scope with a registry. Prediction-type reports seal that sentence (finding 1). Separately, a 'Compliance & Audit Assurance Pack' run created through POST /runs finalizes as a sealed final record. It states 'No gaps detected' while its Blockers section reads 'No governed artifacts available for compliance evidence'. Classification: a constant verdict string, not a computed one.
- **Evidence:** render.ts:123-146: only when `regulatory?.missingArtifacts` is a non-empty array is a gap list built; `else` emits `{ kind: 'summary', text: `No gaps detected as of ${generatedAt}.` }`. regulatory is set only at orchestrator.ts:132-155 (project scope with a registryId). report-os.ts:1762 and canvas/render-report.ts:61 both pass `gapsSection: true,` as a constant, so the rule at truthfulness.ts:88 (`state.gapsSection === false`) never fires. taxonomy.ts:63 compliance.audit_assurance_pack is `{ allowPartial: true, requireExplicitGaps: true }`. Scratchpad run of the real functions: `compliance.audit_assurance_pack | finalize -> final | confidence 35 | ... gaps text: No gaps detected as of 2026-10-01T00:00:00Z.`
- **Suggested fix:** Say 'Gaps were not evaluated for this scope' unless a gap evaluation ran. Derive gapsSection from whether that evaluation produced a section. Make requireExplicitGaps refuse final when it did not.
- **Verifier:** real = `False`, severity = `none`.

  > This was fixed before HEAD (726fd207), so it is not open now. Commit f6d2c089 ("Reporting: a prediction is never sealed final, and "No gaps detected" is printed only after a gap check", 2026-10-01 06:43) fixed both halves. Commit 68067377 then moved the gap logic into one helper.
  > 
  > 1) The verdict is no longer a constant string. render.ts:57-60 adds `gapsWereEvaluated(summary)`, which returns `Array.isArray(regulatory?.missingArtifacts)`. In `gapsSectionFor` (render.ts:66-98):
  > - A non-empty list renders a gap-list.
  > - An empty list prints `No gaps detected as of ${generatedAt}.` (render.ts:89). The orchestrator only sets that list when a gap evaluation ran (project scope with a registry).
  > - With no list, the gaps section reads 'Gaps were not evaluated for this scope.' (render.ts:97).
  > grep shows render.ts:89 is the only place in server/, shared/ or client/ that emits "No gaps detected". The "else" branch the finding quotes at render.ts:123-146 does not exist at HEAD.
  > 
  > 2) requireExplicitGaps is no longer vacuous. Both callers now derive the flag from that function: HEAD report-os.ts buildRenderedFromRun has `gapsSection: gapsWereEvaluated(summary),` (1747 in the working tree; HEAD's copy reads the same), and canvas/render-report.ts:61 has `gapsSection: gapsWereEvaluated(computed.summary),`. So truthfulness.ts:111 (`if (rules.requireExplicitGaps && status === 'final' && state.gapsSection === false) { status = 'partial'; ...`) now fires. Take compliance.audit_assurance_pack at project, submission or document scope with no registry evaluation. Taxonomy and the deployed seed migrations/20260930_report_type_registry_seed.sql:55 both give it `{"allowPartial":true,"requireExplicitGaps":true}`, so it is downgraded to partial. The finalize handler (HEAD report-os.ts ~1873-1880) then returns 409 'Report is not eligible to be finalized' instead of sealing it.
  > 
  > The prediction-type part ("finding 1") is also closed in the same commit: forbidFinal and requireDisclosure are now enforced at truthfulness.ts:73-82.
  > 
  > Checks run: the render and truthfulness suites pass at HEAD (32/32). They include 'says gaps were not evaluated when no gap evaluation ran, and claims no empty list', which asserts the report contains no 'No gaps detected'. The commit message says the new cases failed against the pre-fix sources.
  > 
  > The finding accurately describes the code before f6d2c089, but at HEAD it is resolved, so it should not be re-reported.

  Correction: Refuted for HEAD: f6d2c089 and 68067377 already fixed it. Do not re-report it. One separate issue was neither part of this finding nor verified here: compliance.audit_assurance_pack sets no requireBlockers and no forbidFinalIfMissingCritical. For a project-scoped run with a registry, where the gap evaluation ran, the pack may therefore still finalize while compliance_audit blockers are outstanding. That would need its own finding, built from the code.

## PROVENANCE-5. [high] In the evidence-trace report, model output raises the confidence that gates sealing, and retrieval similarity is printed as 'Confidence %'

- **Where:** `server/services/report-os/lineage-trace-report.ts:53`
- **Impact:** Take provenance.evidence_trace_report at document scope. Any recorded AnA decision adds 15 points to the confidence that the requireConfidence (>= 70) gate reads, and that includes recommendations a human later rejected. Any AnA reasoning turn adds 5. A document with only version history and one rejected AnA recommendation scores 30+25+15 = 70, clears the gate and can be sealed final. The 'Evidence data-lineage' table's 'Confidence' column is the RAG retrieval similarity × 100 (basis 'ai_inferred'). The report never says so, and that value is carried into the seal's provenance atoms. Model output therefore influences both a gating figure and a printed figure in a sealable record. Reachability: through the API (POST /api/report-os/runs with scope document, by any Standard member; finalize by an owner, admin or manager). The canvas cannot reach it, because it sends program scope and gets a 400.
- **Evidence:** lineage-trace-report.ts:61-71 `let score = 30; if (dossier.versionHistory.length >= 1) score += 25; if (dossier.decisions.length >= 1) score += 15; … if (dossier.reasoning.length >= 1) score += 5;`. lineage-dossier.ts:374-384 selects every decision_records row for the artifact with no action_state filter (rejected rows included), and :19-20 sources reasoning from 'AnA's persisted thought process per turn'. report-os.ts:1531 `computed.confidence = computeLineageConfidence(dossier);`. lineage-trace-report.ts:235 `l.confidenceScore != null ? `${l.confidenceScore}%` : ''`. send-message.ts:1291-1292 `confidenceScore: (s.score ?? 0) * 100, confidenceBasis: 'ai_inferred' as const,`. lineage-trace-report.ts:106 puts that value into the provenance ref, which seal.ts:101 copies into the atoms.
- **Suggested fix:** Count only human-approved decisions (and no model reasoning) toward sealability. Label the lineage column 'Retrieval similarity (AI-inferred)', or omit it from the sealed record.
- **Verifier:** real = `True`, severity = `low`.

  > Checked at HEAD 726fd207 on concept2cure-v2. Part of the mechanism is real, but the high-severity framing and part of the evidence do not hold up.
  > 
  > **What is confirmed**
  > - `lineage-trace-report.ts:61-71` adds +15 when `dossier.decisions.length >= 1` and +5 when `dossier.reasoning.length >= 1`.
  > - `lineage-dossier.ts:374-384` (`loadDecisions`) selects every `decision_records` row for the artifact. It has no `action_state` filter, so rejected, pending and governed-fabric machine rows all count.
  > - `report-os.ts:1515` (not 1531) stores that score as the run's confidence and empties the blockers.
  > - The deployed registry seed (`migrations/20260930_report_type_registry_seed.sql:54`) gives this type `{"allowPartial":true,"requireConfidence":true}`. `truthfulness.ts:99-107` then makes confidence >= 70 the only thing standing between the run and `final`.
  > - `POST /runs` lets any authenticated org member create a document-scope run. `POST /runs/:id/finalize` needs owner, admin or manager (`report-os.ts:1833`).
  > - The Insights canvas sends program scope (`Insights.tsx:877`), which this type does not allow. So this path is reachable through the API only.
  > - `sealing/seal.ts:101` copies `ref.confidence` into the sealed atoms.
  > 
  > **Where the finding is overstated**
  > 1. **"Model output gates sealing."** The score is a deterministic count of whether records exist. No model supplies a number, so Rule 2 ("a tool that asks a model for a figure") is not breached. The model contribution is also not what decides sealability in practice:
  >    - Every artifact created through `POST /c2c/artifacts` gets a version (+25) and a creation provenance event (`artifacts.ts:586`, +10). That is 65 before any AI record exists.
  >    - If a conversation id is supplied, a conversation-to-artifact lineage row is also written (`artifacts.ts:632`, +10), giving 75.
  >    - So ordinary documents clear 70 with no AnA decision or reasoning at all. The "one rejected recommendation tips it over" scenario is not a distinctive escalation.
  >    - The sealed report stays truthful: rejected decisions are shown as `rejected` (via `actionState`), and the Gaps section lists the missing lineage and signatures.
  >    - A sealed trace report attests what the trace contains. It does not approve the document.
  >    - The real weakness is that a presence/completeness count is labelled "confidence" and is nearly vacuous as a sealing gate. That is a design issue, not model output corrupting a governed figure.
  > 2. **The "Confidence %" evidence is wrong.** `send-message.ts:1276-1297` writes `confidenceScore: (s.score ?? 0) * 100` with `targetObjectId: String(generationRunId)`. The dossier reads `data_lineage_records WHERE target_object_id = ANY([artifactId, threadId])` (`lineage-dossier.ts:567`), so those rows never reach this report.
  >    - The rows it does read come from three writers. `document-spine.ts:342` (target = artifact) and `ana-ri/post-processing.ts:439` (target = thread) go through `persist-provenance.ts`. That uses `toLineageSource` (`provenance.ts:386`), which maps a level to 90/60/30.
  >    - For the project corpus that level is `confidenceFromScore(d.finalScore)` (`AnaToolExecutor.ts:806`), a bucketed retrieval relevance. Many other tools hardcode `'high'`, which prints as 90.
  >    - The third writer, `artifacts.ts:632/657`, writes no confidence, so that cell prints blank.
  > 
  > **What remains**
  > - `lineage-trace-report.ts:235` prints `${l.confidenceScore}%` under a bare "Confidence" header and never shows `confidenceBasis`. A relevance bucket or a tool-hardcoded "high" is presented as a percent confidence in a sealable record. This is a real but minor labelling issue.
  > - Counting rejected or pending decisions and AI reasoning toward "completeness" is debatable rather than fabricated. These are genuinely part of the lineage.
  > 
  > The regulated customer impact is low. Nothing is fabricated, the gate is weak for reasons unrelated to model output, and the path is API-only. Not registered in DP-45..DP-57 or the D2 README.

  Correction: Downgrade to low and fix the evidence.

**1. The gate.**
- `computeLineageConfidence` (`lineage-trace-report.ts:61-71`) is a presence count of records labelled "confidence".
- The requireConfidence >= 70 gate (`truthfulness.ts:99-107`; seed `migrations/20260930_report_type_registry_seed.sql:54`) is met by an ordinary document with no AI involvement: version +25, creation provenance event at `artifacts.ts:586` +10, conversation lineage row at `artifacts.ts:632` +10, total 75.
- So the defect is that the sealing gate is close to vacuous. It is not that model output drives it.
- Counting rejected or pending decisions (`lineage-dossier.ts:374-384`, no `action_state` filter) and reasoning turns toward sealability is a secondary design concern.
- Suggested fix: rename the score "lineage completeness", base sealability on dispositioned, human-approved decisions or signatures, and don't count model reasoning toward it.

**2. The printed column.**
- Drop the `send-message.ts` citation. Those rows target `generationRunId` and are never read by the dossier (`lineage-dossier.ts:567` filters on `target_object_id IN (artifactId, threadId)`).
- The printed values come from `persist-provenance.ts` via `toLineageSource` (`provenance.ts:386`: high/moderate/low becomes 90/60/30). For the project corpus that level is `confidenceFromScore(finalScore)` (`AnaToolExecutor.ts:806`); many other tools hardcode `'high'`.
- `lineage-trace-report.ts:235` prints it as "NN%" under "Confidence" without the `confidenceBasis`, and `lineage-trace-report.ts:104` carries it into the sealed atoms (`sealing/seal.ts:101`).
- Suggested fix: label the column as source/retrieval confidence (bucketed) and show its basis, or leave it out of the sealed record.

**3. Reachability.** API only: `POST /api/report-os/runs` with scope `document`, then finalize by an owner, admin or manager. The Insights canvas sends program scope and gets a 400.

## PROVENANCE-6. [medium] The canvas says every value is provenance-linked, but the generic renderer attaches no provenance and every seal has 0 atoms

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:534`
- **Impact:** A reviewer is told, three times, that every figure traces to its governed source record. In fact no metric or table on a canvas report carries a provenance ref. The 'Source on hover' affordance never appears. The sealed record lists 0 provenance atoms (the toast says so), so nothing in the seal ties a figure to a record.
- **Evidence:** Insights.tsx:534 `Every value is provenance-linked to its governed source; none is originated here.`, Insights.tsx:1189 `Every value is provenance-linked to a governed source; nothing is estimated.`, and Insights.tsx:1083 ('all provenance-linked'). render.ts:55-147 builds every metric and table block without a `provenance` field. seal.ts:86-91 adds atoms only `if (Array.isArray(provenance))`. Insights.tsx:1007 `${seal?.atomCount ?? 0} provenance atoms`. Scratchpad: `atoms: 0` for every type.
- **Suggested fix:** Attach provenance refs in renderReport (report_runs, report_run_dependencies, concept2cure_artifacts counts by status), or remove the claim from the copy.
- **Verifier:** real = `True`, severity = `medium`.

  > I could not refute this finding. I read the code at HEAD (concept2cure-v2, 726fd207) and the mechanism is real and reachable.
  > 
  > 1. The claims are in the canvas copy:
  >    - Insights.tsx:534 `Every value is provenance-linked to its governed source; none is originated here.` This is the generate_report reply shown in the thread.
  >    - Insights.tsx:1088, the no-program EmptyState hint: `...every governed report, all provenance-linked. Nothing is estimated.`
  >    - Insights.tsx:1194, the empty canvas: `Every value is provenance-linked to a governed source; nothing is estimated.`
  > 
  > 2. The canvas gets its report from the generic renderer. runReport (Insights.tsx:875-896) calls POST /api/report-os/runs with `scopeType: program.scope`, then GET /runs/:id/rendered. The scope is always 'program' (insights-canvas-routes.ts:192 `scope: 'program'`). GET /rendered calls buildRenderedFromRun (report-os.ts:1714-1776). That function uses a stored `lineageRendered` only when one exists. The only place one is created is report-os.ts:1506 `if (reportTypeId === 'provenance.evidence_trace_report' && scopeType === 'document')`. So no canvas run ever takes that path, not even the 'Evidence & Provenance Trace Report' type. Every canvas run falls through to renderReport.
  > 
  > 3. renderReport (render.ts:103-189) builds the 'Confidence', 'Readiness score' and 'Readiness level' metric blocks (lines 128, 134-147) and the 'Provider readiness' table (line 162) with no `provenance` field.
  > 
  > 4. On the client, ROBlock shows the 'Source on hover' label only `{prov ? ... : null}` (Insights.tsx:619-628, 633), and roProv returns undefined for missing refs (line 541). So the affordance never renders.
  > 
  > 5. The seal is empty. finalize (report-os.ts:1867) calls buildSealedRecord(rendered). extractProvenanceAtoms (seal.ts:88-91) skips any block without a provenance array, so atoms=[] and atomCount=0. The repo admits this in its own comment at report-os.ts:1756: "instead of the generic renderer's empty set". The team's own evidence shows it in practice: docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/report-os/review-1/red/02-dbtest-route-at-head.txt:26 records a sealed run with `"atoms":[],"atomCount":0`.
  > 
  > 6. It is not registered. The DP-45..DP-57 table (D6 README:66-91) and the D2 README §Reviews contain nothing about the provenance-linked claim or empty seals. DP-48 ('Independent verification overclaimed') is a different claim.
  > 
  > 7. No mitigation: no middleware, gate or later check adds provenance refs.
  > 
  > Medium is the right severity. This is a false claim made to a regulated reviewer on a Part 11 reporting surface, against CLAUDE.md's 'never fabricate' and honest-state rules. It is not high because:
  >    - the values themselves come from the deterministic governed run, not from a model;
  >    - the finalize toast shows the 0 atom count honestly (Insights.tsx:1012);
  >    - finalize is limited to the owner, admin and manager roles.
  > 
  > Minor citation drift in the original report:
  >    - 1083 should be 1088 (the claim is in the hint).
  >    - 1189 should be 1194.
  >    - 1007 should be 1012.
  >    - render.ts:55-147 should be 103-189 (lines 55-101 are the gaps helpers).
  >    - seal.ts:86-91 is roughly right (88-91).

  Correction: Severity stays medium. Line corrections: the copy claims are at Insights.tsx:534, 1088 (not 1083) and 1194 (not 1189). The seal toast is at Insights.tsx:1012 (not 1007). renderReport is render.ts:103-189: metrics at lines 128 and 134-147, the provider table at line 162. Two points strengthen the finding. First, the canvas always runs at scope 'program' (insights-canvas-routes.ts:192), and the lineage renderer runs only for scope 'document' (report-os.ts:1506), so even the canvas's 'Evidence & Provenance Trace Report' seals 0 atoms. Second, the server admits the empty set at report-os.ts:1756.

Fix: attach ProvenanceRef[] in renderReport, at least for the Confidence and Readiness metrics and the Provider readiness rows. Use the report_runs id and the dependency_summary provider source tables and observedAt. That makes the seal carry atoms. Otherwise, reword the three copy lines to say what holds: values are computed by the governed run and the providers are listed, but values are not linked to a source record per value.

## PROVENANCE-7. [medium] L189 is still open at HEAD: canvas reports are computed over the program group whose id happens to equal the project id, and with finding 1 they can be sealed

- **Where:** `server/routes/report-os.ts:1486`
- **Impact:** On one screen, the opener says 'X is N% ready', computed at project scope. Next to it, the report the user runs for X says 'Overall confidence 35' and 'No governed artifacts discovered for this scope', or it is computed over an unrelated program group of the same organisation whose serial id equals X's project id. A prediction-type run built that way can be sealed under X's name. This is registered in the GA ledger (L189, open), not in the D2/D6 register. I re-raise it because it is unchanged at HEAD and the seal gap makes it reach a sealed record.
- **Evidence:** insights-canvas-routes.ts:189-191 `scope: 'program', scopeId: String(insight.projectId),`. Insights.tsx:872-873 then sends `scopeType: program.scope, scopeId: program.scopeId,`. report-os.ts:1486 `eq(reportProgramGroupProjects.programGroupId, Number(scopeId)),` feeds programProjectIds into report-os.ts:1493 computeInitialRun. docs/GA_COMPLETION_LEDGER_2026-08.md:278 L189 status `open`.
- **Suggested fix:** Send scope 'project' from the canvas, or map program to project in the router, and add a dbtest that the canvas run's figures equal the opener's.
- **Verifier:** real = `True`, severity = `medium`.

  > The scope mix-up is real and still open at HEAD (726fd207). The claim that these runs can be sealed is wrong at HEAD.
  > 
  > **The mechanism (line numbers from `git show HEAD`):**
  > - `server/routes/insights-canvas-routes.ts:192-193` gives the lead program `scope: 'program', scopeId: String(insight.projectId)`.
  > - `client/src/concept2cure/v2/surfaces/Insights.tsx:875-878` posts `scopeType: program.scope, scopeId: program.scopeId` to `POST /api/report-os/runs`.
  > - `server/routes/report-os.ts:1486` reads that value as a program group id: `eq(reportProgramGroupProjects.programGroupId, Number(scopeId))`. The result feeds `computeInitialRun`.
  > - The opener's readiness is computed at project scope instead: `server/services/report-os/portfolio/fetch.ts:137/221` call `computeInitialRun(organizationId, 'project', ...)`.
  > - In the usual case no group has that id, so `programProjectIds = []` and `orchestrator.ts` adds three blockers, starting with 'No governed artifacts discovered for this scope'. Confidence is `max(25, 95-3*20) = 35`. That matches the finding's text.
  > - This is reachable by any member from the canvas Run action, for the 30 report types that allow program scope. The other 31 types return 400.
  > - Nothing mitigates it. The route knows about it: `report-os.ts:1449-1453` says "Program scope is left as it was ... the live caller sends a project id under that scope — ledger L189." L189 is still open in `docs/GA_COMPLETION_LEDGER_2026-08.md:278`. It is not in the D2/D6 register, so raising it again is allowed.
  > 
  > **Why it cannot reach a sealed record at HEAD:**
  > 1. **Prediction types.** Commit f6d2c089 is an ancestor of HEAD. It makes `server/services/report-os/truthfulness.ts` enforce `forbidFinal` and `requireDisclosure`. Both prediction types declare both in the deployed seed (`migrations/20260930_report_type_registry_seed.sql:80-81`), so finalize returns 409.
  > 2. **The usual empty-group case.** I parsed the seed. Every one of the 30 program-scope types carries `requireBlockers`, `requireExplicitGaps` or `forbidFinal`. The run carries three blockers, and a program scope never runs a gap evaluation. So `/runs/:id/finalize` (report-os.ts, the `truthfulness.allowedStatus !== 'final'` check) always returns 409.
  > 3. **The unrelated-group case.** This is the only sealable branch. It needs a `report_program_groups` row in the same organisation whose id from a global serial sequence equals the project id, and it needs approved or locked artifacts. The only writer is `POST /api/report-os/program-groups`, and no client code calls it (grep for `program-groups` in `client/src` finds nothing). Reaching it takes a deliberate API call inside the same tenant. Even then the sealed record says 'program N', which is what was actually computed.
  > 
  > **What a customer does see:**
  > - The canvas's main action produces a report about the wrong scope for the flagship program.
  > - That report states 'No governed artifacts discovered' and confidence 35, while the opener calls the same program N% ready.
  > - `exportRep` still downloads the PDF when the seal is refused, so a non-final but wrong-scope document can leave the system.
  > - For the other 31 types the action fails with 400.
  > 
  > That is a medium defect in the launch app, but because the record cannot be sealed, the reason for raising L189 again does not hold.

  Correction: Remove the sealing escalation. At HEAD, f6d2c089 enforces `forbidFinal` and `requireDisclosure`, so no prediction-type run can be sealed. In the reachable empty-group case, all 30 program-scope types require no blockers, an explicit gaps section, or forbid final. The run has three blockers and no gap evaluation, so `/runs/:id/finalize` returns 409. The only sealable case needs a same-org program group whose id equals the project id, and no UI creates program groups. Line references at HEAD: `report-os.ts:1486` (the working tree, with unrelated uncommitted edits, shows it at 1471), `Insights.tsx:877-878`, `insights-canvas-routes.ts:192-193`. Restate the impact as: for 30 types, the canvas's governed report for the lead program is computed over an empty or wrong program group. It is held at partial with 'No governed artifacts discovered' and confidence 35, contradicting the opener's project-scope readiness, and it is still exportable as a partial PDF. The other 31 types fail with 400. The suggested fix is unchanged: send project scope from the canvas, or map program to project in the router, and add a database test that the canvas run's figures match the opener's.

## PROVENANCE-8. [medium] The plan override produces false text: 'Your plan unlocks the portfolio rollup, but there are no governed programs'

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:506`
- **Impact:** A Standard-plan user clicks 'Preview on Enterprise' in the lock card, or any button in the 'Plan' group (labelled 'Subscription tier'), and then asks 'Compare readiness across all my programs', which is a suggested chip. The pane states that their plan unlocks the rollup and that their organisation has no governed programs, while the opener on the same screen names a program with its readiness. Both claims are false. The server withheld the program list because the organisation is not entitled. That answer should have been a lock.
- **Evidence:** Insights.tsx:838 `const tier = tierOverride ?? data?.tier ?? 'standard';`. Insights.tsx:1146 `onClick={() => setTierOverride(m.locked!.requiredTier)}`, and Insights.tsx:1162-1164 is the 'Subscription tier' group whose buttons call setTierOverride. insights-canvas-routes.ts:320-321 `programs: gate.entitled && summary ? summary.attentionRanked.map(toPortfolioProgram) : null,`. Insights.tsx:505 `const rows = ctx.portfolio.programs ? roPortfolioFrom(ctx.portfolio.programs) : [];` and then Insights.tsx:506 `Your plan unlocks the portfolio rollup, but there are no governed programs to roll up yet.`
- **Suggested fix:** Decide entitlement from data.portfolio.entitled (the server verdict), not the override. Label the override as a preview of what each plan includes, and never phrase it as the organisation's plan.
- **Verifier:** real = `True`, severity = `medium`.

  > I confirmed the mechanism at HEAD (726fd207, concept2cure-v2). Any organisation below Enterprise can reach it with one click, and nothing else in the code catches it.
  > 
  > 1. The client tier is the override when one is set. Insights.tsx:842-843: `const [tierOverride, setTierOverride] = useState<string | null>(null);` / `const tier = tierOverride ?? data?.tier ?? 'standard';`. Two controls set it, and neither shows that a preview is on.
  >    - The lock card button at Insights.tsx:1151: `onClick={() => setTierOverride(m.locked!.requiredTier)}`.
  >    - The composer's 'Plan' group at Insights.tsx:1167-1169 (`role="group" aria-label="Subscription tier"`), where each button calls `setTierOverride(t.id)` and the chosen one is highlighted as 'on'.
  > 
  > 2. The server withholds the program list whenever the org is not entitled. insights-canvas-routes.ts:320-321: `programs: gate.entitled && summary ? summary.attentionRanked.map(toPortfolioProgram) : null`. The server gate (entitlement-map.ts:89-100, decideReportEntitlement) uses the org's real tier, so a Standard or Professional org always gets `programs: null`.
  > 
  > 3. The routing reply checks entitlement against the override, not against data.portfolio.entitled. Insights.tsx:501-506: `roDecide('portfolio_rollup','portfolio', tier)` passes when tier is 'enterprise'. Then `const rows = ctx.portfolio.programs ? roPortfolioFrom(...) : [];` gives []. The reply is then 'Your plan unlocks the portfolio rollup, but there are no governed programs to roll up yet.' The server's `portfolio.entitled` flag is in scope (send() passes `data.portfolio` at line 934) but is never read.
  > 
  > 4. The suggested chip at Insights.tsx:400, 'Compare readiness across all my programs', does route here. I ran the real roRouteIntent from the file in node and got `{"matched":false,"candidates":["portfolio_readiness","compare_regions"]}`, and roRouteReply takes `candidates[0]`, so the name is portfolio_readiness.
  > 
  > 5. Both halves of the sentence are false whenever this branch is reached. The pane only renders once a program exists: the guard at Insights.tsx:1079 is `if (!program || !data || !suggest)`, and program comes from leadProgram, which the server builds only from a non-null summary. So the org has at least one governed program, and the opener on the same screen names it with its readiness. The org's plan also does not unlock the rollup.
  > 
  > Nothing mitigates it. send() (925-943) adds no check, and no other code reads portfolio.entitled. I found no test covering the override plus portfolio path. The finding is not in the D2 launch README or the D6 compliance-reports register (DP-45..DP-57); grep finds no match for override, 'Preview on' or 'plan unlocks'.
  > 
  > There is no data exposure, because the server never sends the programs. The defect is false text: a lock is shown as an empty result, and a user who clicked a preview is told 'your plan' unlocks the rollup. That breaks the repo's 'honest empty state / an error is never rendered as an empty result' rule. It needs a deliberate preview click and is not in an exported or governed artefact, so medium is right rather than high.
  > 
  > The cited line numbers have drifted. Line 506 is exact. The tier line is 843 (cited 838), the lock-card button is 1151 (cited 1146), and the Plan group is 1167-1169 (cited 1162-1164).

  Correction: The mechanism and the medium severity stand. Correct the evidence lines at HEAD: tier override is Insights.tsx:843 (not 838), 'Preview on' button is Insights.tsx:1151 (not 1146), 'Subscription tier' group is Insights.tsx:1167-1169 (not 1162-1164); Insights.tsx:505-506 and insights-canvas-routes.ts:320-321 are correct. Proof the chip routes here: running roRouteIntent on 'Compare readiness across all my programs' returns candidates ['portfolio_readiness','compare_regions'], and roRouteReply takes candidates[0]. Suggested fix: in the portfolio_readiness branch, return the lock when `!ctx.portfolio.entitled`, regardless of the preview tier. Only say 'no governed programs' when the server says entitled and programs is an empty array. Mark the tier buttons and lock-card button as a preview, and say 'the Enterprise plan includes' rather than 'your plan unlocks'.

## PROVENANCE-9. [medium] The sealed access review labels every member without TOTP 'Second factor: emailed_code', including members who sign in through SAML and never get a code

- **Where:** `server/services/audit/compliance-reports/queries/access-review.ts:50`
- **Impact:** Take an organisation that uses SAML SSO. Its sealed User access review (JSON and CSV, cited against 21 CFR 11.10(d), HIPAA 164.308(a)(4) and SOC 2 CC6) tells an auditor that every non-TOTP member signs in with an emailed one-time code. The platform never sent those members any second factor: their SAML sign-in mints the session directly. The report's 'not recorded' list does not mention SSO. Classification: deterministic SQL, but the verdict is a constant default rather than a recorded fact. This is not in DP-45..DP-57.
- **Evidence:** access-review.ts:50 `CASE WHEN u.mfa_enabled AND u.mfa_method = 'totp' THEN 'authenticator_app' ELSE 'emailed_code' END AS mfa_posture,`. sso.ts:549-572: the SAML callback runs `jwt.sign({ … provider: 'saml' … })` and records `action: 'user_login' … outcome: 'success', reason: 'saml_sso'` with no second-factor challenge. Password login does issue the emailed code (auth.ts:648-698), and the mfa-enrolment.ts:46 predicate matches the report's predicate, so SAML is the gap. access-review.ts:111-116 notRecorded has no SSO line.
- **Suggested fix:** Derive the posture from how the member's last successful sign-in was made (audit reason saml_sso, or mfa_challenge_email or totp), and add 'single sign-on (identity provider; second factor not observed by the platform)'.
- **Verifier:** real = `True`, severity = `medium`.

  > I checked this at HEAD 726fd207 on concept2cure-v2 and could not refute it.
  > 
  > 1. **The report states a second factor nobody recorded.** server/services/audit/compliance-reports/queries/access-review.ts:50 reads: `CASE WHEN u.mfa_enabled AND u.mfa_method = 'totp' THEN 'authenticator_app' ELSE 'emailed_code' END AS mfa_posture,`. The column is labelled 'Second factor' (line 24). The `emailed_code` value appears only on that line in client/, server/ and shared/, and nothing explains or qualifies it. The `notRecorded` list (lines 110-115) says nothing about single sign-on. The report cites 21 CFR 11.10(d), 21 CFR 11.10(g), Annex 11 §12, HIPAA 164.308(a)(4) and SOC 2 CC6.2-CC6.3 (lines 97-104). The route is live: catalog.ts:53 registers it and routes/audit-compliance-reports.ts serves it.
  > 
  > 2. **SAML sign-in never asks for a second factor.** server/bootstrap/register-platform-routes.ts:167 mounts the router (`app.use('/api/auth/sso', ssoRouter)`). In server/routes/sso.ts, `router.post('/saml/callback')` (line 471) validates the assertion and calls `findOrCreateSamlUser`. It then runs `openSession`, then `jwt.sign({ ... provider: 'saml', ... type: 'access', ...session })` (lines ~549-562). Last it calls `recordAuthEvent({ action: 'user_login', ..., outcome: 'success', reason: 'saml_sso' })`. There is no MFA challenge or MFA reference anywhere in sso.ts.
  > 
  > 3. **The password path does send the emailed code.** routes/auth.ts:648-698 issues the challenge, records `reason: hasTotpSetup ? 'mfa_challenge_totp' : 'mfa_challenge_email'`, and sends an email OTP. So the report is only right for members who sign in with a password.
  > 
  > 4. **Nothing blocks a SAML session later.** In server/middleware/auth.ts, `provider` is carried onto req.user (line 258) and used only for the platform-admin allow-list, per the comment at lines 67-73. No middleware refuses a SAML token for lacking a second factor.
  > 
  > 5. **Members created at first SAML sign-in can never receive a code.** sso.ts:916-923 inserts them with `passwordHash: \`saml:${crypto.randomUUID()}\`` ('SAML users don't have a local password'). Their only way in is SAML, which asks for no second factor, yet the report lists them all as `emailed_code`.
  > 
  > 6. **The same defect runs the other way too.** An existing member with an authenticator enrolled is matched by email at sso.ts:868-904 and signs in through SAML without TOTP. The report still labels them `authenticator_app`.
  > 
  > 7. **It is reachable and not already registered.** SAML is a supported, environment-configured enterprise path (.env.example:411-425; SAML_TENANTS per organisation). DP-45..DP-57 in docs/evidence/D6/2026-09-30-compliance-reports/README.md contain no SSO or second-factor-posture entry. The only SAML mention in that evidence is about configuration change records, a different issue.
  > 
  > **Severity: medium is right.** The signed (sealed) access review states a specific factor the platform never asked for. That only happens for organisations that have SAML configured. The identity provider may enforce its own MFA, so this is a false statement rather than proof that sign-in is weak. It is not data exposure or a broken gate.

  Correction: The fix should cover both labels, not only members without an authenticator. A member who signs in through SAML should be reported from the evidence (the success audit row's reason, `saml_sso` versus a `mfa_challenge_email`/`mfa_challenge_totp` row on the password path). Use something like 'single sign-on (identity provider; second factor not observed by the platform)', or report the factor used at the last sign-in. Members created at first SAML sign-in (passwordHash prefixed 'saml:') should never be labelled emailed_code. Also add a notRecorded line saying a SAML sign-in carries no second-factor record. Severity stays medium.

## PROVENANCE-10. [low] explain_blockers presents an empty list as 'the gate's own reasons, verbatim'

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:518`
- **Impact:** Asked why a report is held, the pane answers 'is held at partial because: . Those are the gate's own reasons, verbatim. Clear them and it can promote toward final'. For prediction types and the audit pack, nothing needs to be cleared before it goes final (findings 1 and 4).
- **Evidence:** Insights.tsx:517-518 `const reasons = (rep.truthfulness && rep.truthfulness.reasons) || []; … because: ${reasons.join('; ')}. Those are the gate's own reasons, verbatim.`. Canvas runs are rendered with requestedStatus partial (report-os.ts:1754-1755, `run.status === 'completed' ? 'final' : 'partial'`), and truthfulness.ts only pushes reasons on a downgrade from final, so reasons is [].
- **Suggested fix:** Show the run's blockers list and say when the gate has not evaluated a final request.
- **Verifier:** not run (low).

## PROVENANCE-11. [low] Client chart fixtures would draw a made-up forecast trajectory and trend series if a chart block arrived (latent)

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:576`
- **Impact:** A 'forecast_band' block draws five points the client invents around an anchor (60 by default) and captions it 'advisory band'. A 'trend' block without points draws 62, 66, 64, 70, 73. No server path emits chart blocks today, so this is latent. It would become live the moment a provider emits a chart.
- **Evidence:** Insights.tsx:575 `const a = Math.max(0, Math.min(100, Number(s.anchor) || 60));`. Insights.tsx:576 `const pts: [number, number][] = [[0, a], [1, a + 3], [2, a - 2], [3, a + 6], [4, a + 2]];`. Insights.tsx:593 `: [62, 66, 64, 70, 73];`. A grep for `kind: 'chart'` or chartType producers in server finds only the type at render/types.ts:43.
- **Suggested fix:** Render only the points the server sends; with none, show 'No series data'.
- **Verifier:** not run (low).

## PROVENANCE-12. [low] The portfolio board recomputes the average on the client, always tones it 'ok', and credits AnA with ranking

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:722`
- **Impact:** 'avg readiness 31%' is shown in the success tone regardless of value. The note says 'AnA ranks and frames them' when no model is involved. The average duplicates summary.avgReadiness, which the server already computes.
- **Evidence:** Insights.tsx:719 `const avg = rows.reduce((a, r) => a + r.readiness, 0) / Math.max(1, rows.length);`. Insights.tsx:722 `<span className="ro-status st-ok">avg readiness {Math.round(avg)}%</span>`. Insights.tsx:731 `AnA ranks and frames them, it does not recompute them.`. aggregate.ts:76 `avgReadiness: roundedMean(...)`.
- **Suggested fix:** Use data.portfolio.summary.avgReadiness, derive the tone from the value, and drop the AnA attribution.
- **Verifier:** not run (low).

## PROVENANCE-13. [low] Report entitlement ignores feature-toggle grants, so the 'plan unlocks' lock misstates access for organisations granted by toggle

- **Where:** `server/services/report-os/entitlement-map.ts:96`
- **Impact:** Take an organisation granted prediction_forecast_report or portfolio_rollup by a feature toggle (the resolver's documented pilot path). It still gets 403 'requires the professional plan', and the canvas tells it a plan upgrade is needed.
- **Evidence:** entitlement-map.ts:96-97 `const caps = await resolveCapabilities(organizationId); tier = caps.tier;` and then `decideReportEntitlement(typeId, family, tier)` ignores `caps.features`. resolver.ts:13-16 says a toggle 'wins over the tier verdict'.
- **Suggested fix:** Use the resolver's composed feature verdict.
- **Verifier:** not run (low).

## PROVENANCE-14. [low] The audit_events linkage reads 'intact' without recomputing any hash, and it skips rows whose previous_hash is null

- **Where:** `server/services/audit/signedAuditExport.ts:299`
- **Impact:** The integrity attestation can headline 'All 3 integrity checks passed' while an audit_events row's content was edited (record_hash is never re-derived) or its previous_hash was nulled. Exposure is limited because the hash trigger is not on the applier, so deployed databases usually read 'not verified'.
- **Evidence:** signedAuditExport.ts:299 `if (row.previous_hash !== prevHash && prevHash !== null && row.previous_hash !== null) {`. No recomputation of record_hash from row fields happens anywhere in the loop (:284-303). audit-trail-integrity.ts:93 maps 'intact' to `verdict: 'intact'`, and :135 sets `ok: true` when all checks are intact.
- **Suggested fix:** Re-derive record_hash from the canonical row, and treat a null previous_hash after a hashed predecessor as broken.
- **Verifier:** not run (low).

## PROVENANCE-15. [low] POST /runs accepts registryId/submissionType and the orchestrator ignores them; AnA's generate_report passes a report type id as a registry id

- **Where:** `server/services/report-os/orchestrator.ts:39`
- **Impact:** A caller supplies a registry context and gets figures computed without it, with the blocker 'Regional readiness unavailable: project metadata has no registry context'. The run gives no sign that the input was dropped.
- **Evidence:** orchestrator.ts:39-40 declare `explicitRegistryId?: string; explicitSubmissionType?: string;`, but only `options?.programProjectIds` is read (:85). report-os.ts:1495-1496 passes `explicitRegistryId: registryId, explicitSubmissionType: submissionType,`. canvas/render-report.ts:50 passes `explicitRegistryId: params.typeId,`.
- **Suggested fix:** Honour the explicit registry in orchestrator.ts:145, or reject the fields.
- **Verifier:** not run (low).

## What the lens found clean

- The truthfulness gate is not model-judged. evaluateTruthfulness (server/services/report-os/truthfulness.ts:53-117) is pure code over confidence, blockers and criticalBlockers. Its weaknesses are the rules it does not implement (findings 1 and 4), not model influence. The one place model output enters its inputs is document-scope lineage confidence (finding 5).
- No LLM call computes any figure on either surface. Canvas figures come from computeInitialRun (orchestrator.ts:33-358: SQL counts plus evaluateReadiness and buildPackageManifest, rule-based) and the pure aggregate.ts:51-90. The compliance reports are SQL inside one read-only REPEATABLE READ tenant snapshot (compliance-reports/generate.ts:40-57). compliance-reports/types.ts:6 says 'Nothing here is composed by a model', and a grep finds no AI client import in compliance-reports/** or routes/audit-compliance-reports.ts.
- Portfolio rollup math is deterministic (portfolio/aggregate.ts:51-90: rounded means, status counts, worst risk). The flagship pick is pure (insights-canvas-routes.ts:162-172). Risk level comes from the critical-blocker count (portfolio/fetch.ts:39-44).
- Entitlement mapping matches between client and server: client roDecide (Insights.tsx:244-253) has the same regexes and tiers as entitlement-map.ts:45-64. The server re-gates run and export (report-os.ts:1463-1471 and :1680-1690). The client's tier override cannot unlock a server result; it only changes the client copy (finding 8).
- Finalize is role-gated and refuses to overwrite: requireRole('owner','admin','manager') at report-os.ts:1846, and RUN_ALREADY_FINAL at :1865. The client distinguishes 409, 403 and RUN_ALREADY_FINAL (Insights.tsx:810-820).
- /api/insights/predictions/run uses rule-based or statistical models, not an LLM. scoreSubmissionDraft is logistic regression plus cross-tenant priors (regulatory-intelligence.ts:181; embeddings are used only at outcome ingest, :51-63 and :293-322). The readiness twin scores by criterion rules (submission-readiness-twin-service.ts:654-672); its `ai` import at :19 is unused. The assembler always appends a disclosure (prediction/assembler.ts:246-268) and returns 422 rather than a 0% when no assessment exists (report-os-insights.ts:318-324). Neither surface calls it.
- The AnA Reporting tools return engine figures for the model to narrate: list_report_types, get_portfolio_readiness, generate_report, explain_report_blockers and suggest_reports (AnaToolExecutor.ts:20833-20990). Each calls the orchestrator, aggregator or catalog, and the model supplies no figure.
- The compliance surface renders server values only. complianceReportData.ts:113-129 marks a section unreadable when its rowCount disagrees with its rows. chainLine (:189-201) gives 'passed' only for integrity checks with total > 0 and all intact, and says 'not verified' for zero rows. The CSV header comes from the same data (compliance-reports/csv.ts:36-63). The AnA context carries counts and statements only (complianceReportsModel.ts:246-257).
- Integrity attestation verdicts: the chain walk over zero rows gives 'not verified' (audit-trail-integrity.ts:72-74). The seal check with no key or no sealed rows gives 'not verified' (:106-108). The headline is ok only when every check is intact (:120-137). This is consistent with DP-45 as fixed.
- Seal hashing is deterministic over the rendered report (sealing/seal.ts:71-76, 132-143).

## What the lens did not cover

- Nothing was executed against a database or a running stack. The seal-final behaviour was shown by running the real pure functions (evaluateTruthfulness, renderReport, buildSealedRecord) in a scratchpad script on the inputs orchestrator.ts produces for program scope. POST /finalize itself was not exercised end to end.
- The query files for the other compliance reports were scanned only for derived verdict columns (CASE expressions), not read line by line: authentication-events, administrative-changes, electronic-signatures, retention-legal-holds and controlled-documents.
- The full-audit-trail catalog entry (the existing signed export) and the verify endpoint were not traced beyond the manifest fields the surface reads.
- The scheduled-report worker, deliveries, bundles and the correspondence capture routes in report-os.ts were not traced beyond confirming they reuse computeInitialRun and the same 'confidence'.
- evaluateReadiness (regulatory/readinessEvaluator) and buildPackageManifest internals were not read. They are classified as rule-based from their imports and orchestrator usage only.
- Whether the 'licensing' surface actually offers the Professional and Enterprise report features for purchase was not checked.
- The insights registry row's anaToolFamilies (portfolio_readiness, compare_regions, get_prediction, explain_blockers) name tools that do not exist in AnaToolDefinitions (the real names are get_portfolio_readiness and explain_report_blockers; compare_regions and get_prediction have no handler). Noted, but not reported: it is outside the figure-provenance lens.

## Files read

- `CLAUDE.md`
- `docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/README.md`
- `docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/report-os/README.md`
- `docs/evidence/D6/2026-09-30-compliance-reports/README.md`
- `docs/GA_COMPLETION_LEDGER_2026-08.md (L189 row)`
- `shared/constants/launch-scope.ts`
- `shared/constants/ui-surface-registry.ui-v2.ts`
- `client/src/concept2cure/v2/surfaceViews.ts`
- `client/src/concept2cure/v2/surfaces/Insights.tsx`
- `client/src/concept2cure/v2/surfaces/ComplianceReports.tsx`
- `client/src/concept2cure/v2/surfaces/ComplianceReportResult.tsx`
- `client/src/concept2cure/v2/surfaces/complianceReportData.ts`
- `client/src/concept2cure/v2/surfaces/complianceReportsModel.ts`
- `server/bootstrap/register-inline-routes.ts`
- `server/bootstrap/register-clinical-intel-routes.ts`
- `server/routes/insights-canvas-routes.ts`
- `server/routes/report-os.ts`
- `server/routes/report-os-insights.ts`
- `server/services/report-os/orchestrator.ts`
- `server/services/report-os/truthfulness.ts`
- `server/services/report-os/render/render.ts`
- `server/services/report-os/sealing/seal.ts`
- `server/services/report-os/portfolio/fetch.ts`
- `server/services/report-os/portfolio/aggregate.ts`
- `server/services/report-os/portfolio/types.ts`
- `server/services/report-os/taxonomy.ts`
- `server/services/report-os/taxonomy-global.ts`
- `server/services/report-os/prediction/report-types.ts`
- `server/services/report-os/prediction/assembler.ts`
- `server/services/report-os/prediction/model-adapters.ts`
- `server/services/report-os/entitlement-map.ts`
- `server/services/report-os/canvas/render-report.ts`
- `server/services/report-os/ana/report-tools.ts`
- `server/services/report-os/lineage-trace-report.ts`
- `server/services/ana/lineage-dossier.ts (decisions, reasoning, data lineage loaders)`
- `server/services/ana/AnaToolDefinitions.ts (Reporting tools 1680-1830)`
- `server/services/ana/AnaToolExecutor.ts (Reporting handlers 20825-21000)`
- `server/routes/chat/send-message.ts (lineage write 1270-1305)`
- `server/services/data-lineage-service.ts (recordLineage)`
- `server/services/intelligence/regulatory-intelligence.ts (head, scoreSubmissionDraft)`
- `server/services/innovation/submission-readiness-twin-service.ts (score derivation, ai import)`
- `server/services/entitlements/mdx-entitlements.ts`
- `server/services/entitlements/resolver.ts`
- `server/services/entitlements/types.ts`
- `migrations/20260930_report_type_registry_seed.sql`
- `server/services/audit/compliance-reports/generate.ts`
- `server/services/audit/compliance-reports/integrity-checks.ts`
- `server/services/audit/compliance-reports/csv.ts`
- `server/services/audit/compliance-reports/signed-report.ts (manifest fields)`
- `server/services/audit/compliance-reports/queries/access-review.ts`
- `server/services/audit/compliance-reports/queries/audit-trail-integrity.ts`
- `server/services/audit/signedAuditExport.ts (snapshotChainIntegrity)`
- `server/routes/auth.ts (login second-factor branches)`
- `server/services/mfa-enrolment.ts`
- `server/routes/sso.ts (SAML callback, dev SSO)`

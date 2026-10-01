# Reporting & analytics review, 2026-10-01: Honest state

Generated from workflow `wf_527b6067-e34`: the lens's own report, then the refuting verifier's verdict on every blocker, high and medium. Low findings were not independently verified. Paths are as the agents wrote them. Line numbers are at the head they read and may have moved since. The README in this directory records which findings were fixed afterwards, and by which commit.

## HONEST-STATE-1. [high] Canvas headline states "<program> is 25% ready" for a program with nothing in it; the blocker count and status the server computed are fetched and never shown

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:387`
- **Impact:** Distinction 3 (nothing-assessed vs assessed) and 4. A regulated customer opens Reporting & analytics on a program with no artifacts and no registry context and reads "BX-204 is 25% ready". The 25 is a floor. A program with 3 critical gaps also reads "N% ready", because criticalBlockerCount, riskLevel and status never reach the screen. The portfolio ring and "avg readiness" repeat the same 25. The "readiness == null" branch that would say "not yet computed" is dead because the server always sends a number.
- **Evidence:** server/services/report-os/orchestrator.ts:340 `const confidence = Math.max(25, Math.min(95, 95 - blockers.length * 20));` (registry path :317 and :321 floor at 25 too). With zero artifacts the run pushes three blockers (artifact_state, submission_readiness, compliance_audit) plus 'Regional readiness unavailable: project metadata has no registry context' = 4 blockers -> 95-80=15 -> floored to 25. server/services/report-os/portfolio/fetch.ts:71 `readinessScore: confidence,` and :63-65 `confidence >= 70 ? 'ready' : confidence > 0 ? 'partial'` so an empty program is 'partial', not 'missing'. Insights.tsx:387 `: \`${p.code} is ${p.readiness}% ready\``. criticalBlockerCount is copied at Insights.tsx:225 but grep finds no render of criticalBlockerCount, riskLevel, status or summary in the JSX. insights-canvas-routes.ts:37 promises 'never a fake zero'; the floor is a fake 25. client/src/concept2cure/v2/__tests__/insightsHonestCopy.test.ts:5 records this exact live observation ("1 is 25% ready") and only the program-name half was fixed. No DB in the sandbox, so the 25 comes from source arithmetic, not a live run.
- **Suggested fix:** Make an unassessed program (no artifacts or no registry context) return readiness null / status 'not-assessed' (use v2/assessmentState.ts) and render 'not yet assessed'. Show criticalBlockerCount and status beside any percentage. Do not label a confidence heuristic 'ready'.
- **Verifier:** real = `True`, severity = `medium`.

  > Only part of this finding holds at HEAD. The main claim, that an empty program reads "25% ready", is already fixed. Commit 798bb6ef ("Reporting: 'readiness' is the evaluated readiness, or it says it was not computed", 2026-10-01 06:51) is an ancestor of HEAD 726fd207. It changed the exact line the finding cites.
  > 
  > The 25% claim is refuted at HEAD:
  > - server/services/report-os/portfolio/fetch.ts:82 is now `readinessScore: evaluatedReadiness(computed),`. evaluatedReadiness (:58-62) returns summary.regulatory.readinessScore, or null when there is none. Line 71 is `const confidence = ...` and is kept under its own name. The finding's quote `readinessScore: confidence` (:71) is stale.
  > - The registry path, orchestrator.ts:317-321, still floors confidence at 25. The only place summary.regulatory is set is orchestrator.ts:303-315, and there readinessScore is `readiness.score` from evaluateReadiness, with no 25 floor.
  > - The path with no registry context (orchestrator.ts:~154, 'Regional readiness unavailable...') returns a summary with no `regulatory` (:340-356). So readiness is null for an empty program with no registry context.
  > - insights-canvas-routes.ts:198/:216 send `readiness: insight.readinessScore` through to the client.
  > - The `p.readiness == null` branch at Insights.tsx:385-386 ("submission readiness is not yet computed") is now reachable, not dead.
  > - The portfolio board no longer repeats the 25. Insights.tsx:721-731 averages only the computed programs, says "N not computed", and shows "Readiness not computed" in place of a ring. aggregate.ts:85 uses roundedMeanOrNull.
  > 
  > The second half is still open at HEAD: the server's critical-blocker count, status and risk never reach the screen. The route sends them for the lead program and for each row (insights-canvas-routes.ts:198-202, :216-220). On the client:
  > - Insights.tsx:225 copies `criticalBlockerCount: lp.criticalBlockerCount` into ProgramCtx.
  > - grep finds criticalBlockerCount and riskLevel only in type declarations (:137, :155-157, :169-171) and that copy.
  > - Program `status` is never rendered either.
  > - The opener at Insights.tsx:387 prints `${p.code} is ${p.readiness}% ready` on its own, and the board rows (:729-731) show only the ring.
  > 
  > This bites in a common case. readinessEvaluator.ts:121-151 has no artifact matrix for most registry ids (9 matrices against a larger registry). For those ids the score is section completion alone, plus a critical gap, ARTIFACT_REQUIREMENTS_NOT_MODELLED, which says "This score reflects section completeness only — treat the artifact half as unassessed". That gap makes criticalBlockerCount at least 1 and status 'missing' (fetch.ts:72-73). A program with all required sections approved would read "X is 100% ready" on the canvas. The critical gap, the 'missing' status and the section-only qualifier are all dropped.
  > 
  > This is a real gap in honest state, but narrower than reported. The percentage is now an evaluated figure, not a fabricated floor, and the full report still lists the gaps. So the severity drops from high to medium.
  > 
  > No DB is available in the sandbox, so this comes from reading the source at HEAD, not a live run. The uncommitted changes in the working tree touch server/routes/report-os.ts and two tests, not the files cited here.

  Correction: Change the title to: "The canvas opener and board show a readiness percentage without the critical-blocker count or status the server sends, so a section-only score reads as overall readiness." Severity: medium.

Drop the 25% claim. 798bb6ef fixed it: fetch.ts:82 is now `readinessScore: evaluatedReadiness(computed)`, which is null when nothing was evaluated, and the null branch at Insights.tsx:385-386 now runs.

Remaining evidence:
- insights-canvas-routes.ts:198-202 and :216-220 send criticalBlockerCount, status and riskLevel.
- Insights.tsx only copies criticalBlockerCount (:225) and never renders it, status or riskLevel.
- The opener at Insights.tsx:387 prints `${p.code} is ${p.readiness}% ready` with no qualifier.
- readinessEvaluator.ts:132-151: for a filing type with no artifact matrix, the score is section completion only, plus a critical gap, ARTIFACT_REQUIREMENTS_NOT_MODELLED.

Fix: when criticalBlockerCount > 0, show it and the status next to the percentage, for example "X: 100% of sections complete, 1 critical gap". Carry the evaluator's "section completeness only" qualifier through to the opener when artifactReadiness.assessed is false.

## HONEST-STATE-2. [high] Every generated report says "No gaps detected as of <timestamp>" when gaps were never assessed; the truthfulness gate's gaps check is hard-wired true

- **Where:** `server/services/report-os/render/render.ts:144`
- **Impact:** Distinction 3. The canvas always runs program scope. For that scope, and for any project without a registry id, the run has no `summary.regulatory`, so no gap assessment ran. The Gaps section still reads "No gaps detected as of 2026-10-01T06:32:20.498Z." (raw ISO). On the same screen the Blockers section lists "No governed artifacts discovered for this scope". The sentence reads the same whether nothing was assessed or all was clear. It is sealed and exported. Where gaps are listed, every one is stamped severity 'high' regardless of its real severity.
- **Evidence:** render.ts:125-147 `if (Array.isArray(missingArtifacts) && missingArtifacts.length > 0) {...} else { ... { kind: 'summary', text: `No gaps detected as of ${generatedAt}.` } }`; regulatory is only populated in orchestrator.ts:303-333, inside the scopeType === 'project' + registryId branch. report-os.ts:1762 `gapsSection: true,` is a hard-coded constant, so truthfulness.ts:79 (`rules.requireExplicitGaps && ... state.gapsSection === false`) can never fire. render.ts:133 `severity: 'high',` for every missing artifact. render/__tests__/render.test.ts:90 pins the vacuous sentence for `summary: {}`. Probe (tsx, scratchpad, no repo edit): rendering a canvas-shaped run gives gaps section `{kind:'gap-list',items:[]},{kind:'summary',text:'No gaps detected as of 2026-10-01T06:32:20.498Z.'}` and 'blocker section present: true'.
- **Suggested fix:** Emit the gap statement only when a gap assessment ran (summary.regulatory present). Otherwise say 'Gaps were not assessed for this scope.' Compute gapsSection from the rendered report. Carry real gap severities.
- **Verifier:** real = `True`, severity = `medium`.

  > The finding as written is stale. HEAD fixed it in f6d2c089 and 68067377 (2026-10-01 06:43–06:44 UTC). The finding's probe timestamp is 06:32, so it ran before that fix. One narrower variant of the same defect is still open at HEAD, and I confirmed it with a probe.
  > 
  > What is fixed at HEAD:
  > (a) Program scope, which is the canvas default, no longer says "No gaps detected". render.ts:57-60 adds `gapsWereEvaluated(summary)`, which returns `Array.isArray(regulatory?.missingArtifacts)`. When it is false, render.ts:93-98 emits "Gaps were not evaluated for this scope."
  > (b) `gapsSection` is no longer hard-coded true. HEAD report-os.ts:1762 and canvas/render-report.ts:61 both pass `gapsSection: gapsWereEvaluated(summary)`. truthfulness.ts:38-41 records that the old constant made the check do nothing.
  > (c) The test that locked in the wrong sentence was rewritten. render.test.ts:82-90 now asserts "Gaps were not evaluated for this scope." and `not.toContain('No gaps detected')`.
  > The cited render.ts:144 and report-os.ts `gapsSection: true` no longer exist. Insights.tsx:875-878 always posts `scopeType: program.scope`, so the "every generated report" path from the canvas now prints the honest sentence.
  > 
  > What is still open, with the same symptom:
  > The new check only asks whether the field is an array. It does not ask whether a gap check ran.
  > - orchestrator.ts:313 sets `missingArtifacts: readiness.artifactReadiness.missing.slice(0, 8)`.
  > - readinessEvaluator.ts:126-128 returns `missing: []` when `hasArtifactMatrix` is false. This happens for 225 of the 234 GLOBAL_REGISTRY ids (US_ANDA, US_505B2, US_PRE_IND and others). In that case the evaluator adds a critical gap, ARTIFACT_REQUIREMENTS_NOT_MODELLED, at readinessEvaluator.ts:138-149.
  > - buildFallbackResult does the same at readinessEvaluator.ts:337 for an unresolved registryId, with gap UNKNOWN_REGISTRY_ENTRY.
  > - The gaps section never includes section gaps (identifyGaps at :240-250, severity 'critical'). Even a modelled type like US_IND with every artifact present but required sections not started still prints "No gaps detected".
  > 
  > Probe (tsx in my scratchpad; no repo edits): I ran the real evaluateReadiness on US_ANDA, put the result in the orchestrator's summary shape, and rendered it with renderReport.
  > - `gapsWereEvaluated` returned true.
  > - The evaluator returned 7 gaps.
  > - The blockers section lists 'Cover Letter: Required section "Cover Letter" (1.1) has not been started', and three more like it.
  > - The gaps section reads `{kind:'gap-list',items:[]},{kind:'summary',text:'No gaps detected as of 2026-10-01T00:00:00Z.'}`.
  > So the same document still says "No gaps detected" right next to a list of the evaluator's own critical gaps. Because gapsSection is true on this path, the requireExplicitGaps check in truthfulness.ts:111 still cannot catch it.
  > 
  > Who can reach it: a real user, through project scope.
  > - The AnA `generate_report` tool (AnaToolExecutor.ts:20921-20943) takes a free `scope_type` and calls renderGovernedReport.
  > - POST /api/report-os/runs takes `z.enum(reportScopeEnum)`, which includes 'project', and the run can then be sealed through /finalize.
  > The canvas's own Generate button does not reach it, because it always sends program scope.
  > 
  > On the claim that every gap is stamped 'high': this is still present (render.ts:76 `severity: 'high'`). But it is not "regardless of real severity". Every missing required artifact is uniformly 'critical' in the evaluator (readinessEvaluator.ts:258-262), so the renderer lowers the label by one step for every row, and the type allows 'critical' (render/types.ts:58). That part is low on its own.
  > 
  > Why medium and not high: the main canvas path is fixed. The open variant needs project scope plus either an unmodelled or unknown registry type, or section-only gaps. The contradicting gap list appears on the same report, which limits how misleading it is. It is still a false, sealable statement in a regulated record.

  Correction: Retitle: '"No gaps detected" still printed for project-scoped runs whose readiness check found gaps or did not check artifacts.' Use server/services/report-os/render/render.ts:57-60, quoting `return Array.isArray(regulatory?.missingArtifacts);`, together with render.ts:83-90.

The program-scope / canvas path and the hard-coded `gapsSection: true` were fixed in f6d2c089 and 68067377, so drop them from this finding.

Evidence for the open variant:
- orchestrator.ts:313 sets `missingArtifacts: readiness.artifactReadiness.missing.slice(0, 8)`.
- readinessEvaluator.ts:126-128 returns `missing: []` when there is no artifact matrix (225 of 234 registry ids), and :337 does the same for an unknown registry.
- Section gaps (readinessEvaluator.ts:240-250) never reach the gaps section.
- Probe on US_ANDA: 7 evaluator gaps and 4 critical blockers on the report, while the gaps section says "No gaps detected as of …".
- Reachable through the AnA generate_report tool (AnaToolExecutor.ts:20921-20943) and through POST /api/report-os/runs with scopeType 'project'. The Insights Generate button does not reach it because it always sends program scope.

Fix:
- Check `readiness.gaps` (or a dedicated assessed flag), not whether the field is an array.
- Put all readiness gaps, including section gaps and not-assessed markers, into the gaps section with their real severity. render.ts:76 hard-codes 'high' while the evaluator says 'critical'.
- Say "N more" when the list is cut at 8.

Severity: medium.

## HONEST-STATE-3. [high] Prediction report types (CRL / RTF pre-mortem, regulatory forecast) are run through the generic readiness renderer, while the canvas promises disclosure and never-final

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:525`
- **Impact:** The suggested prompt "What is my CRL risk?" (pharma/biotech, Insights.tsx:396) tells a Professional-tier user "Running the CRL / RTF Pre-Mortem for X. It is advisory — the model is not validated, so every projected value carries a disclosure and the result is held at partial, never final." What comes back is the generic readiness render (confidence number, provider table, blockers) titled 'CRL / RTF Pre-Mortem' under the eyebrow 'Predictive intelligence (advisory)'. It has no projected value and no disclosure block. The 'never final' promise is not enforced, so a zero-blocker run can be sealed 'final' and exported under that title.
- **Evidence:** Insights.tsx:525 `every projected value carries a disclosure and the result is held at partial, never final.` The canvas sends the type to POST /api/report-os/runs (Insights.tsx:870). report-os.ts has no reference to the prediction assembler; the honest route POST /api/insights/predictions/run (report-os-insights.ts:281-330, assertHasDisclosure, 422 no_assessment) has no client caller (grep: no /api/insights/ in client/src outside comments). taxonomy.ts:462 and :480 `truthfulnessRules: { allowPartial: true, forbidFinal: true, requireDisclosure: true }`; `forbidFinal` and `requireDisclosure` appear nowhere in server code outside the seed, and truthfulness.ts never reads them. Probe: evaluateTruthfulness({requestedStatus:'final', confidence:95, blockers:[], ...}, that rule set) -> {"allowedStatus":"final","reasons":[]}; rendered prediction run: 'disclosure block present: false'.
- **Suggested fix:** Route prediction types to /api/insights/predictions/run (or refuse them on the canvas until wired). Enforce forbidFinal and requireDisclosure in evaluateTruthfulness.
- **Verifier:** real = `True`, severity = `medium`.

  > Part of this finding is real at HEAD and part was fixed this morning, so I'm lowering it from high to medium.
  > 
  > REFUTED at HEAD: the claim that 'never final' is not enforced, and that a run can be sealed final. Commit f6d2c089 ("Reporting: a prediction is never sealed final…", 2026-10-01 06:43 UTC, an ancestor of HEAD 726fd207) made truthfulness.ts enforce both rules:
  > - truthfulness.ts:73 `if (rules.requireDisclosure && !state.disclosure && status !== 'draft') { status = 'draft'; ...`
  > - truthfulness.ts:79 `if (rules.forbidFinal && status === 'final') {`
  > - Both callers pass `disclosure: false` (report-os.ts:1749, canvas/render-report.ts:63).
  > 
  > The finder's probe no longer reproduces. I ran evaluateTruthfulness at HEAD with {requestedStatus:'final', confidence:95, blockers:[]} and the prediction rule set. It returns {"allowedStatus":"draft","downgradedFrom":"final","reasons":["This report type must disclose its method and limits, and this rendering carries no disclosure; it is held at draft."]}. POST /runs/:id/finalize therefore returns 409 (report-os.ts:1858-1864) and the run cannot be sealed final. The canvas shows a 'draft' status badge and the gate's reason (Insights.tsx:690, :694).
  > 
  > STILL REAL (confirmed by reading the code; not in DP-45..57, and f6d2c089's own message lists it as "Still open"):
  > 1. The route is reachable as described. "What is my CRL risk?" (Insights.tsx:396) tokenizes to 'risk' and matches only get_prediction (Insights.tsx:346). /crl/ then selects prediction.crl_rtf_premortem (Insights.tsx:521-522). The reply carries reportType (Insights.tsx:525), and send() calls runReport (Insights.tsx:936-937), which POSTs to /api/report-os/runs (Insights.tsx:875).
  > 2. POST /runs (report-os.ts:1406-1540) runs the generic computeInitialRun and never calls the prediction assembler. The honest route POST /api/insights/predictions/run (report-os-insights.ts:280, mounted at register-inline-routes.ts:217) has no caller in client/src (grep returns nothing).
  > 3. The rendered document has no disclosure block. It contains [executive-summary: summary, summary, metric 'Confidence'], [provider-readiness: table] and [gaps], all under the title 'CRL / RTF Pre-Mortem' and the 'Predictive intelligence (advisory)' family label (Insights.tsx:71). It has no CRL/RTF projection.
  > 4. The thread text at Insights.tsx:525 is false on two counts: "every projected value carries a disclosure and the result is held at partial, never final". The document directly below says draft, states that it carries no disclosure, and contains no projected value.
  > 5. The export path leaks further. exportRep downloads the PDF even when the seal is refused (Insights.tsx:1029-1043). createRunPdf prints the stored status (report-os.ts:724 `Status: ${sanitizePdfText(params.run.status)}`). That status is 'completed' or 'partial' as stored at report-os.ts:1539, not the gate's 'draft'. So the customer can save a "Concept2Cure Regulatory Report / Report Type: CRL / RTF Pre-Mortem / Status: completed / Confidence: N" PDF. That PDF has no disclosure, and its confidence figure is a generic readiness confidence, not a CRL risk.
  > 
  > Why medium and not high: the high rating depended on the run being sealable and exportable as 'final', and that is closed. In the app, the gate now labels the result draft and states why. What remains is a mislabelled report type, a false claim in the canvas message, and an unsealed PDF that shows the stored rather than the gated status. Those are honest-state defects worth fixing, but nothing is sealed and nothing is claimed as final.

  Correction: The 'never final / can be sealed final' part is fixed at HEAD (f6d2c089: truthfulness.ts:73-82 enforces requireDisclosure → draft and forbidFinal; finalize answers 409). Narrow the finding to the misrouting.
- The canvas still sends prediction types to the generic POST /api/report-os/runs (Insights.tsx:525, 870-875). The result is a generic readiness render titled 'CRL / RTF Pre-Mortem' with no projection and no disclosure, held at draft. The thread message beside it claims a disclosure and 'partial'.
- The unsealed PDF export (createRunPdf, report-os.ts:724) prints the stored run status ('completed'/'partial'), not the gate's 'draft', and has no disclosure.

Fix:
- Route get_prediction to POST /api/insights/predictions/run, or refuse prediction types on the canvas until that is wired.
- Make the Insights.tsx:525 text state only what the server returns.
- Have export.pdf print the truthfulness-gated status.

## HONEST-STATE-4. [high] L189 still open at HEAD: canvas reports run over a program-group id that is really a project id, and 14 of the 28 standard-pack tiles are refused by construction

- **Where:** `server/routes/report-os.ts:1486`
- **Impact:** Already in docs/GA_COMPLETION_LEDGER_2026-08.md L189 (status open). Not in the D2/D6 registers. I show it still open at HEAD and newly production-reachable, because this launch change un-gated /api/report-os. A report titled for the program the canvas names reads "No governed artifacts discovered for this scope" about a program the header shows as partly ready. Its scope line reads 'program — <raw numeric id>'. Where a program group happens to share the number, it reports an unrelated group. For the other half of the standard-pack tiles the user sees a refusal worded as an outage (see the next finding).
- **Evidence:** Insights.tsx:870-875 posts `scopeType: program.scope` ('program') with `scopeId: program.scopeId` (String(projectId), insights-canvas-routes.ts:191). report-os.ts:1486 `eq(reportProgramGroupProjects.programGroupId, Number(scopeId))`, :1490 `programProjectIds = memberships.map(m => m.projectId)`; orchestrator.ts:70-74 only collects lifecycle when projectIds.length > 0. Probe over the server seeds: 61 types, 30 allow 'program'; of the 28 tiles in the nine RO_PRESETS packs, 14 refuse program scope (e.g. compliance.audit_assurance_pack, provenance.evidence_trace_report, usa_fda.estar_510k_equivalence_matrix). Client and server scope lists match (0 drift). report-os.ts:1449-1453 comment acknowledges the program-scope behaviour was 'left as it was'.
- **Suggested fix:** Send scope 'project' with the project id (the overview already computes readiness at project scope), or map program to its project server-side. Hide or disable tiles whose type does not allow the scope.
- **Verifier:** real = `True`, severity = `high`.

  > I could not refute this. Every link in the mechanism holds at HEAD (726fd207, concept2cure-v2), and a real user reaches it from the launch surface.
  > 
  > 1. **The server labels a project id as a program.** insights-canvas-routes.ts:190-194 `toLeadProgram` returns `scope: 'program', scopeId: String(insight.projectId)`. That readiness was computed at project scope (portfolio/fetch.ts:137 `computeInitialRun(organizationId, 'project', String(m.projectId))`).
  > 
  > 2. **The client sends it unchanged on every run.** Insights.tsx:849 `const program = data?.leadProgram ? leadToProgramCtx(data.leadProgram) : null;` and Insights.tsx:877-878 `scopeType: program.scope, scopeId: program.scopeId`. Both canvas run paths go through `runReport`: the chat `send` → `roRouteReply` and the pack tile `runFromTile` (:959). No path sends project scope.
  > 
  > 3. **The request passes validation.** `createRunSchema` (report-os.ts:85-92) needs only scopeType, scopeId and reportTypeId.
  > 
  > 4. **The server reads the project id as a program-group id.** report-os.ts:1477 `eq(reportProgramGroupProjects.programGroupId, Number(scopeId))` and :1481 `programProjectIds = memberships.map(m => m.projectId)`.
  > 
  > 5. **An empty group gives an empty report.** In orchestrator.ts the program branch only calls `collectLifecycle` when `projectIds.length > 0`. With no artifacts it pushes the blocker 'No governed artifacts discovered for this scope' and sets readiness to 'missing' ('No artifacts available to compute readiness'). The project-only providers (projects/sections lookups, under `if (scopeType === 'project')`) are skipped. So the report says the program has no artifacts while the canvas header shows that same project as partly ready.
  > 
  > 6. **The pack tiles really are refused.** I parsed migrations/20260930_report_type_registry_seed.sql: 61 types, 30 allow 'program'. Of the 28 tiles in the nine RO_PRESETS packs (Insights.tsx:270-294), 14 refuse program scope, for example compliance.audit_assurance_pack, provenance.evidence_trace_report, usa_fda.estar_510k_equivalence_matrix, etmf.completeness_pack, irb.submission_register and fcoi.disclosure_register. They get a 400 at report-os.ts:1433-1437. RODashboard (Insights.tsx:782-810) shows every entitled tile as 'Run report'. It only checks `roDecide` and `canRun` and never reads `t.scopes`, although `RO_TYPES` carries them.
  > 
  > 7. **The refusal reads as an outage.** `apiRequest` throws on any non-2xx except 401 (client/src/lib/queryClient.ts, the `if (!response.ok && response.status !== 401)` block). So the `!res.ok` branch in runReport never runs. The user sees the catch at Insights.tsx:945: "Couldn't reach the report engine — Report type compliance.audit_assurance_pack does not allow scope program."
  > 
  > 8. **The scope line shows a raw id.** The rendered run returns `scopeId: run.scopeId` (report-os.ts:404), and Insights.tsx:689 renders `{report.scopeType} — {report.scopeId}`.
  > 
  > 9. **It is newly reachable in production.** The D2 launch change (docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/README.md) says /api/report-os was refused with 403 LAUNCH_SCOPE in production and every run returned 404 against an empty registry. At HEAD /api/report-os is claimed by the in-scope insights surface (ui-surface-registry.ui-v2.ts:847), mounted (register-inline-routes.ts:213), and the registry is seeded. So L189 went from latent to live in production.
  > 
  > **Mitigations checked; none fixes it.** The membership query requires `reportProgramGroups.organizationId = orgId`, so nothing crosses tenants; this is not an attacker finding. The truthfulness gate holds such runs at 'partial', so they cannot be sealed as final. They are still persisted as report_runs rows with scope 'program'/<projectId>, and export.pdf does not require a final run.
  > 
  > **Registers.** L189 is in docs/GA_COMPLETION_LEDGER_2026-08.md (status open). It is not in the D2 README or the D6 DP-45..DP-57 register. The launch change's own comment (report-os.ts:1441-1444) defers it to L189, so the finding re-reports a known ledger item, but it does show the item still open at HEAD.
  > 
  > **Severity: high is right.** The canvas is the launch app's only way to run a governed report. Every run from it is either refused with outage wording (half the standard-pack tiles; 31 of 61 types) or computed over the wrong scope: usually empty, and occasionally an unrelated program group of the same org whose id happens to equal the project id. Program groups can only be created through POST /program-groups, so that collision is rare. It is not a blocker: there is no cross-tenant exposure, and the output is labelled partial with its blockers listed rather than sealed as final.

  Correction: The mechanism and severity hold; only the line references need correcting at HEAD:
- report-os.ts: the membership predicate is at 1477, not 1486. `programProjectIds = memberships.map(...)` is at 1481, not 1490. The 'left as it was' comment is at 1441-1444, and the scope refusal is at 1433-1437.
- Insights.tsx: the POST body is at 877-878, not 870-875.
- insights-canvas-routes.ts: `toLeadProgram` is at 190-194 (scope and scopeId at 192-193), not 191.
- The orchestrator guard is the `if (scopeType === 'program') { ... if (projectIds.length > 0) await collectLifecycle(projectIds) }` block, with the 'No governed artifacts discovered for this scope' blocker right after it.

Two refinements:
- **The outage wording has a different cause.** It is not the runReport `!res.ok` branch. `apiRequest` throws on non-2xx, so that branch, including its 403 and 404 copy, never runs, and the catch at Insights.tsx:945 prefixes "Couldn't reach the report engine —".
- **The collision is narrower than stated.** A report about an unrelated group needs that org to have created program groups through POST /api/report-os/program-groups. In the common case the report is simply empty.

Suggested fix:
- **Scope:** have toLeadProgram emit `scope: 'project'` with `scopeId: String(projectId)`, which matches how the readiness was computed. Alternatively, map program to its project on the server.
- **Tiles:** filter or disable pack tiles whose `scopes` does not include the scope being sent.
- **Refusal wording:** catch `ApiRequestError` in runReport and branch on its status, so a 400 or 403 refusal is not worded as the report engine being unreachable.

## HONEST-STATE-5. [medium] Run failures are mislabelled: every server refusal on the canvas reads "Couldn't reach the report engine"; the specific 403 and 404 wording is dead code

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:915`
- **Impact:** Distinction 2. A plan refusal (403), a scope refusal (400), an unknown type (404) and a server error (500) all render as an outage in the thread, e.g. "Couldn't reach the report engine — Report type compliance.audit_assurance_pack does not allow scope program." The engine was reached and said no. The intended honest messages ("needs a higher plan", "isn't in your governed report registry") are unreachable.
- **Evidence:** client/src/lib/queryClient.ts:398 `if (!response.ok && response.status !== 401) {` ... :406 `throw new ApiRequestError(...)`. So Insights.tsx:877-885 (`if (!res.ok) { const msg = res.status === 403 ? ... : res.status === 404 ? ...`) runs only for 401. Everything else lands in :914-915 `setThread(t => [..., { text: `Couldn't reach the report engine — ${e instanceof Error ? e.message : String(e)}.` ...`. The same file already knows this (comment at :1010 'apiRequest THROWS for every non-OK status except 401') and handles it in exportRep; apiCall.ts:25-35 documents the trap. The 400 body from report-os.ts:1443 is a plain string, which serverMessage passes through, so the typeId text reaches the user.
- **Suggested fix:** Use apiCall (as ComplianceReports does) or branch on the thrown error's status/payload. Say 'The report engine refused this run' for HTTP refusals.
- **Verifier:** real = `True`, severity = `medium`.

  > Confirmed at HEAD 726fd207. I could not refute it, and I found three easy ways a real user reaches it.
  > 
  > How it happens:
  > - client/src/lib/queryClient.ts:398 `if (!response.ok && response.status !== 401) {`, and then :406 `throw new ApiRequestError(message, response.status, errorPayload, code, correlationId);`. So apiRequest throws on every non-OK status except 401.
  > - In Insights.tsx at HEAD, runReport calls `await apiRequest('POST', '/api/report-os/runs', …)` at :875. The branch `if (!res.ok) { const msg = res.status === 403 ? … needs a higher plan … : res.status === 404 ? … isn't in your governed report registry …` at :882-890 is reached only on a 401. Every 400, 403, 404 and 5xx goes to the catch at :920: `` text: `Couldn't reach the report engine — ${e instanceof Error ? e.message : String(e)}.` ``.
  > - The rendered-document check at :899 (`if (!rres.ok || …)`) has the same problem.
  > - The same file already says so at :1015: "`apiRequest` THROWS for every non-OK status except 401, so in the real app the 409 above is reached HERE".
  > 
  > Nothing else catches it: no wrapper, interceptor or second check sits between the call and the catch. e.message is extractApiError → serverMessage(payload), and for a plain-string `error` serverMessage returns that sentence unchanged. ERROR_CODE_RE only matches SCREAMING_SNAKE, and INTERNAL_MARKERS does not match these sentences.
  > 
  > How a real user gets there (all at HEAD):
  > 1. **400 on preset tiles.** The canvas always sends `scopeType: program.scope`, and CanvasLeadProgram.scope is typed `'program'` (Insights.tsx:147, :877). The registry seed (migrations/20260930_report_type_registry_seed.sql:55) gives compliance.audit_assurance_pack the scopes `["project","submission","document"]`. That type appears in several presets (Insights.tsx:272, :277, …). The server answers report-os.ts:1443-1446 `res.status(400).json({ error: `Report type ${reportTypeId} does not allow scope ${scopeType}` … })`. The user sees "Couldn't reach the report engine — Report type compliance.audit_assurance_pack does not allow scope program.", which also shows an internal type id and a scope token.
  > 2. **403 plan refusal.** The "Plan" buttons (:1169 `onClick={() => setTierOverride(t.id)}`) and "Preview on …" (:1151) only override the tier on the client, so roDecide opens the gate. The server then refuses at report-os.ts:1465 with `{ error: 'This report requires the X plan.', requiredTier }`. The user sees "Couldn't reach the report engine — This report requires the enterprise plan.." (two periods). The intended "needs a higher plan (enterprise)" text can never appear.
  > 3. **404.** 'Project not found' or 'Unknown reportTypeId: …' also come out as "Couldn't reach".
  > 
  > Not already registered: neither the D6 DP-45..57 table nor the D2 launch README covers the run-failure wording.
  > 
  > The working tree makes it worse, but that change is not committed. A concurrent uncommitted edit to Insights.tsx adds a new viewer-role 403 message ("Running a report needs an editor role") to the same dead `if (!res.ok)` branch. The new untracked test client/src/concept2cure/v2/__tests__/insightsViewOnly.test.tsx mocks apiRequest to return `{ ok: status < 300, status, … }` instead of throwing (line 31), so the test would pass while the real app still shows "Couldn't reach the report engine". The defect is spreading, and a test that does not behave like the real apiRequest is hiding it.
  > 
  > Severity stays medium. The server's own sentence still gets through, so nothing is fabricated or hidden: the customer can still read why. But the screen says the engine could not be reached when it was reached and refused the run. That steers a regulated user toward retrying, or reporting an outage, instead of acting on a plan, role or scope refusal. On the 400 path it also shows an internal identifier. It does not rise to high: no data is falsified and no access boundary is crossed.
  > 
  > The line numbers are slightly off. At HEAD the catch is at :920 (cited :915) and the branch is at :882-890 (cited :877-885).

  Correction: Severity stays medium; correct the line numbers to HEAD 726fd207: the catch is at Insights.tsx:920 and the dead branch at :882-890. The rendered-document check at :899 (`!rres.ok`) is dead code for the same reason. The most common real trigger is a 400 from preset tiles: compliance.audit_assurance_pack only allows project, submission or document scopes, and the canvas always sends 'program'. The 403 is reached through the client-only Plan/"Preview on" tier override. The uncommitted working-tree change adds its viewer-403 message to the same dead branch, and its untracked test (insightsViewOnly.test.tsx:31) mocks apiRequest returning a non-OK Response, which hides the defect. Suggested fix: in the catch, branch on the thrown error's status and payload (the err.status/err.payload structural read exportRep uses at :1015-1024). Alternatively use apiCall, as ComplianceReports does. Delete the dead `!res.ok` branches.

## HONEST-STATE-6. [medium] The canvas says every value is provenance-linked; generated reports carry no provenance and the seal records 0 atoms

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:534`
- **Impact:** Distinction 3. "Every value is provenance-linked to its governed source; none is originated here." appears in the thread for every run and on the empty canvas. Metrics in the generic report ('Confidence 25%', 'Readiness score') have no source link and no 'Source on hover'. The seal toast then reads '... · 0 provenance atoms · ...'. The 'Confidence' number is a heuristic of the blocker count.
- **Evidence:** Insights.tsx:534 `Every value is provenance-linked to its governed source; none is originated here.`, :1189 `Every value is provenance-linked to a governed source; nothing is estimated.`, :1083 `all provenance-linked. Nothing is estimated.`, :307 RO_GUARDRAIL. render/render.ts builds metric/table blocks with no `provenance` key; seal.ts:80-100 extractProvenanceAtoms 'Blocks without provenance contribute nothing'. Probe: 'provenance atoms: 0'. Insights.tsx:1007 prints `${seal?.atomCount ?? 0} provenance atoms`. INSIGHTS_REPORTING_IMPLEMENTATION_SPEC.md:~280 states 'No number renders without a provenance handle'.
- **Suggested fix:** Drop the claim, or say it per block only where provenance exists. Attach provenance in renderReport before keeping the sentence.
- **Verifier:** real = `True`, severity = `medium`.

  > I checked this against HEAD 726fd207 and could not refute it. I compared the cited files with `git show HEAD:...`. The other session's uncommitted edits to Insights.tsx and report-os.ts do not touch any provenance text or provenance logic.
  > 
  > 1. **The claims are real and every user sees them.**
  >    - Insights.tsx:534 (the `generate_report` branch of `roRouteReply`) sends "Every value is provenance-linked to its governed source; none is originated here." into the thread each time a typed request resolves to a report type.
  >    - Insights.tsx:1194 (HEAD; the reporter wrote :1189) is on the empty canvas: "Every value is provenance-linked to a governed source; nothing is estimated."
  >    - Insights.tsx:1088 (HEAD; reported as :1083) is in the hint shown when no program exists: "every governed report, all provenance-linked."
  > 
  > 2. **No report run from the canvas carries any provenance.**
  >    - `runReport` (Insights.tsx ~877-935) always posts `scopeType: program.scope`.
  >    - The overview route hard-codes that scope as `scope: 'program'` (insights-canvas-routes.ts:96, :192).
  >    - On the server, the only path that attaches provenance is the lineage dossier. It is gated at report-os.ts:1521 on `reportTypeId === 'provenance.evidence_trace_report' && scopeType === 'document'`, so the canvas never reaches it, not even for its own "Evidence & Provenance Trace Report" tiles.
  >    - Every canvas run therefore goes through `buildRenderedFromRun` and then the generic `renderReport`. In render.ts, the executive-summary metrics (`{ kind: 'metric', label: 'Confidence', value: input.confidence, unit: '%' }`, plus 'Readiness score' and 'Readiness level'), the provider table and the gap and blocker lists are all built with no `provenance` key.
  >    - The server admits this in its own comment at report-os.ts:1771: "seals the dossier's real provenance atoms instead of the generic renderer's empty set".
  > 
  > 3. **The seal records 0 atoms.**
  >    - seal.ts `extractProvenanceAtoms` returns early when `!Array.isArray(provenance)`. Its doc comment says "Blocks without provenance contribute nothing".
  >    - `buildSealedRecord` therefore stores `atomCount: 0`.
  >    - Insights.tsx:1012 prints "... · 0 provenance atoms · run locked final". The surface contradicts its own claim in the same session.
  > 
  > 4. **The rendered report shows no source.**
  >    - `ROBlock` shows "Source on hover" only when `roProv(block.provenance)` is defined. It never is for these blocks, so no metric shows a source.
  >    - The 'Confidence' figure is a heuristic of the blocker count: orchestrator.ts:340 `Math.max(25, Math.min(95, 95 - blockers.length * 20))` (or a blend with the readiness score at :317-321). So 'Confidence 25%' shows with no link to anything.
  >    - INSIGHTS_REPORTING_IMPLEMENTATION_SPEC.md:281 states "No number renders without a provenance handle", which this violates.
  > 
  > 5. **Nothing mitigates it, and it is not already registered.**
  >    - No middleware, gate or later step adds provenance to these reports. The toast's honest "0 atoms" exposes the overclaim rather than fixing it.
  >    - Neither the D6 register (DP-45..DP-57) nor the D2 launch README mentions provenance-linkage or the empty atom set.
  > 
  > **Severity: medium is right.**
  > - It is not higher because:
  >   - No number is made up: the values come from deterministic code.
  >   - The truthfulness gate still holds status.
  >   - The seal toast states the 0-atom count truthfully.
  > - It is not lower because the false statement is about traceability, the property a GxP/Part 11 customer depends on. It appears on every run and on the empty state of a launch-catalog surface, and a sealed "final" record has no source for any of its numbers. That breaks the CLAUDE.md "never fabricate / honest state" rule.

  Correction: Two line numbers drifted. At HEAD the empty-canvas claim is Insights.tsx:1194 (reported as :1189) and the no-program hint is Insights.tsx:1088 (reported as :1083). Line :534 and the seal toast at :1012 are correct.

The finding should add why the provenance-carrying path is never reached. The canvas always posts `scopeType: 'program'` (insights-canvas-routes.ts:96, :192). The only server path that attaches provenance is report-os.ts:1521, which requires `scopeType === 'document'`. So even the canvas's own 'Evidence & Provenance Trace Report' tiles get zero atoms. The server comment at report-os.ts:1771 ("the generic renderer's empty set") confirms the gap is known in code.

RO_GUARDRAIL at :307 ("comes from a deterministic provider or a disclosed model") is roughly accurate and is not itself the overclaim.

Fix either way:
- Drop or condition the three provenance-linked sentences, for example by stating provenance per block only where `block.provenance` exists.
- Or have `renderReport` attach provenance refs (dependencySummary providers, run id, the orchestrator confidence formula) to every metric, table and list block before keeping the claim.

## HONEST-STATE-7. [medium] "Explain blockers" prints an empty reason list as 'the gate's own reasons, verbatim'; the truthfulness band is hidden for partial reports

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:518`
- **Impact:** Distinction 3, vacuous narrative. Asking "why is it partial?" returns: '"Executive Readiness Digest" is held at partial because: . Those are the gate's own reasons, verbatim. Clear them and it can promote toward final'. The gate only produces reasons when it downgrades a requested 'final', so a run stored 'partial' (the normal case with blockers) has none. The on-screen band (Insights.tsx:693) is also suppressed, so the report shows status 'partial' with no stated reason.
- **Evidence:** Insights.tsx:517-518 `const reasons = (rep.truthfulness && rep.truthfulness.reasons) || [];` ... `is held at ${rep.status} because: ${reasons.join('; ')}.` truthfulness.ts:62-107 every rule is guarded by `status === 'final'`; report-os.ts:1749 `requestedStatus = forceRequestStatus ?? (run.status === 'completed' ? 'final' : 'partial')`. Probe: evaluateTruthfulness({requestedStatus:'partial', blockers:[1 item]}, {allowPartial:true, requireBlockers:true, forbidFinalIfMissingCritical:true}) -> {"allowedStatus":"partial","reasons":[]} and the composed sentence is `... is held at partial because: . Those are the gate's own reasons, verbatim.`
- **Suggested fix:** When reasons is empty, list the report's blockers or say the status comes from the run's blockers. Do not claim the gate's reasons.
- **Verifier:** real = `True`, severity = `low`.

  > I confirmed the mechanism at HEAD (726fd207). The cited line has moved to Insights.tsx:519-520.
  > 
  > How the empty sentence is produced:
  > - **Where the run status comes from.** POST /api/report-os/runs stores `status: computed.blockers.length > 0 ? 'partial' : 'completed'` (server/routes/report-os.ts:1545). buildRenderedFromRun then requests `forceRequestStatus ?? (run.status === 'completed' ? 'final' : 'partial')` (report-os.ts:1745-1746).
  > - **When the gate gives reasons.** In truthfulness.ts:73-115, every rule that adds a reason is guarded by `status === 'final'`, except two: requireDisclosure (only the prediction types) and allowPartial !== true. Executive Readiness Digest has rules `{allowPartial:true, requireBlockers:true, forbidFinalIfMissingCritical:true}` (taxonomy.ts:33, and the same in migrations/20260930_report_type_registry_seed.sql:53).
  > - **Result for the normal case.** A run that has blockers is stored as partial, and its `truthfulness.reasons` is `[]`.
  > - **Probe with tsx against the real module.** Input: requestedStatus 'partial' with one blocker. Output: `{"allowedStatus":"partial","reasons":[]}`. The composed sentence is: `"Executive Readiness Digest" is held at partial because: . Those are the gate's own reasons, verbatim.`
  > 
  > **Reachable by a real user.** roRouteIntent sends any question containing 'why', 'explain', 'blocker', 'stuck' or 'final' to explain_blockers (Insights.tsx:344). For example, "why is it partial?" scores 1 there and 0 everywhere else. The router then reads `c.report`, which is the current report, passed at Insights.tsx:959. The template at 520, `is held at ${rep.status} because: ${reasons.join('; ')}. Those are the gate's own reasons, verbatim.`, has no empty-list branch. A run with no blockers comes out as "held at final because: ." which is just as empty.
  > 
  > **The on-screen band is suppressed, as reported.** Insights.tsx:695 renders `.ro-truth` only when `reasons.length` is non-zero. The ROReport comment at 676-679 says the band shows "what would move it to final", and that is false for stored partial runs.
  > 
  > **Not registered.** Searching docs/evidence for explain_blockers or "own reasons" finds nothing.
  > 
  > **Why I lowered the severity from medium to low.** The finding's claim that the report shows "status 'partial' with no stated reason" is overstated. renderReport adds a 'Blockers' section with a blocker-list whenever blockers exist (server/services/report-os/render/render.ts:165-170). ROReport is only ever rendered full, never compact (Insights.tsx:1213), so the blocker list is visible in the report body right next to the reply. The defect is narrower: a deterministic reply says it is quoting the gate's reasons verbatim, while quoting nothing and leaving out the blockers that actually explain the status. That is a misleading, empty statement on a governed surface. No figures are fabricated and the governing information is still on screen, so it is a low-severity honesty defect, not a medium one.

  Correction: Severity is low, not medium: the full report still shows a 'Blockers' section (render.ts:165-170, and ROReport is always rendered full at Insights.tsx:1213), so the 'no stated reason' half of the impact is overstated. Corrected line: Insights.tsx:519-520 at HEAD. Fix: when truthfulness.reasons is empty, build the reply from the report's blocker-list section, or say the status comes from the run's outstanding blockers. Only claim "the gate's own reasons, verbatim" when reasons.length > 0. Also correct the ROReport comment at Insights.tsx:676-679, which says the .ro-truth band states what would move the report to final.

## HONEST-STATE-8. [medium] Plan bar presents a local 'preview' as the organisation's plan; the portfolio answer then states two false things

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:506`
- **Impact:** Distinctions 1 and 2. Clicking Standard/Professional/Enterprise (or the 'Preview on Enterprise' chip) sets a client-only override. The 'Plan' bar then highlights the previewed tier exactly as it highlights the real one, locked tiles turn into 'Run report' buttons, and runs are refused by the server. On a non-enterprise org the suggested prompt 'Compare readiness across all my programs' routes to portfolio_readiness. With the override on, the answer is "Your plan unlocks the portfolio rollup, but there are no governed programs to roll up yet." Both clauses are false: the plan does not unlock it, and the program exists. This branch is reachable only through the override, because the server withholds programs when the org is not entitled.
- **Evidence:** Insights.tsx:1162-1164 `<div className="rc-tier" role="group" aria-label="Subscription tier"><span className="rc-tier-lbl">Plan</span>{RO_TIERS.map(t => (<button ... className={'rc-tier-b' + (tier === t.id ? ' on' : '')} onClick={() => setTierOverride(t.id)}>` with no preview marker; :838 `const tier = tierOverride ?? data?.tier ?? 'standard';`. :501-506 `const dec = roDecide('portfolio_rollup', 'portfolio', tier); ... const rows = ctx.portfolio.programs ? ... : []; if (rows.length === 0) return { ... text: `Your plan unlocks the portfolio rollup, but there are no governed programs to roll up yet.` ...`. insights-canvas-routes.ts:327-328 `programs: gate.entitled && summary ? ... : null`. Insights.tsx:398 supplies the prompt.
- **Suggested fix:** Label an override 'Previewing <tier> — your plan is <real tier>' and keep the real tier visible. Branch the portfolio reply on data.portfolio.entitled, not on the previewed tier.
- **Verifier:** real = `True`, severity = `medium`.

  > I read the code at HEAD (726fd207, concept2cure-v2). The finding holds. Only the line numbers have moved.
  > 
  > 1. **The override is client-only and drives every client entitlement check.** Insights.tsx:854-855: `const [tierOverride, setTierOverride] = useState<string | null>(null); const tier = tierOverride ?? data?.tier ?? 'standard';`. The code calls it a "preview on another plan" control (:852-853). That `tier` is passed to `roRouteReply` (:957) and to `RODashboard` (:1232), where it sets lock versus 'Run report' through `roDecide` (:783).
  > 
  > 2. **The plan bar never says it is a preview.** Insights.tsx:1197-1199: `<div className="rc-tier" role="group" aria-label="Subscription tier"><span className="rc-tier-lbl">Plan</span>{RO_TIERS.map(t => (<button ... className={'rc-tier-b' + (tier === t.id ? ' on' : '')} onClick={() => setTierOverride(t.id)}>`. The previewed tier gets the same `.on` style as the real one (insights-v2.css:54). Neither the bar nor its aria-label says 'preview', and once overridden the real plan (`data.tier`) is not shown anywhere. The word 'Preview' appears only on the lock chip (:1181).
  > 
  > 3. **The suggested prompt does reach the portfolio branch.** Insights.tsx:400 puts 'Compare readiness across all my programs' in every opener. In `roRouteIntent` (:338-354), the token 'programs' does not match the keyword 'program'. 'across' scores portfolio_readiness at 1 and 'compare' scores compare_regions at 1. That tie gives `matched: false`. The candidates are sorted stably, so `candidates[0]` is portfolio_readiness (it comes before compare_regions in key order), and `roRouteReply` takes that branch.
  > 
  > 4. **The false sentence.** Insights.tsx:503-508: `roDecide('portfolio_rollup','portfolio',tier)` returns entitled under the Enterprise override. Then `rows = ctx.portfolio.programs ? ... : []` and `if (rows.length === 0) return { ... text: "Your plan unlocks the portfolio rollup, but there are no governed programs to roll up yet." }`.
  >    - The server sends `programs: gate.entitled && summary ? summary.attentionRanked.map(toPortfolioProgram) : null` (server/routes/insights-canvas-routes.ts:329-330).
  >    - On a non-Enterprise org, `programs` is therefore always null, so rows is empty.
  >    - The canvas only renders when `leadProgram` exists (Insights.tsx:1080, `if (!program || !data || !suggest)` shows the empty state). `leadProgram` is taken from the same `summary.attentionRanked` without any entitlement check (routes:306-307). So a program exists and is on screen, named in the header and the opener.
  >    - Both clauses are false: the plan does not unlock the rollup, and governed programs do exist. The comment at :505-506 even says programs is null "when the org isn't entitled", yet the message does not check `ctx.portfolio.entitled`, which the client already has (routes:313).
  > 
  > 5. **A real user gets there in two clicks.** A Standard or Professional org clicks the prompt and gets the lock message with the 'Preview on Enterprise' chip (:1181). Clicking the chip and then the prompt again produces the false sentence. Any of the three plan-bar buttons (:1199) gets there too.
  > 
  > 6. **Nothing else mitigates it.** The server refuses report runs and data stays gated, so no data is exposed and no number is fabricated. The fault is a false statement about the org's own plan and its records, which matches the honest-state lens and the 'never fabricate / honest empty states' rule. The tile half of the claim also checks out: under the override, locked tiles render as 'Run report' buttons (:783-807) for runs the server refuses.
  > 
  > 7. **Not already registered.** I searched docs/evidence/D2-REPORTING-LAUNCH-APP and docs/evidence/D6/2026-09-30-compliance-reports for tierOverride, preview, and the 'unlocks the portfolio' text. Nothing matches.
  > 
  > **Severity:** medium is right. It is a user-visible false claim about entitlement and about whether programs exist, on a launch surface. The server stays fail-closed and no data or figure is fabricated, which keeps it below high.
  > 
  > **Line corrections:** override at Insights.tsx:855 (cited as :838), plan bar at :1197-1199 (cited as :1162-1164), portfolio text at :507 (cited as :506), prompt at :400 (cited as :398).

  Correction: Keep severity medium and correct the line numbers to HEAD: override at Insights.tsx:855, plan bar at :1197-1199, false sentence at :507, prompt at :400. The fix:
1. In roRouteReply's portfolio_readiness branch, check `ctx.portfolio.entitled` (the server's real gate, insights-canvas-routes.ts:313) before saying 'Your plan unlocks…'.
2. When the override is on but the server says not entitled, answer 'Previewing Enterprise: the portfolio rollup is not unlocked on your <real tier> plan, so no programs are returned', not 'there are no governed programs'.
3. When `tierOverride` is set, give the plan bar a visible 'Previewing <tier>, your plan is <data.tier>' marker and a reset control, and keep the real tier marked on the bar.

## HONEST-STATE-9. [medium] User access review reports 'emailed_code' as the second factor for members who sign in through SSO and are never asked for a code

- **Where:** `server/services/audit/compliance-reports/queries/access-review.ts:50`
- **Impact:** Distinction 3 (assessed vs unknown). An auditor reading the access review for SOC 2 / Part 11 sees a platform second factor on every non-TOTP account. For members authenticated through SAML (and SCIM-provisioned accounts) the platform issues the session straight after the IdP assertion with no emailed-code step, so the column asserts a factor that was never applied. The report has no 'identity provider' or 'not tracked' state and the not-recorded list does not mention it. The cells show raw 'emailed_code' / 'authenticator_app'.
- **Evidence:** access-review.ts:50 `CASE WHEN u.mfa_enabled AND u.mfa_method = 'totp' THEN 'authenticator_app' ELSE 'emailed_code' END AS mfa_posture`. routes/sso.ts:540 `await findOrCreateSamlUser(samlUser, configOrgId)` then :548-549 `openSession(...)`, `jwt.sign(` with no MFA/OTP step (grep for otp|mfa|second factor|challenge in sso.ts: no matches). mdx-admin.ts:296-309 states the emailed-code rule is for password sign-in ('Password sign-in asks for the authenticator app when one is enrolled, otherwise an emailed code'). Not run against a DB; established from source.
- **Suggested fix:** Emit a distinct posture for accounts that authenticate through SSO/SCIM ('identity provider; not verified by the platform'), or 'not stated' where it cannot be known.
- **Verifier:** real = `True`, severity = `medium`.

  > I could not refute this. I checked it against the source at HEAD (726fd207, concept2cure-v2) and did not run anything against a database.
  > 
  > 1. **The report labels every non-TOTP member 'emailed_code'.** access-review.ts:50 reads `CASE WHEN u.mfa_enabled AND u.mfa_method = 'totp' THEN 'authenticator_app' ELSE 'emailed_code' END AS mfa_posture`. It does not look at how the account signs in. Column :24 is headed 'Second factor', with no qualifier. Neither the notes (:78-79) nor the notRecorded list (:107-112) mentions SSO. The raw values reach the screen unchanged: a grep for emailed_code/mfa_posture across client and shared returns nothing.
  > 
  > 2. **SAML sign-in issues a full session with no platform second factor.** In sso.ts:471-603, the callback validates the assertion, calls `findOrCreateSamlUser(samlUser, configOrgId)` (:540), then `openSession(...)` (:548) and `jwt.sign({... provider: 'saml', type: 'access', ...session})` (:549-562). There is no OTP or MFA step. Auth middleware also does not add one: auth.ts only rejects tokens that are not access tokens (:157) and copies `provider` (:258). A SAML token is `type: 'access'` with no mfaPending, so no later step-up applies.
  > 
  > 3. **Some affected accounts have no password door at all.**
  >    - SAML just-in-time accounts are created with `passwordHash: \`saml:${crypto.randomUUID()}\`` (sso.ts:918-922; the comment says "SAML users don't have a local password").
  >    - SCIM accounts are created with `password_hash` = `scim:${crypto.randomUUID()}` (scim.ts:649-651).
  >    - Unless someone runs a password reset, these accounts only ever sign in through SAML, so the platform never sends them an emailed code. The report still says 'emailed_code' for every one of them.
  >    - Existing password accounts that are also SAML members have the emailed code only on the password path. The SAML door skips it.
  > 
  > 4. **The platform's own wording limits the rule to password sign-in.** mdx-admin.ts:296-309 says 'Password sign-in asks for the authenticator app when one is enrolled, otherwise an emailed code.'
  > 
  > 5. **Production can reach this.** SAML is set per organisation from SAML_TENANTS or the SAML_IDP_* variables (sso.ts:197-252). It is not limited to dev. The only dev-only door is the generic `/:provider/callback` (:793-823). The report itself is in the catalog (catalog.ts:12,53), so the compliance-reports surface runs it.
  > 
  > 6. **Not already registered.** The D6 register (README rows DP-45..DP-57) has no entry about SSO, SAML or the second-factor posture.
  > 
  > **Severity: medium is right.** This is not an access-control hole. Most identity providers enforce their own MFA, and SSO depends on enterprise configuration. But a SOC 2 / Part 11 user access review that states a factor the platform never applied, on every SSO and SCIM account, is a material misstatement in an auditor-facing record. Distinction 3 (assessed vs unknown) has no state for this case.

  Correction: The mechanism and the severity stand. Two refinements to the finding:
- **Narrow the claim.** SAML/SCIM-provisioned accounts (password_hash prefixed 'saml:' or 'scim:') never get a platform second factor unless they later set a password. Password accounts that also sign in through SAML get the emailed code only on the password path; the SAML door skips it.
- **Name the fix concretely.** In MEMBERS_SQL, derive the posture from a password_hash prefix of 'saml:' or 'scim:' and/or from successful `user_login` audit rows with reason 'saml_sso'. Emit an 'identity provider (not verified by the platform)' state for those accounts. Then either rename the column to 'Second factor at password sign-in' or add a notRecorded line saying that SSO sign-ins rely on the IdP's factor, which the platform does not record. Map the raw 'emailed_code' / 'authenticator_app' values to labels a person can read.

## HONEST-STATE-10. [medium] Integrity attestation says 'intact — every row carries a hash linked to its predecessor' for a chain with an unlinked row

- **Where:** `server/services/audit/signedAuditExport.ts:299`
- **Impact:** Distinction 3. The audit-trail integrity attestation, which a regulator is handed, reports the audit_events chain as 'intact' and (with the two other checks) 'All 3 integrity checks passed at generation', although a row whose previous_hash was nulled mid-chain is accepted. The check compares stored pointers only and never recomputes a hash. The sentence is stronger than the check.
- **Evidence:** signedAuditExport.ts:299 `if (row.previous_hash !== prevHash && prevHash !== null && row.previous_hash !== null) { brokenLinks++; }` so previous_hash NULL after a hashed predecessor is not counted. audit-trail-integrity.ts:93 `detail: `Every one of ${s.totalEntries} rows carries a hash linked to its predecessor.``. Probe on snapshotChainIntegrity with a fake pool: rows [A,null],[B,prev A],[C,prev null],[D,prev C] -> {"status":"intact","totalEntries":4,"brokenLinks":0}; the same rows with row 3 naming a wrong predecessor -> status 'broken'. Pre-existing function, now wrapped in the new attestation (not covered by DP-45/46).
- **Suggested fix:** Count a NULL previous_hash after a hashed predecessor as a break, and say 'links compared' rather than 'linked'. Ideally recompute record_hash.
- **Verifier:** real = `True`, severity = `low`.

  > The mechanism is real at HEAD (concept2cure-v2, 14c17341). In signedAuditExport.ts:299 the check is `if (row.previous_hash !== prevHash && prevHash !== null && row.previous_hash !== null) { brokenLinks++; }`, so a NULL previous_hash after a hashed predecessor is never counted. audit-trail-integrity.ts:93 then prints "Every one of ${s.totalEntries} rows carries a hash linked to its predecessor.", and summarizeIntegrityChecks (:135) can return ok:true. I ran the probe with tsx against the real function and a fake pool. Rows [A,null],[B,A],[C,null],[D,C] give {"intact",0}. A wrong pointer on row 3 gives "broken". Nothing registered in DP-45..57 covers this.
  > 
  > The impact is overstated, because no real user or attacker without database-owner rights can create the precondition:
  > - audit_events is in APPEND_ONLY_TABLES (scripts/db/provision-app-role.mjs:165-176), so the runtime role gets SELECT and INSERT only and never owns the table.
  > - trg_audit_events_no_update (db/migrations/20260222_audit_events_immutability.sql) raises P0A01 on every UPDATE and has no bypass.
  > - The BEFORE INSERT trigger trg_audit_events_hash_chain sets `NEW.previous_hash := prev_hash` from the latest row on every insert, so a writer cannot leave it NULL mid-chain. It has been on the applier since 2026-09-10 (scripts/db/migration-set.mjs:1583).
  > 
  > So a NULL pointer mid-chain only appears if a table owner or superuser disables the triggers.
  > 
  > For that insider, the NULL tolerance gives no extra capability. Delete B and rewrite C.previous_hash to the true predecessor A, and the probe also returns "intact", because record_hash is never re-derived. The fix the finding suggests (count NULL as a break) would not close the real gap.
  > 
  > The tolerance is deliberate and documented ("A null previous_hash ... is treated as 'no claim about the predecessor' and never counts as a break", chainIntegrityMonitor.ts:155-157). The daily sweep has the same tolerance, so it is not a mitigation. The sweep's immutability_triggers check only catches a trigger that is still disabled when the sweep runs.
  > 
  > Existing tenants with rows from before the trigger always get "not verified", so "intact" can only be reached for orgs whose rows are all hashed.
  > 
  > The fair residual is low: a wording and verifier-strength gap in a regulator-facing attestation that only an insider bypassing DB triggers can exploit.

  Correction: Severity is low, not medium. The mechanism is confirmed (signedAuditExport.ts:299 skips a NULL previous_hash, and audit-trail-integrity.ts:93 overstates the result). No user or runtime DB role can produce a NULL pointer mid-chain:
- audit_events is SELECT and INSERT only for the runtime role (provision-app-role.mjs:165-176).
- trg_audit_events_no_update raises P0A01 on any UPDATE.
- trg_audit_events_hash_chain always sets previous_hash on INSERT. It has been on the applier since 2026-09-10 (migration-set.mjs:1583).

Only a table owner or superuser who disables the triggers can create that state. For that actor, relinking C to A after deleting B is also reported "intact", because record_hash is never re-derived. Counting NULL as a break would therefore not close the gap.

The real residual: an "intact" verdict from a pointer-only check sits next to a re-deriving one ("Every chained row re-derives from its predecessor", :76), and both feed "all checks passed". Fix:
- Re-derive record_hash with the trigger's own formula (sequence|event_type|entity_type|entity_id|user_id|user_name|timestamp|reason|prev or GENESIS). That formula is now the canonical serialization, so chainIntegrityMonitor.ts:12-15 ("no single canonical record_hash serialization") is stale.
- Until then, word the detail as "previous_hash pointers match; row content is not re-derived".
- Optionally count a NULL previous_hash after a hashed predecessor as a break in both snapshotChainIntegrity and summarizeChainLinkage.

Also stale: signedAuditExport.ts:288-291 still says the hash-chain trigger is not in C2C_MIGRATION_FILES.

## HONEST-STATE-11. [medium] 'Retention policies in use' shows today's documents under whatever past period was chosen, and the surface says the report covers 'the records in a date range'

- **Where:** `server/services/audit/compliance-reports/queries/retention-legal-holds.ts:123`
- **Impact:** Distinction 4 (current state presented as the period's). An auditor running Q1 of last year gets a header '2025-01-01 to 2025-03-31 (UTC)' and a section titled 'Retention policies in use' that is the live state of vault.documents today. The as-of reports got disclosure notes (DP-51); this range report did not.
- **Evidence:** retention-legal-holds.ts:30-44 POLICIES_SQL reads `WHERE d.deleted_at IS NULL` with only $1 (organisation), no period; the section note at :122-124 'Documents that are not deleted, by the retention policy they name.' has no 'as at generation' wording; notRecorded (:176-178) does not mention it. client complianceReportsModel.ts:139 `if (report.period === 'range') return 'Reports the records in a date range.';`. pastAsOfNote (:146) applies to as-of reports only.
- **Suggested fix:** Add 'as at generation, not as at the period' to the policies note and to the range-report rule line, or compute policies as of the period end.
- **Verifier:** real = `True`, severity = `medium`.

  > I checked this at HEAD (14c17341, concept2cure-v2) and the finding holds.
  > 
  > 1. The query takes no period. In server/services/audit/compliance-reports/queries/retention-legal-holds.ts:29-45, POLICIES_SQL filters only on `WHERE d.deleted_at IS NULL AND (d.organization_id = $1 OR ...)`. At :121 it is called with `cappedSection(ctx.client, POLICIES_SQL, [ctx.orgId])`. The holds and dispositions queries do get the period: :118 builds `const period = [ctx.orgId, ctx.bounds.start, ctx.bounds.end]` and :126-127 pass it. So the "Documents" count and "Earliest retention date" describe vault.documents as they are now. They include documents created after the period ends and leave out documents deleted since then. The policy definition columns (retention_days, active, hard_delete) are also today's values.
  > 
  > 2. Nothing discloses this. The section note at :123 reads 'Documents that are not deleted, by the retention policy they name...' and has no "as at generation" wording. The notRecorded list at :186-188 does not mention it either. For comparison, the as-of reports do say so: access-review.ts:80 has 'read as they are at generation time', and controlled-documents.ts:218 has 'shows each record as it is now'.
  > 
  > 3. The client implies the opposite. complianceReportsModel.ts:139 returns `if (report.period === 'range') return 'Reports the records in a date range.';`, which ComplianceReports.tsx:212 shows before the run. ComplianceReportResult.tsx:37/45 heads the result with `${result.period.from} to ${result.period.to} (UTC)`. pastAsOfNote at complianceReportsModel.ts:146-147 returns null for range reports (`if (report.period !== 'as-of') return null;`). The CSV header does carry the period and the section notes (csv.ts:47-59), so the signed CSV has the same gap.
  > 
  > 4. A real user can reach it. retentionLegalHolds is registered in catalog.ts:18/58. It is served by GET /api/audit/reports/:reportId, which is mounted through server/bootstrap/register-inline-routes.ts:35, and the Compliance Reports surface runs it. Org owners, admins and managers can run it.
  > 
  > 5. It is not registered. The D6 register only fixed DP-51 for as-of reports ('As-of reports showed today's roles and status as of a past date ... Fixed by disclosure'). It has no entry for the range report's policies section, and the file has had a single commit (0224f43a) since then.
  > 
  > 6. There are partial mitigations, but they don't fix it. The manifest strip shows 'Generated <timestamp>' (ComplianceReportResult.tsx:95) and the CSV prints 'Generated at:'. The section wording is in the present tense ('are not deleted', and the purpose says 'are kept under'). A careful reader could work it out, but the period header and the 'records in a date range' line point the other way.
  > 
  > 7. Severity stays medium. This is the same failure the reviewers treated as a must-fix for as-of reports: current state shown as the period's, in an auditor-facing report that cites 21 CFR 11.10(c) and GDPR Art. 5(1)(e). The documents are the customer's own and nothing crosses tenants, so it is not high.

  Correction: There are two fixes, in order of effort.

The minimum fix is to disclose it, the same way DP-51 was fixed. In retention-legal-holds.ts:123, change the policies note to something like 'Shown as at generation, not as at the period: documents that are not deleted when the report is run, by the retention policy they name, with each policy as it is defined now.' Add a matching line to notRecorded: 'Past retention-policy assignments and policy definitions are not recorded, so this section cannot show them as they were during the period.' On the client, either make periodRule for this report say that the policies section is the current state, or extend pastAsOfNote to range reports whose end date is before the generation date.

The fuller fix is to compute the section as of the period end. Count documents with created_at < $3 AND (deleted_at IS NULL OR deleted_at >= $3). Policy definitions (retention_days, active, hard_delete) still have no recorded history, so those columns would keep the disclosure note.

## HONEST-STATE-12. [low] Portfolio board view: success-coloured 'avg readiness' pill, client-recomputed mean under copy that says it is not recomputed, and the 100-program cap is never disclosed

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:722`
- **Impact:** A board view of an enterprise org with weak programs shows 'avg readiness 25%' in the green 'ok' status style. The note says AnA 'does not recompute' the scores although the average is computed here. An org with more than 100 top-level programs sees 'Readiness across your 100 programs' and '100 programs'; the server's `truncated` flag and `summary` are fetched but unused.
- **Evidence:** Insights.tsx:719 `const avg = rows.reduce((a, r) => a + r.readiness, 0) / Math.max(1, rows.length);` :722 `<span className="ro-status st-ok">avg readiness {Math.round(avg)}%</span>`; styles/insights-v2.css:86 st-ok = success colour; :731 'AnA ranks and frames them, it does not recompute them.' portfolio/fetch.ts:37,155-158 ORG_ROLLUP_CAP 100 with `truncated`; insights-canvas-routes.ts:313-326 sends summary.avgReadiness and truncated; grep of Insights.tsx finds `truncated` only in the interface (:185).
- **Suggested fix:** Use summary.avgReadiness, a neutral tone, and show 'showing the first 100 of more' when truncated.
- **Verifier:** not run (low).

## HONEST-STATE-13. [low] Report 'generated' time and the seal are over a rendering stamped with the wall-clock of each render; nothing ever verifies the Report-OS seal

- **Where:** `server/routes/report-os.ts:1776`
- **Impact:** The canvas prints 'generated <time>' (and the gap sentence prints a timestamp) taken from the moment of the GET /rendered call, not the run. The finalize toast says 'Sealed · sha256 …', but re-rendering the stored run later produces a different generatedAt and so a different hash, and no code path calls the report-os verifySeal. The user's belief that a sealed report can later be checked against its seal has no basis. Overlaps the security lens.
- **Evidence:** report-os.ts:1776-1788 renderReport({...}) passes no generatedAt; render/render.ts:52 `const generatedAt = input.generatedAt ?? new Date().toISOString();`; seal.ts computeContentHash canonicalises the whole report including generatedAt; grep `verifySeal(` outside tests: only the unrelated audit-hmac-seal.ts and the definition in sealing/seal.ts:150. Insights.tsx:904 additionally falls back `generatedAt: rendered.generatedAt ?? new Date().toISOString()`.
- **Suggested fix:** Pin generatedAt to the run's createdAt/freshness.generatedAt before rendering and sealing, and add a verify path before the UI says 'Sealed'.
- **Verifier:** not run (low).

## HONEST-STATE-14. [low] Overview read is unguarded and a tier-read failure shows as a 'Standard' plan

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:830`
- **Impact:** A 200 whose body is the wrong shape (envelope change, proxy) is rendered as 'No program readiness yet … Nothing is estimated', not as an error. If the server's tier resolution throws it answers 200 with tier 'standard', so an enterprise customer sees 'Plan: Standard', locks and 'See plans' with no hint the plan could not be read.
- **Evidence:** Insights.tsx:830 `useLiveData<CanvasOverview>('/api/insights-canvas/overview')` with no guard (dataConnect.tsx:214 hasKeys exists for this); :1076 `if (!program || !data || !suggest)` shows the empty state; :838 `data?.tier ?? 'standard'`. entitlement-map.ts:95-100 `catch { tier = 'standard'; }` and insights-canvas-routes.ts:251-253 uses it unflagged. The hostile probe passes this because it accepts an empty state.
- **Suggested fix:** Pass hasKeys('tier','leadProgram','portfolio') as the guard. Have the server flag an unresolved tier and render 'plan could not be read'.
- **Verifier:** not run (low).

## HONEST-STATE-15. [low] ROChart invents data when a spec lacks it; compare view asserts a negative about the user's record it never read

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:593`
- **Impact:** Latent: no server path emits chart blocks today (grep of server/services/report-os finds chartType only in render/types.ts), so this is unreachable at HEAD. If one does, a missing series draws as a plausible trend or forecast. The compare dashboard says 'No per-market assessment is in the governed record' without reading the record, and tells the customer to 'Connect the live regional providers'.
- **Evidence:** Insights.tsx:593 `Array.isArray(s.points) ? ... : [62, 66, 64, 70, 73]`; :575-576 `Number(s.anchor) || 60` and fixed offsets `[[0, a], [1, a + 3], [2, a - 2], [3, a + 6], [4, a + 2]]` (server points ignored); :557 `Number(s.value) || 0` draws a missing readiness as 0; :764 `No per-market assessment is in the governed record, so every market cell reads "--". Connect the live regional providers to populate the deltas.`
- **Suggested fix:** Render 'no data' when the spec lacks points/anchor/value; say 'Per-market comparison is not available on this surface yet.'
- **Verifier:** not run (low).

## HONEST-STATE-16. [low] As-of reports accept a future date and present today's state as that date

- **Where:** `server/services/audit/compliance-reports/period.ts:55`
- **Impact:** A user can run the access review or controlled-document register 'as of 2027-01-01' and receive the current membership/documents under that date. pastAsOfNote only warns for past dates, so nothing says the date has not happened.
- **Evidence:** period.ts:55-61 as-of branch returns `bounds: { start: to.toISOString(), end }` with no check against `now`; client complianceReportsModel.ts:149 `if (period.to >= generatedOn) return null;`; ComplianceReportResult.tsx:37 header 'As of <future date>'.
- **Suggested fix:** Refuse an as-of date later than today (UTC) with a 400 and the same message client-side in periodProblem.
- **Verifier:** not run (low).

## What the lens found clean

- Distinction 1 (sample vs live): neither surface can fall back to a fixture. Insights.tsx:830 uses the fixture-free useLiveData and the run path uses apiRequest; ComplianceReports.tsx:58,82 uses apiCall. Measured provenance ratio: `useLive(` appears in 1 file and `liveGet(` in 1 file under client/src/concept2cure/v2 (the helper), 6 files render <SampleTag, 87 surface files use useLiveData/useLiveRows/liveGetOrNull and 86 render tone="error". The L44 '72 vs 4' ratio does not reproduce at HEAD.
- Insights overview failure is not rendered as empty: Insights.tsx:1057-1075 shows EmptyState tone="error" (and keeps the compliance-reports button), separate from the no-program state at :1076-1091. Server answers a failed portfolio read 503 PORTFOLIO_UNAVAILABLE (insights-canvas-routes.ts:263-278) and a missing tenant 403 (:236-238). Loading state at :1048.
- Insights finalize/export failure branches are honest: the thrown-error structure is read for 409 RUN_ALREADY_FINAL / 409 reasons / 403 role (Insights.tsx:810-820, 1009-1022); the PDF branch reports 'no file saved' separately from 'Not sealed' (:1025-1043); an unexportable report is refused with a toast (:985).
- Insights null/zero handling in report blocks: a null metric renders '--' not 0 (:620), null table cells '--' (:638), the compare grid states plainly that every cell is empty (:751, :764), presets no longer assert the reader's filing state (insightsHonestCopy.test.ts), programName never prints a database id (:204-210).
- Client type catalog matches the server: all 29 RO_TYPES typeIds exist in the 61-type seed, scope lists match with 0 drift (probe), RO_FEATURE_TIER matches mdx-entitlements.ts, and the registry seed migration holds all 61 (D2 report-os README).
- ComplianceReports failure handling is thorough: catalog read failure -> ErrorState with retry (ComplianceReports.tsx:56-63, 143-146); strict catalog parse rejects a partial list (complianceReportsModel.ts:95-102); run errors map 403/429/400/503/network distinctly and 503 says nothing was exported (:195-210); unreadable result says 'Nothing is shown' (ComplianceReports.tsx:86-88); a malformed section is 'could not be read', not empty (complianceReportData.ts:113-129, ComplianceReportResult.tsx:212-218); AnA context publishes a failed catalog as a failed read (complianceReportsModel.ts:263-271).
- ComplianceReports never shows 0 checked rows as verified: chainLine (complianceReportData.ts:189-201) and storeLine (:203-212) turn ok with rowsChecked 0 into 'nothing was verified'; server verdicts are 'not verified' for an empty walk, empty linkage, zero sealed rows and a check that did not run (audit-trail-integrity.ts:73-98); non-integrity reports state 'does not verify the audit chain' (generate.ts:56-60).
- Compliance report server paths: period parse refuses rather than coerces (period.ts:46-80); section cap sets `truncated` instead of silently dropping rows (queries/section.ts:14-18) and the client shows it (ComplianceReportResult.tsx:256-258); record-before-send with 503 REPORT_NOT_RECORDED (routes/audit-compliance-reports.ts:150-186); CSV second-run is disclosed with its own export id and count differences (ComplianceReportResult.tsx:177-187); as-of reports carry current-state notes (access-review.ts:78-83, controlled-documents.ts:127-134).
- Measured gates: `npm run ci:internals-in-copy` -> 'no new occurrences. 0 baselined across 0 file(s)'; `npm run check:microcopy` -> 'OK — scanned 404 customer-facing files'.
- Verify-a-saved-report (ComplianceReportsVerify.tsx:91-100) distinguishes unreadable files, a failed call, an unreadable answer, a valid seal and an invalid seal; it computes no verdict itself and says the seal is not an electronic signature (ComplianceReportResult.tsx:130-131).

## What the lens did not cover

- No database in the sandbox: the 25% floor and the 'No governed artifacts discovered' text for the canvas path are established from source and arithmetic (computeInitialRun could not run), not from a live provisioned run. The tsx probes (render, truthfulness, snapshotChainIntegrity, seed scope counts) are pure and were run from the scratchpad with no repo edits.
- hostilePayloadProbe.test.tsx and the Insights/ComplianceReports vitest suites were read but not executed. The probe feeds overview-level payloads only, so malformed rendered-report blocks (sections without blocks, non-array table rows) are unprobed and would throw in ROReport/ROBlock.
- AnA-side reporting tools (AnaToolExecutor generate_report / list_report_types / explain_blockers and server/services/report-os/canvas/*) and their rendering were not audited.
- /api/insights/* (predictions, quality, subscriptions) has no client consumer; only the claims about /predictions/run were checked. Report-OS bundles, deliveries, program-groups, snapshots, scheduling, correspondence capture and the bundle PDF were not read.
- Compliance report SQL correctness for electronic-signatures, administrative-changes and controlled-documents was read for honesty of notes and empty-set behaviour only; csv.ts, run-limits.ts and the RLS/tenant boundary were left to the security lens.
- The Report-OS run PDF builder (createRunPdf) was read only for its status line, and truncation when providers/blockers overflow the page was not exercised. Findings already registered in D6 DP-45..DP-57 and D2 DP-47/DP-50 were not repeated.
- Rendered visuals, accessibility and copy tone were out of this lens.

## Files read

- `docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/README.md`
- `docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/report-os/README.md`
- `docs/evidence/D6/2026-09-30-compliance-reports/README.md`
- `docs/GA_COMPLETION_LEDGER_2026-08.md (L189 only)`
- `shared/constants/launch-scope.ts`
- `shared/constants/ui-surface-registry.ui-v2.ts`
- `client/src/concept2cure/v2/surfaces/Insights.tsx`
- `client/src/concept2cure/v2/surfaces/ComplianceReports.tsx`
- `client/src/concept2cure/v2/surfaces/ComplianceReportResult.tsx`
- `client/src/concept2cure/v2/surfaces/ComplianceReportsVerify.tsx`
- `client/src/concept2cure/v2/surfaces/complianceReportsModel.ts`
- `client/src/concept2cure/v2/surfaces/complianceReportData.ts`
- `client/src/concept2cure/v2/dataConnect.tsx`
- `client/src/concept2cure/v2/apiCall.ts`
- `client/src/concept2cure/v2/assessmentState.ts`
- `client/src/lib/queryClient.ts`
- `client/src/concept2cure/v2/__tests__/hostilePayloadProbe.test.tsx`
- `client/src/concept2cure/v2/__tests__/insightsHonestCopy.test.ts`
- `server/routes/insights-canvas-routes.ts`
- `server/routes/report-os.ts`
- `server/routes/report-os-insights.ts`
- `server/routes/audit-compliance-reports.ts`
- `server/routes/audit-trail-routes.ts`
- `server/routes/sso.ts`
- `server/services/report-os/orchestrator.ts`
- `server/services/report-os/portfolio/fetch.ts`
- `server/services/report-os/portfolio/aggregate.ts`
- `server/services/report-os/render/render.ts`
- `server/services/report-os/truthfulness.ts`
- `server/services/report-os/sealing/seal.ts`
- `server/services/report-os/entitlement-map.ts`
- `server/services/report-os/taxonomy.ts`
- `server/services/report-os/prediction/report-types.ts`
- `server/services/report-os/quality/calibration.ts`
- `server/services/audit/signedAuditExport.ts`
- `server/services/audit/compliance-reports/ (catalog, generate, integrity-checks, period, signed-report, queries/section, access-review, authentication-events, administrative-changes, electronic-signatures, audit-trail-integrity, retention-legal-holds, controlled-documents)`

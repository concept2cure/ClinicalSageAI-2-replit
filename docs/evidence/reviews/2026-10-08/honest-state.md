# honest-state lens — weekly launch-catalog review, 2026-10-08

Head reviewed: `373c9af51`. Auditor run read-only. Every blocker, high and medium finding that is new or still open went to a separate verifier told to refute it; its verdict follows each finding. Low findings were not independently verified.

## Coverage, as the auditor reported it

Covered: the 2026-09-28 honest-state report (one open item, HS-0928-1) and the 2026-10-01 Reporting honest-state report (HONEST-STATE-1 to 16, using its README fix table). I checked each at HEAD by reading code and grepping. I then sampled the surfaces most changed since aff7eae16. These were ProjectHome.tsx (Submit/readiness panel), SubmissionSeqWorkspaces.tsx (precheck, transmit, Dispatch-tab transmittals) and the Insights/Report-OS render and orchestrator path. Both read as honest. Failures show as error states, 'not assessed' is stated separately from 'cleared', and the transmittal list says 'could not be read', not 'none sent'.

Not covered, and I did not run these: the CI checks (ci:internals-in-copy, check:microcopy) and hostilePayloadProbe. Not read line by line since 09-28: Vault.tsx, VaultAnnotations.tsx, Review.tsx and the Authoring review-send commits (9018545a1, 5407e3be9, 77d95ef2a). Not re-verified: HS1 (TemplateLibrary null-confidence), QMS HS-1 and H1 (device-vault), which were closed or out of scope on 09-28. Server routes for authoring.router.ts, project-vault.ts and submission-service were not re-swept.

I found no model-produced figures presented as engine output in what I read.

Status of items from earlier reviews, at HEAD:
- HS-0928-1: fixed. server/routes/coauthor.ts:106-111 now returns a real count(*) as `total`, plus `returned`.
- HONEST-STATE-1: the 25% floor is fixed (798bb6ef). The blocker-count and status half is still open (finding HS-1008-1).
- HONEST-STATE-2: the canvas and program-scope part is fixed (render.ts:65-68, 91-99). The project-scope variant is still open (HS-1008-2).
- HONEST-STATE-3 (prediction types), HONEST-STATE-4 (L189 program scope), HONEST-STATE-5 (refusal worded as outage), HONEST-STATE-6 (provenance claim), HONEST-STATE-8 (plan preview), HONEST-STATE-9 (access review) and HONEST-STATE-11 (retention, retention-legal-holds.ts:123-127): fixed, going by the 10-01 README. I confirmed 11 in code. The others rest on that README, not a re-read of each fix.
- HONEST-STATE-7, 10, 13, 14, 15, 16: still open and re-listed below. HONEST-STATE-12: partly changed (Insights.tsx:845 now reads 'readiness not computed' and 'N not computed'); I did not check whether the 100-program `truncated` flag is disclosed.

## Findings

### HS-1008-1 — Canvas opener shows a bare readiness percentage; the server's critical-blocker count and status are fetched and never shown

- **Status:** still-open-from-2026-09-28 · **Severity (auditor):** medium · **App:** Reporting & analytics · **Row:** D2
- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:423 (copy at :242; type fields at :146,167,181)`
- **What:** This is the half of HONEST-STATE-1 that 798bb6ef did not fix. The 25% floor is gone, but `criticalBlockerCount`, `riskLevel` and `status` are only copied into ProgramCtx (:242) and never rendered. For a registry type with no artifact matrix, the evaluator scores section completion only and raises a critical gap, ARTIFACT_REQUIREMENTS_NOT_MODELLED (readinessEvaluator.ts:121,149). A user reads 'BX-204 is 100% ready' while the same figure carries a critical gap and status 'missing'. Distinction 3.
- **Fix:** Show criticalBlockerCount and status beside the percentage, for example '100% of sections complete, 1 critical gap'. Carry the 'section completeness only' qualifier through to the opener when the artifact check was not assessed.
- **Verifier:** confirmed, severity medium. At HEAD 373c9af51, client/src/concept2cure/v2/surfaces/Insights.tsx:423 builds the opener as `${p.code} is ${p.readiness}% ready`. :882 shows the bare percentage too ('Submission readiness <b>{prog.readiness}%</b>'). A grep of the file finds criticalBlockerCount only at the type declarations (:146, :167, :181) and the copy at :242. riskLevel and the lead's status are declared but never read. Nothing renders any of them. On the server, readinessEvaluator.ts:121-140 sets the score to section completion alone when artifactsAssessed is false, and :142-156 pushes a critical gap, ARTIFACT_REQUIREMENTS_NOT_MODELLED or ARTIFACT_APPLICABILITY_NOT_ASSESSED, whose message says 'section completeness only'. orchestrator.ts:280-286 turns critical gaps into criticalBlockers. portfolio/fetch.ts toMemberInsight sets status to 'missing' when criticalBlockerCount > 0 and passes readinessScore through unchanged. insights-canvas-routes.ts:232-236 forwards all three fields. A project whose sections are complete but whose type has no artifact matrix therefore arrives as readiness 100, criticalBlockerCount >= 1, status 'missing', and the canvas reads 'X is 100% ready'. No guard on the client or server qualifies the figure. Medium is right: the figure misleads, but it is an orientation line, not a sealed record.

### HS-1008-2 — 'No gaps detected as of <ts>' is still printed for project-scope runs whose readiness check found gaps or did not check artifacts

- **Status:** still-open-from-2026-09-28 · **Severity (auditor):** medium · **App:** Reporting & analytics · **Row:** D2
- **Where:** `server/services/report-os/render/render.ts:65-68 and :91-99; server/services/report-os/orchestrator.ts:311`
- **What:** `gapsWereEvaluated` only tests `Array.isArray(regulatory.missingArtifacts)`. The orchestrator always sets that field. The evaluator returns `missing: []` when there is no artifact matrix (most registry ids) and never puts section gaps into it. Project-scope runs, reachable through AnA generate_report and POST /api/report-os/runs, therefore print 'No gaps detected' next to blockers listing the evaluator's own critical gaps. The report can be sealed with that sentence. Distinction 3.
- **Fix:** Gate the sentence on an explicit 'artifact check assessed' flag and the empty `readiness.gaps` list, not on the field being an array. Put all readiness gaps into the gaps section, including section gaps and not-assessed markers, with their real severity.
- **Verifier:** confirmed, severity medium. server/services/report-os/render/render.ts:65-68: gapsWereEvaluated returns Array.isArray(summary.regulatory.missingArtifacts). gapsSectionFor (:74-99) lists only missingArtifacts and otherwise prints 'No gaps detected as of <ts>' whenever that array exists. orchestrator.ts:311 always sets missingArtifacts to readiness.artifactReadiness.missing.slice(0,8) on the project/registry path. readinessEvaluator.ts:132 returns missing: [] whenever artifacts are not assessed, and readiness.gaps, which includes section gaps from identifyGaps plus the critical not-assessed gaps, never reaches the gaps section. The renderer pushes the blockers section, which holds the critical gap messages, at :238-243 and the gaps section after it at :247. The same report can therefore list 'Artifact requirements not assessed' as a blocker and then state 'No gaps detected'. This also happens when artifacts are assessed and all present but sections are incomplete. Nothing in render.ts consults blockers or readinessLevel before printing the sentence. render.test.ts:101 asserts the sentence for the empty-array case, so the tests pin the behaviour rather than guarding against it. I did not trace the finalize/seal path line by line, but no gate on this sentence exists in the renderer. Medium stands: the contradiction is visible in the same document, which limits the harm, but it can be sealed.

### HS-1008-3 — explain_blockers quotes an empty reason list as 'the gate's own reasons, verbatim'

- **Status:** still-open-from-2026-09-28 · **Severity (auditor):** low · **App:** Reporting & analytics · **Row:** D2
- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:570-572`
- **What:** A run stored 'partial' because of blockers has `truthfulness.reasons == []`, so the reply reads '"X" is held at partial because: . Those are the gate's own reasons, verbatim.' The reply names no cause and claims to quote the gate. The blockers section on screen still lists the real cause, which is why this is low.
- **Fix:** When `reasons` is empty, list the report's blockers or say the status comes from outstanding blockers. Use the 'gate's own reasons' wording only when `reasons.length > 0`.

### HS-1008-4 — A failed tier read answers 200 with 'standard', so the plan bar shows a plan the server could not read

- **Status:** still-open-from-2026-09-28 · **Severity (auditor):** low · **App:** Reporting & analytics · **Row:** D2
- **Where:** `server/services/report-os/entitlement-map.ts:95-100`
- **What:** `catch { tier = 'standard' }` is passed on unflagged. An enterprise customer whose capability lookup throws sees 'Plan: Standard' and locked tiles, with no hint the plan could not be read. Distinction 2.
- **Fix:** Return a `tierUnresolved` flag and render 'your plan could not be read'. Fail closed on entitlement, but say why.

### HS-1008-5 — ROChart invents series when the spec lacks them; compare view asserts a negative it never read

- **Status:** still-open-from-2026-09-28 · **Severity (auditor):** low · **App:** Reporting & analytics · **Row:** D2
- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:662,680,886`
- **What:** A missing series draws a fixed trend: `Number(s.anchor) || 60` at :662 and `[62, 66, 64, 70, 73]` at :680. The compare dashboard states 'No per-market assessment is in the governed record' without reading the record. The 10-01 review found that no server path emits chart blocks today, so it is latent.
- **Fix:** Render 'no data' when points, anchor or value are absent. Reword the compare note to 'per-market comparison is not available here yet'.

### HS-1008-6 — As-of compliance reports accept a future date and present today's state under it

- **Status:** still-open-from-2026-09-28 · **Severity (auditor):** low · **App:** Reporting & analytics · **Row:** D6
- **Where:** `server/services/audit/compliance-reports/period.ts:55-61`
- **What:** The as-of branch does no check against `now`. 'Access review as of 2027-01-01' returns current membership under a date that has not happened. The client's past-date note only fires for past dates.
- **Fix:** Refuse an as-of date later than today (UTC) with a 400, and mirror the check in the client's periodProblem.

### HS-1008-7 — Audit integrity attestation says 'every row carries a hash linked to its predecessor' for a pointer-only check that tolerates NULL previous_hash

- **Status:** still-open-from-2026-09-28 · **Severity (auditor):** low · **App:** Reporting & analytics · **Row:** D5
- **Where:** `server/services/audit/signedAuditExport.ts:311; server/services/audit/audit-trail-integrity.ts:93`
- **What:** Line 311 skips a NULL previous_hash after a hashed predecessor, and record_hash is never re-derived. The sentence is stronger than the check, and it is regulator-facing. Only a table owner who disables the append-only triggers can create the state, so this is low.
- **Fix:** Re-derive record_hash with the trigger's formula. Until then, word the detail as 'previous_hash pointers match; row content is not re-derived'.

### HS-1008-8 — Report-OS 'generated' time and seal are over a rendering stamped at each render, and no path verifies the seal

- **Status:** still-open-from-2026-09-28 · **Severity (auditor):** low · **App:** Reporting & analytics · **Row:** D5
- **Where:** `server/routes/report-os.ts (renderReport call near :1776); server/services/report-os/render/render.ts:52`
- **What:** Re-rendering a stored run yields a new generatedAt and so a different content hash. I did not re-check this at HEAD. The 10-01 README lists seal re-verification (GET /runs/:id/seal) as fixed, which may close the verification half. Confirm that the pinned generatedAt half is also closed before keeping this.
- **Fix:** Pin generatedAt to the run's recorded time before rendering and sealing. If seal re-verification is confirmed fixed, drop this finding.

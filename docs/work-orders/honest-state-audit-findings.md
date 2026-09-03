# Honest-state audit — 43 confirmed over-claims across 14 surfaces

> **Status 2026-09-02 — all 43 findings closed.** Re-triaged against the current
> code by quoted copy (line numbers below are historical): 39 were already fixed
> by earlier sessions (16 of those by removing the offending copy outright), and
> the last four were closed together in one change — Review.tsx ownership of
> "your sign-off step" (server now sends `mine` per board item), TaskBoard.tsx
> "Workload is balanced" over no open assigned work, and Labeling.tsx's coverage
> CTA and "0/0 approved" caption over an unsettled translations read. Each fix
> carries a revert-proven test. The write-up below is kept as the record of what
> was found, not as a to-do list.

**Method.** Every AnswerLead surface that did NOT import `assessmentState` (19 of 22) was
audited by a purpose-built `honest-state-auditor`, and every finding was then put through an
adversarial refutation pass instructed to default to *refuted* when uncertain. The 43 below
are the ones that survived it — each carries a concrete data state in which the string renders
and is untrue. 78 agents; nothing here is a pattern match on vocabulary.

**The class.** With three exceptions these are one defect: clearance, readiness or completeness
asserted over a state that was never assessed. That is BP-W0-3 generalised — it was fixed on the
three surfaces the UAT happened to open, and `assessmentState.ts` exists so the rule lives in one
place. These are the surfaces that never adopted it.

**Severity:** 29 high · 13 medium · 1 low

---

## Inconsistency.tsx

- **:292** `[high]` — AnA scanned your {progCode} -- no contradictions.
  - *Untrue when:* Board GET succeeds (no error, not loading) but findings.length is 0 because no contradiction scan has ever run for this project (fresh project, or content added since the last scan and 'Re-scan findings' never pressed). No field on the board (no lastScannedAt/assessmentRan) distinguishes 'scanned cl
- **:295** `[high]` — Every governed cross-reference AnA checks on a ' + filingLabel + ' dossier is consistent — nothing stands between this filing and a clean submission.
  - *Untrue when:* Same unassessed-project state as above: no cross-reference has actually been checked, yet the copy asserts every one was checked and found consistent.
- **:296** `[high]` — This is what submission-ready looks like. I'll keep watching as new content lands.
  - *Untrue when:* Same state: asserts submission-readiness and ongoing continuous monitoring over a project that has never been scanned; scanning is in fact only triggered by the user pressing 'Re-scan findings' or by specific authoring actions, not continuously.
- **:429** `[high]` — Submission gate — CLEAR
  - *Untrue when:* Same never-scanned state: a positive filing-risk clearance verdict is shown though no assessment produced the zero-findings result.
- **:430** `[high]` — No contradictions block promotion. ' + progCode + ' can enter the submission sequence.
  - *Untrue when:* Same state: tells the reader the program may proceed into the submission sequence, inferred from an absence never produced by a scan.
- **:476** `[high]` — No contradictions across this project's governed records / AnA found nothing that contradicts anything else. The itemized list of every cross-reference it verified isn't persisted yet, so only detecte
  - *Untrue when:* States as fact that 'AnA found nothing that contradicts anything else' — an assessment-outcome claim — in the identical never-scanned-project state as the other findings, rather than naming that nothing has been checked yet.
- **:461** `[medium]` — {checks.length > 0 ? checks.length + ' cross-references ' : ''}{I.dot} all consistent  (renders as \"• all consistent\")
  - *Untrue when:* Captions the panel 'all consistent' whenever findings.length===0, including the never-scanned-project state, though nothing has been verified.

## Etmf.tsx

- **:246** `[high]` — {tid}'s TMF holds every required {essential document|artifact} across all {N} DIA Reference-Model zones -- complete on a completeness basis.
  - *Untrue when:* The top-level branch selector `!completenessPath ? … : completeness.error ? … : !R ? … : <assessed block>` treats any truthy `completeness.data` (`R`) as current, live evidence for the trial named in `tid`. But `useLiveData` (client/src/concept2cure/v2/dataConnect.tsx:434) only sets `loading:true` o
- **:249** `[high]` — Every required document is filed — this is the clean completeness picture an inspector would see.
  - *Untrue when:* This is the AnswerLead `reassure` slot, the single most reassuring sentence on the surface, gated only on `R.ready` -- not on whether `R` was fetched for the trial currently named in `tid`. In the stale-carryover window described at line 246 (trial identifier just changed, new fetch not yet resolved
- **:251** `[high]` — Live from the trial's filed TMF artifacts.
  - *Untrue when:* This caption is the surface's own explicit liveness guarantee attached to every readiness verdict it shows. In the stale-carryover window (trial identifier edited after a prior successful load; new fetch for the new tid/scope still in flight), the data on screen is not live for 'the trial' currently
- **:247** `[medium]` — {tid}'s TMF is missing {R.summary.totalMissing} required document(s) across {incompleteZones} zone(s).
  - *Untrue when:* Same stale-carryover mechanism as the ready branch (see line 246 finding), applied to the not-ready case: the missing-document count, zone count and even the pluralization are all computed from the PREVIOUSLY named trial's `R`, but attributed by name to the newly typed `tid`. A user editing the tria

## HumanFactors.tsx

- **:204** `[high]` — Every critical task has a documented mitigation — residual use-related risk is acceptable and you're clear to run summative.
  - *Untrue when:* When an HFE/UE file exists (createHfFile can create one with present={} and no scenarios yet) but zero use scenarios have been recorded — the same state the component itself labels 'No use-related scenarios recorded yet' at line 225 — no critical task has been identified, let alone mitigated. hfAnal
- **:214** `[high]` — summative gate: clear
  - *Untrue when:* Same root cause as the headline finding: with zero recorded use scenarios the gate label reads 'clear' as if a use-related risk analysis had run and found the program safe to proceed, when in fact no analysis occurred at all.
- **:220** `[high]` — Residual use-related risk acceptable / All critical tasks are mitigated — summative usability testing may proceed.
  - *Untrue when:* Rendered with a shieldCheck / tone-ok treatment claiming testing may proceed, directly above the honest empty-state note at line 225 ('No use-related scenarios recorded yet — add one to start the use-related risk analysis'), producing an on-screen contradiction between two adjacent claims about the

## PrecedentEngine.tsx

- **:425** `[high]` — No cleared precedents matched this search yet — widen the criteria or ingest a precedent.
  - *Untrue when:* server/routes/precedent-engine-board.ts runs precedentEngine.search(...) under Promise.allSettled (line 301-309) and maps a REJECTED search to results: [] while still returning {success:true, data} (line 330). board.error is only set on a non-OK/thrown top-level fetch, so a search-service failure is
- **:476** `[high]` — No cleared precedents in the corpus matched this submission type and criteria. Widen the search, or ingest a precedent to seed the registry.
  - *Untrue when:* Same mechanism as the headline finding above (server-side search rejection is fail-closed to results: [] with success:true). This is a second, independently-worded assertion of the same unverified 'nothing matched' conclusion in the 'Closest precedents' panel.
- **:595** `[high]` — No scored risk factors for this submission context yet — nothing is inferred without a real signal.
  - *Untrue when:* precedent-engine-board.ts maps a REJECTED analyzeRisk() call to emptyRisk() = {overall:'unknown', score:0, factors:[]} (lines 169-171, 331), identical in shape to a genuine successful-but-empty result. The DTO already carries a distinguishing sentinel — overall:'unknown' only appears on the failure
- **:635** `[medium]` — Not enough supporting precedent data to assemble a rationale — run a search that returns precedents first.
  - *Untrue when:* Same emptyStrategy() fail-closed path as the line-631 finding: rationale: [] is produced identically whether recommendStrategy() genuinely had nothing to say or REJECTED server-side. The copy tells the user the fix is on their end ('run a search that returns precedents first'), attributing a server-

## ReportEngine.tsx

- **:138** `[high]` — Well-defined primary and secondary endpoints (under \"## Strengths\", IND Readiness document)
  - *Untrue when:* For a pasted protocol with no 'primary endpoint:' line, parseProtocol()'s own logic (line 215) pushes {description: 'Primary endpoint not clearly stated', severity: 'medium'} into risk_factors, which the Recommendations document and the AnswerLead headline (Finding at line 338) both surface as a rea
- **:140** `[high]` — Aligns with FDA guidance for Phase 2 trials in this indication (under \"## Regulatory Guidance\", IND Readiness document)
  - *Untrue when:* Rendered identically for a Phase 1, Phase 3, Phase 4, or phase-unspecified protocol, this sentence asserts a specific FDA phase-guidance alignment ('Phase 2') that has nothing to do with the phase of the protocol actually analyzed. It is a hardcoded literal, not a computed or extracted judgment, so
- **:283** `[high]` — Doc-bar label \"Evidence chain\" / \"Design risk\" / \"Regulatory precedent\" (docDef.label, rendered at line 383) paired with body content the user reads as that document (line 389), but which is act
  - *Untrue when:* The comment at lines 145-163 states the explicit purpose of genGovernedEvidenceReport: an evidence-chain report assembled client-side from a pasted protocol 'would carry no provenance and no audit id, yet would look identical on screen to one that did. That is the exact confusion this product cannot

## Review.tsx

- **:412** `[high]` — <b>{signSteps.length}</b> document{s} {is/are} at your <b>sign-off step</b> and {needs/need} your sign-off{dueToday ? — <b>{dueToday}</b> due today}.
  - *Untrue when:* useLiveData('/api/review/board') (line 202) is called with no scope param, and the server defaults scope to 'all' (server/routes/review-board-routes.ts:253), not 'mine', so queue/workflows include every in-flight review org-wide. signSteps (lines 387-391) only checks requiredActions.includes('sign')
- **:364** `[high]` — Approval delegated to <name>
  - *Untrue when:* doDelegate (lines 350-365) makes no network call at all -- it only calls setThread(...) (local React state) before fireToast. A real, mounted write path exists for exactly this action, POST /api/approval-workflows/:id/delegate (server/routes/approval-workflow.ts:181-210, calling approvalOrchestrator
- **:517** `[medium]` — Reason for delegation (recorded on the workflow)...
  - *Untrue when:* As in the line-364 finding, doDelegate never sends this field (or anything else) to the server -- it is only interpolated into the local thread entry (lines 356-363) and lost on reload. The placeholder's explicit persistence promise is false for every value a reviewer could type, and unlike the adja

## Risk.tsx

- **:365** `[high]` — All <b>{summary.total}</b> hazards are controlled to an acceptable residual risk. The benefit-risk conclusion can proceed.
  - *Untrue when:* This 'controlled/acceptable' determination is computed purely from a client-side severity×probability threshold (highResidual = product>=15) and a status flag (open/mitigating), never from the row's authoritative `acceptable` field. Concrete state: 1 hazard, status='verified' (so not counted as open
- **:416** `[high]` — Benefit-risk: favorable — {summary.accepted} of {summary.total} residual risks Acceptable; {summary.open} open evaluation(s) gate(s) the RMF conclusion (ISO 14971 section 8).
  - *Untrue when:* Reachable state: 1 hazard, status='open', severity=1/probability=1 (product well under 15, so highResidual=0) but open=1. The label reads 'Benefit-risk: favorable' in the same sentence that states '1 open evaluation gates the RMF conclusion' — 'favorable' (a positive readiness claim) and 'gates the
- **:366** `[medium]` — Average risk dropped from <b>{summary.avgInitial}</b> initial to <b>{summary.avgResidual}</b> residual across {summary.total} hazards; {summary.accepted} accepted.
  - *Untrue when:* mapRiskItems (line 102) sets `probR` to the same value as `prob` whenever a row's `residual_probability` is null/out of scale, and severity has no residual variant at all, so when no hazard in the file has yet had a residual probability recorded (i.e., no control-effectiveness assessment has occurre

## TaskBoard.tsx

- **:590** `[high]` — The critical path is clear — nothing open is blocking the milestone right now.
  - *Untrue when:* Fires identically whether the critical path was truly evaluated and found unblocked, or no task in the filtered `list` has ever been flagged criticalPath:true (the org-wide default on task create, TaskCreate's CreateForm initial state line 1202) — i.e. nothing has ever been assessed as being on any
- **:594** `[high]` — You are on track. I will flag the moment anything threatens the milestone.
  - *Untrue when:* Same root state as the headline finding: renders whenever nothing in `list` is critical-path-flagged and nothing is overdue, which is indistinguishable between an org that has genuinely assessed its critical path as clear and one that has never designated a critical-path task at all, or a filter (e.
- **:593** `[medium]` — Workload is balanced across the team.
  - *Untrue when:* Fires when `heaviest` is undefined, which happens whenever `list` is empty (e.g. a project/mine filter matching zero tasks) — there is no workload to have measured as balanced, only an absence of data. The rest of the file gates its per-column empty states correctly ('No tasks', line 695); this sent

## Biostatistics.tsx

- **:590** `[high]` — fireToast((docDef?.label || 'Document') + ' attached to dossier')  e.g. \"Sample Size Rationale attached to dossier\"
  - *Untrue when:* The toast asserts the document has already been attached to the submission dossier, but attach() has not attached anything -- it only calls ask('Attach the ... document to the submission dossier statistical section'), which dispatches an async natural-language request into the AnA chat channel (anaC
  - **RESOLVED** — the toast now follows `ask()` instead of preceding it, and reports a request rather than a result: "<Label> — attachment requested. AnA will confirm in the conversation; nothing is attached until it does." Button relabelled "Ask AnA to attach it to the dossier". Pinned by `client/src/concept2cure/v2/__tests__/biostatAttachHonesty.test.tsx`, verified failing against the original line (2 of 3 tests red), including an ordering test that proves a request which throws can no longer paint a success tick.
- **:667** `[medium]` — {live ? '/api/ana-biostats' : 'Deterministic engine'} -- v1.0.0 — draft  (rendered inside <span className=\"bs-doc-prov\">)
  - *Untrue when:* This implies the currently displayed draft document was produced by (or verified against) the live /api/ana-biostats backend service. In fact `md` is always generated by the in-browser BiostatDocs/BiostatEngine functions defined in this same file (a documented verbatim port of server/services/ana-bi
  - **RESOLVED** — now reads "Deterministic engine -- v1.0.0 — draft" unconditionally. `live` is `connected()`, a global API-reachability flag with no bearing on how the document was produced; `md` is always the in-browser port. This also printed an API route into customer UI (work-order guardrail 3). The same defect was found and fixed on the same CSS class in `ReportEngine.tsx:383` — there the live/local distinction is genuine, so only the route text was replaced ("Live analytics service"). `scripts/ci/check-internals-in-copy.mjs` was blind to both: it strips `{...}` before matching. It now scans literals inside call-free JSX expressions, verified failing on both original lines and on the reintroduction-behind-a-long-comment case that defeated the first version of the rule.

## CommunicationCenter.tsx

- **:368** `[high]` — No open agency communications need a response right now.
  - *Untrue when:* This is the fall-through branch of the AnswerLead headline ternary (lines 339-370): `!projectId ? … : liveComms.error ? … : critical.length ? … : responseDue.length ? … : <this string>`. There is no branch for `liveComms.loading`. `critical` and `responseDue` are derived from the local `comms` state

## EctdCoauthor.tsx

- **:426** `[high]` — eCTD readiness {readiness}% (renders \"eCTD readiness 0%\")
  - *Untrue when:* While `loading === true` (fetch in flight) or `error !== null` (GET /api/coauthor/documents failed, see the early return at line 228-231 which never calls setDocs), `docs` is still its initial `[]`, so `readiness` computes to 0 and is displayed as a measured fact next to the tree panel's own honest
- **:424** `[medium]` — Documents {total} (renders \"Documents 0\")
  - *Untrue when:* Rendered as \"Documents 0\" while the read is loading or has failed (docs never populated), asserting the organization has zero coauthor documents when the true count is simply unknown — the CLAUDE.md defect of a failed/pending read rendering as an empty result.
- **:425** `[medium]` — Approved {approvedCount} (renders \"Approved 0\")
  - *Untrue when:* Same mechanism as line 424: rendered as \"Approved 0\" during loading or a failed fetch, presenting an unread state as a confirmed zero-approved-documents fact.

## Labeling.tsx

- **:315** `[high]` — No translations are recorded for this label yet.
  - *Untrue when:* This is the surface's top-of-page 'answer-first' headline (AnswerLead), and it is computed purely from cov.total, which conflates three distinct states of the SAME translations read (transState from useLiveData at line 154): in-flight, failed, and genuinely-zero-rows. On the very first paint after t
- **:320** `[medium]` — Add the target-language IFU/label translations to start tracking back-translation QC and approval coverage.
  - *Untrue when:* This body copy is the AnswerLead's call-to-action, paired with the false headline above it. It instructs the reader to 'start tracking' translations as if none exist and none have ever been recorded, when the true state may be 'we haven't been able to read them yet' (in flight) or 'the read failed'
- **:424** `[medium]` — {cov.approved}/{cov.total} approved / {cov.btv} back-translation verified
  - *Untrue when:* This KPI caption sits directly above the honest, correctly-gated translations table (lines 428-457, which does distinguish loading/error/empty). The caption itself has no such gate: it derives straight from cov, so during a pending or failed read it prints '0/0 approved / 0 back-translation verified

## SubmissionCenter.tsx

- **:617** `[high]` — No submission selected
  - *Untrue when:* This branch (lines 617-623) never checks `subs.error`. `sub = list.find(...) ?? list[0]` where `list = subs.rows`, and per useLiveRows (v2/dataConnect.tsx L487-501) `rows` resolves to the same frozen empty array on a genuinely-empty result AND on a failed read of GET /api/submissions (network error,
- **:390** `[medium]` — Plan the submission
  - *Untrue when:* `seqs.rows.length` is falsy during seqs.loading, during seqs.error, and on a genuine zero-sequence result -- useLiveRows returns the same empty array in all three cases. This action label is a sibling of the `body` prop on the same AnswerLead (lines 361-394); `body` (372-386) correctly renders 'Load

## DesignControls.tsx

- **:226** `[medium]` — I'll draft the missing V&V protocols, link each to the input it covers, and flag any orphan output before the review — you sign off.
  - *Untrue when:* When trace.fullyTraced === trace.total the surface's own headline (line 224) already asserts 'Every design input traces cleanly to output -> verification -> validation. The DHF is audit-ready on traceability' — meaning no row lacks an output, verification, or validation. The reassure line directly b
- **:203** `[low]` — No design inputs defined yet
  - *Untrue when:* For that one render pass, the read has already succeeded and `live.rows` holds real design-input records, yet the surface renders the empty-state copy 'No design inputs defined yet ... Add your first with New design input above' as if nothing were on file. This is a transient (single-render) instanc


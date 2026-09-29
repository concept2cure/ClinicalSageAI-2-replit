# Triage group: new-protocol-build
Returned by the read-only re-check of 2026-09-28 (as returned; scratch paths redacted).

## PB-1 — NEW — high

### evidence

Five design engines run CPU work with no upper bound, synchronously on the event loop. Any authenticated user can reach them, a viewer included, through POST /api/study-design/<engine>. The routes are study-design.ts:437 with parseDesign (study-design.ts:104 has endpoints .min(1) and no max) under the 2 MB body limit (startup/middleware.ts:182). The same values reach GET /:studyId/<engine> (study-design.ts:577) and all 13 AnA review_* design tools once stored: planning-inputs.ts:33/41/64/92/97 have no .max(), and /persist has none either. Measured with tsx probes in scratchpad/triage/*-bench.ts:
- multiplicity-check.ts:133,137 (estimateFWER, 20000 sims x m, twice): m=3000 confirmatory endpoints (160 KB body) took 19.6 s.
- enrollment-projection.ts:145 into stats/enrollment-forecast.ts:127-146 (4000 sims x targetN x sites): N=20000 with 50 sites took 12 s. It is linear, so N=1e6 is about 10 min.
- mmrm-sizing.ts:178 into stats/mmrm-design.ts:173-190 (a k x k inversion for each k, O(T^4)): visits=200 (4 KB body) took 1.3 s, so T=800 is about 5 min.
- interim-oc.ts:217-218: about 70 ms per look, so K=10000 looks (about 100 KB) is about 12 min.
- dose-escalation.ts:157-186 (decision table x eliminationAt loop, O(N^2)): maxSampleSize=3000 took 0.75 s, so 1e5 is about 15 min.
On the AnA path, industryRead (AnaToolExecutor.ts:20853-20867) also holds a pooled connection inside an open transaction for the whole computation.

### proposedFix

Put the limits in the engines, so all three doors (POST, GET and AnA) are covered at once. Each limit is a stated gap with status 'partial' and nothing computed. It is never a silent clamp.
- checkMultiplicity: family.length > 20.
- projectEnrollment: plannedSampleSize > 100000, sites > 2000, or work (4000 x N x sites) > about 2e8.
- projectMmrmSizing (assumptionGaps): visits > 30.
- interim-oc (validSchedule / unschedulable): more than 10 looks.
- dose-escalation sizeGaps: maxSampleSize > 500, and dose levels > 30.
Mirror the same maxima as .max() in planning-inputs.ts so they are refused at write time. Add .max(200) to endpoints in the study-design.ts designSchema.

### risk

A real design above a limit gets a gap instead of a number. The limit has to be stated in the gap and in the tool description, and chosen above realistic designs (platform trials with many confirmatory endpoints). A silent clamp would turn this into fabrication. No board claim names these files; the lane has no section-0 row.

### failingTest

New server/services/study-design/__tests__/engine-input-limits.test.ts. For each engine, a design one past the limit returns status 'partial', a gap that names the limit, and null figures, in under 100 ms:
- checkMultiplicity with 21 primary endpoints;
- projectEnrollment with plannedSampleSize 100001;
- projectMmrmSizing with visits 31;
- interim-oc with 11 looks;
- dose-escalation with maxSampleSize 501.
Add a case to planning-inputs.test.ts: parsePlanningInput refuses mmrmAssumptions.visits 31 and 2001 sites.

### files

- `server/services/study-design/multiplicity-check.ts` — held: True — a8f1fddb 2026-09-28T15:35:34Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `server/services/study-design/enrollment-projection.ts` — held: True — 10206e13 2026-09-28T15:12:37Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `server/services/study-design/mmrm-sizing.ts` — held: True — 10206e13 2026-09-28T15:12:37Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `server/services/study-design/interim-oc.ts` — held: True — 7f82872d 2026-09-28T14:59:03Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `server/services/study-design/dose-escalation.ts` — held: True — 7f82872d 2026-09-28T14:59:03Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `server/services/study-design/planning-inputs.ts` — held: True — dd52716e 2026-09-28T17:00:04Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `server/routes/study-design.ts` — held: True — 5fcc6021 2026-09-28T17:02:28Z — session_01M8bGFSEfJx3f5WzKXJe4yR

## PB-2 — NEW — high

### evidence

The multiplicity check reports a recorded plan as controlled when it does not control the error.
- allocationOf (multiplicity-check.ts:97-106) checks each alphaAllocation entry is at most alpha, but never checks the sum for holm or hochberg.
- rate() (:133-138) simulates the UNWEIGHTED procedure at the total alpha, whatever the recorded weights.
- Probe (scratchpad/triage/mult-bench.ts): Holm at alpha 0.05 with allocation A 0.05 + B 0.05 (sum 0.10, which is unadjusted testing) returns status 'rendered', gaps [], procedure.controlled true, fwer 0.04985.
- With unequal weights, the verdict describes a procedure the design does not record. That contradicts the header's own promise, "never approximated by a different procedure" (:28-31).
- The verdict is computed under the global null only (weak control), so for holm, hochberg and fixed_sequence it cannot fail. Only the basis string says so, not the verdict.
- The client prints 'controlled at alpha' (ProtocolDevPlanningProjections.ts:187-191), and AnA reports it verbatim.

### proposedFix

In allocationOf, for holm and hochberg, raise a gap when the sum of allocations exceeds alpha + 1e-12. For fixed_sequence, raise a gap when an entry differs from the overall alpha.
When holm or hochberg carries unequal weights, either:
- simulate the weighted procedure through stats/multiplicity.ts graphicalReject, with weights alpha_i/alpha and a Holm transition matrix; or
- return procedure: null with a gap saying the weighted procedure is not simulated, and never substitute the unweighted one.
Rename the verdict to state its scope: controlled under the global null, independent p-values.

### risk

Existing fixtures that record per-endpoint allocations equal to alpha under holm would turn partial. Check a8f1fddb's tests.

### failingTest

Add to multiplicity-check.test.ts: Holm, alpha 0.05, allocation [{A,0.05},{B,0.05}]. Expect status 'partial', a gap matching /sum|exceed/, and procedure either null or controlled === false. It is 'rendered' today.

### files

- `server/services/study-design/multiplicity-check.ts` — held: True — a8f1fddb 2026-09-28T15:35:34Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `client/src/concept2cure/v2/surfaces/ProtocolDevPlanningProjections.ts` — held: True — 05286bf0 2026-09-28T16:03:23Z — session_01M8bGFSEfJx3f5WzKXJe4yR

## PB-3 — NEW — high

### evidence

The external-control engine claims the commensurate prior handles prior-data conflict, and its own mathematics shows it does not.
- elementsOf (external-control-plan.ts:77-86) marks 'Prior-data conflict handling' as stated for any commensurate plan, with the detail 'commensurate prior: borrowing attenuates when the concurrent and external controls disagree'.
- The plan records a FIXED tau2, and the engine's model (stats/external-control.ts:253-265, precH = 1/(seH^2 + tau2)) borrows the same amount whatever the disagreement.
- Probe (scratchpad/triage/ec-probe.ts): meanH 10 against meanC 10, 10.5 and 30 gives borrowedPrecisionFraction 0.4 in every case. The posterior is dragged from 30 to 22, and the projection is status 'rendered'.
- The AnA description and note (protocol-industry-tool-defs.ts:259-260; AnaToolExecutor.ts:20949-20951) single out only the fixed power prior as 'not a prior-data conflict plan'. That implies the commensurate prior is one.

### proposedFix

Set conflictAware only when the plan records a conflict mechanism. Add an optional ExternalControlPlan.conflictAssessment text to the type and to the planning-inputs schema. A fixed-tau2 commensurate prior with no conflict assessment is 'not stated', with the detail 'a fixed tau2 borrows the same amount whatever the disagreement'. Align the tool description and note.

### risk

Some sponsors describe a commensurate prior as conflict-robust. The wording needs a statistician's sign-off. Only the claim changes; no figure does.

### failingTest

Add to external-control-plan.test.ts: a commensurate plan with tau2 0.5 and every other element stated. Expect the 'Prior-data conflict handling' element to be stated false and the status 'partial'. Add an engine assertion that commensurateBorrow's borrowedPrecisionFraction does not change with meanC, which documents why.

### files

- `server/services/study-design/external-control-plan.ts` — held: True — ac54557f 2026-09-28T15:24:23Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `server/services/study-design/study-design-types.ts` — held: True — within 24h (5 commits) — session_01M8bGFSEfJx3f5WzKXJe4yR
- `server/services/ana/protocol-industry-tool-defs.ts` — held: True — 25cfc551 2026-09-28T17:18:50Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `server/services/ana/AnaToolExecutor.ts` — held: True — 25cfc551 2026-09-28T17:18:50Z — session_01M8bGFSEfJx3f5WzKXJe4yR (also held by 01KiDof7, 01KZK3jg, 019ZvHmh)

## PB-4 — NEW — medium

### evidence

The biospecimen profile reports wrong blood figures, with no gap, in three cases (probes in scratchpad/triage/bio-probe.ts):
(a) A pk, pd or biomarker activity with no specimen is left out of the totals, yet lowerBound only looks at activities typed 'blood' (biospecimen-profile.ts:173). So the totals are not flagged as lower bounds, and both reference points read false. The client then prints 'within' (ProtocolDevPlanningProjections.ts:229). Probe A: total 20 mL, refs [false,false], totalsAreLowerBounds false. This breaks the module's own rule that a missing figure is 'never within' (:31-33).
(b) A duplicated visit id counts one draw at both visits (:132-147). Probe B: one 30 mL draw gives total 60 mL, status 'rendered', and a note that it is 'above the 50 mL reference'.
(c) A duplicated activity id keeps the last volume (:133, the Map). Probe C: volumes 60 and 5 give total 5 mL, status 'rendered'.
The DCT profile had exactly this duplicate-id defect fixed in 96284ec4; this engine did not get the same fix.

### proposedFix

- Set lowerBound when any sampling activity with no specimen has a performed or conditional cell, and state that in a gap.
- Detect duplicated visit ids and activity ids. Report them as structural gaps, leave those rows out of the totals, and mark the totals as lower bounds.
- Frequency: count only performed draws, or report the conditional draws separately. Today cells.length (:145) counts conditional draws toward the twice-weekly reference.

### risk

Low. Some existing fixtures may have pk rows with no specimen next to blood rows; those turn into lower bounds.

### failingTest

Add the three probes to biospecimen-profile.test.ts:
- A: expect totalsAreLowerBounds true and exceededScheduled null for both references.
- B and C: expect status 'partial' and a gap naming the duplicated id.

### files

- `server/services/study-design/biospecimen-profile.ts` — held: True — 7a3d8e4d 2026-09-28T15:51:36Z — session_01M8bGFSEfJx3f5WzKXJe4yR

## PB-5 — NEW — medium

### evidence

Three engines are reachable only through AnA (or raw HTTP):
- the redline, GET /api/protocol-development/documents/:id/redline (protocol-development.ts:345-353);
- deviation trends, GET /api/protocol-deviations/deviations/trends (protocol-deviations.ts:~162-179);
- protocol-scoped SPIRIT with sections, GET /documents/:id/spirit (:337-343).
No client code calls any of them (grep client/src). The evidence README says 'All sixteen engines are in the Protocol Development surface's Projections of this design pane' (docs/evidence/PROTOCOL-INDUSTRY-GAPS/2026-09-28/README.md:34). That is false for two of them.
The pane's SPIRIT is the design-only route (ProtocolDevIndustryProjections.ts:242-246), so the screen shows every document row not_assessable. AnA's review_spirit_conformance (AnaToolExecutor.ts:20972-20986) judges those rows from the sections, so it can report them met or missing. That contradicts protocol-industry-service.ts:12-15 ('what AnA reports and what the screen shows come from the same read ... by construction').
No role gate is missing: these are reads, and a viewer may read. The defect is that a person cannot see what AnA narrates.

### proposedFix

- Add a protocol-scoped Redline view (a version picker, then /documents/:id/redline) and a Deviation trends view to the Protocol Development pane.
- Point the pane's SPIRIT at /api/protocol-development/documents/:id/spirit when a protocol is open.
- Correct the README and the service header.

### risk

The pane is keyed by studyId today. The protocol-scoped views need the protocol document id passed down from ProtocolDevDesign.tsx.

### failingTest

Add to protocolDevIndustryProjections.test.ts:
- the protocol pane offers Redline and Deviation trends;
- the SPIRIT fetch goes to /api/protocol-development/documents/<id>/spirit when a protocol id is present;
- a rendered SPIRIT row whose evidence comes from a section is not not_assessable.

### files

- `client/src/concept2cure/v2/surfaces/ProtocolDevIndustryProjections.ts` — held: True — 39d4b85a 2026-09-28T17:13:48Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `client/src/concept2cure/v2/surfaces/ProtocolDevProjections.tsx` — held: True — 7f82872d 2026-09-28T14:59:03Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `server/services/protocol-development/protocol-industry-service.ts` — held: True — 25cfc551 2026-09-28T17:18:50Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `docs/evidence/PROTOCOL-INDUSTRY-GAPS/2026-09-28/README.md` — held: True — 25cfc551 2026-09-28T17:18:50Z — session_01M8bGFSEfJx3f5WzKXJe4yR

## PB-6 — NEW — medium

### evidence

ProjectionsPanel.show (ProtocolDevProjections.tsx:281-290) has no request token.
- When a slow projection resolves after a later click, its payload is rendered under the later spec's normalizer and label. Interim OC takes 0.36 s at K=5; multiplicity and enrollment are also slow.
- The result is a false 'The engine returned no content and reported no gap. Nothing is claimed here.' (:255-257).
- 'Download (JSON)' (:292-298) then saves payload A as '<title>-<B>.json', a mislabelled export of a regulated projection.
The race has existed since e128a656 (2026-09-22, 01U2hGiy). 7f82872d grew the pane from 5 to 19 projections and added the slow engines.

### proposedFix

Keep a request sequence in a useRef. Store { specId, payload } and render or download only when payload.specId === open.id. Drop any response whose sequence is not the latest.

### risk

None beyond the file hold.

### failingTest

RTL test: mock apiRequest with two deferred promises. Click Interim OC, then Trial schema. Resolve trial-schema first, then interim-oc. Expect the Trial schema region to still show the trial-schema content, not 'returned no content', and the download name to match the payload.

### files

- `client/src/concept2cure/v2/surfaces/ProtocolDevProjections.tsx` — held: True — 7f82872d 2026-09-28T14:59:03Z — session_01M8bGFSEfJx3f5WzKXJe4yR

## PB-7 — NEW — high

### evidence

This is family-adjacent: it comes from dd52716e, the same lane's follow-on that records the inputs these engines read. The governed planning write keeps no before-image.
- recordPlanningInput (study-design-planning.ts:61-72) writes the payload { studyId, block, cleared } and nothing else.
- persistStudyDesignTx overwrites cdisc_prm_studies.metadata, and nothing keeps a design history.
- So a change to the MMRM sigma, delta or retention, the BOIN rules or the site accrual rates (the inputs behind the sample-size justification) leaves an audit row that cannot say what the value was or what it became.
This is the same class as P11-A-1 (high: 'overwrites and deletes keep no before-image'). /persist (study-design.ts:501-533) has the same gap, which predates this lane.

### proposedFix

In the same transaction, put before (the block's value in `current`, or the activity's location and specimen) and after (parsed.input.value) into the governed-action payload, which c2c_ana_actions.payload stores. Do the same for /persist (the prior metadata.design) in a follow-on.

### risk

The payload grows by one block. That is small once PB-1 bounds the arrays.

### failingTest

Route test (pglite): POST /:studyId/planning mmrmAssumptions {sigma:10,...}, then {sigma:8,...}. Expect the second c2c_ana_actions row's payload to hold before.sigma === 10 and after.sigma === 8.

### files

- `server/routes/study-design-planning.ts` — held: True — dd52716e 2026-09-28T17:00:04Z — session_01M8bGFSEfJx3f5WzKXJe4yR

## PB-8 — NEW — medium

### evidence

A finalized or signed protocol stays bound by reference to a design that is still writable, and nothing reports the drift.
- Every engine and AnA tool reports 'the design bound to protocol X' through readBoundDesign (protocol-industry-service.ts:80-109). It reads neither the protocol's status nor study_design_linked_at nor the design's updated_at.
- /planning (study-design-planning.ts:48-62) and /persist never check whether a finalized protocol binds the design. Only bind and unbind call assertEditable (protocol-development-service.ts:176-177, 205-206).
- After signature, an editor can change the SoA specimens, MMRM assumptions and so on, and the signed protocol's trial schema, blood volume and sizing change silently.
This is the same class as SEC-C-2 (a blocker, for the protocol's own SoA), reached through the design. It is partly pre-existing: the binding model predates this lane.

### proposedFix

Smallest honest step: have readBoundDesign select d.status and the design's updated_at, and return designChangedSinceFinalization when a finalized protocol's design was updated after finalization. The routes and tools report that flag.
Structural step (a founder or architecture decision): refuse /planning and /persist with 409 when a finalized protocol binds the design, or snapshot the design at finalization.

### risk

Refusing writes blocks an amendment workflow that edits the design before a new protocol version. A snapshot needs a schema change, which comes under Rule 1: additive, in C2C_MIGRATION_FILES.

### failingTest

Add to protocol-industry-service.pglite.integration.test.ts: finalize a protocol bound to a design, then update the design's metadata. Expect designEngineForProtocol to report designChangedSinceFinalization true, or /planning to answer 409.

### files

- `server/services/protocol-development/protocol-industry-service.ts` — held: True — 25cfc551 2026-09-28T17:18:50Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `server/routes/study-design-planning.ts` — held: True — dd52716e 2026-09-28T17:00:04Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `server/services/study-design/study-design-repository.ts` — held: False — 2564895a 2026-09-26T05:39:47Z — session_01KnUGoX3g4R4FWKWGc2sTbN

## PB-9 — OPEN — medium

### evidence

This is board item 11, handed to 01M8bGFS at 17:45. It is still red at HEAD: I ran vitest on server/services/ana/__tests__/ana-launch-scope.test.ts and 'classifies every enabled tool' fails with all 16 review_*, derive_ctq_factors and export_usdm_projection names unclassified.
anaCapabilityInLaunchScope (ana-launch-scope.ts:57-64) returns true for an unknown name, so the tools are offered in production by default. The Test job is red for every lane until this is fixed.

### proposedFix

Add the 16 names to tools.inScope in ana-launch-scope.inventory.json. They read protocol_documents, protocol_sections, protocol_deviations and cdisc_prm_studies, and protocol-dev is a launch surface (shared/constants/launch-scope.ts, Authoring). Note that derive_ctq_factors' description points at the RBM module, which is hidden.

### risk

None.

### failingTest

The existing ana-launch-scope.test.ts › 'classifies every enabled tool', red at HEAD.

### files

- `server/services/ana/ana-launch-scope.inventory.json` — held: False — 66056c26 2026-09-26T13:05:55Z — session_01E8btkB8mcLirW4rNvsMNxK (the classification is the adding lane's, per board item 11)

## PB-10 — NEW — low

### evidence

ctqView's note (ProtocolDevIndustryProjections.ts:106-108) says every likelihood and impact is 'a default seed from the category table'. Since 2b52ec8d the engine takes most rows from RBM catalogue rows and names the source in ratingFrom (ctq-derivation.ts:18-23, 120-130). The screen misstates the provenance and never prints ratingFrom.

### proposedFix

Print ratingFrom on each factor row and drop 'from the category table' from the note.

### risk

None.

### failingTest

protocolDevIndustryProjections.test.ts: a ctq payload with ratingFrom {kind:'catalogue', row:'Primary endpoint'} renders that source, and the note does not say 'category table'.

### files

- `client/src/concept2cure/v2/surfaces/ProtocolDevIndustryProjections.ts` — held: True — 39d4b85a 2026-09-28T17:13:48Z — session_01M8bGFSEfJx3f5WzKXJe4yR

## PB-11 — NEW — low

### evidence

Two statements are inaccurate:
- protocol-industry-tool-defs.ts:9-10 and AnaToolExecutor.ts:20841-20842 say 'Every engine is pure: no model, no clock, no RNG'. Enrollment and multiplicity use seeded Monte Carlo.
- interim-oc.ts:228 says futility is 'treated as binding' but not that this understates type I error relative to the non-binding computation regulators expect. The type I error figure is shown next to it without that caveat (ProtocolDevPlanningProjections.ts:109).

### proposedFix

Say 'no model, no clock; seeded RNG where stated'. Extend the binding-futility note: 'the type I error shown is under binding futility; a non-binding computation ignores the futility bounds and is higher or equal'.

### risk

None.

### failingTest

interim-oc.test.ts: a futility plan's notes match /non-binding/.

### files

- `server/services/ana/protocol-industry-tool-defs.ts` — held: True — 25cfc551 2026-09-28T17:18:50Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `server/services/study-design/interim-oc.ts` — held: True — 7f82872d 2026-09-28T14:59:03Z — session_01M8bGFSEfJx3f5WzKXJe4yR

## PB-12 — NEW — low

### evidence

This is a Rule 2 process point.
- The lane has no section-0 claim row on docs/work-orders/README.md; it appears only in the hand-on item 11.
- No D-row is named.
- The Rule 2 exception rests on a founder quote recorded only in the implementing session's own evidence (docs/evidence/PROTOCOL-INDUSTRY-GAPS/2026-09-28/README.md:4-8) and design doc (docs/design/PROTOCOL_INDUSTRY_GAPS.md:17-23). I cannot verify it from here.
The substance otherwise meets Rule 2:
- Everything sits inside the protocol-dev launch surface.
- All 16 handlers call protocol-industry-service, then the engine, and return JSON verbatim (AnaToolExecutor.ts:20878-21034).
- No tool asks the model for a figure.
- All are registered read-class (tool-authorization.register.json).
- Failed reads throw ProtocolDevError with a sentence, never an empty result.

### proposedFix

The owning lane should add a section-0 row naming the D-row (D4, protocol authoring) and point to where the founder's bypass is recorded, or the founder should record it in a founder decision register.

### risk

None.

### failingTest

n/a (process)

### files

- `docs/work-orders/README.md` — held: True — 44710934 2026-09-28T17:42:17Z — session_01TTTQ1hpdMr1yAMVYH4nYdE (edit only the lane's own row)

## PB-13 — NEW — low

### evidence

Several lists use React keys that can collide on exactly the cases 79088392 now reports:
- trialSchemaView keys epochs by 'epoch:'+id and arms by 'arm:'+name (ProtocolDevIndustryProjections.ts:46,53), which collide for shared epoch ids and blank or duplicate arm names;
- biospecimenView uses 'specimen:'+activityId (ProtocolDevPlanningProjections.ts:237);
- gap lists use <li key={g}> (ProtocolDevProjections.tsx:214,252).
The DCT view already added an index (:222-225). Rows can be dropped or mis-reconciled when two keys collide.

### proposedFix

Add the index to these keys.

### risk

None.

### failingTest

Render trialSchemaView for two epochs sharing an id. Expect two epoch rows and no duplicate-key console error.

### files

- `client/src/concept2cure/v2/surfaces/ProtocolDevIndustryProjections.ts` — held: True — 39d4b85a 2026-09-28T17:13:48Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `client/src/concept2cure/v2/surfaces/ProtocolDevPlanningProjections.ts` — held: True — 05286bf0 2026-09-28T16:03:23Z — session_01M8bGFSEfJx3f5WzKXJe4yR
- `client/src/concept2cure/v2/surfaces/ProtocolDevProjections.tsx` — held: True — 7f82872d 2026-09-28T14:59:03Z — session_01M8bGFSEfJx3f5WzKXJe4yR

## PB-F1 — FIXED — high

### evidence

The first cut's own security findings are fixed in 7f82872d, which I verified at HEAD:
- All 16 tools are in tool-authorization.register.json as class read, writes none.
- Service reads go through the caller's client with explicit organization_id and tenant_id filters (protocol-industry-service.ts:80-109, 174-193, 241-274).
- AnA reads run in a setTenantContextTx transaction (AnaToolExecutor.ts:20853-20867).
- The tool and authorization suites pass (4 files, 93 tests).

### proposedFix

None.

## PB-F2 — FIXED — high

### evidence

A viewer could persist or delete a study design. requireEditorAccess now gates POST /persist (study-design.ts:501), POST /:studyId/planning (:602) and DELETE /:studyId (:606). The read projections stay open to viewers.

### proposedFix

None.

## Notes

Scope: I read every listed commit with git show, then the code at HEAD 3c87da01, including the same lane's follow-ons: dd52716e (planning inputs, which adds the family's only write), 5fcc6021, 2651194f, 39d4b85a and 25cfc551. Every product file in the family was last changed by session_01M8bGFSEfJx3f5WzKXJe4yR inside the 24-hour window, so all of it is HELD and must be handed on, not edited.
- AnaToolExecutor.ts is also held by 01KiDof7, 01KZK3jg and 019ZvHmh.
- The stats/ engines (4cf0a8a6 by 015oLV2v; mmrm-design.ts e128a656 by 01U2hGiy) and study-design-repository.ts (01KnUGoX, 2026-09-26) are not held.

Rule 2:
- Every figure and verdict does come from a deterministic engine, and AnA returns it verbatim. No tool asks a model for a figure.
- The defects are in the engines' own verdicts: PB-2 (a plan reported as controlled when it is not), PB-3 (a false claim that conflict is handled) and PB-4 (blood totals reported as within limits when they are not known).

Writes: the eight listed commits are read-only. The one write in the family (/planning) is role-gated, requires a reason of at least 8 characters, sets tenant context, reads FOR UPDATE and records a governed action. What it lacks is a before-image (PB-7).

Failed reads are honest on the server: ProtocolDevError produces a sentence. The client has one dishonest path, the stale-response race (PB-6).

AnA-only reach: redline, deviation trends and SPIRIT with sections have no UI (PB-5). None needs a role gate, since they are reads.

Priority order for the owning lane:
1. PB-1 (one request can stall the Node process for every tenant; measured).
2. PB-9 (Test job red for every lane).
3. PB-2 and PB-3.
4. PB-7.
5. PB-4 and PB-6.

Probe and benchmark scripts are in <scratch>/triage/: mult-bench.ts, enr-bench.ts, mmrm-bench.ts, ioc-bench.ts, boin-bench.ts, bio-probe.ts, ec-probe.ts. Nothing in the repository was modified.

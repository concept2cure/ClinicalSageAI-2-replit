# Existing build assessment: IND delivery and Ana integration

Evaluated 2026-10-06 against `concept2cure-v2` commit
`ee1498ca9ff469e734931fd1d16aa06e6d4fde86`.

## Conclusion

The reviewed build already contains the major IND delivery primitives. The
highest-value improvement is to reconcile their handoffs and verdicts, not add
another assistant, drafting engine, document store, or IND wizard.

This is an IND-focused code and executable-test assessment. It is not a full
platform audit, browser usability evaluation, production deployment check,
provider qualification, or FDA acceptance test. No production code was changed
as part of this assessment. Historical design documents were treated as leads,
not evidence that their old findings remain open.

## Existing assets to retain

* Ana's submission context uses the current requirements and authoring tools;
  the retired IND generation loopback tools are no longer its recommended path.
* `draft_authoring_document` writes through the same project-scoped authoring
  service as `/api/authoring/docs/from-draft`, retaining provenance and refusing
  creation when provenance cannot be recorded.
* The editor has a saved-document-to-filing path, including point-in-time
  Co-Author snapshots, tenant checks, and explicit refusal of dirty content.
* IND lifecycle services cover forms, cover letters, amendments, safety
  reporting, annual reports, sequences, validation, and dispatch controls.
* The gateway already separates provider selection, placement, and model
  qualification. A local OpenAI-compatible client exists.
* Focused authoring handoff, filing UI, local tool, and tenant-scope tests pass.

These are substantial implemented assets. Passing isolated tests does not prove
that the entire client journey uses one consistent identity and verdict.

## Findings and enhancements

### P0 — The IND screen can overstate readiness

**Confirmed by execution.** `IndLifecycle.tsx` computes its displayed verdict
with `indlReadiness`, in `fixtures/ind-lifecycle-data.ts`. That function evaluates
only the supplied section list. `ind-checklist-view-assembler.ts` supplies only
placed Co-Author sections, rather than the complete applicable requirement set.
Missing, unplaced sections therefore never become blockers in this computation.

Reproduction with one approved section (`m3.2.S.1`) and the three completed forms:

| Evaluator | Ready | Required sections | Missing sections |
|---|---|---:|---:|
| Screen function | true; 100% | 1 | 0 |
| Existing server `evaluateIndReadiness` | false | 48 | 47 |

Both received the same section status and completed form identities. This is a
disagreement with the current product rules, not a conclusion that every IND
legally requires 48 independently authored documents. Applicability, parent
nodes, and product/phase tailoring remain part of requirements review.

The screen publishes `readyToFile` into Ana's surface context and displays
"ready to file", so the disagreement reaches both UI and assistant context.
It does not establish that actual dispatch bypasses its independent gates.

**Enhance existing path:** return the authoritative applicable requirements and
verdict from the checklist/readiness service; render that verdict in the screen
and Ana context. If retaining placed-document progress, label it as such.
Normalize section and form IDs at the boundary.

**Acceptance:** omitted mandatory sections remain blockers; screen, Ana, and
submission gate agree; incomplete evidence cannot produce 100% filing readiness;
not-applicable sections have recorded reasons rather than being silently omitted.

### P0 — Checklist program identity is not passed through

**Confirmed by source trace.** The screen's `checklistMatch` prefers `programId`,
and its response interface expects it. The assembler's SELECT and returned
object omit the submission's program link. The submission service already
supports `programId`; no new identity model is needed.

Consequently, the screen uses name/product matching and can fall back to another
IND with a warning. Renames or programs with similar names make this fragile.
Target dates also resolve by name rather than the existing program relationship.

**Enhance existing path:** carry the existing program ID through the response,
resolve target dates by that ID, and distinguish a genuinely unlinked legacy
submission from a submission belonging to another program. For governed actions,
an unmatched open program should not acquire another program's filing target.

**Acceptance:** two programs with identical product names remain distinct;
renaming a program does not break linkage; the open program selects only its
submission; legacy unresolved links are explicit.

### P1 — Section status rolls up across historical sequences

**Confirmed implementation behavior; current-version risk needs a regression.**
The checklist reads every nondeleted sequence for a submission and merges
section statuses using `put`, which keeps the most advanced status. It does not
read sequence order, leaf lifecycle operation, or replacement relationships.
An old approved copy can therefore outrank a newer draft for the same code in
this overview. This is not a finding about the separate dispatch validator.

**Enhance existing path:** define whether the checklist represents the selected
sequence or the effective dossier, then use the existing sequence/lifecycle
relationships to select current evidence before aggregating status.

**Acceptance:** a draft replacement is not displayed as approved merely because
an older sequence had an approved section; historical approvals remain visible
as history; withdrawn/replaced leaves are not counted as current content.

### P1 — Drafting and persistence remain separate operations

**Confirmed by source trace.** `batch_draft_sections` returns generated content
and per-item errors, but explicitly saves nothing. The submission context
recommends it for multiple sections. `draft_authoring_document` does persist
through the existing authoring service, but those are separate actions.

This explains how useful generated text can exist without a durable deliverable.
It does not prove the root cause of earlier ChatGPT streaming failures.

**Enhance existing path:** make generated-versus-saved state explicit in Ana's
results; use the existing governed promotion service for accepted sections and
return document IDs/links. Retain partial work and resume only failed items.
Preserve the distinction between saving a machine draft and human approval.

**Acceptance:** success for a saved document requires a durable ID; interrupted
work recovers saved sections; retries do not silently create duplicates; partial
batch failures preserve completed work with explicit status.

### P1 — Review submission can succeed while canonical projection skips

**Confirmed by source trace.** The authoring submit route first transitions its
working document, then invokes `bridgeAuthoringToCanonical` fail-soft. The bridge
needs a numeric legacy project ID, actor, and stated reason; the route reads the
project ID from `req.body.project_id`. It reports `canonical.bridged:false` when
the bridge skips or fails, while review submission still succeeds.

The newer draft path already uses a program UUID. This is a contract boundary
to reconcile; it is not a recommendation to replace all document stores. The
filing snapshot path is an intentional working-copy/submission-copy distinction
and should be retained.

**Enhance existing path:** resolve existing project/program relationships on the
server, inspect the actual caller contract, expose projection status, and use a
recoverable retry or explicit block wherever a downstream operation requires the
canonical record. Avoid invalidating an otherwise valid authoring review merely
to conceal the projection failure.

**Acceptance:** review state and downstream readiness do not silently diverge;
projection failure is visible and recoverable without a duplicate review run.

### P1 — Authoring acceptance journey currently fails after export

**Repeated twice**, in a combined run and an isolated run.
`tests/golden-journeys/ind-authoring.journey.test.ts` fails its
`diff-since-export-now-baselines-against-the-export` step: it expects zero changes
after export and receives one. The router compares citation `created_at` values
against the latest export timestamp. The cause is not established by this review;
investigate timestamp and citation semantics before changing code or assertions.

The journey itself declares that templates, checklists, exports, permissions,
and packager handoff are not fully covered. It does exercise some export behavior,
so that limitation should be made more precise after the failing step is fixed.

**Enhance existing proof:** resolve the failure, then extend the existing journey
through checklist, filing snapshot, readiness, and package validation. Separate
test transport receipts from actual agency acceptance.

**Acceptance:** unchanged content produces the correct baseline verdict; genuine
post-export citation changes are detected; one journey verifies the handoffs
that the current component tests do not cover.

### P1 — Local deployment is an existing lane, not yet qualified production drafting

**Confirmed by source trace and scoped tests.** `createLocalClient` accepts
`LOCAL_AI_BASE_URL`, falling back to `LITELLM_BASE_URL`. Local placement is declared
self-hosted. That declaration alone cannot prove that a configured proxy does
not forward requests outside the client environment.

The model registry contains `local-default`, with pending qualification and a
placeholder pin. `isNominalPin` explicitly excludes unpinned local weights in
production. Current OpenAI registry entries are also not approved for high-risk
regulatory drafting. Keep those controls.

**Enhance existing deployment:** pin actual local weights, qualify the tasks,
verify inference/OCR/embedding/tool endpoints and logs within the intended
boundary, and enforce/test network egress. Confirm proxy behavior and permitted
fallbacks rather than treating provider labels as deployment evidence.

**Acceptance:** a strict-local run makes no prohibited outbound request, including
on failures; the exact model artifact is recorded; quality meets task-specific
criteria or the workflow reports that the task needs human completion.

## Verification performed

* First scoped run: five files, **52 tests passed** (IND rule-pack agreement,
  checklist PGlite integration, submission context, program-scope UI, local gate).
* Second scoped run: four files, **39 tests passed, one failed** (authoring handoff,
  filing UI, local tool handling, and IND authoring journey).
* The failed journey was rerun alone and failed at the same assertion.
* Readiness disagreement was reproduced with direct calls to both current
  evaluator functions and correctly named input fields.
* PGlite tests exercise in-process SQL, not a deployed native PostgreSQL runtime
  or live provider/FDA connection. UI tests use mocked API responses.
* No full build, full suite, live browser review, external model calls, or actual
  submission was performed in this assessment.

## Recommended sequence: enhance, do not rebuild

1. Reconcile checklist identity and authoritative readiness (P0).
2. Make current-sequence status and saved-draft receipts consistent (P1).
3. Reconcile authoring review/canonical projection and repair the failing journey.
4. Prove the complete existing IND path, including a strict-local deployment.
5. Finish provider qualification and real sponsor submission acceptance using
   the existing gateway and publishing services.

Avoid adding modules while these boundaries disagree. The reviewed failure mode
is that implemented capabilities do not consistently share identity, current
state, and completion evidence.

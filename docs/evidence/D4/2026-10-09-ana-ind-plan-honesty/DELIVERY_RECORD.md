# AnA IND transcription-plan honesty — W3 / D4

Canonical branch: concept2cure-v2.
Initial base: 008223dca5b7f52d0b3c461dd2fc2bac083fb14b.
Release base: 7f3b84ca5e67f1bb920fc662ebf3289578a4ecb6 (report-health-only advance).
No UI changes.

## Delivered behavior

The backend plan_ind_module_authoring tool builds Module 2.5/2.7 transcription
scaffolds from supplied facts. It previously verified its constructed text
against strings derived from the same facts and let a caller-declared live
provenance flag produce honesty.sealable:true, including with no facts.
That self-consistency check neither reads study evidence nor verifies an authored
document. The result is now explicitly plan_text_only, with artifactVerified:false,
sourceVerified:false, and honesty.sealable:false for every supported plan.

Existing verification.ok is retained as a plan-text consistency result. The plan
payload, headers, figures, required_strings and missing-fact information remain
unchanged. Claimed provenance remains visible but cannot establish independent
qualification. Existing sample/not-assessed/missing-string blockers are retained,
with an additional planning-only blocker. The tool description and note separate
planning from artifact/evidence verification and describe only supported template
headers rather than claiming a complete mandatory IND hierarchy.

The production scope is this backend handler and its tool descriptions. Shared
builders and client code are unchanged. The existing authoring, review, approval
and filing paths remain the route for an actual governed deliverable. A string
check alone does not establish scientific correctness or regulatory readiness.

## Qualification

All qualification passed on the frozen production/test bytes:

- Focused registered-handler suite: 25 passed in 6.827 seconds.
- Natural fail-first, before production edits: 16 failed and 9 registration/input
  validation invariants passed, in 6.487 seconds. Complete and empty live plans
  for both supported modules returned sealable:true on the original code.
- Bounded AnA/IND/context regression selection: 647 passed across
  31 selected files, 0 failed or skipped, in 41.631 seconds.
- Production build passed in 18.453 seconds.
- Forced lint: 0 errors; unchanged executor 99 and definition 1 warnings;
  test 0 warnings. Normal pre-commit and git diff --check passed.
- Full unchanged pre-push gate passed in 61.874 seconds.
  TypeScript: 0 errors, tsc exit 0.

The first compiler-preparation attempt found five TS18046 errors in the new
test schema assertions. A precise test-only schema cast corrected them without
changing the assertions or production. Focused and broader tests were rerun on
the final pins; the failed preparation and earlier test reports are retained.

The native compiler helper prepared the incremental cache only. The unchanged
hook and actual tsc result establish qualification. Independent review approved
the exact source pins and boundaries; the production files are byte-identical
outside the planner handler/comment and its tool-definition block. Source hashes,
raw commands, results and the review are retained in this evidence directory.

Client tree remains f4a50c306387585250e354c68e08a099362e3823.
Publication uses a non-force expected-head update of concept2cure-v2. Remote CI
is separate from this local qualification and is reported at delivery.

## Boundaries and follow-up

This is a correction to the planner's reported claim, not a universal seal/export
enforcement change. The shared template still uses its original transcription
wording; the backend result explicitly limits its interpretation to self-consistency
against supplied strings. No underlying study source is independently checked by
this planner, and no authored file is created or verified by it.

A separate feature-gated seal-verified endpoint consumes verification.ok without
its scope. No direct IND-planner runtime bridge to it was found; independent
seal-route enforcement remains a separate follow-up. Other planning tools and
shared helper verdicts are not changed in this batch. The previously recorded
draft_section tenant-binding gap and full IND content/applicability/temporal
qualification plan also remain open.

Tests invoke the registered backend handler and its real deterministic builders.
No live model, deployed database or external file authoring is used. Publication
does not establish production deployment, regulator acceptance, full-repository
test success or universal IND coverage.

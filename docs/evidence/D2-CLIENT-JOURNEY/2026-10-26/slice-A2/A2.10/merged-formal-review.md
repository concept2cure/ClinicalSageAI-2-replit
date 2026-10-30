# A2.10 formal-validation convergence review

Source parents: local `37f2ed240`, incoming `c7f320403`. Launch row D2.
This is merge/change-impact review, not execution or approval of an OQ protocol.

## What already exists

Both continuations added the same URS-PROJ-007a requirement beside historical
URS-PROJ-007, revised OQ-PROJ-12, assessed the filing-reference change in RA/VMP/VSR,
and regenerated the existing TM-001 matrix. Incoming `tests/validation/oq/projects/
filing-reference.mjs` is the more complete existing browser/API procedure: it
observes retained query/hash, selected filing facts and their authored basis,
the exact recorded US IND/FDA Plan guide and explicit missing-identity state.
The local inline procedure also observes that browsing creates no project.
These belong in one helper and one requirement, not parallel protocol steps.

The canonical merged widget is the existing incoming
`client/src/concept2cure/v2/surfaces/FilingLifecycleReference.tsx`, with one
`Filing lifecycle reference` region and collapsed `Reference guide` details.
The functional owner confirmed those selectors and the authored/timing/return
labels remain. Shared exact-filing admissions require recorded type/agency;
no helper should infer a guide from tenant or generic programme type.

Incoming URS-004 corrects the historical URS-SUBC-009 citation to the reachable
ProjectDossier owner while retaining the distinct revised 009a requirement.
The matrix already has an explicit historical 2026-09-27 execution set; it
must not read current supplemental engineering checks as formal executions.

## Merge decisions

- Keep historical 007 and new 007a once each, with the older catalogue-render
  outcomes explicitly historical. Keep incoming historical 009 correction and
  all existing requirements.
- Keep OQ-001 v0.10 (the incoming header catches up with existing v0.8/v0.9
  history), the stronger helper, exact recorded Plan checks and explicit
  offer-failure deviation handling. Add the local browser no-write observer.
- Retain the local conservative medium/scripted assessment for 007a. Under
  VMP-001 §3.1, ad-hoc is a render-only observation; this revised step has
  predefined functional assertions for aliases, basis, identity and no writes.
  This neither establishes a regulatory verdict nor constitutes formal
  execution or reviewer acceptance.
- Keep both source-specific engineering evidence namespaces, with historical
  results attributed to the procedure/source that produced them. Regenerate
  TM-001 using the same historical execution date after resolving prose.

## Verification

Both runner/helper modules pass `node --check`. The existing traceability gate
resolves every citation across seven URS documents and confirms that each runner
step has its protocol's kind. Its 17-case self-test catches every planted
mutation; the matrix builder's positive/negative self-test also passes.

TM-001 regenerates with `VALIDATION_RUN_DATE=2026-09-27`: **117 requirements,
69 pass, 2 partial, 0 fail, 0 open and 46 uncovered**, with the same 103 historical
OQ steps. URS-PROJ-007a occurs once and remains uncovered, with no executed steps.
An independent requirement-id comparison preserves the union of both source
parents, with no duplicate or lost URS row; details are in
`merged-formal-proof.json`. Incoming historical 009 and distinct 009a remain.

The no-write observer surrounds only browser discovery and cancellation, and
always removes its listener. The helper's explicit public-API fixture creation
is a separate intended write needed for the exact recorded Plan observation.
It does not inject a failed offer or rewrite identity to manufacture a result.
One reference region and a collapsed guide are required in both UI locations.

Safe gate/self-test logs are archived alongside this note. `git diff --check`
passes for this scope. The revised OQ helper has **not been run** in a formal
execution, and no qualification signing or reviewer acceptance is claimed.

# CTD supplied-module QC scope

This bounded correction moves W1 / D2 and informs D7 on `concept2cure-v2`.
It repairs the existing `POST /api/authoring-pdf/ctd-readiness` report rather
than adding another dossier service, UI or schema. Production callers were
searched before implementation: the route is the aggregator's only production
caller; no client caller was found.

## The reproduced defect

A request containing only a clean Module 2 QC returned `ready: true` and a PDF
headed `READY — no blocking findings`. Module 1, 4 and 5 were absent; Module 3
was not represented. Four supplied verdicts could produce the same filing-style
claim. The endpoint has authentication at its mount and a regulatory-author
role guard, but it does not load a program, application, market, current content,
source version, approval or dispatch record. A role guard does not establish the
authority of verdicts in a request body.

The red evidence exercises the actual Express route, deterministic aggregator
and text extracted from the actual PDF. It records 13 failing regressions and
two passing authentication/role controls against the original implementation.

## The corrected contract

The historical endpoint and exported function names remain reachable. Both
JSON and PDF now report **supplied-module QC** with the fixed basis
`CALLER_SUPPLIED_UNVERIFIED`. The compatibility field `ready` is always false
because full dossier readiness is not established here.

| Field | Meaning |
| --- | --- |
| `suppliedQc.status` | `NO_BLOCKING_FINDINGS`, `BLOCKING_FINDINGS`, or `NOT_ASSESSED` within the supplied inputs only. |
| `scope` | Accepted supplied modules, modules claiming assessed inputs, omitted modules, unassessed modules and explicit limitations. |
| `modules` | All five CTD module rows, including unassessed Module 3. A module's `ready` is its supplied QC verdict only. |
| `modules[].checkedReferences` | Caller-declared checked forms (M1), summary section keys (M2), or study ids (M4/M5). `null` means that the supplied verdict omitted this scope. |
| `fullDossier.status` | Always `NOT_ASSESSED`. |
| `scientificApproval.status` | Always `NOT_ASSESSED`. |
| `dispatchReadiness.status` | Always `NOT_ASSESSED`. |
| `reportQualification.status` | Always `NOT_ESTABLISHED`; deterministic rendering is not production qualification evidence. |
| `feedForward` | Supplied-reference consistency checks, with the number of citations actually checked and a scoped status. Missing inputs or zero citations are `NOT_ASSESSED`. |

For example, a legitimate QC of only M2.3 retains `checkedReferences: ["2.3"]`
and can have `suppliedQc.status: "NO_BLOCKING_FINDINGS"`. It still has
`ready: false`, four omitted modules and `fullDossier.status: "NOT_ASSESSED"`.
The PDF says the assessed supplied inputs have no blocking QC findings; it
does not use an overall `READY` or `assembly-ready` label.

Module 3 has no supported QC input in this endpoint. A client-supplied `m3`
object, application/market/program identifiers, origin label, scope override or
qualification claim does not upgrade the accepted inputs or fixed report basis.
Those extra fields are not propagated into the report as authority.

## Validation and partial-program utility

Each supplied supported module must have a boolean QC verdict, findings array
and non-negative safe integer counts. Counts must match the actual supplied
error/warning findings; `ready: true` with errors or an explicitly absent
assessment is refused. Malformed module/reference objects and contradictory
counts return `400 CTD_QC_INPUT_INVALID`, including for PDF requests.

Genuine canonical QC conventions are retained. Empty M4/M5 results can be
`ready: false` with zero errors and `assessed: false`; the aggregator does not
manufacture a missing-study requirement. If checked references are supplied
but empty, that module does not count as assessed content, including canonical
empty M1/M2 QCs with custom empty expectations. Absence does not establish
either applicability or inapplicability at a program stage.

The report preserves actual module finding codes, messages and counts, rather
than replacing many original errors with one generic module error. It preserves
the existing nonclinical dotted-boundary check: a reference at or below the
cited section can answer it, while an ancestor or character-prefix match cannot.
Clinical citations retain exact study-id checks. These comparisons use the
supplied lists only; they do not prove that a report exists or is approved in
Vault. No late-stage CSR or phase-3 requirement is invented for an early IND.

JSON and PDF share the same aggregated result. The PDF labels assessed,
omitted and unassessed modules, exact supplied checked references, separate
qualification/approval/dispatch limits and the scoped findings. Successful
responses are private and are not cached. The existing role guard is retained.

## Verification and remaining authority boundary

Evidence is filed under
`docs/evidence/D2-PLATFORM-COMPLETION/2026-10-13/ctd-supplied-qc/`.
The focused suites include real canonical module QC outputs, partial/claimed
full requests, omitted M3, forged context/origin/qualification, empty inputs,
invalid and contradictory counts, exact subsection scope, feed-forward
matching, real role refusals, extracted JSON/PDF scope and deterministic bytes.

These HTTP tests mount the real router and role middleware with injected test
principals; they do not claim end-to-end JWT authentication, native database
conformance, production deployment, formal report qualification or scientific
approval. The production path performs no authoritative program/content read.

Whole-dossier applicability, current approved source versions, packaging and
accepted transport belong in the existing canonical dispatch/readiness path,
where authoritative stored sequence and artifact records can support each
separate finding. This request-body QC report must not substitute for that work.

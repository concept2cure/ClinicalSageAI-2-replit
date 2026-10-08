# AnA control lifecycle — bounded delivery

Workstream W3 / launch row D4. Canonical branch `concept2cure-v2` in
`concept2cure/ClinicalSageAI-2-replit`. Starting source:
`117313b90e933b8e96d162e3f855ca08899ec9fc`.

## Client-visible defects

| Existing behavior | Required repair |
| --- | --- |
| A steer confirmed by SSE before its HTTP acknowledgment is later added as waiting, although it already reached AnA. | Reconcile existing receipts and accepted requests across either event order, including duplicate text, refused requests and abandoned turns. |
| When opening the durable run row fails, dropping the response leaves the existing local-only cancellation signal live. | Abort that turn's in-flight work on disconnect; preserve normal completion and the durable disconnect record. |

This delivery repairs existing control behavior. It adds no surface, tool,
model, integration, production dependency or visual redesign. Run ownership,
tenant checks, model governance, approval gates and control API remain intact.

Steer matching mirrors the service's full trim, shared character cap, and
queue-drain trim; SSE messages already contain that canonical drained text.
Receipts apply only to matching requests already started when they arrived.
HTTP acceptance alone makes a request visible as waiting. Each turn owns its own ledger, which
is discarded on replacement or completion. The existing protocol has no shared
HTTP/SSE request ID: identical normalized text from another controller during
an in-flight matching request cannot establish exact request provenance.
The repair reconciles eligible aggregate counts and does not claim that identity.

A local-only disconnect, including one during run-row setup, aborts the
existing model/tool signal once and puts the connection-drop cause in the
real sealed turn record, with no invented
human control. An incoming request's ordinary body completion keeps its
response heartbeat alive. A normal completed response never aborts; a durable
disconnect retains the existing `client_disconnected` writer and audit boundary.

## Evidence

`client-steering/` and `server-disconnect/` record the failing regression before
each repair and the successful result afterward. Final backend qualification passed
**140 tests across seven files** on Node 22
(`server-disconnect/qualification-final.log`), including the new eight-case
HTTP lifecycle suite and existing memory-overlap, admission, hold, policy, real
PGlite control/audit and tenant-scope regressions. The new backend suite failed
three cases before repair. The model, database and other route seams are
scripted in the HTTP suite; the turn recorder and sealed record are real.
PGlite cases separately exercise the durable control store.

Client qualification passed **84 tests across eight files**, including 16
steering receipt cases. The initial 11-case suite failed seven cases before
repair. Both new test files have zero ESLint errors and warnings; production
warning counts and rules are unchanged. Final review found a character-cap
boundary: a cap ending on a space is trimmed again by the queue drain. Two new
cases failed before the key comparison repair and now pass in either event
order (`client-steering/boundary-red.*`). Two setup-race cases also failed before
the late-close check and now pass: a real response closes while run creation
is pending, followed by either a failed or successful run-row open. The
existing disconnect path accounts for that missed event after opening the turn
recorder, preserving its cause and the durable internal writer.

The final-source production build passed on Node 22 (`production-build.txt`),
retaining the existing bundle-size warning. Combined focused qualification is
**224 passing tests across 15 files**. Final independent review of the source
and 16 receipt cases found no further material blockers.

An initial source checkpoint (`90a0d28d9f30c8a5de1ea539203dc0ecc6568bc4`)
passed the production build and full unchanged publication hook, including
compiler zero errors. Those results preceded the review correction and are
not the final release verdict. The final source checkpoint
`eaa43f7e5de2c16ed5aa5c5eee4515e67e3f5afd` passed the fresh build and full
unchanged `.husky/pre-push` against the starting remote SHA: **PASS**, process
exit 0, completion banner observed, **TypeScript zero errors (tsc exit 0)**.
The complete hook took 56.782 seconds (`prepush-qualification.txt` and
`prepush-qualification.json`). No rule, suppression, script or baseline was
weakened. An incomplete compiler attempt cannot pass.

`source-files.json` pins the exact five production/regression blobs from that
checkpoint. The final evidence commit changes documentation only. Publication
uses the connected GitHub Git-data API, with each blob and the complete tree
verified against local Git and a non-force expected-SHA lease on the sole
canonical branch. The published commit and its per-commit remote workflow
status are verified after the branch update and reported separately; no remote
CI or production deployment success is inferred from local qualification.
Evidence transcripts trim trailing whitespace only; commands and verdicts are
preserved.

The prior publication's complete Semgrep and Tier 5 Browser Smoke workflows
passed, as did Repo Health Baseline Refresh. Its CI remains queued, and CodeQL
and Validate & Audit remain in progress at the recorded snapshot
(`prior-publication-ci.json`). Per-commit remote checks retain their own verdicts.
Publication is source delivery to the canonical branch.

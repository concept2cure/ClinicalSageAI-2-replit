# Authoring current-access UI continuation

W1 / D2 companion to the current Authoring read boundary, reconciled onto
`990a687c6eb31adb1becfa58d91fc9d2932f23ed` on `concept2cure-v2`.
This records local source and JSDOM qualification; it is not deployment,
native browser acceptance, model eligibility, project grounding, or full demo signoff.

The existing canvas and workbench retain remote creation recovery, exact created-section
callbacks, per-market filing outlines, and filed-document Vault navigation. Their
current read projections hide whole-source provenance and whole-document ceremonies
when only sections were admitted. The canonical authService session/account guard
owns deferred reads; ordinary bearer refresh does not replace that owner.

The conversation document list now owns its cache by session/account and original
scope URL. Known access refusals (401/403/404, typed access-changed or authority-unavailable
503) withdraw prior rows. Ordinary transient refresh failures still identify retained
rows as stale. Partial rows cannot inherit whole-source conversation or origin claims.
The existing conversation and project source filters remain unchanged.

Status-filter changes use the existing Save / Cancel / Leave decision before altering
the host list. Already-sent Vault/review writers retain their actual outcomes through a
same-context read refusal, with unavailable source metadata removed. A host refusal can
withdraw editor prose while keeping the request component mounted. Account/project
changes mask and retire the old dialog context; a subsequent context return cannot
restart that request. Filing, review and follow-on task/snapshot/leaf writers recheck
the captured canonical session owner before the next mutation. Server permissions,
approvals and signing policy remain authoritative.

## Proof

| Artifact | Actual result |
| --- | --- |
| `list-red.txt` | Before list repair: 6 failed, 1 passed, 22 name-filtered skips. Default Node 24.19.0. |
| `filter-red.txt` | Before filter repair: 2 failed, 17 name-filtered skips. Default Node 24.19.0. |
| `focused-initial.txt` | Intermediate Node 24 run: 65 passed / 2 failed. Both failures exposed old unscoped test-route fixtures; assertions were preserved. |
| `focused-node22.txt` | Six focused suites: 109 passed, no skips, Node 22.22.0; before the subsequent lint-only source reductions and filing owner extension. |
| `regression-interrupted.txt.gz` | Incomplete first broad run. Interrupted after repeated exact-URL mock misses in the two bridge suites; no broad passing claim. |
| `regression-first-bail.txt.gz` | First bail run: 20 passing files and one failing device-draft identity fixture (435 passed / 1 failed); other manifest files were not completed. |
| `fixture-and-session-node22.txt` | Two suites: 26 passed, no skips. Canonical synthetic identity 41 restores the original device-draft assertion; the filing regression proves a session change before snapshot writes produces no mutation. |
| `regression-node22.txt` | Final 49-file manifest run; see its terminal summary for the result. |

Final commands use Node 22.22.0 from the pinned local runtime, Vitest 4.1.7,
`vitest.config.ts`, one sequential fork and `NODE_OPTIONS=--max-old-space-size=4096`.
`regression-files.json` is the finite 49-file input manifest. Test logs retain
pre-existing React act warnings; they are not relabeled as clean browser evidence.

`production-files.json` lists the twelve owned production files. `lint-baseline.json`
is their exact baseline at the commit above; `lint-current.json` and
`lint-comparison.json` record scoped Node 22 ESLint without changed thresholds or
suppressions. The first comparison exposed six additional warnings; the retained
`*-before-reduction.json` files document that intermediate state. Current result:
zero errors, 17 warnings versus 18 baseline warnings. Removing an unused hook-disable
and using the existing browser global `window.queueMicrotask` retires two old warnings;
Canvas's 502-line warning remains visible in the comparison.

`source-pins.json` records SHA-256 for the owned source and test inputs. This is an
uncommitted integrated tree, not a released commit; parent release evidence owns
compiler/global gates, other dependencies, remote CI and runtime acceptance.

Finished proof logs larger than 90,000 bytes are stored as deterministic gzip
(`mtime=0`). `archives.json` records both archive and uncompressed SHA-256; decode
with `gzip -cd <artifact>.txt.gz`. No historical October 14 seals were changed.

## Limits

These checks exercise the actual UI components with mocked HTTP boundaries. They do
not qualify the remaining Authoring GET routes, native tenant/RLS admission, the server
snapshot writer, provider approval, complete grounded AnA authoring, populated CMC,
restart persistence, or normal-client live navigation. Those work-order gates remain
separate. No branch, stage, commit or push was performed by this UI delegate.

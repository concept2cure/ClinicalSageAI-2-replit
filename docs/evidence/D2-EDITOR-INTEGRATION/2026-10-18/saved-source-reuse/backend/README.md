# Saved assembly references: backend evidence

Base `e62320e0a`, canonical `concept2cure-v2`. The new read service and GET
registration reuse the current authoring router, current project and whole
document read scope, canonical audit verification and exact selected-source
resolver. They introduce no schema, dependency, editor, writer or provider.

`initial-red.log` preserves the missing-feature failure: a real signed-JWT
source-based, all-preserved assembly succeeded, but reopening its saved
references returned 404 because the GET endpoint did not yet exist. The test
expected an admitted 200 response with the exact saved manifest.

`saved-source-tests.log` records **27 / 27 passing actual HTTP/PGlite cases**.
They cover all-preserved reopen, admitted empty history, exact ordered mixed
Data Room/Vault manifests, an event beyond 501 general audit entries, canonical
bigint order beyond JavaScript's safe integer range despite backwards event
times, whole-document viewers of frozen documents, section-only and wrong
project refusals, private project loss, extraction corrections, eligible
retained text, subsequent withdrawal, damaged newest trail/payload/time/order,
orphan or duplicate evidence, damaged unchained reference markers, late new
events with and without prior history, a late source change, grant revocation
and unavailable history. Refusals return no record or source metadata. Successful
GETs return no source chunks, actor address or old build fingerprint and execute
no writes or transaction statements.

The ordering test temporarily sets the fixture clock to 2030 then 2028, remints
its signed tokens at those times, and restores the original clock/token. Both
times follow the fixture's grant admission. Opposite trail timestamps and the
large sequence are deliberate synthetic inputs. Privileged-damage tests disable
immutable triggers only on their isolated fixture, then restore them. Late
changes use explicit after-query seams; they are deterministic counterexamples,
not native PostgreSQL concurrency measurements.

`final-tests.log` records **89 / 89 passing cases across three files**: the
27 new saved-reference cases, 48 unchanged assembly cases and 14 unchanged
selected-source AnA cases. Exact completion is also in `summary.json`.
The AnA suite uses its existing deterministic model seam; no live provider was
called. `source-pins.json` captures 56 source/test files before and after this
combined replay. These hashes qualify the exact replay bytes, not any later
cross-owner edits. `lint-final.json` / `lint-summary.json` record three scoped
files with zero errors and zero warnings. All 56 before/after hashes match.
`log-storage.json` retains each complete original UTF-8 log, its original exit
status and raw/stored SHA256 values. Readable logs remove only surplus EOF blank
lines; their failure/success results are unchanged.

The reader reconciles both source trail and canonical chain candidates without
the general audit rail's history cap, orders positive chain sequences as
integers, and refuses ambiguous or missing ordering rather than returning an
older event. It verifies the selected trail against its direct JSON payload,
payload hash, exact envelope and one canonical chain link; when a seal key is
configured the canonical helper requires a valid seal. This is not a whole
tenant-chain verification or proof against a privileged database writer in an
environment without a seal key. The independent exact-query matrix and bounded
code review are retained separately in [backend-review](../backend-review/README.md).

Saved manifests remain historical reference intent. The response verifies their
exact original spans, hashes, current source admission and retained-text rules;
it does not echo an audit object as current authority. Repeated source,
whole-document/project and latest-event reads cover the explicit late-change
seams before release. These are bounded read checkpoints, not a serializable
cross-table snapshot or a promise that access cannot change after response.
Explicit reuse and subsequent preview/commit must revalidate again.

Compiler/build/security gates, root integration and publication receipts belong
to root's release evidence. This directory does not claim native PostgreSQL
scheduling, live-provider, human-testing or deployment verification. No Git,
baseline, compiler, build or ratchet action was performed by the backend owner.

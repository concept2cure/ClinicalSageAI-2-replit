# Saved-section draft template adapter qualification

## What already exists

`server/services/ana/saved-template-review.ts` is the existing authoritative
saved-reference validator. The existing authoring route owns generation, turn
records and candidates. The approved change extracts its existing prompt into
`authoring-draft-template.ts` and adapts that canonical validated reference
result; this unit packet exercises that adapter and prompt renderer.

The new test supplies `SavedTemplateReview` results with the declared type and
mocks only that existing boundary. It does not implement a second template
validator. Its SQL executor throws if the adapter adds an independent read.
These tests do not qualify SQL, access, assembly receipt validation, the actual
HTTP request, source retrieval, provider behavior or candidate persistence;
those remain with the root/HTTP evidence.

## Preparation

The test was prepared against the approved public contract before the new
export existed. Missing-export failures were deliberately not run or described
as RED. Meaningful pre-change failure belongs to the existing HTTP draft route.

The cases cover section-over-parent identity, recorded/manual/preparation
restrictions, historical/current-reference honesty, effective regional writing
controls, caller conflict, an exact 16 KiB full-block UTF-8 boundary, multibyte
Unicode, unmodified data and exact prompt/evidence inputs. The local runner
retains exact raw output and before/after source hashes. Results will be
recorded after the root declares production ready.

## Result

After the root declared production ready, the first executed unit run passed
all **24 cases**. Strict ESLint passed with zero errors and warnings. Both
receipts report no source drift. `source-freeze.json` records the actual helper,
fixture and canonical boundary/error-contract inputs; `green.json` and
`strict-lint.json` record commands, runtime, hashes and exact raw gzip logs.

Before that first run, preparation assertions were aligned with the agreed
public JSON projection: the effective source appears once at `templateSource`,
while references retain exact IDs, authority, verification/state, fields and
assembly receipt. A selected section's reference excludes the unrelated parent
ID and manual limits. This is preparation calibration, not a product RED/GREEN
transition or weaker source/authority checks.

The full-block ASCII boundary test finds the largest accepted exact reference
and checks 16,384 UTF-8 bytes, then requires refusal for one additional byte.
A separate multibyte case has fewer than 16,384 JavaScript characters but more
than 16,384 UTF-8 bytes and must refuse. Guidance, checklist and Unicode text
must arrive unchanged, without clipping.

Read-only inspection of the adapter's section-source selection, nullable program
forwarding and recorded/historical restrictions found no unresolved blocker in
this scoped contract. Actual validator/HTTP/turn/candidate evidence and broader
gates are owned by the root packet.

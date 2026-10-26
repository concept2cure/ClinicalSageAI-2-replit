# Tracked insertion command evidence

## What already exists

`editor/suggestions.ts` owns `proposeReplacement`, exact anchor resolution,
markdown placement, tracked attribution and application IDs, accept/reject and
selection preservation. `suggestionsPropose.test.tsx` already tests that real
TipTap/TrackChanges path for replacements and deletions. The focused
`suggestionsInsertions.test.tsx` uses the same real fixture pattern to qualify
the existing command's insertion operations, with the production citation node
and table schema. No alternate editor, parser or writer is supplied by tests.

The approved contract and full prior-capability search are in
[the design](../../../../design/EDITOR_ANA_AMENDMENTS_2026-10-26.md).
The production increment extracts the existing lookup and markability helpers
into `editor/proposalAnchor.ts` and shares operation validation from
`shared/authoring/remedies.ts`; final source freezes include both actual inputs.

## Initial failure

`red.json` and the exact raw `red.log.gz` record 53 cases: 20 failed and
33 passed against the existing production command, with no source drift.
Before/after requests struck their anchor as replacement, an empty section
could not receive an explicit insertion, and an unknown operation fell through
to replacement. Existing refusal/legacy cases already passed.

`source-freeze-red.json` pins that invocation's command, fixture and production
citation-node bytes. `red-test-source.tsx.gz` preserves the exact original test
source; its uncompressed SHA-256 was checked against the recorded fixture pin.

Before GREEN, fixture-only calibration constructs a literal live whitespace
text node instead of supplying HTML whose lone whitespace TipTap strips. Table
acceptance checks serialized HTML structure rather than table node-view wrappers.
The strict empty-operation case additionally rejects present empty prefix/suffix
keys as the design requires. The original RED and its fixture snapshot remain.

## Candidate verification

`green.json` retains the first candidate run: 52 passed, one fixture expectation
failed. That context-selection case proposed a leading space immediately after
the document's existing space. The established `fitEdges` rule removes that
duplicate space so saved/reloaded HTML remains reversible. The fixture now uses
direction-appropriate addition text and still asserts its exact inserted bytes;
`first-green-test-source.tsx.gz` retains its prior exact source.

`final-green.json` and raw `final-green.log.gz` record all 53 candidate cases passed,
with no source drift. `final-strict-lint.json` records strict ESLint with zero
errors or warnings, also with no source drift. The frozen test is under 500
lines. `source-freeze-final.json` pins the actual command, extracted anchor
helper, shared operation validator, fixture and production citation node.

The cases qualify inline before/after placement without deleting the anchor,
attribution/application IDs, exact live and reloaded accept/reject results,
paragraph/list/table placement, context disambiguation, absent/ambiguous/pending
or unsupported code/atom anchors, structural refusals, strict empty sections,
unchanged distant selection/focus/scroll, caret mapping, invalid operations and
legacy replacement behavior. No production assertions were weakened to obtain
the final result.

## Independent edge review and release result

After the root session's metric-only helper refactor and legacy blank-quote
refusal correction, `production-final-green.json` recorded the same 53 cases
passed, with no source drift.

Independent review then added list-item and table-cell boundary cases and
invalid-success cases. `edge-review-red.json` records 62 cases, with five actual
product failures and 57 passes, with no source drift. Heading/table insertion
before a list item's required first paragraph silently flattened the requested
structure instead of refusing. An entirely empty Markdown table returned success
without text carrying attribution/ownership, so it could not be rejected as an
ordinary tracked addition. `edge-review-red-test-source.tsx.gz` preserves that
exact 62-case fixture.

The root corrected the existing placement path to refuse structural fit failures
for versioned additions, reject each proposed block without attributed text and
refuse a transaction with no steps. Three further cases ensure an empty table
cannot hide alongside another, ordinarily attributed paragraph.

`release-green.json` and raw `release-green.log.gz` record **65 cases passed** on
the final production source, with no source drift. `release-strict-lint.json`
records zero lint errors or warnings for the final test. The authoritative
current source pins are in `source-freeze-release.json`; earlier freeze files
and receipts retain their historical inputs. The worker's final scoped review
found no unresolved blockers; broader editor/host/build/compiler checks belong
to the root packet.

Every run uses the local `run-check.py`, which pins sources before and after,
retains raw gzip output and records the command, runtime, exit code and summary.
The checks make no provider, database, agency or network calls. Browser, native
RLS, human review and deployment qualification are outside this command packet.

# Existing Workbench insertion-remedy qualification

W1 / D2, local/Codespaces. Contract:
`docs/design/EDITOR_ANA_AMENDMENTS_2026-10-26.md`.

## What already exists

`editor/__tests__/workbenchRemedies.test.tsx` already walks the actual
DocumentAuthoring → canonical conversation → shared remedy card → Workbench
bridge → RichSectionEditor flow. It checks replacement/deletion, saved base and
model refusals, scoped application lifecycle, rejection/reapplication and
unsaved navigation. This increment extends the same fixture with insertion
JSON and an explicitly empty saved section; it introduces no other host or
mocked editor command.

The existing `AuthoringRemedies`, shared parser, Workbench bridge,
RichSectionEditor and suggestions commands remain the exercised owners.
Synthetic HTTP replies isolate saved fixture data and an AnA turn record. All
actual editing, tracking and review commands run through the real editor.

## Pre-fix behavior

`RED.log.gz` records six insertion-capability failures and nine original passing
cases, exit 1. Every failure reaches a settled named proposed-fixes region but
finds no Apply card: the old shared parser rejects the insertion operation.
An explicit assertion names that missing capability. These failures are not
missing imports, fixture errors or timeouts. `RED-result.json` records exact
command/time/exit and unchanged pinned inputs; `red-inputs.json` retains source
and test hashes with compressed snapshots.

The first post-change epoch (`INITIAL-GREEN.log.gz`) passed thirteen cases and
failed two new card-copy assertions: the fixture expected the exact label
`Addition:`, while the valid cards said `Addition before anchor:` or `Addition
after anchor:`. Only that new assertion was corrected to the operation-specific
label. Its source/test snapshots and raw output remain in
`green-initial-inputs.json`; no original test was weakened.

`GREEN.log.gz` then records fifteen of fifteen cases passing. After root's
production-only metric/refusal-order adjustments, `SETTLED-GREEN.log.gz` again
records fifteen of fifteen passing. Both strict lint epochs exit 0 with no
warnings or errors; their empty compressed logs are intentional. Every phase
result records command, UTC time, exit and whether its pinned inputs remained
unchanged during that execution. Root owns qualification of any later source
bytes through its final combined run; this worker does not repeat that run.

The additions cover insert-before, insert-after and insert-empty application,
anchor preservation, turn attribution, application identity, rejection and
fresh application identity on guarded reapplication. Additional cases preserve
an unsaved note instead of inserting into a nonempty live section, and exercise
the same saved-base and qualified-model refusals. All cases exclude automatic
section saving. The original replacement tests remain intact.

The application lifecycle assertions verify nonempty application IDs on actual
AnA insertion marks, the original turn record, no anchor deletion, rejection
restoring the original section, and a different application ID on reapplication.
No fake bridge receipt or editing command is supplied by the test.

## Limits

These are automated local fixtures. They do not qualify a human session, live
model response, scientific completeness, native database concurrency, agency
delivery or deployment. No production edits, Git operations, compiler,
production build or repository-wide checks are performed by this worker.

`deferred-context-audit.md` retains a separate code-only CTD context collision
finding for the next contract. It is not implemented or qualified by the
insertion tests.

Input manifests retain exact source/test/configuration hashes, including the
new canonical `proposalAnchor.ts` extraction. `final-inputs.json` distinguishes
the worker's last qualified epoch from current bytes and any later root-owned
changes. Every gzip snapshot is checked against its phase hash;
`ARTIFACTS-SHA256.json` hashes all other packet artifacts.

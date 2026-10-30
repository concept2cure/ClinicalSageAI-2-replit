# Shared filing question

## What already exists

`shared/regulatory/filing-catalog.ts` derives the client-facing catalog from the
canonical registry. `v2/surfaces/FilingsCatalog.tsx` already asks AnA about a
selected filing and closes its detail afterward. A search for that exact
question and its evidence wording found only this inline implementation.
The parent A2.5 inventory records deleted-history searches and the current
project-workflow boundary. This completion moves the existing question into
the shared catalog; it does not alter catalog admission or lifecycle content.

## Verification

The real catalog button is exercised against a controlled shared-builder seam,
with a real catalog selection, to prove it delegates the question and still
closes the detail without navigation. A second check preserves the old wording
against the actual shared builder and actual selected display name. Both checks
failed first: the inline button never called the builder, and the real export
did not exist (`catalog-red.txt.gz`).

After extraction, the new test and the three existing shared catalog suites
pass **49/49** across four suites (`catalog-green.txt.gz`). The selected filing's
name is resolved from the real catalog, so punctuation and naming are preserved.
Affected source/test lint has no errors and five existing source warnings
(`catalog-lint.txt.gz`). The added helper and test introduce no warning.

## Independent context review

The existing context hook uses one slot keyed only by surface id. A parent
publishing null while a nested wizard publishes under `projects` would clear
the child's facts on some effect orders and background reads. This was flagged
before integration. The root implementation uses a wizard-to-parent reporting
callback and keeps Projects as the sole publisher; its integration tests own
mount, step, return and actor-change behavior.

Read-only review of the resulting code found no blocker: selected public filing
metadata and step changes are reported without private form values; account or
organization mismatch reports unavailable and retires the selection; a delayed
portfolio read cannot own the wizard's report. The picker reuses its matched
market response, validates rich fields before display, and refuses to inherit a
parent application's outline for an unclaimed filing. Optional question callbacks
do not create inert buttons. No source outside this agent's catalog files was
edited during review. Parent integration and browser evidence qualify the final
combined tree.

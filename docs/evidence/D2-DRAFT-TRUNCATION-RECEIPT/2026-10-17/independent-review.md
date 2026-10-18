# Independent batch termination boundary proof

This is a bounded D2 receipt correction within existing Authoring/AnA. It does not close D2, add an automatic-save security boundary, certify complete prose, or qualify scientific/regulatory conclusions.

## Baseline fail-first result

The actual registered `batch_draft_sections` handler, canonical receipt formatter and genuine source loader produced **14 intended failing assertions and six passing positive controls** on the unmodified application baseline `accf8c6bacfdc2d89b5de9098e22a67fe3f27914`. All 15 bound files were unchanged during the run. See `independent-baseline.txt` and `independent-baseline-bindings.json`.

The exact 20-case fixture is frozen with SHA-256 `713b95a28d7231651361d9527f50d5db36882564f8e96fa13c0733e3cfda7705`. Its bytes are preserved in `independent-baseline.fixture.ts.txt`. `independent-baseline-receipt.ts.txt` preserves the original canonical formatter, and `independent-baseline-handler.ts.txt` preserves the exact registered batch-handler source slice. The binding manifest records the whole executor module's hash, not merely that slice. Implementation owners were held until this proof and these snapshots were complete.

The failing cases cover all three canonical truncating reasons, contradictory false flags, absent flags, explicit true flags with unknown/absent reasons, missing termination metadata on successful/unconfirmed results, mixed original indices and source receipts, and explicit drafted-only save guidance. The six passing controls establish that complete prose remains usable and unsaved, unknown/unrecognized/absent reasons do not invent truncation, ordinary blank output refuses, and a source-unavailable slot leaves a successful ordinary sibling without disclosing private errors.

## Execution scope

The suite calls the registered handler through `getToolHandler`, retaining real request mapping, selection, receipt formatting, original-slot recovery and tool instruction assembly. Drafting responses are explicit synthetic data; the drafting service is mocked so no SDK/provider runs. Catalog/actor/program authority seams use the existing fixture pattern, while selected source contexts are minted by the actual loader with exact V2 digests/spans. Source expected hashes use Node's independent SHA-256 implementation. The successful source receipt must retain its identity and omit the source body.

The canonical Vitest setup mocks PostgreSQL process-wide. Its “Database connection successful” log describes that mocked pool, not a real connection or role/RLS proof. No live database, model, provider, agency, network or credential operation is performed. There is no generation, delivery or scientific-acceptance claim from these fixtures.

The runner uses supported Node 22 and binds the test, production formatter/executor, relevant source/finish-reason code, setup/config and contract before and after execution. `independent-lint.json` records zero errors and warnings for the `.ts` fixture and `.mjs` runner. The evidence `.mts` config has no lint-pass claim.

## Final qualification and review

**20/20 passed** on the lead's final lint-qualified freeze. All 15 before/after bindings matched and still match the current files. The exact fixture and runner bytes are unchanged from the meaningful baseline run; no assertions, cases, source mocks or expectations were adjusted to obtain green. `independent-final.txt`, `independent-final-bindings.json` and `independent-qualified-manifest.json` bind the results and reviewed production files.

An earlier integrated attempt also passed all 20 assertions, but the formatter changed during its run while a new complexity warning was resolved. The runner correctly exited nonzero for that changing source set. `independent-first-changing-source*` preserves that diagnostic; it is not final qualification. The fresh final run binds the completed `draftTermination` helper refactor.

Read-only review of the final two-file production diff found **no blocking defect within the approved contract**. The helper uses the one existing `isTruncated` classifier, combines it with literal `truncated === true`, and preserves the recorded finish reason or explicit null. Cut-off slots become failed `DRAFT_TRUNCATED` outcomes before blank-output handling, without copying their prose. Existing failure arithmetic derives the correct successful count and original retry indices. Successful nonempty slots retain normalized termination metadata and their existing exact source references/caveats without raw source text. The sole executor change is guidance to save only drafted slots, identify cut-off failures, and repair failed indices while retaining successful siblings and saved IDs.

The reviewed formatter SHA-256 is `981daafd2b37d93cd0a1a323a9de645d428e6d2903dff63cf103b83a24650401`; the executor SHA-256 is `4660a8a54ace84fc8f857c91a6317cfa2a5b518378fe692cffaffabfd9d9fc02`. Source authority, generation/service settlement, gateway routing, HTTP batch behavior and governed authoring writers are not changed by this diff. The omission protects this receipt handoff; it does not prevent arbitrary incomplete text being supplied through another authoring input. Unknown/absent reasons remain unconfirmed, rather than certified complete or invented as truncated. Cancellation propagation remains separate work.

Counts overlap the lead's combined cohort and are not additive. Whole-tree checks, canonical integration and direct publication remain the lead's responsibility; any later changed bound source requires renewed comparison and affected verification.

# CSR source consistency and Faux Biotech revision 2

Date: 2026-11-02. Plan: F1. Branch: concept2cure-v2.
Base: 0b89821bbf012af85d2d93cc25adcf41d4ff9c48.

## What already exists

- `shared/csr-source-input.ts`: strict native supporting-source schema and the
  cross-record checks used by Vault CSR ingestion and ADaM derivation. Extended,
  not replaced; no second ingestion contract, route or service was introduced.
- `shared/__tests__/csr-source-input.test.ts`: existing native Zod/Vitest suite.
  Preserved and extended with six revision/withdrawal cases. Not executed here.
- `server/services/csr/vault-source-input.ts`: parses this source using the schema;
  source approval, project ownership and saved hash remain its existing gates.
- `docs/demo/faux-biotech-csr/`: existing example dataset, aggregate TLFs, QC index,
  and runbooks. Corrected the index and current summaries; published the complete
  structured revision as a gzip file for source control, not an ingestion format.
- Original user-provided synthetic CSV/Markdown/JSON archive and structured source:
  retained unchanged in the downloadable revision package for comparison.

Source was inspected on the pinned GitHub branch, including caller searches and
coordination holds. Original shared schema/test bytes were checked against their
Git blob SHAs before editing. Full checkout/deleted-history inspection was not
available; no product file or capability was deleted. Scope was posted to #1389.

## Actual defects found

Three original synthetic participants (FBT201-A003, FBT201-A067, FBT201-P006) were
marked both AEWITH=Y and COMPLTRT=Y. The generated source copied that contradiction.
The earlier repository QC index also changed all 80 placebo IDs from the original
P-series to B-series. Prior checksum and aggregate checks missed these errors.

Revision 2 retains the original P-series identities and changes only those three
synthetic completion flags to N. Completion totals therefore change from 76/77 to
74/76, not because of a statistical reanalysis but an explicit scenario repair.
Randomized N, response counts and AE/SAE/withdrawal counts remain unchanged.
The corrected CSR example and TLFs in the handoff use these same values. Proposed
workflow tasks are labelled not executed; no sample CSV is evidence of a review.

## Existing validator repair

`validateAeDiscontinuationBasis` now checks that a participant declared to have
withdrawn from treatment for an AE is not simultaneously a treatment completer.
It handles either the existing event-level or subject-level flag, only when
`dispositionBasis` explicitly says `end-of-treatment`. It does NOT reinterpret
end-of-study or unspecified disposition: treatment can stop while follow-up
continues. A previously accepted contradictory end-of-treatment source is now
refused before tables are saved. Schema fields and other validation remain intact.

No models, credentials, authorization rules, signatures, stored patient records,
application UI, API mounts, database tables or runtime dependencies changed.

## Executed verification, exactly

`node --test tests/ops/csr-demo-source-consistency.test.mjs`

| Actual cross-record refinement tests | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Original production source | 17 | 4 | 0 |
| Repaired production source | 21 | 0 | 0 |

The test runner uses the installed TypeScript parser to extract the actual
`validate*` functions and `CsrSourceEnvelopeSchema.superRefine` callback from the
source file, transpiles those nodes and executes them with an issue collector.
It does not copy their rules into test helpers. The full revision fixture and
intentional corruptions exercise identity, arm, completion, source linkage,
protocol/endpoint, withdrawal basis and preserved missing-domain semantics.
The index test compares every one of the 160 subject IDs and flags to the source.

**This is not a native Zod parse.** Zod field/type parsing, native Vitest/PGlite,
full TypeScript/build/lint/pre-push hooks and browser/application acceptance were
not executed. The native schema regression cases are supplied for that environment.
Two changed TS files have zero syntax diagnostics only. Node v22.16.0;
TypeScript 5.8.3. No dependency stubs are substituted for a claimed full build.
The working executor cannot clone/install the complete dependency environment.

Raw red/green logs, syntax output, original and revised source snapshots and data
provenance are retained in the downloadable evidence package. `verification.json`
records exact byte hashes. An AST check cannot establish complete input acceptance
or hosted UI behavior, and the source fixture is not marked clinically verified.

## Hosted status, not a qualification claim

The connected browser was attempted and unavailable. No live Faux Biotech tenant,
workspace, project, Vault record, frozen study table, build, signature or filing
was created here. The authenticated app smoke for the parent (run 41515668415,
job 125518488001) was queued when checked, not passed. The earlier template,
placeholder-review and task-navigation fixes still need their native/runtime
regressions and hosted customer journey. This source repair does not close them.

Use the uncompressed revision-2 JSON in the delivered archive for the existing
Vault path, after native schema validation. Do not use the historical original
completion table or B-series QC identities with the revised source. Source approval
must occur through the real application; no authority is embedded in the data.

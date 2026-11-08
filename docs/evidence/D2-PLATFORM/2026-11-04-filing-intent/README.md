# One platform: preserve selected filing and compatible regional candidates

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Baseline: `0fc881c16fa344573ae55f5e882b1ca1c9d3631a`  
Plan: F1; completes the existing `server/services/regulatory/submission-resolver.ts`.

## Direction and boundaries

One project context, data room/catalog, AnA, editor and Submission Center.
A different product, document, region or client license does not create a
parallel application. This is a repair to the existing plan resolver, not a
new regulator catalog, equivalence engine, UI, transport or license policy.
No source records, commercial entitlements, approvals or project settings
are changed. All existing authorization and release gates remain in place.

## What already exists

| Existing owner | Responsibility and limitation |
|---|---|
| `shared/regulatory/global-document-registry.ts` | Registry entries: identity, family, product applicability, stage, format, section/task blueprints and validation profile. The repair does not add or revise regulatory facts. |
| `shared/regulatory/submission-type-bridge.ts` | Canonical IDs, legacy types and curated alias resolution. Unknown input returns no entry; this is not fuzzy search. |
| `server/services/regulatory/submission-resolver.ts` | Shared regional plan and coverage matrix. Previously discarded an explicit anchor in its own region and fell back to incompatible products. |
| `server/services/regulatory/registry/submittabilityCoverage.ts` | Existing filing-specific channel decisions; not replaced or expanded. |
| `server/services/regulatory/market-support.ts` | Existing Module 1 shape and adapter-refusal statements. These do not prove every format at that agency has a builder. |
| `server/routes/biopharma/submissions.ts` | Existing read-only plan/coverage routes. No new API mount or request convention. |
| `tests/services/regulatory/submission-resolver.test.ts` | Prior resolver regression suite; remains unchanged and still requires native execution. |

Read root AGENTS.md, CLAUDE.md and ONE_DESIGN_PLAN.md. F1 is the existing
repair package. Searched resolver/bridge callers and tests and inspected
recent path-specific commits through the GitHub connector. Full deleted Git
history was not inspected: local GitHub DNS is unavailable. The baseline
source was retrieved using the connected GitHub tool and verified against
Git blob `d1391ea4c8fd42a82b9f6e5f6d03024efc013b94` before execution.

## Confirmed defects

1. Resolving an explicit filing read its family and product, then threw away
   its identity and picked the first matching entry even in its own region.
   The source catalog includes, for example, US_510K before US_DE_NOVO,
   US_NDA before US_505B2, and AU_CTN before AU_CTA. These are distinct entries,
   not interchangeable names; their own selected blueprints must be retained.
2. The regional selector returned the first family candidate when neither the
   product class nor a declared `any` product matched. Unsupported combinations
   could therefore acquire an unrelated filing and support statements.
3. Unknown filing text could be resolved by the first fuzzy search hit, or
   collapse to a default marketing family. A discovery search is not authority
   to select a filing the project did not specify.
4. Region-only Module 1 readiness could make a non-eCTD filing appear to have
   an eCTD build and Module 1 path. A working FDA eCTD builder does not establish
   an eSTAR, regional or format-less document builder.
5. Returned plan/matrix arrays could alias caller arrays or shared defaults.
   Mutating them could change the meaning of a prior result or a later request.
   Empty matrix cells also satisfied `every`, yielding a false fully-covered row.

These are code-level findings and reproducible controlled-test failures. They
are not evidence of a customer misfiling or of any agency rejecting a package.

## Repair inside the existing resolver

- Reuse the canonical submission-type bridge. Do not maintain another alias
  list or select a fuzzy discovery hit.
- Preserve an explicitly selected active filing in its own region, including
  its dossier standard, section/task blueprint and validation profile.
- Report unknown/inactive selections and explicit product conflicts as partial
  plans with no replacement filing or implied gateway. Use existing gaps/notes
  fields, not another API or UI contract.
- Other regions may select an active family/product candidate of the same
  recorded lifecycle stage. No incompatible-product fallback; no amendment to
  initial-application substitution. Family-level discovery retains registry
  ordering among compatible entries and declared `any` product rows.
- These cross-region candidates are NOT a claim of legal equivalence. The
  registry still needs expert curation, and specialized regulatory judgments
  are outside this selection repair.
- eCTD Module 1 support is not inherited by other dossier standards. Those
  plans retain their recorded format and channel statement, but this resolver
  does not advertise an eCTD build or backbone for them. This does not disable
  independent specialized builders elsewhere in the existing platform.
- Detach returned region/family/product arrays and methodology. An empty matrix
  request cannot report a fully-covered row.

Default comparison regions and all existing market/gateway boundaries are
unchanged. Canada and Australia can retain their explicit catalog selections;
this repair does not claim new regional packaging, dispatch or acceptance.
China's existing catalog and pathways are not extended. License and account
controls from preceding shared-platform repairs are untouched.

## Executed before/after results

Node 22.16.0, TypeScript 5.8.3. The same committed 44-case test suite executes
actual resolver code; registry rows, alias lookup, module-shape and channel
collaborators are explicit controlled substitutes. No provider, HTTP, database,
browser, actual regulatory rules or gateway is exercised as qualified.

| Implementation | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Original Git-blob-verified resolver | 6 | 38 | 0 |
| Repaired resolver | 44 | 0 | 0 |

Cases cover distinct selected filings in all five named regions, canonical
alias use, unknown/inactive selections, conflicting product settings,
compatible versus incompatible candidates, lifecycle stage, format-specific
build honesty, retained portal/refused channel decisions, input/result
mutation and empty coverage. Synthetic JP/CA selection labels in this suite
are deliberately not claims about the real catalog.

Three TypeScript files transpile with no syntax diagnostics. This is not a
whole-repository semantic type check. `execution.json` records each case's
outcome, source/test/runner identities, and raw-run SHA-256 values.

The companion `submission-resolver-registry.test.ts` adds 12 native cases
against the REAL catalog/bridge, including named US, EU, Japan, Canada and
Australia selections. Those cases and the prior resolver suite have NOT run
here: application/Vitest dependencies are absent and npm DNS is unavailable.

## Reproduce

```sh
node --test docs/evidence/D2-PLATFORM/2026-11-04-filing-intent/offline-runner.cjs
C2C_RESOLVER_BASELINE=1 node --test docs/evidence/D2-PLATFORM/2026-11-04-filing-intent/offline-runner.cjs
```

The baseline intentionally fails 38 cases. It requires the baseline commit;
this session supplied its hash-verified file with C2C_RESOLVER_BASELINE_FILE.
The adapter uses the repository's existing TypeScript dependency. No new
production or development package is added.

Pending native validation:

```sh
npx vitest run tests/services/regulatory/submission-resolver-intent.test.ts tests/services/regulatory/submission-resolver-registry.test.ts tests/services/regulatory/submission-resolver.test.ts server/services/regulatory/__tests__/market-support.test.ts
NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .
npm run ci:one-design-plan
```

Also verify real project-setting handoff through AnA and the planner, license
and tenant enforcement, each regional offer, and document-to-submission
browser acceptance. Queued GitHub jobs are not passes. Direct GitHub publication
does not execute the local pre-push hook. No hosted deployment or customer
record is modified or qualified by this commit.

## Rollback

Revert this single repair commit under ordinary change control; no schema
migration or backfill. Reverting restores the demonstrated silent-substitution
and shared-result mutation behavior.

# Shared workspace: apply regional filing details only to their document context

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Baseline: `354e91931ba4ce96edfeb0bf14aaa45de605453e`  
Plan: F1; completes `server/services/regulatory/workspace-config-enrichment.ts`.

## What already exists

- `shared/regulatory/workspace-config.ts`: the existing common workspace projection, including known/unknown selection, document/dossier scope, selected format, filing identity, editor requirements, client and region context. Unchanged.
- `shared/regulatory/global-document-registry.ts`: canonical application family, active state and lifecycle stage. Reused through `getApplicationType`; no new registry or regulatory entries.
- `shared/regulatory/region-identity.ts`: canonical Module 1 backbone path and region conversions. Reused rather than synthesizing another path mapping.
- `server/services/global-ri/regional-module1-requirements.ts`: explicitly an INITIAL MARKETING application checklist. Its FDA rows include `us_356h`; it is not an IND, device, diagnostic, protocol or SOP checklist. Unchanged.
- `server/services/ectd/ectd-regional-rules.ts`: recorded electronic size limits; unchanged. A recorded size or backbone path is not an available/qualified channel.
- `server/services/regulatory/workspace-config-enrichment.ts`: the existing shared enrichment. Before this repair it attached the marketing checklist, an electronic path, electronic size and marketing-language statements whenever any region overlay existed.
- `server/routes/workspace-config.routes.ts`: the existing caller; no new HTTP route or UI was added. Live UI/AnA reach is not established by this slice.
- `tests/regulatory/workspace-isolation-harness.cjs`: established complete-module behavioral harness, extended only with the new canonical lookup/path collaborators and representative lifecycle/scope fixture data.

Repository instructions and the unchanged one-design-plan ledger were reviewed. F1 is open. Connected searches covered enrichment, region identities, source checklist scope, catalog metadata, neighboring tests and callers. DNS prevented a repository clone/deleted-history audit; this is not represented as successful git-history verification. Source bytes for the complete enrichment and common resolver were verified against their Git blob identities before testing.

## Defect and scoped repair

Selecting a region previously added medicines-marketing requirements even when the chosen workspace was an IND, an eSTAR device/IVD, a regional filing, an SOP, a standalone clinical document or an unknown document. The source checklist explicitly does not have that universal scope.

The existing enrichment now:

1. Restricts electronic Module 1 path and recorded electronic size hints to known eCTD **dossier** selections. Plain CTD does not acquire electronic XML/size claims; eSTAR, regional, ACTD and non-dossier documents do not inherit them.
2. Applies the existing marketing checklist only to a known CTD/eCTD dossier whose exact canonical record is active, in `marketing_authorization`, at `initial` stage. Trial applications, lifecycle changes, missing/unknown stages and inactive entries do not qualify for that checklist.
3. Keeps the existing marketing-language statements in that same initial-marketing context, rather than projecting them onto unrelated documents.
4. Preserves selected filing identity, editor format, the document's own required artifacts, regional language context, AnA context, app lists and the separate license projection.

An omitted checklist or language statement means **this enrichment did not assess it**, not that no requirement exists. This does not remove IND requirements such as Form 1571 from the canonical editor artifacts, waive translations, define device/diagnostic requirements, qualify a gateway, or widen released markets. The pure region profile continues to describe its existing general regional defaults; the selected document's format remains `config.editor.dossierStandard`. No regulatory content was revalidated or changed. No new app, service, route, table, model, dependency or license policy.

## Executed verification

Node 22.16.0 and the existing TypeScript installation executed the complete original and repaired production modules using the SAME tests and explicit synthetic catalog, profile, checklist, license and module-policy collaborators.

| Suite | Baseline pass/fail | Patched pass/fail | Skipped |
| --- | ---: | ---: | ---: |
| Regional/document applicability: 33 cases | 7 / 26 | 33 / 0 | 0 |
| Previous workspace isolation: 55 unchanged assertions | 55 / 0 | 55 / 0 | 0 |
| Total | 62 / 26 | 88 / 0 | 0 |

The test harness's collaborators were extended identically for baseline and candidate; production baseline bytes were not modified. Tests cover device/IVD, trial applications, plain CTD, eCTD, ACTD, standalone reports/protocols/quality documents, SOPs, unknowns, lifecycle stages, initial marketing, regional overrides, missing records and CRO/license behavior. Synthetic regulatory labels and sizes are not evidence of regulatory adequacy or actual tenant grants.

`case-results.tsv` records all 33 new outcomes. `execution.json` records counts, source identities and raw TAP hashes. `raw-results.tar.xz` contains the four original raw logs, not GitHub CI output. Both touched TypeScript source/test files transpile without syntax diagnostics. Full semantic typechecking was not run.

Thirteen additional native Vitest cases against the real registries are committed in `tests/regulatory/workspace-regional-applicability.catalog.test.ts`, but NOT executed here. Vitest and full dependencies are unavailable; no dependencies were installed.

## Reproduction

```sh
node --test tests/regulatory/workspace-regional-applicability.test.cjs tests/regulatory/workspace-isolation.behavior.test.cjs
C2C_WORKSPACE_SOURCE_ROOT=/path/to/baseline-snapshot node --test tests/regulatory/workspace-regional-applicability.test.cjs
npx vitest run tests/regulatory/workspace-regional-applicability.catalog.test.ts tests/regulatory/workspace-config-overlays.test.ts tests/routes/workspace-config.test.ts
NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .
npm run ci:one-design-plan
```

The baseline snapshot needs the complete original enrichment and common workspace source. Execute the candidate test files against it with the environment selector. `C2C_TS_PATH` may name an existing TypeScript installation. Native catalog/HTTP/DB/browser tests, full build/typecheck, authentication, live licensing, UI/AnA propagation and hosted acceptance remain open. Direct GitHub writes do not execute local pre-push hooks. Queued checks are not passes.

Publication uses the current branch tree and an expected-head fast-forward. No PR, alternate branch, force-push or reset. This record alone does not prove publication; the branch must be read back. Rollback is an ordinary revert; no migration or backfill.

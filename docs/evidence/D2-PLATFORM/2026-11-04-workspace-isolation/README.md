# Shared workspace isolation and coherent license projections

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Baseline: `307a77ffbe04e7f203fc19b18bb44869959c6ea4`  
Plan: F1. Completes the existing workspace resolver and enrichment. D2 shared project/document configuration evidence; no launch qualification is claimed.

## What already exists

- `shared/regulatory/workspace-config.ts`: the common document-type-to-workspace projection, including editor requirements, AnA context, apps, program claims and region/client overlays.
- `submission-type-bridge.ts`, `workspace-derivation.ts`, `app-registry.ts`, `service-registry.ts` in the same folder: canonical identity, applicability, app descriptions and module-key policy. Unchanged.
- `client-type-profiles.ts`, `region-profiles.ts`: existing terminology and regional data. Unchanged.
- `server/services/regulatory/workspace-config-enrichment.ts`: existing regional enrichment and best-effort license/app-availability projection, not authorization.
- `shared/regulatory/license-model.ts` and `project-map.ts`: consumers of this shared projection.
- `server/routes/workspace-config.routes.ts`: existing HTTP exposure. Unchanged; live UI reach was not established by search.

The current ONE_DESIGN_PLAN and repository rules were reviewed. Searches covered metadata normalization, workspace resolution, enrichment, licensing, project-map consumers and overlay tests. Metadata-conflict semantics and the HTTP pure-config fallback were inspected but are NOT repaired here. No new screen, store, service, route, tool, dependency or regulatory record.

Git history could not be cloned because container DNS cannot reach GitHub. Complete originals were obtained through the connector and verified byte-for-byte against Git blobs `480b6a572d9636163d3644f8e2037b6f9a284206` and `02bf0fe54b1651def1ae639f7cac13f8fc24e0b4` before modification.

## Defects and repair

The resolver returned shared references to requirements, lifecycle actions, program standards/claim arrays, nested app outputs, client terminology, shell and capabilities. A consumer mutating its returned configuration could change another response or the canonical source. Later source changes could also rewrite a previously returned workspace. This is an in-process reference-ownership defect, not evidence of an external user modifying server memory over HTTP.

The common resolver now returns a deep, caller-owned copy for both input forms. The copy remains editable for enrichment. Selection, identities, formats, applicability, overlays and catalog data are unchanged.

The enrichment previously returned the provider's module array by reference and published entitlement before app evaluation finished. A later mutation could contradict its access lists; a failed evaluation could leave partial data. It now validates the tier/module shape, captures independent modules, uses the same app-policy functions and publishes the entitlement and both access lists only after evaluation succeeds. Missing, failed or malformed license reads remain unassessed; valid empty grants remain distinct.

No license grants, server authorization, model approvals, signatures, scientific rules, submission channels, region qualification or stored customer data were changed. An absent entitlement is not permission. Existing callers and server gates retain their responsibilities.

## Executed verification

Node 22.16.0; existing TypeScript 5.8.3. The SAME 55 cases execute both complete production modules with explicit synthetic catalog, profile, license and module-policy collaborators.

| Source | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Exact baseline | 23 | 32 | 0 |
| Patched | 55 | 0 | 0 |

Coverage: catalog/response mutations in both directions; shell/capability isolation; supplementary and unknown documents; nested app/claim arrays; four client profiles including CRO; unchanged identity/format and five region overlays; malformed and sparse license arrays; valid empty grants; failed reads; interrupted app evaluation; overlapping organizations. Service-label cases already passed and are retained positive regressions. Geographic examples do not qualify regulatory pathways.

`case-results.tsv` records every extracted outcome. `execution.json` records counts and source/raw-result hashes. Complete raw TAP is retained in the accompanying verification ZIP as `before.tap` and `after.tap`; it is not GitHub CI output. Three touched TypeScript files transpile without syntax errors; semantic repository checking was not run.

Twelve native Vitest cases against the real catalog are authored in `tests/regulatory/workspace-isolation.catalog.test.ts` but NOT executed here. Full dependencies and Vitest are unavailable; no dependency was installed.

## Reproduction and open qualification

```sh
node --test tests/regulatory/workspace-isolation.behavior.test.cjs
C2C_WORKSPACE_SOURCE_ROOT=/path/to/baseline-snapshot node --test tests/regulatory/workspace-isolation.behavior.test.cjs
npx vitest run tests/regulatory/workspace-isolation.catalog.test.ts tests/regulatory/workspace-config-overlays.test.ts
NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .
npm run ci:one-design-plan
```

The baseline snapshot requires the two original modules at the stated commit, not another development branch. `C2C_TS_PATH` can name an existing TypeScript installation. The baseline intentionally fails 32 cases. The harness discloses all substitutes.

Native catalog/integration tests, full typecheck/build, local pre-push gate, live licenses, authenticated UI/AnA propagation and deployment remain unverified. Direct GitHub writes do not execute hooks. Queued checks are not passes. Rollback is an ordinary revert; there is no migration or backfill.

# Complete the existing US 510(k) template-to-filing mapping

F1 / existing MDX authoring-to-filing completion. Pre-edit discovery and contract; production edits start only after publication of the separately qualified IVD content batch. No new screen, route, table, service or migration.

## What already exists

- `shared/regulatory/project-bootstrap.ts:63`: `DEVICE_SECTIONS`, ten numerical codes 1–10. Exactly four aliases use it: `us_510k_sections`, `us_510k_mod_sections`, `us_cdx_510k_sections`, `uk_device_reg_sections`.
- `shared/regulatory/device-authoring-sections.ts:113`: the already completed FDA IVD 47 array. It retains every generic 38 key, meaning and flag except E5 is optional; E9–E17 are IVD-specific. E1 remains required in both.
- `migrations/20261005c_k510_denovo_estar_outline_v1_1.sql`: the published generic 38 tree, authoritative for document versions already bound to it. `20261114_k510_ivd_estar_outline_v1_0.sql` is the approved parallel IVD 47 tree. Neither needs editing for this repair.
- `server/services/market-specs/document-template-library.ts:543` resolves a registry ID, then a dedicated blueprint or exact shared blueprint. There is no dedicated 510(k) tree in `sectionBlueprintCatalog.ts`. `projectOutline` preserves blueprint code/title/required flags and supplies its guidance to the existing template/editor flow.
- `server/services/authoring/builtin-authoring-templates.ts:77,153`: registry templates resolve through that library. The existing UUID depends on `registry:<ID>`, so changing the source projection does not change template identity. Content is empty and the template is manual preparation; none of the eligibility flags should change.
- `server/services/authoring/authoring-template-sections.ts:65`: `resolveTemplateSections` returns the selected builtin's sections before any write. `authoring-documents.ts:509` resolves it only on a deliberate new-document create, then records its exact template snapshot and per-section guidance in CREATE audit metadata. `templateWorkingBinding` deliberately keeps a builtin template copy unbound until the person places it through the existing governed workflow.
- `shared/regulatory/filing-section-key.ts:20`: exact code match, with a narrow dotted CTD ancestor rule. All ten numerical 510(k) keys return null against the current A–G outline. A save cannot fix this by matching titles; the source template must serve the correct keys.
- `server/services/c2c/filing-section-target.ts:83`: `signedFilingSectionTexts` uses this exact matcher and existing stored authoring section codes, in saved order. A template update must not reinterpret or rewrite old numerical sections.
- `server/services/authoring/authoring-template-guidance.ts:40,60`: saved CREATE metadata wins over reference stores. `templateGuidanceAfterAccess` returns recorded guidance; a missing/malformed identity refuses or is explicitly current-reference. `savedTemplateGuidance` checks current document/project authority before delivery. `authoring.router.ts:7099` and the document readers read actual saved section rows, rather than reseeding them from the current template.
- Existing related sources are not an alternative full tree: `server/services/device/device-section-registry.ts` holds ten different `510K.*` codes; `server/services/intelligence/template-seeds.ts` has eight correctly keyed selected generic sections; the component `k510_summary` is only a summary. Do not replace the complete projection with any of these partial trees.

The live/deleted search covered 510(k), k510, eSTAR, section blueprints, template resolution and saved guidance. No matching deleted full shared38 source was found in fetched history; the checkout is shallow, so historical absence is not exhaustive. Current coordination says the FDA priority-review lane took and released its `project-bootstrap.ts` turn in its own commit. The only two-shared-file hold found is this root's existing IVD continuation hold, ending at publication or 03:30UTC.

## Proposed implementation contract

Production scope is exactly the two existing shared files. Add an exported generic projection inside `device-authoring-sections.ts` by excluding E9–E17 from the existing IVD array, copying each row, restoring E5 required=true and replacing **every** IVD guidance string with appropriately limited generic FDA guidance. Never mutate the IVD array/objects. The actual read-only comparator in `docs/evidence/MDX-JOURNEY/2026-11-14-fda-510k-authoring-keys/pre-edit-projection-comparison.json` proves this gives exactly the published generic 38 keys, labels and required flags. No new table, migration, service, route, UI, AnA capability or approval policy is needed.

Map the three existing US aliases:

- `us_510k_sections` and `us_510k_mod_sections` → generic 38 projection.
- `us_cdx_510k_sections` → the already approved IVD 47 projection, matching the registry's diagnostics/IVD identity and the product's existing CDx 47 project scaffold.
- Leave `uk_device_reg_sections` on its current source. Replacing `DEVICE_SECTIONS` globally would incorrectly give UK registration FDA content/citations.

The original ten generic topics survive at their proper existing keys: cover→A1, indications→B2, description→B1, substantial equivalence→C2, performance→E5, biocompatibility→E1, software→E2, labeling→D2, clinical data→E7, summary→A5. The new template reaches all existing outline nodes; this does not change their applicability policy or certify regulatory sufficiency.

No old authoring document, stored code, title, content, order, signature, version or recorded template guidance is rewritten. Existing numerical drafts remain historical/unmatched until a separate deliberate governed placement/remediation handles them. Do not add heuristic numerical-code translation: the same numbers have different meanings across existing pathways.

## Required executable evidence

1. Meaningful RED from the actual library/builtin template and `filingSectionKey`: all current US numeric keys fail binding. After the change every served key matches its intended published generic or IVD pack, including the full 38/47 shape, labels, flags and order.
2. Actual `getBuiltinAuthoringTemplate` and `resolveTemplateSections` prove the same stable UUID and the correctly keyed empty source reach the one editor, preserving manual/preparation/eligibility limits. Do not count direct constant equality as the whole workflow proof.
3. Pin the IVD 47 source unchanged, including required E1, and assert UK remains the exact old ten-row blueprint. Pin generic guidance free of IVD-specific performance/USA-hidden-bench language and EU IVDR citations.
4. Preserve saved-draft semantics with the current native SQL guidance fixture: `authoring-template-guidance-tenant.pglite.test.ts` proves actual saved reference and no INSERT/UPDATE/DELETE on read. A focused case may install a synthetic old numeric 510(k) row and its CREATE guidance, read it after resolving the current template, and compare stored row/content/audit metadata unchanged. If added, it should use existing actual authoring DDL and helper, not a new mock persistence owner.
5. Retain `assembly-template-guidance.test.ts`, `device-builtin-authoring-templates.test.ts`, `builtin-templates-carry-whole-outline.test.ts`, `section-blueprint-consistency.test.ts`, current IVD template/replay cohorts and `filingSectionKey.test.ts` as bounded existing consumers. Root decides final unique cohort; counts are not additive across reports.

## Unresolved project-aware template selection

`US_510K` metadata permits both medical-device and IVD products, but `getRegistryDocumentTemplate(registryId)` and `getBuiltinAuthoringTemplate(id)` accept no project/product type. `registryTemplate` projects solely by registry ID. `refuseBuiltinTemplateStart` authorizes the current project and checks module; it does not substitute a product-aware template. The client picker recommends by registryId, offers all other templates, and has no productType in its filing-context contract. A generic US_510K template selected on an IVD project will therefore still be generic 38 after this repair. The explicit US_510K_IVD and US_CDX_510K templates can serve47 correctly. Do not imply the two-file mapping repair resolves contextual selection. The existing project creation/binder owners are product-aware, but that authority is not passed through the static template API. Preserve and document this remaining gap unless root grants a separately designed extension to the existing resolver/start owner.


## Retained numeric-record qualification

Extend the existing `server/services/authoring/__tests__/authoring-template-guidance-tenant.pglite.test.ts` fixture with the real stable US_510K builtin UUID and a retained numerical section (code `5`, Performance Testing). Existing native PGlite fixtures already exercise recorded guidance and refusal without writes; this case adds a nonempty historical body, original ordering/version and exact CREATE snapshot/guidance. Resolve the current builtin, then use the actual saved-guidance reader and compare all retained document/section/audit rows. This is a test-only addition under the existing owner, with no production storage or writer changes.


## Implemented qualification

The bounded repair is implemented in the two existing shared owners. The current combined cohort passes 142 tests across 10 distinct files with all 47 declared source pins stable; forced lint has zero errors and two unchanged warnings. The new seven-case contract has five authentic failures against the retained pre-edit source and passes completely after the repair. The independently owned retained-record case and independent source/SQL comparison pass. Full-program compiler, production build and normal canonical publication remain root-owned acceptance gates. See the linked evidence packet for exact reports and remaining contextual/reconciliation limits.


## Canonical publication

Published normally to `concept2cure-v2` at `36dafdf56b14dd91961498c5dc5514280656800d`. The latest selected matrix passes 173 unique cases across 11 files, with zero failures/pending. Full compiler: zero errors. Production build and all 89 CI Lint-job gates pass on unchanged source. Retained evidence and exact publication receipt are in the linked packet. All scoped implementation holds are released. Human/agency acceptance and the separately inventoried attachment/retention completion remain open.

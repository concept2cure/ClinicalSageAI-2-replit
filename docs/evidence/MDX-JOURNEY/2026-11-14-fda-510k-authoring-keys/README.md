# Existing US 510(k) authoring keys

Package F1. Design: `.design/client-journey/FDA_510K_AUTHORING_KEYS_2026-11-14.md`.

## What already exists

`shared/regulatory/project-bootstrap.ts` serves ten numeric DEVICE_SECTIONS through four aliases. The existing FDA generic pack in `migrations/20261005c_k510_denovo_estar_outline_v1_1.sql` has 38 A–G keys. The approved IVD version has 47; `shared/regulatory/device-authoring-sections.ts` already serves its authoring projection. `document-template-library.ts` and `builtin-authoring-templates.ts` project these sources into the existing editor. `filing-section-key.ts` matches exact keys; none of the ten numeric codes matches either filing tree. UK shares the old constant and must retain its source.

Saved documents retain stored rows, CREATE snapshots and recorded guidance; template resolution only seeds deliberate new documents. No rewrite or reinterpretation of retained numeric keys is authorized. Live/deleted searches, partial alternative sources and exact owners are recorded in the design; fetched history remains shallow.

## Status and scope

Implemented and independently reviewed; full compiler, build and canonical publication pending. The read-only comparison reproduces every generic key, label and mandatory flag from the actual migration. Completed repair: only US_510K and US_510K_MOD use generic 38; US_CDX_510K uses the existing IVD 47; UK and all retained records stay untouched. All generic guidance must be generic FDA guidance and must not retain the IVD hidden-bench or non-contact instructions.

Static template selection has no recorded project/product input. A generic US_510K working template can still be selected in an IVD project; this repair does not claim to close that recommendation gap. Governed filing editing starts from the actual stored outline. CDx-specific scientific assessment, human acceptance and agency validation are not established by key alignment.

The existing native PGlite saved-guidance fixture will additionally pin a retained numeric 510(k) draft under its real builtin UUID. Its stored body, original section code/order/version and source/audit snapshot must remain unchanged while current template lookup returns the corrected outline.

## Automated qualification

The combined current cohort passes **142/142 across 10 distinct files**, with no failures or pending tests (`green/tests.json`). All 47 declared source pins and HEAD remain stable. The new seven-case contract executes the actual generic/IVD SQL migrations and canonical resolver, then follows library → builtin → create-section resolver → shared filing-key matcher. The original source has five genuine failures and two passing preservation controls; original source/test bytes and RED output are retained under `red/`.

Scoped forced lint reports zero errors and two existing warnings, both in `project-bootstrap.ts`, unchanged from its baseline. Independent review in `retained/independent-review.json` confirms exact keys, labels, required flags and order for both generic templates and both IVD/CDx templates, distinct generic row objects, unchanged IVD/UK source controls, stable template UUIDs and manual preparation eligibility.

The retained numeric-draft case uses the actual old US_510K source and guidance. Its nonempty body, original code/order/version, provenance, valid immutable revision and CREATE metadata remain exactly equal across all four stored tables after current-template lookup and authorized saved-guidance reading. It is a passing retention control, not part of the five-failure RED demonstration. PGlite establishes local real-SQL behavior; native PostgreSQL concurrency/RLS, deployed/browser/human acceptance and agency acceptance are not established.

Existing numeric drafts remain on their original source and section meanings; deliberate governed remediation is a separate task. Correcting a template must never silently reinterpret their old codes or claim they now file successfully. The existing editor and controls serve the repaired source; this increment adds no alternative UI.

## Compiler follow-up: retained-test row declarations

The first full compiler reports two TS18046 errors in the new retention case: the shared SQL shim correctly returns unknown rows, so property access needs explicit record typing. The test now declares those two SQL snapshot arrays as records. `type-correction/bridge.json` proves exact reversal restores the original bytes; no assertion or runtime behavior changed. The corrected whole file passes 4/4 with clean forced lint. The selected `current-test-matrix.json` replaces that file report without adding overlapping runs; the unique count remains 142/10. The failed compiler is retained in `root/typecheck.json` and its compressed output. No gate or baseline changed; canonical compiler acceptance remains pending until the corrected run completes.

The corrected full compiler passes with zero errors in 51.133 seconds, and the production build passes in 27.755 seconds. All 13,597 declared source/test inputs remain unchanged across those checks. The first normal push passes all 89 CI Lint-job gates and the zero-error compiler, but the canonical branch advances with the project-source selection repair. Integrate that update normally and requalify the actual project-creation boundary before another normal push; no gate bypass or forced update.

## Next end-to-end completion: durable section attachments

The source-traced discovery in `next-workflow-completion/` is **unimplemented**. Current uploads persist Vault bytes while the drawer keeps its section association locally; refresh discards it, and Download original is a placeholder. Existing evidence writers also lack strict source/seal/duplicate/outcome guards. Completing the visible path additionally needs source-retention/disposition/where-used protections; simply connecting the permissive writer would leave a material gap. This is a separate completion of existing owners, not a qualified feature in this increment. Native concurrent reservation and deployed human acceptance remain outstanding.

The project-source selection update is integrated normally at `7825f921fa`. Fresh project-create and three-template integration checks pass 38/38, including the exact IVD/CDx scaffold argument. The selected current matrix replaces the seven-case template report and adds 31 project-create cases; the unique count is **173 across 11 files**, not 142+38. Source inputs remain unchanged throughout that run. The latest merged tree proceeds through full compiler, build and normal push checks before publication.

The source-selection merge passes the full compiler with zero errors (330.790 seconds) and production build (28.105 seconds), with 13,598 declared source/test inputs stable. A later protocol-workspace update is detected before another push starts; the preflight stops without attempting a push, and that update is integrated normally. These are canonical integration receipts, not new feature or human-acceptance counts.

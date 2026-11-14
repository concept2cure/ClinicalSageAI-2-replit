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

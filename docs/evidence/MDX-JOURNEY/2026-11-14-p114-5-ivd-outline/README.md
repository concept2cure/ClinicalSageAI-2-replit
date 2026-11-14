# IVD 510(k) outline completion

F1, W1/D2; P-114 item 5. Starting canonical source: `3692f44adc02ba891ae7e6876a990ad5f8d31740`. Design: `.design/client-journey/IVD_510K_OUTLINE_COMPLETION_2026-11-14.md`.

## What already exists

The existing US IVD blueprint in `shared/regulatory/project-bootstrap.ts` shares EU performance-evaluation content. The existing generic FDA pack has no analytical-performance node. `rule-pack-lookup.ts`, `scaffold-project-documents.ts`, project creation and `vault-folders.ts` own outline selection and binding. `estar-mapper.ts` and `estar-outline-requirements.ts` own requirements, and the vendored FDA IVD PDF owns the form structure. `document-template-library.ts` serves the existing blueprint into the editor. Complete those owners; preserve retained document versions and the existing variant-aware eSTAR UI.

Live/deleted searches and scope are recorded in the linked design. Initial deleted-history search is bounded by a shallow clone; no exhaustive historical absence is claimed. D8 CSS and W7's held host/drawer files are excluded.

## Current status

Implemented in the existing owners. The approved IVD content version has 47 stable keys; new IVD/CDx projects select it explicitly, while non-IVD projects and retained documents keep their existing versions. The US template no longer serves EU IVDR citations. Analytical performance has its own required section; mandatory biocompatibility review remains enforced. Bench/animal headings retain their prior meanings without becoming blanket study obligations.

Latest unique automated qualification: **829 passed across 31 files; zero failed or pending** (`current-test-matrix.json`). This includes actual PGlite SQL, three old/new migration replays, corruption refusal, real governed scaffold/audit, retained content, Vault projection, template-to-mapper coverage and existing client filing controls. Forced lint: 0 errors; 9 existing warnings, with unchanged per-file counts.

The combined runtime inputs stayed unchanged. One test-only describe grouping changed during that run; its exact reversible bridge and a fresh whole 13-case file replace that row. Test bodies and assertions are byte-identical. Original RED and intermediate candidate receipts are retained. The 45-node/no-branch inventory and unchecked BIO candidate are explicitly superseded by raw XFA/script inspection and the final required-review contract. The initial selection RED contains eight genuine selector failures and one invalid fixture view (`mdx` instead of `ivd`), corrected before the successful cohort.

Production build passed on the merged canonical tree (`root/build.json`): all 12,506 declared source inputs stayed unchanged. The full canonical compiler passed with zero errors against baseline zero (`root/typecheck.json`, 303.517 seconds); the same 12,506 inputs stayed unchanged. Later canonical server-only updates merge without a production-source conflict; all scoped qualification pins and frontend inputs remain unchanged, and the server build passes again (`root/server-build.json`). The normal push will re-run the mandatory full-program compiler on that merged tree. Canonical publication is pending. No screen or styling changes were made. No human, agency, deployment or native PostgreSQL claim is made. No device transmission is promised.

## Human acceptance still to execute

1. In a provisioned test environment, create a US IVD 510(k) project and open its existing editor and Vault outline. Confirm the FDA headings, E9 analytical performance and E1 biocompatibility review; confirm no EU Article 56/Annex XIII instructions are presented as this US template.
2. Leave analytical evidence or the biocompatibility assessment absent. Verify content stays incomplete. Record substantive, source-linked review content through the existing governed authoring/review flow; assess each conditional study against the actual device and current FDA instructions.
3. Open a non-IVD 510(k) and an existing project from before this change. Confirm their retained documents, content, recorded versions and editor targets. This change supplies no automatic upgrade of those documents.
4. Walk the existing official eSTAR generation, human form review and retained signed-filing record. This outline is not evidence of completed form validation or FDA receipt; portal upload remains a human action under P-114 item 6.

These steps are pending, not counted among the automated checks. This continuation completes existing backend/content owners and tests; it does not qualify the whole product for human use.

## Publication follow-up: existing SQL selector

The first normal push is retained in `root/push-1.json` and its compressed log. The SQL-interpolation gate rejects the additional variant clause interpolation in the existing `rule-pack-lookup.ts`. Replace that clause with a static, parameter-bound version/boolean predicate; retain the gate and baseline. The corrected selector/scaffold/binder cohort passes 159/159 across 7 files; the SQL gate and its 35-case self-test pass, and selector lint has 0 errors/warnings. The latest per-file matrix replaces those seven reports without adding overlapping tests. No gate or baseline changed. The normal compiler gate must pass on the corrected source before publication.

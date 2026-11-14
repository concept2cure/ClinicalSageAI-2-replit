# Retained filing and IVD binder compatibility

F1 / P-114 item 5. This independent scope owns only `server/services/vault/__tests__/ivd-retained-binder.test.ts` and this evidence directory. No production file is edited by this reviewer.

## What already exists

**Correction before the final test update:** direct inspection of the raw XFA template finds both BenchTesting and AnimalTesting subforms. The USA change script hides BenchTesting and reveals AnimalTesting; the Canadian script does the reverse. The earlier filtered-field absence conclusion was incorrect. The approved final outline keeps old E5 and E6 as optional, with their meanings unchanged, and has 47 nodes. The existing projection therefore places those retained sections under their matching binder headings. The complete earlier 45-node four-case pass, source pins and fixture are preserved under `superseded-45-node/`; they are historical, not final-current qualification. The parent design records the corresponding correction before the shared outline changes.

- `server/services/c2c/rule-pack-lookup.ts` selects an active governed outline. The proposed product-family refinement chooses the exact approved IVD version and excludes it from the default market listing.
- `server/services/c2c/scaffold-project-documents.ts` binds a newly created document to its selected pack in the caller's transaction. Existing documents are skipped, not rewritten.
- `server/services/vault/vault-folders.ts` supplies the active filing binder, intentionally distinct from a retained document's version. Its callers include ingest, placement, folder editing and export.
- `server/services/vault/vault-binder-outline.ts` exports `placeAuthoredSectionsInBinder`, the existing one-outline projection. It moves authored section objects to matching binder keys and keeps unmatched sections under the original document. It does not persist changes or upgrade a document's pack version.
- `migrations/20261005c_k510_denovo_estar_outline_v1_1.sql` contains the actual retained generic 38-node tree. `migrations/20261114_k510_ivd_estar_outline_v1_0.sql` contains the corrected 47-node IVD tree, while `FDA_510K_IVD_SECTIONS` in `shared/regulatory/device-authoring-sections.ts` supplies the corresponding authoring blueprint.
- New E9–E17 keys preserve existing section meanings; E5 bench and E6 animal remain optional under their unchanged keys and labels. Their retained content must stay reachable once, with its original filing and section identity.

Searches covered the above functions, all `readProgramFolderIndex` and rule-pack callers, active-pack SQL, authored section projection and the existing Vault tests. `git log --all --diff-filter=D` was searched for binder/rule-pack/IVD-outline names; this checkout's fetched history is shallow, so this is not exhaustive historical proof. The parent design records the same existing owners before implementation.

## Scope and intended check

Exercise the real existing projection with the actual migrated trees. Verify that retained section identities, labels, content, version and editor targets survive; retained E5/E6 appear once under their matching binder headings; analytical E9 is never supplied by unrelated old content. Verify the current IVD document projects completely and ambiguous competing home documents are preserved. Separately review the four root-owned selection/caller changes and the shared blueprint/pack identity.

This is a pure server projection compatibility check, not native PostgreSQL execution, running-app use, a document upgrade, human acceptance or FDA acceptance.

## Historical 45-node qualification (superseded)

At the earlier 45-node epoch: **4 passed / 1 unique test file**, zero failed or pending. Forced lint: **0 errors / 0 warnings**. Node 22.23.5; 14 declared source paths and HEAD `3692f44adc02ba891ae7e6876a990ad5f8d31740` remained stable through tests and lint. These are uncommitted working-tree hashes, not a claim that HEAD already contains the proposed changes. This entire receipt and fixture is preserved under `superseded-45-node/`; the corrected 47-node check is pending below.

- The actual migrated 45-node IVD tree and shared blueprint agree on every key, label and required flag. Every common key retains its generic meaning; only old E5 and E6 are absent.
- The actual `placeAuthoredSectionsInBinder` preserves all 38 retained section objects, bodies, statuses, versions and editor destinations. Old bench and animal content remains under its original filing; E1 remains biocompatibility and is not presented as analytical content; the new analytical heading has no old content attributed to it.
- A current IVD filing projects all 45 sections once. Competing home filings are left in their own folders rather than choosing one.

The initial four-case pass and two `structuredClone` lint warnings are preserved under `initial-qualification/`. The test now qualifies the built-in through `globalThis.structuredClone`; no assertion or production behavior changed. This packet claims no new runtime failure-to-success demonstration; the parent selection, outline and mapper packets own their corresponding RED evidence.

## Independent source review

No blocker found in the four root-owned production changes at the pinned epoch:

- `rule-pack-lookup.ts` selects the exact live IVD version for `ivd` and `cdx`, rejects non-FDA fallback for that class, and excludes that version from default/non-IVD lookup and the existing market listing. Other classes retain their existing resolution.
- `scaffold-project-documents.ts` passes the canonical product class through its existing resolver; its retained-document idempotency and caller-owned transaction stay in place.
- `projects.ts` supplies the already normalized `productType`, not a UI label or inferred name.
- `vault-folders.ts` carries the actual recorded product class through both its supplied-row path and its own SQL. This covers the ingest, placement, folder-write and export callers that supply only a project id.

The earlier migration-replay blocker is resolved by the outline owner. IVD-specific mapper necessity is owned by the mapper packet. The binder remains the active filing template under P-123; retained documents keep their original version, and every retained section remains reachable. No global binder policy is changed.

## Independent raw form review

`inspect-raw-form.mjs` calls the production `listXfaPackets` on the actual retained PDF, independently of the field catalogue. `raw-form-inspection.json` records SHA-256, actual XML ancestry, field counts, choice values and script excerpts. Full USA, Canada and biocompatibility script evidence is compressed here. The PDF SHA-256 is `df5e31dcbbe60e55b93c6006c4771c01df75a9d1c21e4b473605e20dfacce1e1`; the raw template SHA-256 is `cbd37201e9a9b7e96b16134c6f434b392d6337416bf20b74ba96c6d2c118d74c`.

- Both BenchTesting and AnimalTesting subforms exist. The USA change script hides BenchTesting and reveals AnimalTesting. The Canadian script does the reverse. Neither branch is universally mandatory, and Canadian visibility is not FDA applicability. E5 remains an optional legacy platform heading; E6 remains available for applicable animal evidence.
- The actual contact question asks whether any component has direct or indirect tissue contact. The materials-count question permits zero. `BCPresence()` explicitly hides biocompatibility inputs for an FDA no-contact answer and also branches on the recorded modification answer. These are not the product's collected answers. The final product therefore retains the existing blocking biocompatibility content review, accepting accountable evidence or a reviewed applicability rationale without inferring no contact or completion.

Scripts were read, not executed. This is structural evidence, not Acrobat or agency acceptance.

## Corrected 47-node qualification

Final: **4 passed / 1 unique test file**, zero failed or pending. Forced lint: **0 errors / 0 warnings**. Node 22.23.5; all **18 source pins** and HEAD remained stable. `result.json`, `tests.json`, lint JSON, source-before/after JSON and compressed logs are the final-current receipt. Earlier snapshots above are not additive to this four-test result.

The corrected tree and blueprint both contain 47 nodes. Every shared key retains its meaning. All 38 retained section objects, approved bodies, statuses and versions remain present exactly once; old E5/E6 content projects under its unchanged heading and retains its original document editor target. Nothing old is attributed to the new E9 analytical heading. All 47 current IVD sections project once; ambiguous competing home documents are untouched.

The final independent source review found no remaining blocker within this change: exact product-family selection is retained, replay admission is narrow, the template and blueprint agree, and biocompatibility remains always-required in the mapper with E1 mandatory in both content projections. Applicable animal evidence has its own IVD question; the legacy bench heading is not described as FDA-required. Non-IVD and De Novo registries remain unchanged. The mapper worker owns the final readiness regression run; this packet owns retained projection compatibility and the independent source/raw-form review.

The unsafe intermediate changed biocompatibility to a nonblocking question. `readiness-review.md` records why that was rejected and `unsafe-intermediate/` preserves its exact cohort source and passing reports, explicitly superseded. Existing global `when-applicable` behavior and tracked-filing signature policy are not redesigned by this bounded correction. No native database, running-app, human, deployment or agency acceptance is claimed here.

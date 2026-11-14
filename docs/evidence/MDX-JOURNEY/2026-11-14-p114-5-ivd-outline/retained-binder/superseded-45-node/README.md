# Retained filing and IVD binder compatibility

F1 / P-114 item 5. This independent scope owns only `server/services/vault/__tests__/ivd-retained-binder.test.ts` and this evidence directory. No production file is edited by this reviewer.

## What already exists

- `server/services/c2c/rule-pack-lookup.ts` selects an active governed outline. The proposed product-family refinement chooses the exact approved IVD version and excludes it from the default market listing.
- `server/services/c2c/scaffold-project-documents.ts` binds a newly created document to its selected pack in the caller's transaction. Existing documents are skipped, not rewritten.
- `server/services/vault/vault-folders.ts` supplies the active filing binder, intentionally distinct from a retained document's version. Its callers include ingest, placement, folder editing and export.
- `server/services/vault/vault-binder-outline.ts` exports `placeAuthoredSectionsInBinder`, the existing one-outline projection. It moves authored section objects to matching binder keys and keeps unmatched sections under the original document. It does not persist changes or upgrade a document's pack version.
- `migrations/20261005c_k510_denovo_estar_outline_v1_1.sql` contains the actual retained generic 38-node tree. `migrations/20261114_k510_ivd_estar_outline_v1_0.sql` contains the proposed 45-node IVD tree, while `FDA_510K_IVD_SECTIONS` in `shared/regulatory/device-authoring-sections.ts` supplies the corresponding authoring blueprint.
- New E9–E17 keys preserve existing section meanings; E5 bench and E6 animal are omitted from the IVD binder, not reassigned. Their retained content must stay reachable under the original document.

Searches covered the above functions, all `readProgramFolderIndex` and rule-pack callers, active-pack SQL, authored section projection and the existing Vault tests. `git log --all --diff-filter=D` was searched for binder/rule-pack/IVD-outline names; this checkout's fetched history is shallow, so this is not exhaustive historical proof. The parent design records the same existing owners before implementation.

## Scope and intended check

Exercise the real existing projection with the actual migrated trees. Verify that retained section identities, labels, content, version and editor targets survive; omitted E5/E6 remain under the retained document; analytical E9 is never supplied by unrelated old content. Verify the current IVD document projects completely and ambiguous competing home documents are preserved. Separately review the four root-owned selection/caller changes and the shared blueprint/pack identity.

This is a pure server projection compatibility check, not native PostgreSQL execution, running-app use, a document upgrade, human acceptance or FDA acceptance.

## Results

Final: **4 passed / 1 unique test file**, zero failed or pending. Forced lint: **0 errors / 0 warnings**. Node 22.23.5; 14 declared source paths and HEAD `3692f44adc02ba891ae7e6876a990ad5f8d31740` remained stable through tests and lint. These are uncommitted working-tree hashes in `source-before.json` / `source-after.json`, not a claim that HEAD already contains the proposed changes. The exact runner, machine test report, commands and compressed logs are retained here.

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

The earlier migration-replay blocker is resolved by the outline owner. IVD-specific mapper necessity is owned and qualified by the mapper packet. The binder remains the active filing template under P-123; retained documents keep their original version, and this check proves their unmatched sections remain reachable. No global binder policy is changed.

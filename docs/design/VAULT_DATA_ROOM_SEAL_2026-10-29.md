# Seal the data room (VR-19), 2026-10-29

`docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` VR-19, scheduled by the founder at FD8/FD10 (the seal and the closing archive "scheduled now as D5/D6 work"). FD9 is decided by FD8's wording, "frozen under an e-signature": sealing is an e-signed act. Which role seals is still open (below). Lane: the Vault parity slices, claimed in order by `…01KnUGoX` on the board.

**Veeva capability:** a binder or submission-archive snapshot with pinned versions; a data room's closing snapshot. **User outcome:** a person who may write the Vault and holds signing authority seals a project's Vault with a reason and an e-signature. The server records every current document's identity, version, content hash, filing and lifecycle stage as they stand, hashes that record, and keeps it where nothing can alter it. Later, anyone in the organisation can verify the seal. The answer is intact, changed (naming the documents), or could not verify, and never intact when anything could not be read.

## What already exists

Searches run: `seal`, `sealed_at`, `manifest_sha256`, `snapshot`, `freeze`, `binder`, `data room close`, `closing` across `server/`, `shared/`, `client/src`, `migrations/`; deleted history (`git log --all --diff-filter=D` on `*[Ss]eal*`, `*[Ss]napshot*`).

- **No Vault seal or snapshot exists, and none was deleted.** The only product matches are listed below; the deleted files are developer tooling under `.claude/skills/gstack`.
- **Look-alikes that are not this:**
  - The IVDR binder packs (`ivdrPackManifest.ts`, `ivdr-binder-routes.ts`) are a BIGINT-org claim binder outside the launch catalog; the plan excludes them by name.
  - The IND dispatch-readiness snapshot (`ind-dispatch-snapshot-service.ts`) is a sequence's dispatch verdict.
  - The submission freeze is the eCTD sequence's governed freeze.
- **Pieces this extends, each called and not copied:**
  - The Vault read's tenant and current-version predicate, `server/routes/c2c/project-vault.ts`: `d.program_id`, `d.organization_id`, `deleted_at`, `vaultDataEligibleSql`, the program's own organisation, and `supersededSql` (VR-09).
  - VR-15's index numbers, from the same `filingCabinet` the tree is drawn by.
  - `vaultLifecycleStageSql` (VR-13), the stage each version stands at.
  - `stableStringify` (`shared/canonical-json.ts`), so the manifest hashes the same everywhere.
  - `readVerifiedVaultBytes` (`project-vault.ts`), the one verified reader, for the optional byte check.
  - `signGovernedAct` (`server/routes/governed-signed-act.ts`), the one signing ceremony: reason, meaning, password, second factor, signing authority, one transaction with the ledger pair and the `electronic_signatures` row.
  - `CONTENT_BINDERS` (`server/services/part11/governed-target-binders.ts`), so the signature binds the seal's manifest hash, as `report-run:` binds a report's seal.
  - `writeChainedAuditRow`, on the signing transaction.
  - `EsignModal` (`client/src/concept2cure/_shared/components/EsignModal.tsx`), the ceremony's one dialog, as the QMS periodic review uses it (`quality/PeriodicReview.tsx`).
  - The tenant purge's doors (`PURGE_DOORS`, `server/services/tenant/tenant-offboarding.ts`) and the preconditions of `public.purge_tenant_vault_records` (`migrations/20260926_vault_documents_record_immutability.sql`), which the seal's door repeats.

## Decisions taken here, and why

- **The signature's meaning is `approval` or `responsibility`** (`DECISION_ACT_MEANINGS`), not a new "sealed". The vocabulary is closed (§11.50(a)(3); `signature-meanings.ts`), and every reader compares stored meanings. Adding one is a change to the ceremony, the dialog and those readers. A seal is a decision on the record, as a freeze is: the signer approves this as the room's state, or answers for it. What was done is the act's own name, `vault.data_room.seal`.
- **The seal row carries no signature id.** The signature is written after the domain write, in the same transaction, and the seal row is append-only, so it could not be updated to point at it. The `electronic_signatures` row names the seal as its target (`vault-data-room-seal:<id>`) and binds its `manifest_sha256`. That is the link, and it cannot be forged without breaking the chain.
- **The manifest lists current versions only**, the documents the room shows. Earlier versions are the history of those documents, and each is reachable through its family.
- **Who may seal is the platform's one rule for each half, not a new one.** The plan's default for FD9 was "admin or manager". But signing authority has one policy (`signing-authority.ts`, `ESIGNATURE_SIGNING_ROLES`, by default admin, approver and reviewer, pinned by `one-signing-authority-policy.test.ts`), in which a manager may not sign at all. A second, seal-only rule would contradict it. So a seal needs:
  - Vault write access (`requireEditorAccess`, the route's own gate);
  - signing authority, read from the membership row by the ceremony (`checkSigningAuthority`, step 3a).
  - A narrower seal role is FD9's open half, a founder decision; it would be one more check in the route.
- **The tenant purge erases seals through a door, not inside the Vault purge.** The plan said to amend VR-07's function in place. A door (`PURGE_DOORS`, `tenant-offboarding.ts`) reports what it erased, and the Vault function's result is per version, so seals get `public.purge_tenant_vault_seals` with the Vault purge's preconditions, listed before `regulatory_programs`.

## The change

- **Migration `migrations/20261029_vault_data_room_seals.sql`**, in `C2C_MIGRATION_FILES` before the final sweep pair, so the sweep gives it FORCE row security:
  - `public.vault_data_room_seals` with `id uuid`, `organization_id INTEGER NOT NULL`, `program_id uuid NOT NULL`, `reason` (non-blank), `manifest jsonb`, `manifest_sha256` (64 hex), `document_count`, `sealed_by integer NOT NULL`, `sealed_at`;
  - an index on (organization_id, program_id, sealed_at DESC);
  - the same-organisation project key;
  - append-only: UPDATE and TRUNCATE refused, DELETE refused unless the caller owns the table;
  - the tenant purge's door for seals, `public.purge_tenant_vault_seals`.
- **Service `server/services/vault/vault-seal.service.ts`:**
  - `readSealDocuments` lists the current versions with the read model's predicate;
  - `sealManifest` builds and hashes the manifest;
  - `recordSeal` inserts the row and the chained `vault.data_room.seal` audit row;
  - `listSeals`;
  - `verifySeal`.
    - It recomputes the hash from the stored manifest.
    - It checks each document is still recorded with the same hash.
    - With `bytes=1`, it re-reads each stored file through the verified reader.
- **Routes (`project-vault.ts`):**
  - `GET /:id/seals`;
  - `POST /:id/seals`, through `signGovernedAct`, for a Vault writer with signing authority;
  - `GET /:id/seals/:sealId/verify`.
- **Binder:** `vault-data-room-seal:` binds the row's `manifest_sha256` under `BINDING_BASIS.VAULT_DATA_ROOM_SEAL_MANIFEST`.
- **Client:** a Seals section in the Vault (`client/src/concept2cure/v2/surfaces/VaultSeals.tsx`). It lists each seal (when, who, why, how many documents, hash), offers "Seal this Vault" through `EsignModal` to a role that may write the Vault, and offers "Verify" with the verdict in words. A failed read says so.

## Tests first

- Real PostgreSQL 16 as `app_service`, row security on:
  - UPDATE, DELETE and TRUNCATE of a seal are refused;
  - a three-document room seals into a manifest of the three, `manifest_sha256 = sha256(stableStringify(manifest))`, and the chained audit row and the signature carry the same hash;
  - verify returns intact; with a stored object removed it returns could not verify, never intact; with a recorded hash changed under the owner, it returns changed, naming the document;
  - another organisation can neither list nor verify the seals;
  - no reason gives 400, a viewer gets 403, and a foreign project 404;
  - the purge door removes the seals, and refuses while the organisation is not pending deletion.
- Unit: the manifest and its hash are deterministic, and the verdicts.
- Client: the list, the ceremony, the verdict in words, and a failed read.

## Not in this change

- **The closing archive (VR-20).** The bytes, index, SHA256SUMS and audit extract of a seal in one verifiable file. It is the next slice, and its builder is also the tenant data return's byte carrier (FD10).
- **A narrower seal role** remains FD9's open half (above).

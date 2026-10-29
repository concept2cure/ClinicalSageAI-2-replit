# D5: seal a project's Vault (VR-19, 2026-10-29)

`docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` VR-19, scheduled at FD8/FD10. Design and "What already exists": `docs/design/VAULT_DATA_ROOM_SEAL_2026-10-29.md`.

A person who may write the Vault, and who holds signing authority, seals a project's Vault with a reason and an electronic signature. The server records every current document's identity, version, content hash, filing, index number and review stage, and hashes that record. It keeps the record where nothing can alter it, and binds the signature and a chained audit row to the hash. Anyone the project admits can verify the seal later. The verdict is intact, changed (naming the documents), or could not verify, and it is never intact when anything could not be read.

## What changed

| Piece | Where |
|---|---|
| The seal table, append-only (UPDATE and TRUNCATE refused, DELETE only through its owner-run door), its program key, and the purge door | `migrations/20261029d_vault_data_room_seals.sql`, in the set before the tenant sweep (which gave it FORCE row security and its policy) |
| Read, manifest, hash, record, list, verify | `server/services/vault/vault-seal.service.ts` |
| `GET /:id/seals`, `POST /:id/seals` (through `signGovernedAct`, `DECISION_ACT_MEANINGS`), `GET /:id/seals/:sealId/verify[?bytes=1]` | `server/routes/c2c/project-vault.ts` |
| The signature binds the seal's `manifest_sha256` | `vault-data-room-seal` in `CONTENT_BINDERS`, `BINDING_BASIS.VAULT_DATA_ROOM_SEAL_MANIFEST` |
| The tenant purge erases seals through `purge_tenant_vault_seals`, before `regulatory_programs` | `PURGE_DOORS`, `PURGE_CHILD_TABLES` (`tenant-offboarding.ts`) |
| The Seals card: list, "Seal this Vault" through `EsignModal`, Verify with the verdict in words | `client/src/concept2cure/v2/surfaces/VaultSeals.tsx`, in `Vault.tsx` |
| The SQL-interpolation gate admits the seal service's three canonical builders | `scripts/ci/lib/approved-sql-predicates.mjs` |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | At trunk with the tests only, on real PostgreSQL 16 (`RLS_ENFORCE=on`, `app_service`): 9 of 9 fail. There is no route, no table and no door. |
| `02-green.txt` | Green on real PostgreSQL 16, with the Vault where-used and placement suites: 36 of 36. It covers sealing three documents (manifest, hash, chained audit row and signature all carrying one hash), the list, intact with and without re-reading the files, refusals (no reason 400, a wrong password 401, a viewer 403, another organisation's project 404), the runtime role refused UPDATE, DELETE and TRUNCATE, a removed stored file reading "could not verify", and the purge door (refused before pending deletion, then counting what it erased). The migration was replayed twice on each test database. Unit and client: 15 of 15. The Vault, Part 11, tenant and Vault-route suites: 2,269 of 2,270. The one failure is outside this change (below). |
| `03-mutation.txt` | Four mutations, each caught: the signature binds the ledger hash instead of the manifest; no audit row; an unreadable file not stopping an intact verdict; the append-only guard detached. |

## Decisions recorded here

- **The meaning is approval or responsibility**, not a new "sealed": the vocabulary is closed (`signature-meanings.ts`).
- **Who may seal** is Vault write access plus the platform's one signing-authority policy, not the plan's "admin or manager". A manager holds no signing authority under that policy. A narrower seal role is FD9's open half, and a founder decision.
- **The purge erases seals through a door**, which reports its count, rather than inside the Vault purge function.

## Not done

- **The closing archive (VR-20):** the seal's bytes, index, SHA256SUMS and audit extract in one verifiable file. It is also the tenant data return's byte carrier (FD10). This is the next slice.
- **Handed on:** `one-signing-authority-policy.test.ts` is red on trunk. A direct `isSigningAuthorized` call in `server/services/review/review-route-member.ts` (the review-routing lane, Veeva gap 4) is not on its allowance list. It is not edited here.

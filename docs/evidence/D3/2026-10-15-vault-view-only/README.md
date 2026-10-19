# D3 — the Vault offers its write controls to the writing roles only

The client half of `docs/evidence/D3/2026-09-24-vault-write-role/`.

The server already refused a viewer:

- every Vault write route carries `requireEditorAccess`;
- the shared services ask `vaultWriteRefusal`.

The surface still offered a viewer every control. Each was refused after the click, often after the person had written a reason for change. The Catalog record panel (S4) was the only one that withheld its controls.

## The rule

`client/src/concept2cure/v2/surfaces/VaultViewOnly.tsx` provides:

- `useVaultCanWrite()`, which is `canGovernedWrite(useAuthUser())`. It reads the `governed:write` permission the session derives from the same `GOVERNED_WRITE_ROLES` set the guard reads. The client mirrors no role list (`shared/constants/permissions.ts`).
- `VaultViewOnly`, one sentence in place of the controls: "View only. Your role can read this but not …. A member or administrator can."

A session with no permissions array is offered the controls, as `canGovernedWrite` documents: the server decides.

| Panel | Withheld from a viewer | Route (all `requireEditorAccess`) |
|---|---|---|
| Vault header | Upload, document type, Ask AnA to import | `POST /api/vault/ingest` |
| Filing | Confirm filing, Move, Unfile, reason | `POST …/:id/file` |
| Coverage gap | Upload, File here (the gap itself is still stated) | ingest, `…/file` |
| Confirm suggested | Confirm N suggested (the count is still stated) | `…/file-batch` |
| Data Room | Source checkboxes, Select/File into Vault | `…/data-room/file` |
| Stored files | Check stored files | `…/fixity` |
| Details | Edit details | `…/documents/:id/details` |
| Versions | Upload new version | ingest |
| Annotations | Add, reply, resolve, retract | `…/annotations…` |
| Related documents | Relate, Remove | `…/relationships…` |

Lifecycle transitions keep their own signing authority (`VaultLifecycle`) and are unchanged.

## Files

- `01-red.txt`: the nine panel files as on trunk at `46f8cb822`, with the new test kept. The viewer is offered Upload, and a Data Room checkbox.
- `02-green.txt`: every client suite under `client/src/concept2cure/v2/__tests__/`, with `vaultViewOnly.test.tsx` 5/5.

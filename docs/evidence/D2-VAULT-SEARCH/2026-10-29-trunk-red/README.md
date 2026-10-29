# D2: three Vault search cases red on trunk, fixed where each now stands (2026-10-29)

The Vault find view (VR-18, `../2026-10-22-find-view/`) and the editor rail's Vault search each had cases red on trunk at `97c5bace6`. Trunk CI is queued without runners, so nothing reported them. They were found while proving Part 11 F4 (`../../D5-VAULT-FILING-ATTRIBUTION/2026-10-29/`). Both product rules they had fallen behind are correct, and are left as they are.

## What already exists

- **The search read requires `current` on every hit.** `isVaultSearchShape` (`VaultLibraryResults.tsx`) has required each hit to say whether it is the current version since `8c87144fd` (2026-10-23). A read without it is refused and shown as unavailable, never as zero matches. The server has always sent it (`server/services/vault/vault-search.ts`, `current: Boolean(r.current)`).
- **Source intake belongs to the signed-in member, in the open project.** Since `8c86a44a3` (2026-10-23, `docs/design/SOURCE_INTAKE_OWNERSHIP_2026-10-23.md`):
  - the working-copy dialog needs a session and the shell project;
  - a Vault source must be a version id (a uuid);
  - a working copy is opened only when its recorded owner, tenant, project and source are the ones asked for.
  - `sourceImportDialog.test.tsx` and `sourceIntakeOwnership.test.tsx` were updated with that change; `projectVaultSearch.test.tsx` was not.

## The cause and the fix

| Case | Cause | Fix |
|---|---|---|
| `vaultSurface.test.tsx`: "searches on the server and shows the hits"; "says how many of the total are shown" | The fixture hits had no `current`, so the read refused them. | `current: true` on each hit, as the server sends. |
| `projectVaultSearch.test.tsx`: "loads later matches and imports the exact selected source" | No session or shell project, so the dialog said "Choose a saved source and an existing project". The source ids were not uuids, and the working copy carried no attributable record. | The same session fixture as `sourceImportDialog.test.tsx`. Hit ids are uuids, the returned working copy records its owner, tenant, project and source, and the import call carries the auth headers. |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | At `97c5bace6` with nothing local: 3 failed of 30. |
| `02-green.txt` | Both suites, with the two source-intake suites they share the dialog with: 101 of 101. |

Each fixture now matches what its product rule requires. The red is the evidence that each rule is live: a hit without `current` is refused, and an unattributable intake opens nothing.

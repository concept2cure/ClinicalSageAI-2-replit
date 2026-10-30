# D2: five Vault search cases red on trunk, fixed where each now stands (2026-10-29)

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
| `03-red-commitment.txt` | Found later by a sweep at `b28db8240` with nothing local: the commitment picker's case asserted the old guard, that a hit sent without `current` is listed. |
| `04-green-commitment.txt` | The picker refuses it as the find view does, and says the search could not be read: 23 of 23. |
| `05-red-labels.txt` | Found while proving VR-19, at `1586f81ae` with that change stashed: `vaultSurfaceLabels.test.tsx`'s search hit had no `current`, so the hit's type label never rendered. |
| `06-green-labels.txt` | The hit says it is current, as the server sends: 4 of 4. |

## The sweep, 2026-10-29 08:11–09:01 UTC

`server/services/{vault,qms,ectd}`, `server/routes/__tests__`, `server/routes/c2c/__tests__`, `tests/routes`, `client/src/concept2cure/v2/__tests__` and `client/src/concept2cure/quality`, at `b28db8240`. It stopped at its 50-minute limit after 7,566 tests, so it is not a full pass of those folders. Its reds:

- **Fixed here:** `commitmentFulfilment.test.tsx` (above).
- **Likely environment, Reporting's lane:** `report-os-report-pack-export.test.ts`, 16 cases. Each is a 503 where the test expects 200, 403, 404 or 409. The refusal the output names is `REPORT_PDF_FONTS_UNAVAILABLE` (`server/services/report-os/pdf/writer.ts`), and this container has only part of the Noto set the image installs. That was not confirmed case by case.
- **Handed on, not this lane:**
  - `authoringFromDraft.pglite.integration.test.ts` (3) is already on `b84f297ca`'s list.
  - `coauthorSnapshotStatus.test.ts` (7) fails with "Cannot read properties of undefined (reading 'status')", last changed in `cc1607c3a`, the commit that list names for its authoring suites.
  - `tests/routes/ana-ri-health.test.ts` (1): the stream ends without `"type":"done"`.
  - `globalBiotechTemplateEditor.pglite.integration.test.ts` (1): a 180-second timeout under the sweep's load, unconfirmed alone.

Each fixture now matches what its product rule requires. The red is the evidence that each rule is live: a hit without `current` is refused, and an unattributable intake opens nothing.

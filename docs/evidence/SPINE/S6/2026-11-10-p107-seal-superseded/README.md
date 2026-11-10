# S6, P-107 item 3 (3): a seal says when a version it holds was superseded (2026-11-10)

Package S6 of `docs/design/ONE_DESIGN_PLAN.md` (Vault at Veeva parity, on the existing Vault). The decision is P-107
item 3 in `docs/LAUNCH_DEFINITION_OF_DONE.md` (2026-11-08, under the founder's delegation):

> A seal says when its version has been superseded ("superseded by version n on date"), read from the version chain.
> What was sealed, and whether it is intact, is unchanged.

## The defect

A Vault seal is an e-signed record of the project's current documents at one moment (VR-19). Since S6 V5 the Seals
view lists what each seal holds: each document's version, review stage and hash as sealed. It said nothing about now.
A reader of a seal from last quarter could not tell which of its versions a later one had replaced, and the list read
as if every sealed version were still the current one.

A superseded version does not change a seal's verdict, and should not: the sealed version is still recorded with its
sealed hash, so the seal is intact. So the verdict could not carry this either.

## What already exists

- **The seal list.** `listSeals` (`server/services/vault/vault-seal.service.ts`) reads each seal's stored manifest
  and `sealHoldings` lists its documents; `GET /api/c2c/project-vault/:id/seals` passes it through. `SealHoldings`
  (`client/src/concept2cure/v2/surfaces/VaultSeals.tsx`) shows it under "What it holds".
- **The version chain.** `server/services/vault/vault-version-family.ts` holds the one rule for which versions belong
  together (`VALID_LINK`) and the readers that apply it: `supersededSql`, `versionCountLateral`,
  `currentVersionLateral` (the data room's "filed as 1.0, superseded by 2.0", VR-16) and `readVersionFamily` (the
  Versions list). None answered "which version replaced this one, and when" for a set of versions.
- **The verdict.** `verifySeal` checks each sealed version is still recorded with its sealed hash. It is not changed.

Searches run: `supersede`, `successor`, `standing`, `current_version` over `server/services/vault` and
`client/src/concept2cure/v2/surfaces/Vault*.tsx`; `listSeals`, `sealHoldings`, `SealedDocument` callers. No reader
told a seal about supersession.

## What changed

- `vault-version-family.ts`: `readSupersessions` answers, in one read and by the family's own rule, whether each of a
  set of versions has a successor: its version and when it was recorded. A version that is not a live version of the
  project now is left out, so nothing is said of it.
- `vault-seal.service.ts`: `listSeals` adds each sealed version's `standing`: `current`, `superseded` (by which
  version, when), or `unknown`. It is the one field read now; the rest is the seal's record. `unknown` is never shown
  as current.
- `VaultSeals.tsx`: a superseded version says "Superseded by version 2.0 on 2026-11-10 07:07 UTC." under its row, the
  heading counts them ("1 since superseded"), and a line says the seal is unchanged. A version whose standing was not
  read says so. A seal whose versions are all current looks as it did.

The manifest, its hash, the verdict and the closing archive are untouched.

## Evidence

| File | What it shows |
|---|---|
| `01-red-service.txt` | The service's cases on trunk: 4 of 15 fail. |
| `01-red-client.txt` | The Seals view's cases on trunk: 2 of 17 fail. |
| `01-red-db.txt` | Real PostgreSQL, with the chain's read taken out of `listSeals`: the case fails. |
| `02-green.txt` | Service and client 32 of 32; real PostgreSQL with RLS on, 31 of 31 in two suites. |
| `running-app-superseded.png` | A sealed Vault after a new version of one document was checked in. |
| `running-app-still-intact.png` | The same seal verified with its files re-read: intact. |

The database case seals three documents, checks in a new version of one, and asserts: that one says superseded by
the new version at the new row's `created_at`; the other two say current; the seal's listed record, stored manifest,
manifest hash and verdict are equal before and after; another organization reads nothing of it.

Opened and used in the running app: a demo project's Vault was sealed (6 documents), a second version of its
Investigator's Brochure was checked in, and the Seals view showed "What it holds · 6 documents · 1 since superseded",
the line under that document, and "Intact" on verifying with stored files re-read.

## What is not done

- The line names the immediate successor. It does not also name the current version when there have been several
  since.
- The closing archive's index does not say which sealed versions were later superseded. It is a record of the seal
  as signed.

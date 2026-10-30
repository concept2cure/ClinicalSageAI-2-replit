# D5: a document on legal hold says so, to every reader (MR-08 Stage 5 step 5, 2026-10-30)

`docs/work-orders/MR-08-vault-upload-safety-and-document-control.md` Stage 5, step 5; CAT1-15.

A custodian has to know a document is under hold before anyone asks them to withdraw, dispose of or replace it. Holds were placed and lifted in Admin Settings, and the hold list is readable by the hold-authority roles only. The Vault itself said nothing. A member opening a held document saw no sign of it, and was offered "Review removal" beside it.

## What already exists

Searches run: `legal_holds`, `legal-holds`, `LegalHold`, `holdsCovering`, `On legal hold`, `legalHolds` in client and server. Deleted history: nothing under those names.

- **The register:** `LegalHoldsCard.tsx` (Admin › Settings) lists, places and lifts holds through `GET/POST /api/vault/legal-holds`, for `HOLD_AUTHORITY_ROLES`. That is the work order's register, already built.
- **What a hold covers** is already defined by its readers. The retention sweep, the disposition engine (`impact.ts`) and the tenant purge take a project hold to cover the project and a document hold to cover the version it names. The notice uses that same rule.
- **The Vault read** (`GET /api/c2c/project-vault/:id`) already reports a branch it could not read under `unavailable`, and the page renders those reasons. The holds use the same channel.
- **Nothing on the document** said it was held.

## What changed

| Piece | Where |
|---|---|
| `readActiveHoldNotices`: the active holds covering the project or a version in it, as scope, version, matter reference and date. Never the reason, which can be privileged. | `server/services/vault/vault-hold-notice.ts` (new) |
| The Vault read carries `legalHolds`. If the holds cannot be read, it reports `unavailable: legalHolds` and no list, so an unread hold is never read as none. | `server/routes/c2c/project-vault.ts` |
| The document panel shows "On legal hold: MATTER (the whole project / this version, since date). While a hold is in place this document cannot be withdrawn or disposed of." If the holds could not be read, it says so. Every reader sees it. | `client/src/concept2cure/v2/surfaces/VaultHoldNotice.tsx` (new), `Vault.tsx` |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | On HEAD, as a viewer on real PostgreSQL: the Vault read carries no holds. |
| `02-green.txt` | <ul><li>**The notice suite:** 2 of 2. A viewer sees a project hold and a document hold, each with reference and date. The response carries no reason. A lifted hold, another project's and another organization's are not listed.</li><li>**The Vault-read and hold dbtests:** 87 of 87.</li><li>**Client:** 4 of 4.</li><li>**Route, Vault service and client suites:** 2,770 of 2,770 across 191 files.</li><li>**Type check:** `tsc` exits 0.</li></ul> |
| `03-mutation.txt` | Four mutations, each caught: <ul><li>lifted holds listed;</li><li>the reason leaked;</li><li>a project hold covering only its named version;</li><li>an unread hold shown as none.</li></ul> |

## Decisions recorded here

- **Every reader sees the hold; only the hold authorities see why.** A custodian must know a document is preserved. The matter's reason can be privileged, and the register shows it to the roles that place and lift holds. This is the practice in litigation-hold management: notify the custodian of the hold, and keep the matter detail with counsel.
- **A document hold covers the version it names, as the engine and the sweep take it to.** A hold on version 1 does not, by itself, cover version 2. To hold a whole document, or a whole study, place a project hold, or a hold on each version. Widening a document hold to its family is a rule change for the retention sweep and the disposition engine together, not for the notice alone.
- **Not every refusal is listed beside the notice.** It says withdrawal and disposal are blocked, which the disposition engine and the retention sweep enforce. A restore adds a new version and alters none, so a hold does not stop it.

## Not done here

Stage 5 steps 3 (activating withdrawal, which needs the owner's staging acceptance) and 6 (check-out, a founder decision).

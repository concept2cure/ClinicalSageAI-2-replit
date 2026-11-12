# "Place legal hold" is on the record in the Vault, for everyone the server allows

2026-11-12. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1. Completes
`client/src/concept2cure/v2/surfaces/VaultHoldNotice.tsx`.

## The decision

P-125 point 8 (2026-11-11, `docs/LAUNCH_DEFINITION_OF_DONE.md`): "Legal holds are placed where the record is. 'Place
legal hold' belongs on the record in the Vault, for everyone the server already allows. The Vault lane holds that
file; this is handed to it, not done beside it." Inventory rows A28 / D17 / D18 of
`docs/evidence/DESIGN/P-122/inventory/administration.md`: "Vault: shows an active hold but offers no 'Place legal
hold'. Managers may place holds on the server, but the Admin menu entry is for administrators and owners only, so a
manager has no door."

## What already exists

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| The hold routes | `server/routes/vault-legal-holds.ts` (`POST /api/vault/legal-holds`, `POST /:id/lift`, `GET /`) | Place and lift a hold on a project or a document version, for an owner, administrator, manager, approver or platform administrator; the hold and its chained audit row in one transaction | Its rule for who may was private to the file |
| The Vault read | `server/routes/c2c/project-vault.ts` (`GET /api/c2c/project-vault/:id`) | Reports the active holds covering the project or a version (`legalHolds`) | Did not say whether the reader may place one |
| The record's notice | `client/src/concept2cure/v2/surfaces/VaultHoldNotice.tsx` | "On legal hold: reference (scope, since date)" on the record | Offered no way to place a hold |
| Placing and lifting | `client/src/concept2cure/v2/surfaces/LegalHoldsCard.tsx`, in Admin › Settings | The full list, placing on a project or a document, lifting with a reason | Reached only by administrators and owners |
| The launch claim | `shared/constants/ui-surface-registry.ts`: the Vault claims `/api/vault/legal-holds` | The Vault may call the routes in a release | — |

Searches run: `legal-holds`, `legalHolds`, `HOLD_AUTHORITY`, `AUDIT_READER_ROLES`, `VaultHoldNotice`,
`LegalHoldsCard`, `canGovernedWrite`.

## What changed

- `server/routes/vault-legal-holds.ts`: the rule for who may place or lift a hold is one exported function,
  `mayManageLegalHolds`. The routes refuse by it, as before.
- `server/routes/c2c/project-vault.ts`: the Vault read reports `mayPlaceLegalHold` from that function. No second
  list of roles exists on either side.
- `client/src/concept2cure/v2/surfaces/VaultPlaceHold.tsx` (split out beside the notice): the form for one version,
  on its record. A matter reference and a reason, with the routes' own bounds; nothing is sent without both. It
  posts to the same governed route. The record says the hold is placed only when the server's answer names an
  active hold on this version; otherwise it says the hold is not confirmed. A refusal says what the server said and
  keeps what was typed. The Vault is read again, so the notice shows the hold.
- `client/src/concept2cure/v2/surfaces/Vault.tsx`: the record offers it under the hold notice when the read says
  this reader may. A reader the server does not allow, or an older server that does not say, is offered nothing.
- `VaultHoldNotice.tsx`: the notice said holds "are placed and lifted in Admin, Settings". It now says a hold is
  lifted there, which is still true.

Admin › Settings keeps placing, lifting and the list. Nothing is removed (P-122).

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The client suite against the record as it stood: 3 of 5 fail. The server suite could not load: the routes exported no rule |
| `02-green.txt` | `vaultPlaceHold.test.tsx` 5 of 5 and `vaultHoldNotice.test.tsx`; `project-vault-legal-hold-authority.test.ts` 11 cases (owner, administrator, manager and approver may; member, viewer and editor may not; a role among the session's roles; a platform administrator; no user) with `vault-legal-holds.test.ts` unchanged, 23 in all |
| `03-running-app.txt` | In the running app on PostgreSQL: a hold placed from a record; the notice then names it on that version and on no other document; the database holds the hold and its chained `vault.legal_hold.placed` row |
| `04-form-1440.png`, `05-placed-1440.png` | The form, and the record after |

Every Vault client suite after both of today's changes: 71 files, 796 cases.

## Not done here

- **Lifting a hold stays in Admin › Settings.** The record's notice carries a hold's reference and date, never its
  id or reason, and a manager still has no door to Settings. Lifting from the record needs the notice to carry the
  hold's id; that, and the manager's door, are with the administration lane's restoration order.
- **A project-wide hold** is placed in Admin › Settings, where the project is chosen.
- Walked as an administrator. A manager placing a hold is covered by the server suite, not by a walk: the local
  database has one account.

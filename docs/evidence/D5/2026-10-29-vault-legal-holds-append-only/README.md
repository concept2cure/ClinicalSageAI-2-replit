# D5: a legal hold is placed once and lifted once (MR-08 Stage 5 step 4, 2026-10-29)

`docs/work-orders/MR-08-vault-upload-safety-and-document-control.md` Stage 5, steps 1 (the hold half) and 4; CAT1-15.

`vault.legal_holds` records who placed a hold, under what matter and why, and who lifted it and why. Its CHECKs said what a row must hold. Nothing stopped the row being changed afterwards. As the runtime role, in its own tenant (`01-red.txt`):
- a hold's reason was rewritten;
- the hold was deleted;
- a lift was undone, so a released hold read active again;
- a lift rewrote the hold's reason on the way out;
- the table could be truncated.

The retention sweep, the tenant purge and the disposition engine read this table to decide what may be destroyed. A hold whose history can be edited cannot show who held what, when, and on whose authority it was released. That is a spoliation risk.

## What already exists

Searches run: `legal_holds`, `legal-holds`, `LegalHold`, `HOLD_AUTHORITY_ROLES`, `append_only`, `IMMUTABILITY_VIOLATION`, `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS`. Deleted history: nothing under those names.

- **The table** (`migrations/20260906b_vault_legal_holds.sql`) has a scope CHECK, a lift-attribution CHECK and its tenant policy.
- **The only writers** are `server/routes/vault-legal-holds.ts`: an INSERT to place, and one UPDATE to lift, each with a chained audit row. No other code updates or deletes a hold.
- **`ana_record_purger`** holds UPDATE on the table only to take a SHARE lock (`20261014_ana_source_read_receipts.sql`).
- **The pattern this follows** is the record guards on `vault.documents` (VR-06, VR-07): a row trigger with an owner-only DELETE, a TRUNCATE guard, and registration in `server/services/audit/audit-immutability-triggers.ts`, so production refuses to boot without them.
- **The register screen already exists**: `LegalHoldsCard.tsx` in Admin Settings lists, places and lifts holds. Stage 5 step 5's register is done.

## What changed

| Piece | Where |
|---|---|
| `vault.legal_holds_record_guard()`, BEFORE UPDATE OR DELETE. It admits only the one lift: `lifted_at`, `lifted_by` and `lift_reason` going NULL to a value, with every other column unchanged. DELETE is admitted to the table's owner only. | `migrations/20261029b_vault_legal_holds_append_only.sql`, in `C2C_MIGRATION_FILES` right after the table |
| `vault.legal_holds_truncate_guard()`, BEFORE TRUNCATE: refused, even to the owner | the same file |
| Both triggers on the boot list | `audit-immutability-triggers.ts` |
| The grant-ceiling coverage test says why holds keep UPDATE: the lift is one | `server/db/__tests__/provision-app-role-append-only.test.ts` |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | On HEAD, as app_service under RLS: all 6 cases fail. |
| `02-green.txt` | <ul><li>The migration applied twice to each of two databases, the second run a no-op.</li><li>`ci:migration-drop-safety` and `ci:migration-set-order` pass.</li><li>The suite: 6 of 6.</li><li>Every dbtest that reads or writes holds: 95 of 95 across 10 files.</li><li>The boot registry, its PGlite proof, the grant ceiling and the hold routes: 120 of 120.</li></ul> |
| `03-mutation.txt` | Six mutations, each caught: <ul><li>any UPDATE passes;</li><li>a lifted hold can be un-lifted;</li><li>a lift may rewrite the hold;</li><li>anyone may DELETE;</li><li>no TRUNCATE guard;</li><li>off the boot list.</li></ul> |

## Decisions recorded here

- **The lift stays an UPDATE, guarded, not a second row.** A separate lift table would be cleaner append-only. But every reader (the retention sweep, the purge, the disposition engine, compliance reports and the register) asks `lifted_at IS NULL` of this row. The write-once lift keeps them all right with no change.
- **The owner may DELETE, as on `vault.documents`.** No code deletes a hold today. If the tenant purge ever removes a departed tenant's holds, it runs as the owner, and the guard does not need reopening for it.

## Not done here

- **Step 5's on-document notice** is still open. The Vault document panel says nothing when a document is on hold, and the hold list is readable by hold-authority roles only. Next.
- Activating withdrawal (step 3) and check-out (step 6) are founder decisions.

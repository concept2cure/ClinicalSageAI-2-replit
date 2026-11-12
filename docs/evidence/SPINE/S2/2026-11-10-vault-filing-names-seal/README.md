# F1 / LX-10: a sealed document's Vault filing names the seal it rendered

**Package F1 (repairs). Launch rows D5 (§11.70, linking a record to what was signed) and D7 (the filed sequence).**
Session `session_01QoxbLcnW5jPvJSjjKQtvTA`, 2026-11-10, the founder-path lineage lane. This is the seal half of LX-10
in `docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md`.

## What already exists

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| The Vault filing | `server/services/authoring/authoring-file-to-vault.ts` `recordFiling` | Renders the document, admits the bytes to the Vault, and writes one chained row `authoring.document.file_to_vault` plus the export-history row. Since `633822c083` the row names each section's revision | It named no seal. From a Vault version, nothing reached the frozen record its bytes were rendered from |
| The seal | `frozen_documents` (`version`, `frozen_content`, `content_hash`), written by the freeze and the APPROVER signature in `server/routes/authoring.router.ts` | The text that was sealed, with its own SHA-256 | Unchanged |
| The seal check | `server/services/coauthor/coauthor-snapshot.ts` `checkAgainstSeal` | Holds a copy to the document's latest seal: the record matches its own hash, and its sections and title are the ones filed. Used by the filing copy and by the leaf's source evidence | Unchanged, and reused: no second check |
| The filing copy's seal reference | `coauthor_documents.metadata` `sealVersion`, `sealContentHash` | The filing copy names the seal it was taken under | The Vault filing kept no such reference |
| The receipt reader | `server/services/authoring/authoring-vault-filing-receipt.ts` | Verifies the chained row and projects it as the Vault leaf's derivation, which `leaf-source-resolver.ts` and `assemble-from-core.ts` carry into the package's governance record | It had no seal to project |

Nothing new was built. One function beside the seal check, one call in the filing, one helper in the reader, and no
schema change.

## The defect

A sealed document is filed to the Vault and the Vault copy is placed in a sequence. From that leaf, the walk back
found the project and the authoring document, and stopped: neither the Vault row, the chained filing row nor the
export history named the frozen version or its content hash. The filing-copy leaf did reach its seal. So for the
same sealed document, one of its two leaves could be traced to what was signed and the other could not.

## The fix

`coauthor-snapshot.ts` `sealNamedBy`, beside the seal check it uses, and called by `authoring-file-to-vault.ts`
`recordFiling` inside its recording transaction, under its lock on the sections. It reads the document through the
canonical assembler's reader (the one the filing copy uses) and applies the filing copy's own rule for what counts
as sealed (`snapshotStatusFor`):

- **Sealed, and the seal holds:** the chained row and the export history record `sealVersion` and `sealContentHash`,
  the names the filing copy uses.
- **Sealed, and the seal does not hold:** the filing names no seal and records `sealUnverified` with the seal check's
  own code (`SOURCE_NOT_SEALED`, `SOURCE_ALTERED_SINCE_SEAL`, `SOURCE_SEAL_INTEGRITY_FAILED`).
- **A working draft:** neither.

`authoring-vault-filing-receipt.ts` projects the seal onto the derivation (`source.sealedVersion`, or
`source.sealUnverified`). A receipt that names a version without a hash, a hash that is not one, an empty version, or
a seal together with `sealUnverified` is `receipt_malformed`. A receipt recorded before this states neither.

## A decision this does not take

When a sealed document's seal does not hold, the filing is **recorded, not refused**. That follows the rule P-29.2
set for this exit's other finding (`docs/EXIT_ATTESTATION_DECISION_2026-10-18.md`: a fact about the artefact goes on
the artefact's own record). The Vault version's own gates still decide its use: the approval carries only when the
Authoring signatures cover the filed text, and only an approved version is transmitted.

The filing copy refuses in the same three states (409). Whether the Vault filing should refuse too, or print a
notice on page one as it does for a working draft, is **the founder's call**. In production the status and the seal
are written in one transaction, so the state arises only from a legacy record or tampering.

## Evidence

- `01-red-before-fix.txt`: the new cases on trunk's code. 13 fail: 5 on the filing (the row names no seal and no
  reason), 8 on the reader. The two controls pass (a working draft names nothing).
- `02-green-after-fix.txt`: the same two suites, 52 of 52.
- `03-walk-before-baseline.txt`: the founder-path walk, through the product's own routes (freeze, APPROVER signature,
  file to Vault, place, transmit). `file-to-vault/filing-names-sealed-version` and `walk-back/vault-leaf-to-seal`
  pass, and the walk fails because its baseline still lists them.
- `04-walk-after-15-of-15.txt`: the two entries deleted. **Baseline 10 to 8, ceiling 8.** 15 of 15.
- `05-wider-suites.txt`: the suites that file to the Vault, read the receipt, use the seal check or assemble a
  package.

## Not done

- **LX-10's other halves.** The filing does not record a lineage digest (it waits for LX-08), does not list
  signature ids (the carried approval's own row names them), and the Vault id is not in the alias map's store
  vocabulary.
- `tests/db/*.dbtest.ts` (real PostgreSQL) were not run here.
- Not walked in the running app. The change adds fields to a record; no screen reads them yet.
  *2026-11-12:* the Vault's version line reads them, and was used in the running app
  (`docs/evidence/F1/2026-11-12-ui-walk/README.md`, "Screen repairs, the document path").

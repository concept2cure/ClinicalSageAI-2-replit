# F1 (P-92): a caller cannot supply a signed act's record on a new transmittal row

Found by P-99 C2's re-cut (`docs/evidence/RIM/2026-11-08-designs/p99-restore-unrecorded-sequence.design.md`, "Re-cut for
C2", item 3). The coordinating session ruled on 2026-11-09: "A caller who can forge 'by signature' words about their own
package row is a governed-record honesty defect, not a nicety." It is its own commit, red first, ahead of P-99 C2 in the
same push window, so it can be reviewed and reverted on its own.

## What already exists (RULE 3)

- **The transmit guard** (`server/services/submission-gateways/index.ts`) stamps the request's metadata after the
  caller's: `gatewayAccount`, `sentPackage`, `dispatchBinding` and `leafManifest`. For an unbound transmit the last two
  are `undefined`, which JSON drops, so a caller's own keys of those names never reach the row
  (`transmit-records-what-was-sent.test.ts`).
- **P-92's records on a transmittal row**, each written later by its own act and nowhere else:
  - `heldSendSettlement`, by the settlement (`fda-esg-receipts.ts` `markHeldSendSettled`), and its `reopenedBy` by
    C3's re-open;
  - `technicalRejection`, by C4's act (`filed-sequence-rejection.ts` `markSequenceTechnicalRejection`) and, for
    package transmittals written before 2026-10-17, by the package spine;
  - `as2Receipt` and `as2ReceiptHistory`, by the receipt path (`ingestFdaAs2Receipt`, `keepContradictingReceipt`) and
    the FDA adapter's own MDN capture.
- **Where they are said:** both transmission lists (`gatewayLabels.ts` `heldSendSettlementWords`,
  `technicalRejectionWords`) say each in words, "… by signature", for any row that carries it.
- **The FDA adapter** already resets `as2Receipt` and `as2ReceiptHistory` on its own row insert (`fda-esg.ts:341`).
  The other gateways do not, and nothing dropped `heldSendSettlement` or `technicalRejection`.
- **The governed HTTP transmit** (`POST /api/mdx/gateways/:region/:gateway/transmit`) passes a caller's metadata to the
  row. No server code hands any of these four keys to a transmit: every writer is an `UPDATE` of an existing row
  (searched: every file naming them, and every spread of a row's metadata in the gateway, submission-service and route
  code; none).

**What a caller could do before this:** a person with transmit authority could send a package with metadata
`{ heldSendSettlement: … }` or `{ technicalRejection: … }`, and both lists would then say "released as not received …
by signature" or "rejected by FDA on its Ack3, by signature" about that row, with no signature behind it. The acts
themselves were not reachable this way: each reads only a row bound by `dispatchBinding`, which the guard stamps. The
words were.

## The change

- `index.ts`: the guard also stamps `heldSendSettlement`, `technicalRejection`, `as2Receipt` and `as2ReceiptHistory`
  as `undefined` after the caller's metadata, bound or unbound. Each act still writes its own record later, by
  `UPDATE`, as before.
- `types.ts`: the request's metadata comment names the dropped keys.

## Proof

- **Red first** (`red.txt`): the new case fails on `heldSendSettlement`, the first forged key, which reached the
  stored metadata.
- **Green** (`green.txt`): the guard's suite, 6 of 6.
- **Broad** (`broad.txt`): every submission-gateways suite, the gateway and sent-package routes, and P-92's settlement,
  rejection and re-open suites: 59 files, 754 of 754.
- **Mutations** (`mutations/`, driver `keys-mutations.py` with `cmut2.py`): each key's stamp removed alone; each makes
  the case red, and the file is restored by SHA-256.
- **Typecheck** (`typecheck.txt`): 0, as the baseline.

P-99's own three server-owned keys (`leafManifestDerivation`, `sentRecordStatement`, `restoredBinding`) are stamped by
P-99 C2, with its T9.

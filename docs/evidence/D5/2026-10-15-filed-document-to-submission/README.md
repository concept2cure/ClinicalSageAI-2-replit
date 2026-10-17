# The filed document reaches "Place into submission" (2026-10-15)

**Row:** D5 (the AnA-draft → Authoring → Vault → Submission Center path). **Lane:** `docs/work-orders/README.md` §0.

## The trace (read-only, every break put to an independent refuter)

Four tracers walked approved Authoring document → Vault → package leaf →
assemble → transmit, and each claimed break was given to a verifier told to
refute it. What survived:

**A working path exists, and it is the Submission Center sequence path.**
Vault detail pane "Place into submission…" (`surfaces/Vault.tsx`) →
`VaultPlaceIntoSubmission` → `PUT /api/submissions/sequences/:seqId/leaves`
(`server/routes/submissions.ts`) → `upsertLeaf` (a `vault_documents` leaf,
content hash pinned) → assemble from the stored bytes
(`server/services/ectd/assemble-from-core.ts`, `leaf-source-resolver.ts`, with
the VR-14 approved-and-current gate) → freeze / dispatch / transmit.

Confirmed breaks:

1. **The handoff from filing to placement.** File to Vault's "Open in Vault"
   landed on the Vault's first node; the filed record, which carries "Place
   into submission…", had to be found by hand. **Fixed here.**
2. **No word on format or order.** A Word copy can never become a leaf (the
   placement dialog and the resolver both refuse non-PDF), and placement does
   not check approval (freeze/dispatch/transmit do). The dialog said neither.
   **Fixed here.**
3. **Two packaging-and-transmit spines.** The `submission-ops` package path
   (`POST /api/submission-ops/packages/:id/assemble` → `executeGovernedTransmit`)
   has no way to take a Vault document, no client way to add content, and
   re-renders artifact markdown with PDFKit, so what it ships is not the bytes an
   approval is bound to. **Not changed: an architecture decision** (on the board).
4. **`POST /api/authoring/docs/:docId/send-to-packager` is dead.** No client
   calls it; its second hop posts to `/api/regulatory/ectd/:seqId/leaf`, which
   no router serves. **Not deleted here:** `authoring.router.ts` is inside
   another change's 24-hour window. Its reachable replacements are the Vault's
   `VaultPlaceIntoSubmission` and Authoring's `AuthoringPlaceIntoFiling`.

## What changed

- `client/src/concept2cure/v2/vaultTarget.ts` (new): a one-shot "open the Vault
  on this document" channel, like the editor's target. A target for another
  project is reported, never applied; navigation refused while a program switch
  is held clears it (`DocumentAuthoring.tsx` `guardedNav`).
- `FileToVaultDialog.tsx`: "Open in Vault" names the filed document. The next
  step is stated in the order the path enforces: Word copy → file again as PDF;
  PDF not approved → approve first (placement allowed, freeze/transmit not);
  PDF approved → "Place into submission…" on its record.
- `Vault.tsx`: on mount, takes the target and opens on that row (folder, list,
  detail pane, placement action). A target the tree does not hold, or one for
  another project, is said in a status note; the missing note retires itself
  when a re-read holds the document.

## Verified by making it fail

- With the Vault intake and the dialog handoff removed, **4 of the new tests
  went red** (the open-on-row case, the other-project case, the not-held case,
  and the dialog naming the target). Restored → green.
- With the approval condition removed from the next step, **the
  approve-first test went red**. Restored → green.
- Control case kept: with no target the Vault still opens on its first node.

Tests: `vaultOpensOnFiledDocument.test.tsx` (5), `workbenchFileToVault.test.tsx`
(+3), `documentCanvasPolish.test.tsx` unchanged: 29/29. The Vault and Authoring
client suites: 381 run, 1 failure, `workbenchProjectFiles` "Cite in this
section", which fails identically on trunk without this change (handed to the
trunk-green lane).

## Reviewed

Three lenses (correctness, honest state and microcopy, Part 11). Five should-fix
findings, all applied: approval-ordered next step, held navigation clearing the
target, other-project said rather than dropped, accurate not-found advice, a
self-retiring not-found note. Checked sound: StrictMode keeps the first
initializer result; the Vault remounts per project; a just-filed document is
always inside the uploads window; no governed act is added and placement keeps
its reason and approval readout.

## Gates

`typecheck:fast` exit 0; eslint 0 errors, no new warnings (Vault.tsx's four are
unchanged from trunk).

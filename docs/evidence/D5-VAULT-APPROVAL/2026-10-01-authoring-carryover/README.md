# FD5 (c): a sealed Authoring approval carries to its Vault copy

**Date:** 2026-10-01 · **Rows:** D5 (Vault records), D7 (only approved documents are transmitted) · **Lane:** `docs/work-orders/README.md`, session `…01471vSKg1KXj3ijXDiyvXGX`

**The founder, 2026-10-01:** *"we want to carry the Authoring approval over automatically"*. This is FD5 option (c) in `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`: nothing is grandfathered, and a sealed Authoring export's approval carries to its Vault copy when that approval is bound to the exported bytes' SHA-256.

## The problem

Since VR-14 (`1b7c179e3`, earlier today), only an approved, current Vault version is transmitted. A document approved in Authoring and filed to the Vault arrived there unreviewed. Someone then had to review and approve it a second time before it could go to FDA.

## Why the binding is made at the filing

The plan's recommendation said (c) needs a binding that did not exist: *"no Authoring signature is bound to the exported PDF's bytes."* That is still true, and it cannot be made true afterwards:

- Each Authoring signature covers `sectionsDigest`, a SHA-256 over the document's sections.
- The export cannot be reproduced byte for byte, so a later check by re-rendering is impossible:
  - the PDF and DOCX carry render-time stamps;
  - the file prints its own signature page.

So the binding is recorded when the file is made, over the rendering in hand:

```
signature ──covers──▶ sections digest D   (stored when it was signed)
rendering ──of──────▶ sections digest D   (computed over the rows actually rendered)
rendering ──is──────▶ SHA-256 A = the Vault version's content_hash
```

When all three hold, the Vault version's lifecycle record goes through the one gate: `authoring → in_review → approved`. It uses the same orchestrator, store, append-only trail and supersession as a Vault approval. One chained `vault.version.approval_carried` row records D, A and both signature ids.

## Linked, never copied

The record's sign-offs name the Authoring signatures as `authoring-sig:<id>`:

- they carry basis `authoring-rendition-sha256` (new in `BINDING_BASIS`) and are bound to A;
- no `electronic_signatures` row is minted and nobody signs again. 21 CFR 11.70 requires that a signature cannot be *"excised, copied, or otherwise transferred"*;
- the Vault reads the printed name and meaning from `authoring_signatures` and shows *"Approval signed in Authoring by …"*;
- the transmit gate reads the record unchanged, and passes it only for bytes with hash A.

## The Vault's policy applies to what carries

Authoring approval asks for no review and no separation of duties: any signer may approve, the author included. Carrying that unconditionally would let authored documents skip FD4 (a), the founder's Vault policy of *review, then approval, by different people*. So an approval carries only when all of these hold:

| Rule | Otherwise, the editor is told |
|---|---|
| The document is APPROVED (FROZEN alone carries nothing) | "It is not approved in Authoring (status: …)." |
| An APPROVER signature covers D | "No Authoring approval signature covers the content that was filed." |
| A REVIEWER signature covers D, signed no later than the approval | "No review signature covers this content in Authoring, and an approval carries only after a review." |
| The reviewer is not the approver | "The approver also signed the review, and a different person reviews before approval." |
| Neither signer is the document's author | "The document's author signed its review or approval, and the Vault requires someone other than the author." |
| Author, reviewer and approver are members of this organization | "… is not a member of this organization on record." |
| The version is current, holds A, and has no record yet | (named) |

When nothing carries, the version files exactly as before. The editor's result says *"Not approved in the Vault: <reason> Review and approve this version in the Vault before it is transmitted."*

**A judgment, stated:** the filer is not a party to the approval. The filer chose a format and a folder, and the system rendered the bytes. The Vault's rule that "the uploader does not approve" exists because an uploader chooses the bytes, so it is not the test here. The record's author for separation of duties (`created_by`) is the document's author. The creation row names the filer as actor.

**Fail closed:** the carry-over runs after the filing commits, on its own transaction. A failure rolls it back whole: the version stays filed and unapproved, and the editor says so. No partial approval is possible.

## Proof (red first, then green)

| Check | Red | Green |
|---|---|---|
| End to end, using the real router, ingest, lifecycle store, append-only guard and chained ledger over PGlite: one carried case and nine refusal cases | `red-carryover-against-trunk.txt`: 10/10 fail with the trunk wiring | `green-carryover.txt`: 10/10 |
| The selection rule (`chooseCarriedSignOffs`) | — | 5/5 in the same file |
| Each guard removed in turn (7 mutations) | `mutations.txt`: every mutation turns a test red. M3 (the reviewer-is-not-the-approver selection) is caught by the unit test; with its identity check also removed (M3b), by the integration test | restored, green |
| The editor and the Vault show it | `red-client-against-trunk.txt`: 4 fail | `green-client.txt`: 18/18 |
| Every test that touches file-to-vault, the lifecycle, the transmit gate, signature persistence, the dialog or the Vault, plus the founder path | — | `green-related.txt`: 73 files, 931 passed |

The carried case asserts all of the following:

- the record is `approved` for A;
- its `created_by` is the author;
- both sign-offs name their Authoring rows, bound to A with `carriedFrom.signedContentHash = D`;
- the trail reads `authoring→in_review`, `in_review→in_review` (the review sign-off), `in_review→approved`, and verifies with hashes recomputed;
- there are no `electronic_signatures` rows;
- `vaultVersionNotTransmittable` returns null for A and "approved for different content" for other bytes;
- the Vault shows both printed names as signed in Authoring.

## Found on the way, fixed

**The founder path was red on trunk.** `b7bf25037` (another session's gateway-accounts change, 18:55) added `organization_gateway_accounts`, which transmit reads before the wire. The founder-path world never created the table, so transmit answered `gateway_not_configured` (correctly, fail closed), and six checks after it failed. The fix is fixture-only: `tests/lineage/founder-path-lineage.pglite.test.ts` adds `migrations/20261001g_organization_gateway_accounts.sql`, and the test is 15/15 again.

The founder path also records this decision. Its document is frozen by the author and approved, but never reviewed. Hop 6 now checks that the approval does not carry and that the filing names "No review signature" as the reason. Hop 6b's Vault approval still follows, now labelled FD5 (c).

## Left open, said plainly

- **Authoring rows are not a Vault version family** (parity-plan critic item 12, the authoring lane's):
  - each filing is a new document with code `authoring-<id>`;
  - so filing one approved document as PDF and as DOCX gives two approved Vault documents, each approved for its own bytes;
  - neither supersedes the other.
- **Authoring approval has no separation of duties of its own.** This change does not add one. It only refuses to carry an approval that lacks it.
- **Not deploy-proven.** Proof is on PGlite, not on a deployed Postgres with RLS on:
  - the carry-over writes through the runtime `db`, in the request's tenant scope, as the Vault's own approval route does;
  - no deployed run exists yet.

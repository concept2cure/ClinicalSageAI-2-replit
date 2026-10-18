# D-29-A — the document digest is comparable with the signatures'

Row **D1** (the governed record), decision **P-29**
(`docs/EXIT_ATTESTATION_DECISION_2026-10-18.md`). Round 16 of the AnA reasoning
lane.

## The defect

`computeDocHash` (`server/services/authoring/authoring-export.ts`) read the
section rows with `ORDER BY order_index` and no tiebreaker, while everything it
is compared against was computed over `order_index, created_at, id`. It has
exactly two consumers, and each one compares it with — or asserts it equals —
the digest the signing ceremony stores:

- `GET /docs/:docId/exports` answers `content_changed_since_last_export` by
  comparing it against the `doc_sha256` on the last export row, and both
  writers of that column (`authoring-file-to-vault.ts:296`,
  `authoring.router.ts:6747`) compute `sectionsDigest` over a read in signing's
  total order;
- the document-delete audit row (`authoring.router.ts:6460`) records it as, in
  its own comment, "the same section digest the signatures store as
  content_hash".

**NOT the signatures themselves** — see `corrections.txt`. `/freeze`,
`/e-sign` and `/sign` each compute `sectionsDigest` over
`lockedSigningContent`'s transaction-client rows in signing's total order, and
none of them calls this function. This lane carried the opposite claim into a
decision document on four reviewers' agreement before reading the line.

`order_index` is `INTEGER DEFAULT 0` with no unique constraint
(`db/migrations/20260725_authoring_document_loop_tables.sql`), and
`placeNewSection` honours a client-supplied index exactly as given
(`server/services/authoring/section-placement.ts`, "the supplied index is
honoured as given"). A tie is therefore reachable from the product, not a
corruption — and over a tie group `ORDER BY order_index` is not a total order.

So for a tied document the export verdict compared two different orders and
could report a change nobody made. That is exactly the harm the route's own
comment warns of — *"a UI that renders the second for the first tells an author
their stale file is current"* — reached from the other side. And the delete
audit row's claim of equivalence with the signature digest was untrue.

## It was the one outlier against the repo's own written contract

`sectionsDigest`: *"Rows are already in the caller's recorded order … exports
and release checks must recompute the identical bytes."*
`fullVisibleAuthoringSnapshot`: *"Rows use signing's total order."*
(both `server/services/authoring/authoring-content-digests.ts`)

Signing's total order is `order_index, created_at, id` — used already by
`lockedSigningContent` (the signing routes' own read, `authoring.router.ts`),
`authoring-file-to-vault.ts`, `server/services/c2c/filing-section-target.ts`
and the QMS controlled-document read, and called "the order every reader of the
document uses" by
`server/services/authoring/__tests__/create-section-placement.pglite.test.ts`.
`computeDocHash` was the only reader that omitted it.

## The change

One read, in `computeDocHash`, now `ORDER BY order_index, created_at, id`.

No migration, no schema change, no new surface. For any document whose
order_index values are already distinct — which is every document the template
seeder and the placement path produce — the hash is unchanged, which the suite's
no-ties control asserts. For a document with a tie, there was no stable hash to
preserve: that is the defect.

## Files

- `red.txt` — the failing assertion before the fix, and an honest note that two
  of the four first-run cases were pins rather than red.
- `mutants.txt` — seven mutants, all killed; the two that survived a first run
  and the two cases added because of them; and a mutation that silently failed
  to apply and was briefly misread as a survivor.
- `trunk-reds.txt` — the two dependent suites that are red on trunk, shown red
  identically with the change stashed.
- `corrections.txt` — two claims this lane carried from the P-29 review, both
  agreed by four of five dimensions, both false at the line: that this digest
  is the signatures' `content_hash`, and that the signing routes read their
  attested hash outside their transaction (D-29-B, withdrawn).

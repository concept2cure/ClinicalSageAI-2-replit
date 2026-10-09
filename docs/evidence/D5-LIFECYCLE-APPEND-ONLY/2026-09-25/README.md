# VR-03 (D5): a governed document's lifecycle record cannot be rewritten

**Row:** D5 (Part 11: §11.10(e) audit trail, §11.70 signature binding).
**Slice:** `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` VR-03.
**Veeva capability:** lifecycle state history and signatures are immutable and
tamper-evident.

## What was wrong

`canonical_documents` carries a governed document from authoring to submitted.
Its `audit` column is the per-document hash-chained trail. Before this change:

1. **The trail was a mutable JSONB column.** Any UPDATE could rewrite an event or
   drop one.
2. **The verifier checked linkage only.** An event edited in place with its
   hashes left alone still read `chainValid: true`.
3. **`POST /:id/sign` overwrote review and approval signatures at any stage.** It
   appended no trail event and wrote no org-wide audit row, so a replaced
   signature left no trace. A review signed during authoring carried into review.
4. **A request for revision (in_review → authoring) kept the review sign-off.**
   The next review round could be approved on the previous round's signature.
5. **Un-placing (placed → approved) re-signed and replaced the approval.**
6. **A transition read, gated and wrote in separate statements with no lock.** Two
   concurrent transitions both passed. Both wrote org-wide audit rows and both
   answered 200, and the per-document trail kept whichever append landed last.

## What changed

- **`migrations/20260925_canonical_documents_append_only.sql`** (on the applier
  after `20260731c`) adds a trigger. It refuses any UPDATE that:
  - shortens or rewrites the trail;
  - replaces or removes an approval;
  - replaces a review sign-off, or clears it anywhere except the revision
    transition;
  - records a signature or stage change without its own event;
  - moves the stage without an event naming it;
  - touches identity, tenant, creation time or source binding;
  - changes the content hash after authoring;
  - changes a withdrawn or superseded document.

  It also refuses DELETE and TRUNCATE for every role. There is no owner
  exemption: on a single-role estate the runtime is the owner (plan critic item 4).
- **`shared/regulatory/document-lifecycle.ts`**:
  - `verifyAuditChain(events, hash)` recomputes every event's hash and reports
    `hashesRecomputed`.
  - `buildSignatureEvent` records a sign-off as its own event at the current
    stage.
- **`canonicalDocumentStore.ts`**:
  - Every write runs under `SELECT … FOR UPDATE`.
  - `persistState` refuses a transition computed from a stage the document is no
    longer at (`STALE_STAGE`).
  - `recordReviewSignature` is write-once per review round, and only during
    review.
  - `recordSignature` is gone.
- **The orchestrator**:
  - Only in_review → approved mints an approval.
  - The revision edge clears the review sign-off. The sign-off stays in the trail
    as its own signed event.
- **`server/routes/document-lifecycle.ts`**:
  - `/sign` and `/advance` each run in one transaction that holds the row lock
    from read to write. They respond only after the commit.
  - A refused sign-off is refused before the credential ceremony (F-27).
  - `/sign` with `approved` is refused as `APPROVAL_IS_RECORDED_BY_ADVANCING`.
    Approving is the transition, which signs. That is the reachable replacement
    (`POST /:id/advance {to:'approved'}`, pinned by the pipeline test "approving
    signs"). The route has no client caller.
  - The review sign-off now reaches the org-wide audit as
    `regulated_document.signed`.
  - `GET /:id` recomputes hashes and returns `chainBrokenAt` and
    `chainHashesRecomputed`.
- **`server/db/pglite-harness.ts`** applies the real guard file after all its DDL,
  and throws if the table exists without both triggers. The first version ran it
  before the table existed: the guard skipped itself, and 13/13 pipeline tests
  passed while measuring nothing. It was caught by probing the catalog.

## Evidence

| File | Shows |
|---|---|
| `01-existing-sign-path-refused-by-guard.txt` | With the guard in the harness and HEAD's route, `/sign` fails. The database refuses the old un-evented `UPDATE … SET review_signature`. |
| `02-race-red-at-head.txt` | Real PostgreSQL 16, HEAD's application code, two concurrent `authoring → in_review`. With the guard disabled (the state before VR-03), **both answer 200**. With the guard alone, the loser is a **500**, and only after its effects ran. The guard catches the fork but cannot stop the effects; the lock does. |
| `03-real-postgres-green.txt` | `tests/db/canonical-documents-append-only.dbtest.ts`, 2/2. One transition is recorded; the other is refused by the gate (409 `ILLEGAL_TRANSITION`) before any effect, with one org-wide audit row. The runtime role, holding DELETE and TRUNCATE, is refused both, and is refused a forged trail. |
| `04-pglite-and-unit-green.txt` | 54/54 across three suites. The trigger suite has a negative control: without the guard, the raw rewrite succeeds. The pipeline covers write-once sign-off, refusal before the ceremony, the review round, and recompute-on-read with a trigger-bypassing edit. The unit suite shows linkage-only reading an edited actor as valid and recompute catching it. |

Also green:

- the 44 suites that use the lifecycle modules or the PGlite harness, 502 tests,
  after `b99f98cf` fixed two suites that were red on trunk from the storage lane's
  `7fd5d6af`;
- `ci:migration-set-order`, `ci:migration-drop-safety`, `ci:migration-reachability`,
  `ci:migration-prefix-collisions`;
- `tsc`.

The real-database suite runs with `TEST_DATABASE_URL` pointing at a disposable
database (`npm run test:db`). Here that was the container's local PostgreSQL 16.

## Not done here

- **The startup trigger-presence list** (`server/services/audit/audit-immutability-triggers.ts`,
  P0-9a) should carry `canonical_documents_guard_row` and
  `canonical_documents_guard_truncate`. That file is the D6 lane's (`…0194UQPx`,
  landed 66 minutes before this), so it is handed over on the board, not edited.
- **`canonicalAuditPayload` does not hash an event's `placement` object.** Hashing
  it now would change every existing event's hash and fail every existing chain
  on recompute. It needs a versioned payload, which is left for the change that
  next touches the event format. The placement column itself is not
  trail-derived.
- **Superuser or owner `DISABLE TRIGGER`** is outside what a trigger can prevent.
  The P0-9 check above is what notices it.
- **Tenant purge (VR-07)** will need a governed delete path. It amends this file
  in place when it does.
- **VR-12** makes `created_by` write-once in this trigger (plan critic item 8) when
  it adds the column.

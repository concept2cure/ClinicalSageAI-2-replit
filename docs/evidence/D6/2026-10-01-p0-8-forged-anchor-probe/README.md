# P0-8 anchor: a newer anchor hides an earlier truncation

Found 2026-10-01 by `…01T2wooC` reviewing `735ba0a74` (P0-8 anchor, DP-04/DP-68,
`…0194UQPx`). This is a finding with a reproduction. Nothing is changed here;
it is handed to that lane in `docs/work-orders/README.md`.

## The gap

`verifyAuditChainAnchor` compares the database with the **latest** anchor only
(`store.latest()`). The module's header names the risk: *"the task role that
writes anchors could write a newer, forged one"*. The header leaves it to
CloudTrail.

It is a working bypass, not only a theoretical one:

- the task role holds `s3:PutObject` on `anchors/`;
- the migrate task runs on the API task definition
  (`terraform/stack/main.tf`), so it has that role **and** the database
  owner's credentials;
- whoever can run it can remove the newest audit rows, then write the next
  anchor over the shorter chain. The sweep then reports the anchor `ok`.

**Reproduced on PostgreSQL 16.13** with the suite's own helpers
(`probe-case.ts.txt`, output in `red-probe-output.txt`):

1. Anchor a chain of four rows.
2. Remove the two newest rows. The anchor reports `broken`, correctly.
3. Write the next anchor, as the task role can.
4. The anchor now reports `ok`: *"every anchored head is present and
   unchanged"*.

## Remedy

A parallel implementation of the same item, discarded before push because
`735ba0a74` landed first, closed this. It is offered for the canonical module.
The patch is kept outside the tree, and the design is short:

1. **Check every anchor, not only the latest.** Take the union of every head
   any anchor names, and check that each is still present and unchanged, or
   that the archive door accounts for it. That costs one statement over the
   distinct heads. An older anchor cannot be removed (Object Lock), so a newer
   forged one can raise an alarm but cannot hide a removal. A cheaper
   equivalent is a per-organisation monotonic check: the newest anchor's head
   must be at or after every earlier anchor's head, and those earlier heads
   must still exist.
2. **Write each key once.** Put with `If-None-Match: *`, and require it in the
   grant (`"s3:if-none-match" = "*"`). Under versioning, a put to an existing
   key adds a new current version. Object Lock keeps the old one but does not
   stop the put, so the store's comment *"put never overwrites in effect"* is
   only true for distinct keys.
3. **Read history, not just the current version.** List versions and delete
   markers under the prefix. Treat a second version, or a delete marker, on an
   anchor as broken. The grant needs `s3:ListBucketVersions` and
   `s3:GetObjectVersion`, and no `s3:DeleteObject`.

## The parallel implementation, kept for reference

`parallel-implementation.patch` is the whole discarded commit, kept here so
nothing of it lives outside this branch. It is reference material for porting
the three remedies above into the canonical `chain-anchor.ts`. **It is not to
be applied as is**: it adds a second anchor module, which is the duplication
the item avoided.

The patch contains:

- `server/services/audit/chain-anchor.ts`: every anchor's heads, write-once
  puts, version and delete-marker reads;
- the sweep's `audit_logs.anchor` store;
- `terraform/modules/audit-anchor-access`: a grant with `s3:if-none-match`
  required, its module test, and six Terraform mutations;
- its dbtest (8 cases) and unit tests (31);
- its evidence.

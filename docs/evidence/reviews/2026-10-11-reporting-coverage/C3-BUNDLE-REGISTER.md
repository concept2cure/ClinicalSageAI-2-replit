# C-3 — the bundle register's silent cap, closed; the table, still open

The review recorded:

> A bundle has **no `report_bundles` table**. It is stored as one
> `project_memory_entries` row *per covered project*, `JSON.stringify`'d and
> **truncated at 20,000 characters**.

Two of those three claims hold. The third does not, and the finding also missed
the defect that was actually losing data.

## What is true

- **No `report_bundles` table.** Confirmed: nothing in `shared/schema*`,
  `db/migrations/`, `migrations/` or `C2C_MIGRATION_FILES` defines one.
- **One row per covered project.** `persistBundleRecord` loops
  `for (const projectId of projectIds)` and writes the same `content` under each
  one, deduped on read by `dedupeByLatest`. A three-project pack is stored three
  times.

## What is not

**Bundles are not truncated.** The `.slice(0, 20000)` is in
`storeProjectMemory` — the *delivery capture* path — not in
`persistBundleRecord`, which writes `content` whole behind an explicit guard:

```ts
if (Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024) {
  throw new ReportBundleError('This pack exceeds the 2 MiB saved manifest limit. …nothing was saved.',
                              'REPORT_BUNDLE_TOO_LARGE', 413);
}
```

A refusal that says nothing was saved, rather than a silent truncation — which
is what the repo's own rule requires. The existing route test is named *"
roundtrips more than 20,000 characters with one intact copy per project and a
bound audit event"* and asserts `stored[0].length` is over 20,000 with both
copies byte-identical. The claim was already disproved by a passing test.

An adjacent fail-silent in the same area was also already fixed before this
pass: a pack whose runs covered no project wrote zero rows while still
answering 201 and writing its audit row — created, recorded, and gone. The
route now refuses with 422 and says why, and the comment above the guard records
the history.

## What the finding missed, and this change fixes

`loadBundlesForOrg` read **`.limit(1000)`** and deduped afterwards. The unit is
as wrong as the number: the scan counts **rows** while the register counts
**bundles**, and a bundle is one row per covered project. So 1000 rows is 1000
packs only when every pack covers exactly one project, and about 333 when they
cover three — an unpredictable number of packs, with the oldest missing, under a
list presented as the register. The same silent cap as the run-history window
(C-1), the capped portfolio rollup (C-12) and the task board's
`teamProductivity` (C-8).

Closed as those were:

- `loadBundleRegister` counts the distinct bundles with
  `count(distinct title)` **in SQL**, not from the rows the scan returned — a
  total derived from a truncated scan agrees with it by construction and could
  never reveal the truncation.
- The row bound stays (an unbounded register read is how one organisation's
  history becomes everyone's latency) at a named `BUNDLE_ROW_SCAN = 5000`, and
  `truncated` is `decoded < registerTotal`.
- `desc(id)` joins the ordering. Every row of one pack is written in a single
  transaction, so a multi-project pack's rows share a `created_at` to the
  microsecond; without the tiebreaker the rows that fall off the scan could
  differ between two identical reads.
- `GET /bundles` sends `meta: { truncated, registerTotal }` **only when
  truncated**, and the panel renders one sentence. `registerTotal` is counted
  before the per-project read check, so the sentence deliberately does not offer
  it as "how many you may see" — it says the register holds more than are shown
  **and** that some packs may sit outside the reader's projects. Claiming a
  number the reader is not entitled to would be a different dishonesty.

Revert-proven on both sides. Server, with `truncated` forced false:

```
× says the register holds more packs than it read, and only when it does
  → expected undefined to deeply equal { truncated: true, registerTotal: 3 }
```

Client, with `bundleRegisterCaveat` forced to null: 4 of 6 fail, including both
that assert the sentence reaches the DOM, while the two that must stay silent
on a complete read still pass.

The three existing route tests that queue a fixture select-stack needed the
count row queued ahead of the rows query — a fixture change to match the real
query order, with every original assertion kept, plus a new one that a complete
read carries no `meta` at all.

## Still open: the table

Storing a governed register in `project_memory_entries` remains wrong, and the
reasons are worth writing down before anyone starts:

1. **The record is duplicated N times** and reconciled in JavaScript
   (`dedupeByLatest`). Two copies that disagree are indistinguishable from one
   copy, and the register would not notice.
2. **The register's shape is a `title` convention** (`bundle:<uuid>`) over a
   free-text column, so "list the packs" is `count(distinct title)` rather than
   `count(*)` on a table of packs.
3. **A pack cannot be found by run.** `runIds` lives inside a JSON string, so
   "which packs contain this run?" is a scan.

The shape, under CLAUDE.md Rule 1: `report_bundles` and `report_bundle_runs`
(and a `report_bundle_projects` link in place of the row-per-project copies), in
`public`, each with `organization_id INTEGER NOT NULL`, inserted into
`C2C_MIGRATION_FILES` **before the final sweep pair** so
`ci:migration-set-order` passes and the tenant sweep policies them. The
`project_memory_entries` path must be migrated onto it and deleted in the same
change — a parallel path is what the working agreement forbids — which means a
backfill that reads the existing rows, and that is the part needing the same
care D-2 got: it writes to a deployed database, and every file in the set
re-runs on every deploy.

That is a change of its own, not a tail end of this one. The silent cap is the
part that was losing information on every read, and it is closed.

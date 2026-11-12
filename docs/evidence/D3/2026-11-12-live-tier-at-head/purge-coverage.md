# D3: an erased tenant kept its support messages. `ci:purge-coverage` on a from-blank database, 2026-11-12

**Row:** D3 (tenant isolation proven); the purge itself is D6's. **Package:** L1. **Base:** `592233d61`.
**Session:** `session_01UrPzGsENAo1PbcH1GQGRvX`. Same lane and day as `README.md` in this directory.

`ci:purge-coverage` is the one tenant gate that needs a provisioned database, so it runs only in CI's blank-database
job (`.github/workflows/ci.yml:2081`), not in the pre-push hook. With a database built from empty for the tier
(`README.md`), it was run here too. It failed.

## What already exists

Searched before changing anything (RULE 3): `rate_limit_counters`, `support_ticket_messages`, `support_tickets`,
`PURGE_CHILD_TABLES`, `purge-coverage`, across `server/`, `scripts/`, `migrations/`, `db/migrations/`, `tests/`,
`docs/reports/` and the coordination file.

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| The purge's list | `server/services/tenant/tenant-offboarding.ts` (`PURGE_CHILD_TABLES`) | The tables a tenant purge deletes from, in order, in one transaction. | Named neither table. |
| The gate | `scripts/ci/check-purge-coverage.mjs` with `docs/reports/purge-coverage-baseline.json` | Reads the live catalog and fails on an org-keyed table the purge cannot reach that the baseline does not already list. A ratchet: the residue may shrink, never grow. | Nothing wrong. It ran nowhere that had these two commits. |
| The export | `server/services/tenant-export/tenant-full-export.service.ts` (`discoverTenantTables`) | Catalog-driven: every table with a tenant key is returned. So both tables were already exported (P-58), and neither is in `EXPORT_EXCLUDED_TABLES`. | — |
| The precedent | the list's own comments at `session_activity` (2026-10-05) and `citation_chains` (2026-10-13) | Both were found by this gate on the blank-database job and listed as leaves. `session_activity` is the same case as `rate_limit_counters`: the estate's organisation-0 rows are not a tenant's. | — |
| The support tables | `migrations/0007_support_admin.sql`, amended in place by `ee78e60639` (P-127, package S13, 05:20 UTC) | `support_ticket_messages` gains `organization_id INTEGER NOT NULL` and a same-organisation key to its ticket, so the tenant policy reaches it. A real isolation fix. | From that commit the table is org-keyed, and the purge did not reach it. |
| The limiter's table | `migrations/20261112b_rate_limit_counters.sql`, new in `08bf12033d` (P-129, 18:44 UTC) | Rate-limit hits shared across server processes; every row written as organisation 0. | Not in the purge's list. |
| The purge's real-database suite | `tests/db/tenant-purge.dbtest.ts` | 13 cases: one transaction, legal hold, export receipt, Vault bytes. One runs "the route's own connection: the runtime role in the platform scope". | No case ran the real list for these tables. |

No second list, gate or door was written. Two entries join the existing list; one case joins the existing suite.

## What the gate reported

`red/N-purge-coverage-from-blank-at-592233d61.txt`, exit 1:

```
❌ purge-coverage: NEW org-keyed table(s) a tenant purge cannot reach:
  - rate_limit_counters
  - support_ticket_messages
```

The gate's first instruction is to confirm the table exists on a current schema (this lane wrote that instruction on
2026-10-18, after a stale local schema produced a false finding). This database was created empty minutes earlier and
built by `install-fresh` then `deploy-migrate` at `592233d61`, both exit 0. So both tables are real.

**Nobody had seen it.** The newest completed CI runs are for commits of 2026-11-10. The CI-throughput lane's
real-database run was at `21c6837180` (05:09 UTC), before either commit: `support_ticket_messages` had no
`organization_id` in that tree. And until `dfa9927bc` no database could be built from empty at all
(`provisioning-from-blank.md`), so the job this gate runs in could not have reached it.

## What it means

- **`support_ticket_messages`: real residue.** The messages are what a tenant's people wrote in their support
  requests. A tenant that was erased kept all of them.
- **`rate_limit_counters`: no tenant content today.** `checkSharedRateLimit` writes organisation 0 only. The entry is
  there so that a row ever written under a tenant's id does not outlive the tenant, which is the reason
  `session_activity` is listed.

Catalog facts, read from the from-blank database before listing either (FK-safe order is the gate's condition):

| | `support_ticket_messages` | `rate_limit_counters` |
|---|---|---|
| Foreign keys naming it | none | none |
| Foreign keys out of it | `(ticket_id, organization_id)` → `support_tickets`, ON DELETE CASCADE | none |
| Triggers | none | none |
| Row security | enabled and forced; `tenant_isolation_policy` | the same |
| `app_service` | SELECT, INSERT, UPDATE, DELETE | the same |

Both are leaves, so their position in the list is free.

## The change

`PURGE_CHILD_TABLES` gains `support_ticket_messages` and `rate_limit_counters`, at the end, with a dated comment that
says what each is and why it is listed. Nothing else in the service changes. The baseline file is not rewritten:
neither table was ever in it.

## Proof, each shown failing first

| Stage | Result | File |
|---|---|---|
| The gate, from-blank database at `592233d61` | **exit 1**, the two tables | `red/N-purge-coverage-from-blank-at-592233d61.txt` |
| The gate, same database, after | exit 0: "450 org-keyed tables outside the purge reach (baseline 468, new 0, 18 now covered)" | `green/P-purge-coverage-after.txt` |
| The purge's suite, after | 14 of 14 | `green/O-purge-suite-after.txt` |
| M2: the two entries taken out of the list again | **exit 1**: the new case fails ("both of the tenant's messages, the internal note included: expected undefined to be 2"), the other 13 pass | `red/M2-purge-suite-list-without-the-entries.txt` |
| The gate's selftest | 59 of 59 | `green/Q-purge-coverage-selftest.txt` |
| `tenant-offboarding.test.ts`, `tenant-purge-referrers.test.ts`, `tenant-export-covers-purge.contract.test.ts` | 64 of 64 | run after the change; not filed |

The new case (`the purge reaches the tables that became org-keyed on 2026-11-12`) passes no `childTables`, so it runs
the real list, on the runtime pool as `app_service` in the platform scope, which is how the route runs a purge. It
seeds two tenants with a support request each (a reply and an internal note), one limiter row under the tenant's id
and one under organisation 0. After the purge of the first tenant: its two messages and its limiter row are gone; the
other tenant's two messages and the organisation-0 row are still there.

M2 is the control: it shows the two entries are what erase the rows, and that the case fails when they are absent.

## Not done, and handed on

- **`support_tickets` is still not purged.** It has been in the gate's baseline since 2026-10-29, one of 468 tables
  the purge does not yet reach. So after a purge the tenant's ticket rows (subject, description) remain and its
  messages do not. Listing the ticket would be one line, and the cascade would take the messages with it. It was not
  done here because it decides what happens to a record the baseline deliberately froze, and no decision about support
  records was found in `docs/design/HELP_AND_SUPPORT_2026-11-10.md` or under P-127. **For S13 and the D6 offboarding
  owner.**
- **The export returns internal notes.** The export is catalog-driven, so a tenant's export carries every
  `support_ticket_messages` row with its organisation id, `is_internal = true` included, and
  `support_tickets.internal_notes`. `/api/support` never shows a tenant an internal note. Nothing writes one today
  (the route writes `is_internal = false` only), so this is a question to settle before a staff console writes them,
  not a leak that has happened. **For S13.**
- **"18 now covered".** The gate reports 18 baseline tables that the purge now reaches and suggests
  `--write-baseline` to lock the gain in. That was true before this change and is not this change's; the baseline was
  not rewritten here.
- **No hosted run.** Local PostgreSQL 16.15, as `README.md` states. CI's blank-database job has not reached this
  commit.

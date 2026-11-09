# A GxP manufacturing record could be edited with no audit row at all

**Row:** D4 (CMC / Module 3 governed acts) · **Package:** S7 · **Date:** 2026-11-09

`PUT /api/cmc/batch-records/:id` wrote a batch record — a manufacturing record under 21 CFR 211.188 —
with a bare `pool.query`. No transaction, and **no audit row**. The only trace was a `console.log`.

It was the only one of the nineteen CMC register edits with no trail, and its own **create** has gone
through `createOnConnection` since the register-audit work. The edit was simply left behind.

## What already exists

| Path | What it does today |
|---|---|
| `server/services/cmc/register-edit-audit.ts` | `updateRegisterRow` (Drizzle) and **`updateOnConnection`** — "the raw-SQL path, for the registers whose edit is an `UPDATE … RETURNING` in its route: same contract, one pinned connection". The field-by-field diff and the chained audit row commit with the write |
| `server/services/cmc/register-audit.ts` | `createOnConnection`, which the batch **create** already uses, and the header explaining why the audit row cannot simply follow the write |
| `server/api/cmc/routes.ts` | The comparability register, the one existing caller of `updateOnConnection`, with the note on why the diff is taken inside the transaction |
| `server/api/cmc/specificationRoutes.ts` | Audited by its own door: `inRefusableTransaction` + `writeChainedAuditRow` |
| `server/services/cmc/contradiction-lifecycle.ts` | `resolveContradiction`, audited inside the service |
| `scripts/ci/lib/strip-comments.mjs` | The shared, string-aware comment stripper the CI gates use |

Nothing new. The door existed, with one caller and a comment explaining itself; the batch edit did not
take it.

## Proved live, both ways

`01-no-trail.txt`, against the running app on a real batch record (`C2C101-DS-2412`):

| | response | audit rows for that record |
|---|---|---|
| **pre-fix**, changing the **batch number** and the site | `success: true` | 2 → **2** |
| **post-fix**, changing the site | `success: true` | 1 → **2** |

The post-fix row carries what §11.10(e) asks for: `action cmc.register.update`, the actor from the
session (not the body), the table and record id, the reason for change, a SHA-256 chain value, and the
diff — `{"manufacturing_site":{"from":null,"to":"Building 4, Cambridge MA (fictional)"}}`.

**What the gap looks like to an inspector.** After the pre-fix edit I reverted the batch number through
the (now fixed) API. That restoring row reads:

```
{"batch_number":{"from":"C2C101-DS-2412-R2","to":"C2C101-DS-2412"}}
```

`C2C101-DS-2412-R2` is a value **no row in the trail ever records the record arriving at**. The trail
names a `from` that came from nowhere. That is the harm, not an abstraction about it.

## The change

| Path | Change |
|---|---|
| `server/api/cmc/batchRecordRoutes.ts` | The edit goes through `updateOnConnection` with `register: 'batch_record'`: the stored row re-read `FOR UPDATE`, the `UPDATE … RETURNING`, and the audit row on one pinned connection and one transaction. The existence SELECT stays **outside** — it is the signed-state check (`batchWriteRefusal`), which must refuse before a transaction opens — and the diff is taken against the row read **inside**, because a diff against the outer read would name a `from` another writer had already replaced (the comparability register's own note) |
| same | `updateBatchSchema` accepts `reason`, recorded on the audit row beside the diff. It is deliberately absent from `BATCH_EDITABLE_COLUMNS`, so it is not a column on the batch |
| same | The inline `SET`-clause loop extracted to `batchSetClause` + `BATCH_EDITABLE_COLUMNS`. Not decoration: the handler crossed `max-lines-per-function` at 103, and the rule is to extract rather than baseline. Net **−1** eslint warning on the file |

## The instrument

`register-edit-is-audited.contract.test.ts`: every `router.put` / `router.patch` in `server/api/cmc/**`
must name an audited door, or delegate to a service declared in `DELEGATES` — and that service is then
**read**, so a declared delegate that stopped auditing fails too. 22 cases.

Two things it taught me while being written, both recorded because they are the point of writing it:

1. **It found a second handler** — `PATCH /contradictions/:id/resolve` — which I then **refuted**:
   `resolveContradiction` does write a chained audit row, in its service. My first version checked only
   the handler body, one level too shallow. Hence `DELEGATES`, which verifies the delegation instead of
   excusing it.
2. **Prose about a door satisfied it.** The mutation below passed the general case at first, because the
   comment explaining *why* `updateOnConnection` is the right door still contains the word. So the test
   strips comments with the shared gate stripper. `check-commonjs-require` already carries the lesson's
   other half — "a gate that flags its own documentation trains people to ignore it" — and a gate
   *satisfied* by its own documentation is worse.

## Verified by making the check fail

`02-contract-mutation.txt`: the edit put back to `const updatedBatch = (await pool.query(updateQuery,
values)).rows[0]` — the line that shipped. Two cases fail, the general one and the named one.

## Green

- `server/api/cmc/__tests__/register-edit-is-audited.contract.test.ts` — 22 passed (new)
- `eslint` — 0 errors; `batchRecordRoutes.ts` at 5 warnings against 6 at HEAD

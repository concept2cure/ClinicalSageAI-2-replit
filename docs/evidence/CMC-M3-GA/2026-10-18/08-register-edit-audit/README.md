# The half of §11.10(e) an inspector reads for a changed record

URS-CMC-021 put a chained audit row on every CMC register **create**. Every
register **edit** was a bare `db.update(...)` or `pool.query('UPDATE …')` with
no audit row and no middleware supplying one. So the register layer recorded
who entered a value and not who changed it.

21 CFR 11.10(e) asks for

> secure, computer-generated, time-stamped audit trails to independently record
> the date and time of operator entries and actions that create, modify, or
> delete electronic records … Record changes shall not obscure previously
> recorded information.

"Modify … shall not obscure previously recorded information" is the clause this
slice answers. An audit trail that holds only creates tells an inspector that a
record exists; it cannot tell them that a specification limit was widened last
Tuesday, by whom, or what it said before.

---

## What the live database said before the change

A row whose `updated_at` is later than its `created_at` was changed after it was
entered. On this deployment, across the seven CMC registers:

| Register | Rows showing an edit | Edits on the ledger |
|---|---:|---:|
| `qc_testing` | 87 | 0 |
| `stability_studies` | 70 | 2 |
| `cmc_batch_records` | 24 | 0 |
| `analytical_methods` | 23 | 3 |
| `cmc_comparability_assessments` | 14 | 2 |
| `drug_substances` | 4 | 2 |
| `cmc_change_control` | 1 | 1 |

223 edits. Ten on the ledger — and all ten were written by the probe in this
directory, minutes before the table was taken. The other 213 are every register
edit in this database's recorded history before today, and the platform cannot
say who made any of them.

(`cmc_batch_records` has no ordinary PUT route; its 24 edits come from the
governed release ceremony, which writes its own signature row. The gap there is
narrower than the count suggests. The other 189 are plain register edits.)

---

## The change

`server/services/cmc/register-edit-audit.ts` — the edit-side writer, in the
shape the create side already had:

- **`updateRegisterRow(...)`** for the fifteen Drizzle PUTs. Inside one
  transaction: `SELECT … FOR UPDATE` the before-row, apply the patch with
  `RETURNING *`, diff the two, and write the audit row on **that same
  transaction** through `queryableFromDrizzle(tx)`.
- **`updateOnConnection(...)`** for the comparability PUT, which is raw SQL on a
  pooled client. Same contract, same transaction.
- **`diffRows(before, after)`** compares by JSON shape rather than `===`,
  because a `json` column never compares equal to itself across two reads;
  scrubs `Date`s to ISO so a timestamp diff is readable; and skips
  `updatedAt`/`updated_at`, which move on every write and would make every row
  look changed.

The audit row must share the content write's transaction because
`writeChainedAuditRow` takes a per-tenant advisory lock and sets a
transaction-local GUC that the `audit_logs` BEFORE INSERT trigger reads to seal
the chain. An audit write on a second connection breaks the seal.

Because `old_values` is hard-coded `NULL` for every caller in this codebase
(open defect DP-13), the before-state goes in `details` → `new_values`, as
`{changed: {field: {from, to}}, changedFields: [...]}`. An inspector reading one
row sees both values without joining anything.

**An edit that moves nothing writes no row.** §11.10(e) asks for changes to be
recorded; a ledger that also holds every no-op PUT buries the changes in noise.

## Shown working, on the running product

`probe-edit-audit.sh` — one create and one edit per register through the
product's own HTTP routes, then the ledger read back through
`GET /api/audit-trail/ledger`:

```
analytical-method        create ok  edit 200
stability-study          create ok  edit 200
drug-substance           create ok  edit 200
change-control           create ok  edit 200
comparability            create ok  edit 200

  analytical_methods:109            Cmc Register Create, Cmc Register Update
  cmc_change_control:1              Cmc Register Create, Cmc Register Update
  cmc_comparability_assessments:1c… Cmc Register Create, Cmc Register Update
  drug_substances:144               Cmc Register Create, Cmc Register Update
  stability_studies:243             Cmc Register Create, Cmc Register Update

  chain verified: True
```

and what one of those rows holds:

```json
{"register":"change_control","projectId":"45e2b787-…","recordId":1,
 "changed":{"regulatoryFiling":{"from":null,"to":"CBE-30"},
            "status":{"from":"draft","to":"under-review"}},
 "changedFields":["regulatoryFiling","status"]}
```

Full capture, both halves, in `before-after.txt`.

## Shown failing first

`server/services/cmc/__tests__/register-edit-audit.test.ts` (11 cases) covers
`diffRows`, which is where the whole slice can be wrong quietly. The gate was
shown failing before it was reported working: `diffRows` was replaced with the
naive implementation a careful reading would have produced — strict `===`, no
`updated_at` skip, no `Date` scrub — and five of the eleven cases failed:

```
FAIL  does not report a json column that is equal but not identical
      expected { ichQ2Parameters: { …(2) } } to deeply equal {}
FAIL  does not report a Date that is the same instant
      expected { validationDate: { …(2) } } to deeply equal {}
FAIL  records a Date as its instant, not as an object
      expected { from: null, …(1) } to deeply equal { from: null, …(1) }
FAIL  treats null and undefined as the same absence
      expected { notes: { from: null, to: null } } to deeply equal {}
FAIL  never reports updated_at, in either case convention
      expected { updatedAt: { …(2) }, …(1) } to deeply equal {}

Tests  5 failed | 6 passed (11)
```

Each of those five is a real failure mode of this code, not a hypothetical:

| Case | What the naive version would have done |
|---|---|
| a `json` column equal but not identical | reported `ichQ2Parameters` as changed on **every** edit — two reads of a `json` column are never `===` |
| a `Date` at the same instant | reported `validationDate` as changed on every edit, for the same reason |
| a `Date` recorded as its instant | written `[object Date]` into the inspector's audit row |
| `null` vs `undefined` | reported a field as changed from nothing to nothing |
| `updated_at`, either convention | put one meaningless entry in every single diff |

The three behaviours a unit test cannot reach were shown on the running product
instead, through its own HTTP routes (`before-after.txt`):

- **a PUT writes a row at all** — the five creates and five edits above, each
  with a `Cmc Register Update` on the ledger where before there was none;
- **the audit row shares the content transaction** — `chain verified: True`
  from the ledger route, which recomputes the per-tenant hash chain. A row
  written on a second connection would not seal, because
  `writeChainedAuditRow` sets a transaction-local GUC that the `audit_logs`
  BEFORE INSERT trigger reads;
- **a missing row writes nothing** —
  `PUT /api/cmc/analytical-methods/99999999` → `404 Analytical method not
  found`, update rows before=10 after=10.

Three facts recorded while doing this, each found by running the code rather
than reading it:

- `{"status":"validated"}` on an analytical method answers **409**, not 200 —
  `validated` is a governed signed state and an ordinary PUT cannot reach it.
  That refusal is slice 05 holding, and it means the no-op proof had to use a
  field with no governed vocabulary (`title`).
- `cmc_change_control` requires `changeNumber` and `justification`; the register
  has no `changeTitle` column. The probe's first run reported
  `CREATE FAILED: Invalid payload` for that register — a defect in the probe,
  not the product, and worth keeping in the record because a probe that fails
  silently is how a slice gets reported green over an untested register.
- The comparability PUT is raw SQL, so bringing it onto the diff needed
  `SELECT *` / `RETURNING *` rather than a column list — which is also what
  keeps `ci:sql-interpolation` green with no baseline entry.

---

## In the OQ record

`OQ-CMC-37` (URS-CMC-025) edits one record in each of three registers — a
serial one, a uuid one, and one moved by two fields at once — sends the same
body again, then edits a record that does not exist, and reads each record's
chained history back. It asserts one act per edit that moved something, each
naming the actor and both values of every field, sealed into the tenant chain;
no act for the repeat body; and no act for the record that does not exist. The
chain verdict it reports is the ledger route's own, from the one verifier, not
one this step recomputes.

```
  OQ-CMC-37  pass
OQ-008 CMC / Module 3: 19 pass, 0 fail, 11 deviation, 8 not-executed
```

The reading half is `OQ-CMC-38` and
`docs/evidence/CMC-M3-GA/2026-10-18/09-register-record-history/`.

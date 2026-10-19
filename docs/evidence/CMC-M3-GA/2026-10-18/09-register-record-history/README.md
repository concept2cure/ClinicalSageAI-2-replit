# The audit trail nobody could read

Slice 08 put every register edit on the tenant's hash-chained ledger with the
operator, the fields that moved and both values. 21 CFR 11.10(e) asks for two
things, and the second one is about reading:

> … audit trails to independently record the date and time of operator entries
> and actions that create, modify, or delete electronic records …
> **Record changes shall not obscure previously recorded information.**

The before-values were recorded. No working route returned them.

| Route | What a reader got |
|---|---|
| `GET /api/audit-trail/ledger` | the act, the actor and the chain — newest-first across the whole tenant, with **no changed fields** and no way to ask about one record |
| `GET /api/part11/audit-trail/:entityId` | nothing. Deliberately disconnected: it selects six columns that do not exist, from a table nothing writes, with no tenant predicate — its own header says so and says why a connection would make it worse |
| `GET /api/cmc/specifications/:id/history` | the specification register's revisions, from `specification_audit_log` — one register of seventeen |

So a QA reviewer opening an analytical method could not see that its purpose was
widened an hour ago, by whom, or what it said before, although the platform had
all three. An audit trail that cannot be read against the record it is about
does not meet 11.10(e), whatever is in the table.

---

## What was added

**One route**, `GET /api/cmc/register-history/:register/:id`
(`server/api/cmc/routes.ts`, `server/services/cmc/register-history.ts`): every
chained act against one record, **oldest first**, each with the actor and the
account reference, the fields that moved with both values, the reason, the
§11.50 signature where one is bound to the act, and whether the row is sealed
into the tenant chain.

**One panel**, `client/src/concept2cure/v2/surfaces/cmcRecordHistory.tsx`,
reached by a **History** button on every row of every register table. The button
is mounted from `RegisterCard`, the one canonical register table, so all sixteen
registers got it in one change.

**One list of registers**, `shared/constants/cmc-register-history.ts`, read by
both sides. The server's target map is keyed by it, so a register the UI offers
a History action for and the server does not describe **will not compile**:

```
server/services/cmc/register-history.ts(108,14): error TS2741:
  Property '"batch-records"' is missing in type '{ 'analytical-methods': …'
  but required in type 'Record<"analytical-methods" | "batch-records" | … >'
```

(shown by adding `batch-records` to the shared list and compiling).

`specifications` is deliberately **not** in that list: it has its own history
route over its own store, and two routes answering one question with different
content is the duplication the repo forbids. The OQ step reads the
specifications route after the new one to prove it still answers.

---

## Two things the checks caught that reading the code did not

**1. A uuid register declared as a serial one.** The map-vs-schema test failed on
its first run:

```
FAIL  each entry describes its own table > manufacturing-processes >
      states the id shape the table actually has
AssertionError: manufacturing-processes: id is PgUUID: expected 'integer' to be 'uuid'
```

`manufacturing_processes.id` is a uuid. Declared `integer`, every history read of
that register would have parsed its id to `NaN` and answered **404** — the same
mistake `SIGNED_REGISTERS.comparabilityAssessments` shipped with, where it made
every approval answer "an id is required" until it was found by running the
ceremony. Here the test is the discovery, made cheap.

**2. The route's first shape was both a shadow and an unclaimed prefix.** It was
written as `GET /api/cmc/:register/:id/history`, and two checks refused it:

- This router is mounted on the bare `/api/cmc` **before** the specifications
  and batch-records routers, so a parameter route here swallows
  `/api/cmc/specifications/:id/history` — a working capability — and answers 404
  for it.
- `ci:launch-scope-api` refused the client call outright:

  ```
  ci:launch-scope-api: 1 API path(s) that launch or shell screens call are not
  attributed to the launch scope:
    [unmapped] /api/cmc/:p/:p/history
      called by cmc
      in client/src/concept2cure/v2/surfaces/cmcRecordHistory.tsx
  ```

  A path whose first segment is a variable normalises to `/api/cmc/:p/:p/history`,
  which no surface prefix can claim — and the only prefix that would have covered
  it is the bare `/api/cmc` that decision P-28 deliberately does not claim. The
  alternative was to widen the catalog's narrowest claim to make a read route
  attributable.

Both are answered by the same change: a fixed namespace,
`/api/cmc/register-history/:register/:id`, which is one declared prefix, exactly
as narrow as the thing it serves, and cannot shadow another router's path.

---

## Shown working, on the running product

`probe-record-history.sh`, through the product's own HTTP routes:

```
── an analytical method, created then edited twice ──
  register=analytical_method  recordId=111  acts=3  note=None
  2026-10-18T22:26:33 Recorded  JM Smith   seq=6552   sealed=True  —
  2026-10-18T22:26:33 Changed   JM Smith   seq=6553   sealed=True  title: 'Assay by HPLC' → 'Assay by RP-HPLC'
  2026-10-18T22:26:33 Changed   JM Smith   seq=6554   sealed=True  purpose: 'Assay' → 'Assay and related substances'; matrix: 'Drug substance' → 'Drug product'

── a comparability assessment (uuid-keyed) ──
  register=comparability_study  recordId=c2971798-…  acts=2  note=None
  2026-10-18T22:26:33 Recorded  JM Smith   seq=6555   sealed=True  —
  2026-10-18T22:26:33 Changed   JM Smith   seq=6556   sealed=True  justification: None → 'Comparable on every attribute…'

── what the route refuses ──
  a record that does not exist                 404  No such analytical method in this organization.
  a uuid register given an integer id          404  No such manufacturing process in this organization.
  a register that keeps no history             404  No change history is kept for /api/cmc/qbd-elements. Registers with one: analytical-methods, …
  specifications — its own history route       404  No change history is kept for /api/cmc/specifications. Registers with one: …

── and the route specifications has kept all along ──
  GET /api/cmc/specifications/<id>/history     200  {"success":true,"data":[{"id":"0d984206-…","specification_id":"f7895c28-…
```

**Another organisation's record is a 404, not an empty history.** A record was
inserted directly under organisation 9 and asked for as organisation 1:

```
another organisation's record (id 110, org 9)   404  No such analytical method in this organization.
this organisation's record  (id 109, org 1)     200  3 act(s): Recorded, Changed, Changed
```

A 404 rather than a 403, because the existence of a record in another
organisation is not this caller's to learn.

---

## The register the button did not reach

The client test that pins the action's reach failed on its first run:

```
FAIL  the History action reaches the registers the server serves >
      offers it for every register card whose register keeps a history
AssertionError: a register keeps a history that no surface offers a way to read:
  expected [ 'stability-studies' ] to deeply equal []
```

Fifteen of the sixteen registers are `RegisterCard`s, so one change mounted the
action on all of them. **Stability studies is not**: it has a hand-built surface
in `CmcModule.tsx` with its own row actions (Result, Estimate Q1E, Shelf life),
and it is the register whose edits matter most to §3.2.S.7 / §3.2.P.8. It now
carries the same History action, and the test reads both surfaces.

The same test's first regex read only `path="/api/cmc/x"` and reported nine
registers as unreachable; nine of the sixteen cards pass their path as a
template carrying the project filter (`path={`/api/cmc/x${…}`}`). A test that
reads source has to read all the forms the source uses — the runtime code
already handled both, because it takes the segment after stripping the query.

---

## The one-writer contract caught the label map

The panel labels each act for a reader — *Recorded*, *Changed*, *Retired*,
*Signed*. Written as plain string keys, that map put a second copy of
`cmc.register.create` in the repository, and the contract test that exists to
keep one writer refused it:

```
FAIL  server/services/cmc/__tests__/register-create-recorded.test.ts >
      cmc.register.create has one writer > only register-audit.ts writes it
AssertionError: cmc.register.create is written outside
  server/services/cmc/register-audit.ts: expected [ Array(1) ] to deeply equal []
```

The map now takes each name from the module that writes it —
`CMC_REGISTER_CREATE`, `CMC_REGISTER_UPDATE`, and
`CMC_REGISTER_RETIRE_SIGNED`, newly exported from `signed-record.ts` where the
retirement is written. A governed signature's action is built as
`c2c.work.${command}` and has no constant to import, which the map says in a
comment rather than leaving the reader to wonder.

---

## Shown failing first — the panel's honest states

The panel is read for one reason: to find out whether a regulated record was
changed and what it said before. So the state it must never render is "no
changes" over a read that failed. `cmcRecordHistory.test.tsx` (9 cases) was run
against the version a careful author would write first — the error branch folded
into the empty branch, and no shape guard on the response:

```
FAIL  reports a failed read as a failure, never as a record with no changes
FAIL  says the audit store was unreachable when the server fails closed
FAIL  reports a 200 of the wrong shape as a failure too
      → Unable to find an element by: [data-testid="cmc-history-error"]
            data-testid="cmc-history-empty"
Tests  3 failed | 6 passed (9)
```

The mutant rendered `cmc-history-empty` — "No chained act is recorded against
this record" — for a 500, for a 503, and for a 200 whose body it could not read.
Three different failures, all presented as a record nobody had touched.

Also pinned by those nine cases: an act with no actor reads *not recorded* rather
than a guessed name; a row with no chain position is shown and marked
**unsealed** rather than dropped; and a value cleared to nothing is a change with
both sides readable.

---

## What is not claimed

- **The history names the stored column.** For the fifteen Drizzle registers
  that is the field name the form uses. For the comparability register, whose
  write path is raw SQL, it is the database column — so an outcome recorded
  through the **Outcome** box reads as `justification`, which is the column
  §3.2.P.2 prints from. A per-register label map is not claimed, and the
  column name is what an inspector traces by.
- **History before 2026-10-18 does not exist.** 213 register rows on the
  development deployment carry an edit made before the chain recorded one. The
  route says so in its own words rather than showing an empty table:
  *"No chained act is recorded against this record. A record created before
  2026-10-18 carries no operator, and an edit made before that date carries no
  change history."*
- **A read returns at most 500 acts, and says when there are more.** The query
  reads newest-first so a capped read keeps the LATEST acts, and the entries are
  presented oldest-first because that is how a history is read. What a cap hides
  is therefore the record's **beginning** — possibly its create — so the panel
  says so above the table rather than showing a history that starts in the
  middle as if it started there. Found by re-reading the diff before pushing,
  not by a failure: the first version read oldest-first with `LIMIT 500`, which
  would have silently hidden the most recent acts of a long-lived record.
- **The chain verdict is not recomputed here.** Each row carries `sealed`, from
  its own chain position. The tenant chain's verdict is the ledger route's, from
  the one verifier, and OQ-CMC-37 reads it there.

---

## In the OQ record

Two steps added to OQ-008 (protocol v0.5), executed against a running server
with `VALIDATION_NO_BROWSER=1`:

```
  OQ-CMC-34  pass
  OQ-CMC-35  pass
  OQ-CMC-36  pass
  OQ-CMC-37  pass          URS-CMC-025 — an edit records who changed it, and what moved
  OQ-CMC-38  pass          URS-CMC-026 — the history is readable against the record
OQ-008 CMC / Module 3: 19 pass, 0 fail, 11 deviation, 8 not-executed
```

`ci:validation-traceability` refused the protocol first, which is how the two
steps came to be written rather than described:

```
  [unexecuted-step] OQ-CMC-37: OQ-008-CMC-MODULE-3.md describes it; tests/validation/oq/cmc/run.mjs does not execute it
  [unexecuted-step] OQ-CMC-38: OQ-008-CMC-MODULE-3.md describes it; tests/validation/oq/cmc/run.mjs does not execute it

A record that calls an unscripted step scripted overstates what was verified.
```

OQ-CMC-38's first run recorded a deviation — *"this organisation holds no
specification"* — which was **false**: the step read `GET /api/cmc/specifications`,
and that register's list route is `/:projectId`. A probe that reads the wrong
path and reports the absence of data is the same defect as a surface that
renders a failed read as an empty state, so it is recorded here rather than
quietly corrected: the step now reads the specification OQ-CMC-03 recorded, and
the probe in this directory creates one and reads it back.

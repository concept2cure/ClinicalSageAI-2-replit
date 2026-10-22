# A verdict about a programme nobody holds

A sweep of `server/api/cmc/routes.ts` on 2026-10-19 asked one question of every
route: **does it establish that the programme it was handed is this
organisation's?** Eleven routes read a client-supplied programme id. Four did
not ask, and five of the seven register creators in `register-writes.ts` did
not either.

---

## 1. A complete compliance verdict over a register that was never read

`POST /api/cmc/ich-compliance`, as it stood:

```
— POST /api/cmc/ich-compliance for a programme this organisation does not hold —
  11111111-1111-4111-8111-111111111111     200  findings=9  guidelines=11  overall=non_compliant
  33333333-3333-4333-8333-333333333333     200  findings=9  guidelines=11  overall=non_compliant
  not-a-uuid                               200  findings=9  guidelines=11  overall=non_compliant
```

Three ids: a well-formed uuid naming no programme, another organisation's
programme, and a string that is not a uuid at all. Each got **200 with a
complete eleven-guideline verdict and nine findings.** The findings were the
"nothing is recorded" ones, so a mistyped programme id read as a confident
compliance report about an empty register — and in an organisation with several
programmes, a reader could not tell "your programme is non-compliant" from
"that programme is not yours".

The same shape held for `GET /api/cmc/quality/qbd/:projectId`, which derives
CQAs and CPPs, and `POST /api/cmc/control-strategy`.

This is the failure the process-capability route three screens down already
names in its own docstring:

> A project this tenant does not hold is a 404, not a capability report with no
> findings. Without this, a mistyped uuid and another org's program both
> answered 200 with two empty series — a completed assessment over a register
> that was never read, which is the one reading this route's own docstring
> forbids.

That lesson had been written down for one route and not applied to the others.

## 2. A record filed under a programme nobody holds

`POST /api/cmc/container-closures` with a programme id this organisation does
not hold:

```
  container-closure            200  id=144 projectId=99999999-9999-4999-8999-999999999999
  analytical-method (guarded)  409  The program named is not one of this organisation’s
                                    programs, so the record was not filed under it.
```

The create wrote the body's `projectId` straight into the row. `createMaterialSpec`,
`createFormulationRecord`, `createManufacturingProcess` and
`createCharacterizationStudy` were in the same state, and so was the raw-SQL
`POST /api/cmc/comparability-studies`, which put `req.body.projectId` directly
into its INSERT. All six tables carry `project_id`.

What that costs: a typo files a record under a programme that does not exist,
where no screen will ever show it and no Module 3 build will ever read it — and
the record looks saved. It also bypasses the fork guard `projectOnEdit` exists
for: the check that no OTHER programme already holds the record's canonical
source object.

---

## The change

- **`filedProjectOnCreate`** — already the canonical create-side check, used by
  the two guarded creators — now runs in all seven, before the row is written
  and after the body's own refusals (a body claiming a governed status is
  refused without a database round trip). It returns `null` for an absent
  programme, which is an organisation-wide record, and throws the register
  refusal for one that is not ours.
- **`answeredUnknownProgram`** — one helper, used by the three compute routes.
  A **404**, not a 403: that a programme exists in another organisation is not
  this caller's to learn.
- **The comparability create's refusal reaches the shared reader.** It answered
  `500 Failed to create comparability study` for an unknown programme — a server
  fault for what is a bad request — because its catch wrote its own 500 instead
  of calling `respondWriteError` like every other register create.

## After, on the running product

`probe-unverified-programme.sh`, four programme ids × six paths (`after.txt`).
Every unheld programme — a uuid naming nothing, a malformed id, and a **real
second tenant's programme** (organisation 9's "AB-100 IND") — is refused on all
six:

```
── 99999999-9999-4999-8999-999999999999 ──   (and `not-a-uuid`, and org 9's programme)
  POST /ich-compliance           404  No such program in this organization — nothing was assessed.
  GET  /quality/qbd/:projectId   404  No such program in this organization — nothing was assessed.
  POST /control-strategy         404  No such program in this organization — nothing was assessed.
  POST /container-closures       409  The program named is not one of this organisation’s programs…
  POST /comparability-studies    409  The program named is not one of this organisation’s programs…
  POST /material-specs           409  The program named is not one of this organisation’s programs…

── this organisation's own programme ──
  POST /ich-compliance           200  VERDICT: 11 guideline(s), 9 finding(s), overall=non_compliant
  GET  /quality/qbd/:projectId   200  DERIVED: 0 CQA(s), 0 CPP(s)
  POST /control-strategy         200  DERIVED: 0 CQA(s), 0 CPP(s)
  POST /container-closures       200  FILED: id=151 projectId=59228181-…
  POST /comparability-studies    200  FILED: id=68614f79-… projectId=59228181-…
  POST /material-specs           200  FILED: id=216 projectId=59228181-…
```

The control matters: without the last block, a refusal is indistinguishable from
a broken route. And a create with **no** programme is still accepted — these
registers hold organisation-wide records, and a check that refused one would
break the register rather than guard it:

```
  container-closures         200  id=147 projectId=None
  material-specs             200  id=210 projectId=None
  formulation-records        200  id=70  projectId=None
  characterization-studies   200  id=208 projectId=None
```

## Shown failing first

`server/api/cmc/__tests__/programme-membership.contract.test.ts` reads the
router and the creators rather than naming routes, because both defects are
*absences* — a route test proves the routes it names and cannot fail for the one
somebody adds next month. Against the code as it stood, 7 of its 12 cases fail:

```
AssertionError: a route that takes a programme from the client and never checks it
  either files a record under a dossier this organisation does not hold, or answers
  a verdict over a register it never read:
+ [ "POST /comparability-studies", "GET /quality/qbd/:projectId",
+   "POST /ich-compliance", "POST /control-strategy" ]

× createContainerClosure verifies the programme before it writes
× createMaterialSpec verifies the programme before it writes
× createFormulationRecord verifies the programme before it writes
× createManufacturingProcess verifies the programme before it writes
× createCharacterizationStudy verifies the programme before it writes
```

It also pins what the refusal must *say* — a bare 404 reads as "the route is
missing" — and that the check runs **before** the insert, not after.

`register-writes.test.ts` gained the unit case for the refusal, and one for the
organisation-wide record that asks nothing of the programme store. Three of its
existing cases failed with `no pool in this test` when the check was added,
which is the test harness correctly having no database: it now mocks the
membership read, as the production path now consults it.

## In the OQ record

`OQ-CMC-39` (URS-CMC-027) drives all six paths under each unheld programme, then
the same six under the run's own, then one create with no programme. With a real
second tenant's programme supplied as `OQ_FOREIGN_PROJECT_ID`, **three steps
went from deviation to pass**:

```
  OQ-CMC-04  pass      ← deviated before: another organisation's programme was not refused
  OQ-CMC-24  pass      ← deviated before: "A nonexistent id answered 200."
  OQ-CMC-39  pass
OQ-008 CMC / Module 3: 21 pass, 0 fail, 10 deviation, 8 not-executed
```

OQ-CMC-24's own deviation text had been recording this defect since the runner
was written. It is the one that is now closed.

Without `OQ_FOREIGN_PROJECT_ID` the step records a deviation naming exactly what
was not observed, rather than passing on the two cases it could reach.

## What is not claimed

- **The 404 is not a report.** `answeredUnknownProgram` says *"No such program in
  this organization — nothing was assessed."* It does not say whether the
  programme exists elsewhere, and it is deliberately the same answer for a
  programme that does not exist and one of another organisation.
- **A list route is not changed.** `GET /manufacturing-processes?projectId=…`
  narrows rows that are already `organizationId`-scoped, so an id of another
  organisation matches nothing. It establishes no programme and needs no
  refusal; the contract test excludes exactly that position and nothing else.
- **`POST /stability-studies/:id/trending` was already correct** — it reads the
  study by id *and* `organizationId` and answers 404 when that misses. The first
  pass of the sweep listed it as unguarded; a second, narrower sweep (only
  handlers that read `req.body/params/query.projectId`) cleared it. The wider
  sweep's extra names were spans bleeding into the next handler, and are
  recorded here because a sweep that over-reports is how a fix gets claimed for
  code that never had the defect.

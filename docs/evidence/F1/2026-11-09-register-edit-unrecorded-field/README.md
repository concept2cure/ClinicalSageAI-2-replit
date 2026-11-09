# A register edit answered 200 for a field it does not record

**Package:** F1 (repairs: defects in shipped behaviour; no new screen, mount or table).
**Date:** 2026-11-09. **Completes:** `server/api/cmc/routes.ts`.

## The defect, as measured

Every CMC register body is parsed with `schema.parse` or `schema.partial().parse(req.body)`, and a zod object
**strips the keys it does not know**. So a write naming a field the register has no column for was answered
`200 success:true` with the record unchanged, and nothing anywhere said so.

This was not inferred from the code. On 2026-11-09 this repository's own demo seeder sent `shelfLifeClaim` to
`PUT /api/cmc/stability-studies/:id`, where the column is `shelf_life` (`shelfLife`). Three studies, three 200s,
nothing stored — and the seeder reported the shelf life as recorded, because a 200 from a write route is the only
answer a caller has. A read-back the seeder had to be given on purpose caught it; no ordinary caller performs one.

The seeder is the forgiving case. The same silence covers:

- **the CMC screens**: `cmcWriteFailed` fires on `!res.ok`, so a 200 is "Saved". A specification, method or study
  edited with one field named wrongly shows the user a success toast over a record that did not change.
- **partial application**: a body of three fields of which one is misspelled stored two and answered as though it
  had stored three. There is no status code for "two of your three fields".
- **every other caller** — an AnA tool, a script, `curl`, an integration — which has no read-back at all.

"Saved" is a claim about the record. A write that stored none of what it was asked to store must not make it
(working agreement: *fail closed, never fabricate*).

## What already exists (RULE 3)

| Path | What it does today | Used here |
|---|---|---|
| `services/cmc/register-writes.ts` | the register bodies, and the governed-state refusals (`ungovernedQualificationRefusal`, `currentFormulationConflict`) each returning a refusal the route answers | the rule's home, beside the schemas it reads |
| `services/cmc/register-writes.ts` `RegisterWriteRefusal` | a refusal a register write throws, which the route turns into a status | **extended**: its status was a hard-coded `409`; it now takes one, still defaulting to 409 |
| `api/cmc/routes.ts` `respondWriteError` | already maps `RegisterWriteRefusal` → `error.status`, and `ZodError` → 400 | the whole answer path; no handler gained a branch |
| `api/cmc/specificationRoutes.ts` PUT | already refuses `400 No updates provided` when a body maps to no column at all | the principle at the edge; this generalises it to the partial case |
| `utils/authedOrgId.ts` `withoutTenantKey` | strips the tenant key from a schema | unchanged; its removal is not an unrecorded field, it is a refused one |

Nothing new: no screen, route, service file, table or AnA tool. Two functions and one constant were added to the
service that already owns the register bodies, and one existing class gained a parameter.

## The rule

`refuseUnrecordedFields(schema, body, registerPath)` throws `RegisterWriteRefusal(…, 400)` when the body carries
top-level keys the register's schema does not accept.

| Body | Answer |
|---|---|
| only keys the schema accepts | proceeds |
| `reason` beside them | proceeds — the governed reason (§11.10) is read by the handler, not by the schema, and a caller cannot know in advance whether the record it is editing is signed |
| a key the schema does not accept | **400**, naming the keys it could not record **and** the ones the register does record |
| not an object (null, an array, a string) | proceeds — the schema's own parse owns that refusal, and reporting it twice would report it wrongly |

**400, not 409.** A misspelled field is a wrong *request*; 409 is for a conflict with the record's *state*, which
is what every other refusal in this file is. A test pins the distinction, because a status code is the only part
of this a caller branches on.

**It never names a field the register does record.** A refusal that over-reports sends the caller to fix something
that was right. The message lists the accepted fields for the same reason: the caller's next move is to correct
the call, and a refusal that only says "no" leaves them guessing at a column name.

### Why the guard is a throw and not a branch

`if (refused) return;` at fifteen handlers is fifteen added branches, and `routes.ts`'s handlers sit against the
complexity cap. Throwing the refusal the file's `catch` already understands makes each call site **one statement
with no branch**, so no handler's complexity or length moved. The 15 edits are:

`analytical-methods`, `process-validation`, `stability-studies`, `qc-testing`, `change-control`,
`drug-substances`, `drug-products`, `container-closures`, `reference-standards`, `impurity-profiles`,
`dissolution-profiles`, `material-specs`, `formulation-records`, `manufacturing-processes`,
`characterization-studies`.

## Verified by making each check fail

| Mutation | What it reported |
|---|---|
| **the guard removed from the stability edit — the defect exactly as shipped** | *"expected 200 to be 400"*; the update ran once over a patch carrying nothing of what was asked; and the record was read, so the caller's error depended on the row |
| the rule finds nothing unrecorded (`return []`) | 9 red across both suites, the route case again at *"expected 200 to be 400"* |
| the refusal is 409 | *"expected 409 to be 400"* in both the unit and the route case |
| the governed `reason` is not accepted | *"expected [ 'reason' ] to deeply equal []"* — a signed-record edit would be refused for carrying its own reason |

Output in `03-mutation-the-defect-as-shipped.txt`, `04-mutation-nothing-is-ever-unrecorded.txt`,
`05-mutation-refused-as-a-state-conflict.txt`, `06-mutation-governed-reason-refused.txt`; the green run in
`02-green.txt`.

Tests (32 cases, 3 files):

- `services/cmc/__tests__/unrecorded-register-fields.test.ts` (10) — the rule, including the seeder's measured
  case and the two things a refusal must not do.
- `api/cmc/__tests__/register-edit-unrecorded-field-route.test.ts` (4) — the route's answer on a mounted
  `routes.ts`: 400, nothing written, **before the record is read**, and the same edit through once the field is
  spelled as the register records it.
- `api/cmc/__tests__/register-edit-unrecorded-fields.contract.test.ts` (18) — adoption: every handler that parses
  a register body as a partial asks the question, with the schema it then parses with, before the parse. A
  sixteenth register added later, or a guard deleted in a tidy-up, is caught here rather than by a caller.

## Not in this slice

- **The creates.** `POST` strips unknown keys the same way. The harm is smaller (the response carries the created
  row, so a caller that reads it can see the field missing) but it is the same silence, and seven of the creates
  are service functions shared with the guided interview's commit projector, so the guard belongs inside
  `createX` rather than at the route. That is its own change.
- **`comparability-studies`** reads `req.body.title`, `.type`, `.product`, `.methods`, `.outcome`, `.status`
  directly with no schema, so there is nothing to compare a body against. Giving it one is a change to what that
  route accepts, not a guard over what it already accepts.
- **`batchRecordRoutes.ts` and `specificationRoutes.ts`** build their own `UPDATE` from a field map. The
  all-unknown case is already refused (`No updates provided`); the partial case needs the same rule against the
  map rather than against a zod shape.

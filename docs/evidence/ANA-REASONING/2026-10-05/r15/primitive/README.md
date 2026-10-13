# Round 15's first piece: the model half of the record check

Every one of SEC-A-7's three server doors — the section save, `POST
/docs/from-draft` and the section revert — needs the same single fact before it
can apply the governed-write rule: **which models served the turn this content
came from, and what RULE 2 says of each.** This is that fact, as one function.

## Why it is not `verifyMachineText`

`verifyMachineText` already reads a record and computes exactly this, and it
cannot be reused as it stands: it requires the **text** to verify, and only one
of the three doors has text to offer.

`POST /docs/from-draft` has none. The whole document is the model's prose;
there is no quotable span that could be a claim about who wrote it. So at that
door the text check is not merely skipped — it does not apply. The map that
found this said the two checks "must be designed as separable", and this is the
separation.

The model half and the text half therefore split, and **neither duplicates the
other**: `turnServedModels` reuses `verifyMachineText`'s own `readRecord`, so
"read a record, confirm it is intact, say what served it" still has one
implementation. A door that also has text to check keeps calling
`verifyMachineText`, which still does both.

## What was added

| Where | What |
|---|---|
| `machine-claim-verify.ts` | `turnServedModels(q, orgId, id)` — the raw read, over the shared `readRecord`. Returns the record id, its sha256, the turn's outcome and the served models, or `turn_record_not_found` / `record_not_intact`. It deliberately does **not** validate the id: the checked entry point does that, for the reason below. |
| `authoring-record.ts` | `servedModelsForTurn(executor, tenantId, turnRecordId)` — what the doors call. Validates the id's shape, probes that the store exists, and qualifies the models with `qualifyServedModels`. Reuses the `NOT_VOUCHED` reason text the decision path already shows, so a refusal reads the same wherever it is surfaced. |

## Two decisions, both about failing closed

- **The id's shape is checked before the store is touched**, in the entry point
  rather than in the reader. The column is `uuid`, so a malformed id would raise
  22P02 **inside the caller's transaction** — aborting the very write it is being
  checked for. `resolveTurnRecordSources` guards the same hazard the same way,
  and says so.
- **A record naming no model returns an empty list, not an error**, because "the
  record names no model" is a fact *about* the record and a door must refuse on
  it; a failure to *read* the record is a different sentence and deserves a
  different one. That leaves a trap, and the trap is pinned by a test of its
  own: `servedBy.some(m => !m.qualified)` is **false** for an empty list, so a
  door asking only "is any model unqualified?" would admit a turn whose record
  names nothing at all. Every door must require a non-empty list too — as the
  client gate already does (`anaInsertGate.ts`, `served.length === 0`). The
  doc comment on the function says this where a caller will read it.

## Proof

- `red.txt` — 7 of 7 cases failed with `servedModelsForTurn is not a function`,
  the fixtures working, so the red is the missing primitive.
- `green.txt` — 8/8, and 90/90 across all seven suites that exercise the two
  modules this changes (round 10's decision path runs through both).
- `mutants/` — six mutants, **all killed**: the id check dropped; the empty-id
  check dropped; the models returned unqualified; a record that no longer
  verifies read as if it did; a missing record read as one naming no model; the
  served models dropped.
- `lint-tsc.txt` — no file gains a warning; typecheck exit 0.

## A limit of the fixtures, stated

A turn record **cannot be tampered with** in a test, and that is the store
working: `ana_turn_records` is append-only by trigger, and a table CHECK
enforces `record_sha256 = sha256(record_text)`, so a mismatched pair cannot be
inserted at all. The `record_not_intact` case is therefore reached the way the
batch-draft suite reaches it — by deleting the audit-chain row that carries the
record's hash, so the record is no longer what the tenant's chain says was
written.

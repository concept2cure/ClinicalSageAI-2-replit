# The founder path asserted model attribution through a channel a security fix had closed

**Row:** D5 (Part 11 attribution on the governed record). **Session:**
`…01P6GWSv`. **Date:** 2026-10-13. The **last** failure in the full vitest
suite.

## What was wrong

`tests/lineage/founder-path-lineage.pglite.test.ts` is the LX-00 end-to-end
walk — project → Data Room → AnA → editor → seal → Vault → Submission Center →
agency. CLAUDE.md pins this path explicitly: *"a change that breaks that gate is
not a refactor."*

Hop 3's `model-recorded` check — *"provenance names the model the gateway
served"* — read `authoring_documents.provenance.model` and got **undefined**.

The cause is not a product defect. `27211528b` ("from-draft records the model
from the turn record, never from the caller", SEC-A-7 door 2) closed a real
hole: `provenance.model` was **caller input**, validated only as a string of at
most 2000 characters, and `provenance.turnId` was never looked up. So any
authenticated member of the organisation could name any model for a draft, and
that string was written inside one transaction into three records an inspector
is shown and **none of which can be amended** — the append-only `doc_revisions`
genesis row carrying the full prose, the `authoring_audit_trail` row holding the
provenance verbatim, and the span lineage saying a machine drafted it. Its own
red run recorded a POST naming `claude-opus-5-5` for prose the record said
`claude-sonnet-5` wrote.

Its replacement is one rule, stated in that commit:

> *"the model in this record comes from the turn record or not at all. No
> trusted second channel, because a privileged way to set the field is how the
> original defect got in."*

and its honest corollary:

> *"Only a turn whose record was never filed records no model."*

**The walk filed no turn record.** `WALK_RUN_ID` was a bare string,
`'run_walk_draft'`, and the world never applied the turn-record store at all. So
`undefined` was the correct answer to the question the walk was asking — and the
walk was asking the wrong question: it was still asserting the closed channel.

## The change — test files only; no production file is touched

Two edits, so the walk asks the question production actually answers:

- **The world applies `migrations/20260926_ana_turn_records.sql`**, the store the
  resolver reads (`ana_turn_records`, `ana_record_blobs`).
- **Hop 3 files the turn record the draft names**, through the **production
  writer** — `openTurnRecorder({ runId: WALK_RUN_ID, … })`, `setModel`,
  `addServed`, `writeTurnRecordSafely` — so the fixture cannot drift from how a
  turn is really sealed. `servedModelsForTurnOrRun` then resolves the model by
  run id, which is the reference the in-process tool path sends
  (`stream.ts` passes `turnId: runId`).

`writeTurnRecord` opens its own transaction and so needs a pool it can check a
client out of; the walk's PGlite pool answers queries only. It gets a one-client
connectable shim over the world's own `q`, with the limitation written down in
the code: PGlite is a single connection, so this walk cannot prove the
concurrent case and does not claim to.

## Proof

| | Before | After |
|---|---|---|
| The walk | 1 failed / 14 passed | **15 passed** |
| `tests/lineage/` + `tests/golden-journeys/` | — | **12 files / 37 tests passed** |

**Shown still to bite, and this is the check that matters.** The walk now
supplies `SERVED_MODEL` on both sides — as the tool ctx *and* as the filed
record — so the assertion could easily have become a tautology. It did not.
Filing the record with a different model (`claude-sonnet-5`) while leaving the
ctx on `claude-opus-5` fails the check:

    → ana-draft/model-recorded FAILS and is not baselined
      observed "claude-sonnet-5"

The gate read the **record**, not the ctx. That is simultaneously the proof that
the check is live and a direct confirmation that `27211528b`'s invariant holds in
the end-to-end path: the model on a governed document is the one the turn record
names, and a caller cannot put another there.

A first attempt at this fix was wrong and is worth recording: passing `w.pool`
(which `World` does not have) and then a query-only pool each failed inside
`writeTurnRecordSafely`'s catch, which returns `not_recorded` rather than
throwing — so the walk reported *"the walk's turn record was not filed"* and
**11 of 15** hops cascaded red, worse than the one failure it started from. The
explicit `status !== 'recorded'` throw is what made that legible instead of
silent.

eslint exit 0; scoped typecheck clean.

## Consequence for the suite

The walk now covers one more thing than it did: that model attribution survives
the whole founder path **through the turn record**, which is the only channel
that still writes it. Before this, the hop could only ever have passed by the
route a security fix deliberately removed.

# Door 3 of SEC-A-7: a revert carries the attribution the restored revision recorded

Supports launch row **D5** (the Part 11 record) and **D4**.

**This is not the gate the round planned.** The plan was to apply the
governed-write rule here as at the other doors. An adversarial verifier argued
that down, and its argument was better than the plan's:

- **There is no claim to refuse.** At the section save the machine claim arrives
  *in the request*, per clause, so refusing the claim does not block the save.
  Here the attribution comes from `document_span_lineage`, read inside the
  transaction. The only refusable thing is the revert itself.
- **Refusing preserves the bad state and traps the person.** In production no
  registry entry is PQ-passed, so a verdict-based refusal would refuse the
  revert of every AI-touched section — *including the revert that is removing
  the unqualified prose*. And every byte being refused is already committed to
  two append-only ledgers; a 403 un-writes none of it. It only pins the text the
  person is trying to leave.
- **It would fire on the door that keeps records and spare the one that does
  not.** The model is recoverable only for content that came through the
  AI-draft route; machine prose arriving through the manual save door records no
  generator at all. A verdict-based refusal would refuse reverts of
  well-recorded content and wave through reverts of poorly-recorded content.

So the fix is a **restoration**, not a gate.

## What was wrong

`doc_revisions` is append-only by trigger and every row records the provenance
of the state it holds: `origin`, and `inputs.contributors` — the machine-author
list, written by `createRevision` from the save door's own
`MACHINE_AUTHOR_IDS`-validated list.

**The revert's SELECT asked for neither.** It named
`id, section_id, content, created_by, created_at, tenant_id` and nothing else,
so the one provenance fact the restored version carried about itself was
discarded at the moment it was restored. Then it passed no `draftSource` to
`commitSectionToFiling`, which resolves an absent one to NULL unconditionally.

Consequence, in the system of record: **reverting to AI-drafted text erased
`'ana'`**, and the next save's snapshot trigger — which reads the OLD row's
`draft_source` — would then record `author_kind 'unspecified'` over model prose.
That is the fabrication `migrations/20260822_section_version_author_kind_unspecified.sql`
exists to end. Nothing surfaced it, because every store stayed internally
consistent.

## What changed

| Where | What |
|---|---|
| `authoring.router.ts` revert handler | The SELECT asks for `origin, inputs`. New `restoredMachineAuthor()` re-validates `inputs.contributors` through `machineContributors` and yields the `draftSource`. The filing commit receives it, so `'ana'` survives the revert. |
| the same handler | The revert's **own** `doc_revisions` row now records those contributors too. Without that the attribution would be restored once and lost the next time someone restored *this* state — the same erasure, one step later and harder to see. |

**Re-validated rather than trusted**, although it comes from our own table:
`machineContributors` is the one list of ids that may be written as a machine
author, and a JSONB column is only as trustworthy as every writer that ever
touched it. An unrecognised id yields none, so the filing records NULL — "origin
not stated" — never a guessed `'human'`.

## Proof

- `red.txt` — the defect in one assertion: `expected null to be 'ana'`. The
  negative control (a revert to a person's own revision states no origin)
  passed before and after, so this is not a blanket `'ana'`.
- `green.txt` — 37/37, with the wider revert and filing-commit suites.
- `mutants/` — five mutants, **all killed**: the filing not told the restored
  origin (trunk's behaviour); the revert's own revision recording no
  contributors; every revert claiming AnA; the SELECT dropping the provenance
  columns; and an absent origin guessed as `'human'`.
- The first draft gained a lint warning (the handler reached complexity 17 of
  15); `restoredMachineAuthor` was extracted rather than baselined, the router
  returned to trunk's 23, and the mutants were retargeted at the extracted
  function and re-run.

## Not done here, and deliberately

The **span lineage** half of this door is untouched. Attribution still carries
forward by text hash from the spans live *now*, which describe the content being
reverted *away from*; probed by two independent agents, a revert after an
intervening reword files the model's sentence as the reverter's own
`author_assertion`. That is a second, larger change in the same handler, and one
part of the plan for it was **dropped outright**: retiring the live span set
before `lineage-gate.ts`'s early return would wipe every span of a section on a
**title-only** PATCH, because the save door calls the gate unconditionally with
`content` undefined.

# Round 15 — SEC-A-7's server doors: the record first, the gates next

Round 15 of the founder-directed AnA reasoning lane (founder, 2026-10-04:
*"Enhance the reasoning layer of ANA."*). Supports launch row **D4**.

Round 14 gated SEC-A-7's two **client** doors and mapped the three **server**
ones. This round builds the server side, starting with the thing every door
needs and the one that was outright false.

## Shipped here

| Piece | What |
|---|---|
| `primitive/` | **`servedModelsForTurn`** — the model half of the record check, as one function the three server doors share. `verifyMachineText` could not be reused: it needs the TEXT, and `from-draft` has none to offer. 6 mutants, all killed. |
| `d2-from-draft-provenance/` | **`POST /docs/from-draft` records the model from the turn record, never from the caller.** `provenance.model` was caller input written into three append-only records; `provenance.turnId` was never looked up. 10 mutants, all killed. |
| `served-models-hardening/` | **`servedModelsOf` answers a malformed body with a verdict, not a fault** — found by a verifier reviewing this round's plans, against code this round had just committed. 4 mutants, all killed. |

## Mapped, adversarially refuted, and NOT yet built

Three plans went through a map and an independent refuter. **All three
recommendations survived; none survived unchanged.** What the refuters corrected
is recorded because it is the part that would otherwise have been built wrong.

### Door 1 — `PATCH /sections/:sectionId`, the section save

The two-verdict plan **survives and is strengthened**: strip-and-disclose when
the server cannot tell; 403 when a **verified** claim's served model RULE 2 does
not admit; one verdict gating both channels (the `acceptedAuthors` bypass is
real and every link was re-confirmed); the refusal before `pool.connect()`.

Two corrections worth more than the plan:

- **A red test in the plan would have passed on its first run.** The map argued
  that an "armed autosave re-sends identical bytes, so the strip happens anyway,
  one save later, with no human deciding it". `doSave` disarms the timer and
  nulls the pending ref at its head, before the request; arming happens only on
  an edit; there is no interval. The test would have "proved" a gate that was
  never at risk — the tautological-test anti-pattern, caught before it was
  written rather than after.
- **The map's own self-declared blocker was already answered.** It wanted a
  probe first, because if the plain-text-vs-markdown comparison never worked
  against a real editor claim then verdict (B) could never fire.
  `authoring-decision-source.pglite.test.ts` exercises exactly that at HEAD. A
  round would have been spent proving something already proven.

### Door 3 — the section revert. **Do not gate it. Restore the attribution.**

The map found a defect of its own, high severity and not what this round went
looking for: the revert's SELECT **deliberately narrows the row** and so
discards `origin` and `inputs.contributors` — the machine-author list on an
append-only row, the one provenance fact the restored version carries about
itself. Then:

- `draft_source` is overwritten with **NULL, unconditionally**, so reverting to
  AI-drafted text erases `'ana'` from the system of record, and the next save's
  snapshot records `author_kind 'unspecified'` over model prose — the exact
  fabrication `20260822_section_version_author_kind_unspecified.sql` exists to
  prevent;
- attribution is decided by **text-hash carry-forward** against the spans live
  *now*, which describe the content being reverted away *from*. Probed: after an
  intervening reword, a revert to AI text files the model's sentence as the
  reverter's own Part 11 `author_assertion`, and the `'ana'` row stays retired.

And the refuter's argument against gating it is better than the plan's
reasoning for it. **There is no claim to refuse** — the machine attribution
comes from the database, not the request; the only refusable thing is the revert
itself. Refusing would pin the unqualified text the person is trying to leave,
and the reachable alternative is a retype, which lands the same words as the
person's own. Worse, the verdict is only recoverable for content that came
through the AI-draft route, so a verdict-based refusal would **refuse reverts of
well-recorded content and wave through poorly-recorded content** — firing on the
door that keeps records and not on the door that does not.

One part of the map was **dropped outright**: retiring the live span set before
`lineage-gate.ts`'s early return would wipe every span of a section on a
**title-only** PATCH, because the save door calls the gate unconditionally with
`content` undefined.

### The records listing — `servedBy` after a reload

**Survives in part.** The one-line client change is right and the red test is
the right red test. Two of the map's recommendations were refuted and must not
be built: an in-SQL hash check that **is the table's own CHECK constraint** and
cannot be false; and rewriting two committed tests that **do not touch the
listing** and would have been presented as regression evidence for a change
they never exercise — deleting round 13's pinned wording coverage in the
process.

The access question was settled in the map's favour on all six grounds:
`servedBy` names **models**, not people, and a gate whose verdict depends on the
reader is not a gate.

## What is NOT verified, still

Round 14's nine-exit enumeration was never adversarially refuted (both verifiers
died on a session limit). It remains a lead, not a finding. Nothing shipped in
round 14 or round 15 rests on it.

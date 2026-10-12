# Does the document agree with itself? (2026-10-12)

**Row:** D2 (AnA document intelligence). **Workstream:** the clinical figure claim engine.

## The gap

`section-claims-check.ts` (landed earlier today) sets a section's figures against the figures the
documents it **cites** state. It needs cited sources, so it runs at the save of an AnA draft and
nowhere else. The limitation was recorded as owed in that step's own evidence:

> The check runs at **save of an AnA draft**. A section a person edits by hand afterwards, and a
> document imported rather than drafted, carry no claims record.

This closes it, for the question that needs nothing outside the document: **the same figure, in the
same frame, stated twice in two different sections, with two different values.** A CSR synopsis that
disagrees with its own body. A 2.7.4 whose overall-profile paragraph disagrees with its per-study
one. It is among the oldest findings in medical writing, and it is what ICH E3 asks of a CSR
directly — every number in the text agrees with the table it came from.

The engine already answered it and nothing called it: `compareWithin` pairs claims whose frames are
identical and whose sections differ, and 37 of the corpus's 431 cases are that lens
(`synopsis-body-27x`).

## What runs now

**`server/services/authoring/document-figure-consistency.ts`** — pure. It hands the engine the
document as one source with its section headings intact (`"2.7.4.1 <title>"` then the section's
readable text), so each claim carries the section it came from, and reads the result back per
section, converting each offset to one within that section's own text.

Two figures are compared only when their frames are identical — study or pool, population, arm,
scope, timepoint, effect measure, interval level and sidedness. Figures whose frames differ are not
compared **and are not reported here**: inside one document a frame difference is usually two
legitimately different figures, not a finding, and this check answers one question. Nothing is
corrected and no prose is written.

**The route.** `POST /sections/:sectionId/ai/deficiency-scan` — the call the editor's section-check
panel already makes — now also returns `document_figure_consistency`, one engine run over every
section of the open document. Absent when the sections could not be read: a failed read is never an
empty result, which here would read as *"the document agrees with itself"*.

**The panel.** A line in the same block as the record requirements, `section-check-consistency`. On
a disagreement it names both values and both section codes. On agreement it says *"N figure pair(s)
in this document were set against each other and none disagree"* — never that the figures are
consistent, because only identical frames were compared. With nothing compared it says so.

No new destination, no new nav entry, no new drawer tab, no dashboard, and no new route: the check
rides the call the author already makes.

## Verified by making the check fail

Red first: the test file was written and run before the module existed
(`Cannot find module '../document-figure-consistency'`), then against the unwired route and panel.

Each part was then reverted on the green tree:

| Reverted | Result |
|---|---|
| the route stops returning `document_figure_consistency` | 1 failed |
| the panel says "are consistent" instead of "none disagree" | 1 failed |

And the invariant that matters is asserted directly rather than described: over a disagreement, an
agreement, a document with no figures and a document with one section, **the verdict says exactly
what the list holds** — never `conflicts_found` with no conflict listed, never anything else with
one listed, and `conflicts ≤ compared`, `comparisons.length ≤ min(compared, CONSISTENCY_KEPT)`.

## Three guards the corpus cannot make fail, said as such

Reverting each of these changes no result today. They are kept, and the code says why, rather than
being presented as proven:

- **the `< 2` section short circuit** — `compareWithin` already pairs only claims whose sections
  differ, so one section can produce no pair. Reverting it spends an engine run to reach the same
  answer. It is a short circuit, not a correctness guard, and the comment says so.
- **the `sa.code === sb.code` skip** — the engine's own `a.section !== b.section` is the first
  guard; this is the second, over the codes the authoring record actually holds, for two sections
  filed under one code or a heading the engine named by its title rather than its number.
- **recomputing the verdict from what survived the section mapping** — the two agree on every
  corpus case. It is kept because the verdict must describe the comparisons in *this* record, and a
  record that says "conflicts found" with no conflict listed is the kind of report this engine
  exists to prevent. The invariant is asserted; the branch is not claimed to be exercised.

A rule that cannot be shown to fail was removed outright in the engine's own commit. These three
are different: each is a second guard behind a first that *is* proven, and deleting them would make
the code worse for no gain. What is not honest is calling them tested, so the code does not.

## This step states no new regulatory fact

It compares the document's own figures with each other. Every rule it applies is the engine's,
already pinned by the 431-case corpus; no regulator text is cited and none is needed.

## Green

- `server/services/authoring/__tests__/` — 32 files, 538 tests.
- the workbench-touching client tests — 18 files, 187 tests.
- `npx tsc --noEmit` over the whole tree, and ESLint over the new files: clean.

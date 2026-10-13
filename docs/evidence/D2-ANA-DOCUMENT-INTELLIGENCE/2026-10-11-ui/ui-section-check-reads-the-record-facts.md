# ui:section-check — regulator facts relied on

Step: `ui-section-check-reads-the-record`
Date of this file: 2026-10-11
Files changed: `server/routes/authoring.router.ts`,
`client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`

## This step states NO new regulatory fact

It moves content that already exists in the repository onto a surface, and it
removes one claim the code was making. Nothing here asserts a requirement that
was not already recorded, and no figure or verdict is computed anywhere in the
browser.

| What is shown to the author | Where it comes from | Standing |
|---|---|---|
| The elements a CTD section must contain (e.g. 2.5's nine) | `server/services/ind/ctd/authoring-guidance.ts` → `CTD_AUTHORING_GUIDANCE[code].keyContentElements`, read through `resolveSectionBriefSource` / `resolveRequirements` | **recall** — the platform's compiled drafting guidance over the ICH M4 CTD organisation. NOT verified against a regulator page by this step. |
| Which entry answered (`exact` / `ancestor` / `parent`) | `server/services/ind/ctd/section-brief.ts` `resolveSectionBriefSource` | deterministic resolver output |
| The sections a parent code contains (e.g. 4.2.3 → 4.2.3.1 … 4.2.3.7) | the same record's registered child codes | recall, as above |
| "not indexed" and its wording | `server/services/ind/ctd/requirements-resolver.ts` `resolveRequirements` → `{ kind: 'not_indexed', reason }` — said to the reader as is | the resolver's own words |

### How the basis is labelled

The record carries no typed `RegulatoryBasis` for a CTD section —
`requirements-resolver.ts` returns `basis: []` for `ctd-section` answers and
says so in its own `RequirementAnswer` documentation. So the basis is stated as
exactly what it is, through `basisLabel()` from
`shared/regulatory/regulatory-basis.ts`:

> ICH M4 CTD content, as compiled in the platform record
> (server/services/ind/ctd/authoring-guidance.ts) (recall — not checked against
> the regulator's text)

`confidence: 'recall'`, so `basisLabel` can never render it as checked
regulator text. No URL and no check date are claimed, because none was
performed in this step. Giving every registered code a verbatim, dated ICH M4 /
M4E / M4Q / M4S citation is the section-basis step the resolver's header already
anticipates; it is recorded in `needs_elsewhere`, not quietly asserted here.

## The false statement removed

`server/routes/authoring.router.ts`, module_keywords deficiency (before this
change):

```
recommendation: `Include discussion of ${keyword} as required by ${region} guidelines`
```

That is a **word-presence heuristic reported as a requirement of the agency**.
No FDA, EMA or PMDA document requires the string "stability" to appear in a
section; the only thing established is that a keyword in the platform's own
module profile (`requiredKeywords`, five module labels, 4–6 words each) did not
appear in the saved text — in the same response the handler frames as "not a
compliance determination". It now says only that:

```
The keyword profile for module M3 expects stability to be discussed.
This is a word-presence signal from that profile, not an agency requirement.
```

`region` is still reported on the response; it is no longer cited as the author
of the expectation.

## What this step does NOT claim

- It does not claim the section's content satisfies any element.
  `verified_by_this_check: false` is on the payload and the panel says "This
  check does not verify these elements." A substring test over descriptions
  ("Product development rationale linking unmet need, MOA, and program design
  (2.5.1)") cannot verify them, so none is performed and no deficiency is
  raised from them.
- It does not add a check to the scan's denominator: `checks_run` for a 2.5/M2
  section is still 5 (pinned by the test).
- It does not say "nothing required" for a code the record does not index. The
  payload is always present and carries the resolver's reason; the panel reads
  "Required content — not indexed." followed by that reason.

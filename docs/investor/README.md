# Investor technical white paper

A 37-page technical white paper on the platform, written for prospective
investors. Cover, contents, and 35 content sections — one section per page.

There is deliberately no page limit. Earlier revisions were capped at 10 and then
15 pages, and both times the cap was paid for by omitting whole capability
domains — CMC, CSR, protocol development, risk-based monitoring, quality and
labeling among them. Length is set by what the platform contains.

| File | Role |
|---|---|
| `whitepaper.html` | The document. One `<section>` per page. |
| `whitepaper.css` | Print stylesheet, built to the platform design system. |
| `Concept2Cure-RI-Technical-White-Paper.pdf` | The rendered deliverable. |
| `PLATFORM_INVENTORY.md` | Capability inventory derived from the code. |
| `fonts/` | Lora + Inter, fetched at build time. Not committed. |

## Building

```bash
node scripts/build-investor-whitepaper.mjs --fetch-fonts   # first run
node scripts/build-investor-whitepaper.mjs                 # subsequent runs
npm run pack:whitepaper                                    # same thing
```

Rendering goes through headless Chromium rather than a PDF library, because the
layout depends on real CSS paged-media support (`@page` margins, `break-inside`,
running heads). The script finds Chromium at `CHROME_PATH`, then at the usual
Playwright and system locations.

Without `fonts/` the paper still renders, falling back to the system serif and
sans — but line breaks shift, and the section-per-page fit is not guaranteed.

---

## The four rules

These exist because each was learned by getting it wrong in a published
revision. They are ordered by how expensive the mistake was.

### 1. `concept2cure-v2` is the only branch of truth

Every claim must be derived from it. Fetch, merge, and verify zero drift before
measuring anything:

```bash
git fetch origin concept2cure-v2 && git merge origin/concept2cure-v2
git diff --name-only origin/concept2cure-v2...HEAD   # expect only docs/investor
```

A revision published nine already-fixed items as open because it was measured
from a base 16 commits behind. On a codebase moving at this rate, a day-old base
is a materially different product.

Note that the repository's pre-push hook enforces this, but is **silently inert
in any environment that has not run `npm ci`** — husky is not installed, so the
hook never fires.

### 2. Verify operation, not intent

`docs/GA_COMPLETION_LEDGER_2026-08.md` is the authority on what actually
operates; its §5 lineage rows were verified by reading code. Read it before
marking any control "built", and check it against the deploy branch rather than
your working branch.

Three drafts overstated Part 11 e-signature and lineage because they were
assessed from docstrings and CI-gate names — both describe *intent*. A docstring
says what a module is for; it does not say whether anything calls it. The
recurring defect shape in this codebase is a correct mechanism with no call site.

### 3. A co-located test ratio is not a coverage measure

Statistics reads 7 tests / 24 services when counted inside
`server/services/stats`, which looks thin — but six reference suites in
`tests/biostat/` pin its output against published tables. Before citing a ratio
as evidence of thin coverage, check whether that domain's tests live somewhere
else.

### 4. Breadth lives in the schema, not the service names

Read `PLATFORM_INVENTORY.md` before writing about scope. Two drafts understated
the platform as three submission journeys when the schema spans grant funding
through post-approval change, omitting CMC, CSR, protocol development,
risk-based monitoring, IRB, supply chain, QMS/QC and labeling entirely.

The submission chain is the most *legible* part of the codebase, so it is what a
quick pass finds. Breadth lives in the table families and the 118 rendered
surfaces.

---

## Editing

Each `<section>` must fit one printed page. The printable box on US Letter at the
configured margins is **254mm tall by 186mm wide**; a taller section silently
spills onto a second sheet and pushes every subsequent page out of alignment with
its running head.

After any content change, verify both the page count and the alignment:

```bash
python3 -c "
from pypdf import PdfReader
import re
r = PdfReader('docs/investor/Concept2Cure-RI-Technical-White-Paper.pdf')
bad = [i+1 for i, p in enumerate(r.pages)
       for t in [' '.join((p.extract_text() or '').split())]
       for m in [re.match(r'^(\d\d) · .*?\s(\d+)\s+SECTION', t)]
       if m and int(m.group(2)) != i+1]
print('pages', len(r.pages), '| mismatches:', bad or 'NONE')"
```

To find *which* section overflowed, measure at print width:

```js
document.body.style.width = '186mm';
document.querySelectorAll('section').forEach((s, i) =>
  console.log(i + 1, Math.round(s.getBoundingClientRect().height / 3.7795) + 'mm'));
```

If you script that into a throwaway copy of the page, **write the copy into
`docs/investor/`**. `whitepaper.html` links its stylesheet relatively, so a copy
in a scratch directory renders unstyled and reports heights for a document that
does not exist — plausible numbers, entirely wrong. The PDF's page count is the
only measurement that cannot lie to you this way.

### Numbering is generated, not hand-maintained

Section numbers, running heads, page numbers and the contents table are all
derived from document order:

```bash
node scripts/renumber-investor-whitepaper.mjs           # rewrite
node scripts/renumber-investor-whitepaper.mjs --check   # CI-style, non-mutating
```

Do not edit them by hand. Adding a section means inserting a
`<!-- ═══ PAGE 0 · TITLE ═══ -->` marker, adding the contents row in the right
place, and re-running the pass — the `PAGE N ·` prefix is what the splitter
matches on, and a marker without it is silently absorbed into the previous
section. The pass also verifies that each contents row still matches the title
of the section it points at.

**Cross-references are not generated.** After any renumbering, re-audit every
`Section NN` in prose against the actual section titles. A restructure left 32 of
61 references pointing at a valid but wrong section — they resolve, so nothing
fails; they are just incorrect.

Ranges need their own pass. A bulk shift matches `Sections 16` in
"Sections 16 to 20" and leaves the `20` behind, silently widening or narrowing
the range.

---

## On the content

The contents page states the provenance of every figure, split into two classes:

- **Derived from `concept2cure-v2` today** — service, file and line counts,
  schema declarations, routes and handlers, client surfaces, CI guards, registry
  contents, navigation reach, per-domain test ratios.
- **Not re-derivable from source, and attributed** — the 931 tables / 787 RLS
  policies need a live installer run against Postgres (code-only proxy: 705
  Drizzle declarations); the passing-test count is from an executed CI run;
  Section 29's audit is a 10 August snapshot whose aggregates are reported as
  history; market facts in Sections 02–03 come from a benchmark of public agency
  notices.

Keep that split honest. If a figure moves from one class to the other — for
instance because someone runs the installer and re-counts — move it in the note
too.

**Sections 29 to 31 are load-bearing and decay fastest.** Section 29 pairs each
of the audit's severe findings with the state of that mechanism in code; Sections
30 and 31 are the ready/weak assessment. Every row was confirmed by reading
current source rather than a changelog. Two rules when editing them: re-verify
the same way, and do not reintroduce the audit's aggregate scores as current
state — they were a snapshot, substantial work has landed since, and no second
audit has re-measured them.

The paper deliberately states open gaps and names their owners, mirroring the
completion ledger. That posture is the point: the same CI gate that polices
unqualified compliance claims in the product
(`scripts/ci/check-compliance-claims.mjs`) reflects the standard this document is
written to.

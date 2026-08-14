# Investor technical white paper

A 31-page technical white paper on the platform, written for prospective investors.
Cover, contents, and 29 content sections — one section per page.

There is deliberately no page limit. Earlier revisions were capped at 10 and then
15 pages, and both times the cap was paid for by omitting whole capability
domains — CMC, CSR, protocol development, risk-based monitoring, quality, and
labeling among them. Length is set by what the platform contains.

| File | Role |
|---|---|
| `whitepaper.html` | The document. One `<section>` per page. |
| `whitepaper.css` | Print stylesheet, built to the platform design system. |
| `Concept2Cure-RI-Technical-White-Paper.pdf` | The rendered deliverable. |
| `fonts/` | Lora + Inter, fetched at build time. Not committed. |
| `PLATFORM_INVENTORY.md` | Capability inventory derived from the code. Read this before writing about scope. |

## Building

```bash
node scripts/build-investor-whitepaper.mjs --fetch-fonts   # first run
node scripts/build-investor-whitepaper.mjs                 # subsequent runs
```

Rendering goes through headless Chromium rather than a PDF library, because the
layout depends on real CSS paged-media support (`@page` margins, `break-inside`,
running heads). The script finds Chromium at `CHROME_PATH`, then at the usual
Playwright and system locations.

Without `fonts/` the paper still renders, falling back to the system serif and
sans — but line breaks shift, and the section-per-page fit is not guaranteed.

## Editing

Each `<section>` must fit inside one printed page. The printable box on US Letter
at the configured margins is **254mm tall by 186mm wide**; a section taller than
that silently spills onto a second sheet and pushes the whole document out of
shape. After any content change, re-render and confirm the page count is still 31:

```bash
python3 -c "from pypdf import PdfReader; \
  print(len(PdfReader('docs/investor/Concept2Cure-RI-Technical-White-Paper.pdf').pages))"
```

To find *which* section overflowed, measure them in the browser at print width:

```js
document.body.style.width = '186mm';
document.querySelectorAll('section').forEach((s, i) =>
  console.log(i + 1, Math.round(s.getBoundingClientRect().height / 3.7795) + 'mm'));
```

## Before claiming anything works

`docs/GA_COMPLETION_LEDGER_2026-08.md` is the authority on what actually
operates, and its §5 lineage rows were verified by reading code. Read it before
marking any control "built" — **and check the ledger against the deploy branch,
not against the branch you are on.** Nine severe rows closed within hours of the
ledger being written; a revision of this paper published them as open because it
was assessed from a base 16 commits behind `concept2cure-v2`. Fetch and merge
first, then verify each row in the merged tree. Three drafts of this paper overstated Part 11
e-signature and lineage because they were assessed from docstrings and CI-gate
names — both of which describe intent. The ledger records that the §11.70 tamper
check has no production caller, the provenance tables have no writers, and model
attribution is dropped at draft-accept. Sections 25 and 26 of the paper carry
that assessment; keep them synchronized with the ledger, not with the docstrings.

## Before writing about scope

Read `PLATFORM_INVENTORY.md` first. It maps every service domain, table family
and client surface to a lifecycle stage, and it exists because the first drafts
of this paper twice understated what is built — describing the platform as three
submission journeys when the schema spans grant funding through post-approval
change control, and omitting CMC, CSR, protocol development, risk-based
monitoring, IRB, supply chain, QMS/QC and labeling entirely.

The failure mode is specific and worth naming: the submission chain is the most
*legible* part of the codebase, so it is what a quick pass finds. Breadth lives
in the table families and the 107 client surfaces, not in the service names.

## On the content

Every quantitative claim is derived from this repository or from the independent
15-domain readiness assessment dated 2026-08-10 — file counts, route
registrations, the AnA capability manifest, the installer's provisioned table and
policy counts, and that audit's executed evidence. Nothing is estimated for
effect. When the platform changes materially, the figures in Sections 04 and 08
and the state tables in Sections 09, 16–18 and 24 need re-deriving, not just
re-wording.

**Sections 24-26 are the load-bearing ones, and it decays fastest.** It pairs each of
the audit's severe findings with the state of that mechanism in the code, and
every row was confirmed by reading current source rather than a changelog. Two rules when editing it. First, re-verify the same way — a remediation claim taken
from a commit message is exactly the kind of assertion this document exists to
avoid. Second, do not reintroduce the audit's aggregate scores as current state:
they were a 2026-08-10 snapshot, substantial work has landed since, and no second
audit has re-measured them. The paper says so explicitly; keep it that way unless
a fresh audit exists to cite.

The paper deliberately states open gaps and names their owners, mirroring
`docs/GA_COMPLETION_LEDGER_2026-08.md`. That posture is the point: the same CI
gate that polices unqualified compliance claims in the product
(`scripts/ci/check-compliance-claims.mjs`) reflects the standard this document is
written to.

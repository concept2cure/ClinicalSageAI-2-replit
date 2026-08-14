# Investor technical white paper

A 15-page technical white paper on the platform, written for prospective investors.
Cover, contents, and thirteen content sections — one section per page.

| File | Role |
|---|---|
| `whitepaper.html` | The document. One `<section>` per page. |
| `whitepaper.css` | Print stylesheet, built to the platform design system. |
| `Concept2Cure-RI-Technical-White-Paper.pdf` | The rendered deliverable. |
| `fonts/` | Lora + Inter, fetched at build time. Not committed. |

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
shape. After any content change, re-render and confirm the page count is still 15:

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

## On the content

Every quantitative claim is derived from this repository or from the independent
15-domain readiness assessment dated 2026-08-10 — file counts, route
registrations, the AnA capability manifest, the installer's provisioned table and
policy counts, and that audit's executed evidence. Nothing is estimated for
effect. When the platform changes materially, the figures in Sections 04 and 08
and the state tables in Sections 06, 07 and 10 need re-deriving, not just
re-wording.

**Section 10 is the load-bearing one, and it decays fastest.** It pairs each of
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

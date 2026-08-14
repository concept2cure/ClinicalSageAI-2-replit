# Investor technical white paper

A 10-page technical white paper on the platform, written for prospective investors.
Cover, contents, and eight content sections — one section per page.

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
shape. After any content change, re-render and confirm the page count is still 10:

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

Every quantitative claim is derived from this repository — file counts, `pgTable`
declarations, route registrations, test files, the AnA capability manifest, and
the platform's own readiness ledgers under `docs/`. Nothing is estimated for
effect. When the platform changes materially, the figures in Sections 03 and 07
and the readiness table in Section 08 need re-deriving, not just re-wording.

The paper deliberately states open gaps and names their owners, mirroring
`docs/GA_COMPLETION_LEDGER_2026-08.md`. That posture is the point: the same CI
gate that polices unqualified compliance claims in the product
(`scripts/ci/check-compliance-claims.mjs`) reflects the standard this document is
written to.

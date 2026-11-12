# The demo seed's PDFs print what their text says (2026-11-12)

Package **DATA** (the demo seed), launch row **D2**. Session `session_011DpxUyQmE1enma4gTjcfBy`. It closes
`GA-DEMO-14` of the GA map's ledger (`docs/evidence/GA-READINESS/2026-11-10/ledger.json`): "Every seeded biotech PDF
prints '?' for dashes, >=, <= and minus; subtitle runs off the page". Close condition: "Transliterated or Unicode font;
subtitle wraps; IB and Protocol reopened."

## What already exists (RULE 3)

`scripts/demo/launch-demo/lib.mjs` `makeMultiPagePdfBuffer` is the one PDF writer every pack uses (biotech, Lumen,
device, Faux). It draws with Helvetica and `WinAnsiEncoding`, and `pdfLatin1` turned every character outside Latin-1
into "?". The device pack had worked around it with its own `latin1` helper (`mdx-shared.mjs`); the others had not.
Nothing else writes these PDFs.

## What changed

In `lib.mjs` only:
- The dashes, curly quotes, bullet, ellipsis, euro and trade mark sign are written at their own WinAnsi codes
  (0x80–0x9f), so the font draws them.
- Characters WinAnsi lacks and the pack prose uses are written out: ≥ as ">=", ≤ as "<=", the minus sign as "-",
  → as "->", the Greek letters by name, box-drawing rules as "-".
- The title and subtitle wrap to the 468 pt column, and the running header is cut with an ellipsis past 110
  characters.

## Proof

- **Test, red first:** `scripts/demo/launch-demo/pdf-text.test.mjs` (no character prints as "?"; each kept character
  has its WinAnsi code; title and subtitle fit the column and keep every word in order). All three fail with the old
  writer and pass with the new one. All 168 tests in `scripts/demo/launch-demo/` pass.
- **The pack's own PDFs, read as a reader reads them** (`render-pack-pdfs.mjs`: the biotech pack's six Vault documents
  built exactly as `biotech.mjs` builds them, then `pdftotext -layout`):

  | Document | "?" before | "?" after | Widest line before | after |
  |---|---:|---:|---:|---:|
  | Investigator's Brochure | 9 | 0 | 107 | 89 |
  | Protocol | 23 | 0 | 104 | 88 |
  | Statistical Analysis Plan | 10 | 0 | 102 | 88 |
  | CMC Quality Summary | 19 | 0 | 105 | 92 |
  | Nonclinical Toxicology Summary | 11 | 0 | 89 | 92 |
  | Pre-IND Meeting Minutes | 19 | 4 | 108 | 89 |

  The four left in the minutes are the sponsor's own questions ("…to support a 16-week Phase 2 study with a 36-week
  extension?"). The widest lines after are body text, which the writer wraps at 88 characters as before.
- **Page one of the protocol** (`protocol-page-1.png`, rendered with `pdftoppm`): "2–3 %", "18–75 years", "PASI >= 12",
  and the title on two lines inside the margin.

## Not covered

- A database seeded before this change keeps its PDFs: the pack finds a document by its title and does not upload it
  again. A fresh Codespace gets the new ones.

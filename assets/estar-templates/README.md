# FDA eSTAR templates (drop-point)

This directory holds the **official FDA eSTAR interactive PDF templates**. They
are distributed by FDA and, following the same vendoring policy as
`assets/ectd-dtd/`, are **committed here verbatim** and pinned by
`checksums.txt` — a template swap without re-verification would silently change
what gets written into a submission. The code in
`server/services/pathway-engines/estar/estar-template-registry.ts` reads the
templates from here (or from `ESTAR_TEMPLATE_DIR`) and fails closed — when a
required template is missing and `ESTAR_REQUIRE_TEMPLATE=true` in production —
so the platform never claims a "submittable eSTAR" it cannot actually produce.

This mirrors the eCTD DTD drop-point pattern in `assets/ectd-dtd/`.

## Why this matters

CDRH/CBER ingests the **official eSTAR PDF** (a specific interactive AcroForm the
manufacturer downloads and fills), not a ZIP of separately-rendered section
PDFs. To produce a real submission the platform fills the official template —
which requires the template file to be present here.

## The three eSTAR template families

FDA distributes eSTAR as three interactive-PDF families. The authoritative
version/OMB/retirement facts live in
`server/services/pathway-engines/estar/estar-versions.ts` (`ESTAR_VERSIONS`), and
the full list of what each can carry lives in `estar-catalog.ts`:

| Family | Current version | Used for | OMB numbers |
|---|---|---|---|
| Non-In Vitro Diagnostic (nIVD) eSTAR | **7.0** (6.2 retires 2026-08-03) | 510(k), De Novo, **PMA** — non-IVD devices | 0910-0120, 0910-0844, 0910-0231 |
| In Vitro Diagnostic (IVD) eSTAR | **7.0** (6.2 retires 2026-08-03) | 510(k), De Novo, **PMA** — IVD devices | 0910-0120, 0910-0844, 0910-0231 |
| Early Submission Requests eSTAR (PreSTAR2) | **3.0** (2.2 retires 2026-08-03) | Q-Submissions, IDEs, 513(g) requests | 0910-0756, 0910-0078, 0910-0511 |

A retired eSTAR version is still accepted by FDA but may draw information
requests about the version delta; the current version is recommended for
immediate use.

## What to drop in

Download the current eSTAR templates from FDA and place them here, matching the
filenames in `ESTAR_TEMPLATE_MANIFEST` (update the manifest filenames + pinned
`version` if FDA's distribution names differ). Several logical descriptors
resolve to the **same** physical FDA PDF: per the family table above FDA ships
ONE nIVD eSTAR PDF and ONE IVD eSTAR PDF that each carry 510(k), De Novo and PMA
— the pathway is selected inside the form (`root.ApplicationType.USA.ATRadioButton110`),
not by downloading a different file. So the De Novo and PMA descriptors point at
the 510(k)-named files below; only their field maps differ (the 510(k) Summary
page and predicate fields are 510(k)-only):

| Pathway | Variant | Family | Descriptor id | Expected filename |
|---|---|---|---|---|
| 510(k) | Device (non-IVD) | nIVD | `510k-device` | `eSTAR-510k-non-ivd.pdf` |
| 510(k) | IVD | IVD | `510k-ivd` | `eSTAR-510k-ivd.pdf` |
| De Novo | Device (non-IVD) | nIVD | `de_novo-device` | `eSTAR-510k-non-ivd.pdf` (same file as 510(k)) |
| De Novo | IVD | IVD | `de_novo-ivd` | `eSTAR-510k-ivd.pdf` (same file as 510(k)) |
| PMA | Device (non-IVD) | nIVD | `pma-device` | `eSTAR-510k-non-ivd.pdf` (same file as 510(k)) |
| PMA | IVD | IVD | `pma-ivd` | `eSTAR-510k-ivd.pdf` (same file as 510(k)) |
| Q-Submission | PreSTAR | PreSTAR | `q_sub-prestar` | `PreSTAR-q-sub.pdf` (not vendored) |
| IDE | PreSTAR | PreSTAR | `ide-prestar` | `PreSTAR-ide.pdf` (not vendored) |
| 513(g) | PreSTAR | PreSTAR | `513g-prestar` | `PreSTAR-513g.pdf` (not vendored) |

FDA eSTAR program page: <https://www.fda.gov/medical-devices/premarket-submissions-selecting-and-preparing-correct-submission/estar-program>

## Currently vendored

| File | Family | Version | FDA effective date | Descriptors filled from it | SHA-256 |
|---|---|---|---|---|---|
| `eSTAR-510k-non-ivd.pdf` | nIVD | **7.0** | 2026-06-01 | `510k-device`, `de_novo-device`, `pma-device` | `73de2f1e…0edb92` |
| `eSTAR-510k-ivd.pdf` | IVD | **7.0** | 2026-06-01 | `510k-ivd`, `de_novo-ivd`, `pma-ivd` | `90d93649…c1594f` |

Both are pinned in `ESTAR_TEMPLATE_MANIFEST` (`version: '7.0'` on all six marketing
descriptors) and their versions are read from the templates' own XFA `template`
packet, not from the FDA page. The De Novo and PMA descriptors share these files
because FDA distributes one PDF per family that carries all three marketing
pathways; each descriptor keeps its own field map in `estar-field-map.ts`. The
PreSTAR2 template is not vendored, so its three descriptors stay `'unset'`.

**These are Adobe LiveCycle DYNAMIC XFA forms.** Their AcroForm `/Fields` array is
EMPTY and `/NeedsRendering true` is set — `listAcroFields` returns 0 fields, and no
`acroField` name can ever match. They are filled by writing the XFA `datasets`
packet through a PDF incremental update (`fillXfaDatasets`), which preserves the
original bytes so the output stays the real FDA form. See
`server/services/forms/fill-official-pdf.ts`.

## Versioning

FDA revises eSTAR roughly twice a year. A version bump is a tracked **data** change,
never a code change:
1. Replace the PDF(s) here.
2. Update the matching `version` in `ESTAR_TEMPLATE_MANIFEST` and, for a new FDA
   program version/retirement/OMB change, `ESTAR_VERSIONS` in `estar-versions.ts`.
3. Re-enumerate with `listXfaFields` and re-validate the field map
   (`canonical key → XFA SOM path`) in `estar-field-map.ts` against the new
   template before enabling it for production fills. Every mapped path must be
   declared by the template AND present in its `datasets` skeleton; the fill
   engine skips+warns on anything else rather than inventing a data node.
4. Update `checksums.txt` with the new SHA-256s.

## Environment flags

- `ESTAR_TEMPLATE_DIR` — override this directory.
- `ESTAR_REQUIRE_TEMPLATE=true` — fail closed on missing templates for
  production builds (advisory/report-only otherwise, like the DTD and PDF/A gates).

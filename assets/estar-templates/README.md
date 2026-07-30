# FDA eSTAR templates (drop-point)

This directory is the drop-point for the **official FDA eSTAR interactive PDF
templates**. They are distributed by FDA and are **not committed to this repo**
(licensing/distribution + size). The code in
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
`version` if FDA's distribution names differ). Several logical descriptors may
resolve to the **same** physical FDA PDF — the one nIVD eSTAR PDF carries
510(k)/De Novo/PMA — so a maintainer can point them at a single file:

| Pathway | Variant | Family | Expected filename |
|---|---|---|---|
| 510(k) | Device (non-IVD) | nIVD | `eSTAR-510k-non-ivd.pdf` |
| 510(k) | IVD | IVD | `eSTAR-510k-ivd.pdf` |
| De Novo | Device (non-IVD) | nIVD | `eSTAR-denovo-non-ivd.pdf` |
| De Novo | IVD | IVD | `eSTAR-denovo-ivd.pdf` |
| PMA | Device (non-IVD) | nIVD | `eSTAR-pma-non-ivd.pdf` |
| PMA | IVD | IVD | `eSTAR-pma-ivd.pdf` |
| Q-Submission | PreSTAR | PreSTAR | `PreSTAR-q-sub.pdf` |
| IDE | PreSTAR | PreSTAR | `PreSTAR-ide.pdf` |
| 513(g) | PreSTAR | PreSTAR | `PreSTAR-513g.pdf` |

FDA eSTAR program page: <https://www.fda.gov/medical-devices/premarket-submissions-selecting-and-preparing-correct-submission/estar-program>

## Versioning

FDA revises eSTAR periodically. A version bump is a tracked asset update:
1. Replace the PDF(s) here.
2. Update the matching `version` in `ESTAR_TEMPLATE_MANIFEST` and, for a new FDA
   program version/retirement/OMB change, `ESTAR_VERSIONS` in `estar-versions.ts`.
3. Re-validate the field map (`canonical field → AcroForm field name`) against
   the new template before enabling it for production fills.

## Environment flags

- `ESTAR_TEMPLATE_DIR` — override this directory.
- `ESTAR_REQUIRE_TEMPLATE=true` — fail closed on missing templates for
  production builds (advisory/report-only otherwise, like the DTD and PDF/A gates).

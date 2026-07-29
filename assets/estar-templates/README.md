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

CDRH ingests the **official eSTAR PDF** (a specific interactive AcroForm the
manufacturer downloads and fills), not a ZIP of separately-rendered section
PDFs. To produce a real 510(k)/De Novo submission the platform fills the
official template — which requires the template file to be present here.

## What to drop in

Download the current eSTAR templates from FDA and place them here, matching the
filenames in `ESTAR_TEMPLATE_MANIFEST` (update the manifest filenames + pinned
`version` if FDA's distribution names differ):

| Pathway | Variant | Expected filename |
|---|---|---|
| 510(k) | Device (non-IVD) | `eSTAR-510k-non-ivd.pdf` |
| 510(k) | IVD | `eSTAR-510k-ivd.pdf` |
| De Novo | Device (non-IVD) | `eSTAR-denovo-non-ivd.pdf` |
| De Novo | IVD | `eSTAR-denovo-ivd.pdf` |

FDA eSTAR program page: <https://www.fda.gov/medical-devices/premarket-submissions-selecting-and-preparing-correct-submission/estar-program>

## Versioning

FDA revises eSTAR periodically. A version bump is a tracked asset update:
1. Replace the PDF(s) here.
2. Update the matching `version` in `ESTAR_TEMPLATE_MANIFEST`.
3. Re-validate the field map (`canonical field → AcroForm field name`) against
   the new template before enabling it for production fills.

## Environment flags

- `ESTAR_TEMPLATE_DIR` — override this directory.
- `ESTAR_REQUIRE_TEMPLATE=true` — fail closed on missing templates for
  production builds (advisory/report-only otherwise, like the DTD and PDF/A gates).

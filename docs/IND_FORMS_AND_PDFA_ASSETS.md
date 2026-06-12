# Production assets: FDA forms + PDF/A (the only non-code IND steps)

Everything below is **code-complete and feature-detected** — the platform runs
without these and degrades gracefully (labeled fallback PDFs; pass-through PDFs).
These are the asset/infra steps to reach true filing fidelity. Each is proven by
a test so the handoff is low-risk.

## 1. Official FDA AcroForm PDFs (form-fill fidelity)

The form-fill service (`server/services/ind-forms/ind-form-fill-service.ts`)
fills an official fillable AcroForm PDF when present, else renders a deterministic
**labeled fallback** PDF. Proven by `__tests__/ind-form-acroform-fill.test.ts`
(synthetic AcroForm is filled; absence falls back).

### Steps
1. Download the official fillable PDFs from FDA and place them here (filename =
   form id), or point `IND_FORM_TEMPLATES_DIR` elsewhere:

   | Form | File | Target path |
   |---|---|---|
   | FDA 1571 (IND application) | `FDA_1571.pdf` | `templates/forms/acroforms/FDA_1571.pdf` |
   | FDA 1572 (Statement of Investigator) | `FDA_1572.pdf` | `templates/forms/acroforms/FDA_1572.pdf` |
   | FDA 3674 (ClinicalTrials.gov cert) | `FDA_3674.pdf` | `templates/forms/acroforms/FDA_3674.pdf` |
   | FDA 3454 (financial cert) | `FDA_3454.pdf` | `templates/forms/acroforms/FDA_3454.pdf` |
   | FDA 3455 (financial disclosure) | `FDA_3455.pdf` | `templates/forms/acroforms/FDA_3455.pdf` |

2. Map our field ids → each PDF's internal AcroForm field names in
   `ACROFORM_FIELD_MAP` (top of `ind-form-fill-service.ts`). Inspect a PDF's
   field names with:
   ```js
   const { PDFDocument } = require('pdf-lib');
   const doc = await PDFDocument.load(require('fs').readFileSync('FDA_1571.pdf'));
   console.log(doc.getForm().getFields().map(f => f.getName()));
   ```
   Then, e.g.: `ACROFORM_FIELD_MAP['FDA_1571'] = { sponsor_name: 'form1[0].Page1[0].SponsorName[0]', ... }`.
   (When a field id already equals the AcroForm name, no entry is needed — the
   fill defaults `acroName = fieldId`.)

3. Optional: set `IND_FORM_TEMPLATES_DIR` if the PDFs live outside the repo.

The builders that produce the field ids are in `ind-form-data-builders.ts`
(`buildForm1571`/`1572`/`3674`/`3454`/`3455`); their `labels*()` exports document
every field id.

## 2. Ghostscript / veraPDF (PDF/A-1b conversion)

The PDF/A pipeline (`server/services/ectd/pdfa-pipeline.ts`) converts each leaf
to PDF/A-1b when **Ghostscript** is present, validates with **veraPDF** when
present, and passes through unchanged otherwise (feature-detected; never throws).
It is wired into the packager before the index-md5 is computed.

### Steps
Add to the deployment container image:
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends ghostscript \
    && rm -rf /var/lib/apt/lists/*
# optional, for validation:
# install veraPDF per https://verapdf.org/ and put it on PATH
```
Env overrides (optional): `GHOSTSCRIPT_BINARY`, `VERAPDF_BINARY`.

## 3. Quick verification after providing assets
```bash
# forms: drop a real FDA_1571.pdf in templates/forms/acroforms, then
curl -X POST localhost:PORT/api/ind-forms/FDA_1571/pdf -H 'content-type: application/json' \
  -d '{"sponsorName":"Acme","drugName":"C2C-001"}' -o 1571.pdf
# header X-Form-Used-Official-Template: true  ⇒ the official template was filled

# PDF/A: with gs installed, packaged leaves convert to PDF/A-1b automatically;
# pdfa-detect classifies the result.
```

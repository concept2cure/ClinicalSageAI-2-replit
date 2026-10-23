# Complete ordinary Authoring PDF output

W1 / D2. Work in progress on `concept2cure-v2`, following
`docs/design/AUTHORING_PDF_CONVERGENCE.md`.

## What already exists

The canonical `server/services/authoring/authoring-export.ts` already creates
rich DOCX and converts retained company correspondence using strict
`server/services/pdf-converter.ts`. Ordinary PDFs still use
`server/export/renderers.ts`, whose optional Chromium lane can fall back to a
labelled text PDF. `server/services/authoring/authoring-file-to-vault.ts`
correctly refuses that fallback, so the installed Word converter does not yet
make ordinary PDF filing available. Existing export/working-copy routes and
their current-source, signature, audit, admission and uncertain-outcome checks
remain canonical. Existing rich Word blocks own tables, images, captions,
citations, footnotes and pending revisions. The production image already
includes LibreOffice and fonts. No new renderer or dependency is required.

Searches covered those render/export/filing/working-copy/converter names in
code, routes, documentation and tests, plus deleted history for Authoring
exports and PDF renderer/converter names. No retired competing converter was
found. The design records the full inventory and implementation boundary.

Verification results will distinguish observed failures, corrected runs,
actual PDF artifact checks and branch publication. No passing result or
production/agency acceptance is claimed before execution.

# Retained report-pack PDF renderer evidence

W1 / D2, `concept2cure-v2`, over published checkpoint
`10f4e4557df94e3f5bf0f79d9a07c38465e770d2`. This increment verifies the canonical
PDF renderer and its source contracts. Route admission, actual database/RLS,
export audit commit and application UI are the adjoining integration work;
these renderer tests do not establish those boundaries.

## Implemented behavior

`buildReportPackPdf` receives admitted retained report inputs in the backend's
saved `bundle.runIds` order. It uses the same `writeRunPdfContent` helper as the
individual run export for complete headers, bodies, tables, supported recorded
charts, source references, calculation evidence and signature/seal facts. It
creates no report computation, signature, database record or provider turn.

The new packet includes an index and actual one-based report page ranges.
Every report page, including calculation-evidence overflow, retains its own run
and scope identity. Non-final pages are marked with their actual status;
legacy final reconstruction is explicitly marked `UNVERIFIED FINAL COPY`.
Cover text states that the packet has no separate approval or signature.
Returned constituent facts and page ranges are available to the existing
audited exact-byte sender. The backend must still admit and recheck them.

The existing `buildBundlePdf` manifest function is unchanged. The individual
renderer now states missing signature name, meaning and execution time as
`not recorded`; the chain's finalization time does not substitute for a missing
signature execution time. The PDF writer preserves existing string footer and
watermark calls and supports two-line packet identities and per-page marks.

## Red and green observations

- `red-output.log`: **6 failed, 0 passed, 0 skipped**, one physical `/tmp` test
  file, 1.48 seconds, against unchanged production. Five prospective packet
  cases fail because the packet builder is absent. These five are feature
  absence evidence, not exercised access or packet-generation behavior. The
  sixth renders the actual individual PDF and finds `Final. Signed, <chain
  finalization time>` when signature name, meaning and time are absent. The
  expected explicit missing elements are not present.
- `red-report.json`, `red-source-manifest.json` and `red-test-copy.ts` retain
  the bounded run's exact observations, configuration scope and original
  production source pins. The JSON runner counts two logical suites within
  one physical file; it does not represent two source files.
- `green-initial.log`: **31/31**, four physical PDF suites, zero skips, 16.06
  seconds. The first focused lint result found one new complexity warning in
  the defensive packet input guard; `lint-initial.log` retains that result.
- The guard was separated into identity, final-source and source-consistency
  checks. No rule, permission, warning or TypeScript baseline was changed.
  `green-final.log`: **31/31**, the same four suites, zero skips, 13.38 seconds.
  `lint-final.log` has zero errors and zero warnings across all six changed
  production/test files. Its empty content is the successful ESLint output.

The four suites are `report-pack-pdf.test.ts`, `run-pdf.test.ts`,
`bundle-pdf.test.ts` and `export-identity.test.ts` in
`server/services/report-os/pdf/__tests__/`. They extract actual PDF text and
individual page text, inspect metadata and compare deterministic bytes. Cases
cover complete distinct retained bodies/order, multilingual text, tables,
recorded charts, source/calculation evidence, mixed-status body/appendix
overflow, explicit legacy/missing signature facts, inconsistent identities and
source/seal inputs, unsupported glyphs, existing manifests and individual
exports. Aggregate watermark counts alone are not used as page-identity proof.

The final run uses the repository's canonical unit Vitest configuration. Its
global PostgreSQL mock is present, but these renderer paths perform no database
queries; it is not native policy evidence. Renderer fixtures supply synthetic
seal views; the tests do not perform real electronic signing or validate a
clinical/scientific record.

## Evidence identity and limits

`source-artifact-manifest.json` pins the final three production sources and
four executed test files, plus the filed artifacts. Newly filed text logs have
only end-of-file/trailing whitespace normalized for repository checks. Exact
raw logs remain under `/tmp` at the paths and digests the manifest records.
The earlier sealed platform, browser and security evidence is unchanged.

No model/provider call, production deployment, agency transmission, clinical
calculation, new dependency or PDF/A qualification was performed. Correct PDF
copying cannot establish full IND/BLA/CTD content, application requirements,
scientific approval or regulatory acceptance. The whole-project compiler and
publication gates belong to the control tower's subsequent integration.

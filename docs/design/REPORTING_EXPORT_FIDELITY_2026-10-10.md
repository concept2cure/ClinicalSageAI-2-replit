# Reporting export fidelity — 2026-10-10

Branch `concept2cure-v2`; launch workstream W1 / D2. Reconciled with
`cd0140cbd` on 2026-10-13, preserving the current audit-chain checks. The existing Report-OS
run/snapshot/seal/export audit path remains canonical. This remediation changes
its PDF renderer and the existing compliance-report download format action.

## Runtime choice and dependency justification

The platform already declares `pdfkit` and its embedded-font implementation
already supplies fontkit. The canonical report writer now uses that existing
production library for both run and bundle PDF exports. No alternate report
store, snapshot computation, PDF service, or signature implementation is added.
The general HTML renderer cannot guarantee this export because its optional
Chromium driver is not provisioned and its PDFKit fallback removes layout and
cannot preserve the required text with a standard Latin-only font.

The production image needs `fonts-noto-core` and `fonts-noto-cjk`. These are
runtime font assets, required to preserve text already recorded in client
reports. Noto fonts permit embedding. The PDF contains subsets of the used
fonts rather than requiring fonts on the reader's machine. Operators can set
`REPORT_PDF_NOTO_CORE_DIR` / `REPORT_PDF_NOTO_CJK_DIR` for other provisioned
locations. Missing baseline fonts refuse with `REPORT_PDF_FONTS_UNAVAILABLE`;
an unsupported character refuses with `REPORT_PDF_GLYPH_UNSUPPORTED` before the
PDF can leave. Replacing source text with `?` is removed.

`bidi-js@1.0.3` is now declared directly after control-tower coordination,
using the written justification recorded before the package/lock changes. It was
already present transitively through the production HTML sanitization dependency;
the direct pin makes the runtime contract explicit without a new version or lock
resolution. This small MIT-licensed Unicode Bidirectional Algorithm implementation
orders mixed-direction text before the existing fontkit shaping. It avoids adding
a browser runtime or implementing an incomplete second bidi algorithm.

Regression checks cover Arabic lam-alif, Hebrew, and mixed-direction dates with
parentheses. PDFKit's per-word shaping is bypassed; positional Arabic forms stay
enabled while the lam-alif ligature is disabled to preserve independently
extractable source characters. The installed bidi-js mirroring API is called with
its resolved level array. PDF Span ActualText retains original logical text
independently of visual ordering. This is not validation of every script/font or
PDF reader combination.

## PDF identity and content

Run/bundle, export id/time, pages, non-final watermark, signature name/time/
meaning/reason, seal hash, and verification outcome remain visible. PDF metadata
uses the recorded export time. Actual computation scope and the saved calculation
evidence are retained. Existing charts with actual ring/bar/trend values render
as vectors with their recorded values. Unsupported/missing chart series, including stacked/forecast/calibration layouts, retain
their complete specification and an explicit limitation; no sample series is generated.
This output has not been converted or validated as PDF/A and makes no PDF/A claim.

## Same-snapshot CSV

`POST /api/audit/reports/convert` takes
`{ export: { data, manifest, signature }, format: 'csv' }` and returns the same
signed-download envelope as a report run. It verifies the original v2 signature,
SHA-256, tenant and JSON document/manifest consistency before converting any data.
Compliance reports reuse `formatReportCsv` and `buildSignedReport`; full audit
trail snapshots reuse the canonical audit CSV formatter and `sealManifestV2`.
The derived manifest links the original export id/hash. A separate
`compliance.report_export` audit row records the copy before release; inability
to record it refuses the export. Conversion never reruns report SQL or the chain
walk. Original chain verification timestamps are retained, not updated to imply
a fresh chain check. The full audit manifest moves the original export audit
record into its source-export reference so it cannot name it as a newly recorded
export event. Canonical audit CSV also retains comments/created-at and serializes
structured values as JSON rather than `[object Object]`.

Retained snapshots must be v2 JSON exports under a still-configured signing key
(current or previous). CSV inputs, legacy v1 packages, and documents beyond the
five-million-character data limit refuse explicitly. The conversion request
envelope has its own 10 MB UTF-8 JSON body limit, mounted after authentication;
anonymous bodies are not read, and adjacent API routes retain their 2 MB limit.

## Evidence and deployment limit

Focused regression checks first demonstrated the missing conversion route,
multilingual substitutions, silent unsupported glyph substitution and omitted
charts. Current green evidence lives under
`docs/evidence/D2-PLATFORM-COMPLETION/2026-10-13/exports/`.
The PDF/PNG in that directory are synthetic regression fixtures, not client
records. Font provisioning in the production image is declared, but an actual
production-image build/deployment remains an integration check.

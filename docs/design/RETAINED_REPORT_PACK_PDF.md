# Complete retained report-pack PDF

W1 / D2, `concept2cure-v2`, 2026-10-14. The control tower approved this bounded
contract. This document is a design and ownership plan; implementation and its
evidence are pending. Existing report manifests, saved runs and individual PDF
exports remain canonical.

## Client outcome and current gap

In Reporting & analytics, a client selects saved runs in Run history and creates
a named bundle. The existing **Export manifest PDF** action produces an index:
one line per report, its scope, bundled/current status and confidence. It does
not contain the reports themselves. The current label and limitation are
correct and must remain.

Individual run exports already render complete retained content, tables,
supported recorded charts, source references, calculation evidence, signature
manifestation and seal verification through the canonical Report-OS PDF writer.
The new **Export reports PDF** action assembles that content into one packet,
with a cover/index and each report's own status and identity. It does not run a
report, finalize a run, transfer a file externally or certify a dossier.

This exposes existing computations across their supported client types,
regions and scopes. It does not make an uncomputed catalog definition runnable,
expand the regional Module 1 assessment into Modules 2–5, or establish full
IND/BLA/CTD, scientific, clinical, agency, PDF/A or production qualification.

## HTTP and UI contract

The existing endpoint remains:

```text
GET /api/report-os/bundles/:bundleId/export.pdf
GET /api/report-os/bundles/:bundleId/export.pdf?content=manifest
GET /api/report-os/bundles/:bundleId/export.pdf?content=reports
```

Omitting `content` preserves the manifest export. An explicitly supplied value
must be the single string `manifest` or `reports`; empty, repeated, structured
or unknown values return a typed 400 before PDF generation or export recording.
The existing bundle API prefix already belongs to the reporting surface; no
broader claim, surface, module grant or new endpoint family is required.

The bundle card retains **Export manifest PDF** and adds **Export reports PDF**
using its existing button styles, download helper and success/error toast. The
description distinguishes the index from the report bodies. Both controls
disable while their export is pending to prevent duplicate requests. A server
refusal or browser download failure is an error, never a saved-file claim.

The reports filename distinguishes it from the existing manifest, for example
`report-pack-<bundle-id-prefix>.pdf`. The browser downloads the server's exact
bytes. It does not assemble a PDF, inspect signatures or calculate readiness.

## Source, access and coherence contract

All organization and requester identities come from the authenticated session.
A caller cannot provide an organization, actor, accessible-project allowlist,
run body, signature or seal in this GET request.

1. Load the saved bundle through the existing strict payload decoder. Corrupt
   payloads retain their explicit error instead of becoming an empty bundle.
2. Validate that the recorded `runIds` and item identities form the complete
   packet. Use saved `bundle.runIds` order, mapping matching recorded items and
   current rows into it; do not depend on SQL result order. Preserve the
   manifest's original saved item order.
   Duplicate or inconsistent identities are not silently repaired. A run's
   current tenant, UUID, report type and scope must agree with the recorded
   bundle identity before its body can be included.
3. On an actual owned, tenant-stamped transaction client, read the current
   active organization actor with `readCurrentProgramActor`, derive fresh
   allowed projects with `getAccessibleReportProjectIds`, and check every saved
   constituent through `canAccessReportScope` on that same client. Retain the
   existing historical program-scope and administrator rules. Do not reuse the
   route's cached `req.reportAccessibleProjects` as this fresh admission.
4. Read all requested run rows with an explicit organization predicate. A
   missing, foreign or currently inaccessible constituent refuses the entire
   reports packet with a generic not-found outcome. Never expose the private
   constituent's title, scope, count, findings or identity in an error body, and
   never return a packet with that report silently omitted.
5. Apply the existing export entitlement policy to every constituent report
   type, using its registry family and current resolved plan. A retained packet
   does not grandfather an export entitlement. Reuse `bundleExportRefusal` and
   the canonical entitlement rules rather than constructing a browser policy.
6. Read the constituent run status, seal, stored document, signature and chain
   through `readSealForExport`. Keep these reads coherent with the run rows used
   to assemble the packet; a finalization cannot produce an old body with a new
   final status. A reserved run row or equivalent existing transaction snapshot
   must be demonstrated by the implementation's tests.
7. A verified final uses the exact sealed `RenderedReport` returned by that
   boundary. Other supported runs use `buildRenderedFromRun` over retained run
   data only. This renders retained provider results and does not query those
   providers again. Preserve stored lineage-rendered content and provenance.
8. A seal verdict of `mismatch` refuses the entire reports packet through the
   existing typed mismatch outcome. A legacy final without a verifiable stored
   document remains explicitly **not-verifiable**: any reconstructed copy must
   say its sealed content cannot be verified, preserve the actual recorded
   signature/verification facts and never receive an “intact” claim. Missing
   signer, meaning, time or hash reads “not recorded.”
9. Before release, freshly recheck the current actor and every constituent scope
   on an owned executor after rendering. Refuse an observed withdrawal,
   verification failure or source/seal change; do not let an earlier cached
   admission override it. The implementation must state the checked interval.
   This does not claim universal COMMIT serialization against every independent
   project-sharing writer.

The existing manifest behavior is deliberately preserved, including its honest
missing-report line. The stronger all-constituents-or-refusal rule applies to
the new reports mode, because a packet advertised as containing the reports
must not silently lose evidence.

## One renderer and per-page status

Extract the existing run header/body/provenance writing into one shared helper
in `pdf/run-pdf.ts`. Both `buildRunPdf` and reports-mode bundle rendering call
that helper. Do not copy `BLOCK_TEXT`, chart rendering, Unicode/bidi handling,
signature formatting or provenance serialization into a second renderer.

The packet uses the existing `Writer`, embedded fonts, deterministic export
metadata, pagination and unsupported-glyph/font refusals. No dependency is
added. The helper writes content without saving the document or stamping the
entire writer, allowing the bundle to own packet pagination.

Start each report on a fresh page after the cover/index. Track its actual page
range, including every overflow page produced by long tables, prose, chart data
or provenance JSON. Extend `Writer` with the smallest needed page-boundary and
per-page watermark support; existing string-watermark callers remain valid.
Recorded page ranges are one-based PDF page numbers, including the cover/index
in the packet's total. They are derived from pages actually written, not from
estimated line counts.

Every page carries packet export ID/time and packet page number. Every report
page additionally identifies its run and retained scope. A non-final report is
marked **NOT FINAL (<actual status>)** on every page in its range. A legacy
not-verifiable final carries an explicit unverified-copy qualification on every
page in its range. A verified final's pages retain its actual manifestation and
seal facts without inheriting another report's status. Cover/index pages say
how many reports are final and whether the packet contains non-final or
unverifiable content; the packet itself is not presented as a signed final.

The report's computation time, bundled time and export time remain separate.
Unknown timestamps are not replaced with the current time. Tables/charts keep
their recorded values; missing series stay missing. Record which source
document was used (`verified-sealed` or `retained-run-render`) for each run so
later inspection can distinguish immutable content from legacy reconstruction.

## Exact-byte export recording

Use the existing `sendRecordedPdf` path, with `report_os.bundle_exported`, before
any PDF headers or bytes leave. It already computes `sha256` and `byteLength`
from the exact buffer sent and refuses an unrecorded export with 503.

In addition to the existing bundle/export/page facts, record:

```text
content: "reports"
runIds: recorded ordered run IDs
reportTypeIds: included report types
constituents: [{ runId, runUuid, reportTypeId, scopeType, scopeId,
                bundledStatus, statusAtRead, sourceDocument,
                sealVerdict, sealHash, firstPage, lastPage }]
```

Keep unavailable values explicitly null. `statusAtRead` describes the coherent
retained record used to build the PDF; it does not imply a new signature or
live clinical assessment. Record the same ordered source IDs/outcomes reflected
in the packet. Manifest mode remains distinguishable and keeps existing export
semantics. Do not add a second audit chain, package store or invented signature.

## Bounded ownership and implementation order

The control tower owns publication and final integration. No production or
repository-test mutation begins until its READY message.

| Owner | Files | Work |
| --- | --- | --- |
| Reporting backend | `server/routes/report-os.ts` | Closed selector, owned fresh constituent reads/access/entitlement/seal admission, retained assembly, typed refusal and exact-byte audited send |
| Reporting PDF | `server/services/report-os/pdf/run-pdf.ts`, `bundle-pdf.ts`, `writer.ts` | One shared body renderer, complete report packet, page identities/status, existing manifest preservation |
| Reporting UI | `client/src/concept2cure/v2/surfaces/Insights.tsx`, `InsightsBundlesPanel.tsx`, `insightsLibraryModel.ts` | Distinct existing-style export actions, server-byte download, busy state and honest result |
| Verification | Existing focused suites below, plus bounded packet/access cases where needed | Red controls, final regression evidence and actual PDF/browser proof |

Backend and PDF share their interface before parallel UI work. Source/catalog
selection, authoring permission management, organization-switch protection,
protocol signing, citation writes and migration publication remain outside
this slice. `InsightsCatalogPanel.tsx` and `reportingPersona.ts` belong to the
incoming onboarding work and are not owned here.

Suggested sequence: pin source/renderer contracts; show focused cases failing
on current code; extract renderer without changing individual/manifest output;
implement packet admission and PDF; wire UI; run focused regression/native
proof as applicable; file evidence; control tower performs whole-tree gates and
publication. Preserve prior sealed evidence and raw red results.

## Existing tests and reusable fixtures

| Exact path | What it already provides | Packet additions |
| --- | --- | --- |
| `server/services/report-os/pdf/__tests__/run-pdf.test.ts` | `RunPdfInput`, `RenderedReport`, `RunSealView`; actual PDF text extraction; complete bodies, source/calculation evidence, signature, Unicode, missing fonts/glyphs, recorded charts | Shared helper retains all existing behavior; long report fixture reused in packet |
| `server/services/report-os/pdf/__tests__/bundle-pdf.test.ts` | Actual manifest PDF extraction, `BundlePdfInput`/items, multi-page identity/status and missing-report disclosure | Keep all manifest cases; add complete multi-report bodies and per-page status/identity checks |
| `server/services/report-os/pdf/__tests__/export-identity.test.ts` | Exact deterministic bytes and recorded export metadata via `pdf-lib` | Reports-mode packet has the same exact-byte/metadata contract |
| `server/routes/__tests__/report-os-audit-recording.test.ts` | Real router with bounded SQL facade; `sealedOnRecord`, retained sealed document and canonical seal/chain fixtures; actual PDF bytes; audit refusal checks | Selector rejection, exact sealed reuse, mismatch/missing refusal, per-constituent outcomes and exact-buffer audit digest |
| `server/routes/__tests__/_report-os-route-harness.ts` | SQL/parameter recorder, tenant stamp, `driverRow`, audit spy, reset helpers | Reuse without granting access in security proof; extend responders only for real new canonical queries |
| `server/routes/__tests__/report-os-saved-read-access.test.ts` | Actual router with deliberately supplied accessible project set; saved program/document/submission historical-scope cases | Two-report packet with one private constituent, withdrawal between initial/late reads and generic refusal |
| `server/routes/__tests__/report-os-bundle-recording.test.ts` | Complete retained payload, corrupt/oversized payload refusals, atomic bundle/audit persistence | Reuse bundle fixtures; no new pack persistence or silent identity repair |
| `client/src/concept2cure/v2/__tests__/insightsLibraryReachesBackend.test.tsx` | Actual reporting tabs, bundle list/create/export affordances and failed-read states | Both explicitly named export actions call the closed selector; manifest default stays reachable |
| `client/src/concept2cure/v2/__tests__/insightsExportProducesFile.test.tsx` | Exact server Blob passed to `downloadBlob`, server/browser refusal error tone, no finalize call | Reuse byte-download pattern for reports-mode packet; no browser PDF or finalize |
| `tests/db/report-os-tenant-from-session.dbtest.ts` and `tests/db/report-program-group-tenancy.dbtest.ts` | Native Report-OS session tenant/ownership and program-group proof patterns | Adapt a bounded restricted-runtime packet case if unit access seams cannot establish real RLS/identity behavior |

Focused unit access tests with a mocked allowlist establish consumer behavior,
not the correctness of the real sharing/RLS policy. A native case must use the
actual restricted application role, enforced RLS, real actor/current sharing
helpers and isolated invented QA records; it must preserve existing history.

Minimum meaningful new cases:

1. Two distinct retained reports span multiple pages: all end-of-body markers,
   tables, provenance and Unicode survive; bodies are not just the manifest.
2. A verified final and long partial run have their correct identity/status on
   each page, including the last overflow page; the cover does not declare the
   packet final. A legacy not-verifiable final never prints an intact verdict.
3. Changed current provider data cannot alter the verified sealed body; no
   provider/model computation, finalization or extra signature call occurs.
4. Missing, foreign, private, inconsistent-identity, withdrawn-access or
   mismatched-seal constituents refuse the whole packet without PDF bytes,
   attachment headers or a successful export event. Verification errors remain
   errors, not empty or omitted reports.
5. Audit failure refuses the PDF; success records the hash/length of the exact
   bytes received, ordered source IDs, actual source/seal outcomes and page
   ranges. Unknown/repeated selectors fail before generation/recording.
6. Existing manifest export stays reachable and retains its output/labels; the
   new UI action downloads server bytes, disables duplicates while pending and
   reports server/browser failures in the existing error tone.

Use the already installed `pdf-parse` `getText()` result's `pages` entries
(`{ num, text }`) for per-page assertions. An aggregate count of watermarks
cannot prove that the final report did not inherit a draft's watermark or that
the last overflow page retained the right run identity. Test the individual
page text against the renderer's reported ranges and compare the audit ranges
with the actual PDF page count.

File current source pins, raw red/green logs, a bounded synthetic packet PDF and
light/dark/mobile UI observations under a new D2 evidence directory. These are
implementation checks, not clinical data, a production deployment or regulatory
qualification. Do not amend already sealed manifests to attach this increment.

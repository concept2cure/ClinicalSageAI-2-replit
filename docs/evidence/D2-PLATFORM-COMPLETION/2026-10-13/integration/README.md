# Platform integration evidence — 2026-10-13

W1 / D2 implementation over `cd0140cbd21df44b804f793940f324f14607d48b`,
preserving Claude's catalog/history/schedules/bundles and regional engines.
This is code and local runtime evidence, not a production qualification or
agency acceptance claim.

## Actual application browser review

The existing Express/Vite application ran against a fresh PostgreSQL 16 database
provisioned through `install-fresh` and `deploy-migrate`. Runtime connections use
`app_service` with row-level security enabled. The browser uses the existing
development-only seeded organization; no client or patient records were added.
No report response or application API was mocked.

All four library tabs were exercised at 1440px in light and dark themes and at
390px in light theme: zero page exceptions, zero failed API responses and no
body overflow. Screenshots retain the existing platform typography, tokens,
cream/terracotta controls and responsive panels.

An organization-scoped inspection report was created through the catalog
(`201`), rendered (`200`), found in saved history (`200`), reopened (`200`) and
downloaded as a PDF (`200`, 24,015 bytes). The empty inspection register produces
a **partial** report with zero measured records, missing provider evidence and
a blocker. Confidence remains unmeasured. The PDF includes the actual scope,
source/calculation evidence, export identity, page numbering and a clear
**NOT FINAL (PARTIAL)** watermark. No signature ceremony was performed.

`browser-results.json` records response paths/statuses and viewport checks
without authentication tokens. The PDF and images are local test evidence.

## Native database and build

- Reporting registry, tenant-session, audited delivery and compliance-report
  suites: **58/58 tests**, runtime `app_service` / RLS on.
- QMS signature requirements, protocol reviewer signing authority and authoring
  concurrency: **22/22 tests**, with logs in `../qms-inspection/`.
- Canonical fresh installation and full deployment migration replay succeeded.
- A further no-op deployment compared **9,050 constraints and indexes**:
  **zero rebuilt, zero dropped, zero created**.
- Production client/server build succeeded. The existing large-chunk warning
  remains; this evidence does not claim a performance qualification.
- Canonical report persistence rollback and actor/scope consistency:
  **17/17 tests**.

Focused UI, exports, workflow and schema evidence lives in adjacent directories.
Final whole-tree typecheck reports **zero errors** against the zero-error
baseline. The complete reporting refresh passed **757 tests across 64 files**;
UI passed **258 tests across 28 suites**, workflow passed **156 across 22**, and
schema prerequisite/parentage/replay contracts passed **41**. These figures are
suite-specific; overlapping follow-up runs are not added to them.

The full 30-handler reporting endpoint matrix has no open access finding. Legacy
program reports without a trustworthy recorded project set remain accessible
only to organization project administrators. Already truncated pack payloads
need their originals for recovery; this change never invents lost content.

Repository pre-push gates run on the commit before publication. Their final
result is recorded in the following integration evidence increment.

## Concurrent editor integration

The first pre-push run passed every gate, then publication was rejected because
Claude's source-intake/editor commits arrived concurrently. They were merged
without conflict and preserved. Incoming filing/disposition/leaf/source-snapshot
regressions passed **352 tests across 24 files**. Exact source intake and its
machine/source reservation regressions passed **98 across eight** after closing
a reproduced private-project byte-read bypass. Project/source-switch UI repairs
passed **174 across 18 suites**; remedies and unsaved-work controls are retained.
Merged whole-tree typecheck and the final production build passed.

The warning ratchet then identified one net additional warning. History tests
were grouped by access policy versus query semantics to remove the oversized
test function; all **11 tests** still pass and that file has zero lint warnings.
No lint baseline or safety gate was weakened.

Direct protocol/CSR selectors are defined in the revised bridge contract and
remain pending. Two pre-existing private-source paths (raw draft source
verification and AnA's submission planner) are queued for the next increment;
the new source intake checks access before reading and before writing.

## Explicit runtime limits

`/healthz` succeeds. `/readyz` reports the absent AnA provider in this environment;
database/schema/storage checks succeed. Development audit-secret fallback is
present in native tests and is not production audit-chain qualification.
External email delivery, licensed validators/templates, production model
qualification and agency gateway credentials were not configured or exercised.
Regional engines remain Module 1 placement assessments; they do not certify
scientific content or completeness of CTD Modules 2–5.

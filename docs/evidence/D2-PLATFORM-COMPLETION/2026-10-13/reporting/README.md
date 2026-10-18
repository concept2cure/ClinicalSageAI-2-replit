# Reporting integration evidence — 2026-10-13

Branch: `concept2cure-v2`. Reconciled with Claude's `cd0140cbd21df44b804f793940f324f14607d48b` changes; retained the four regional engines and the shared interactive/scheduled dispatcher.

The catalog derives run availability, scopes, personas, segments, region and enabled state from the deployed registry. Seed definitions provide discovery for missing registry rows but cannot authorize a run. A failed registry read is an unavailable response. Organization registers can run without an open program, using the authenticated organization account scope. Project/document reports require the relevant owned context.

The regional assessments cover US IND, US NDA/BLA, EU MAA and Japanese JNDA Module 1 headings and registry/rule-pack observations. Coverage requires current recorded nonblank content at a matching CTD code; empty outlines, spaces, tabs, newlines, archived, deleted, withdrawn and superseded placements cannot supply coverage. The report explicitly does not assess content quality, approval or the complete document set within a heading. These assessments do not establish complete jurisdictional compliance or dossier readiness.

Private-project access uses the platform's existing `canUseProject` and project sharing state, normalized project visibility/membership, trusted current organization role, and pending review assignments. Overview and portfolio aggregation include only accessible projects. SQL saved-run history applies access, search, ordering and filters before count and pagination. Run metadata, render, seal, dependencies, finalize and PDF paths require access before returning content or recording an export. Packs require access to every carried scope. Delivery reads recheck the actual carried runs and pack, rather than only the project holding the delivery record. Group configuration and snapshot creation check the complete current project set. Organization diagnostics require the canonical organization project administration policy and tenant predicates even without RLS.

Saved program output carries a server-derived `summary.accessProjectIds` set. Shared computation copies the verified source set, and pack items retain it. Saved access evaluates that recorded set against current project sharing; adding or removing live group members cannot rewrite historical access. Snapshot project sets are also server-derived. Request-supplied `projectIds`, `accessProjectIds` and metadata cannot replace the saved snapshot binding. Legacy program output without a trustworthy source set remains restricted to the canonical organization project administrators; ordinary readers must regenerate it from a verified group. No historical source membership is invented or backfilled.

Saved pack JSON is retained whole within an explicit 2 MiB bound. Every project copy and the `bundle_created` audit event, including the payload hash, share one tenant transaction. A second-copy or audit failure rolls back all writes; the response does not claim a saved pack. Retained bundle and delivery memory rows have null confidence because no confidence was measured. Corrupt pack/delivery payloads or mismatched tenant payloads return a safe unavailable response, rather than an empty register. Previously truncated JSON cannot be faithfully recovered without the original payload.

Evidence files contain test fixtures, assertion results and local source paths. They do not contain credentials or production client data.

- `combined-tests.txt`: final combined ReportOS services and reporting/Insights route suites, 757 tests across 64 files passed after the last source edit.
- `access-tests.txt`: owned scope, sharing, SQL history, catalog and pack transaction checks.
- `historical-access-tests.txt`: group mutations, delivery register and frozen historical project sets.
- `health-tenancy-tests.txt`: real PostgreSQL execution with RLS absent; foreign-tenant totals excluded and ordinary readers denied organization diagnostics.
- `focused-lint.txt`: reporting ownership, access, history, dispatcher, portfolio and overview helpers.
- `route-lint.txt`: the existing large canonical route file has five warnings, down from six at the reconciled branch baseline; no lint errors.
- `red-scheduled-region.txt`: omitted scheduled declaration failure before correction.
- `red-lineage-scope.txt`: generic project readiness was invoked for document lineage before correction.
- `red-regional-content.txt`: empty/archived/deleted placements supplied false coverage before correction.
- `red-regional-whitespace.txt`: newline/tab-only content supplied false coverage before correction.

The pack rollback proofs run the real route and Drizzle transaction over an injected connection/audit edge. Scope ownership, history/access ordering, regional content predicates and diagnostic tenant counts execute real PostgreSQL queries through PGlite. Native PostgreSQL migration, governance and scheduling evidence is recorded separately by the integration owner. These local tests do not establish production deployment or regulatory certification.

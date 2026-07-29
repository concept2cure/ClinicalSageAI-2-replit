# MDx Controlled-Beta Release Report

- Repository: `concept2cure/ClinicalSageAI-2-replit`
- Branch: `fix/mdx-controlled-beta-readiness`
- Starting commit: `8a52eee524e16e77726dac888a1af81e6d8119a5`
- Ending commit: record from `git rev-parse HEAD` after this report commit.
- Migrations: none.
- Recommendation: **no-go**.

## Changed behavior and evidence

Canonical diagnostics routing, explicit invalid-surface handling, first-class IVDR derivation/selection, truthful `ivdr_td` label, and no program-fixture substitution during loading/failure were implemented. IVDR 2x2 diagnostic metrics use one versioned server/client calculation with strict count validation and explicit undefined-denominator handling. Classification/PER foreign parent links and PER foreign artifacts are rejected, and the basic PER state machine now prevents skipped/reverse transitions, approved-content overwrite, and stale status updates. The latest ownership/lifecycle and calculation/scoping run passed 27 tests across 2 files; TypeScript checking passed. No live external dependency, Playwright golden path, live-database tenant-isolation, governed artifact, or audit durability qualification was performed.

MDx health now separates schema, dependencies, workflow probes, qualification, and commercial release status. It fails closed to `releaseStatus: not_ready` when qualification has not run, dependencies are merely configured/unverified, workflows are skipped, or qualification is stale. Schema/table presence can no longer produce a controlled-beta or production release status. The IVDR pathway is included in health coverage normalization.

The dossier store no longer loads fictional evidence on import or retains it after empty live hydration. Dossier files now render explicit loading, empty, unavailable, and permission-denied states; sample dossier content requires explicit sample mode and live hydration replaces rather than merges with it. Typed 401/403 responses remain authorization failures even when an individual section-content request fails.

## Blockers and limitations

510(k) predicate provenance/isolation and controlled export remain unqualified. Official eSTAR is unavailable pending authorized-template and generation/reopen qualification. IVDR tenant linkage, analytical-performance criteria, PER governance and controlled output remain unqualified. CER is not a qualified generator and PMA remains outside commercial-beta scope. The MDx endpoint matrix is incomplete by design and marks no endpoint complete.

## Rollback

Revert the remediation commits in reverse order with `git revert <commit>`, run targeted tests and build, and deploy only after normal review. No database rollback is required because no migration was added.

## Reuse and duplication review — 2026-07-29

The branch was re-audited against existing statistics, IVDR manifest, diagnostic-performance, data-state, dossier, pathway, route, and health implementations. A separately added diagnostic calculator was removed: the existing shared IVDR manifest now owns the browser-safe point-estimate core, while the existing `clinical-performance` statistics engine reuses it and retains confidence intervals, likelihood ratios, kappa, and provenance. Two non-required audit/gap documents were also removed; only the six reports explicitly required by the work order remain. Focused new test files remain only where no defect-level test home existed.

The release decision remains no-go. Remaining blockers are fail-closed audit persistence, full tenant/link isolation, canonicalization of overlapping IVDR persistence routes, 510(k) predicate/export qualification, IVDR analytical/PER approval governance, official eSTAR qualification, executable health qualification, and behavioral golden paths.

# Audit Index (Truth-Reconciled after PR #279)

Date: 2026-03-27

## Canonical docs

- `BETA_READINESS_MASTER.md`  
  **Truth statement:** Governed export persistence now exists (compute path), but broad beta remains no-go due to non-governed direct CERV2/eSTAR exports.

- `510K_DOCUMENT_GENERATION_AUDIT.md`  
  **Truth statement:** 510(k)/eSTAR has a governed export-capable lane, but not all primary routes are governed-persisted.

- `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md`  
  **Truth statement:** PR #279 closed the “no governed persistence” absolute blocker, but did not close route-consistency launch blockers.

- `POST_PR_279_RECONCILIATION.md`  
  **Truth statement:** Reconciles what PR #279 actually fixed vs what remains open for next sprint.

## Reclassification note
Any older audit claim asserting “no governed export persistence path exists” should now be treated as **stale** unless it is explicitly scoped to direct CERV2/eSTAR export endpoints.

## 2026-07-29 biotech audit reconciliation

A repository-wide overlap review found that the newly introduced `docs/biotech` readiness, blocker, architecture, acceptance, known-limit, changelog, and evidence narratives duplicated this audit index and the later purchase-grade audit in `docs/audit-2026-07/`. They are therefore retained only as thin work-order pointers; they are not independent authorities.

The lexical 101-row completion generator and its generated Markdown/JSON were withdrawn. It counted comments, fixtures, and shared candidate services as row evidence, duplicated registry uniqueness tests, and did not prove document-specific wiring. No status produced by that generator is accepted as release evidence.

Canonical disposition:

- platform findings: `docs/audit-2026-07/12-findings-register.md`;
- release gates: `docs/audit-2026-07/14-readiness-gate-ladder.md`;
- audit method/evidence tiers: `docs/audit-2026-07/01-method-and-coverage.md`;
- biotech human workflow: `BIOTECH_WORKFLOW_PLAN.md`;
- biotech route inventory: `docs/beta/BIOTECH_PHARMA_BETA_ROUTE_MAP.md`;
- beta limitations: `docs/release/KNOWN_BETA_LIMITATIONS.md`;
- architecture authority: `docs/architecture/CANONICAL_AUTHORITIES_AND_BOUNDARIES.md`.

A future per-registry completion matrix must consume the existing regulatory registry/validation APIs, distinguish direct wiring from shared or lexical evidence, support deterministic checking, and require executable evidence for `VERIFIED`.

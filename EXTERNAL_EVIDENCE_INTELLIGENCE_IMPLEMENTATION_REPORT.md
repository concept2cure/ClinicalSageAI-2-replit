# External Evidence Intelligence — Implementation Report

## What was implemented
- Firecrawl adapter layer added under `server/integrations/firecrawl/*` with scrape/search/crawl/extract entrypoints, policy evaluation, quota logic, and webhook signature verification.
- AnA routing hook added in `/api/ana-ri/chat` with `useFirecrawl` request support and `evidenceUsage` response metadata.
- New External Evidence orchestration package created under `server/services/research-intelligence/*`.
- New routes created:
  - `/api/firecrawl`
  - `/api/firecrawl-webhooks`
  - `/api/external-evidence`
  - `/api/workspace-tool-settings`
- New migration added for settings, usage, evidence records, citations, and audit log tables.
- Frontend composer updated with a tool menu toggle and “Firecrawl On” chip in AnA composer.
- Unit tests added for policy routing, webhook signature verification, and date helper logic.

## Guardrails enforced
- Firecrawl is treated as optional external acquisition adapter.
- Product-level quota is enforced server side and only increments on successful scrape operations.
- Webhook signature verification is explicit and failure is logged.
- Metadata channel (`evidenceUsage`) is returned to the UI.
- Domain and role policy checks are enforced before scrape execution.
- Firecrawl-acquired documents are persisted as governed evidence records with dedupe by canonical URL + content hash.
- Persisted external evidence is marked as `captured_needs_review` and not auto-promoted into authored docs.

## Known follow-up work
- Wire structured providers (PubMed/PMC/Crossref/Semantic Scholar/ClinicalTrials/openFDA) to live connectors.
- Wire durable queue workers and retries to existing queue infra.
- Expand role/domain/category policy checks on every request path.
- Add richer admin diagnostics UI page.
- Add strict typing and end-to-end route tests with DB fixtures.

## Audit/pressure-test hardening added in latest pass
- Added structured Firecrawl error taxonomy helper (`policy_blocked`, `quota_exhausted`, `provider_error`, `webhook_verification_failed`, `normalization_failed`).
- Added correlation-id logging around Firecrawl scrape requests/success paths for support diagnostics.
- Added URL safety gates (auth/private/login/admin-style path blocking and protocol checks) in Firecrawl policy evaluator.
- Added category-policy blocked-domain support in policy evaluation.
- Added auth guard to Firecrawl and external-evidence routes; workspace tool settings now require admin role.
- Moved Firecrawl webhook mounting before global JSON parsing to improve signature verification reliability.
- Upgraded literature-first path from stub to live PubMed E-utilities retrieval (`esearch` + `esummary`) for initial structured-source support.
- Added retry + timeout behavior in Firecrawl API client for transient provider failures and network timeouts.
- Added audit log events for requested/succeeded Firecrawl scrape calls with correlation IDs.
- Added admin diagnostics endpoint (`/api/workspace-tool-settings/:tenantId/diagnostics`) with settings, usage, and recent audit activity.
- Added deterministic routing decision output (route + rationale + confidence) for explainable source-selection behavior.
- Added normalization guard to reject/flag scrapes that return no usable markdown/html content.
- Added external-evidence validation endpoint (`/api/external-evidence/validate`) to support UAT/human testing of quota/policy readiness before live prompts.
- Added diagnostics readiness fields for ops (`feature flag`, `API key`, `webhook secret`) in workspace diagnostics payload.
- Improved Firecrawl fallback ranking to prioritize higher-trust public domains (`.gov`, `.edu`, `.org`) before scrape.
- Upgraded device/diagnostics path to fetch real public structured data from ClinicalTrials.gov API v2 and openFDA device events.
- Upgraded commercial claim substantiation path to gather top public claim sources via Firecrawl search.
- Added UAT helper endpoint (`/api/external-evidence/uat-scenarios`) and validation-run audit logging for human test sessions.
- Added stronger evidence normalization (canonical URL/domain/excerpt shaping) with explicit `normalization_failed` enforcement on missing URL/content.
- Integrated `normalizeEvidence` into AnA evidence persistence path so canonical URL/domain/excerpt normalization happens before save and malformed captures are rejected.
- Added Firecrawl direct scrape cache-hit path (same tenant + canonical URL within day) to avoid duplicate provider calls and duplicate quota charges during iterative human testing.
- Added evidence persistence on direct `/api/firecrawl/scrape` calls and returned `evidenceDocumentId` in scrape responses for traceability.
- Enriched `/api/external-evidence/validate` output with deterministic route-decision rationale to improve UAT interpretation.
- Added life-sciences regulatory signal extraction during evidence normalization (NCT IDs, DOI detection, safety/efficacy/regulatory language flags) to improve downstream medical-writing quality and review workflows.
- Added `POST /api/external-evidence/draft-brief` to generate a reviewer-facing medical-writing draft brief from selected evidence IDs (with mandatory review caveats and audit logging).
- Added hardening sanity script `scripts/verification/external-evidence-hardening-check.mjs` to validate critical env and file readiness before rollout.

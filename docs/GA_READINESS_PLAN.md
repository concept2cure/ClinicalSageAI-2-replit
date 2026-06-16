# GA Readiness Plan — Concept2Cure / ClinicalSageAI

**Date:** 2026-06-16
**Basis:** Derived from the full code inventory in [`docs/FEATURE_CATALOG_2026-06-16.md`](./FEATURE_CATALOG_2026-06-16.md) (24-agent inventory swarm → audit swarm → chief-investigator reconciliation → 307-route deep sweep).
**Companion issue:** activate-or-prune backlog #841.

## Thesis

This is **not** a capability problem — the backend regulatory IP is unusually deep and largely real (deterministic engines, governance, 21 CFR Part 11, submission gateways). GA is blocked by three things:
1. **Fragmentation** — a 418-file route surface with ≥3 overlapping AI "brains" and dead schema/modes.
2. **Fixture-UIs over partial backends** — several surfaces render demo data instead of live endpoints.
3. **Unfinished plumbing & ops** — multi-tenant enforcement, compliance last-mile, observability wiring, vendoring.

Strategy: **stop adding surfaces; consolidate, harden, and make a chosen GA spine flawless.** Recommended GA spine = **510(k) end-to-end** and **IND end-to-end** (deepest real backends).

Maturity legend (from the catalog): ✅ Built · 🟡 Partial · ⚪ Stub.

---

## Phase 0 — Consolidate & de-risk (no new features)

Pure risk reduction. Nothing here adds capability; it removes failure modes and confusion.

| # | Task | Why | Acceptance criteria |
|---|---|---|---|
| 0.1 | **Enforce RLS in production** (`RLS_ENFORCE=on`, set `RLS_REQUIRE_ENFORCE=true`) | RLS policy is installed but defaults to **off/shadow** — multi-tenant isolation is not actually enforced. Highest-severity finding. | Cross-tenant read returns zero rows in a staging test; boot fails closed if enforcement missing in prod. |
| 0.2 | **Collapse the AI brains to `ana-ri`** | `ana-ri/*` (real) overlaps with the `cortex*` family (partly delegated) and `cognitive-ecosystem` (mostly mock). | One documented AI entry path; `cortexRoutes`/`cortexManagement`/`cortexQuery` + `cognitive-ecosystem` retired or merged; no duplicate orchestration. |
| 0.3 | **Prune legacy memory + client AI** | `memory-service.ts` (legacy in-memory) superseded by `memory-orchestrator`/`memory-context-assembler`; `cortexService`/`useCortex` superseded by `useAnaChat`. | Legacy modules deleted; all callers on canonical paths; tests green. |
| 0.4 | **Remove dead schema & ORM** | ~34 unused CDISC reference tables; Prisma stub (Drizzle is canonical). | Prisma removed; unused CDISC tables dropped or explicitly justified; migration added. |
| 0.5 | **Prune dead `LayoutMode` modes** | ~30 compatibility-redirect / demoted / no-renderer modes kept "for type safety". | Enum reduced to live + intentional-redirect surfaces only; `ZenRouter` simplified. |
| 0.6 | **Production-fence test routes** | `test-assembly`, `integration-test`, `seed-demo` are mounted. | Confirmed blocked in prod (env guard + CI check). |
| 0.7 | **Resolve naming collisions / dupes** | QC (`qc-schemas`/`qc.routes` vs `document_qc_routes`); two eTMF persistence paths; `knowledgeGraphService` (stub) vs `knowledge-graph` (built); deprecated `fda510k-routes` vs `fda510k-unified`. | Each pair documented or merged; deprecated paths removed by their stated sunset. |

**Exit gate:** clean route/AI surface, enforced tenancy, no dead code in the GA spine.

---

## Phase 1 — Make the GA workflows flawless (510(k) + IND end-to-end)

Wire every fixture surface in these two flows to live endpoints; finish the regulated last-mile.

| # | Task | Maturity today | Acceptance criteria |
|---|---|---|---|
| 1.1 | **Vendor official FDA eSTAR templates + populate field maps** | 🟡 (orchestrator built; templates not vendored, maps empty) | Real 510(k)/De Novo eSTAR PDF generated end-to-end from canonical data. |
| 1.2 | **Complete Part 11 data-integrity** (hash verification methods) + e-sign coverage on the spine | 🟡 (methods stubbed) | Tamper-evident verify returns true/false on real records; e-sign required on freeze/transmit. |
| 1.3 | **Wire fixture surfaces in 510(k)/IND to live endpoints** | 🟡 (biopharma Pathway/Meetings, some MDX panels render fixtures) | No fixture fallback on the GA-path surfaces; contract tests cover each endpoint. |
| 1.4 | **510(k) migration to `fda510k-unified`** | 🟡 (legacy + unified coexist) | Single API; legacy removed. |
| 1.5 | **IND dispatch + ICSR E2B(R3) transmission validated** | ✅ services / 🟡 transport | Dry-run dispatch passes the hard gate; ICSR envelope validated against a test gateway. |

**Exit gate:** a sponsor can take a 510(k) and an IND from project → authored → validated → packaged → dispatched, entirely on live data, with audit + e-sign.

---

## Phase 2 — Compliance & ops hardening

| # | Task | Notes |
|---|---|---|
| 2.1 | **Computer System Validation (IQ/OQ/PQ)** package | ⚪ today; required for regulated customers. |
| 2.2 | **Audit-chain enforcement on by default** | `auditChainIntegritySweep` exists but gated; enable + alert on breaks. |
| 2.3 | **Observability → dashboards + SLOs + alerting** | OTel / Langfuse / Sentry are present but need wiring; enable retention + chain crons in prod. |
| 2.4 | **Security**: pen test, secrets rotation, SSO/SCIM verification, CSP report review | `well-known` security.txt + `csp-report` already present. |
| 2.5 | **Load / performance testing** | Connection pooling + rate limits exist; prove scale. |
| 2.6 | **Vendoring/data**: eCTD DTDs, **MedDRA dictionary (currently empty)**, Neo4j (if GraphRAG ships) | Blocks PV/coding + GraphRAG. |

---

## Phase 3 — Breadth back-fill (behind flags + entitlements)

Finish as fast-follows, gated by the existing feature-flag + Stripe entitlement system:
CER full-narrative assembly · CDx workflow engine · regulatory-correspondence parser/operating-layer/response-assembly · Sentinel analyzers 2–5 · deep-research connector fan-out · real-time collaboration (Yjs transport) · CMC collaboration persistence + workflow orchestration · reporting subscription delivery + portfolio aggregation · Foresight trio · innovation 8-feature suite. Decide GA-vs-experimental for `nanoBanana` / `smart-blocks` / `innovation` / `predictive-sections` / `learning-horizon`.

---

## Hand-off to Claude Design (UI track, runs parallel to Phase 1)

Deliverables required before/with design kickoff:
1. **Frozen GA surface list** — the live `LayoutMode` subset (Catalog §A), excluding demoted/no-renderer modes.
2. **Per-surface data contracts** — the hooks/endpoints each surface binds to; mark which are fixtures so design builds against the real shape.
3. **Design system baseline** — formalize `design-system/` + `ui_kits/` tokens, the 15-item left-rail IA, and `statesV2` (loading/empty/error) as standard.
4. **Accessibility baseline** — WCAG 2.2 AA (already enforced in the risk module) as the template.
5. **AnA rail contract** — persistent dock spec (modes, context card, suggested prompts, SSE streaming + ARIA-live) embedded identically on every surface.

---

## What GA needs beyond DB & UI (summary)

- **Security/tenancy:** RLS enforced (not shadow), pen test, secrets, SSO/SCIM verification.
- **Compliance:** Part 11 data-integrity + audit-chain enforcement, CSV (IQ/OQ/PQ), e-sign coverage audit.
- **Vendoring/data:** eSTAR templates, eCTD DTDs, MedDRA dictionary, Neo4j (conditional).
- **Quality:** e2e coverage on GA workflows; contract tests replacing fixtures.
- **Observability/SRE:** dashboards, SLOs, alerting, retention/chain crons enabled.
- **Commercial:** entitlement gating maps to GA feature set; billing webhooks E2E.
- **Ops:** deployment runbooks (helm/terraform exist), migration/seed strategy, backup/DR.

---

## Suggested milestone & sequencing

```
Phase 0 (consolidate/de-risk)  ──► Phase 1 (510k+IND flawless) ──► Phase 2 (compliance/ops) ──► GA
        │                                   │
        └─ UI hand-off prep ────────────────┴──► Claude Design builds GA surfaces (parallel)
Phase 3 (breadth) = post-GA fast-follows behind flags.
```

Phase 0 and the UI hand-off prep can start immediately and in parallel; Phase 1 depends on Phase 0.5/0.6 being done on the spine. Phase 3 must not block GA.

https://claude.ai/code/session_01PEmJuGi3Jd724WYLDWVX8K

> **Current roadmap (2026-11-06):** [One design, one plan](design/ONE_DESIGN_PLAN.md), with its
> [machine-readable ledger](design/one-design-plan.json), is the execution authority. Founder decision P-104 adds
> the **Anna runtime** epic at §1d: Multi-Agent Architecture Spec v0.5 §§1–32 extends the existing spine, in
> fixture-gated phases 0–8. Its complete acceptance is pending. Founder decision P-105 (2026-11-08) records spec
> v0.4 §§1–15 as v0.5's base, mapped in §1d, and gives the epic one owner. The CER roadmap below is historical
> context; it grants no separate scope or completion claim.

# CERv2 — Medical Device & Diagnostics Roadmap

## Vision
Regulatory Workbench that turns evidence into defensible claims, standards coverage, outcomes substantiation, authored CER, and audit-ready eCTD exports.

## North Star + KPIs
- North Star: time from “Program created” → “Export-ready package”
- % claims fully substantiated (evidence + outcome + rationale + signoff)
- % standards covered (requirements with evidence artifacts)
- # preflight failures per export
- time-to-audit-response

## Epics
0. Platform Hardening (security, audit, tenant isolation)
1. Program Workbench + Evidence Objects
2. Claims Matrix Generator
3. Consensus Standards Navigator
4. Outcomes Substantiation
5. Co-Author (TipTap) + Citations + Section Readiness
6. Preflight + Export + Regulatory Build Ledger
7. UX Polish: Command Palette, Global Search, Activity Timeline

## Definition of Done (global)
- Backed by schema + migrations
- API validated and tenant-scoped
- Audit logged
- UI has empty/error/loading states
- Tests added
- Export artifacts deterministic

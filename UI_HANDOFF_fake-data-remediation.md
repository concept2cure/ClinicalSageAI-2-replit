# UI handoff — fake-data remediation (for Claude Design)

This document hands off the **UI-side** follow-ups created by the backend
fake-data remediation (PR: "Replace mock services with real implementations").
The backend no longer fabricates results — it returns real data or, when a real
value cannot be computed, returns `null`/empty/explicit errors. UI surfaces must
present those honestly. Per CLAUDE.md, all UI work belongs to the design system;
nothing in this list was changed in the app UI by the backend PR.

## Context

Services that previously produced only fabricated data were either deleted (dead
code) or rewritten to compute real results. The guiding rule is **never show a
fabricated number** — when the backend returns `null`/empty, the UI must show an
explicit empty/"not assessed" state instead of inventing or hiding it.

## 1. Deleted legacy client services — no UI action, just awareness

These orphaned client services were deleted (they had zero importers; the live
app already calls real endpoints via React Query):

`ProjectService`, `indWizardService`, `DocumentIntelligenceService`,
`SecurityService`, `DocuShareService`, `RegulatoryIntelligenceCore`,
`CerValidationService`, `blockchain`, `KAutomationController`,
`models/RegulatoryProjectMap`.

When (re)building any surface that used to import these, use the canonical
pattern: **React Query → real `/api/*` endpoint** (e.g. projects via
`/api/projects` from `server/routes/projects-management.ts`, auth via
`server/routes/users.ts` `/login` and `/me`, documents via the document routes).
Do not reintroduce client-side mock services.

## 2. Snow Globe prediction UI — handle real, possibly-empty results

Backend: `server/routes/snowglobe.ts` (mounted at `/api/snowglobe`). The six
engines now analyze the program's **real** authored sections/documents via the
AI client instead of fabricating findings. Current consumers are the legacy
`client/src/concept2cure/ZenApp.tsx`, `components/home/PlatformHome.tsx`,
`zen-app-constants.ts`, and `router/zenRouteNormalization.ts` — which CLAUDE.md
marks for replacement. When these surfaces are rebuilt in the design system,
the UI must handle the following **new** response behaviors:

- **Engine score can be `null`.** Each engine result (`EngineResult.score`) is
  `number | null`. `null` means "insufficient program content to compute a
  prediction" (the program has no authored sections/documents). Render an
  explicit empty/"insufficient data" state — never a `0/100` or placeholder bar.
- **Empty findings.** An engine may return zero findings (no risks evident, or
  no content). Show an empty state, not a fabricated finding list.
- **`/dossier-nodes/:nodeId/scores`**: `completeness`, `consistency`, and
  `evidenceDensity` are now always `null` (no real basis exists); only `overall`
  and `reviewerRisk` are computed from real findings, and only when the node maps
  to a real section. The response carries `assessmentSource: 'snowglobe-findings'`
  (real) or `'no-data'` (nothing to assess). UI should hide/grey null sub-metrics
  and key its display off `assessmentSource`.
- **`/artifacts/:artifactId/scores`** `engineBreakdown` is derived from real
  impacting findings; values are real (0–100). No change needed beyond trusting
  the values.
- **Run lifecycle**: a run against a program with no authored content will
  complete with all-null engine scores and no findings. Design an honest
  empty/"add content to run predictions" state for this case.

## 3. General principle for all surfaces

Anywhere the UI renders a score, confidence, metric, or finding sourced from the
backend: treat `null`/empty as a first-class state with an explicit, calm empty
treatment (per the design system's microcopy/empty-state patterns). Do not
substitute a default number, a random shimmer that implies data, or hide the
field silently.

## Backend reference (already shipped, for wiring)

- Protocol similarity/outcome: `server/protocol-analyzer-service.ts`
  (`similarity` and `outcome` may be `null`).
- CSR biomarker correlations: `server/services/csr-knowledge-extractor.ts`
  (`changeFromBaseline`/`pValue` may be `null`; rows without a real correlation
  coefficient are omitted).
- Global compliance + document NLP: `server/huggingface-service.ts`
  (real Claude-backed; throws on AI failure rather than returning canned text).

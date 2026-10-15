# submission-plan — CHANGELOG

## v1.1 — 2026-10-05
- Narrates over the reasoning engine's structure instead of planning beside it.
  v1.0's module map, forms and timeline of day offsets competed with the
  engine's required sections, forms and review clocks and could disagree
  (Rule 2; work-orders item 21). The model is given `deterministicStructure`
  and returns gaps and dependencies only; any figure it returns is dropped.

## v1.0 — 2026-06-05
- Initial. Generates module/section map, regional forms, clock-keyed timeline, dependency graph, and initial gap list. JSON-only. Guardrail: never invent forms or section codes.

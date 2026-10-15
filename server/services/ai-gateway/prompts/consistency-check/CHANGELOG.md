# consistency-check — CHANGELOG

## v1.0 — 2026-06-05
- Initial (template pinned). Cross-document consistency checks (subject counts, spec↔QOS, label↔safety) surfaced as match/conflict findings. Persistence to consistency_findings is Phase 3.

## Retired — 2026-10-01
- No longer used. The consistency check's verdicts come from the deterministic
  comparison of labelled figures (server/services/truth-engine/figure-consistency.ts);
  a model's match/conflict label is not a verdict (CLAUDE.md Rule 2). v1.0 is kept
  as the record of what earlier findings were produced with.

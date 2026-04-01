# Optimization Baseline and Results

Date: 2026-03-31
Branch: concept2cure-v2

## Before vs After

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| `server/index.ts` line count | 8044 | 7144 | -900 |
| `shared/schema.ts` line count | 18078 | 18078 | 0 |
| `package.json` runtime dependency count | 161 | 157 | -4 |
| Route registration touchpoints in `server/index.ts` | centralized blocks | manifest-based + centralized remainder | expanded split |
| High-confidence dead deps removed from runtime | 0 | 4 | +4 |
| Dead/duplicate files flagged | 0 | 3 categories | +3 |

## Startup/build/test status

- `npm install`: failed in this environment (403 access policy on `@hocuspocus/server`).
- `npm run typecheck`: fails due missing type packages because install could not complete.
- Route composition extraction completed and compiles structurally at source level; full runtime verification is blocked by install policy.

## Scope delivered

- Phase 1: **Partial completion** (bootstrap route manifests introduced and wired).
- Phase 2: **Completed for high-confidence dependency movement** with report.
- Phase 3: **Deferred** (schema split not performed in this pass).
- Phase 4: **Partial completion** with dead-code/duplicate-path audit.
- Phase 5: **Completed** with measured metrics.
- Phase 6: **Attempted**, blocked by environment package access policy.

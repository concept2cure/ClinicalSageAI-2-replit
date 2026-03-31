# Dead Code and Duplicate Paths Audit

Date: 2026-03-31

## Removals / cleanup done in this pass

- Removed now-unnecessary route imports from `server/index.ts` after bootstrap extraction.
- Removed dead startup artifacts in `server/index.ts` (unused multer/upload configuration, unused temporary storage client, and related dead imports).
- Removed duplicate centralized route mounting blocks by replacing them with manifest registration calls.

## Flagged for follow-up (not removed in this pass)

1. `server/index.ts` still contains several hundred inline route handlers and dynamic imports that should be split into additional manifests in a second pass.
2. `shared/schema.ts` remains monolithic and high-blast-radius; decomposition should be done in a dedicated schema-only stream with migration safety checks.
3. Potential duplicate/legacy route families (foresight/anA aliases and legacy 510k variants) are intentionally preserved for compatibility and require product-level deprecation coordination.

## Rationale

This hardening pass focused on organizational risk reduction without endpoint behavior changes. Additional deletions require deeper behavioral verification.

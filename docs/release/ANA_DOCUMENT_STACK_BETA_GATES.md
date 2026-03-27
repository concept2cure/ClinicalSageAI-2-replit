# AnA Document Stack — Beta Gates

## Entry gates
1. Type safety passes (`npm run typecheck`).
2. Test suite passes (`npm test`).
3. AnA orchestration suite passes when touched (`npm run test:ana`).
4. Sidecar-unavailable behavior verified (graceful advisory degradation).
5. Export governance payload compatibility unchanged.

## Feature flags (default off)
- `ana.document_stack.source_intake`
- `ana.document_stack.citation_normalization`
- `ana.document_stack.quality_checks`
- `ana.document_stack.reviewer_diffs`
- `ana.document_stack.pdf_validation`

## Rollout rings
- Ring 0: internal QA tenants only.
- Ring 1: selected beta organizations with advisory-only mode.
- Ring 2: broader enablement with policy-configurable enforcement.

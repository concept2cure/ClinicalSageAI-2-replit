# W1/D2 CSR nested authoring completion — implementation receipt

## What already exists
- `server/services/csr-builder.ts` contains the canonical ICH E3 structure, `generateCSRSections`, `flattenICHE3Sections`, and synchronous/queued build entrypoints.
- `server/services/__tests__/csr-builder-completeness.test.ts` is the existing offline completeness regression suite.
- The single governed document editor, AnA authoring, evidence spine and review controls remain unchanged. This is not a second CSR builder.

## Observed defect and repair
The old `generateCSRSections` skipped a whole parent if `sectionsToGenerate` named only a child (e.g. 11.4). Consequently the child was never drafted, despite being a valid requested target. The existing `flattenICHE3Sections` only traversed one descendant level, creating a similar omission for deeper nesting.

The new code recursively traverses the existing E3 tree, drafting only explicitly selected nodes when a selection is supplied, without requiring the parent to be selected. Recursive flattening aligns coverage with the actual hierarchy.

An invalid, duplicate, or explicitly empty selection is now rejected at the public sync and async build entrypoints **before quota reservation**. This prevents an unknown section from consuming a user's CSR-builder quota or being reported complete. Existing no-selection behavior (draft all) remains unchanged.

## Test coverage added
Existing suite extended to assert:
1. A valid child (11.4) is drafted when its parent is not selected.
2. A nonexistent target is rejected before quota.
3. A partly valid target list is rejected before usage recording.
4. Duplicate section codes are rejected.
5. Explicitly empty selections are rejected.

## Verification boundary
GitHub source changes and tests are committed directly to `concept2cure-v2`. This receipt is **not** a claim that CI, TypeScript, browser workflow, live model drafting, deployment, or production CSR readiness passed. Run `npx vitest run server/services/__tests__/csr-builder-completeness.test.ts`, followed by repository release gates. Preserve the existing data completeness, human review, tenant access, source provenance and original-evidence retention controls.

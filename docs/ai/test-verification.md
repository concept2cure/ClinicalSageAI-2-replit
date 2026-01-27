# AI-Generated Test Verification

Goal: Ensure AI-written tests cover edge cases, not only happy paths.

## Implemented Controls

- PR checks enforce test presence for changed source files via scripts/ai/verify-tests.sh
- Reviewers verify edge cases and failure paths using the checklist below

## Verification Checklist

When tests are generated or modified by AI, verify:

- Edge cases (nulls, empty arrays, missing permissions)
- Failure paths (invalid input, network errors, timeouts)
- Security paths (auth failures, RBAC enforcement)
- Boundary values (min/max limits)
- Data integrity (schema constraints, migrations)

## Suggested Workflow (Manual)

1. Identify changed code paths.
2. List input boundaries and failure modes.
3. Confirm tests cover each boundary.
4. Run tests locally or in CI.
5. Record in PR checklist.

## CI Integration (Enabled)

The PR checks workflow enforces test presence for changed source files using:

- scripts/ai/verify-tests.sh

This blocks PRs that change source files without a corresponding test file.

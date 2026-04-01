# PR DISPOSITION PLAN — Stage 8 Refresh (2026-04-01)

## Control-tower position

This plan follows the requested convergence rules:
- no giant branch merge
- no whole-PR merge for #332
- protect shell truth + governed workspace
- intake by smallest proof-backed slices

## Decision summary

| PR | Decision | Land before beta merge-back? | Intake mode |
|---|---|---|---|
| 335 | Approve conditionally | Yes | Cherry-pick slice (fail-closed + tenant/org + non-prod demo gates only) |
| 333 | Approve conditionally | Yes | Cherry-pick slice (governed upload/export fail-close + consequence enforcement) |
| 334 | Approve conditionally | Yes, but after 335/333 | Split PR: server project-scope safety first, then UI command/panel safety only if shell-safe |
| 332 | Reject as whole PR | No (whole PR) | Defer and salvage only explicit tiny slices with independent proof |

---

## PR 335 — `fix: fail-close mock and fallback api behaviors`

### Required call
- **Should land before beta merge-back?** Yes.
- **How?** Cherry-pick only high-value security slices; do not intake unrelated refactors.

### Required proof before intake
1. Fallback/mock endpoints fail-closed in production mode.
2. Tenant/org context must come from authenticated context (no header-forged org trust).
3. AnA fallback payload behavior must reject unsafe/no-provider paths with explicit non-success envelope.

### Reject conditions
- Any shell route drift.
- Any change that weakens canonical auth/session path.

---

## PR 334 — `fix: harden project conversation scope and shell command safety`

### Required call
- **Should land before beta merge-back?** Yes, but after 335 and 333.
- **How?** Split into two slices:
  - Slice A: project conversation scope mutation safety (server-side)
  - Slice B: command/panel UX safety (client-side), only if route/shell truth unchanged

### Must-review points
- conversation scope fix (project isolation)
- command palette truth alignment with mounted routes
- unsupported panel guardrails
- no conflict with Stage 5/7 shell truth behavior

### Reject conditions
- UI changes that introduce dead destinations.
- command routes that bypass canonical project shell path.

---

## PR 333 — `fix: hard fail closed governed harness bypass and export gaps`

### Required call
- **Should land before beta merge-back?** Yes.
- **How?** Cherry-pick governed fail-closed files only.

### Must-review points
- governed upload fail-close behavior
- export governance fail-close behavior
- artifact consequence enforcement on regulated output
- consistency with current governed workspace flow

### Reject conditions
- non-governed bypass path remains available for regulated artifact generation/export.
- change relies on silent warning logs but still returns success for regulated writes.

---

## PR 332 — `refactor: forensic system-wide pathway cleanup — remove ~143,700 lines of dead code`

### Required call
- **Do not merge as whole PR.**
- Current recommendation: **Defer whole PR until after RC** and treat as deletion quarry.

### If rescue is attempted, split buckets exactly
1. **Bucket 1 (safe docs/dev-only):** deletion of obsolete docs/scripts that are not imported, referenced in package scripts, or mounted in runtime.
2. **Bucket 2 (dead test fixtures):** only fixtures/tests with zero references and no CI dependency.
3. **Bucket 3 (legacy route wrappers):** only after route mount audit confirms no path ownership.
4. **Bucket 4 (component removals):** only if import graph proves unreachable from `App.jsx`/`ZenRouter.tsx`.

Each bucket must ship with:
- before/after import graph proof
- route mount audit proof
- targeted smoke tests


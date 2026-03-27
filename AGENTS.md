# ClinicalSageAI Codex Ground Rules (Root Scope)

This file governs the entire repository unless overridden by a deeper `AGENTS.md`.

## Control-Tower Execution Model
- Use one lead control-tower session plus focused implementation sessions in separate worktrees/branches.
- Do not run parallel implementation on the same branch (a branch may only be checked out in one worktree at a time).
- Start with up to three active sessions at once: control-tower, ingestion, governance/observability.
- Add retrieval, workflow/compute, and eval/release sessions only after interface contracts are approved.

## Repository Safety Rules
- No new production dependency without a written justification doc in `docs/`.
- Every new subsystem must ship with tests and documentation in the same workstream.
- Preserve governed artifact lifecycle, provenance links, and audit traceability.
- Prefer feature flags for all new infrastructure paths.
- Policy/review/export/approval gates must fail closed.
- No direct writes from experimental services to core regulated artifact tables.
- Benchmark before enabling any experimental or alternate path by default.

## Change Management
- Control-tower session owns repo truth, branch/worktree naming, merge order, and release gates.
- Implementation sessions must align to explicit data contracts before merge.
- Do not mass-implement architecture before publishing control documents.

# CERv2 Codespace Agent Orchestration Playbook

## Goal
Run CERv2 like a serious product team: clear roles, parallel execution, PR discipline, and non-negotiable quality gates.

## Agents
Custom agents live under `.github/agents/` and map to project responsibilities:
- cer-orchestrator: owns plan, integration, and acceptance.
- cer-ux: IA, interaction patterns, and layout spec.
- cer-backend: schema, APIs, audit logs, storage, validation.
- cer-frontend: workbench UI, routes, evidence panel, co-author UX.
- cer-qa: test plan, integration tests, e2e flows, CI checks.
- cer-security: threat model, secrets, tenant isolation, auditability.

## Operating modes
### Option A — Subagents (local sessions only)
If your VS Code session supports subagents, run everything inside the orchestrator session and delegate to subagents:

1. Open the orchestrator session.
2. Spawn subagents for ux, backend, frontend, qa, and security.
3. Each subagent returns:
   - a concise deliverable
   - a checklist of file changes
   - a command runbook (migrations/tests)

### Option B — Parallel sessions (Codespaces default)
If subagents are unavailable, open parallel agent sessions and isolate work by branch.

1. Open Chat view.
2. New Session → create sessions for ux, backend, frontend, qa, security.
3. Each session works on its own branch and submits a PR.

## Branch discipline
- feat/workbench-shell
- feat/evidence-objects
- feat/claims-matrix
- feat/standards-navigator
- feat/outcomes-substantiation
- feat/coauthor-citations
- feat/preflight-export-ledger

## PR checklist (non-negotiable)
- [ ] migrations included
- [ ] API validation included
- [ ] tenant scoping enforced
- [ ] audit events emitted
- [ ] tests added/updated
- [ ] UI states: loading/error/empty done
- [ ] deep links work
- [ ] no secrets committed

## Default acceptance criteria
Every feature must ship with:
- schema + constraints
- API validation + tenant scope
- audit logging
- UI empty/error/loading states
- tests (unit + integration, e2e where relevant)
- deterministic exports if applicable

# CERv2 Codespace Agent Orchestration Playbook

## Goal
Run the existing product in Codespaces with clear roles, scoped parallel execution, and non-negotiable quality gates. The only branch is `concept2cure-v2`; commit and push directly to it incrementally, without PRs. Root [AGENTS.md](../../AGENTS.md) and [CLAUDE.md](../../CLAUDE.md) govern every session.

For the current local editor testing workflow, use the [Codespaces human-testing handoff](../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md). It requires no deployment or hosted environment. The older CER/Phase 4.1 criteria below are historical subsystem guidance, not additional launch scope or proof that those capabilities are ready.

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
If subagents are unavailable, open parallel agent sessions and isolate work by file ownership on the same canonical branch.

1. Open Chat view.
2. New Session → create sessions for ux, backend, frontend, qa, security.
3. Assign non-overlapping file ownership. Every session works on `concept2cure-v2`; the control tower coordinates incremental direct commits and pushes.

## Canonical-branch discipline
- Use only `concept2cure-v2`; do not create a feature branch or alternate worktree.
- Synchronize with `origin/concept2cure-v2` before publishing and resolve shared-file ownership with the control tower.
- Commit and push completed, verified increments directly. Do not open a PR or bypass normal Git hooks.
- Keep implementation, tests, contracts and non-secret evidence in this repository.

## Increment checklist (non-negotiable)
- [ ] migrations included
- [ ] API validation included
- [ ] tenant scoping enforced
- [ ] audit events emitted
- [ ] tests added/updated
- [ ] UI states: loading/error/empty done
- [ ] deep links work
- [ ] no secrets committed
- [ ] no `.history/**` content committed
- [ ] scope limited to the iteration deliverables (no unrelated workflows/pages/services)

## Runtime verification (required before review)
Provide proof that the feature runs locally or in codespace:
- [ ] `npm run db:check` succeeds
- [ ] migrations applied cleanly
- [ ] smoke test passes with a real `programId`
- [ ] curl proofs for primary endpoints (CRUD + audit where applicable)
- [ ] 10–30s UI clip(s) demonstrating the critical flows

**Phase 4.1 addendum:**
- [ ] Proof certificate endpoint returns deterministic payload for the same workflow run.
- [ ] Proof verification endpoint rejects tampered certificate payload.
- [ ] UI proof explorer shows valid/invalid status and failure reasons.

Use the explicitly selected local PostgreSQL database in the current human-testing handoff. A Codespaces startup banner does not prove that the schema is installed or that the app is running.

## Publication gate
The control tower verifies the scoped change, synchronizes the canonical branch, and runs the normal publication hooks before a direct push. An incomplete or failed check is recorded as such; it is not an overall pass.

## Default acceptance criteria
Every feature must ship with:
- schema + constraints
- API validation + tenant scope
- audit logging
- UI empty/error/loading states
- tests (unit + integration, e2e where relevant)
- deterministic exports if applicable

### Phase 4.1 Proof System Acceptance Criteria (Enterprise Gate)
Each proof component must meet the following acceptance criteria before Phase 4.2 begins:
- **Formal Compliance Graph:** deterministic DAG compilation; invariant validation; cycle detection; stable hash output; audit log entries for compilation and run context.
- **ZK Authorization Proofs:** role-scoped public signals; signature/approval binding; privacy preserved; verification fails on expired/revoked credentials; deterministic verification.
- **Delta Verification Engine:** baseline snapshot hashing; drift detection across workflow + data; diff report persisted; false-positive rate <1% in regression suite.
- **Compliance Certificate Generator:** immutable schema; cryptographic binding to workflow run; reproducible proof bundle; round-trip verification passes; export-safe serialization.
- **Proof Explorer UI:** certificate + verification status visible; failure reasons surfaced; empty/error/loading states; access control; audit-safe UI events.

### Phase 4.1 Milestones (must all pass)
- **M1 Graph Integrity**
- **M2 Authorization Proofs**
- **M3 Drift Detection**
- **M4 Certificate**
- **M5 UI + Ops**

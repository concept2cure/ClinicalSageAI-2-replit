# Concept2Cure Codespace and Copilot Playbook

## Goal
Run the existing product in Codespaces with clear roles, scoped parallel execution, and non-negotiable quality gates. The only branch is `concept2cure-v2`; commit and push directly to it incrementally, without PRs. Root [AGENTS.md](../../AGENTS.md) and [CLAUDE.md](../../CLAUDE.md) govern every session.

For the current local editor testing workflow, use the [Codespaces human-testing handoff](../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md). It requires no deployment or hosted environment. The older CER/Phase 4.1 criteria below are historical subsystem guidance, not additional launch scope or proof that those capabilities are ready.

## Current Copilot handoff — 2026-11-13

Use **Copilot Chat in Agent mode inside the Codespace** for this workflow. Read
[AGENTS.md](../../AGENTS.md), [CLAUDE.md](../../CLAUDE.md), the
[one design plan](../design/ONE_DESIGN_PLAN.md), its
[package ledger](../design/one-design-plan.json), and current
[file ownership](../../.design/claude-convergence/COORDINATION.md) before editing.
The founder owns the plan. Complete an existing open package and preserve the
other sessions' changes. The older subsystem milestones below do not authorize
new work or replace this plan.

### Refresh an existing Codespace

First inspect the branch and local work. Preserve uncommitted changes; resolve a
diverged checkout on the canonical branch before continuing. For a clean checkout
on `concept2cure-v2`:

```bash
git branch --show-current
git status --short
git pull --ff-only origin concept2cure-v2
bash .devcontainer/post-start.sh
```

The start script applies the existing migrations, verifies the document Python
runtime, restarts an old backend, and generates or reuses this Codespace's demo
records. Use the private port 5000 link it prints. After pulling, start a new
Copilot conversation or explicitly attach this playbook to the existing one.
A running conversation does not establish that it has read a new checkout.

For a read-only diagnosis, load only the runtime environment in a subshell:

```bash
(
  set -a
  . "${C2C_CODESPACE_STATE:-$HOME/.concept2cure-codespace}/app.env"
  set +a
  npm run codespaces:doctor -- --check-app
)
```

Read the database, schema, storage and provider results separately. Prepared
documents work without a model key; live drafting requires a configured approved
provider and remains subject to the existing qualification and review gates.
Keep private state outside Git and never paste environment-file contents into
chat. The [human-testing guide](../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md)
owns setup, provider options, runtime manifest locations and recovery details.

### Find today's project and document demo

Choose **Demo access → Ana Author → Projects → Quillmont Immunology (fictional
demo)**, then the project ending **QLM-118-101 completed INTERNAL demonstration
handover — SYNTHETIC**. Open **Vault → [Demo · Portfolio] Synthetic study records
→ Completed internal handover · SYNTHETIC** for the Word report, PDF, study data
and checksum inventory; the folder's Export action collects the four files.
This completed internal handover contains unapproved examples, with no regulatory
filing or scientific-approval claim. The same portfolio has eight native CSR
scenarios. As Lumen Lead, the existing LMN-201, LMN-801 and LMN-301 projects have
full synthetic reports in **Author**, ready for independent review.

| Continue the existing owner | Tracked source or evidence |
|---|---|
| Projects, retained archived projects and project home | [Projects](../../client/src/concept2cure/v2/surfaces/Projects.tsx), [Archived projects](../../client/src/concept2cure/v2/surfaces/ProjectsArchived.tsx), [Project home](../../client/src/concept2cure/v2/surfaces/ProjectHome.tsx), [project API](../../server/routes/c2c/projects.ts) |
| Vault documents and the one editor | [Vault](../../client/src/concept2cure/v2/surfaces/Vault.tsx), [DocumentWorkbench](../../client/src/concept2cure/v2/editor/DocumentWorkbench.tsx) |
| Regenerate the portfolio's documents and completed internal package | [Portfolio seed](../../scripts/demo/launch-demo/packs/portfolio.mjs), [Vault files](../../scripts/demo/launch-demo/packs/portfolio-vault.mjs), [handover](../../scripts/demo/launch-demo/packs/portfolio-handover.mjs), [approved Word factory](../../server/services/docx/docxFactory.ts) |
| Demo inventory, actual files and browser receipts | [Project/Vault demo evidence](../evidence/DEMO/2026-11-13-project-vault-examples/README.md) |
| Archived Open and exact saved-section AnA handoff | [Archive evidence](../evidence/F1/2026-11-13-archived-project-open/README.md), [section readiness evidence](../evidence/F1/2026-11-13-editor-section-draft-currentness/README.md) |
| Full compiler, production build and 1,813-case proof tier | [Editor integration evidence](../evidence/F1/2026-11-13-editor-section-draft-currentness/README.md), [proof-tier evidence](../evidence/F1/2026-11-13-proof-tier-current-contracts/README.md) |

These are committed source and receipts. A fresh Codespace regenerates its own
records and runtime IDs through the existing seed/API path; do not copy this
session's PostgreSQL state, private credentials or historical manifest IDs.
Acceptance receipts describe their named revision and limits. Check the current
[GitHub Actions runs](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions?query=branch%3Aconcept2cure-v2)
before describing a newer checkout as passing. Historical standalone rehearsal
scripts retain their recorded Chromium/Python assumptions; use the current
bootstrap and configured test commands for a new environment.

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

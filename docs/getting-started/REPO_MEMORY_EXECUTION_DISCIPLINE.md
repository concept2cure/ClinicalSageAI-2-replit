# Repo Memory & Execution Discipline

## Purpose
This protocol defines the minimum operating discipline every contributor (human or AI) follows **before code moves** and while a task is in flight.

Goals:
- Preserve institutional memory across sessions.
- Prevent context drift and conflicting edits.
- Keep execution deterministic, testable, and auditable.

## 1) Before Code Moves (Mandatory Preflight)
Run this sequence before writing or editing code:

1. **Scope lock**
   - State one explicit task objective.
   - List in/out of scope items.
2. **Repository memory refresh**
   - Read `README.md`, `.ai-instructions.md`, and applicable docs in `docs/`.
   - Read any `AGENTS.md` instructions in scope.
3. **Constraint check**
   - Confirm branch policy and compliance-sensitive areas (auth, audit, PHI/PII, migrations).
   - Identify required tests before implementation.
4. **Execution plan**
   - Create a short checklist of intended file changes.
   - Define verification commands and expected outcomes.

If any of the above is missing, stop and complete preflight first.

## 2) Repo Memory Model
Use lightweight memory artifacts to keep future work coherent.

### Memory tiers
- **Tier A: Normative rules**
  - `.ai-instructions.md`, `AGENTS.md`, branch rules, security/compliance requirements.
- **Tier B: Architectural memory**
  - `docs/ARCHITECTURE.md`, ADRs, module-level design docs.
- **Tier C: Task memory**
  - Current objective, assumptions, open risks, tests run, and outcomes.

### Session memory checklist
Capture these items in commit/PR notes:
- What changed.
- Why it changed.
- What was intentionally not changed.
- What evidence proves correctness (tests, scripts, screenshots/logs when relevant).

## 3) Execution Discipline (During Work)
Follow this loop:

1. **Plan → Change → Verify** in small increments.
2. Keep diffs focused; avoid unrelated refactors.
3. After each meaningful change:
   - run targeted tests/checks,
   - confirm no policy violations,
   - update task memory notes.
4. For high-risk paths (auth, permissions, compliance, migrations):
   - require explicit validation evidence before proceeding.

## 4) Definition of Done
A task is done only when all are true:
- Scope objective met with no out-of-scope drift.
- Required tests/checks executed and reported.
- Documentation updated if behavior/architecture changed.
- Commit and PR include clear summary + verification evidence.

## 5) Fast Command Runbook
Use these baseline commands as part of disciplined execution:

```bash
# repo state
git status --short --branch

# dependency and compile/test pipeline (adjust to task scope)
npm install
npm test

# project-specific verification gate (when available)
scripts/ai/verify-tests.sh
```

> Note: choose the smallest relevant command set for the touched area, but always include at least one objective verification step.

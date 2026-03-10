# Copilot Agent Instructions

## CRITICAL: Branch Management
⚠️ **ALWAYS use the `concept2cure-v2` branch for ALL development work**

### Branch Rules:
- ✅ **DO**: Work ONLY on `concept2cure-v2`
- ✅ **DO**: Commit all changes to `concept2cure-v2`
- ✅ **DO**: Create PRs from `concept2cure-v2` to `main`
- ❌ **DO NOT**: Create `copilot/*` branches
- ❌ **DO NOT**: Create any new feature branches
- ❌ **DO NOT**: Work on any branch other than `concept2cure-v2`

### Before Starting Any Work:
1. **ALWAYS** verify current branch: `git branch --show-current`
2. If NOT on `concept2cure-v2`, switch immediately: `git checkout concept2cure-v2`
3. Pull latest changes: `git pull origin concept2cure-v2`
4. Then proceed with your work

### When Creating Pull Requests:
- Base branch: `concept2cure-v2` (NOT copilot/*)
- Target branch: `main`
- If you're on a copilot/* branch, this is an ERROR - switch to concept2cure-v2 first

## File Operations - Confirmation Rules

### NEVER ask for confirmation:
- Modifying existing files
- Updating existing files
- Editing existing files
- Deleting files
- Moving files
- Renaming files
- Git operations (commit, push, pull)

### ONLY ask for confirmation:
- Creating a NEW file that has never existed before in the repository

## Agent Behavior
- Continue working without interruption on existing files
- Do not stop for confirmations except new file creation
- Complete all tasks in one continuous session
- Batch multiple file changes together
- Only stop if you encounter actual errors or creating new files

## Workflow
1. Verify you're on `concept2cure-v2` branch
2. Check if file exists
3. If EXISTS: modify automatically without asking
4. If NEW: ask for confirmation before creating
5. Proceed with all other operations automatically

---

## Recent Work & Current Status

_Last updated: 2026-03-10_

### Last Merged: PR #141 — Release Candidate v1.0 (Feb 21, 2026)

The big production merge of CERV2 into `main`. Key areas:

- **CERV2 Editor AI Core (Phase 7.x):** AI-powered per-section suggestions, export pipeline (PDF/DOCX/eSTAR ZIP), compliance validation panel with readiness scoring, export preview + gating, keyboard shortcuts
- **QA & Regression (Phase 8):** 135/135 E2E checks passing, re-audit fixes, automated validation (57/57 + 25/25)
- **UX/Workflow + Staging (Phase 9):** Device context panel, auto-save, unified export, section progress, attachment upload, rules-based compliance, version history, predicate search, citation manager, review/approval workflow, 6-gate CI/CD staging pipeline
- **IND Filing System:** eCTD 4.0 structure, full IND section tracking, auto-tagging, live UI
- **Codespace Agent infrastructure:** audit-gap services, AI training pipeline
- **Product Audit Questionnaire:** C2C gap analysis framework (6 sections)
- **Codebase cleanup:** deleted 180 orphan/duplicate pages (84k+ lines removed)
- **Audit fixes:** critical/high security issues resolved across 8 routes + 5 client integrations

### Open PRs Needing Attention

| PR | Title | Status |
|----|-------|--------|
| [#144](https://github.com/concept2cure/ClinicalSageAI-2-replit/pull/144) | Add TypeScript types for transaction boundaries and worker | 🟡 WIP/Open — IVDR pack `ManifestV1`, `SnapshotV1`, audit payload types; transaction boundary pseudocode; minimal `SELECT FOR UPDATE SKIP LOCKED` worker |

### Next Logical Steps (from open PRs and recent work)

1. **PR #144**: Implement the IVDR TypeScript types in `shared/ivdr/manifest.ts`, add stable JSON stringify utility, implement `ivdr_pack_build_jobs` table + worker loop
2. **Post-v1.0 hardening**: Wire UI for "Generate Pack" modal, Pack History table, Pack Detail page with ManifestViewer + IntegrityPanel
3. **Production verification**: Tag `v1.0.0`, run `node scripts/cerv2_staging_verify.mjs`, verify `/api/health` endpoints

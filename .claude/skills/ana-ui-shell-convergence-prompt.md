# Claude Code Prompt — AnA UI Shell Convergence

Copy everything below this line and paste it into Claude Code to begin.

---

## Mission: AnA UI Shell Convergence — Begin Execution

You are executing a full product-shell convergence for the Concept2Cure / TrialSage / AnA platform. The goal is to replace 5 competing shell authorities with one ChatGPT-style conversation-first shell.

### Step 0: Read the controlling documents BEFORE touching any code.

Read these files in this exact order. They are all inside this repo. Do not skip any. Do not start coding until all are read.

```
1. CLAUDE.md
2. .claude/skills/ana-ui-design-constitution.md
3. .claude/skills/ana-chatgpt-parity-ui.md
4. .claude/skills/ana-ui-master-work-order.md
5. .claude/skills/trialsage-repo-ops.md
6. .claude/skills/trialsage-component-registry.md
7. .claude/skills/trialsage-design-system.md
```

Also read these docs if they exist:
```
8. docs/design/ANA_CHATGPT_PARITY_UI_DESIGN.md
9. docs/plans/ANA_UI_MASTER_WORK_ORDER.md
```

If any file is missing, list exactly which ones are missing and stop. Do not guess or improvise — these files contain non-negotiable product laws.

### Step 1: Branch sanity.

```bash
git branch --show-current
git checkout concept2cure-v2
git pull origin concept2cure-v2
```

If this fails, stop and report. Do not create a new branch. Ever.

### Step 2: Execute Phase 1 — Forensic Audit.

Follow the Phase 1 instructions from `.claude/skills/ana-chatgpt-parity-ui.md` exactly. Use Grep, Glob, and Read to answer every audit question with exact file paths. Write the audit to:

```
docs/audits/ANA_UI_FORENSIC_AUDIT_2026-04-05.md
```

Key things to identify:
- Every file that acts as a shell owner (there are at least 5)
- The `LayoutMode` enum — where it lives, how many values, which map to the 5 allowed destinations
- `ZenSidebar.tsx` nav items — count them, list the forbidden top-level destinations that must be removed
- `AnaPersistentPanel.tsx` mode logic — document the full/compact/hidden branching
- `SIDEBAR_NAV_TO_LAYOUT` mapping — document how many layout configs exist
- `GlobalOperatingShell` — what it does, when it appears
- `ToolPanel` drawer — what it does, how it competes with the right drawer concept
- Current theme tokens — fonts, colors, terracotta references
- Whether Communication Center exists or needs to be built from scratch
- All routes that violate the 5-destination architecture (Chats, Projects, Communication Center, Apps, Settings — nothing else at top level)

### Step 3: Execute Phase 2 — Authority Map.

Produce the ownership table from the work order skill. Write it to:

```
docs/plans/ANA_UI_CONVERGENCE_WORK_ORDER_2026-04-05.md
```

Include current owner, future owner, and action (keep/refactor/demote/delete) for every concern:
- App shell
- Sidebar
- Chats view
- Projects view
- Project landing
- Communication Center
- Apps view
- Settings view
- Composer
- Shell tokens
- LayoutMode enum (must collapse from 22+ to ~5-7)
- AnaPersistentPanel mode (must resolve to always-full in chat)
- GlobalOperatingShell (absorb or demote)
- ToolPanel drawer (reconcile with ContextDrawer or demote)
- IndustryWorkspaceShell (demote or delete)

### Step 4: Create the UI surface registry.

Create `config/ui-surface-registry.json` with every shell-level surface you found in the audit. Each entry needs:
- file path
- current status: `active`, `demoted`, `redirected`, `blocked`, or `deleted`
- role description
- action planned

### Step 5: Stop and report back.

After completing the forensic audit, authority map, and surface registry — STOP. Do not begin Phase 3 (implementation) yet. Present:

1. Summary of what you found
2. The ownership table
3. The surface registry
4. Your recommended execution sequence for Phases 3-8
5. Any risks or blockers
6. Any files you expected to find but didn't

I will review everything before authorizing implementation.

### Rules you must follow throughout:

- **Branch:** `concept2cure-v2` only. No new branches. Ever.
- **No file proliferation:** Refactor ZenApp.tsx and ZenSidebar.tsx in place. Do not create AppShellV2.tsx or BetterShell.tsx or similar.
- **Machine room is sacred:** EditorPanel, artifact lifecycle, provenance, review, submission, vault, dossier placement — do not break these.
- **Five destinations only:** Chats, Projects, Communication Center, Apps, Settings. Everything else demotes to inside projects/drawers/tabs.
- **No "clean up later":** Every demoted surface gets removed from nav, routes, and export barrels in the same pass.
- **Proof, not adjectives:** Write audit files, work orders, and validation reports to `docs/`. If you can't prove it, it didn't happen.
- **Surface registry required:** Update `config/ui-surface-registry.json` with every surface you evaluate.

### Controlling law (from CLAUDE.md):

When a shell-level UI surface becomes canonical, you must identify and remove, demote, redirect, or block every superseded competing surface. No duplicate shell authorities may remain. No "clean up later" counts as completion. Before deleting any surface, verify no capability loss — a cleaner UI that does less is a regression.

Begin.

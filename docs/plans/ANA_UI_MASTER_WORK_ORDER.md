# AnA UI Master Work Order

**Status:** Active — Controlling execution directive  
**Branch:** `concept2cure-v2` — ALL work happens here. No new branches. Ever.  
**Date:** 2026-04-05

---

## Controlling Authorities

| Document | Role | Location |
|----------|------|----------|
| `docs/design/ANA_CHATGPT_PARITY_UI_DESIGN.md` | **Design authority** — what to build, what's allowed, what's forbidden | Product constitution |
| `.claude/skills/ana-chatgpt-parity-ui.md` | **Implementation authority** — how Claude Code must approach the repo, sequencing, anti-patterns, validation | Execution operating manual |
| This file | **Work order** — phased plan, exact targets, required proofs, completion criteria | Paste-ready execution brief |

**Conflict resolution:** If this file conflicts with either authority document, the authority document wins. This file summarizes and sequences — it does not override.

---

## Mission

Replace the multi-shell, multi-nav, multi-token product surface with one ChatGPT-style conversation-first shell. Preserve the machine room. Remove shell confusion. Center the conversation.

**The disease:** 5 competing shell authorities, 22+ layout modes, 16 sidebar nav items, 30+ layout configurations, serif + terracotta editorial theme, and no consistent interaction model.

**The cure:** One shell, 5 top-level destinations, ~5-7 layout modes, conversation-first project landing, composer as center of gravity, neutral visual system.

---

## Phase 0: Branch and Repo Sanity

```bash
git checkout concept2cure-v2
git pull origin concept2cure-v2
```

Read in order:
1. `CLAUDE.md`
2. `docs/design/ANA_CHATGPT_PARITY_UI_DESIGN.md`
3. `.claude/skills/ana-chatgpt-parity-ui.md`

Stop if branch checkout fails.

---

## Phase 1: Forensic Audit

**Output:** `docs/audits/ANA_UI_FORENSIC_AUDIT_2026-04-XX.md`

Answer these questions with exact file paths:

| Question | Answer |
|----------|--------|
| What file owns the top-level shell? | |
| How many alternate shell files exist? | |
| How many nav maps exist? | |
| Where are general chats rendered? | |
| Where are project chats rendered? | |
| What owns project landing? | |
| Does Communication Center exist? | |
| Where are apps surfaced? | |
| Where do settings live? | |
| What controls shell tokens? | |
| How many `LayoutMode` values? | |
| What is `AnaPersistentPanel` mode logic? | |
| What legacy shells must be demoted? | |
| What routes violate the 5-destination IA? | |

Use `Grep`, `Glob`, and `Read`. Name exact files.

---

## Phase 2: Authority Map

**Output:** ownership table in `docs/plans/ANA_UI_CONVERGENCE_WORK_ORDER_2026-04-XX.md`

| Concern | Current Owner | Future Owner | Action |
|---------|--------------|--------------|--------|
| App shell | `ZenApp.tsx` (22+ modes) | Refactored `ZenApp.tsx` (~5-7 modes) | Refactor in place |
| Sidebar | `ZenSidebar.tsx` (16 items) | Refactored `ZenSidebar.tsx` (5 items) | Refactor in place |
| Chats view | TBD from audit | `ChatsView.tsx` | Keep/create |
| Projects view | TBD from audit | `ProjectsView.tsx` | Keep/create |
| Project landing | TBD from audit | `ProjectLandingView.tsx` | Conversation-first |
| Communication Center | Likely missing | `CommunicationCenterView.tsx` | Build new |
| Apps view | TBD from audit | `AppsView.tsx` | Keep/create |
| Settings view | TBD from audit | `SettingsView.tsx` | Keep/create |
| Composer | TBD from audit | `Composer.tsx` | Center of gravity |
| Shell tokens | `index.css` + `tailwind.config.ts` | `tokens-shell.css` | Reset |
| LayoutMode enum | `zen-app-constants.ts` (22+) | Same file (~5-7) | Collapse |
| AnaPersistentPanel | Dual mode (full/compact/hidden) | Always full in chat | Resolve |
| GlobalOperatingShell | Partial breadcrumb wrapper | Absorb or demote | Evaluate |
| ToolPanel drawer | Fixed right z-50 | Reconcile with ContextDrawer | Evaluate |
| IndustryWorkspaceShell | Possible competing shell | Demote or delete | Evaluate |

Do not code until this map is coherent.

---

## Phase 3: Shell Convergence (Build Order)

Execute in this exact sequence:

| Step | What | Key Action |
|------|------|-----------|
| 3.1 | Collapse `LayoutMode` enum | 22+ → ~5-7 values |
| 3.2 | Refactor `ZenApp.tsx` | Thin shell coordinator |
| 3.3 | Refactor `ZenSidebar.tsx` | 5 destinations only |
| 3.4 | Resolve `AnaPersistentPanel` | Always-full in chat |
| 3.5 | Build/refactor Chats view | General + project chats |
| 3.6 | Build/refactor Projects view | Browse, search, create |
| 3.7 | Build Project Landing | Conversation-first, not dashboard |
| 3.8 | Build Communication Center | Inbox, Tasks, Reviews, Submissions |
| 3.9 | Build/refactor Apps view | Management + browse surface |
| 3.10 | Build/refactor Settings view | Connections, Skills, Security, Profiles |
| 3.11 | Build Context Drawer | Reconcile ToolPanel if needed |
| 3.12 | Composer integration | `@app`, slash commands, file attach |

---

## Phase 4: Demote Competing Shells

For each legacy shell file, assign one status:

| File | Status | Action |
|------|--------|--------|
| `IndustryWorkspaceShell.tsx` | TBD | Demote/redirect/delete |
| `GlobalOperatingShell` | TBD | Absorb or demote |
| `ToolPanel` drawer | TBD | Reconcile or demote |
| Dashboard-era workspace shells | TBD | Demote/redirect/delete |
| Duplicate settings views | TBD | Demote/redirect/delete |

**Update `config/ui-surface-registry.json`** with every surface status.

**Per CLAUDE.md UI Convergence rules:**
- Remove from nav
- Remove from routes
- Remove from export barrels
- Mark deprecated in file header
- Record in registry
- Delete when no remaining imports, routes, or nav paths

---

## Phase 5: Token Reset

| Token | Current | Target |
|-------|---------|--------|
| Shell font | Poppins + Lora | System sans / DM Sans |
| Shell accent | Terracotta #d97757 | Neutral + one restrained accent |
| Shell background | Warm cream | White/near-white neutral |
| Borders | Mixed | Thin, consistent |
| Radius | Mixed | Modest, consistent |
| Shadow | Mixed | Minimal, popovers only |
| Motion | Mixed | 150-220ms, no bounce |

Document/editor surfaces may keep serif. Shell surfaces may not.

---

## Phase 6: Route and Nav Cleanup

Produce table:

| Old Route/Nav | Problem | New Destination | Action |
|---------------|---------|-----------------|--------|
| Documents (top-level) | Forbidden top-level | Inside projects | Redirect |
| Intelligence (top-level) | Forbidden top-level | Inside projects/apps | Redirect |
| Workspace Home | Forbidden top-level | Projects | Redirect |
| Review/Verify (top-level) | Forbidden top-level | Communication Center | Redirect |
| Submit/Export (top-level) | Forbidden top-level | Communication Center | Redirect |
| Builder (top-level) | Forbidden top-level | Inside projects | Redirect |
| (others from audit) | ... | ... | ... |

No zombie routes. No dead nav IDs.

---

## Phase 7: Responsive Pass

Test at: 1440, 1280, 1024, 768, 430.

Verify at each width:
- sidebar behavior
- active destination clarity
- chat thread dominance
- composer stability
- project switching ease
- Communication Center reachability
- drawer behavior
- upload and `@app` usability

---

## Phase 8: Regression Validation

Verify machine room integrity:

| System | Test |
|--------|------|
| Editor | Opens from chat, from project, from artifact |
| Artifact lifecycle | Create, review, approve, version |
| Provenance | Trail visible |
| Review flow | Reachable from Communication Center |
| Submission flow | Reachable from Communication Center |
| Vault | Still functional |
| Governed actions | Signature, export, audit |

---

## Required Output Files

Before claiming completion, these must exist:

| File | Purpose |
|------|---------|
| `docs/audits/ANA_UI_FORENSIC_AUDIT_<date>.md` | What was found |
| `docs/plans/ANA_UI_CONVERGENCE_WORK_ORDER_<date>.md` | What was planned |
| `docs/reports/ANA_UI_VALIDATION_REPORT_<date>.md` | What was proven |
| `docs/reports/ui-convergence-proof-<date>.md` | Per CLAUDE.md requirement |
| `docs/reports/ui-authority-audit-<date>.md` | Per CLAUDE.md requirement |
| `config/ui-surface-registry.json` | Surface state registry |

---

## Stop Conditions — You Are NOT Done If:

- Two shell owners still exist
- Top-level nav still has old workspace siblings
- `LayoutMode` enum still has >7 active values
- `AnaPersistentPanel` still renders compact/hidden in chat contexts
- Project landing still feels like a dashboard
- Apps still behave like separate products
- Serif shell typography remains
- Terracotta still dominates shell identity
- Responsive behavior is untested
- Editor or artifact workflows regress
- `ui-surface-registry.json` has undefined or stale entries
- Proof reports are not written

---

## Completion Criteria (All Must Be True)

- [ ] One canonical shell owner
- [ ] One canonical nav source (5 destinations)
- [ ] `LayoutMode` collapsed to ~5-7 values
- [ ] `AnaPersistentPanel` resolved to always-full in chat
- [ ] All competing shells demoted/redirected/deleted
- [ ] Shell tokens reset to neutral sans, no terracotta
- [ ] All zombie routes removed
- [ ] Communication Center exists and routes to real work
- [ ] Composer is center of gravity with `@app` invocation
- [ ] All required widths tested
- [ ] Machine room regression-free
- [ ] `ui-surface-registry.json` current
- [ ] All proof reports written to `docs/reports/`
- [ ] No "clean up later" language remains

---

## Final Instruction

Preserve the machine room. Remove shell confusion. Center the conversation. Demote everything that competes with that truth.

No adjectives. Proof.

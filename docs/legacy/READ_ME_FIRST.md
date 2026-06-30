# READ ME FIRST — Claude Code production landing guide

You're holding the Concept2Cure design system. This is **production UI** for a regulated medical-device and IND-program platform. Not a mock. Not a prototype. The exact screens your end users will see.

This file is the only thing you read first. It tells you what's here, what to ship to production, and in what order.

---

## 1. What this is — in plain English

A complete, production-ready user interface for the Concept2Cure regulated-workflow platform, in two parts:

```
.
├── colors_and_type.css            ← the visual design system (colors, fonts, spacing)
├── HANDOFF.md                     ← phase status + changelog
├── CLAUDE.md, README.md, SKILL.md ← non-negotiable design rules
├── PDEV_IND_DESIGN_BRIEF.md       ← the IND program brief (PR #550)
├── CONNECTION_PASS.md             ← wiring contract between MDX surfaces
└── ui_kits/
    ├── mdx/    ← Medical Device + Diagnostics product (Phases 4 · 5 · 6 · 8)
    └── pdev/   ← Pharmaceutical Development → IND product (Phase 7)
```

**Two independent products. Each ships independently.** Same visual system, different domain.

---

## 2. What you actually do — in plain English

The UI files in `ui_kits/` are written in JSX. Your codebase uses TSX. Your job:

1. **Translate each `.jsx` file to `.tsx`** following the file-mapping tables in each phase's install guide. This is a mechanical translation — the layout, state, and behavior stay identical.
2. **Replace the placeholder data inside each file** with calls to your existing API routes. The endpoint paths are listed in each install guide.
3. **Mount each phase under a feature flag** that defaults off, flips on per phase as you finish acceptance testing.

When all phases are flipped on, the platform is in beta. No additional design work required.

---

## 3. The order phases ship — non-negotiable

| # | What ships                       | Files       | Why it's first                                  |
|---|----------------------------------|-------------|-------------------------------------------------|
| 7 | **PDEV (IND programs)**          | 11 files    | Smallest scope · backend already merged · single rail item |
| 4 | MDX lifecycle + system           | ~18 files   | First MDX phase — 6 surfaces                    |
| 5 | MDX beta must-haves              | ~16 files   | E-signature flow blocks every governed action   |
| 6 | MDX diagnostic clients           | ~8 files    | Opens the diagnostic vertical                   |
| 8 | MDX cross-cutting                | ~8 files    | Search · onboarding · conversations             |
|   | **Connection pass**              | refactor    | Threads program context across MDX surfaces     |

Ship phases in order. Don't try to do two phases in one PR.

---

## 4. Phase 7 (PDEV) — your first PR

This is the entry point. Backend is already merged in `concept2cure-v2`. UI-only landing.

### 4.1 Read these, in order

1. `ui_kits/pdev/PHASE_7_INSTALL.md` — the complete handoff playbook
2. `PDEV_IND_DESIGN_BRIEF.md` — the regulatory context (why each surface exists)

### 4.2 The 11 files you translate

| Source                              | Destination in concept2cure-v2                                        |
|-------------------------------------|-----------------------------------------------------------------------|
| `ui_kits/pdev/data.jsx`             | `client/src/concept2cure/pdev/data.ts`                                |
| `ui_kits/pdev/Shell.jsx`            | `client/src/concept2cure/pdev/shell/{Rail,TopBar,AnaDock}.tsx`        |
| `ui_kits/pdev/Confirm.jsx`          | `client/src/concept2cure/pdev/components/ConfirmDialog.tsx`           |
| `ui_kits/pdev/Surfaces.jsx`         | `client/src/concept2cure/pdev/surfaces/{Overview,Workstream,Assembly,FdaStream,Contradictions}.tsx` |
| `ui_kits/pdev/ActivityDetail.jsx`   | `client/src/concept2cure/pdev/surfaces/ActivityDetail.tsx`            |
| `ui_kits/pdev/AiDraft.jsx`          | `client/src/concept2cure/pdev/surfaces/AiDraftWorkbench.tsx`          |
| `ui_kits/pdev/Evidence.jsx`         | `client/src/concept2cure/pdev/surfaces/EvidencePicker.tsx`            |
| `ui_kits/pdev/App.jsx`              | `client/src/concept2cure/pdev/App.tsx`                                |
| `ui_kits/pdev/styles.css`           | `client/src/concept2cure/pdev/app.css` (keep `pdev-` class prefixes)  |
| `ui_kits/pdev/Icons.jsx`            | reuse codebase's existing Lucide icons                                |
| `ui_kits/pdev/index.html`           | not used — the codebase mounts via `<PdevRoute>` under `/pdev`        |

### 4.3 The 14 backend routes — already exist

Listed in `PHASE_7_INSTALL.md §5`. You don't write new server code in Phase 7. Each placeholder data block inside the JSX files gets swapped for a fetch to the matching endpoint:

```
GET /api/pdev/registry
GET /api/pdev/programs/:id
GET /api/pdev/programs/:id/readiness
POST /api/pdev/programs/:id/readiness/snapshot
... (10 more — see install guide)
```

### 4.4 Acceptance

`ui_kits/pdev/PHASE_7_INSTALL.md §8` is the checklist. Don't open the PR until every box is checked. The checklist is what verifies your TSX implementation matches the JSX source byte-for-byte in layout, copy, and behavior.

### 4.5 If even Phase 7 feels too big for one PR

Split per `PHASE_7_INSTALL.md §9`. Ten sub-phases, each independently shippable. Recommended first PR: sub-phases 7.0 + 7.1 only — rail + Overview + Workstream drill, read-only screens, no mutations. ~4 files. Reviewable in 30 minutes.

---

## 5. After Phase 7 — the MDX phases

Same pattern. Each phase has its own install guide with the same structure: file mapping, hook contracts, endpoint list, acceptance checklist, sub-phase sequence.

| Phase | Install guide                       | Surfaces                                                  |
|-------|-------------------------------------|-----------------------------------------------------------|
| 4     | `ui_kits/mdx/PHASE_4_INSTALL.md`    | Engineering · UDI · Postmarket · Analytics · AnA Memory · Admin |
| 5     | `ui_kits/mdx/PHASE_5_INSTALL.md`    | Vault · E-signature · Audit · Notifications · Templates · Quality |
| 6     | `ui_kits/mdx/PHASE_6_INSTALL.md`    | IVD · EU IVDR · CDx · LDT                                 |
| 8     | `ui_kits/mdx/PHASE_8_INSTALL.md`    | Search · Onboarding · Conversations                       |

After all four MDX phases land, do the connection-pass refactor (`CONNECTION_PASS.md`) — threads each program's context through every per-program surface.

---

## 6. Non-negotiable rules — apply to every PR

From `CLAUDE.md`:

- Sentence case everywhere. Never title case.
- No emoji. No exclamation marks. No cheerleading copy.
- Body text is 13px. Page titles max 24px serif.
- Claude orange (`#d97757`) is the only strong color, used once per screen.
- 200ms ease-out transitions. No bounce, no spring.
- Lucide icons only. No other icon library.
- Tokens come from `colors_and_type.css` only. No hard-coded hex codes or font names in any TSX file.
- "AnA" is the product. "Claude" appears only in model-attribution chrome (e.g. `Claude Opus 4.5`).

---

## 7. Verify your work before opening a PR

For each surface you translate:

1. Render it in the codebase. Compare side-by-side with the JSX source loaded in a browser from the bundle.
2. Click every button. Confirm every governed action opens the reason-for-change dialog.
3. Check the acceptance checklist in the phase's install guide. Every box.
4. Run `pnpm typecheck && pnpm lint && pnpm test`. Must be green.

---

## 8. If you get stuck

Stop and add the question to `HANDOFF.md` under `## Open questions` with your initials and the date. Don't guess. Don't invent. The designer who produced this kit will answer in the next round.

---

## 9. What this is NOT

- Not a mock. Not a prototype. Not a wireframe. Not an MVP.
- Not a demo for stakeholders. The end product itself.
- Not pixel-perfect "design intent" — it's the actual UI specification, ready to translate to TSX and ship.

---

Start with §4. Open `ui_kits/pdev/PHASE_7_INSTALL.md` and begin the translation.

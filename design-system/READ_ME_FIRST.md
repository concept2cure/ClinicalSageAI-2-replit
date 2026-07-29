# READ ME FIRST — Claude Code orchestration

You're holding the Concept2Cure design system. It's a lot, so this file is the **only** thing you read first. It tells you what's here, what to ship, and in what order.

---

## 1. What this package is

A design system with **two UI kits** and the regulated-workflow documentation Claude Design produced for `concept2cure-v2`:

```
.
├── colors_and_type.css            ← tokens · every kit reads from this
├── HANDOFF.md                     ← phase status + changelog
├── CLAUDE.md, README.md, SKILL.md ← project framing · read once
├── PDEV_IND_DESIGN_BRIEF.md       ← PR #550 brief
├── CONNECTION_PASS.md             ← MDX cross-surface wiring contract
└── ui_kits/
    ├── mdx/    ← Medical Device + Diagnostics workstream (Phases 4 · 5 · 6 · 8)
    └── pdev/   ← Pharmaceutical Development workstream (Phase 7)
```

**Each kit is independent.** Same shell aesthetic, different domain, no shared JSX. You can ship one kit (even one phase of one kit) without touching the other.

---

## 2. The only sequence that matters

**Ship Phase 7 (PDEV) first.** Smallest scope, backend already merged in `concept2cure-v2`, UI-only landing. Single PR, single rail item, 8 surfaces.

After Phase 7, ship MDX phases in order:
- Phase 4 — MDX lifecycle + system (6 surfaces)
- Phase 5 — beta must-haves (5 surfaces + e-sig + ESG extension)
- Phase 6 — diagnostic clients (4 surfaces)
- Phase 8 — cross-cutting (search · onboarding · conversations)

Each phase is its own PR. Each phase has its own install guide with hooks, endpoints, DB deltas, acceptance checklist.

---

## 3. Phase 7 (PDEV) — start here

### 3.1 Read in this order

1. `ui_kits/pdev/PHASE_7_INSTALL.md` — full handoff playbook (you'll use this end-to-end)
2. `PDEV_IND_DESIGN_BRIEF.md` — what the design implements (the why)
3. `ui_kits/pdev/index.html` — open in a browser to see what you're building

### 3.2 What you implement

| Source                              | Lands at                                                              |
|-------------------------------------|-----------------------------------------------------------------------|
| `ui_kits/pdev/data.jsx`             | `client/src/concept2cure/pdev/data.ts`                                |
| `ui_kits/pdev/Shell.jsx`            | `client/src/concept2cure/pdev/shell/{Rail,TopBar,AnaDock}.tsx`        |
| `ui_kits/pdev/Confirm.jsx`          | `client/src/concept2cure/pdev/components/ConfirmDialog.tsx`           |
| `ui_kits/pdev/Surfaces.jsx`         | `client/src/concept2cure/pdev/surfaces/{Overview,Workstream,Assembly,FdaStream,Contradictions}.tsx` |
| `ui_kits/pdev/ActivityDetail.jsx`   | `client/src/concept2cure/pdev/surfaces/ActivityDetail.tsx`            |
| `ui_kits/pdev/AiDraft.jsx`          | `client/src/concept2cure/pdev/surfaces/AiDraftWorkbench.tsx`          |
| `ui_kits/pdev/Evidence.jsx`         | `client/src/concept2cure/pdev/surfaces/EvidencePicker.tsx`            |
| `ui_kits/pdev/App.jsx`              | `client/src/concept2cure/pdev/App.tsx`                                |
| `ui_kits/pdev/styles.css`           | `client/src/concept2cure/pdev/app.css`                                |

**11 source files. 8 surfaces. 0 new backend.** Mount under `/pdev`. Reuse the existing `colors_and_type.css` already in the repo.

### 3.3 Acceptance is in `PHASE_7_INSTALL.md §8`

Don't ship without going through that checklist.

### 3.4 Sub-phasing inside Phase 7

If even Phase 7 feels like too much for one PR, split per `PHASE_7_INSTALL.md §9` (10 sub-phases, each independently shippable). Recommended split for first PR: **sub-phases 7.0 + 7.1 only** (rail + Overview + Workstream drill, read-only, no mutations). That's ~4 files and ~600 lines.

---

## 4. MDX phases — ship after PDEV

Each MDX phase mirrors PDEV's pattern. Same source-to-codebase mapping convention. Read order per phase:

| Phase | Install guide                       | Surfaces                                                  |
|-------|-------------------------------------|-----------------------------------------------------------|
| 4     | `ui_kits/mdx/PHASE_4_INSTALL.md`    | Engineering · UDI · Postmarket · Analytics · Memory · Admin (6) |
| 5     | `ui_kits/mdx/PHASE_5_INSTALL.md`    | Vault · E-sig · Audit · Notifications · Templates · Quality (5 + universal modal) |
| 6     | `ui_kits/mdx/PHASE_6_INSTALL.md`    | IVD · IVDR · CDx · LDT (4)                                |
| 8     | `ui_kits/mdx/PHASE_8_INSTALL.md`    | Search · Onboarding · Conversations (3)                   |

After all MDX phases land, run the connection pass (`CONNECTION_PASS.md`) to thread `program` context through every per-program surface.

---

## 5. Rules that apply to every PR

From `CLAUDE.md` (non-negotiable):

- Sentence case everywhere. Never Title Case.
- No emoji. No exclamation marks. No cheerleading.
- Body 13px. Max title 18–24px.
- Claude orange (`--accent-100` / `#d97757`) is the only strong color, used once per screen.
- 200ms ease-out motion. No bounce, no spring.
- Lucide icons only.
- Tokens from `colors_and_type.css` only — no hard-coded hex / font-family / spacing.
- "AnA" is the product. "Claude" appears only in model-attribution chrome (e.g. `Claude Opus 4.5`).

---

## 6. If you get stuck

Stop and ask. Don't fill ambiguity with guesses. The `## Open questions` section at the bottom of `HANDOFF.md` is where you log anything that isn't decided here.

---

## 7. Don't do these

- Don't try to ship MDX + PDEV in one PR.
- Don't add files outside the source-to-codebase mappings in each install guide.
- Don't introduce new icon libraries, new fonts, or new color tokens.
- Don't touch surfaces from earlier phases when shipping a later phase — phases are additive.
- Don't bypass `<PdevConfirmDialog>` / `<EsignModal>` on any governed mutation.

That's the whole orchestration. Start with §3. Open `ui_kits/pdev/PHASE_7_INSTALL.md` and work the checklist.

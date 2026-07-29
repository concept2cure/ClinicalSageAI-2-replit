# PDEV kit · Phase 7

Pharmaceutical Development (PDEV → IND) UI for the Concept2Cure design system. Companion to the MDX kit; same shell aesthetic, different domain.

## What's here

8 surfaces + 3 overlays + 1 universal modal, wired against the merged PDEV backend (14 routes, 20 AnA commands, audit + governance).

```
ui_kits/pdev/
├── index.html              · harness (open in browser to review)
├── README.md               · you are here
├── PHASE_7_INSTALL.md      · Claude Code handoff
├── data.jsx                · closed enums + activity registry + AnA commands
├── Icons.jsx               · Lucide set (mirror of MDX kit)
├── Shell.jsx               · Rail + TopBar + AnA dock
├── Confirm.jsx             · universal reason-for-change dialog
├── Surfaces.jsx            · 5 main surfaces (Overview / Workstream / Assembly / FDA / Contradictions)
├── ActivityDetail.jsx      · 6-tab activity sheet (State / Docs / Evidence / Workflow / Provenance / Audit)
├── AiDraft.jsx             · AI drafting workbench (streaming + grade + citations)
├── Evidence.jsx            · evidence picker
├── App.jsx                 · composer + state machine
└── styles.css              · pdev-* classes
```

## Quick start

Open `index.html` directly in a browser. The harness loads React + Babel + the kit and renders the Program dashboard against fixture data. Switch programs via the rail dropdown.

## Codebase port

Read `PHASE_7_INSTALL.md` for the full handoff — file mappings, hook contracts, sub-phase sequence, acceptance checklist.

The backend is already merged in `concept2cure-v2`; Phase 7 is UI-only.

## Key design decisions

- **Per-program** — every PDEV surface anchors to one active program; the rail program selector controls context.
- **Doc-first where possible** — Activity detail's Documents tab is the primary authoring path.
- **Governed mutations only** — every state change, every evidence attach, every approval routes through `<PdevConfirmDialog>` with reason ≥ minimum + typed confirm word.
- **AnA pinned to context** — the right-rail dock context block updates per program + active activity; suggestion chips swap per surface.

## Phase 7 was answered "yes to all" on the 8 open questions

See `PHASE_7_INSTALL.md §6` for the resolved defaults.

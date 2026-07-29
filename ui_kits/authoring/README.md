# Phase 9 — Universal Authoring (kit)

> One authoring engine for every regulatory document, every agency. Two UX modes (Conversation + Workbench) over one document model. Replaces the three pathway-specific editors (EstarEditor, PmaEditor, CerEditor) and the CTD-only `ectd_coauthor` prototype.

## What this kit ships

- **Conversation mode** — AnA-led drafting. Outline (left) · chat (center) · live artifact (right). Stream tokens reveal in-place; provenance on hover; selection toolbar over the artifact.
- **Workbench mode** — Structured authoring. Outline (left) · section table + open-card editor (center) · Ask-AnA / Evidence / Reviewers inspector (right). Same document, different lens.
- **Mode toggle in the top bar** — switches UX skin without losing state. The same outline, the same section, the same chat thread — different shell.
- **Rule packs** — `(doc_type × agency)` keys the outline + status + mandatory flags. Today the kit ships 10 doc types × 6 agencies' worth of outline fixtures (see `data.jsx > AUTH_OUTLINES`).
- **Evidence density toggle** — off / footnote chips / margin rail. Default footnote.
- **Provenance everywhere** — every paragraph carries `data-prov` (source · model · confidence · 21 CFR Part 11 audit id). Hover reveals; never invented.

## Why this exists

Per Claude Code's Phase 9 audit (see `PHASE_9_INSTALL.md §0`):

- `EstarEditor.tsx` (838 LOC) is the canonical editor; `PmaEditor.tsx` and `CerEditor.tsx` are 40-line shims around a shared `DocumentEditor.tsx`. **80% of consolidation is already done in code**; it's just not surfaced as one entry point.
- PMA and CER editors today both call `PATCH /api/cerv2-sections/:id` — a misnamed 510(k) section store. PMA and CER drafts silently land in the wrong table. Phase 9 must ship the schema migration that fixes this.
- No `(doc_type, agency)` rule pack exists server-side today. The eCTD regional rules (`server/services/ectd/ectd-regional-rules.ts`) are the closest seed. Phase 9 introduces a `c2c_rule_packs` registry and the UI is pure-render against it.
- Only PDEV writes to `audit_logs` today (`agent.ana.pdev.activity.ai_draft`). Every other drafting endpoint writes to `ai_generation_logs` (telemetry). Phase 9 adopts the PDEV audit pattern.

## Files

| File                  | Purpose |
| --------------------- | ------- |
| `index.html`          | Mount + script order |
| `styles.css`          | Three-pane grid, both modes, all primitives |
| `Icons.jsx`           | Stroke icons (1.75) — superset of `ectd_coauthor` |
| `data.jsx`            | Rule packs, outlines (10 doc types × 6 agencies), evidence library, seed thread, REWRITES |
| `Shell.jsx`           | Top bar — breadcrumb, doc-type picker, agency picker, mode toggle, focus, autosave |
| `OutlineTree.jsx`     | Recursive tree with status dots, owner avatars, search, readiness footer |
| `Conversation.jsx`    | Chat thread + composer (slash commands, skills) + selection toolbar |
| `Artifact.jsx`        | Document renderer · paragraphs · streaming · hover provenance · margin/footnote evidence · exports `Paragraph` as `window.AuthParagraphInline` for workbench card reuse |
| `Workbench.jsx`       | Section table + KPI strip + Inspector (Ask AnA / Evidence / Reviewers) |
| `App.jsx`             | Composition · streaming engine · selection actions · Tweaks panel |

## What is intentionally static

- Composer doesn't post to an LLM — slash commands render their suggestion list, but pressing Enter only logs the message. The live AnA wiring is documented in `PHASE_9_INSTALL.md §4`.
- "Submit for review", "Export", "Share" are inert.
- "Changes" and "eCTD XML" artifact tabs are inert.
- Workbench section table edits status by row click only (no full status editor).
- Tweaks panel ships behaviour for mode / doc type / agency / evidence density / focus — every other flag is mocked.

## Layouts

```
Conversation mode (default)
┌────────────────────────────────────────────────────────────────┐
│ Topbar · breadcrumb · Type pill · Agency pill · ⟨Conv | WB⟩ … │
├────────┬────────────────────────────┬──────────────────────────┤
│Outline │ Intelligence (chat)        │ Artifact (document)      │
│ M1     │  ┌ user                    │  Section 2.5             │
│ M2 ●   │  └ AnA · tool lines        │  ¶ ¶ ¶ … prov on hover   │
│ …      │  composer + slash menu     │  selection toolbar       │
└────────┴────────────────────────────┴──────────────────────────┘

Workbench mode
┌────────────────────────────────────────────────────────────────┐
│ Topbar · same chrome · toggle flipped to Workbench            │
├────────┬───────────────────────────────────┬──────────────────┤
│Outline │ Section table + KPI strip         │ Inspector tabs   │
│        │ open section card · meta strip    │  Ask AnA         │
│ …      │ paragraphs (same renderer)        │  Evidence        │
│        │                                   │  Reviewers       │
└────────┴───────────────────────────────────┴──────────────────┘
```

## How to extend the rule packs

`data.jsx > AUTH_OUTLINES` keys outlines by `${docType}:${agency}` (e.g. `'ind:fda'`, `'cer:ema'`). To add a pack:

1. Add the doc type if missing in `AUTH_DOC_TYPES`.
2. Add the agency if missing in `AUTH_AGENCIES`.
3. Add the keyed outline. Falls back to `${docType}:ich` then `${docType}:fda`.

In v2, this whole map lifts to `c2c_rule_packs (doc_type, agency, version, required_sections[], validators[], template_id)` — see `PHASE_9_INSTALL.md §5`.

## Where this lives in the rail

The home rail's `User Artifacts` item (`ui_kits/home/data.jsx`) repoints to this kit. No new rail item; one entry point for all authoring across MDX, biopharma and PDEV.

## Open hooks

- `useAnaChat` wiring — when in v2, this surface replaces its in-memory thread with `useAnaChat({moduleContext: { workstream: 'authoring', docType, agency, sectionId }})`.
- Streaming uses the same rAF-driven engine as `ectd_coauthor` so paragraph rewrites stay smooth across rerender.
- Selection toolbar reuses `ectd_coauthor`'s pattern; in v2 it dispatches the same selection range to the `/cerv2-ai/suggest` route (or the new universal route per the install doc).

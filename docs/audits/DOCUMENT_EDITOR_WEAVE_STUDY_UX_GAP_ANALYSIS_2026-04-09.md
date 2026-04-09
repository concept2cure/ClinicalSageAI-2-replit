# Document Editor UX Gap Analysis vs Weave.bio / Study Reference Screens

**Date:** 2026-04-09  
**Scope:** Current Concept2Cure document editor + Data Room UX compared against the five reference screenshots provided by the product team (generation modal, multi-step flow, inline source traceability, Data Room list/search, source-evidence panel).

---

## 1) Executive verdict

**Current state:** Strong underlying capability, weaker orchestration and UX coherence.

- **Capability parity is high** for core authoring: rich editor, AI actions, table insertion, provenance, comments, compare/history, autosave, and governance-aware lifecycle tooling.
- **Experience parity is medium**: the product contains the building blocks but still feels “operator-heavy” compared with the cleaner, progressive, guided UX shown in the reference screens.
- **Primary parity gap:** **workflow legibility** (Generate → Refine → Auto-update with evidence feedback loops) is not surfaced as a first-class, persistent operating model in the editor shell.

**Overall parity rating:** **~72/100 (Feature), ~58/100 (UX), ~65/100 (Combined).**

---

## 2) What the reference screens emphasize (design pattern extraction)

From the provided images, the reference experience appears to optimize for:

1. **Focused generation modal** with explicit section checklist and per-section counts.
2. **Visible staged flow** (First draft → AI refinement → AutoUpdate).
3. **Inline evidence grounding** in-context (source cards + comments adjacent to edited sections).
4. **Simple Data Room search/list** that prioritizes retrieval speed and clear selection state.
5. **Immediate source confidence cues** (“x Sources Identified”) tied to specific document blocks.

Interpretation: the reference design minimizes surface complexity while maximizing confidence loops around source-grounded writing.

---

## 3) Current Concept2Cure capability baseline (repo evidence)

### 3.1 Editor and authoring foundations

- `EditorPanel` is the canonical orchestration layer with inspector architecture, lifecycle logic, autosave, provenance counters, comments, compare, versions, and workflow handoffs.
- `UnifiedDocumentEditor` provides TipTap authoring primitives, table support, slash commands, AI autocomplete, bubble AI rewrite, and optional collaboration extensions.

### 3.2 Data Room / Ask support

- `VaultPage` provides project-scoped **Browse + Ask** tabs, evidence upload, grounded answer rendering, and source cards.
- `/api/evidence/ask` is implemented and rate-limited, with retrieval via `ForesightRAGService` and source citation shaping in response payloads.

### 3.3 Auto-draft flow

- `INDAutoDraftWizard` supports upload → configure → generate → review/open, including project-scoped generation and section-level outputs.

---

## 4) Gap analysis matrix (Weave/Study reference vs current UX)

| Area | Reference expectation (from images) | Current implementation | Gap severity | Notes |
|---|---|---|---|---|
| Generation control panel | Tight modal with section checklists + section counts + one obvious “Generate” CTA | Present in `INDAutoDraftWizard` but separated from main in-editor editing rhythm and visually denser in flow | **Medium** | Capability exists; presentation and immediacy can be simplified |
| Persistent staged flow | Clear, always-legible stages (Draft → AI Refine → AutoUpdate) | Lifecycle ribbon exists, but emphasis is on many inspectors; the 3-step AI loop is not persistent as a simple lane | **High** | Main parity miss in UX clarity |
| In-context source cues | Side-by-side text + source attribution + comments embedded near claim blocks | Provenance/comment panels exist, plus bubble actions; however source confidence is inspector-driven, not always inline | **High** | Users must discover panes vs seeing confidence where they write |
| Data Room retrieval UX | Minimal, high-contrast list/search with instant selection confidence | `VaultPage` has browse/search/upload/ask and source lists; feels functional but less crisp and less “single-purpose” | **Medium** | Needs visual simplification + stronger selection states |
| “Sources identified” affordance | Immediate per-block source count signal | Source counts exist through provenance/ask responses, not consistently projected as per-section inline badges | **Medium-High** | Strong trust multiplier if surfaced in-line |
| AI action discoverability | Obvious progression from draft generation to refinement actions | AI actions exist (rewrite/expand/summarize/regulatory/references) and slash commands are available | **Low-Medium** | Discoverability good, but not framed as a coherent guided journey |
| Review ergonomics | Lightweight review overlays integrated with drafting | Rich inspectors (comments/review/reviewers/compare) exist; heavier mental model | **Medium** | More power, less simplicity |

---

## 5) Specific UX deficits preventing full equality

1. **No canonical “3-phase authoring lane” pinned in the editor shell** that mirrors the reference mental model. Users must infer flow from multiple controls.
2. **Evidence confidence is panel-centric rather than inline-first**; this increases context switching during writing/refinement.
3. **Data Room visual language is not yet as productized** as reference (less contrast hierarchy, weaker selected/active states, less “scan-and-pick” efficiency).
4. **Generation entry points are split** (AutoDraft wizard + toolbar + slash + ask), reducing perceived coherence despite rich capability.
5. **Too many concurrent affordances** in editor chrome for first-pass drafting; expert-powerful but less parity with the reference’s calm, guided feel.

---

## 6) Priority remediation plan (to reach UX equality)

### P0 (must-have for parity)

1. **Introduce a persistent “Authoring Flow Rail” in editor**
   - Stages: **First Draft → AI Refine → AutoUpdate**.
   - One-click actions in each stage.
   - Live status chips per stage (e.g., “4 sections generated”, “2 unresolved refine suggestions”, “last auto-update 3m ago”).

2. **Inline source-confidence badges at heading/paragraph block level**
   - Show **Sources: N** + confidence color token.
   - Click badge opens provenance drawer anchored to that block.

3. **Unify generation launch into one primary CTA path**
   - “Generate Draft” always opens a consistent section-selection modal with compact checklist UI.

### P1 (should-have)

4. **Data Room simplification pass**
   - stronger selected row styling,
   - denser but clearer metadata rows,
   - “active evidence set” visual state,
   - reduce visual noise in non-critical metadata.

5. **Contextual review overlays**
   - lightweight in-canvas review comments + source cards for current section,
   - advanced controls remain in inspectors.

6. **Flow-linked telemetry and health indicators**
   - surface source coverage %, unresolved contradictions, reviewer blockers directly in flow rail.

### P2 (nice-to-have)

7. **Preset workflows by document type (IND tox summary, CMC, CSR)** that preconfigure generation/refinement strategy.
8. **Adaptive UI density modes** (Guided / Power) for new vs expert users.

---

## 7) Acceptance criteria for “full equality”

You can consider equality reached when all are true:

1. A new user can generate, refine, and source-validate a section **without opening secondary inspectors** for the core path.
2. Source confidence is visible **at the point of writing**, not only in separate side panels.
3. Data Room search-to-selection-to-ask loop is completed in **≤3 UI moves** for common tasks.
4. The editor consistently communicates **current stage + next best action**.
5. Usability benchmark: **time-to-first-grounded-draft** and **time-to-source-validated-edit** match or beat current reference baselines in internal test scripts.

---

## 8) Repo evidence anchors used in this review

- Canonical editor orchestration and inspector model: `client/src/concept2cure/components/editor/EditorPanel.tsx`.
- TipTap authoring + AI actions + slash/bubble/table/collaboration primitives: `client/src/concept2cure/components/editor/UnifiedDocumentEditor.tsx`.
- Auto-draft wizard flow: `client/src/concept2cure/components/editor/INDAutoDraftWizard.tsx`.
- Data Room Browse/Ask/upload UX: `client/src/concept2cure/pages/VaultPage.tsx`.
- Ask endpoint implementation and citation shaping: `server/routes/evidence-ask.ts`.

---

## 9) Bottom line

Concept2Cure is **not missing core editor capabilities**; it is missing a **more opinionated, low-friction orchestration layer** that presents those capabilities in the same streamlined workflow language as the reference experiences. Prioritizing the flow rail + inline source confidence + unified generation entry point should close most of the perceived parity gap quickly.

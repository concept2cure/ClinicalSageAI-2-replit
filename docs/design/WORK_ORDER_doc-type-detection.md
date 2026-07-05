# WORK ORDER — Document-Type Detection → AnA Document Studio Integration

| | |
|---|---|
| **Work Order ID** | WO-ANA-DTD-01 |
| **Issued by** | Claude Code (implementation engineer) |
| **Assigned to** | Claude Design (UI/UX) |
| **Product owner** | Concept2Cure (decisions marked ⚑ require your sign-off) |
| **Date issued** | 5 July 2026 |
| **Source capability** | PR #1004 — natural-language document-type detection (18 document types, confidence-scored). CI green. Branch `claude/improve-ana-responsiveness-CqFU4`. |
| **Governing spec** | `docs/design/ANA_DOCUMENT_STUDIO_DESIGN_ADVISORY.md` — **read first; this work order does not replace it** |
| **Design authority** | `docs/design/concept2cure-design-system/project/ui_kits/ana_ri/App.jsx` (the bundle) |
| **Status** | OPEN — awaiting Phase 0 decisions before Phase 1 build |

---

## 1. Objective

Wire the new natural-language **document-type detection** into the **existing** AnA Document Studio so that when AnA recognises a request for a specific regulatory document (e.g. "draft a clinical overview"), the interface confirms the document type, communicates its ICH/FDA structure, and primes the authoring surface — using the existing token system, components, and `data-status` contract. **No new visual language is to be invented.**

### In scope
- The detected-document-type chip on the assistant message (`Message.tsx`).
- Priming the `DocumentStudioPane` from a detection (title, pending structure).
- The section-outline surface (the ICH section skeleton).
- Confidence and null-state treatments.

### Out of scope (do not design in this work order)
- Any change to the trust-panel verdict logic (verification/consistency/etc.) — advisory §7.
- The e-signature / seal flow — advisory §8.
- Export/DOCX rendering — already built.
- The 17 authoring workstreams themselves — this is the *detection → studio* bridge only.

---

## 2. Background — the gap this closes

Detection fires on the `orchestration` SSE event **before the first token streams**, and today does exactly one thing: sets a text chip on the message. The `DocumentStudioPane` opens on a *different* event (`artifact_draft`) and is unaware of the detected type. The two systems are unconnected. Additionally, the shipped chip uses `var(--ana-accent, #5b6af5)` — a **token that does not exist**, with an off-brand indigo fallback. This work order connects the two systems and eliminates the un-anchored styling.

| Stage | Now | File / line |
|---|---|---|
| Detection runs (pre-stream) | returns template + confidence | `orchestrator.ts` step 4c |
| Metadata to client | `id, displayName, chipLabel, authority, submissionFamily, confidence` | `stream.ts:546–555` |
| Stored on message | `detectedDocumentType` | `useAnaChat.ts` |
| Rendered | text chip, phantom token | `Message.tsx:325–333` |
| Studio opens later | `DocumentStudioPane`, **unaware of type** | `Ana.tsx:1126` |

---

## 3. Deliverables

Each item has an ID, target files, acceptance criteria, dependencies, and phase. **Every deliverable must additionally pass the Anchoring Contract (§4).**

### WO-1 — Detected-document-type chip (redesign + de-phantom) · Phase 1
- **What:** Final treatment for the `detectedDocumentType` chip, unified with the existing `detectedLens` chip into one message-metadata grammar.
- **Target files:** `Message.tsx` (lines 316–333), `styles.module.css` (new named class), bundle `App.jsx`.
- **Design decisions to resolve:** persona colour (`--ai`) vs authority-coded colour set (FDA/ICH/EMA/ISO/Multi). Both `detectedLens` and `detectedDocumentType` must share one visual system, not two inline variants of `.cite`.
- **Acceptance criteria:**
  - [ ] No inline `style={{…}}` colour/spacing overrides; one named class in `styles.module.css`.
  - [ ] Zero raw hex; every value is a token (§6).
  - [ ] Renders correctly in light **and** dark.
  - [ ] Icon or shape accompanies the label (colour-never-alone).
  - [ ] `detectedLens` and `detectedDocumentType` visibly belong to the same family.
- **Depends on:** nothing. Can start immediately.

### WO-2 — Studio priming from detection ⚑ · Phase 1
- **What:** Define whether/how a high-confidence detection (`confidence ≥ 0.4`) primes `DocumentStudioPane` *before* the draft streams: pre-title ("Clinical Overview · ICH M4E"), and a *pending* structure state.
- **Target files:** `DocumentStudioPane.tsx`, `Ana.tsx` (studio open/close logic), `styles.module.css`.
- **Product decision required (⚑):** does detection auto-open the Studio early, or stay chat-only until `artifact_draft`? Advisory §4.1 ("Studio is additive, never a mode-switch").
- **Acceptance criteria:**
  - [ ] The "primed / pending" state is a designed state (not a blank pane), themed via tokens.
  - [ ] Maps to a `data-status` value — reuse an existing one or propose `pending_structure` as an **addition** to the Appendix A contract (not a parallel enum).
  - [ ] Does not disrupt the chat column when it opens (advisory §4.1).
  - [ ] Running / empty / error states all designed, not just the primed happy path.
- **Depends on:** ⚑ product decision; WO-4 data (for the structure content).

### WO-3 — Section-outline surface ⚑ · Phase 2
- **What:** Where and how the document's ICH section skeleton renders (headings, codes, required flags, word targets). This is the highest-value signal — it lets a user verify structure before reading 2,000 words.
- **Target files:** `DocumentStudioPane.tsx` (or a new sibling panel), `styles.module.css`, bundle `App.jsx`.
- **Product/design decision (⚑):** home = a **pending-structure strip at the top of the right-pane trust stack** (advisory §4.2 order) **vs** an outline **in the document body** that fills in as sections draft.
- **Acceptance criteria:**
  - [ ] Themed through the existing trust-panel family (advisory §7) and `data-status`, not a bespoke card.
  - [ ] Required vs optional sections visually distinguished (not by colour alone).
  - [ ] ICH codes rendered in `--font-mono`, subdued (reference, not primary hierarchy).
  - [ ] Word targets shown as a compact range (e.g. "~600–1000 words").
  - [ ] Binds to the real `TemplateSection[]` shape (§7).
- **Depends on:** **WO-4 (server field) — hard prerequisite.** No data on the wire = nothing to build.

### WO-4 — [CLAUDE CODE] Forward `sections[]` on the SSE event · Phase 1
- **What:** Add the `TemplateSection[]` array + a shared type so WO-3 has data. **This is Claude Code's task, listed here as WO-3's dependency.** See §5.
- **Owner:** Claude Code. **Status:** ready to land on request.

### WO-5 — Confidence + null-state treatments · Phase 1
- **What:** (a) A distinct, non-alarming low-confidence treatment for `confidence < 0.4` ("Likely: …"); (b) confirm the null state (most turns) renders **nothing** — no chip, no primed Studio.
- **Target files:** `Message.tsx`, `useAnaChat.ts` (null already handled), `styles.module.css`.
- **Acceptance criteria:**
  - [ ] Low-confidence ≠ high-confidence, and never overstates certainty (honesty contract, advisory §9).
  - [ ] `detectedDocumentTemplate: null` → zero document UI. Verified against a no-match message.
- **Depends on:** WO-1 (shares the chip class).

---

## 4. The Anchoring Contract (binding acceptance rules)

**Any deliverable that fails one of these is returned, not built.** This is the mechanism that keeps design tied to the codebase.

1. **Colours are named tokens** from `client/src/concept2cure/design/claude-design.css`. No raw hex in a proposal. Can't name the token? Propose it in the bundle (rule 5) — don't hardcode.
2. **Banned pattern, for reference:** `var(--ana-accent, #5b6af5)` — phantom token, off-brand fallback. This is the archetype being eliminated.
3. **Every component change names its real `.tsx` file** in `client/src/concept2cure/components/ana/`.
4. **Every state maps to the existing `data-status` contract** (advisory Appendix A). New states are *additions* to that enum, never a parallel one.
5. **New visuals land in the bundle first** — `…/ui_kits/ana_ri/App.jsx` is authority; engineering mirrors it. Standing rule (advisory §3.1): "No new design tokens or selectors — every style used exists in the bundle."
6. **Deliverable = three maps, not a picture.** Each mockup ships with: a **Token map** (every colour/space/type as a token name), a **Component map** (which `.tsx` files change and how), a **State map** (which `data-status` values, incl. running/empty/null).
7. **WCAG 2.2 AA held** (advisory §10): colour-never-alone, `:focus-visible` ring via token, `prefers-reduced-motion` fallback. Already met — do not regress.
8. **Reviewer-grade tone, calm motion** (advisory §11): no emoji on the governed path, ≤200ms `--ease`, factual microcopy.

---

## 5. Reciprocal commitments — what Claude Code delivers to unblock you

These remove blockers on the implementation side so Design is never waiting or guessing. Marked with current status.

| ID | Commitment | Unblocks | Status |
|---|---|---|---|
| CC-1 | **Forward `sections[]`** (`TemplateSection[]`) on the `orchestration` SSE event (`stream.ts:546`) + a **shared type** in `shared/types/` so server + client + your data map reference one source. | WO-3; kills payload drift | Ready — awaiting go |
| CC-2 | **Land the chip reference refactor** (§8 of the design-instructions doc): phantom token → named class + `--ai` token, both themes. Gives you a concrete "this is the bar" example. | WO-1 starting point | Ready — awaiting go |
| CC-3 | **Dev-enablement recipe + golden fixture**: documented steps to run the app with `ENABLE_ANA_DOCUMENT_STUDIO` on, a canonical prompt ("draft a clinical overview for the NDA"), and a fixture that produces a detected type + sections — so you and I share one reference frame and I can screenshot my own builds. | design review loop | Ready — awaiting go |
| CC-4 | **Self-audit to WCAG 2.2 AA** on every change using the `accessibility-enforcement` standard, and report the audit with each PR. | acceptance | Standing |

---

## 6. Token reference (use these by name)

Defined in `claude-design.css`, both light + dark. The house aesthetic is **"quiet stone, not neon"** — status reads as fact, not alarm.

| Role | Token | Light value | Note |
|---|---|---|---|
| AnA persona | `--ai` | `#6a9bcc` | AnA's identity colour — **use this, not indigo** |
| Brand accent (primary action only) | `--accent-main-100` | `#d97757` | Claude terracotta |
| Accent pressed | `--accent-main-200` | `#c96442` | |
| Accent wash | `--accent-subtle` | `--accent-main-000` | |
| Status — good | `--success` | `#788c5d` | earthy olive |
| Status — caution | `--warning` | `#c87d2e` | ochre |
| Status — problem | `--error` | `#b93a3a` | brick (token authoritative over module fallbacks) |
| Document body | `--font-serif` | Tiempos Text → Georgia | serif *by design* — reads as a document |
| UI chrome / labels | `--font-sans` | Styrene B → system | |
| ICH codes / IDs | `--font-mono` | ui-monospace | |
| Surfaces | `--bg-000/100/200`, `--canvas-elevated` | | |
| Ink | `--ink`, `--ink-body`, `--ink-muted`, `--ink-subtle` | | watch `--ink-subtle` contrast on light |
| Borders | `--border`, `--border-subtle`, `--border-strong` | | |
| Radius | `--radius-sm` (4px), `--radius-md` (6px), `--radius-lg` (8px) | | |
| Motion | `--ease` (200ms) | | wrap in `prefers-reduced-motion` guard |

---

## 7. Data reference

**On the wire today** (`orchestration` SSE → `AnaChatMessage`):
`id`, `displayName` (e.g. "Clinical Overview (ICH M4E)"), `chipLabel`, `authority` (`FDA`|`EMA`|`PMDA`|`ICH`|`ISO`|`Multi`), `submissionFamily` (e.g. "CTD Module 2"), `confidence` (0–1), `suggestedActions[]`.

**Not yet on the wire — CC-1 delivers this** (`document-templates.ts:20`):
```ts
interface TemplateSection {
  heading: string;                 // "2.5.1 Product Development Rationale"
  code?: string;                   // "2.5.1" — ICH code
  guidance: string;                // drafting guidance (likely NOT surfaced to UI)
  targetWords?: [number, number];  // [600, 1000]
  required: boolean;
}
```
WO-3 binds to `TemplateSection[]`. It cannot begin until CC-1 lands.

---

## 8. Phase 0 — decisions required before build starts

Work does not start until these are answered. ⚑ = product owner sign-off.

1. **⚑ WO-2:** Does high-confidence detection auto-open/prime the Studio, or stay chat-only until a draft artifact arrives?
2. **⚑ WO-3:** Section outline home — trust-stack strip vs document-body outline?
3. **WO-1:** Chip colour model — AnA persona (`--ai`) vs authority-coded set?
4. **Delivery format:** confirm Design delivers as **bundle `App.jsx` edits** and/or the **three maps** (§4.6) — *not* pixels. (Prerequisite for the whole contract to function.)
5. **Microcopy sign-off:** who approves user-facing strings ("Drafting:", "Likely:", section labels) given regulatory copy sensitivity (advisory Appendix B/G)?

---

## 9. Sequencing

**Phase 1 (the bridge — ship first):** CC-1, CC-2, CC-3 (Claude Code) → WO-1 (chip), WO-2 (minimal priming: title only), WO-5 (confidence + null).
**Phase 2 (the structure):** WO-3 (section outline), WO-2 full pending-structure state.

Rationale: ship the working, in-system bridge before the elaborate outline surface. Each phase is one reviewable PR.

---

## 10. Responsibilities

| Item | Design | Claude Code | Product ⚑ |
|---|---|---|---|
| Phase 0 decisions 1–2 | input | input | **decides** |
| Phase 0 decisions 3–5 | **decides** (3), routes (5) | input | approves |
| WO-1, WO-3, WO-5 (visual spec) | **owns** | implements | — |
| WO-2 (interaction spec) | **owns** | implements | decides trigger |
| CC-1…CC-4 | consumes | **owns** | — |
| Anchoring Contract enforcement | complies | **gatekeeps** | — |
| WCAG 2.2 AA | designs to | audits + reports | procurement gate |

---

## 11. Definition of Done (feature-level)

- [ ] All Phase 0 decisions recorded.
- [ ] WO-1, WO-2, WO-5 merged; chip carries zero phantom tokens / zero inline colour.
- [ ] CC-1 shared type in place; server + client bind to one contract.
- [ ] WO-3 merged, bound to real `TemplateSection[]`.
- [ ] Every new state themed via tokens, both light + dark, mapped to `data-status`.
- [ ] WCAG 2.2 AA audit passes and is attached to each PR.
- [ ] Null state verified: a no-match message shows no document UI.
- [ ] Nothing user-visible until `ENABLE_ANA_DOCUMENT_STUDIO` is enabled per-org (fail-closed).

---

*Companion documents: `DESIGN_INSTRUCTIONS_doc-type-detection.md` (the narrative version of §3–§7) and `ANA_DOCUMENT_STUDIO_DESIGN_ADVISORY.md` (the governing spec). This work order is the actionable, acceptance-criteria form.*

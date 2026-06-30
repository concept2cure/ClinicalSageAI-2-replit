# Concept2Cure — Product Design Advisory for Claude Design

> **Two parts.** **Part I** (sections 1–15 + Appendices A–L) is a deep dive on the **AnA Document Studio** surface and its 17 regulatory-authoring workstreams. **Part II** (after the appendices) is a **codebase-wide design survey of the entire client application** — the shared UI system, the app shell, every regulatory module, and the global UX systems (i18n/theming/responsive/a11y) — produced from a read-only sweep of ~529 client source files by a 6-agent survey team. If you want the whole-product picture first, jump to **Part II → "System-wide themes."**

**Audience:** Claude Design (UI/UX designer) and the Concept2Cure product team
**Author:** Claude Code (implementation engineer)
**Scope:** Part I — everything a designer needs about the AnA Document Studio surface and its 17 workstreams (state, design-system constraints, every UI surface, the interaction model, the non-negotiable compliance/accessibility rules, prioritized recommendations). **Part II — the whole product: the shared design system, the application shell, all device + drug regulatory modules, the cross-cutting workflow surfaces, and the global UX systems, each with grounded design debt + recommendations, plus a codebase-wide priority roadmap.**
**Status of the work:** Built, hardened to release grade, composed onto one integration branch, rebased onto current product trunk, and CI-verified for everything in our ownership. Ships **dark** behind feature flags. Nothing is live for users yet — this is the moment to get the visual/UX layer right before pilot enablement.

> **How to read this:** Sections 1–5 are orientation. Section 6 is the exhaustive surface inventory (your build map). Sections 7–11 are the rules the UI **must** obey (regulated product). Section 12 is my recommendations — the part where I'm asking for your judgment. Section 13 is the practical handoff.

---

## Table of Contents

1. [What this is and why it exists](#1-what-this-is-and-why-it-exists)
2. [The product thesis: the author → validate → verify → resolve → seal loop](#2-the-product-thesis)
3. [Design authority and the token system (hard constraints)](#3-design-authority-and-the-token-system)
4. [The core interaction model (split-pane chat + document)](#4-the-core-interaction-model)
5. [State model: the SSE event stream the UI renders](#5-state-model-the-sse-event-stream)
6. [Complete surface inventory (29 components)](#6-complete-surface-inventory)
7. [The Trust-Panel pattern family (the heart of the product)](#7-the-trust-panel-pattern-family)
8. [The 21 CFR Part 11 governance layer (non-negotiable)](#8-the-21-cfr-part-11-governance-layer)
9. [The honesty contract → UI implications](#9-the-honesty-contract--ui-implications)
10. [Accessibility: WCAG 2.2 AA (already met — must be preserved)](#10-accessibility-wcag-22-aa)
11. [Motion & microcopy discipline](#11-motion--microcopy-discipline)
12. [My recommendations (prioritized)](#12-my-recommendations)
13. [Handoff: where everything lives, flags, how to preview](#13-handoff)
14. [Open design questions that need a decision](#14-open-design-questions)
15. [Glossary](#15-glossary)
16. **Appendices A–L** — detailed reference: the [`data-status` styling contract](#appendix-a--the-unified-data-status-styling-contract), [verdict matrix](#appendix-b--verdict-vocabulary-matrix), [data shapes](#appendix-c--result-data-shapes-the-ui-binds-to), [e-sign field spec](#appendix-d--the-e-signature-modal-field-by-field), [SealBadge spec](#appendix-e--sealbadge--provenancetrail-spec), [per-component specs](#appendix-f--per-component-deep-specs), [microcopy inventory](#appendix-g--microcopy-inventory), [layout/responsive](#appendix-h--layout-responsive--density-spec), [print/export](#appendix-i--document-body-print--export-fidelity), [per-workstream walkthrough](#appendix-j--per-workstream-ux-walkthrough), [design-QA checklist](#appendix-k--per-component-design-qa-checklist), [expanded recommendations](#appendix-l--expanded-recommendations)

---

## 1. What this is and why it exists

**AnA** is Concept2Cure's chat-first regulatory-intelligence assistant. Its users are regulatory affairs professionals, medical writers, and submission leads preparing filings to the FDA, EMA, PMDA, Health Canada, and notified bodies (NDA/BLA/IND, 510(k), CER, IVDR PER, CSR, eCTD modules, etc.).

The **Document Studio** is AnA's differentiating surface. The origin: a screenshot of a Claude Opus "document-surgery" session that showed an assistant inspecting a file's encoding/structure, rebuilding a `.docx` in a target jurisdiction format by cloning a validated base, applying corrections, appending paragraphs, and — critically — **verifying the result against the source text**. The mandate was: *AnA must be able to do every one of those moves, and the UI must make the verification trustworthy enough for a regulated submission.*

That produced a chat-first **split-pane authoring surface**: conversation on the left, a live document preview + a stack of "trust panels" on the right. On top of that base we built **17 workstreams** (segment-specific authoring + verification flows). They are all complete and behind flags.

### The 17 workstreams (what a user can do)

| Group | Workstreams |
|---|---|
| **Foundations** | **Build 1** durable version history · **Build 2** model/effort picker · **Build 3** per-org enablement |
| **Governance (the P0)** | **E1** Part 11 verified-and-sealed export · **E11** verified IND module authoring + e-sign on the persisted version |
| **Authoring + verification templates** | **E2** dossier consistency sweep · **E3** IVDR Annex XIII PER · **E4** Orphan Drug Designation (21 CFR 316) · **E5** ICH E3 §16 safety-narrative batch · **E6** 510(k) Substantial Equivalence narrative + table · **E7** GSPR (Annex I) conformity matrix · **E8** Pre-IND/EOP2 briefing book + reviewer-challenge pre-mortem · **E9** USPI/SmPC labeling guard + currency check · **E10** eCTD Module 2/5 assembly + readiness gate · **E12** CDx cross-dossier claim concordance · **E13** natural-history / external-control evidence dossier · **E14** CRL/RTF pre-mortem decision artifact |

Every one of these ends in the same place: a generated draft in the right pane, with one or more **trust panels** asserting the draft's fidelity, and (when clean and non-sample) an option to **sign and seal** it as audit-grade evidence.

---

## 2. The product thesis

The entire UX is one loop. Designing the loop well is the whole job:

```
        ┌─────────────────────────────────────────────────────────────┐
        │                                                             │
   AUTHOR ──▶ VALIDATE ──▶ VERIFY ──▶ [clean?] ──no──▶ RESOLVE ───────┘
   (chat)     (structure)  (vs source)   │ yes          (ask AnA to fix,
                                          ▼               re-runs the loop)
                                        SEAL  (Part 11 e-signature)
                                          │
                                          ▼
                                     IMMUTABLE VERSION + PROVENANCE
```

- **Author** — the user asks AnA in chat to draft/transcribe/assemble a document. AnA streams a draft into the right pane.
- **Validate** — structural checks (is this a well-formed Module 2.5? does it have the required sections?).
- **Verify** — the signature move: *does the prose actually reproduce the source data?* AnA runs `verify_docx_against_source` with the exact figures/strings that must appear, and the **VerificationPanel** reports pass/fail per required string.
- **Resolve** — if verification fails, one click ("Ask AnA to resolve") composes a targeted fix request back into chat, which re-runs the loop. This is the trust-recovery path.
- **Seal** — when a version verifies clean (and is not sample data), the user can apply a 21 CFR Part 11 electronic signature. That persists an immutable version row + a sealed record + an audit-trail entry, and stamps a **SealBadge** + **ProvenanceTrail**.

**Design implication:** the emotional arc is *skepticism → evidence → trust → commitment*. The right pane must always answer "can I trust this enough to put my name on it?" The trust panels are not decoration; they are the product.

---

## 3. Design authority and the token system

### 3.1 The bundle is the source of truth
The implementation explicitly mirrors a design bundle and treats it as authority. From the header of `Ana.tsx`:

> *"Mirror of `docs/design/concept2cure-design-system/project/ui_kits/ana_ri/App.jsx`. The bundle is the design authority; Claude Code is the implementer. … No new design tokens or selectors — every style used exists in the bundle."*

**This is the most important constraint for you.** Engineering deliberately introduced **no new tokens or selectors** — every new surface was composed from the existing bundle vocabulary. If you extend the visual language (new states, new panel types), the clean path is: **define it in the bundle/token layer first**, then engineering consumes it. Please don't let net-new hard-coded values creep in.

### 3.2 The token vocabulary currently in use
All styling routes through CSS custom properties (no raw hex in components beyond fallbacks). The tokens the Studio consumes today:

- **Surfaces:** `--bg-000`, `--bg-100`, `--bg-200`, `--bg-300`, `--canvas-elevated`, `--sidebar`, `--background`
- **Ink / text:** `--ink`, `--ink-body`, `--ink-muted`, `--ink-subtle`, `--text-100`…`--text-400`
- **Borders:** `--border`, `--border-light`, `--border-subtle`, `--border-strong`
- **Accent:** `--accent-100`, `--accent-main-100`, `--accent-main-200`, `--accent-subtle`, `--ai`
- **Semantic status:** `--success`, `--success-strong`, `--success-subtle`, `--warning`, `--danger`, `--danger-subtle`
- **Type families:** `--font-display`, `--font-sans`, `--font-serif`, `--font-mono` (note: the document reading surface uses `--font-serif` deliberately — it reads like a document, not an app)
- **Elevation / motion:** `--shadow-xs`, `--shadow-sm`, `--ease`
- **Layout:** `--sidebar-expanded`, `--sidebar-collapsed`

**The semantic-status quartet (`success` / `warning` / `danger` + neutral) is doing a LOT of work** across every verdict tier (verification ok/fail, consistency clean→blocker, concordance concordant/discordant, currency current/stale, readiness green/blocked, premortem risk levels). See §7 and §12 — this is the area most worth your attention, because four colors are currently expressing ~six different verdict scales.

### 3.3 Focus-ring + motion tokens already standardized
During the release-hardening pass we standardized:
- **Focus rings:** every interactive control uses `:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--accent-subtle …) }` (and a 4px high-emphasis variant `0 0 0 2px var(--bg-000), 0 0 0 4px var(--accent-main-100)` for primary actions). **Never bare `outline: none`.**
- **Reduced motion:** transitions are wrapped in `@media (prefers-reduced-motion: reduce) { … transition: none }`.

---

## 4. The core interaction model

### 4.1 Layout
- **Shell:** `Ana.tsx` is the chat shell — `Sidebar` (recents/projects/account) + `TopBar` + a main view that is one of: EmptyState (home), ChatView (conversation), ProjectsView.
- **Studio open:** when a generated draft exists and the flag is on, the main view becomes a **resizable horizontal split** (`react-resizable-panels`): **chat on the left Panel, the document Studio on the right Panel**, with a drag handle between them. The chat layout is identical whether or not the Studio is open — the Studio is additive, never a mode-switch that disrupts the conversation.
- **The right pane** is `DocumentStudioPane` (or, for labeling drafts, `LabelingAuthoringPane`). It renders: a header (title · format · Download-DOCX · close), an optional sub-bar (version picker + page pagination), then a **vertical stack of trust panels**, then the **rendered document body** (serif reading surface, paginated).

### 4.2 The right-pane stack order (top → bottom)
This order matters — it's the trust hierarchy:
1. **VerificationPanel** — "verified against your source" (the primary trust signal)
2. **ConsistencyPanel** (E2) — cross-document dossier consistency, when run
3. **ConcordancePanel** (E12) — cross-dossier CDx claim concordance, when applicable
4. **BriefingBookPanel** (E8) — "anticipated FDA pushback", for briefing books
5. **ReadinessGatePanel** (E10) — eCTD assembly readiness gate, when in eCTD mode
6. **SealBadge / ProvenanceTrail** (E1) — once sealed
7. **The document body** — the actual rendered draft, paginated

Plus **affordances** that live in the Composer/Studio for triggering a specific authoring flow (SafetyNarrative, NatHistory, IndModule, GSPR, PER, etc.).

**Design question for you:** a draft can legitimately show 2–3 stacked trust panels at once (e.g., a Module 2.5 with verification + consistency + readiness). Today they stack vertically and push the document down. That's the single biggest unsolved visual problem — see §12.1.

---

## 5. State model: the SSE event stream

The right pane is a pure view over a streaming event log. The UI consumes these Server-Sent-Event types (from `useAnaChat.ts`). **Every one of these is a visual state you may need to design for:**

| SSE event | UI meaning | Current treatment |
|---|---|---|
| `status` | phase chip: "Planning response…", "Loading project memory…", "Generating response…" | small status line / latency chip |
| `thinking` | extended-thinking indicator (only on Thorough effort / high-risk) | subtle indicator |
| `text` | streaming assistant tokens | live-typed message |
| `tool_use` | AnA invoked a tool (e.g. `author_docx_native`, `verify_docx_against_source`) | tool chip with label |
| `tool_result` | a tool returned → may produce a verdict panel | maps to trust panel |
| `artifact_draft` | a document draft is ready → opens/updates the Studio | renders in right pane |
| `artifact_version_saved` | the draft was persisted as an immutable version (Build 1) | reconciles version number |
| `grounding_strip` | provenance/source grounding for the answer | grounding strip |
| `orchestration` | detected intent / workstream / suggested next actions | suggestion chips |
| `done` / `post_done` | turn complete (carries `effortUsed`, final model) | finalize message |
| `warning` | non-fatal (e.g. an unentitled model override was dropped) | inline warning |
| `error` | generation failed | error state |

**Loading, streaming, empty, partial, error, and "tool running" are all real states** that need designed treatments — not just the happy path. The verification/consistency panels in particular have a meaningful "running…" state (the tool is executing) that should read as *work in progress*, not *failure*.

---

## 6. Complete surface inventory

29 components in `client/src/concept2cure/components/ana/`. Grouped by role. For each: what it is, the states it must express, and the design notes that matter.

### 6.1 Shell & chat (pre-existing, mostly stable)
| Component | Role | Design notes |
|---|---|---|
| `Ana.tsx` | The shell + split-pane orchestration | Owns studio open/closed, version index, all handlers. Not a visual surface itself. |
| `Sidebar` | Recents / projects / account | Collapsible (`--sidebar-expanded`/`--sidebar-collapsed`). |
| `TopBar` | Top chrome | |
| `EmptyState` | Home / first-run | Greeting + suggestion pills. First impression. |
| `ChatView` | The conversation | Hosts Message list + Composer. |
| `Message` | One chat turn | Renders streamed text, tool chips, executed-action chips, latency/degraded/stopped badges, inline edit-and-regenerate. |
| `Composer` | The input | Hosts ModelEffortPicker + the per-workstream affordance triggers. The launch point for most flows. |
| `ProjectsView` | Project cards | |
| `ToolPicker` | Tool selection | |
| `icons` | Icon set (`I.*`) | Decorative icons must be `aria-hidden`; meaningful ones need names. |

### 6.2 The document Studio core
| Component | Role | States to design |
|---|---|---|
| `DocumentStudioPane` | The right pane: header, version sub-bar, page pagination, trust-panel stack, serif document body | open/closed; 1 vs N versions; single vs multi-page; downloading; with/without each trust panel; sealed vs unsealed |
| `LabelingAuthoringPane` | Specialized right pane for USPI/SmPC labeling drafts (replaces DocumentStudioPane for label docs) | US (USPI/PLR) ↔ EU (SmPC/QRD) mode toggle; currency gate; section guard |

### 6.3 Trust panels (the heart — see §7)
| Component | Workstream | Verdict vocabulary |
|---|---|---|
| `VerificationPanel` | base | `ok: true/false` + per-required-string pass/fail + message; "Ask AnA to resolve"; **"Sign and seal verified version"** entry point |
| `ConsistencyPanel` | E2 | `clean` / `minor_issues` / `needs_review` / `blocker`; per-divergence: two conflicting values + source pointers; "Ask AnA to resolve" |
| `ConcordancePanel` | E12 | `concordant` / `discordant` per CDx claim across paired drug+device dossiers; verbatim string match |
| `BriefingBookPanel` | E8 | "anticipated FDA pushback" per sponsor question; severity/lens; framed as **anticipated**, not actual |
| `CrlPremortemPanel` | E14 | approval-probability **estimate** + ranked risks + prioritized fix-list, each citing precedent |
| `ReadinessGatePanel` | E10 | `clean` vs `blocked` gate; blocking items with deep links; seal/submit disabled until green |
| `LabelCurrencyPanel` | E9 | `current` vs `stale` — **deterministic** verdict, never an AI guess; cited basis |
| `SafetyNarrativeQcPanel` | E5 | missing-required-fields QC checklist (clears before sign-off) |
| `SEComparisonTable` | E6 | side-by-side predicate-vs-subject comparison table (real `<table>` semantics) |

### 6.4 Authoring affordances (trigger a flow)
| Component | Workstream | Notes |
|---|---|---|
| `SafetyNarrativeAffordance` | E5 | Supply case facts → narrative; optional batch over a line listing |
| `NatHistoryDossierAffordance` | E13 | Assemble NH/external-control evidence dossier |
| `IndModuleAffordance` | E11 | Author CTD Module 2.5/2.7 from structured source |
| `GsprConformityAffordance` | E7 | Generate the GSPR Annex I conformity matrix |
| `PerAuthoringPanel` | E3 | IVDR PER authoring from recorded study numbers |

### 6.5 Governance & control (Part 11 — see §8)
| Component | Role | States |
|---|---|---|
| `GovernedActionSignoff` | The e-signature modal: identity + meaning (AUTHOR/REVIEWER/APPROVER radiogroup) + reason-for-change + password re-auth (+ MFA) | empty/valid/invalid; submitting; error live region; focus-trapped; Escape cancels |
| `SealBadge` | The "signed by … on … UTC for …" provenance stamp on a sealed version | sealed / not-sealed; per-version (stays put when switching versions) |
| `ModelEffortPicker` | Composer control: Fast / Balanced / Thorough effort radiogroup + advanced model dropdown | flag-gated; deterministic-mode read-only; `effortUsed` echo |

---

## 7. The Trust-Panel pattern family

This is the most important pattern in the product and the area with the most design leverage. All trust panels are modeled on `VerificationPanel` and share a structure:

```
┌ [verdict icon+label]  Title ──────────────────────────── [action] ┐
│ A one-line plain-language verdict statement.                      │
│                                                                   │
│ • [status] Required item / divergence / claim …                  │
│   value A ⟷ value B   · source pointer · deep link               │
│ • [status] …                                                      │
│                                                                   │
│ [Ask AnA to resolve]   (only when not clean and not sample)       │
└───────────────────────────────────────────────────────────────────┘
```

### 7.1 Verdict scales currently in play (and they all map onto ~4 colors)
| Panel | Scale |
|---|---|
| Verification | pass / fail (binary) |
| Consistency | clean · minor_issues · needs_review · blocker (4-tier) |
| Concordance | concordant · discordant (binary) |
| Readiness gate | clean · blocked (binary, gating) |
| Label currency | current · stale (binary, deterministic) |
| Premortem | low/med/high risk + probability estimate |
| Briefing pushback | severity tiers |

**This is the #1 design problem (see §12.1):** six different verdict scales rendering through `--success`/`--warning`/`--danger`. A user looking at a green check has to know *which* kind of "good" it is. They are also stacked in the same column.

### 7.2 Non-negotiable rules baked into these panels (do not regress)
1. **Color is never the only signal.** Every verdict tier carries an icon/shape + a text label, not just color. (WCAG 1.4.1; also just correct for a regulated audience that prints to grayscale.)
2. **Verdicts announce.** When a verdict appears (the tool finishes), it's inside a `role="status"` live region so screen readers hear it. The "running…" → "verdict" transition is an announced state change.
3. **"Matches" are verbatim.** Verification/concordance "match" = exact string comparison, never a model judgment. The copy must not imply AI opinion ("looks consistent") — it states fact ("'12.4%' appears in the document").
4. **Estimates are labeled estimates.** Premortem probabilities and anticipated-pushback items are explicitly framed as estimates/anticipated, never as fact or an actual FDA position.
5. **Resolve loop is suppressed for clean and for sample content.** "Ask AnA to resolve" only appears when there's something to fix and the content is real.

---

## 8. The 21 CFR Part 11 governance layer

This product sits on a regulated path. The compliance UX is a **feature**, not chrome, and several rules are legally load-bearing. The implementation already follows them; your job is to make them feel trustworthy without making them feel bureaucratic.

### 8.1 The e-signature flow (`GovernedActionSignoff`)
A governed seal opens a modal that captures, per 21 CFR 11.50 / 11.100 / 11.200:
- **Signer identity** (shown explicitly)
- **Meaning** — a radiogroup: **AUTHOR / REVIEWER / APPROVER** (the §11.50 signature meaning, travels into the audit trail)
- **Reason for change** — a required textarea (empty/whitespace rejected at the form level)
- **Re-authentication** — password re-entry at signing time (+ MFA when enrolled). **Session auth is deliberately not reused** — this is a legal requirement, not friction we can optimize away.
- The modal states the artifact + version + consequence, is **focus-trapped**, and **Escape cancels**.

**Design notes:** this is the highest-stakes modal in the app. It should feel deliberate and calm — a moment of commitment, not a dialog to dismiss. Reviewer-grade copy: *"By signing, you confirm 21 CFR 11.100(b) intent."* No emoji, no celebration.

### 8.2 Provenance (`SealBadge` + ProvenanceTrail)
Once sealed, the version shows a factual stamp: *"Signed by Jane Smith on 2026-04-17 at 14:32 UTC for approval."* It is **per-version** — switching versions shows that version's seal state, never a stale badge. The full provenance trail is reachable in-context.

### 8.3 Disabled-with-reason (used everywhere)
A governed control the user cannot use **right now** is disabled **and states why in text** — never clickable-then-403, never silently greyed. Examples already implemented:
- Seal disabled because the version isn't verified clean → "Verify against source before sealing."
- Seal/export disabled because the content is sample/`not_assessed` → "Sample content cannot be sealed or exported."
- eCTD submit disabled because the readiness gate is blocked → lists the blocking items.

**Design note:** the *reason* is as important as the disabled state. Tooltip + inline text both. This is where a lot of regulated-product trust is won or lost.

---

## 9. The honesty contract → UI implications

A single principle drives a family of UI states. **The product must never let demo/sample/unassessed data masquerade as real regulated evidence.** Concretely:

- Content flagged `isSample` / provenance `sample` / `not_assessed` is **never sealable and never exportable**. The seal/download affordances are disabled-with-reason.
- AI-assisted paragraphs carry a **determinism pedigree** (whether the content came from a deterministic substrate or a generative model). The verification `required_strings` mechanism is what lets a generative draft still be *proven* against source data.
- Probabilities/anticipated items are framed as estimates.

**Design ask:** sample content needs an unmistakable but non-alarming visual treatment — a **watermark / "Sample data" chip** on the document body and on every trust panel derived from it, so a user is never one screenshot away from mistaking a demo for a filing. Today this is expressed in copy + disabled states; it deserves a deliberate visual system. This is **§12.2**, high priority.

---

## 10. Accessibility: WCAG 2.2 AA

Our regulated customers (FDA/EMA/PMDA, enterprise pharma) frequently require WCAG 2.2 AA in procurement. We ran a full hardening pass; **these are already met and must be preserved in any redesign:**

- **Keyboard-first:** every control reachable + operable by keyboard; no `<div onClick>` buttons.
- **Focus visible:** `:focus-visible` ring on every interactive element (token'd; never bare `outline:none`).
- **Focus order = visual order;** no `tabIndex > 0`.
- **No keyboard traps;** modals/expandable panels dismiss with `Escape`; the e-sign modal is focus-trapped correctly.
- **Contrast:** normal text ≥ 4.5:1, large ≥ 3:1, UI/borders ≥ 3:1. (Watch `--ink-subtle`/`--text-400` on light surfaces for body text — escalate to a darker ink token if you reach for them for anything readable.)
- **Color never alone:** verdicts/severity/required-field/error all carry text + icon/shape.
- **Semantic HTML first:** real `<button>`, real `<table>` with `<th scope>` (the SE comparison table), `<dialog>`-style modal.
- **Accessible names:** every icon-only control + input is named; decorative icons `aria-hidden`.
- **Live regions:** verdicts, QC results, seal-applied, toasts announce via `role="status"`/`role="alert"`/`aria-live`.
- **Reduced motion:** all transitions respect `prefers-reduced-motion`.
- **Form errors associated:** `aria-invalid` + `aria-describedby` on the e-sign fields.

**If you introduce new states/components, please hold this bar.** It's the procurement gate.

---

## 11. Motion & microcopy discipline

- **Motion:** calm. ≤ 200ms ease-out default. No spring, no bounce, no overshoot. Respect `prefers-reduced-motion` (static fallback). The token is `--ease`. The verdict-appears transition should feel like *settling into place*, not popping.
- **Microcopy:** reviewer-grade. Calm, factual, restrained. No exclamations, no cheerleading ("Nice work!"), no hedging ("looks like maybe"), **no emoji** anywhere on the governed path. Buttons are verbs: "Sign and seal", "Assemble module", "Download DOCX", "Ask AnA to resolve". Errors state the fact + the next step. Status copy is defensible: "Verified against your source", "Superseded by v3.2", "Sample content cannot be sealed."

This tone is part of the product's credibility with regulators. Please keep any new strings in this register.

---

## 12. My recommendations

These are the design problems I think are worth your attention, roughly in priority order. Engineering has built correct, accessible, compliant surfaces — but several of these are genuine *design* decisions I deliberately did not make unilaterally.

### 12.1 — [HIGH] Solve the stacked-trust-panel problem
**Problem:** a single draft can legitimately surface 2–3 trust panels (verification + consistency + readiness, say). Today they stack vertically and push the document body down, and they all speak through the same 4-color semantic palette. A Module 2.5 in eCTD mode is the worst case.
**Why it matters:** the trust panels are the product. If they become a wall of green/amber/red cards, the user can't triage at a glance — which is the entire value proposition.
**Directions to explore:**
- A unified **"Trust summary" header** — one row of compact verdict pills (Verify ✓ · Consistency ▲ · Readiness ●) that expand on demand, instead of N full-height cards always open.
- A consistent **verdict-tier visual system** decoupled from raw `success/warning/danger` — e.g. a shared 4-step severity ramp (clean / advisory / review / blocking) with distinct iconography per *kind* of check, so "verification pass" and "consistency clean" are visibly different kinds of good.
- A **tabbed or accordion** right-rail so the document stays visible while the user drills into one verdict.

### 12.2 — [HIGH] Design the "sample / not-sealable" visual system
**Problem:** the honesty contract is currently enforced via copy + disabled states. There's no strong, consistent *visual* marker that a draft is demo/sample data.
**Recommendation:** a deliberate watermark + chip system (document body watermark, a "Sample data — not sealable" chip echoed on every derived trust panel, and a distinct treatment for the disabled seal/export buttons). It must be unmistakable but **not alarming** (this is an expected state in demos/onboarding, not an error). This is a regulated-trust safeguard — a designer should own how it looks.

### 12.3 — [HIGH] The e-signature modal deserves bespoke design
`GovernedActionSignoff` is the highest-commitment moment in the app. Right now it's correct and accessible but visually utilitarian. It should feel like signing a regulated document: deliberate pacing, clear statement of *what* is being attested and *with what meaning*, the artifact+version shown prominently, the reason field unmissable. Consider a two-step affirm (review what you're signing → sign) without adding friction that feels like a dark pattern. Reference pattern is in §8.1 of the `regulatory-compliance-ux` standard.

### 12.4 — [MEDIUM] A "verification provenance" micro-visualization
The verification panel proves the draft contains every required figure/string. There's an opportunity to make this *visceral*: when a user hovers a verified figure in the trust panel, highlight where it appears in the document body (and vice versa). That turns "trust me, it matches" into "here, see it match." High trust payoff, moderate effort.

### 12.5 — [MEDIUM] Effort picker: make Fast/Balanced/Thorough legible
`ModelEffortPicker` is a radiogroup with an advanced model dropdown. The concept ("how much rigor do you want?") is good but abstract. Consider communicating the *trade-off* inline (speed vs depth, and that Thorough may enable extended thinking) without exposing model internals. Also: it must visibly become read-only in deterministic mode and reflect `effortUsed` (what the server actually ran, which can differ from the request when governance pins a strategy).

### 12.6 — [MEDIUM] Multi-version document UX
Build 1 gives durable v1…vN version history with change descriptions. The current version picker is a dropdown in the sub-bar. For a regulated user, version history is a first-class artifact (what changed, when, who, and the verdict at each version). Consider a proper version timeline/rail with per-version verdict + seal state, and a diff affordance between versions. The seal badge is already per-version; lean into that.

### 12.7 — [MEDIUM] Empty / loading / running states for trust panels
The "tool is running" state (verification in progress, consistency sweep running) is a real state that needs to read as *work happening*, not absence or failure. Skeletons/indeterminate states that match the calm-motion rule. Same for the first-run EmptyState — it's the user's first impression of a regulated authoring tool and should communicate competence + safety.

### 12.8 — [LOW] The SE comparison table and other data tables
`SEComparisonTable` is a real `<table>` (good). Data-dense regulated tables (predicate comparisons, GSPR matrices, conformity tables) are a recurring shape across E6/E7/E10. A shared, accessible, printable **regulated-table** component (sticky headers, scope'd headers, verdict cells, print/PDF fidelity) would pay off across several workstreams. Worth a small design system investment.

### 12.9 — [LOW] Iconography for the verdict/kind matrix
We need icons that distinguish *kind of check* (verification vs consistency vs concordance vs readiness vs currency) from *verdict* (pass/advisory/review/block). That's a 2-dimensional system. A small dedicated icon set would remove a lot of ambiguity (ties into §12.1).

### 12.10 — [LOW] Onboarding the loop
The author→verify→resolve→seal loop is novel. A light, dismissible first-run coachmark sequence (matching the calm aesthetic) would help users discover that verification + sealing exist. Gate it; never block the expert.

---

## 13. Handoff

### 13.1 Where everything lives
- **Components:** `client/src/concept2cure/components/ana/*.tsx` (29 files; inventory in §6)
- **Styles:** `client/src/concept2cure/components/ana/styles.module.css` (token-driven; the focus-ring + reduced-motion conventions are here)
- **Chat/stream hook + state model:** `client/src/concept2cure/components/ana/useAnaChat.ts`
- **Design authority (the bundle):** `docs/design/concept2cure-design-system/project/ui_kits/ana_ri/App.jsx` — *this is yours to evolve.* Engineering mirrors it.
- **Feature flags:** `client/src/flags/featureFlags.ts`

### 13.2 Feature flags (what's gated)
- **`ENABLE_ANA_DOCUMENT_STUDIO`** — default **false**. Gates the entire Studio (right pane + all trust panels + seal). Enabled **per-org** via `organizations.settings.features` (Build 3), so pilot orgs can be turned on without a global change.
- **`ENABLE_MODEL_EFFORT_PICKER`** — default **false**. Gates the Composer effort/model control.
- Both fail-closed. Nothing is visible to users until a flag is set.

### 13.3 How to see it
The Studio renders when (a) the flag is on and (b) a generated draft exists in the conversation. The fastest path for design review is to enable the flags in a dev build and drive a workstream (e.g., ask AnA to draft an Orphan Drug Designation, or a safety narrative) to produce a draft + verification panel. Fixture/sample data drives the demo path (and correctly shows the "sample → not sealable" states), so you can exercise every panel without live backend data.

### 13.4 Branch / status
- The full stack lives on integration branch `claude/ana-integration-h525wy` (draft PR #965), rebased onto current trunk, CI-verified for everything in our ownership.
- It is **held** (not merged) pending product-trunk stabilization. The visual/UX layer can be designed against it now in parallel.

### 13.5 What's intentionally stubbed (so you don't design around the wrong thing)
Several flows run on fixture data with clearly-marked integration seams (live-data joins land at integration time). The **UI states are all real and complete** — only the data source is stubbed. So design against the states as built; the fixtures are representative.

---

## 14. Open design questions

These need a product/design decision; engineering implemented sensible defaults but they're yours to set:

1. **Trust-panel density** (§12.1) — summary-header vs stacked-cards vs tabs. The single biggest open question.
2. **Sample-data visual system** (§12.2) — how loud should the "not real" marker be?
3. **E-sign modal** (§12.3) — one-step vs review-then-sign; how much ceremony is right?
4. **Version history surface** (§12.6) — dropdown vs timeline rail; expose diff?
5. **Verdict iconography** (§12.9) — do we invest in a kind×verdict icon matrix?
6. **Effort picker framing** (§12.5) — how to express the rigor/speed trade-off without leaking model internals?
7. **Where does sealing live** — inline in the verification panel (current) vs a dedicated "finalize" step in the document header? As more workstreams add sealable outputs, a consistent home matters.

---

## 15. Glossary

- **Trust panel** — a right-pane card asserting a fidelity verdict (verification, consistency, concordance, readiness, currency, premortem).
- **Verify against source** — exact-string check that the generated prose reproduces the required figures/strings from the source data. The product's signature move.
- **Seal** — apply a 21 CFR Part 11 electronic signature; produces an immutable version + sealed record + audit entry + provenance stamp.
- **Honesty contract** — sample/`not_assessed` content is never sealable/exportable; AI content carries its determinism pedigree; matches are verbatim; probabilities are estimates.
- **Disabled-with-reason** — a governed control the user can't use now is disabled *and* states why in text.
- **Determinism pedigree** — whether content came from a deterministic substrate or a generative model.
- **eCTD / CTD modules** — the FDA/ICH electronic submission structure (e.g. Module 2.5 Clinical Overview, 2.7 Summary, 5.3.5 Study Reports).
- **PER / GSPR / SE / ODD / CRL** — IVDR Performance Evaluation Report / EU MDR General Safety & Performance Requirements / 510(k) Substantial Equivalence / Orphan Drug Designation / Complete Response Letter.

---

# Appendices (detailed reference)

> The sections above are the narrative. The appendices below are the precise, grounded reference: exact strings, prop contracts, data shapes, the one styling hook that unifies every verdict state, a per-workstream walkthrough, and a per-component design-QA checklist. All of it is pulled from the actual implementation in `client/src/concept2cure/components/ana/`.

- [Appendix A — The unified `data-status` styling contract](#appendix-a--the-unified-data-status-styling-contract)
- [Appendix B — Verdict vocabulary matrix (exact strings + icons)](#appendix-b--verdict-vocabulary-matrix)
- [Appendix C — Result data shapes the UI binds to](#appendix-c--result-data-shapes-the-ui-binds-to)
- [Appendix D — The e-signature modal, field by field](#appendix-d--the-e-signature-modal-field-by-field)
- [Appendix E — SealBadge & ProvenanceTrail spec](#appendix-e--sealbadge--provenancetrail-spec)
- [Appendix F — Per-component deep specs + CSS class families](#appendix-f--per-component-deep-specs)
- [Appendix G — Microcopy inventory (real strings) + tone do/don't](#appendix-g--microcopy-inventory)
- [Appendix H — Layout, responsive & density spec](#appendix-h--layout-responsive--density-spec)
- [Appendix I — Document body, print & export fidelity](#appendix-i--document-body-print--export-fidelity)
- [Appendix J — Per-workstream UX walkthrough (all 17)](#appendix-j--per-workstream-ux-walkthrough)
- [Appendix K — Per-component design-QA checklist](#appendix-k--per-component-design-qa-checklist)
- [Appendix L — Expanded recommendations (mockup-level)](#appendix-l--expanded-recommendations)

---

## Appendix A — The unified `data-status` styling contract

**This is the single most useful thing in this document for you.** Every trust panel and verdict surface exposes its state through one shared DOM attribute: **`data-status`**. It is the styling hook that lets all verdicts share a coherent visual language while still being distinguishable. The values currently emitted across the surfaces:

| `data-status` value | Meaning | Emitted by |
|---|---|---|
| `verified` | the good/pass state | VerificationPanel (`ok`), LabelCurrency (`current`), Readiness blocks (`exportable`), seal-eligible (`sealable`) |
| `unverified` | the not-yet/fail state | same surfaces, negative case |
| `concordant` / `discordant` | CDx claim match / mismatch | ConcordancePanel |
| `ready` / `blocked` | eCTD readiness gate | ReadinessGatePanel |
| `clean` / `minor_issues` / `needs_review` / `blocker` | consistency tiers (via `verdictStatus(verdict)`) | ConsistencyPanel |
| `missing_counterpart` | a CDx claim has no paired counterpart | ConcordancePanel per-claim |
| `sample` | honesty-contract: demo/illustrative data | sample notes on every derived panel |

**Design implication:** if you design a coherent `data-status` → visual-treatment map (color ramp + icon + label weight), you've simultaneously solved the look of *every* trust panel. This is the cleanest lever you have. Recommend you treat `data-status` as the canonical state enum and design the full set as one system (this is the backbone of recommendation §12.1).

---

## Appendix B — Verdict vocabulary matrix

Exact label strings, icons, and `data-status` per check, as implemented. **Do not paraphrase these in mockups** — they're reviewer-grade and were chosen for defensibility; if you want to change them, flag it (they may have compliance implications).

### Verification (base; `VerificationPanel`)
| State | `data-status` | Headline | Icon | Action shown |
|---|---|---|---|---|
| `ok: true` | `verified` | "Verified against your source" | shield-check | **Sign and seal verified version** |
| `ok: false` | `unverified` | states the missing required strings | alert | **Ask AnA to resolve** |
- Data: `{ ok, missingRequiredStrings[], requiredStringsChecked?, message? }`. When failed, the panel lists each missing required string (the figures/captions that should appear verbatim but don't).

### Consistency sweep (E2; `ConsistencyPanel`) — 4-tier
| `verdict` | `data-status` | Headline | Icon |
|---|---|---|---|
| `clean` | `clean` | "Consistent with your dossier" | shield-check |
| `minor_issues` | `minor_issues` | "Minor inconsistencies" | info |
| `needs_review` | `needs_review` | "Inconsistencies need review" | alert |
| `blocker` | `blocker` | "Blocking inconsistencies" | octagon-alert (`I.blocker`) |
- Each divergence bullet: the labelled quantity + the **two conflicting values** + the source artifact pointer (`in {existingArtifact}, {existingCtdSection}`) + a deep link. Server caps surfaced divergences at 20; `divergenceCount` may exceed the list (design a "+N more" affordance).

### CDx concordance (E12; `ConcordancePanel`) — binary + missing
| `verdict` | `data-status` | Headline |
|---|---|---|
| `concordant` | `concordant` | "CDx claims concordant across the paired dossiers" |
| `discordant` | `discordant` | "CDx claims not concordant across the paired dossiers" |
- Sub-headline: "{concordantCount} of {total} CDx claims match verbatim across the drug and device dossiers." Per-claim status chip: `Concordant` / `Discordant` / `Missing counterpart`. Each discordant claim shows both sides (drug vs device) with source pointers.

### eCTD readiness gate (E10; `ReadinessGatePanel`)
| `gate` | `data-status` | Headline |
|---|---|---|
| `ready` | `ready` | "Ready for submission" |
| `blocked` | `blocked` | "Blocked — resolve before submission" |
- Shows a **checks** list (passed) and a **blockers** list (each with `label` + deep link). The **seal/submit button is disabled** until `ready` (and disabled-with-reason for sample content).

### Label currency (E9; `LabelCurrencyPanel`) — deterministic
| State | `data-status` | Headline | Icon |
|---|---|---|---|
| current | `verified` | "Label currency: current" | shield-check |
| stale | `unverified` | "Label currency: stale" | alert |
- This verdict is **deterministic** (from `review_label_currency`), never an AI judgment. Copy and treatment should feel like a fact, not an assessment.

### Briefing-book pre-mortem (E8; `BriefingBookPanel`)
- "Anticipated FDA pushback" grouped per sponsor question; each item has a severity + lens. Framed explicitly as **anticipated**, never an actual agency position. Sample note when fixture-sourced.

### CRL/RTF pre-mortem (E14; `CrlPremortemPanel`)
- Sections: **Approval-probability estimate** (framed as an estimate), **Top risks** (ranked, each citing precedent), **Prioritized fix-list**. Honesty: sample/insufficient-data → non-exportable with reason.

---

## Appendix C — Result data shapes the UI binds to

So you know the real data dimensions (and the edge cases that need design):

```ts
// Every tool result carries a lifecycle status — design all three:
status: 'running' | 'success' | 'error'
//        ^ the "working" state    ^ verdict ready   ^ tool failed

interface VerificationResult {
  ok: boolean;
  message?: string;
  missingRequiredStrings: string[];   // when !ok, the figures/strings absent from the doc
  requiredStringsChecked?: number;    // "verified N of N required strings"
}

interface ConsistencyResult {
  verdict: 'clean' | 'minor_issues' | 'needs_review' | 'blocker';
  divergenceCount: number;            // may exceed divergences.length (server caps at 20)
  divergences: ConsistencyDivergence[]; // each: labelled quantity, value A, value B, source pointer, deep link
}

// Concordance: { verdict: 'concordant'|'discordant', concordantCount, total, claims[] }
//   claim.status: 'concordant' | 'discordant' | 'missing_counterpart'
// Readiness:    { gate: 'ready'|'blocked', checks[], blockers[]{label, deepLink}, sealable }
// Seal:         { meaning, printedName, sealedRecord{ sealedAt, contentHash, aiDisclosed, atoms } }
```

**Edge cases that need designed states (easy to miss):**
- **`status: 'running'`** — the tool is executing; verdict not yet known. Needs an indeterminate, calm "checking…" treatment, *not* an empty or error look.
- **`status: 'error'`** — the check itself failed (distinct from a "fail" verdict). Different visual + copy ("Verification couldn't run" ≠ "Verification failed").
- **Divergence overflow** — `divergenceCount > divergences.length` → a "showing 20 of N" affordance.
- **`requiredStringsChecked === 0`** — nothing to verify yet.
- **No counterpart** — concordance `missing_counterpart` is a third state, not just pass/fail.

---

## Appendix D — The e-signature modal, field by field

`GovernedActionSignoff` is the legally load-bearing surface. Exact spec as built (so a redesign preserves the contract):

| Field | Type | Rules / ARIA |
|---|---|---|
| **Consequence statement** | static text | States the artifact + version + what sealing does. Referenced by `aria-describedby` on the dialog. |
| **Reason for change** | `<textarea>`, **required** | `aria-required`, `aria-invalid` when empty-after-touch, `aria-describedby` → hint or error element. Whitespace-only is rejected. |
| **Meaning** | radiogroup, **required** | Three options — `AUTHOR` ("Authorship"), `REVIEWER` ("Review"), `APPROVER` ("Approval"). The §11.50 meaning; travels into the audit trail as `signatureMeaning`. |
| **Password** | `<input type=password>`, required when signing | Re-authentication at signing time — **not** session reuse (21 CFR 11.200). |
| **MFA token** | `<input>`, required iff `requireMfa` | TOTP, only when the signer is MFA-enrolled. |
| **Submit** | button | Enabled only when `reasonOk && credsOk && meaningOk && !submitting`. Label: "Sign". |

**Behavior:** `role="dialog"` + `aria-modal`, `aria-labelledby` (title) + `aria-describedby` (consequence). **Focus-trapped** (Tab/Shift+Tab cycle inside); **Escape cancels**; first field autofocused. Errors live in an announced region. Affirmation copy: "By signing, you confirm 21 CFR 11.100(b) intent." Submitting state disables the form and shows progress; failure surfaces inline (the seal returns `null`).

**Design opportunity (§12.3):** this is utilitarian today. It is the one place ceremony is *correct*. Consider showing the document title + version prominently, the meaning as the deliberate choice it is, and a clear "you are attesting X" framing — without adding dismissible friction.

---

## Appendix E — SealBadge & ProvenanceTrail spec

Once sealed, `SealBadge` renders a factual one-liner + an expandable provenance trail (a `<dl>`):

**One-liner:** `"{versionText} — {meaningLabel} by {printedName} on {sealedAt}. AI involvement disclosed."` (meaning labels: `AUTHOR`→Authorship, `REVIEWER`→Review, `APPROVER`→Approval).

**Provenance trail (`<dl>` fields):**
| Term | Value |
|---|---|
| Printed name | the signer's printed name |
| Meaning | Authorship / Review / Approval |
| Reason for change | the captured reason |
| Sealed at | formatted UTC timestamp |
| Content hash | the SHA-256 of the sealed content (mono font) |
| AI disclosure | "AI involvement disclosed" / "No AI involvement" |

**Per-version:** the badge reflects the *selected* version's seal; switching versions never shows a stale badge. Design the collapsed badge (always visible on a sealed version) + the expanded provenance (on demand). The content-hash row is evidence — give it a deliberate, monospace, copyable treatment.

---

## Appendix F — Per-component deep specs

Each trust panel/affordance with its CSS class family (so you can map redlines to selectors) and prop highlights.

### `VerificationPanel` — classes: `studioVerify`, `verifyResolve`
Props: `verification: VerificationResult`, `onResolve?`, `onSeal?`, `signer?{name,email,role}`, `requireMfa?`, `seal?`. Renders the verdict strip (live region), the missing-strings list when failed, the **resolve** action (failed + not sample), and the **seal** entry (verified + sealer present) which opens `GovernedActionSignoff`. When `seal` present, renders `SealBadge`.

### `ConsistencyPanel` — classes: `consistencyPanel/Head/Title/Desc/List/Item/ItemBody/Kind/Values/Val/Source/Scope/Sample/Detail/Resolve`
Props include `consistency: ConsistencyResult`, `onResolve?`, `isSample?`. Each item: a "kind" tag (the labelled quantity type), the two `consistencyVal` values, a `consistencySource` pointer. Resolve suppressed when clean or sample.

### `ConcordancePanel` — classes: `concordPanel/Head/Title/Detail/Claims/Claim/ClaimHead/ClaimLabel/ClaimStatus/Pair/Side/SideLabel/Source/Sources/Single/Absent/Method/Text/SampleNote/Resolve`
Per-claim two-column "Pair" (drug side vs device side) with `concordSideLabel`s; `concordClaimStatus` chip; `concordSampleNote` for fixtures.

### `ReadinessGatePanel` — classes: `gate*` family incl. `gateChecks`, `gateBlockers`, `gateBlockerText`, `gateSeal`, `gateSealHint`
`STATUS_LABEL` maps `ready`/`blocked`. Two `<ul>`s (`aria-label`ed "Readiness checks" / "Blocking items"). Seal button (`gateSeal`) + hint (`gateSealHint`) disabled-with-reason until ready.

### `BriefingBookPanel` — classes: `brief*` family (`briefPanel/Head/Title/Question/QuestionTitle/Challenge/ChallengeHead/ChallengeQ/ChallengeList/ChallengeMeta/Severity/Lens/AnticipatedNote/SampleNote/Detail`)
Per sponsor question → grouped anticipated challenges with severity + lens; `briefAnticipatedNote` carries the "anticipated, not actual" framing.

### `LabelCurrencyPanel` — `data-status` verified/unverified; deterministic verdict; `labelingBasis` shows the cited basis.

### `CrlPremortemPanel` — sections for probability estimate / top risks / fix-list; each risk cites precedent; sample → non-exportable.

### `SEComparisonTable` (E6) — a real `<table>` with `<th scope>`; predicate vs subject rows; verdict cells carry `data-status`.

### Affordances — `SafetyNarrativeAffordance` (+ `SafetyNarrativeQcPanel` missing-fields checklist), `NatHistoryDossierAffordance` (`dossier*` classes), `IndModuleAffordance`, `GsprConformityAffordance`, `PerAuthoringPanel`. Each: a labelled form (associated labels + `aria-invalid`/`aria-describedby`), a verb-labelled submit `<button>`, and honesty-gated output.

### `ModelEffortPicker` — classes: `effortControl`, `effortOption`. `role="radiogroup"`; Fast/Balanced/Thorough; advanced model `<select>`; read-only in deterministic mode; reflects `effortUsed`.

---

## Appendix G — Microcopy inventory

Actual strings in the product (reviewer-grade register). Use these verbatim as the tone reference.

**Buttons / actions:** "Sign and seal verified version" · "Ask AnA to resolve" · "Assemble module and check readiness" · "Download DOCX" · "Sign" · "Cancel".
**Verdict headlines:** "Verified against your source" · "Consistent with your dossier" · "Minor inconsistencies" · "Inconsistencies need review" · "Blocking inconsistencies" · "CDx claims concordant across the paired dossiers" · "Ready for submission" · "Blocked — resolve before submission" · "Label currency: current" · "Label currency: stale".
**Provenance:** "{Meaning} by {Name} on {UTC}." · "AI involvement disclosed" · "No AI involvement" · "Printed name" · "Reason for change" · "Sealed at" · "Content hash".
**Honesty notes:** "Sample data — illustrative only. This result is not sealable or exportable." · "Not assessed."
**Affirmation:** "By signing, you confirm 21 CFR 11.100(b) intent."

**Tone rules (do / don't):**
| Do | Don't |
|---|---|
| "Verified against your source" | "Looks good! ✅" |
| "Blocking inconsistencies" | "Uh oh, problems found" |
| "Sample content cannot be sealed or exported." | "You can't do that" |
| "Superseded by v3.2" | "Old version" |
| "Approval-probability estimate" | "Approval chance" (implies certainty) |
| factual, present tense, names the artifact + version | exclamations, emoji, hedging, cheerleading |

---

## Appendix H — Layout, responsive & density spec

- **Split-pane:** `react-resizable-panels` horizontal group; chat (left) + Studio (right) with a draggable `PanelResizeHandle`. The split appears only when a draft exists and the flag is on; otherwise the chat is full-width. Persist the user's drag ratio.
- **Sidebar:** collapsible via `--sidebar-expanded` / `--sidebar-collapsed`.
- **Document body:** serif reading surface (`--font-serif`), paginated (default ~2200 chars/page; the picker appears only when >1 page). A version sub-bar appears only when >1 version.
- **Trust-panel stack:** vertical, above the document body, in the order in §4.2. **This is where density breaks down at 3+ panels** (see §12.1) — the biggest responsive/density problem.
- **Breakpoints to consider (currently desktop-first):** the split-pane assumes generous width. Tablet/narrow behavior (does the Studio become a tab? a drawer?) is undesigned. Desktop chat/editor are exempt from the 44×44px touch-target rule; any mobile/tablet treatment is **not** exempt.

---

## Appendix I — Document body, print & export fidelity

- The right-pane document is a **real document preview**, not an app card — serif type, page pagination, the look a regulatory writer expects in Word.
- **Download-as-DOCX** produces an actual Word file (the tool emits PK-zip DOCX bytes). The on-screen preview should match the exported document's structure closely enough that "what I verified is what I download" holds — this is a trust requirement, not just polish.
- **Print / grayscale:** because the audience prints and reviews on paper, the color-never-alone rule is doubly important — every verdict must survive a black-and-white print. The sealed provenance (hash, signer, meaning, UTC) should be print-legible.
- **Sample watermark (§12.2)** must appear in both the preview and any export path so a demo can never be mistaken for a filing.

---

## Appendix J — Per-workstream UX walkthrough

For each workstream: the trigger, the surfaces that appear, and the end state. (All flag-gated; all honesty-gated.)

| # | Workstream | Trigger | Surfaces that appear | End state |
|---|---|---|---|---|
| B1 | Version persistence | any draft | version sub-bar + `artifact_version_saved` reconcile | durable v1…vN history |
| B2 | Model/effort picker | Composer | `ModelEffortPicker` (radiogroup + model dropdown) | `effortUsed` echoed on `done` |
| B3 | Per-org enablement | admin sets org flag | the whole Studio appears for that org | pilot exposure |
| E1 | Part 11 seal | verified clean draft | VerificationPanel → `GovernedActionSignoff` → `SealBadge` | immutable sealed version + provenance |
| E2 | Consistency sweep | Module 2/5 draft | `ConsistencyPanel` (4-tier) + resolve loop | verdict per version |
| E3 | IVDR PER | `PerAuthoringPanel` | PER draft + VerificationPanel (figures as required strings) | notified-body-ready PER |
| E4 | Orphan Drug Designation | affordance | ODD draft + VerificationPanel (§316.20/21 headers) | verified ODD request |
| E5 | Safety narratives | `SafetyNarrativeAffordance` | narrative draft + `SafetyNarrativeQcPanel` (missing fields) + VerificationPanel | QC-cleared narrative(s); optional batch |
| E6 | 510(k) SE | affordance | SE narrative + `SEComparisonTable` + VerificationPanel | predicate-faithful SE discussion |
| E7 | GSPR matrix | `GsprConformityAffordance` | conformity matrix + VerificationPanel (required rows) | tech-file-ready matrix |
| E8 | Pre-IND briefing | affordance | briefing book + `BriefingBookPanel` (anticipated pushback) | briefing book + pre-mortem |
| E9 | Labeling guard | `LabelingAuthoringPane` | US↔EU mode toggle + `LabelCurrencyPanel` + section guard | correctly-sectioned, currency-gated label |
| E10 | eCTD assembly | affordance | `ReadinessGatePanel` (gate) blocking seal/submit | green gate before PDUFA step |
| E11 | Verified IND module | `IndModuleAffordance` | IND module draft + VerificationPanel → seal **on the persisted version** | Part 11-sealed IND module |
| E12 | CDx concordance | paired dossiers | `ConcordancePanel` (cross-dossier) | verbatim-match verdict |
| E13 | NH/external-control | `NatHistoryDossierAffordance` | dossier draft + VerificationPanel (citations) | cited evidence dossier |
| E14 | CRL pre-mortem | affordance | `CrlPremortemPanel` (probability + risks + fixes) | board-ready decision artifact |

---

## Appendix K — Per-component design-QA checklist

For each new/redesigned surface, verify (this is the bar engineering held; please hold it too):

- [ ] Every interactive element is keyboard-reachable + operable; tab order = visual order.
- [ ] `:focus-visible` ring on every control (token'd; never bare `outline:none`).
- [ ] Modals/expanders dismiss with `Escape`; e-sign modal is focus-trapped.
- [ ] Every verdict/severity/status carries **text + icon/shape**, not color alone (survives grayscale print).
- [ ] Verdict appearance announces via `role="status"`; errors via `role="alert"`.
- [ ] Icon-only controls have `aria-label`; decorative icons are `aria-hidden`.
- [ ] Contrast: body text ≥ 4.5:1, large ≥ 3:1, UI/borders ≥ 3:1 (watch `--ink-subtle`/`--text-400`).
- [ ] The four lifecycle states are designed: **running**, **success/verdict**, **error**, **empty**.
- [ ] The **sample / not-sealable** state is unmistakable and consistent.
- [ ] Disabled governed controls state **why** (text + tooltip), never silently greyed.
- [ ] Motion ≤ 200ms ease-out, no spring/bounce, `prefers-reduced-motion` honored.
- [ ] Copy is reviewer-grade (no emoji/exclamations/hedging); buttons are verbs.
- [ ] `data-status` is set correctly so the shared verdict styling applies.

---

## Appendix L — Expanded recommendations

Deeper, more concrete versions of §12, with suggested directions.

**L1. The trust-summary header (solves §12.1).** Replace the always-open vertical stack with a compact summary row at the top of the Studio: one pill per active check (`Verify ✓` · `Consistency ▲` · `Readiness ●`), each colored by `data-status`, each expanding its full panel on click/focus. Default: all collapsed except any in a `needs_review`/`blocker`/`unverified`/`blocked` state (problems auto-expand; clean stays quiet). This keeps the document visible, makes triage instant, and scales to N checks. Use `data-status` (Appendix A) as the single source of truth for pill color/icon.

**L2. A two-axis verdict icon system (solves §12.9).** Design icons on two axes: **kind of check** (verification, consistency, concordance, readiness, currency, premortem) × **verdict tier** (clean / advisory / review / blocking). Today four colors carry six scales; a kind-distinct icon + a 4-step severity ramp removes the ambiguity. The implementation already uses `I.shieldCheck` / `I.info` / `I.alert` / `I.blocker` — formalize and extend that set.

**L3. Sample-data system (solves §12.2).** A diagonal "SAMPLE" watermark on the document body (low-contrast, print-visible), a persistent "Sample data — not sealable" chip echoed on each derived panel (reusing the `sample` `data-status`), and a distinct disabled treatment on seal/export with the reason inline. Calm, not alarming — this is an expected onboarding state.

**L4. Inline verification provenance (solves §12.4).** On hover/focus of a required string in VerificationPanel, highlight its occurrence in the document body (and reverse). Turns "trust me" into "see it." Cross-link via the `missingRequiredStrings` / verified-strings sets.

**L5. Version timeline (solves §12.6).** Replace the version dropdown with a compact left-edge timeline of the Studio: v1…vN, each node showing its verdict `data-status` + seal state, with the change description on hover and an optional diff between adjacent versions. The per-version seal badge already exists — surface it on the node.

**L6. The signing ceremony (solves §12.3).** A two-pane e-sign modal: left = "what you're signing" (document title, version, content hash, the verdict being attested); right = the manifestation (meaning radiogroup, reason, re-auth). One screen, no extra clicks, but the left pane makes the attestation legible. Keep the affirmation line.

**L7. Effort picker as a rigor dial (solves §12.5).** Present Fast/Balanced/Thorough as a labeled segmented control with a one-line trade-off caption ("Thorough may take longer and reason more deeply"), the advanced model dropdown tucked behind an "Advanced" disclosure, and a clear read-only/locked treatment in deterministic mode with `effortUsed` shown.

**L8. Running-state system.** A shared calm "checking…" treatment for `status: 'running'` across all trust panels — an indeterminate shimmer that respects reduced-motion, distinct from both empty and error. This is currently the least-designed state and it appears on every verification.

---

*Prepared for Claude Design. Every string, prop, `data-status` value, and class name above is pulled from the live implementation in `client/src/concept2cure/components/ana/` — questions on any of it can be answered directly against the code. The compliance and accessibility rules in §8–§11 and Appendices D/E/K are load-bearing for a 21 CFR Part 11 regulated product: please treat them as constraints and ping engineering before relaxing any of them. Everything in §12 and Appendix L is yours to shape — and the `data-status` contract in Appendix A is the lever that makes a coherent redesign tractable.*

---
---

# Part II — The whole product (codebase-wide design survey)

> Part I covered the AnA Document Studio in depth. Part II zooms out to the **entire client application** (~338 `.tsx` + ~191 `.ts` files), produced from a **read-only sweep** by a six-agent survey team across: the shared UI design system, the application shell/navigation, the medical-device (MDX) modules, the drug/biopharma + CMC + submission + PDEV modules, the cross-cutting workflow surfaces (auth, projects, tasking, quality, risk, insights, authoring), and the global UX systems (i18n, theming, responsive, accessibility). Every claim below is grounded in real files. The point of Part II is to give Claude Design a **map of the whole product and the system-wide design problems**, not just the newest surface.

## System-wide themes (read this first)

Six independent surveys converged on the **same handful of issues**. These are the highest-leverage things to fix because they recur in *every* module — solving them once improves the entire product.

### Theme 1 — Token fragmentation is the #1 design-system problem (flagged by 4 of 6 surveys)
There are **three-plus overlapping token namespaces**: (a) the intended OKLCH semantic scale in `concept2cure/design/claude-design.css` (`--bg-000…500`, `--text-100…500`, `--accent-main-100` = `#d97757`), **duplicated** near-identically in `design-system/colors_and_type.css`; (b) a `--shadcn-*` HSL bridge defined only in `index.css` that Tailwind consumes via `hsl(var(--shadcn-*))` (historically brittle — a code comment records a 2026-04-29 regression); (c) a **legacy** `client/src/styles/theme.css` that redefines `:root` twice with conflicting values (`--color-bg`, Poppins/Lora fonts). So `bg-primary` resolves token → Tailwind → `--shadcn-primary` → OKLCH/HSL — a real source of "why won't my color theme." **One source of truth + a documented bridge is the single highest-leverage fix in the codebase.**

### Theme 2 — There is no shared chrome; every module re-implements the frame
Each domain (`mdx`, `pdev`, `biopharma`, `cmc`, `submission`, `tasking`, `risk`, `quality`, `labeling`, `communication`, `intelligence`, `authoring`) ships **its own** `shell/TopBar.tsx`, its own `app.css` className namespace (`pdev-*`, `bp-*`, `cmc-*`, `sub-*`, `mdx`…), and **its own icon set** (≥5 bespoke `icons.tsx` registries; auth/insights use `lucide-react`; AnA uses CSS-module + sized `I.*`). The app shell itself is a **2,357-line `ZenApp.tsx` god-component** with a ~110-value `layoutMode` state machine and manual URL sync. There is no persistent cross-surface chrome (breadcrumb / project switcher / command palette / notifications). **Result: at least three visual lineages** (shadcn/Tailwind `stone-*` · the CSS-token domain shells · the AnA CSS-modules system).

### Theme 3 — Governed-action UX is fragmented across ≥4 patterns for the same Part 11 obligation
The same legal obligation (a governed, audited mutation) is expressed four different ways: **`EsignModal`** (`_shared/`, the gold standard — §11.50 meaning + §11.100 identity + §11.200 re-auth, focus-trapped, signed manifest), **`PdevConfirmDialog`** (reason-for-change + typed confirm word), **mdx `ApprovalCard`** (meaning + password, but a stub with `Math.random()`/`setSigned`), and **Authoring's reason scrim**. Worse, **focus-trap is inconsistent**: `EsignModal` and `CmcDialog` trap + restore focus correctly, but PDEV's confirm dialog and every `pdev-sheet`, plus most domain dialogs, set `role="dialog"` **without a trap or focus-return** — and there is **no shared focus-trap utility anywhere in the codebase** (`FocusTrap`/`focus-trap`: 0 hits). On a Part 11 product this is both a compliance and an accessibility gap.

### Theme 4 — The right shared abstractions exist, but they're off-token
`statesV2.tsx` (a complete accessible Loading/Empty/Error/Blocked/Skeleton/Progress library with `DataStateWrapper<T>`) and `workspace-primitives.tsx` (the self-declared "ONE approved layout set") are exactly the abstractions a designer wants — but **every color in them is hard-coded** `gray/blue/stone/emerald/amber`, so they're off-brand and dark-mode-incapable. Bringing these two files on-token would instantly give the **whole app** brand-correct, themeable empty/error/loading/header states.

### Theme 5 — World-class i18n infrastructure that is ~unwired
The i18n stack (i18next, namespaced bundles, faithful en/de/fr/ja incl. Japanese 和暦/年度 formatters, a CI `locale-integrity` test) is excellent — but **only 9 of 338 `.tsx` files use it**, `i18n/format.ts` is imported by **0** files while **27 files call raw `toLocaleDateString`**, and dark/regulated copy is **English-only regardless of UI language**. For an EMA/PMDA product, **localized legal/e-sign/audit/verdict copy is a real exposure** — and it's an adoption gap, not a build gap.

### Theme 6 — Declared-but-unreachable capabilities
**Dark mode**: full dark tokens exist and `ProjectContext` has `theme` + `setTheme` — but `setTheme` never applies `.dark`/`data-theme` to the DOM and has **zero callers**; the app is light-only today. **High-contrast**: `high-contrast.css` is a nuclear `*{color:black!important}` with no toggle wiring it in. **License-gated UI**: `LAYOUT_MODULE_MAP` is all `'core'` so UI entitlement gating is inert. **Tenant-aware flags**: `featureFlags.ts` is an in-memory singleton that can't do the per-org rollout its own descriptions promise. Each is either finish-it or remove-it.

### Theme 7 — Honesty (fixture-vs-live) and color-never-alone are applied unevenly
The AnA surfaces and `tasking/state.tsx` and submission `state.tsx` are rigorous about pairing every verdict with icon + text label and about distinguishing sample data from live (510(k)/IVD show a fixture-vs-live banner). But PMA/CER/biopharma fall back to fixtures more silently, and several `status-pill`/severity-dot patterns (mdx SE verdicts, PDEV severity dots) lean on color/glyph **without** a text label. For a reviewer-grade regulated product these need parity with the AnA standard.

## The shared UI design system & component primitives

### What's in this area
The shared layer lives almost entirely in `client/src/components/ui/` (~76 files). The top-level `client/src/components/` holds only `ui/` and `i18n/` in this worktree.

| Group | Files | Notes |
|---|---|---|
| **Radix-backed primitives** | `dialog`, `dropdown-menu`, `popover`, `tooltip`, `toast`+`toaster`, `select`, `tabs`, `accordion`, `alert-dialog`, `sheet`, `drawer` (vaul), `checkbox/switch/radio-group/slider/toggle/menubar/navigation-menu/context-menu/hover-card/scroll-area/separator/avatar/progress` | Standard shadcn/Radix wrappers via `cva` + `cn` |
| **Form stack** | `form.tsx` (react-hook-form + `FormField/FormControl/FormMessage`), `input`, `textarea`, `label`, `input-otp`, `file-upload*` | `form.tsx` wires `aria-describedby`/`aria-invalid` correctly |
| **Data/layout** | `table`, `card`, `sidebar` (large), `chart`, `pagination`, `breadcrumb`, `command`, `calendar`, `container`, `layout`, `resizable` | |
| **Status/feedback** | `badge`, `status-badge`, `alert`, `skeleton`, `spinner`, `statesV2`, `progress`, `alarm` | |
| **Governed kit** | `workspace-primitives.tsx` | Self-declared "ONE approved set of layout components" for core workflow surfaces: `WorkspaceHeader`, `WorkspaceHeaderRich`, `PageTitleHeader`, `WorkspaceCanvas`, `SectionPanel`, `WorkspaceTabBar`, `WorkspaceStatusBadge` + `WORKFLOW_STATUS_CONFIG` |
| **Domain helpers** | `regulatory-tooltip.jsx` (glossary of IND/NDA/BLA/eCTD terms with `21 CFR` citations), `database-aware.jsx`, `editor.jsx`, `error-boundary.jsx` | |

There is **no governed registry/Storybook**: a single `button.stories.tsx` exists. `index.ts` barrel-exports ~48 primitives but omits `statesV2`, `workspace-primitives`, `status-badge`, `spinner`, and the `.jsx` files — so the barrel is not an enforced surface.

### Token system (three namespaces — the key finding)
Tokens are CSS custom properties, well-documented but **fractured across three namespaces**:
1. **OKLCH semantic + raw Claude scales** — `--background/--foreground/--primary/--muted/--card/--border/--ring`, `--bg-000..500`, `--text-100..500`, `--accent-main-100` (`#d97757`, brand orange), `--success/--warning/--error`, `--radius*`, `--space-*`, `--dur-*`, `--ease`, `--font-sans` (Styrene B) / `--font-serif` (Tiempos Text) / `--font-mono`. Defined **twice**: in `design-system/colors_and_type.css` (canonical) and a near-identical copy at `concept2cure/design/claude-design.css` (both ~257 declarations).
2. **`--shadcn-*`** — `tailwind.config.ts` maps every color to `hsl(var(--shadcn-background))`. These 38 vars exist **only in `index.css`**, an HSL bridge. A code comment records an "Audit 2026-04-29 found var(--border) resolving to an HSL" regression — the bridge is load-bearing and historically brittle.
3. **`--accent-000/--dur/--err/--ok` shim** in `index.css`, aliasing short names for the Projects prototype CSS.

So `bg-primary` resolves token → Tailwind → `--shadcn-primary` → OKLCH/HSL — a real source of "why isn't my color theming." Type: dense by design (13px body, 10px uppercase meta), commercial Klim fonts declared `src: local()` only (silent fallback to Lora/Source Serif if not installed).

### Theming, forms, dialogs, tables, toasts
- **Light/dark** fully specified (`.dark`/`[data-theme="dark"]`), but dark works only for primitives using semantic tokens.
- **Token adoption is inconsistent.** `badge`, `toast`, `input`, `table`, `form`, `tooltip` use tokens correctly. But **`dialog.tsx` hard-codes `border-gray-200 bg-white`/`text-gray-500`** — won't render in dark mode.
- **`statesV2.tsx`** is the strongest artifact: a complete accessible state library (`LoadingState`, `EmptyState`, `ErrorState`, `NoResultsState`, `BlockedState`, `MissingConfigurationState`, skeletons, `ProgressIndicator`, generic `DataStateWrapper<T>`). Right pattern — but every color is hard-coded `gray/blue/red`, focus rings on `blue-600`, fully off-token/off-brand.
- **Toasts** token-correct except a stray `red-300/400` in destructive `ToastClose`.
- **`status-badge.tsx`** hard-codes `green/amber/red-100`, only 3 statuses — a **third** competing badge system (with `badge.tsx` and `WorkspaceStatusBadge`).

### Accessibility & compliance posture
Strong at primitive level (Radix gives focus traps/roving tabindex/aria for dialogs/menus/tabs/tooltips; `form.tsx` wires `aria-invalid`/`aria-describedby`; `statesV2` uses `role=status/alert`, `aria-live`, `aria-busy`, `sr-only`, `role=progressbar`, focus management). Concerns: (1) the global `[role=switch]` override in `index.css` paints on/off **green vs red with `!important`** — color-only + contrast risk on a regulated surface; (2) `status-badge.tsx` is color-only; (3) `statesV2` blue focus rings diverge from `--ring`. **No e-signature/audit primitive exists in the shared layer** — those patterns live in feature code, not the design system.

### Design debt / opportunities (prioritized)
1. **Collapse the three token namespaces.** One source of truth (`colors_and_type.css`), delete the duplicate `claude-design.css`, document the `--shadcn-*` HSL bridge. Highest leverage.
2. **De-duplicate `.jsx`/`.tsx` primitives.** 11 ship both (`alert`, `button`, `card`, `tabs`, `dropdown-menu`, `progress`, `radio-group`, `textarea`, `collapsible`, `file-upload`, `file-uploader`) plus `button/` and `card/` sub-dirs — competing implementations, no clear winner.
3. **Bring `statesV2` and `workspace-primitives` onto tokens** — both are the right abstractions but hard-code Tailwind classes; on-token they'd instantly give the whole app brand-correct dark-mode-capable empty/error/loading/header states.
4. **Token-ize `dialog.tsx`** so modals theme correctly.
5. **Unify the three badge systems** into one status component with mandatory icon+label (never color-alone).
6. **Replace the `!important` green/red switch override.**
7. **Stand up a governed registry** (extend Storybook; make `index.ts` the enforced import surface).
## The application shell, navigation & frame

### What's in this area
| Surface / file | Role |
|---|---|
| `client/src/App.jsx` → `main.tsx` | Global provider tree: Query → i18n → FileContext → Language → Tenant → lazy `ZenRouter`. |
| `concept2cure/router/ZenRouter.tsx` | wouter `<Switch>`. Auth gate (`usePortalAuth`), login/signup/reset, legacy-alias redirects, `ProtectedZenApp` catch-all wrapping `ZenApp` in `ProjectProvider`. Framer `PageTransition`. |
| `concept2cure/ZenApp.tsx` (**2,357 lines**) | The de-facto shell controller: ~40 `useState`, the `layoutMode` state machine, deep-link parsing, URL sync, license/intelligence wiring, a ladder of early-`return` full-viewport surfaces. |
| `concept2cure/zen-app-constants.ts` | `LayoutMode` union (**~110 modes**), `ToolPanel` registry, three nav-id↔layout maps, industry modes. |
| `router/projectModuleRoutePolicy.ts` / `approvedRoutePolicy.ts` / `zenRouteNormalization.ts` | shell-embed vs standalone decision; external-testing allowlist; ~30 dead modes collapse to `projects`/`documents`/`vault`. |
| Domain routes (`mdx`,`pdev`,`cmc`,`biopharma`,`intelligence`,`authoring`,`quality`,`labeling`,`risk`,`tasking`,`communication`,`submission`) | Each ships its **own** `shell/TopBar.tsx` — self-contained full-screen apps, not children of a shared frame. |
| `components/concept2cure-home/` | Phase-1 "home" (rail, briefing, composer, dashboard tiles); `data.tsx` owns `NAV_ITEMS`/`MODULES` + flag-gated `visibleNavItems()`/`visibleModules()`. |
| `components/ana/` | The `<Ana>` chat shell — canonical full-viewport surface for `project-home`, `regulatory-workspace`, `deep-research`. |
| `_shared/` | `EsignModal.tsx` (governed re-auth), `useC2cAction.ts` (governed mutations + idempotency + high-risk e-sign gate), `ProgramSubTabs.tsx`. |
| Contexts | `ProjectContext` (reducer store + `UIState`), `DocumentModeContext`, root `TenantContext`, `LanguageContext`, `FileContext`, `EvidenceGraphContext`. |

### Navigation model & layout modes
There is **no shared persistent chrome**. The "frame" is a `layoutMode` state machine inside `ZenApp`: a string union drives a cascade of early returns, each rendering an entire surface. The legacy "ZenSidebar + module frame" is gone (comments forbid routing to it). Navigation flows through one funnel, `handleAnaPanelNavigate(path)` (~250 lines), resolving a nav id to a domain layoutMode, an MDX deep-link hash (`BUNDLE_MDX_HASH`), an AnA intent message (`BUNDLE_INTENTS`), a settings section, a guided-stage request, or a `SIDEBAR_NAV_TO_LAYOUT` fallback. Project-scoped layouts pass through `requireActiveProject()`.

### Routing
Two-layer: URL routing (wouter) is thin (login + single `ProtectedZenApp` catch-all). Real routing is **state-based** inside `ZenApp`; URL↔state sync is manual via `window.history.replaceState` + several `useEffect`s. Deep links: `/project/:id/:module`, `?nav=`, `?panel=`, `?projectId=`. `evaluateApprovedRoute` adds redirect/hidden only when `externalTestingMode` is on.

### Module embedding (`EMBED_MODULES_IN_SHELL`, default-on)
`getProjectModuleRoutePolicy` parses project-module URLs; `shouldRenderInShell` makes `ZenApp` render the module **in place**. "In shell": `ectd`→`<ClaudeEctdCoauthor>`, `510k`/`pma`/`cer`→`<MdxRoute>` with hash, undesigned (`ind`,`cmc`) redirect to the project chat shell.

### License / entitlement gating
`hooks/useLicense.ts` → `useLicenseGating()` fetches `/api/module-subscriptions/enabled`, exposes `canAccessLayoutMode`/`canAccessModule` vs `LAYOUT_MODULE_MAP`. **But after Batch-4 nearly every mode resolves to `'core'` (always accessible)** — UI license gating is largely inert; enforcement is effectively server-side, not reflected in shell visibility.

### Feature-flag-driven visibility
`flags/featureFlags.ts` is a plain in-memory singleton (no persistence, no per-org resolution — `setFeatureEnabled` mutates the singleton). Real UI gating today: `EMBED_MODULES_IN_SHELL` and `ENABLE_PDEV_SURFACE` (home `data.tsx` hides PDEV rail/launcher when off; ZenApp re-checks before `<PdevRoute>`).

### Global providers / contexts
Order outer→inner: Query → i18n → FileContext → Language → Tenant → router → ProjectProvider. `ProjectContext` is a full reducer store but **parallels** ZenApp's ~40 local hooks for the same project/active-ID/UIState concerns.

### Design debt / opportunities (prioritized)
1. **The shell is a 2,357-line god-component state machine.** `layoutMode` (~110 values, many dead) + 20-branch early-return ladder + manual `history.replaceState` is the single highest risk to navigation correctness and to any redesign. Treat the nav model as a flat surface-router, not a layered IA.
2. **No shared persistent chrome.** Every domain ships its own `shell/TopBar.tsx`; CMC's already diverges (own breadcrumb vocabulary, density toggle, inline-styled project picker). Unify into one shell TopBar contract (breadcrumb, project switcher, command palette, notifications).
3. **Two competing state stores** (`ProjectContext` vs ZenApp local hooks) model the same active-project/sidebar concerns — pick one.
4. **License gating is hollowed out** (`LAYOUT_MODULE_MAP` all `'core'`); if entitlement-scoped visibility is a product requirement, the shell doesn't express it.
5. **Feature flags are not tenant-aware** — a singleton can't support the per-org rollout the flag descriptions promise.
6. **Dead layout modes leak into the type system** (~30 demoted + "type-safety-only" modes); prune so the navigable set is legible.
7. **Embedded `MdxRoute` is hash-string-coupled** (`#k510`/`#pma`/`#cer`/`#vault`/`#admin` scattered across several call sites) — a fragile untyped contract an IA change will trip on.
## Medical-device (MDX) regulatory modules — 510(k), CER, PMA, IVDR

The device side lives in two cooperating areas: the **MDX pathway surfaces** (`client/src/concept2cure/mdx/`), a router-driven workbench with one surface per pathway; and the **AnA Document Studio device affordances** (`client/src/concept2cure/components/ana/`), a set of flag-gated authoring/verification panels that drive document generation. `mdx/App.tsx` switches on a `pathway` key (`k510` / `pma` / `cer` / `ivd`) to mount the matching surface; every surface is wrapped in **`PathwayPanes`** (`surfaces/pathway/PathwayPanes.tsx`), which is the shared regulated chrome.

### Surfaces and what each is for

| Surface (file) | Pathway | Core screens / patterns |
|---|---|---|
| `K510Surface.tsx` | 510(k) | 7-stage strip · predicate-search table (similarity bars, multi-select) · substantial-equivalence matrix (single + multi-predicate grid) · eSTAR section list with blocker count + official-eSTAR readiness gate |
| `CerSurface.tsx` | CER (EU MDR Art. 61) | Safety-signals table (FAERS/MAUDE/Eudamed) · literature-corpus bar chart by year · CER section list · AnA "generation plan" |
| `PmaSurface.tsx` | PMA | 10-phase progress grid · 4 trial-KPI cards · 6 PMA module cards |
| `IvdSurface.tsx` | IVDR | 7-stage strip · Annex VIII classification table · analytical-validation tracker · clinical-performance 2×2 (sens/spec/PPV/NPV) · GSPR (Annex I) compliance matrix |
| `PreSubManager.tsx` | 510(k) Q-Sub | KPI strip · filter row · list/detail two-pane with Questions/Timeline/Commitments tabs, commitments linking into eSTAR sections |
| `ProjectHome.tsx` | all | Per-program dashboard: governance roles, tasks, milestone timeline |

The shared `PathwayPanes` adds five sub-tabs to **every** pathway: **Workspace · Audit trail · Correspondence (agency/NB queries) · Approvals (pending e-sign) · Files**, plus a `DossierDrawer` (Document/Attachments/Activity) with a contentEditable autosave editor.

### AnA Document Studio device affordances (`components/ana/`)
These are the document-generation + compliance-check surfaces, gated by `ENABLE_ANA_DOCUMENT_STUDIO`:
- **`SEComparisonTable.tsx`** — reviewer-grade 510(k) SE table; semantic `<table>`, scoped headers, verdict pill pairs icon+colour+text label (`Equivalent` / `Discussion required` / `Not equivalent` / `Predicate safety signal` / `Pending`).
- **`GsprConformityAffordance.tsx`** + `gsprConformityMatrix.ts` — EU MDR Annex I GSPR matrix authoring; "Author GSPR conformity matrix" builds an authoring plan and hands it to AnA which runs `author_docx_native` then auto-runs `verify_docx_against_source`.
- **`PerAuthoringPanel.tsx`** + `perAuthoring.ts` — IVDR PER (Annex XIII) authoring with "Author PER and verify."
- **`cdxConcordance.ts`** — companion-diagnostic claim concordance (verbatim drug-label vs device-IFU diff).

### Primary journeys
1. **510(k):** select program → walk stage strip → multi-select predicates → review/export SE matrix (CSV) → check eSTAR section blockers → export draft package or (if ready) generate official FDA eSTAR.
2. **CER/IVDR:** triage safety signals + literature → review section/GSPR status → author CER/PER via AnA with a verify loop before any seal/export.
3. **Cross-cutting:** any surface → Approvals tab → e-sign a section; or Correspondence → "Draft response with AnA" (hands off to `AnaDrafter`).

### Regulated surfaces (non-negotiable UX)
- **Approvals / e-sign** (`ApprovalCard` in PathwayPanes): meaning-of-signature input + password re-entry, gated submit (`pwd.length >= 6 && meaning`), cites 21 CFR §11.50/§11.70/§11.100(b). This is a governed action.
- **Audit trail**: hash-chained (SHA-256, prev/this), tamper-evident banner, signed export, role + IP captured.
- **Official eSTAR generation** (`K510Surface`): disabled-with-reason gate driven by `useEstarReadiness`; routes through a governed export plane.
- **Document export gating**: SE/GSPR/PER all enforce an **honesty contract** — `sample` / `not_assessed` provenance suppresses seal/export and shows the reason in text.

### UX/UI patterns
Consistent reusable patterns: `section-hdr`, `stage-strip`/`phases`, `panel` + `panel-hdr` + `tb-btn` actions, `status-pill`, the `estar-row`/section list, match/readiness bars, and the `AskAnaChip`/AnA-action buttons threaded through every table. Verdicts are color **plus** glyph plus text (the `ana/` components do this rigorously; the `mdx/` surfaces are weaker — see debt).

### State coverage
- **Empty states:** good in `CerSurface` (no-signals, no-literature) and attachments/activity drawers.
- **Loading/error:** `K510Surface` and `IvdSurface` show explicit "configuring for your tenant / showing canonical example" banners distinguishing fixture data from live — a strong honesty pattern. CER/PMA fall back to fixtures more silently.
- **Missing:** no skeletons (only `· loading…` text); PMA/CER lack the fixture-vs-live banner that 510k/IVD have.

### Design system usage & divergence
The `ana/` components use CSS Modules (`styles.module.css`) and an `I.*` icon set with `size` props; the `mdx/` surfaces use a global class system (`app.css`, `pathway-tabs.css`) and a **different** `I.*` icon set (glyph nodes, no size prop). The two icon registries and two styling systems are the biggest inconsistency. The `mdx/` surfaces also carry a large amount of **inline `style={{…}}`** (banners, table cells, the entire CER "generation plan" panel, the hard-coded accent button) rather than tokenized classes.

### Design debt / opportunities (prioritized)
1. **Verdict accessibility parity.** `SEComparisonTable`/`GsprConformity` pair icon+text+colour correctly; the `mdx/` surface `status-pill`s and SE-matrix verdicts (`se-verdict same/equivalent/different`) lean on colour/glyph without text labels. Bring them to the `ana/` standard — non-negotiable for a reviewer-grade SE table.
2. **Unify the two icon sets and styling systems** (`ana/` CSS-Modules+sized icons vs `mdx/` global-CSS+glyph icons) so device work has one visual language.
3. **Inline-style cleanup → tokens.** The repeated banner block (duplicated verbatim in `K510Surface` and `IvdSurface`) and the CER generation-plan rows should become shared tokenized components.
4. **CER is under-built vs siblings.** `CerSurface`'s header comment flags that the intended 7-tab CerWorkbench (Equivalence/GSPR/Lit/Signals/PMS/Generator) "is not present in this kit drop"; the generation-plan panel is hard-coded sample copy. This is the weakest device surface and the one most visibly placeholder.
5. **Loading affordances.** Replace `· loading…` text with proper skeletons across predicate/SE/eSTAR/GSPR tables.
6. **E-sign realism.** `ApprovalCard` uses `Math.random()` for the witness-packet number and `setSigned(true)` with no real submit — a designer should spec the real governed-confirmation + reason-for-change flow, since this is the most compliance-sensitive control in the area.
7. **Fixture-vs-live honesty banner** should be extended to PMA and CER (currently only 510k/IVD), so no surface ever presents example records as tenant data.
## Drug & biopharma modules — IND/eCTD/CSR, CMC, and the PDEV lifecycle

This area spans four sibling React/TS apps under `client/src/concept2cure/`: **biopharma** (pathway/lifecycle command center), **cmc** (Module 3 authoring), **submission** (ESG/CESP gateway transmittals), and **pdev** (the IND-program activity lifecycle — by far the most built-out and the regulated heart of the drug side). Each is a self-contained shell (Rail + TopBar + optional TabBar + surface router + persistent AnA dock) with its own `app.css`, `icons.tsx`, and `data/nav.ts`. They share idioms but **not a component library** — every shell, dock, and icon set is re-implemented per module.

| Module | Key surfaces | Purpose |
|---|---|---|
| **PDEV** | `Overview`, `Workstream` (drill), `ActivityDetail` (6-tab sheet), `Assembly` (IND eCTD readiness + compile), `FdaStream`, `Contradictions`, `AiDraftWorkbench`, `EvidencePicker`, `ConfirmDialog` | IND-program lifecycle: 4 workstreams (CMC/nonclinical/clinical/regulatory) × 5 stages, 14 activity states, governed mutations |
| **biopharma** | `Overview`, `IndSurface`, `Pathway` (NDA/BLA/MAA/JNDA), `LifecycleSurface`, `MeetingsSurface`, `PvSurface`, `OrphanSurface`, `PediatricSurface`; `SurfaceComposer`, `bits` | Per-pathway "conversation-first" surfaces; many cards **fixture-backed (`SamplePill`)** pending endpoints |
| **cmc** | `Overview`, `Specifications`, `Stability`, `Batch`, `Change` (impact simulator), `Blueprint`, `Global`, `Copilot`; `CmcDialog` | Module 3 authoring with live `/api/cmc/*`; governed approval via shared `EsignModal` |
| **submission** | `Overview`, `Transmittals`, `Validation` (pre-flight); `state.tsx` | FDA ESG / EMA CESP / EUDAMED / PMDA transmittal + ACK1/2/3 chain + pre-flight findings |

### Primary journeys
1. **PDEV IND lifecycle (the spine):** pick IND program → `Overview` readiness card + workstream rollup → workstream → `Workstream` stage-stepper + filterable activity grid/list → activity → `ActivityDetail` 6-tab sheet (State · Documents · Evidence · Workflow · Provenance · Audit) → change state / attach evidence / run approval chain / generate AI draft, **each routed through `PdevConfirmDialog`** → `Assembly` → **Compile IND** (gated). Side flows: `FdaStream`, `Contradictions`.
2. **CMC authoring:** project → `Specifications/Stability/Batch` table → create/edit in `CmcDialog` → **approve via `EsignModal`** (full Part 11). `Change` is a stateless impact simulator.
3. **Submission transmit:** `Overview` triage queue → `Validation` clear findings → transmit, watch ACK chain.

### Patterns
- **Stepper/dashboard/drill/tabbed-detail** is the PDEV signature: readiness card with % + progress bar → workstream-strip of clickable cards → numbered-node stage stepper → activity grid/list (density-adaptive, persisted `localStorage['pdev.viewMode']`) → filter chips → overlay `pdev-sheet` with tab row. The strongest reusable pattern in the area.
- **SurfaceComposer** (biopharma): greeting + state line + drag-drop AnA composer + 4 starters + "Today" queue + collapsed reference dashboard.
- **Governed-action confirm**: two *distinct* patterns — PDEV `PdevConfirmDialog` (reason-for-change textarea w/ live count/min, typed confirm word, "Governed action · audit-logged" eyebrow; tuned per action: `minReason` 10/30, confirmWord `yes`/`yes-transmit`) and CMC/shared `EsignModal` (full Part-11 e-sign: meaning, reason, password/MFA re-auth, signed manifest w/ hash).
- **Status/verdict**: PDEV `statePillTone()` maps 14 states→8 tones; submission `state.tsx` deliberately pairs tone+label+icon and gives ACK cells `aria-label`s so meaning is **never color-only**.

### State coverage
- **PDEV strong** — explicit `pdev-loading-state` (`aria-busy`), `pdev-empty-state`, `pdev-page-error`, per-tab empties, honest "project linkage required" gate for AI draft/compile.
- **submission/cmc**: shared `Loading`(role=status)/`ErrorState`(role=alert)/`Empty`.
- **biopharma weakest** — most dashboards are `FIXTURE_*` with a `SamplePill`; `IndSurface` degrades to a sample queue; no real loading/error for fixture cards. Don't mistake these for finished data surfaces.

### Accessibility & compliance
- **Regulated (non-negotiable):** `PdevConfirmDialog` (every PDEV mutation → server SHA-256 audit-chain w/ reason verbatim), `Assembly` **Compile IND** (force-compile needs 30-char reason + `yes-transmit`, "Most consequential action · audit-flagged"), `ActivityDetail` Workflow approve/reject, `EsignModal` (CMC approvals/batch release), submission transmit gating.
- **Focus management inconsistent.** `CmcDialog` is gold (trap, initial focus, Esc, **return-focus-to-trigger**, `aria-modal`, labelled). But `PdevConfirmDialog` and every `pdev-sheet` set `role="dialog" aria-modal` **without a focus trap or focus-return** — only `autoFocus` on the first field. For audit-logged dialogs this is the highest-priority gap.
- Color-only risk: PDEV `pdev-sev-dot tone-*` and `pdev-mini-fill ok/err` rely on color; severity dots in `Contradictions`/`Assembly` lack text labels.

### Design debt / opportunities
1. **Add a real focus trap + focus-return to every PDEV `role=dialog`** (confirm + all sheets); reuse `CmcDialog`'s contract — a Part-11/WCAG blocker on audit-logged actions.
2. **Unify the two governed-action dialogs** (`PdevConfirmDialog` reason-for-change vs `EsignModal` e-sign) into one governed-action component family with variants.
3. **Replace CMC's inline-styled AnA dock** (App.tsx ~199-240) with the class-based dock; consolidate four near-identical dock implementations.
4. **Promote the PDEV dashboard→stepper→drill→tabbed-sheet pattern into a shared kit** — biopharma cards + CMC tables would benefit.
5. **Make biopharma's sample-vs-live boundary unmistakable at the page level** (not just per-card `SamplePill`).
6. **Tokenize readiness thresholds + severity tones** (80/50 cutoffs, `tone-warn/err` dots re-derived per module) and pair every severity dot with a text label.
## Cross-cutting workflow surfaces — auth, projects, tasking, quality, risk, insights, authoring

These horizontal features split into two visual lineages: **auth + insights** (shadcn `@/components/ui` + Tailwind `stone-*`, `lucide-react`, `framer-motion`) and **the workstream shells** (tasking, risk, quality, labeling, intelligence, communication, projects, authoring — raw CSS classes over `--text-*/--bg-*/--border/--accent-*` with per-module inline-SVG icon sets). The seam between those lineages is the biggest design debt here.

| Surface | Files | Purpose | Regulated |
|---|---|---|---|
| **Auth / MFA** | `auth/ZenLogin`, `ZenSignup`, `passwordPolicy`, `loginLockout` | Sign-in, 6-digit + recovery-code MFA, forgot/reset, gated request-access | **Yes** |
| **Projects** | `projects/ProjectDetail` + `ProjectHeader/Workstreams/Thread/Drafts/Aside` | Single-project hub: workstream rollups, AnA thread, drafts, team/evidence/activity | partial |
| **Tasking** | `tasking/App`, `Overview/Board/List/state` | Org-scoped AI work queue: KPIs, kanban, list; mine/everyone + density | no |
| **Quality / QMP** | `quality/SopRegister`, `App`, `data`, `hooks` | Controlled-document register, lifecycle, periodic review, read-and-understood training | **Yes** |
| **Risk** | `risk/App`, `Overview/Register/Matrix/Controls/RiskDialog` | ISO 14971 register + 5×5 severity×probability matrix (pre/post-control) | partial |
| **Insights** | `insights/InsightsSurface`, `charts/*` | Scope-aware Report-OS catalog → run list → rendered report; read-only | no |
| **Intelligence** | `intelligence/App`, `Protocol/Cmc/Biostat/Reports` | Read-only analysis; all mutation deep-links to Authoring | no |
| **Communication** | `communication/App`, `ReviewQueue/Approvals/AuditTimeline` | Org handoff hub: review queue, **e-sign approvals**, **Part 11 audit trail** | **Yes** |
| **Labeling** | `labeling/App`, `Overview/Documents/Translations/Symbols` | Labeling docs, translations, symbol library | partial |
| **Authoring** | `authoring/App`, `shell/conversation/artifact/workbench` | **The governed editor** — conversation + workbench over one doc model | **Yes** |
| **Shared e-sign** | `_shared/components/EsignModal.tsx` | The single 21 CFR Part 11 e-signature gate (§11.50/100/200) | **Yes** |

### Primary journeys
1. Sign in → MFA → workspace (lockout after 5 attempts, 12-char reset policy).
2. Open a project (`ProjectDetail`) → workstream completion rollups → workstream/draft → project-grounded AnA.
3. Author a section (`AuthoringApp`): OutlineTree → draft-with-AnA → select text → strengthen/tighten/cite/regenerate (`SelectionToolbar`) → **"Send for review"** captures a Part 11 reason-for-change.
4. Govern a document (`SopRegister`): every lifecycle action (approve/revise/retire/record training) is an **AnA prompt** — no direct mutation; AnA owns the audit path.
5. Approve work (`CommApprovals`): org-wide queue → Approve/Reject → `EsignModal` re-auths + signs → immutable in `CommAuditTimeline`.

### Patterns
- **Shared shell chrome** (`.shell/.rail/.topbar/.tabbar/.ana-seam`, originated in `mdx/app.css`) reused near-identically by tasking, risk, labeling, communication, quality. Rail + TopBar + TabBar + surface router + collapsible AnA dock (**⌘\**), persisting `anaOpen/density/owner` to localStorage.
- **AnA-as-action-bus**: Quality and Intelligence never mutate locally — they pass NL prompts via `onAsk`. Authoring streams a *local demo* rewrite engine but routes the *governed* "send for review" to the real audited API.
- **Tables** dominate (approvals, audit, SOP register, drafts). Risk uses a 5×5 heatmap; insights uses a chart library (`ForecastBand`, `CalibrationPlot`, `ReadinessRing`, `TrendLine`) with `useReducedMotion` + `DataTableFallback`.
- **Status chips** (`tasking/state.tsx`) are the model: tone + text label + icon, color never sole signal; `dueInfo` always carries a word.
- **Governed modals**: `EsignModal` (full focus trap, `aria-modal`, focus restore, Esc, `role=alert` errors, signed-manifest) and Authoring's inline reason-for-change scrim (10-char min).

### State coverage
- **Strong**: tasking, communication, insights (honest per-branch copy), `ProjectDetail`.
- **Gaps**: Authoring uses inline-styled one-off empties (`au-empty`); `ProjectDetail` hand-rolls loading/error with inline styles. Auth's only loading signal is button spinners.

### Accessibility & compliance
- **Gold standard — `EsignModal`**: §11.50 meaning radiogroup, §11.100 bound identity, §11.200 password (+TOTP) re-auth per event, credentials never stored, full keyboard/focus discipline, immutable signed manifest. Reuse everywhere a governed mutation occurs.
- **Audit trail** (`CommAuditTimeline`) read-only/immutable with actor/action/target/**reason**.
- **Authoring's "Send for review"** forces ≥10-char reason + Part 11 snapshot+ledger write — but the editor's streaming rewrite/regenerate/confidence-bump engine is a **local demo** (`AUTH_REWRITES`, fabricated "confidence rose"). AI mutations not yet backed by the audited route must be visibly labeled drafts, never committed changes — a compliance risk.
- **Color-never-alone** enforced in tasking chips + risk matrix (cells carry band word + score + count). Verify the same in `risk/Register`, `labeling`, insights legends.
- **Auth**: MFA inputs handle paste/backspace/focus-advance with `autoComplete="one-time-code"`; the dev-only **Demo Access** button must stay `import.meta.env.DEV`-gated (already amber).

### Design debt / opportunities
1. **Unify the two visual lineages** — pull auth+insights (shadcn `stone-*`) into the token system or formally bless the split.
2. **One governed-mutation component** — `EsignModal` (e-sign) and Authoring's reason scrim are two bars for the same Part 11 obligation; standardize and route Authoring/Quality/SOP through it.
3. **Make AI-edit provenance unmistakable in Authoring** (draft/uncommitted treatment; gate "committed" language behind the audited route).
4. **Consolidate per-module icon sets** (tasking/risk/quality/labeling/intelligence/authoring each ship a bespoke `icons.tsx`; auth uses lucide).
5. **Standardize empty/loading/error** — adopt tasking's `state.tsx` in Authoring + `ProjectDetail`.
6. **Resolve scope-model confusion** — org-scoped (tasking/communication) vs project-scoped (risk/labeling) share chrome + a `mine/everyone` toggle that's inert in some; make scope explicit in the TopBar.
7. **Insights "Ask AnA" is unwired** (`onAsk` optional, no backend) — wire or hide the dead affordance.
## Global UX systems — internationalization, theming, responsiveness & accessibility posture

### The i18n system
Stack: **i18next + react-i18next + http-backend + browser-languagedetector** (`client/src/i18n/index.ts`), single-source registry in `i18n/languages.ts`. 18 locales *declared*; only **en/de/fr/ja** have reviewer-quality bundles (e.g. `ja/common.json` ships real Japanese: 保存, キャンセル, 表示密度). Strings keyed hierarchically by namespace (`common/auth/home/settings`), ICU `{{interpolation}}`, served as static JSON lazy-loaded from `client/public/locales/{lng}/{ns}.json`.

| Concern | State |
|---|---|
| Detection | `localStorage('c2c.language')` → `navigator` → `en`; account `preferences.language` after auth |
| Integrity guardrails | `locale-integrity.test.ts` enforces key/placeholder/markup parity **and** server AnA-overlay sync — a genuine strength |
| `<html lang>`/`dir` | Synced on `languageChanged` |
| RTL | **Not supported in practice** — every `LanguageDef.dir='ltr'`; no ar/he registered, no logical-property CSS audit |
| Date/number | `Intl` helpers in `i18n/format.ts` incl. bespoke **Japanese era (和暦)** + **fiscal-year (年度)** formatters for PMDA/MHLW |

**Critical gaps:** (1) `i18n/format.ts` (the correct path) is imported by **0 files**, while **27 files call raw `toLocaleDateString`/`toLocaleString`** — dates/numbers don't follow the UI language. (2) Only **9 of 338 `.tsx` files** use `useTranslation`/`useLanguage` — infra is excellent but **almost entirely unwired**; most UI strings are hard-coded English. (3) `client/src/locales/*` is a vestigial second copy distinct from live `client/public/locales/*` — a drift trap.

### Implications for a regulated multi-region product
- **Label-text expansion:** de/fr bundles run ~15–25% larger than English; Japanese larger still. Fixed-width chips/buttons/single-line headers will truncate — spec min-widths and wrapping against the **longest** locale.
- **Legal/regulatory copy:** with most strings hard-coded English, **legal notices, e-sign attestations, audit-reason prompts, and verdict language are English-only regardless of UI language** — a real EMA/PMDA exposure. These governed strings must be migrated into i18n **first** and translation-reviewed, not machine-translated.

### Theming / token application
**Three overlapping token systems** (the biggest design-system liability):
1. `concept2cure/design/claude-design.css` — the **intended** OKLCH scale (`--bg-000…500`, `--text-100…500`, `--accent-main-100`=#d97757, `--ink/--border/--canvas`).
2. `client/src/styles/theme.css` — a **legacy** parallel set (`--color-bg`, `--font-heading: Poppins`, `--font-base: Lora`) that **redefines `:root` twice** with conflicting values.
3. Tailwind (`tailwind.config.ts`, `darkMode:['class']`) consuming `--shadcn-*`.

**Light/dark:** dark tokens exist (`.dark, [data-theme="dark"]`) and `ProjectContext` carries `theme:'light'|'dark'|'system'` + `setTheme` — but **`setTheme` only mutates state; it never applies `.dark`/`data-theme` to the DOM, and has zero callers.** Dark mode is **declared but unreachable** — no toggle, no system listener. The app is light-only today.

### Responsive strategy
**No coherent strategy** — ad-hoc, CSS-module-local. Breakpoints scattered (`max-width` 1100/1000/1280/1160/1080/1024/960/820/760/560/480 each once or twice), no shared scale, almost no Tailwind `sm:/md:/lg:`. Desktop-first for a wide regulatory workstation (sensible for the audience), but no documented breakpoint tokens; mobile/tablet coverage incidental.

### App-wide accessibility posture
**Strengths:** `aria-*` in 181 files, `role=` in 126, `aria-live` in 33, `sr-only` in 28, `:focus-visible` in `index.css` + modules. **`prefers-reduced-motion: reduce` honored in 26 media blocks** — strong motion discipline. `LanguageSwitcher` exemplary (native `<select>`, per-`<option> lang`, translated `aria-label`). The locale-integrity test prevents raw-key leakage.
**Gaps:** (1) **Dialog focus management is thin** — `role="dialog"` in 26 files but **no focus-trap utility anywhere** (`FocusTrap`/`focus-trap`: 0 hits); dialogs likely don't trap/restore focus reliably. (2) **`useToast` in only 6 files** — sparse, likely supplemented by one-offs. (3) **`high-contrast.css`** is a blunt `*{color:black!important;background:white!important}` — obliterates status/verdict color, and **no toggle wires it in**. (4) Dark mode unreachable → no dark-contrast verification path. (5) Hard-coded English strings are an AT gap for non-English screen-reader users.

### Highest-value global opportunities
1. **Wire the i18n layer that already exists** — route the 27 raw `toLocaleDateString` callers through `i18n/format.ts`; migrate hard-coded strings starting with **regulated copy** (e-sign attestations, audit-reason prompts, verdicts). Infra + CI guardrails are done; adoption is the gap.
2. **Collapse three token systems into one** — `claude-design.css` authoritative, deprecate `theme.css` + its duplicate `:root`, align Tailwind/shadcn vars.
3. **Either finish or remove dark mode** — wire `setTheme` to set `data-theme`/`.dark` + system listener + toggle + contrast-audit, or delete the dead tokens.
4. **Add a shared focus-trap + standardized dialog primitive** (trap, restore, `DialogTitle`-labelled) and converge all dialogs onto it — non-negotiable for a Part 11 product.
5. **Define a real breakpoint token scale**; spec layouts against the longest locale.
6. **Replace the nuclear `high-contrast.css`** with a token-based high-contrast theme that preserves status/verdict semantics, wired to an a11y settings control.

## Codebase-wide design priorities (a roadmap)

Synthesized from all six surveys, ordered by leverage. P0 items unblock everything else; do them first.

### P0 — Foundations (one fix improves every module)
1. **Collapse the token system to one source of truth.** Make `claude-design.css` (OKLCH) authoritative; delete the duplicate `colors_and_type.css` copy and the legacy `theme.css` double-`:root`; **document the `--shadcn-*` HSL bridge** so designers know `bg-primary` ≠ `--primary` directly. Everything downstream (dark mode, theming, brand correctness) depends on this.
2. **Build one shared focus-trap + one governed-dialog primitive.** Generalize `EsignModal`/`CmcDialog`'s contract (trap, restore, `DialogTitle`-labelled, Esc, `role=alert` errors) and converge **every** `role="dialog"` onto it. This closes the Part-11/WCAG focus gap across PDEV, mdx, authoring, and the shared `dialog.tsx`.
3. **Define one governed-action component family.** A single visual+interaction language for "audited mutation," with variants for reason-for-change (PDEV) and full e-sign (CMC/AnA/communication). Today there are four.

### P1 — One product, one design language
4. **Bring `statesV2` and `workspace-primitives` on-token** → instant brand-correct, dark-capable empty/loading/error/header states app-wide.
5. **One shell chrome + one icon system.** Replace the per-module `TopBar`/icon registries with a single shell contract (breadcrumb, project switcher, command palette, notifications, AnA dock) and one icon set. Treat `ZenApp`'s `layoutMode` as a flat surface-router and prune the ~30 dead modes.
6. **Unify the three badge systems** (`badge`, `status-badge`, `WorkspaceStatusBadge`) into one status component with mandatory icon + text label (never color-alone), driven by one `WORKFLOW_STATUS_CONFIG`.
7. **Token-ize `dialog.tsx`** and replace the `!important` green/red `[role=switch]` override with non-color-only states.

### P2 — Reach, correctness, polish
8. **Finish or remove dark mode** — wire `setTheme` to the DOM + a system-preference listener + a toggle + a dark contrast audit, or delete the dead tokens.
9. **Wire the i18n layer that already exists** — route the 27 raw `toLocaleDateString` callers through `i18n/format.ts`; migrate hard-coded strings into namespaced bundles **starting with regulated copy** (e-sign attestations, audit-reason prompts, verdicts, legal notices). Spec all fixed-width UI against the **longest** locale to prevent de/fr/ja truncation.
10. **Define a breakpoint token scale** and consolidate the 10+ one-off media queries (desktop-first is correct for the audience; the lack of a documented scale is the issue).
11. **Token-based high-contrast theme** that preserves status/verdict semantics, wired to an accessibility settings control (retire the nuclear `high-contrast.css`).
12. **Make fixture-vs-live + color-never-alone universal** — extend the 510(k)/IVD honesty banner to PMA/CER/biopharma, and bring every `status-pill`/severity dot to the AnA icon+text+color standard.
13. **Standardize empty/loading/error adoption** — replace inline-styled one-offs in Authoring, `ProjectDetail`, and the mdx surfaces with `statesV2` (once it's on-token), and adopt real skeletons over `· loading…` text.

---

*Part II prepared by a read-only six-agent survey of the client codebase. Every file path, component, token, and class name is real and can be verified directly. The seven themes above are the cross-cutting design problems; the roadmap orders them by leverage. The single most valuable place to start is **P0.1 (token consolidation)** — it is upstream of dark mode, theming, brand correctness, and most of the visual-consistency debt in every module. As with Part I, the compliance and accessibility items (the governed-dialog focus-trap gap in P0.2, the regulated-copy localization in P2.9, color-never-alone in P2.12) are load-bearing for a 21 CFR Part 11 / multi-region regulated product — treat them as constraints, not polish.*

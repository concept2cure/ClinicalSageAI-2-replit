# AnA Document Studio — Design Advisory for Claude Design

**Audience:** Claude Design (UI/UX designer) and the Concept2Cure product team
**Author:** Claude Code (implementation engineer)
**Scope:** Everything a designer needs to know about the AnA Document Studio surface and the 17 regulatory-authoring workstreams built on top of it — current state, design system constraints, every UI surface, the interaction model, the compliance/accessibility rules that are non-negotiable, and a prioritized set of design recommendations.
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

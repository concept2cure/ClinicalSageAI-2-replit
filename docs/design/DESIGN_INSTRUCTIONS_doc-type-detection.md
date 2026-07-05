# Instructions to Claude Design — Wiring Document-Type Detection into the AnA Document Studio

**From:** Claude Code (implementer) · **To:** Claude Design
**Date:** 5 July 2026 · **Source PR:** #1004 (`claude/improve-ana-responsiveness-CqFU4`, CI green)
**Builds on — read first:** `docs/design/ANA_DOCUMENT_STUDIO_DESIGN_ADVISORY.md`
**Do not replace that document.** This is a targeted addendum for one new capability, written to be anchored to real files, real tokens, and real data shapes — because the last round of UI work was not.

---

## 0. Why you're getting this (read this part)

PR #1004 shipped **natural-language document-type detection**: AnA now recognises when a user is asking for a specific regulatory document ("draft a clinical overview", "write the IB", "section 2.5") and knows the exact ICH/FDA structure for it. 18 document types, phrase-level matching, confidence-scored.

Two problems, and they are exactly the "not anchored to the codebase" problem:

1. **The detection is not connected to the Document Studio you already have a full spec for.** Detection fires on the `orchestration` SSE event *before the first token*. Today it does nothing but set a text chip on the chat message. The `DocumentStudioPane` (the right-pane authoring surface, advisory §4, §6.2) opens on a *different* event (`artifact_draft`) and knows nothing about the detected type. The two systems pass in the night.

2. **The one piece of UI that shipped uses a token that does not exist.** In `Message.tsx` the chip is styled `background: 'var(--ana-accent, #5b6af5)'`. There is **no `--ana-accent` token** in `client/src/concept2cure/design/claude-design.css`. `#5b6af5` is indigo; the product's accent is `--accent-main-100: #d97757` (warm terracotta) and AnA's persona colour is `--ai: #6a9bcc` (muted blue). That single line is the archetype of un-anchored work. It is the thing we are eliminating.

Your job is **not** to invent a new visual language. It's to connect this capability to the one that already exists, using its tokens, its components, and its `data-status` contract.

---

## 1. The Anchoring Contract (non-negotiable — this is the fix)

Every deliverable must satisfy all of these. A mockup that doesn't is not actionable and will bounce back.

1. **Colours are named tokens, from the real file.** Every colour must be a token defined in `client/src/concept2cure/design/claude-design.css`. No raw hex in a proposal. If you can't name the token, it doesn't exist yet — then propose it *in the bundle* (rule 5), don't hardcode a hex.

2. **The banned pattern, named.** `var(--ana-accent, #5b6af5)` — a phantom token with an off-brand fallback — is the reference example of what we reject. See §6 for the exact corrected chip.

3. **Every component proposal names its real file.** The surface you're changing is one of: `Message.tsx`, `DocumentStudioPane.tsx`, `useAnaChat.ts`, `Ana.tsx`, `styles.module.css`, or the bundle `App.jsx`. If your proposal can't point at a file in `client/src/concept2cure/components/ana/`, it's floating.

4. **Every state maps to the existing `data-status` contract.** Advisory Appendix A defines the canonical verdict-state enum (`verified` / `unverified` / `clean` / `blocked` / `sample` / …). Do not invent a parallel state vocabulary for document detection. If detection needs a new state (e.g. `pending_structure`), propose it as an addition to that enum, in that contract.

5. **New visuals land in the bundle first.** `docs/design/concept2cure-design-system/project/ui_kits/ana_ri/App.jsx` is the stated design authority; engineering mirrors it into `styles.module.css`. The standing rule from the advisory (§3.1): *"No new design tokens or selectors — every style used exists in the bundle."* Honour it.

6. **Deliverable format — a picture is not enough.** Alongside any mockup, hand over three maps:
   - **Token map** — every colour, space, radius, type role in the mockup, written as its token name.
   - **Component map** — which `.tsx` files change, and how (new prop / new sub-component / modified block).
   - **State map** — which `data-status` values you are theming, including the running / empty / null states, not just the happy path.

7. **Hold WCAG 2.2 AA.** Colour never alone (icon + text label on every state), `:focus-visible` ring via token (never bare `outline:none`), `prefers-reduced-motion` fallback. Advisory §10. Already met — don't regress it.

8. **Reviewer-grade tone, calm motion.** No emoji on the governed path. ≤200ms ease-out (`--ease`), no bounce. Microcopy states fact, not cheerleading. Advisory §11.

---

## 2. The actual job — connect detection to the Studio

The precise gap, in the real code:

| Step | What happens now | File |
|---|---|---|
| User asks "draft a clinical overview" | — | — |
| Detection runs, **before streaming** | `detectDocumentTemplate()` returns the matched template + confidence | `orchestrator.ts` (step 4c) |
| Metadata forwarded to client | `orchestration` SSE event carries `id, displayName, chipLabel, authority, submissionFamily, confidence` | `stream.ts:546–555` |
| Client stores it | `detectedDocumentType` set on the message | `useAnaChat.ts` |
| Client shows it | a text chip on the assistant row (phantom token) | `Message.tsx:325–333` |
| A draft artifact later arrives | `DocumentStudioPane` opens — **unaware of the detected type** | `Ana.tsx:1126` |

**The Studio is never primed by the detection.** When AnA knows within milliseconds that a Clinical Overview is coming — with its six ICH sections — nothing tells the Studio to pre-title itself, show the pending structure, or set expectations. The user gets a chip, and separately, later, a document pane. Design the bridge.

---

## 3. Design decisions needed (each anchored to a real surface)

**D1 — Does high-confidence detection prime the Studio?**
When `confidence ≥ 0.4` and the detected type has a known structure, should the `DocumentStudioPane` open early — pre-titled ("Clinical Overview · ICH M4E"), showing the section skeleton as a *pending* outline — before the draft streams in? Or stay chat-only until `artifact_draft` fires (current behaviour)?
*Anchor:* studio open/close logic lives in `Ana.tsx`; the split-pane model is advisory §4.1 ("the Studio is additive, never a mode-switch").

**D2 — Where does the section outline render, and as what?**
The template knows every section: heading, ICH code, required flag, target word range (data shape in §5). This is the single most valuable signal — it lets the user verify the structure before reading 2,000 words. Two candidate homes, both real:
- a **pending-structure strip at the top of the right-pane trust stack** (advisory §4.2 stack order), sharing the trust-panel visual family (§7) and the `data-status` language; or
- an **outline in the document body** that fills in as sections are drafted.
Pick one and theme it through the existing panel system. This is a *new data shape on the wire* — see §5, it needs a one-line server change first; flag it to engineering before you spec the visuals so the data is there.

**D3 — The chip itself (replace the phantom-token one).**
`Message.tsx` already renders two metadata chips off `.cite`: `detectedLens` (audit/risk/…) and the new `detectedDocumentType`. They don't share a grammar — the doc-type one bolts inline overrides onto `.cite`. Decide: does the document-type chip carry AnA's persona colour (`--ai`), or an authority-coded treatment (FDA/ICH/EMA/ISO)? Then unify both chips into one named class in `styles.module.css` so message metadata reads as one system. See §6 for the immediate corrected version.

**D4 — Confidence expression.**
`confidence < 0.4` must look different from a confident match — a non-alarming "Likely: …" treatment, never overstated. This is the honesty contract (advisory §9) applied to detection: don't let a guess look like a fact.

**D5 — The null state (most turns).**
Most messages detect no document (`detectedDocumentTemplate` is `null`, correctly). In that case the entire system is **invisible** — no chip, no banner, no primed Studio. Already handled in `useAnaChat.ts`; your design must preserve it. Document detection is opt-in by context, never ambient.

---

## 4. The real tokens for this feature

Use these by name. All defined in `claude-design.css`, both light and dark.

| Role | Token | Value (light) | Notes |
|---|---|---|---|
| AnA persona (chip, avatar) | `--ai` | `#6a9bcc` | muted blue — AnA's identity colour, distinct from brand |
| Brand accent (rare, primary action) | `--accent-main-100` | `#d97757` | Claude terracotta — do **not** use blue for this |
| Accent pressed/hover | `--accent-main-200` | `#c96442` | |
| Accent wash (subtle fill) | `--accent-subtle` | `--accent-main-000` | |
| Document reading surface | `--font-serif` | Tiempos Text → Georgia | the doc body is serif *deliberately* (reads as a document) |
| UI chrome / labels | `--font-sans` | Styrene B → system | |
| ICH codes, IDs | `--font-mono` | ui-monospace | |
| Status — good | `--success` | `#788c5d` | earthy olive, not neon green |
| Status — caution | `--warning` | `#c87d2e` | ochre |
| Status — problem | `--error` | `#b93a3a` | brick (note: some module fallbacks read `--danger`; the token above is authoritative) |
| Surfaces | `--bg-000/100/200`, `--canvas-elevated` | | |
| Ink hierarchy | `--ink`, `--ink-body`, `--ink-muted`, `--ink-subtle` | | |
| Borders | `--border`, `--border-subtle`, `--border-strong` | | |
| Motion | `--ease` (200ms) | | wrap transitions in reduced-motion guard |

The house aesthetic is **"quiet stone, not neon"** (verbatim from the code comments in `styles.module.css`): status reads as fact, not alarm. Match it.

---

## 5. The real data — what's available, and the one thing missing

**Available on the client today** (from the `orchestration` SSE event → `AnaChatMessage`):
`id`, `displayName` (e.g. "Clinical Overview (ICH M4E)"), `chipLabel`, `authority` (`FDA`|`EMA`|`PMDA`|`ICH`|`ISO`|`Multi`), `submissionFamily` (e.g. "CTD Module 2"), `confidence` (0–1), plus `suggestedActions` (next-document suggestions).

**Missing — required before D2 can be built.** The section structure exists server-side but is **not forwarded**. The shape (`server/services/ana-ri/document-templates.ts:20`):

```ts
interface TemplateSection {
  heading: string;              // "2.5.1 Product Development Rationale"
  code?: string;                // "2.5.1"  — ICH code
  guidance: string;             // drafting guidance (may not need to surface)
  targetWords?: [number, number]; // [600, 1000]
  required: boolean;
}
```

Forwarding a `sections: TemplateSection[]` array on the `orchestration` event is a **one-line change** in `stream.ts` (add it to the `detectedDocumentTemplate` object at line 546). Until it's added, any section-outline design has no data to bind to. **Flag this to engineering as a prerequisite for D2** — I (Claude Code) can add it in one commit when you're ready to spec the outline.

---

## 6. Worked example — the chip, anchored vs not

This is the standard for the whole feature. The shipped version and its fix:

```tsx
// ❌ SHIPPED — un-anchored: phantom token, off-brand hardcoded fallback, inline overrides
<span
  className={styles.cite}
  style={{ marginLeft: 8, background: 'var(--ana-accent, #5b6af5)', color: '#fff',
           borderRadius: 4, padding: '1px 7px', fontSize: '0.72em', fontWeight: 600 }}
>
  Drafting: {detectedDocumentType}
</span>
```

```tsx
// ✅ ANCHORED — one named class in styles.module.css, real token, no inline style
<span className={styles.docTypeChip} title={`Drafting document: ${detectedDocumentType}`}>
  Drafting: {detectedDocumentType}
</span>
```
```css
/* styles.module.css — themed via tokens, works in both light and dark */
.docTypeChip {
  display: inline-flex; align-items: center; gap: 4px;
  margin-left: 8px; padding: 1px 7px; border-radius: var(--radius-sm);
  font-family: var(--font-sans); font-size: 0.72em; font-weight: 600;
  letter-spacing: var(--tracking-wide);
  background: var(--ai); color: var(--text-000);
}
```

Whether the final colour is `--ai` or an authority-coded set is **your call (D3)** — but it must be a token, in a class, in the stylesheet. That's the bar for everything else.

I can land this exact refactor in one commit as the reference point before you begin, or hold until your system arrives so I match your class names. Your call.

---

## 7. What to deliver back

A punch list, each item satisfying the Anchoring Contract (§1):

1. **D3 chip** — final treatment (token map + the `styles.module.css` class), unifying `detectedLens` + `detectedDocumentType` into one metadata-chip grammar.
2. **D1 decision** — does detection prime the Studio early? With the primed/pending state designed.
3. **D2 section outline** — where it lives (trust-stack strip vs doc body), themed through the existing panel family + `data-status`, with its `TemplateSection` binding. (Depends on the §5 server change.)
4. **D4 confidence** — the low-confidence ("Likely:") treatment.
5. **State map** — every state including running, empty, and null.
6. **Bundle delta** — the additions to `App.jsx` / the token layer, if any (rule 5).

Anything that arrives as a picture without the three maps (§1.6) isn't ready to build — send it back through the contract first.

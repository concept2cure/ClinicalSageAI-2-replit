# Handoff to Design — Medical Coding (MedDRA / WHODrug) with honest license-gated state

**Date:** 2026-06-29
**From:** AnA Intelligence Expansion · Claude Design cell (isolated worktree off `concept2cure-v2`)
**Lane:** C — Submission-grade data services (Pillar P2)
**Master plan:** `ANA_INTELLIGENCE_EXPANSION_MASTER_PLAN_2026-06-29.md` §2.2, §4 Lane C
**Status:** Backend tools settling (`code_meddra`, `code_whodrug`), **license-gated** (MedDRA v29.0 / WHODrug Mar 2026). **No UI built.**
**Companions:** `README.md`, `shared/ui-contracts/ana-renderers.ts`, `client/src/concept2cure/hooks/useLicense.ts` (`useLicenseGating`)

---

## 0. How to read this document

Reviewer-grade design brief. Standard flow + four gates. No new tokens. Governed components only. The defining design problem here is the **honest empty/locked state**: MedDRA and WHODrug are licensed dictionaries the tenant may not have. The locked state must be truthful, useful, and **never a dead button**.

---

## 1. Why this exists

Every safety narrative, CSR AE table, PSUR/DSUR, and E2B(R3) ICSR needs coded terms (MedDRA for events, WHODrug for drugs). The service is license-gated: a tenant without a MedDRA/WHODrug subscription must see an honest locked surface, not a broken one. This brief specifies (a) the **coding panel** when licensed and (b) the **LockedModuleCard** pattern when not.

The one-line promise: *"Code a verbatim term to its MedDRA PT/SOC or a WHODrug entry with the hierarchy and confidence shown — and when the license isn't enabled, see exactly what to enable and why, never a dead end."*

---

## 2. Where it lives (layoutMode / surface / panes)

- **Surface:** quick-tool inside `safety` (the registered-but-unbuilt Safety surface, `docs/ANA_SURFACE_MAP.md` §"Gaps" #1) and inline in global AnA chat. Also reachable from the `review` surface where AE tables are assembled.
- **Panes (System-Aware Artifact Architecture):**
  - **Intelligence (35%):** the coding interaction — paste/select verbatim terms, run, review matches.
  - **Artifact (65%):** the coded artifact in context — the AE line listing / safety table with terms now carrying their coded values and hierarchy.
- The **locked state replaces the panel content in place** (it does not navigate away).

---

## 3. Governed components used

- **The coding panel:** **StructuredInputDrawer** (`ana-renderers.ts:233`) for input (verbatim term(s), dictionary version, language), **RankedCards** (`RankedCardsProps`, `ana-renderers.ts:103`) for candidate matches (best-first, with confidence band), **Table** for the coded result and its hierarchy, **Badge** for the dictionary-version pill.
- **The locked state — `LockedModuleCard` pattern** (composed from governed primitives **Card + Badge + Button + Alert**; not a new component): a **Card** with a `Lock` (Lucide) glyph, a factual title, the reason it is locked, what it unlocks, and a single **Button** CTA that is always live (see §5.2).
- **DataStateWrapper / LoadingState / ErrorState**, **Tooltip**, **ActionBar**.

Gating source of truth: `useLicenseGating()` / `canAccessModule(moduleId)` in `client/src/concept2cure/hooks/useLicense.ts:322`. The panel checks entitlement before rendering inputs; if not entitled, it renders the LockedModuleCard.

---

## 4. The coding panel (licensed)

### 4.1 Input
- StructuredInputDrawer fields: verbatim term (string), batch terms (object-array for table coding), dictionary + version (enum, default to the latest licensed — MedDRA v29.0 / WHODrug Mar 2026), primary SOC selection (enum, MedDRA), language (enum). AnA can pre-fill verbatim terms from the open AE table (`prefill`).

### 4.2 Candidate matches (RankedCards)
- Each candidate: the LLT/PT, its mapped PT/HLT/HLGT/SOC chain, a **confidence band** (`band` label: "exact" / "high" / "review"), and the match rationale. The best match is `recommendedId`. The user confirms a code — coding is a decision, not an auto-apply.
- **Confidence is paired with text:** "high" / "review" words, not just color. A "review" band is amber and explicitly asks for human confirmation.

### 4.3 Coded result (Table + hierarchy)
- The confirmed code renders the full MedDRA hierarchy (PT → HLT → HLGT → SOC) or WHODrug ATC chain as an indented Table, with the dictionary-version Badge ("MedDRA v29.0") and a `last_verified`/`codedAt` stamp.

### 4.4 In the artifact
- The AE line listing in the artifact pane shows each verbatim term with its coded PT and SOC; uncoded rows are flagged (amber "needs coding"), never silently blank.

---

## 5. The honest locked / empty states (the marquee)

### 5.1 Empty (licensed, nothing coded yet)
- "No terms coded yet. Paste a verbatim term or code directly from an AE table." — describes what will appear (per `microcopy-tone`), never "Nothing here".

### 5.2 Locked (license not enabled) — `LockedModuleCard`
- **Anatomy:** Card on cream canvas, white elevated surface; leading `Lock` glyph (stone, not red — locked is a state, not an error); title "MedDRA coding is not enabled for this workspace."; one factual sentence on what it does ("MedDRA coding maps verbatim adverse-event terms to standardized PT/SOC for CSR tables, PSUR/DSUR, and E2B(R3) ICSR."); a short "what you need" line ("Requires an active MedDRA v29.0 license on this tenant."); and **one always-live CTA**.
- **The CTA is never a dead button.** Its label and behavior depend on the viewer's role (resolve via entitlements/RBAC):
  - **Tenant admin / can enable:** "Enable MedDRA coding" → opens the entitlement/enablement flow (the same flow `useEnabledModules` drives). A live, governed action.
  - **Non-admin user:** "Request MedDRA access" → opens a request to the workspace admin (records who requested + when). Still live, still useful.
  - **Never** render a greyed disabled button with no path forward. If genuinely no path exists, link to docs ("Learn what MedDRA coding unlocks →") — a live link, not a dead control.
- **Honesty:** the locked card never implies the feature is "coming soon" if it is shippable-on-license; it states the license requirement plainly. It does not show a fake preview that the user cannot use.
- **WHODrug** uses the identical pattern with its own copy and module id.

---

## 6. Microcopy (per `microcopy-tone`)

- Locked title: "MedDRA coding is not enabled for this workspace."
- Locked body: "MedDRA coding maps verbatim adverse-event terms to standardized PT/SOC. It requires an active MedDRA v29.0 license."
- Admin CTA: "Enable MedDRA coding". User CTA: "Request MedDRA access". Docs fallback: "Learn what MedDRA coding unlocks →".
- After request sent: "Request sent to your workspace admin." (factual confirmation, no celebration).
- Review-band match: "This match needs review before you apply it."
- Version pill: "MedDRA v29.0". WHODrug: "WHODrug · Mar 2026".
- No emoji, no exclamation, no "Oops", no "Upgrade now!!" energy.

---

## 7. Accessibility (`accessibility-enforcement`, WCAG 2.2 AA)

- **Locked is not error-by-color:** the `Lock` glyph + the explicit "not enabled" text carry the meaning; the card is stone-toned, not red.
- **The CTA is a real, focusable, labeled control** with an accessible name describing the action ("Enable MedDRA coding") — central to the "never a dead button" rule, and an a11y requirement (no disabled-without-explanation control).
- **Confidence bands** pair color + word ("high" / "review").
- **Focus order:** input → run → candidate cards (each selectable) → confirm → coded result. In the locked state: title → body → CTA.
- **ARIA live:** candidate matches stream into `aria-live="polite"`; the locked card announces its status via `role="status"`.
- **Contrast:** version pills and 10px stamps use ≥ `--text-300`.

---

## 8. Motion (`motion-discipline`)

- 200ms ease-out; no spring/bounce.
- Candidate cards fade in (no scale). Confirming a code: the chosen card settles, others fade out 150ms.
- Locked card appears with a single 200ms fade — no shake, no attention-grab.
- `prefers-reduced-motion`: instant.

---

## 9. Part 11 / pedigree affordances (`regulatory-compliance-ux`)

- **Coding is a recorded decision.** Confirming a code captures who coded, the dictionary version, the verbatim→coded mapping, and timestamp (audit). Re-coding creates a new versioned mapping; the prior is retained (immutable history).
- **Pedigree:** each coded result carries `engine` (the coding service + dictionary version) and `provenance` (`engineVersion`, `codedAt`). Surface the dictionary-version Badge as the pedigree signal — submission reviewers must see the exact MedDRA/WHODrug version.
- **Enable/request are governed actions:** enabling a licensed module is audited (who enabled, when); a request is logged. Reason-for-change applies to enablement per `regulatory-compliance-ux`.
- **Honesty boundary:** the locked state never fabricates coded output; the coder never auto-applies a "review" band without human confirmation.

---

## 10. Definition of done

1. When licensed, the panel codes verbatim terms to MedDRA PT/SOC (and WHODrug), shows ranked candidates with confidence, the full hierarchy, and the dictionary-version pill.
2. When not licensed, the `LockedModuleCard` renders in place with a truthful explanation and **a role-appropriate, always-live CTA** (enable / request / learn) — never a dead button.
3. Confirming a code records an audit row with version + actor; re-coding versions, never overwrites.
4. Uncoded AE rows are flagged, never silently blank.
5. All four gates clean; reduced-motion clean; no new tokens.

---

## 11. Design-system ambiguities for the principal

- **Module ids** — confirm the exact `moduleId` strings for MedDRA and WHODrug in `useEnabledModules` so gating + the enable flow bind correctly.
- **Enablement flow** — does "Enable" trigger a self-serve entitlement toggle, or a billing/contract step? (Determines whether the admin CTA is one-click or routes to a contact/quote flow — both are valid "live", but the copy differs.)
- **LockedModuleCard reuse** — this card pattern recurs (CDISC, SPL/IDMP, PSUR are also license/scope-gated). Recommend promoting it to a shared governed pattern; confirm the principal wants it registered rather than re-composed per surface.

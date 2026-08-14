# Design Brief: The surface layer

**Full-scale UI assessment and remediation direction for the Concept2Cure.RI product
surface layer.** Measured on `concept2cure-v2`, 2026-08-14, with zero source drift.

Every figure below names the command or the expression that produced it. Where a number
disagrees with its command, the command is right and this brief is stale.

---

## Assessment

### What is genuinely strong

The design *system* is governed to a standard most products never reach, and it is
enforced by machine rather than by review.

| Gate | Result today |
|---|---|
| `ci:token-cascade` | 33 stylesheets, all resolve cleanly |
| `ci:token-contrast` | 27 pairs checked, every enforced pair ≥ 4.5:1; 5 documented exceptions held at recorded ratios |
| `ci:check-chip-tones` | 75 literal tone uses, all 25 tones resolve to a real rule |
| `ci:check-orphaned-stylesheets` | 35 imported, 0 orphaned |
| `ci:design-system` | Lucide only, no spring/bounce motion — zero violations |
| `check:microcopy` | 288 customer-facing files, no exclamations or pictographs |
| `ci:check-css-selector-shadowing` | 32 stylesheets, 21 known shadowed selectors, 0 new |
| `ci:surface-discoverability` | 118 renderable: 92 catalogued, 26 declared contextual with reasons |

That contrast gate is unusual and worth naming: colour is not a matter of taste here, it
is a checked property. So is motion. So is tone. **The vocabulary is governed; what is not
governed is the composition.**

The lazy-chunking work is also real: `surfaceViews.ts` moved from 88 static imports to one
`lazySurface(...)` chunk per surface, taking the V2App chunk from **1,645 KB to 229 KB**.
Any consolidation must not regress that.

### The finding, in one sentence

**The platform has a design system and no component vocabulary.** 111 surface modules
share 13 components between them — 3 in `_shared/components`, 6 in `mdx/components`, 4 in
`components/ana`. Consistency is currently carried entirely by tokens and 33 per-surface
stylesheets, which means every surface re-invents its table, its empty state, its filter
bar and its refusal state, and the only thing keeping them alike is that the same person
wrote them.

That is why the same weakness shows up in five different measurements below. They are not
five problems.

### Measured findings

**1 · No shared composition layer.**
111 surface modules, 13 shared components. Token adoption inside TSX is 331 `var(--…)`
against 116 raw hex — about three quarters — and the design gate's own docstring defers
roughly 500 hex literals across the wider mix as needing per-occurrence judgement.

**2 · The surface count has never been consolidated.**
118 registry ids over 86 modules (ledger L42). The *never three of anything* doctrine was
applied to services, routes and tables and never to surfaces: six submission surfaces,
four authoring, three labeling, three eCTD, three reporting over three unrelated backends,
two biostat, two quality, two lineage. Some splits encode a real regulatory distinction —
`labeling-pi` is a US PI, `labeling-smpc` an EU SmPC, and merging them would serve neither.
Others are the same capability built twice.

**3 · Six surfaces render only fixture data, and almost nothing says so.**
34 of 111 modules import from `v2/fixtures/`. Of those, **29 are mixed** — real API calls
with fixture regions alongside — and **five render entirely from fixtures with no `/api`
literal and no query anywhere**: `ProjectHome` (1,216 ln), `ConversationThread` (424),
`RbmSurfaces` (332), `FilingsCatalog` (267), `PyramidAnalytics` (128). `AuthoringEngine`
(288) is a sixth, using inline constants rather than the fixtures directory (ledger L41).

Two of the six are in the Apps catalog as purchasable capabilities: `authoring-engine`,
whose catalog description asserts validation that "runs as intended 100% of the time" over
hard-coded stages, and `filings-catalog`.

**The distinction the codebase does not currently draw is the one that matters.**
`filings-catalog` renders a versioned regulatory taxonomy — 113 filing types from a dated
source document. That is *reference data*, and bundling it is legitimate.
`authoring-engine` renders fabricated pipeline state as though it were the customer's
configuration. That misrepresents. Both live in the same directory, are imported the same
way, and look identical to a reviewer. Five of the 34 surfaces show anything in the UI
about their data's origin; `Coverage` has the right pattern already —
`Backend link connected · fixtures`.

**4 · Motion and focus are governed in principle and thin in practice.**
205 `transition:` declarations across the surface stylesheets; **4 of 23 stylesheets honour
`prefers-reduced-motion`**. Five `:focus-visible` rules in the entire surface layer.
The spring/bounce ban is enforced and clean — the calm-motion doctrine is right, its
coverage is not.

**5 · Keyboard access is good by default and fails at the edges.**
788 real `<button>` elements against **28 clickable `<div>`s that lack at least one of
`role`, `tabIndex` or a key handler** — concentrated in `TaskBoard` (11) and `AnaCommand`
(4). The default is correct; these are the exceptions, and each one is a keyboard trap for
the interaction it owns.

**6 · No shared breakpoint scale.**
Ad-hoc breakpoints at 800, 820, 900, 1080 and 1100px, in two spellings (`@media (` and
`@media(`), and **7 of 23 stylesheets carry no media query at all** — including
`authoring-v2`, `submission-v2` and `commcenter-v2`, three of the surfaces a regulatory
lead lives in.

### What this adds up to

The engine is consistently stronger than the interface onto it. That sentence is already
in the white paper; this assessment is the specific version of it. Nothing here is a
rewrite — the tokens are right, the motion doctrine is right, the enforcement pattern is
right, and the chunking is right. What is missing is the layer between tokens and screens.

---

## Problem

A regulatory affairs lead is accountable for a filing that moves across a project plan, a
document, a submission sequence and an agency correspondence thread. Today each of those is
a screen that was built well and built separately. The table behaves differently on each
one. The empty state says something different. Two of them tell her when the data is a
sample and the rest do not. When she cannot find a capability she knows exists, the answer
is a catalog she has to think to open.

She is not confused about regulatory work. She is spending attention on the interface that
should be going to the filing — and in a domain where a wrong judgement is an agency
finding, attention is the scarce resource.

## Solution

One continuous surface for the filing, rather than a set of screens that each solve their
part correctly. The same table, the same empty state, the same refusal, the same "this is
where the data came from" affordance, wherever she is. Fewer places to be, each one
answering more. And AnA present on every one of them knowing what screen she is on and what
that screen needs — which is a separate workstream (`docs/DEVELOPMENT_GUIDE_2026-08.md`
§5a) that this brief's component work is a precondition for.

## Experience Principles

1. **Provenance over polish** — Every surface says where its data came from, in the same
   place, in the same words. A screen that cannot say is a screen that says it cannot. This
   is what the product already does per-claim inside documents; the surface layer should
   not be held to a lower standard than the paragraph.

2. **One vocabulary, many domains** — A US PI and an EU SmPC are genuinely different filings
   and may stay different surfaces. They may not have different tables, different filter
   bars or different words for "nothing here yet". Consolidate the vocabulary first, and the
   surface count second — the survivor decision gets easier once the parts are shared.

3. **Continuity over completeness** — A regulatory lead crossing four surfaces to close one
   filing should never re-orient. Prefer the change that makes the crossing seamless over
   the change that makes a single screen richer.

## Aesthetic Direction

- **Philosophy**: Calm regulated-work interface. Governed, quiet, evidential — the product
  is arguing for its own trustworthiness on every screen, and loud interfaces do not.
- **Tone**: Factual and unhurried. The existing microcopy gate already enforces the floor
  (no exclamations, no pictographs); the ceiling is prose a reviewer would write.
- **Reference points**: Linear's density and keyboard-first movement; Stripe's
  documentation-grade tables; the platform's own `Coverage` surface for state honesty.
- **Anti-references**: Dashboard-as-cockpit — gauges, sparklines and traffic lights
  standing in for judgement. Nothing that implies a computed verdict the system did not
  compute. No AI shimmer; the intelligence is in the answer, not the chrome.

## Existing Patterns

Everything below already exists and must be extended rather than replaced.

- **Typography** — established; sentence case throughout, enforced in copy review.
- **Colors** — CSS custom properties in `client/src/index.css` and
  `v2/styles/app-v2.css`. 27 pairs contrast-checked at ≥ 4.5:1, five documented exceptions.
  **Never introduce a colour that is not a token** — `ci:token-cascade` and
  `ci:token-contrast` both police this.
- **Chip tones** — 25 governed tones, all resolving. This is the closest thing to a
  component the layer currently has, and it is the model to follow.
- **Motion** — 200ms ease-out, no spring, no bounce. Enforced by `ci:design-system`.
- **Icons** — Lucide only, enforced.
- **Stylesheets** — 33, one per surface family, no orphans, 21 known shadowed selectors
  held flat by a ratchet.
- **Components** — `_shared/components` (3), `mdx/components` (6), `components/ana` (4).
  This is the layer being created, not one being replaced.
- **Chunking** — one lazy chunk per surface, V2App at 229 KB. A shared component library
  must land in a shared chunk without pulling surface code back into the entry.

## Component Inventory

The compliance-bearing primitives come first: they are the ones where a difference between
two screens is not an inconsistency but a defect.

| Component | Status | Notes |
| --- | --- | --- |
| `DataProvenanceBanner` | **New** | Where this screen's data came from: live, sample, or partially backed. Generalizes `Coverage`'s `Backend link connected · fixtures`. The single highest-value component in this list — it closes finding 3 across all 34 surfaces at once. |
| `EmptyState` | **New** | Distinguishes *nothing yet*, *nothing matched*, and *could not load* — the same three-way the backend already draws between `ok` / `empty` / `failed`. Today each surface improvises. |
| `RefusalNotice` | **New** | The UI half of the platform's refuse-rather-than-approximate doctrine. `not_evaluated` and `unverifiable` are first-class outcomes in the services and have no consistent visual form. |
| `GovernedActionConfirm` | **New** | Reason-for-change capture on any governed mutation. Currently per-surface where it exists at all. |
| `SignatureBlock` | **New** | Part 11 signature manifestation and staleness verdict, one rendering everywhere. |
| `AuditTrailPanel` | **New** | Immutable history view, reused rather than re-drawn per domain. |
| `DataTable` | **New** | Sort, filter, density, sticky header, keyboard row navigation. Replaces ~50 hand-rolled tables and is where the 28 clickable `<div>`s get fixed once. |
| `FilterBar` | **New** | Search plus facets. Consistent placeholder grammar. |
| `SurfaceHeader` | **New** | Title, context, primary action, AnA affordance. The seam a regulatory lead crosses most often. |
| `Chip` | **Modify** | Formalize the 25 governed tones into a component instead of a class convention. |
| `SlideOver` | **New** | Detail panel. `FilingsCatalog` and several others each have their own. |
| `Toolbar` | **New** | Action grouping and overflow behaviour. |
| `_shared/components` (3) | **Modify** | Fold into the new library rather than leaving two shared locations — one of anything. |

**Sequencing:** `DataProvenanceBanner`, `EmptyState` and `RefusalNotice` first. They are
small, they carry the compliance weight, and they can be adopted surface-by-surface without
a migration. `DataTable` last within the first tranche — it is the largest and it should
absorb the keyboard fixes rather than being retrofitted for them.

## Key Interactions

**Arriving on any surface.** The provenance banner resolves before content. Live data
renders normally; sample data renders with a persistent, non-dismissible label; a failed
load renders `RefusalNotice`, never an empty table that reads as "you have nothing".

**Crossing surfaces.** Header shape, filter position and table behaviour are identical, so
crossing costs no re-orientation. Keyboard focus lands on the header, not the document
body — one predictable entry point per surface.

**Acting on something governed.** Any mutation routes through `GovernedActionConfirm`,
which captures reason-for-change before it commits. There is exactly one of these; the
platform learned from a second signing surface what a second path costs.

**Asking AnA.** Available on every surface, and — once §5a Step 1 closes — able to move the
user in response. The rail's `ownsConversation` contract already makes "hand a question to
a rail that isn't there" a compile error; the component layer must not reintroduce that
class of gap by drawing its own assistant affordance.

## Responsive Behavior

Adopt one breakpoint scale and retire the ad-hoc 800/820/900/1080/1100 set. Proposed:
**640 / 900 / 1280**, as tokens, with a lint rule the way tokens are already linted.

- Below 900: the AnA rail collapses to an invocable sheet; tables become cards; filter bar
  collapses to a single control with a facet sheet.
- 900–1280: rail available, tables scroll horizontally inside their own container.
- Above 1280: full three-column composition.

The seven stylesheets with no media query at all — `authoring-v2`, `submission-v2`,
`commcenter-v2`, `pathway-core-v2`, `pathway-panels-v2`, `translation-v2`,
`onboarding-review` — are the migration's first cohort, because three of them are where
the primary user spends her day.

## Accessibility Requirements

WCAG 2.2 AA, held by gate rather than by review, matching how colour and motion are already
held.

- **Contrast** — already enforced at ≥ 4.5:1 across 27 token pairs. Extend the gate to
  component states (hover, disabled, selected), which it does not currently cover.
- **Keyboard** — every interactive element reachable and operable. The 28 clickable `<div>`s
  are the known deficit; `DataTable` and `SlideOver` absorb most of them.
- **Focus** — a visible focus indicator on every interactive element. Five `:focus-visible`
  rules today is effectively none; this belongs in the component library so it cannot be
  forgotten per surface.
- **Motion** — `prefers-reduced-motion` honoured for all 205 transitions, not the 4
  stylesheets that currently do. Put it in the shared layer, once.
- **Screen reader** — every governed action announces its consequence before commit; every
  refusal is announced as status, not silence.
- **Colour never alone** — a chip tone must carry a label. With 25 tones in play this is the
  likeliest AA failure in the current layer.

## Out of Scope

- **The AnA surface-context workstream.** Owned by `docs/DEVELOPMENT_GUIDE_2026-08.md` §5a.
  This brief supplies the component preconditions and stops there.
- **The surface consolidation decisions themselves.** L42 asks for a per-cluster survivor
  decision and that is a product call. This brief argues only that the vocabulary should be
  shared *before* the clusters are decided, because it makes each decision cheaper and
  reversible.
- **Deleting or folding fixture surfaces.** L41 and the `filings-catalog` finding need
  labelling first; disposition per surface follows, and is a product decision.
- **Tier and industry metadata** on the eight surfaces catalogued on 14 August. Commercial.
- **New capability.** Nothing in this brief adds a feature. The surface layer's problem is
  not that it does too little.
- **Rewriting the token system.** It is the strongest part of the layer.

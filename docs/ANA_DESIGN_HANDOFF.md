# AnA Capability Surface — Handoff to Claude Design

> One-page brief for the design team. The detail lives in the companion files
> linked below; this is the orientation + the build plan.

## The one thing to internalize first

Claude Code added a large set of regulatory capabilities to **AnA** — but they
are **backend tools the agent invokes through conversation, not screens**. If you
read the front end, they're invisible. That's why this exists.

**The build is NOT "one screen per tool."** It's a chat surface plus a small set
of reusable renderers. Get that right and ~359 capabilities are covered.

## Everything you need is already in the repo (read in this order)

1. **`docs/ANA_UI_CAPABILITY_GUIDE.md`** — the narrative: access model, the ~6
   reusable parts, MVP build order.
2. **`docs/ana-capability-manifest.json`** — every tool (359) with plain
   description, **input shape**, **suggested renderer**, **scope** (global vs
   project), and **governed** (Part 11) flag. Regenerate anytime with
   `npm run manifest:ana` — it reads the live registry, so it never drifts.
   Rows marked `"derived": true` have heuristic metadata; sanity-check those.
3. **`docs/ANA_SURFACE_MAP.md`** — which app surface hosts which tool + the gaps.
4. **`shared/ui-contracts/ana-renderers.ts`** — **pure TypeScript prop contracts**
   for every renderer. Import these so your components and Claude Code's results
   share one API and can't drift.

## The access model (3 layers)

1. **Conversational (primary).** The user asks AnA in a project context; AnA runs
   the tool and returns a result. Most tools need only a good result card.
2. **Discoverable catalog (secondary).** So users *learn* the capabilities exist —
   render `getToolCatalog()` as a searchable list + a tool-picker chip in the
   composer.
3. **Navigation (connective tissue).** AnA moves the user to the right surface via
   `navigate_to` → an action chip → the existing `setLayoutMode` path. You render
   the chip; the handler already exists.

## Build these 6 reusable parts — they cover the whole surface

1. **Result card** — status badge (`computed` / `needs_parameters` / `failed`) +
   key/value grid + a "methodology / what this is NOT" expander. **The
   scope-caveat line is mandatory** (see Honesty below).
2. **Findings list** — severity-tagged (errors before warnings) + pass/fail.
3. **Document canvas** — rendered body + export, with a **prominent
   missing-section banner**.
4. **Artifact preview/download** — for XML/CSV outputs, with provenance.
5. **Chart kit (just 5):** bars (budget impact), trace (Markov), CEAC (PSA),
   ICER plane (cost-effectiveness), regression-band (shelf life).
6. **Structured-input drawer** — for tools whose inputs are tables/matrices/specs
   (stability data, dataset specs, transition matrices, RIS text). AnA pre-fills
   it; the user edits and runs. Field shapes come from each tool's `inputs` array
   in the manifest.

Plus one cross-cutting affordance: the **governed-action confirmation** (Part 11
reason-for-change + e-signature) for any tool flagged `"governed": true`. The
backend enforces it; the UI must present it, never bypass it. Props:
`GovernedActionConfirmProps`.

## Where things live (surface placement)

- `scope: global` tools run from the global AnA chat (HEOR models, SPL/CDISC,
  references, predicate scoring, shelf life, method validation, drug/label lookup).
- `scope: project` tools live **inside the relevant project surface** (Safety,
  Submission, 510(k), CMC) — they fail closed without project context. Each
  project-scoped tool needs **two render targets**: the inline chat card and the
  surface panel — both use the *same* props, so build the renderer once.

## Two surfaces don't exist yet — navigation is already wired

1. **Safety / Pharmacovigilance** — `navigate_to({ target: "safety" })` already
   resolves. Hosts the SAE line-listing table (CSV export) and the E2B(R3) ICSR
   composer (XML + a mandatory-gap checklist).
2. **Market Access / HEOR** — `navigate_to({ target: "market-access" })` already
   resolves. Hosts the four HEOR charts (bars / ICER plane / Markov trace / CEAC).

Both ids are registered in `shared/navigation/index.ts`, so the moment you design
the screens, AnA routes users to them automatically. **The only remaining work
for these is the screen itself.**

## Honesty is a design requirement, not a nicety

Every tool deliberately returns scope caveats, gap lists, and flags like "not the
validator of record," "exceeds evaluated range," "decision aid, not a
determination," or `missingSections`. **These must be shown prominently, not
hidden.** That honesty is the platform's core value and the reason the outputs
are defensible — a UI that buries it breaks the product's promise.

## Minimum viable build (in order)

1. Chat panel + **result card** + **findings list** → unlocks most of the 359
   tools immediately.
2. **Artifact preview/download** + **document canvas** → all XML/composition tools.
3. The **5-chart kit** → all quantitative HEOR/stability tools.
4. **Structured-input drawer** (driven by `inputs`).
5. **Governed-action confirmation** for `governed:true`.
6. **Capability catalog** + **navigation chips**, then the two new surfaces
   (Safety, Market Access).

Start with #1–2; that's the highest value for the least UI. Everything to design
against — descriptions, input shapes, renderers, scopes, governed flags, and the
exact prop contracts — is in the four files above.

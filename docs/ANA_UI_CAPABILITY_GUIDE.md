# AnA Capability → UI Guide (for Claude Design)

This is the bridge between the AnA tool surface built in Claude Code and the UI
that Claude Design owns. It exists because the capabilities are **backend tools
reached through conversation**, not screens — so without this map they are
invisible to a designer reading the front-end.

- **Machine-readable source of truth:** [`docs/ana-capability-manifest.json`](./ana-capability-manifest.json)
  — every AnA tool with its plain description, input shape, suggested renderer,
  global-vs-project scope, and governed (Part 11) flag.
- **Regenerate** after any tool change: `npm run manifest:ana`
  (or `npx tsx scripts/generate-ana-capability-manifest.ts`). It reads the live
  registry (`ALL_ANA_TOOLS`), so it never drifts.

> In the manifest, `"derived": false` rows have **exact** scope/governed/renderer
> metadata. `"derived": true` rows are **heuristic** — good starting points, but
> sanity-check them.

## The access model (read this first)

There is **NOT one screen per tool.** The human talks to **AnA** in a project
context; AnA selects the right tool, runs it, and returns a grounded result. The
UI's job is to **render results well, capture structured inputs when needed, and
let AnA navigate the user** — not to expose 359 menu items.

Three access layers the UI must support:

1. **Conversational (primary).** The AnA chat panel. Already fully wired on the
   backend (all 359 tools + a relevance filter). Most tools need nothing more
   than a good result card.
2. **Discoverable catalog (secondary).** So users learn the capabilities exist.
   The backend already exposes `getToolCatalog()` (grouped categories) — render
   it as a searchable capability list + a tool-picker chip in the composer.
3. **Navigation (connective tissue).** `navigate_to` / `list_app_screens` let
   AnA move the user to the right surface via the existing action-chip →
   `setLayoutMode` path (`Ana.tsx` `handleActionClick`). Render the chip; call
   the existing handler.

## The whole UI is ~6 reusable parts

Build these, and *every* tool in the manifest is covered:

1. **Result card** — status badge (`computed` / `needs_parameters` / `failed`) +
   key/value table + a "methodology / what this is NOT" expander. Every tool
   returns scope caveats — **surfacing them is mandatory**, it's the platform's
   core value (these tools refuse to fake submittable artifacts).
2. **Findings list** — severity-tagged (errors before warnings) + pass/fail.
3. **Document canvas** — rendered body + export, with a **missing-section
   banner** (the compose_* tools always return gaps honestly).
4. **Artifact preview/download** — for XML/CSV outputs, with provenance hashes.
5. **Chart kit (5 charts)** — bars (budget impact), trace (Markov), CEAC (PSA),
   ICER plane (cost-effectiveness), regression-band (shelf life).
6. **Structured-input drawer** — for tools whose inputs are tables/matrices/specs
   (stability points, dataset specs, transition matrices, RIS text). AnA can
   pre-fill it; the user edits and runs. See the `inputs` array per tool.

Plus the cross-cutting **governed-action confirmation** (Part 11 reason-for-change
+ e-signature) for any `"governed": true` tool — the backend enforces it; the UI
must present it, never bypass it.

## Where each thing lives

- **Global tools** (`"scope": "global"`) can run from the global AnA chat
  (HEOR models, SPL/CDISC artifacts, references, predicate scoring, shelf life,
  method validation, drug coding).
- **Project tools** (`"scope": "project"`) read the project's real data and
  belong **inside the relevant project surface** — Safety/PV (SAE line listing,
  E2B ICSR), Submission/Correspondence (cover letter, 510(k) summary), 510(k)
  builder (device assembly readiness). They fail closed without project context.

## Capabilities added in this work-stream (the 23 curated rows)

Grouped by the renderer they need (full details + inputs in the JSON):

| Renderer | Tools |
|---|---|
| `chart:*` | `model_budget_impact` (bars), `model_cost_effectiveness` (ICER plane), `model_markov_cohort` (trace), `run_probabilistic_sensitivity` (CEAC), `estimate_shelf_life` (regression band) |
| `artifact-xml` | `generate_spl`, `generate_define_xml`, `run_cdisc_pipeline`, `compose_e2b_icsr` |
| `findings-list` | `validate_spl`, `check_dataset_conformance`, `lint_references` |
| `document-canvas` | `format_references`, `compose_correspondence_cover_letter`, `compose_510k_summary` |
| `table-csv` | `build_sae_line_listing` |
| `ranked-cards` | `score_predicate_adequacy` |
| `readiness-panel` | `assemble_device_submission` |
| `result-card` | `assess_analytical_method_validation`, `code_drug` |
| `list` | `import_ris_references` |
| `navigation` / `none` | `navigate_to`, `list_app_screens` |

(The remaining ~336 tools — evidence search, authoring, eCTD, nonclinical,
clin-pharm, biostatistics, governance — are in the manifest with heuristic
renderers; most map to `result-card` / `findings-list` / `document-canvas`.)

## Minimum viable build for Claude Design

1. AnA chat panel with the **result card** + **findings list** renderers (covers
   the majority of the 359 tools immediately).
2. **Artifact download/preview** + **document canvas** (covers all the
   composition/XML tools).
3. The **5-chart kit** (covers all quantitative HEOR/stability tools).
4. **Structured-input drawer** driven by each tool's `inputs` array.
5. **Governed-action confirmation** for `governed:true` tools.
6. **Capability catalog** from `getToolCatalog()` + **navigation chips**.

That set surfaces everything in the manifest. Start with #1–2; they unlock most
of the value with the least UI.

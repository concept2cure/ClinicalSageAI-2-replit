# AnA Surface Map — where each capability lives in the UI

Companion to `docs/ANA_UI_CAPABILITY_GUIDE.md` and `docs/ana-capability-manifest.json`.
This maps tools to **app surfaces** (the `layoutMode`/navigation targets in
`shared/navigation`), so project-scoped capabilities have a home and the **gaps**
(capabilities with no surface yet) are explicit for Claude Design.

**Rule of thumb:**
- `scope: global` tools run from the **global AnA chat**; they can *also* appear
  as "quick tools" inside a topically-related workspace, but they don't require it.
- `scope: project` tools must live **inside a project surface** (they fail closed
  without project context).

Surface ids below are real navigation targets (see `shared/navigation/index.ts`):
`navigate_to({ target: "<id>" })` takes the user there.

## Surfaces that exist today → tools they should host

| Surface (`layoutMode`) | Hosts (project-scoped first) | Global "quick tools" to expose here |
|---|---|---|
| **`mdx`** (510(k)/De Novo) | `assemble_device_submission`, `compose_510k_summary` | `score_predicate_adequacy`, `assess_analytical_method_validation` |
| **`submissions`** / **`submission-gateway`** | `compose_correspondence_cover_letter`, eCTD assembly/validation tools | — |
| **`regulatory-workspace`** | the canonical AnA + canvas workspace — default home for any compose/draft result | all authoring/evidence tools |
| **`cmc`** (Module 3 / Quality) | existing CMC/module3 command tools | `estimate_shelf_life`, `assess_analytical_method_validation`, `run_cdisc_pipeline`, `generate_define_xml`, `check_dataset_conformance` |
| **`labeling`** | existing labeling tools | `generate_spl`, `validate_spl` |
| **`authoring`** | the unified editor | `format_references`, `lint_references`, `import_ris_references` |
| **`intelligence`** | precedent/CMC/biostat/reports tabs | `code_drug`, evidence-search tools |
| **`report-engine`** | reporting surface | the HEOR models (see gap note) |
| **`review`** / **`review-readiness`** | readiness + contradiction/deficiency tools | — |
| **`risk`**, **`tasking`**, **`quality`**, **`vault`**, **`dossier-map`**, **`section-workspace`** | their existing domain tools | — |

## Gaps — capabilities with **no home surface** (decision needed)

These are real, working capabilities that currently only have the chat path.
Recommend Claude Design add a surface (or a tab on an existing one):

1. **Safety / Pharmacovigilance** — *no surface exists.*
   Tools: `build_sae_line_listing`, `compose_e2b_icsr`, `advise_pharmacovigilance`,
   safety-narrative tools.
   Recommendation: a **Safety** project surface (or a tab under `review`), hosting
   the SAE line-listing table (CSV export) and the ICSR composer (XML + the
   mandatory-gap checklist). New navigation target id suggestion: `safety`.

2. **Market Access / HEOR** — *no surface exists.*
   Tools: `model_budget_impact`, `model_cost_effectiveness`, `model_markov_cohort`,
   `run_probabilistic_sensitivity` (+ `search_medicare_coverage`).
   Recommendation: a **Market Access** surface (or a tab under `report-engine`/
   `intelligence`) hosting the 4 charts (bars / ICER plane / Markov trace / CEAC).
   New navigation target id suggestion: `market-access`.

> When a new surface lands, add it to `NAVIGATION_TARGETS` in
> `shared/navigation/index.ts` (one entry) — then `navigate_to`/`list_app_screens`
> reach it automatically and AnA can route users to it. That's the only wiring
> needed on the AnA side.

## How a result reaches a surface

1. The user asks AnA (global chat or inside a project).
2. AnA runs the tool; the result renders inline in chat (using the renderer from
   the manifest + the props in `shared/ui-contracts/ana-renderers.ts`).
3. For richer interaction, AnA emits a **navigation chip** (`navigate_to`) — e.g.
   *"Open this in the Safety workspace"* — and the same result renders in the
   surface's panel.

So a project-scoped tool needs **two render targets**: the inline chat card and
the surface panel. Both use the *same* props contract — build the renderer once.

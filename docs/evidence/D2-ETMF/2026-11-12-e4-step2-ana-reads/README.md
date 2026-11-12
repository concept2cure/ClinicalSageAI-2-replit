# eTMF convergence E4, step 2: AnA reads a study's trial master file from the deployed store

2026-11-12. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1. Completes
`server/services/ana/AnaToolExecutor.ts`, the three handlers this lane's row names by name. Build plan:
`docs/design/ETMF_CONVERGENCE_E4_PLAN_2026-11-10.md` §4 and §6 step 2. Founder decisions P-74, P-75 and P-124.

## The defect

AnA's three trial master file reads used the second store (`tmf_files`, `tmf_artifacts`). No deploy creates that
store:

- `get_tmf_view` listed that store's "TMF files", or one file's artifacts with typed statuses.
- `review_tmf_completeness` answered a percentage of those statuses.
- The trial master file part of `search_all_documents` searched that store's artifacts by organization only, a
  private project's included.

On a deployed database the tables do not exist. So the search named the trial master file store unavailable on every
call, and the two tools failed. The trial master file page's "Ask AnA which gaps an inspector would raise" calls
them. `01-red.txt` shows the search's own suite failing that way once the world it reads has no retired table: two
existing cases go red ("unavailable_stores: tmf").

## What already exists

| Piece | Path | What it does |
|---|---|---|
| The deployed store's reads | `server/services/etmf/tmf-artifact-persistence.ts` (`readTrialTmf`, `listTmfArtifacts`) | A study's filings and assessment, for a person admitted to its project; declarations, the document's review stage, who filed |
| AnA's project scope | `AnaToolExecutor.ts` (`programReadScope`, `withSponsor`) | The projects the person can open; inside a project, its sponsor's |
| A project's studies | `services/study-design/study-design-repository.ts` (`listStudyDesigns`) | The protocol-design studies of a project |
| Unfinished work | an agent's partial patch of 2026-11-11, never committed (plan §3a) | The handlers, the definitions and a search. Taken from it, finished, adapted to declarations and to the review stage, and tested here |

## What changed

- `get_tmf_view`:
  - With `study_id`: the study, the store's readiness in words (ready, not ready, not determined) and its
    assessment unchanged, each filing with its document (and the document's review stage) and who filed it, and the
    declarations listed apart with who, when and why.
  - Without `study_id`: the studies of the projects the person can open, each with its project and sponsor.
  - The retired `tmf_file_id` is refused (`TMF_STUDY_ID_REQUIRED`), never read as "list everything".
  - No percentage is computed.
- `review_tmf_completeness` gives the same readiness for a study. It retires onto `get_tmf_view` in step 3.
- `search_all_documents`: the trial master file part searches the live filings of the studies of the projects the
  person can open (`server/services/etmf/tmf-filing-search.ts`, split out in its folder). A record matches by its
  catalog name or code, or by the title of its document. A declaration and a removed filing are never hits. A
  failed read is named among the stores not searched.
- The definitions of the two tools (`document-surface-tool-defs.ts`, `notifications-study-memory-tool-defs.ts`) say
  what they now read.
- The identity is required: the deployed store admits a person, so a call with no identified member reads nothing
  (`PROJECT_ACTOR_REQUIRED`).
- Tests:
  - The project-scope suite's world (its organizations, people, sponsors, projects and documents) moves, unchanged,
    into `_ana-project-scope-fixture.ts`, and gains the deployed store's tables. The suite stays under its size limit.
  - The new suite `ana-tmf-reads-project-scope.pglite.test.ts` reads the same world on the real access policy.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | Against AnA's reads as they stood: 9 fail, including the two existing search cases that reproduce the deployed defect |
| `02-green.txt` | Those pass (53 across the four suites), AnA's 19 tool-governance suites (265), the eTMF server suites (157), the typecheck (0 errors), the gates and the lint ratchet |

Not run in the app: these are model tools, reached through a conversation with AnA. That needs a model call, which
this host's development server is not configured to make. The access rule they apply is the real one, on PGlite.

## Next (plan §6)

Step 3: `create_tmf`, `seed_tmf` and `update_tmf_artifact_status` retire, and so does `review_tmf_completeness` (onto
`get_tmf_view`). `classify_tmf_artifact` files through the deployed store with the person's confirmation and reason.
This touches `AnaToolDefinitions.ts` (RIM's row), as this lane's row announced.

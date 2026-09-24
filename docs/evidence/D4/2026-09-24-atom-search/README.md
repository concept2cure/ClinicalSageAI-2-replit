# D4 / D2: atom retrieval returns rows, the right rows, as many as asked, 2026-09-24

**Lane:** retrieval, claimed in `docs/work-orders/README.md`. It covers the
"→ Retrieval, unclaimed" findings of the cortex tenant-key lane.

`enhancedEmbeddingService.searchHybrid` grounds Authoring's AI draft and AnA's
answers in a tenant's own evidence. The cortex lane recorded the calling paths:
`authoring.router.ts`, `chat/send-message.ts`, `c2c/ai-editing.ts`,
`evidence-ask.ts`, `deep-research.ts` and `advancedRAGPipeline.ts`. On every
database built from empty, `searchHybrid` returned nothing. Authoring reported
that honestly as `retrievalStatus: 'failed'`, so every draft was ungrounded.

## Three defects, found one behind the other

| # | Defect | Shown by |
|---|---|---|
| 1 | Both search functions in `db/migrations/20260730_fix_atom_embedding_dimension.sql` declare `structured_data JSONB` and select the column, which is `json`. The hybrid function also returns `ts_rank_cd`'s `real` as `keyword_score FLOAT`. Every call failed with 42804, even on an empty table. | `red/A-at-HEAD.txt`: 5/5, "Returned type json does not match expected type jsonb in column 5". After the json cast, "real … double precision in column 8". |
| 2 | The caller's arguments were out of order. The org branch sent the limit as `keyword_weight`; the other branch sent it as `semantic_weight`. `match_count` was never sent, so the function always returned 10. | `red/B-function-fixed-caller-not.txt`: 10 rows for a limit of 3; a combined score of 1.20 where 0.7·semantic + 0.3·keyword = 0.73. |
| 3 | The org and project filters ran after the function had taken its top rows from everything the connection could see, so a project's own atoms were crowded out. | Same file: a project with three atoms got `[]`. |

## The change

- **The migration is amended in place**, with a dated header note (CLAUDE.md
  Rule 1: it re-runs on every deploy). The two casts are added.
  `search_atoms_hybrid` takes `filter_atom_ids INTEGER[] DEFAULT NULL`, which
  restricts candidates before ranking. NULL means no restriction, and an empty
  array means nothing. The DROP names both signatures, so every re-run leaves
  exactly one function. It was applied twice to the same database, then by
  `deploy-migrate.mjs`, all without error. `ci:migration-drop-safety` and
  `ci:migration-set-order` are OK.
- **`searchHybrid`** passes each argument in its declared position:
  `keyword_weight = 1 − semanticWeight`, and `match_count = limit`. The org
  (and project) atom ids go into the function as `filter_atom_ids`.

## Proof

`tests/db/atom-search.dbtest.ts` runs on the shared two-tenant fixture:
PostgreSQL 16 + pgvector, built by install-fresh + deploy-migrate, as the
non-superuser runtime role with RLS enforcing. Embeddings are fixed vectors,
because the model is not what is under test. The fixture has:

- tenant A's project, whose three atoms score lower on the vector;
- twelve higher-scoring tenant-A atoms outside the project;
- twelve higher-scoring tenant-B atoms.

| Stage | Result |
|---|---|
| A: HEAD | 0/5 (`red/A-at-HEAD.txt`) |
| B: migration fixed, caller not | 2/5; the limit, the weights and the project all wrong (`red/B-function-fixed-caller-not.txt`) |
| C: both | 5/5; with the two-tenant suites, 48/48 (`green/C-after.txt`) |
| M1: caller passes no `filter_atom_ids` | 3/5: the project gets other atoms, and on a connection RLS does not filter, tenant B's atom is served to tenant A (`red/M1-no-in-function-filter.txt`) |

The related unit suites still pass, 13/13: the authoring AI-draft suites,
`evidence-ask` and `source-identity`.

## Not done

- `db/migrations/20260125_add_atom_embeddings.sql` still carries the old
  definitions. No applier runs it (its successor's header says so), so it is
  left alone rather than edited for symmetry.
- Whether Authoring's drafts now ground well is a quality question. This proves
  retrieval returns the tenant's own atoms in the order and number asked. Atoms
  still have to be embedded; `scripts/embed-atoms.ts` backfills them.

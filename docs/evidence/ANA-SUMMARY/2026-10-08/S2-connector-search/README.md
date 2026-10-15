# ANA-SUMMARY S2 — connector search: the Drive id, repository-only by default, escaping, shared drives (2026-10-08)

Design: `docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md` §1b ("Search the client's sources"), §3 ("Fixed:
`search_connected_repositories` (S2)"), §5 S2, "Decisions taken". Product decision: P-24 in
`docs/LAUNCH_DEFINITION_OF_DONE.md` (S2: connector search defects). Lane: ANA-SUMMARY (founder-directed, moves no
D-row). Base: `6c58f587b`, uncommitted working tree.

## Defects

1. The schema's own example id, `google-drive` (`evidence-literature-tool-defs.ts:119`), was refused as "unknown
   connector": the registry id is `google_drive`. A model that followed the example never reached Drive.
2. With `connectors` omitted the tool searched every catalog entry (`connector-search.ts:114-116`). The
   credential-free public sources count as configured (`connector-registry.ts:117`), so a client's query went to
   ClinicalTrials.gov, PubMed, Drugs@FDA (openFDA), EMA, EUDAMED, CTIS and Grants.gov — whatever the tenant's
   `publicSourceEgress` said. `red-before-fix.txt` shows the query `pembrolizumab` leaving for seven public hosts from
   an organisation with nothing connected, with egress on and with egress off.
3. The Drive query escaped `'` but not `\` (`google-drive.ts:141`), so a backslash changed the query and a trailing
   one swallowed the closing quote.
4. Drive search sent none of `supportsAllDrives`, `includeItemsFromAllDrives`, `corpora=allDrives`: files in a
   shared drive were never found.

## Fix

| Piece | File |
|---|---|
| One list of the five repositories (`REPOSITORY_CONNECTOR_IDS`: google_drive, box, onedrive, sharepoint, veeva_vault), `canonicalConnectorId` (`google-drive`, `Google Drive` → `google_drive`) and `isRepositoryConnector`, in the dependency-free interface module so the tool definition can import it | `server/services/connectors/connector-interface.ts` |
| Requested ids are matched in canonical spelling and reported in the registry's. With `connectors` omitted, only the repositories in the catalog are candidates. Any other catalog entry, asked for by name, is refused before any search: "not one of the organisation's document repositories, so this tool never sends it a query; for public sources use search_literature or the agency lookups". A repository asked for by name and not connected yields the note "Google Drive is not connected for your organisation." `skipped` reasons for repositories are unchanged | `server/services/integrations/connector-search.ts` |
| `connectors.items` is a static enum of the five; the description says it never searches public sources and names `search_literature` and the agency lookups (`search_drug_approvals`, `search_drug_labels`, `search_ema_epar`, `search_clinical_evidence`), all in launch scope | `server/services/ana/evidence-literature-tool-defs.ts` |
| `\` escaped before `'`; `supportsAllDrives=true`, `includeItemsFromAllDrives=true`, `corpora=allDrives` on files.list; no `orderBy` (delta, below) | `server/services/connectors/google-drive.ts` |
| AnA's self-report ("Connected document repositories (…)") counts only the five. It listed every configured catalog entry, so PubMed alone made it say a repository was connected, which after this change the tool would refuse | `server/services/integrations/integration-status.ts` |
| The tool's entry only, computed from the live definition by `scripts/generate-ana-capability-manifest.ts` (the rest of the generated file has drift from other lanes and was left alone) | `docs/ana-capability-manifest.json` |

Not changed, checked: `tool-authorization.register.json` (`search_connected_repositories` stays `read`, writes
`none`); `ana-launch-scope.inventory.json` (stays `inScope`); the handler in `AnaToolExecutor.ts` (passes `connectors`
through; normalisation is in the shared orchestration, so `GET /api/knowledge-base/search-connectors` gets it too).

## Red → green

Tests (all new except where noted):
- `server/services/ana/__tests__/search-connected-repositories-tool.test.ts` — through the registered tool handler,
  the real orchestration, registry, Drive connector and credential encryption; the credential store and every
  outbound HTTP request are stubbed and recorded, so "PubMed is not called" is checked on the wire. The schema cases
  go through `governedToolsetFor`, the one composition every chat door uses.
- `server/services/connectors/__tests__/google-drive-search.test.ts` — the real connector, JWT signing included;
  token endpoint and Drive API stubbed.
- `server/services/integrations/__tests__/integration-status.test.ts` — one case added.
- `server/services/connectors/__tests__/pmda-nmpa-honest.test.ts` — one expectation changed (below).

| # | Design test | Case | Red on HEAD source (`red-before-fix.txt`) | Green |
|---|---|---|---|---|
| 1 | `['google-drive']` reaches Drive | org with Drive credentials | `skipped: [{connector:'google-drive', reason:'unknown connector'}]`, no Drive request | `searched: ['google_drive']`, one files.list request, the file returned |
| 2 | omitted + PubMed configured → PubMed not called | egress **on** | hosts: api.fda.gov, api.grants.gov, clinicaltrials.gov, ec.europa.eu, euclinicaltrials.eu, eutils.ncbi.nlm.nih.gov, medicines.health.europa.eu + Google | only oauth2.googleapis.com, www.googleapis.com |
| 2 | (same) | egress **off** | same seven public hosts | same as above |
| 2a | — | org with nothing connected | seven public requests | no request at all |
| 2b | — | `['pubmed','fda_drugs','clinical_trials_gov']` asked for by name | three public requests | refused, no request, note names search_literature |
| 3 | `O'Brien \ x` → `fullText contains 'O\'Brien \\ x'` | | `'O\'Brien \ x'` | `'O\'Brien \\ x'` |
| 3a | — | trailing `\` | `'protocol\'` (quote swallowed) | `'protocol\\'` |
| 4 | shared-drive parameters | | all three `null` | `true`, `true`, `allDrives` |
| 4a | — (lead's delta) | a fullText query carries no `orderBy` | `orderBy=modifiedTime desc` sent (`orderby-red.txt`) | absent (`orderby-green.txt`) |
| 5 | schema byte-identical across tenants | org with Drive vs org with Box, via `governedToolsetFor` | **identical already** (the schema had no per-tenant part); red only on the enum assertion: `items.enum` undefined | identical (tool and whole tool list), enum = the five |
| 5a | — | description points public-source questions elsewhere | no `search_literature` | present; no `google-drive` |
| R1 | refusal | org without Drive, `['google_drive']` | note "No connected repositories are available…" | note contains "Google Drive is not connected for your organisation." |
| R2 | refusal | `['google-drive','box']`, only Box connected | no note | same sentence; Drive in `skipped`; no Google request |
| S | — | integration status with only public sources configured | `configured: true`, label lists pubmed, fda_drugs | `configured: false`, "none connected" |
| P | pmda-nmpa (changed) | PMDA/NMPA from a catalog that calls them configured | connector's search called | refused before any search |

Honest note on test 5: it was **not** red as "byte-identical" — nothing tenant-specific was in the schema at HEAD. It
is red on HEAD only through its enum assertion; the byte-identical half is a guard against adding a per-tenant list.

Counts (same four files, final test versions):
- **red: 15 failed / 33** (`red-before-fix.txt`). The 18 passing are the pre-existing cases in the two extended
  files plus one guard ("still returns the files Drive found").
- **green: 19 / 19** for the three S2 files (`green-after-fix.txt`), and 14 / 14 for pmda-nmpa-honest.
  With the delta's test, the Drive file has 5 cases (`orderby-green.txt`).

How red was produced: the five changed source files were set to their HEAD content, the final tests run, and the
fixed files restored from a copy (md5 checked). No stash, branch or worktree.

### The one existing expectation changed

`pmda-nmpa-honest.test.ts` › "is reported as skipped by the repository search, never as a document" (×2, PMDA and
NMPA). It stubs a catalog that calls PMDA configured and healthy and expected the **connector's own** refusal
(`/no .* search is connected/`). Under S2 the repository search refuses every non-repository before any search, so
the connector is never reached. Its invariant — never a document, never searched — still holds and is now stronger:
the test asserts `searchConnectors` is not called and the reason is the repository refusal. The failure of the
unchanged test on the fixed source is in `pmda-nmpa-expectation-before-update.txt`. The other 12 cases in that file,
including "is skipped by the repository search as not connected" against the real catalog, pass unchanged.
`connector-search.test.ts` (4) and the existing `integration-status.test.ts` cases (5) pass unchanged.

## Mutations (`mutations.txt`)

Each fix undone on its own, five suites run each time:

| Mutation | Turned red |
|---|---|
| M1 escape `'` only | tests 3, 3a |
| M2 shared-drive parameters removed | test 4 |
| M3 no id normalisation | test 1, R2, and 4 existing cases that use hyphenated ids |
| M4 default searches the whole catalog | test 2 (both egress settings) |
| M5 no repository check | 2b, and the changed pmda/nmpa case (×2) |
| M6 no "not connected for your organisation" sentence | R1, R2 |

## Related suites (`related-suites-after.txt`)

**297 files passed, 1 skipped; 4,429 tests passed, 3 skipped, 0 failed** — every file under
`server/services/ana/__tests__/` (tool definitions, tool selection, governed toolset, tool authorization register,
launch-scope inventory), `server/services/connectors/__tests__/` (registry tenant isolation, id encoding, Veeva, FDA),
`server/services/integrations/__tests__/`, plus `server/routes/__tests__/knowledge-base-5xx-containment.test.ts`,
`server/__tests__/routes/smoke.test.ts` and `client/src/concept2cure/v2/__tests__/shellAskGuard.test.tsx` (it names
connected repositories). The 3 skips are pre-existing (`ana-document-surgery-loop.e2e`, `artifact-version-store`).
Baseline before any change, the 16 directly related files: 171 / 171.

## Static checks and gates

- ESLint per changed file against HEAD: no file gained a warning (`lint.md`).
- Scoped type check (`tsc-scoped.txt`): a program rooted at the 9 changed files. No diagnostic in any changed file;
  shown able to fail with a deliberate TS2322 in `connector-search.ts`.
- Gates whose names mention ana, tool or capability (`gates.txt`): `ci:ana-surface-context` OK; `test:ana` 4 files,
  303 / 303; `manifest:ana` is the generator (used above, entry only); `verify:ana` drives a running instance with a
  live model and was not run. No `ci:*` gate reads the manifest or the register's entry for this tool; the vitest
  suites that do (`tool-authorization.test.ts`, `ana-launch-scope` tests) are in the related run.

## Browser acceptance — blocked

The design's acceptance needs a Drive service account on a test Workspace with a shared drive. None exists in this
environment, so these are **not** claimed:
- "Search our Drive for the 2025 stability protocol" finds a file that lives in a shared drive;
- no request to a public source in the server log for either turn (shown here on the stubbed wire only).

The refusal "Google Drive is not connected for your organisation." is shown at tool level (R1, R2), through the
registered handler.

## Delta (lead, same day): no `orderBy` on a fullText query

Drive v3 files.list refuses `orderBy` on a query with fullText terms ("Sorting is not supported for queries with
fullText terms. Results are always in descending relevance order."), so every live Drive search failed. `search()` is
the only path that builds a Drive query and it always uses `fullText`, so `orderBy` is no longer sent at all; the
relevance scores (`1 - idx * 0.01`) now follow Drive's own relevance order.
- Red first: `google-drive-search.test.ts` › "sends no orderBy with a fullText query" failed on the S2 version of
  the connector, 1 of 5 (`orderby-red.txt`).
- Green: 42 / 42 across the six connector-search, Drive, tenant-isolation, pmda-nmpa and integration-status suites
  (`orderby-green.txt`). ESLint 0 / 0 on both files; scoped tsc unchanged (no diagnostic in a changed file).
- The Drive behaviour is the lead's statement and the API's documented message; it is not verified against a live
  Workspace here (blocked, above).
- `incompleteSearch` is **not** surfaced. It is not a one-line change: `DataConnector.search` returns
  `ConnectorResult[]` with no list-level field, so carrying it to the orchestration's `note` needs the connector, the
  registry's `searchConnectors` shape and `connector-search.ts`, with a test. Left for S6, which adds `list()`.

## Not verified / open

- `fetch()` of a shared-drive file sends no `supportsAllDrives`; download is S6's new `DataConnector.download`.
- Other paths still send queries to public connectors without reading `publicSourceEgress`: deep research
  (`deep-research-orchestrator.ts`, connectors chosen by the user) and the Grants.gov / SAM tools in
  `AnaToolExecutor.ts`. Out of this slice; for the D6 periodic review, which the design asks to cross-reference S2.

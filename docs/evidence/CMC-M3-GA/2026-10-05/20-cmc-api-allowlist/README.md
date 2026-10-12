# The CMC surface claims the paths its screens call, and nothing else

Row **D2**. GA plan item 0 — the blocker three review lenses named
independently, and the last thing standing between the code and the catalog
flip (decision P-13).

## The defect

`shared/constants/ui-surface-registry.ts` had the `cmc` surface claim the bare
`/api/cmc` (plus `/api/cmc/module3-os`, and a `/api/cmc/stability` mount that
no longer exists). API attribution is by **longest prefix at a segment
boundary**, so a mount root admits every handler mounted beneath it, called or
not.

At the flip, that would have made **every** path under `/api/cmc` answer
`launch` in production — including handlers no screen calls:

| Handler | What it did |
|---|---|
| `POST /insights/take-action` | wrote a task assigned to a hard-coded "CMC Team Lead" |
| `POST /compliance/check-rules` | scored every row as a violation, reading columns the provisioned table does not have |
| `POST /generate-enhanced-blueprint` | asked a model for specifications and acceptance criteria, with no organisation |
| `POST /module3-os/classify-artifact/:projectId` | wrote an artifact blob no composer reads, as actor `'system'` |
| `GET /module3-os/source-lineage/:p/:k` | — |
| `GET /module3-os/uploaded-sources/:p` | — |
| `GET /module3-os/section-labels` | — |

…and routes deliberately withheld by P-13's scope boundary
(`/variations/classify`, `/projects/:id/process-capability`).

## The fix

**The claim is now 33 segment prefixes**, one per thing the CMC screens call:
the 23 registers and engines (`drug-substances` … `control-strategy`,
`specifications`, `batch-records`, `module3-board`, `agency-questions`) and
the 10 `module3-os` segments (`sections`, `compile`, `contradictions`,
`readiness`, `provenance`, `guard`, `place-into-submission`, `build-state`,
`build-section`, `source-evidence`). The bare `/api/cmc`, the bare
`/api/cmc/module3-os` and the dead `/api/cmc/stability` are gone.

Everything else under `/api/cmc` is **unmapped**, which production refuses
with 403 `LAUNCH_SCOPE`.

**The seven uncalled handlers above are deleted**, with no caller in
`client/src`, in server code, or in the staff simulation. Each replacement, by
path:

| Deleted | Replacement |
|---|---|
| `/insights/take-action` | the unified task board, `/api/tasks` |
| `/compliance/check-rules` | `POST /api/cmc/ich-compliance` (deterministic, cites each guideline) |
| `/generate-enhanced-blueprint` | `GET /api/cmc/quality/qbd/:projectId` and `POST /api/cmc/control-strategy`; Module 3 drafting is `POST /api/cmc/module3-os/compile/:projectId` |
| `/classify-artifact` | `/module3-os/source-evidence` (sourceEvidenceRoutes.ts) and AnA's `module3_classify_source` |
| `/source-lineage` | `GET /module3-os/provenance/:p/:k` |
| `/uploaded-sources`, `/section-labels` | `GET /module3-os/build-state/:p` |

History search (`git log --all --diff-filter=D -- 'server/api/cmc/*'`): the
only prior removals here are `e073f9a0b` (the routers nothing called, earlier
the same day) and `917289202`. No earlier generation of these handlers exists
to be rebuilt.

**One remedy sentence, in one place.** The compile route, the build-section
route and AnA's two build commands all refuse a program with no canonical
source. All four said "upload and classify source documents first" — which
pointed at `POST /module3-os/source-objects` and `/classify-artifact`, both
retired. They now share `NO_CANONICAL_SOURCES_REMEDY`
(`services/cmc/link-to-module3.ts`, beside its sibling warnings), which names
the door that exists: the registers, whose write-through is the one writer of
`cmc_source_objects`.

## Red, then green

- **The gate, on the real registry** (`launch-scope-api-gate.test.ts`, a new
  describe block that puts `cmc` in the catalog as it will stand at the flip).
  On the broad claim (`red-gate-before.txt`) **3 of 31 fail**, and the
  assertion prints the defect itself:

  ```
  expected { '/api/cmc': 'launch', …(11) } to deeply equal { '/api/cmc': 'unmapped', …(11) }
  ```

  Every deleted and withheld path answered `launch`. After
  (`green-gate-after.txt`): **31 pass**. The three cases are that each such
  path is `unmapped`; that the gate production builds refuses each 403
  `LAUNCH_SCOPE` while serving what the screens call; and that **no claimed
  prefix lacks a caller** in the CMC screens' own import graph.
- **`ci:launch-scope-api`** (`green-ci-launch-scope-api.txt`): 294 paths named
  by launch and shell screens, **none refused**.
- **The real mounted app**, walked route by route
  (`route-inventory-after.json`, from `scripts/ci/launch-scope-route-inventory.ts`):
  3,744 routes. The only unmapped CMC namespaces are the three intended
  withholds — `/api/cmc-changes`, `/api/cmc/variations`,
  `/api/cmc/projects` — and each has **no launch caller**, so nothing on a
  launch screen breaks.
- **Wider runs.** Every CMC route and service suite, the middleware suites and
  the schema contracts pass: 276 files, 3,346 tests. The gates
  `ci:launch-scope`, `ci:launch-scope-api`, `ci:unreferenced-modules`,
  `ci:check-client-api-calls`, `ci:check-route-collisions`,
  `ci:route-ownership-matrix`, `ci:no-mock-in-prod-routes`,
  `ci:org-path-param-guards` and `ci:audit-route-mounts:no-regression` all
  pass.

## Not this change

`route-inventory-after.json` also records two namespaces that are unmapped
**and** called by a launch screen: `/api/c2c/actions` and `/api/510k`, both
from `SubmissionCenter.tsx`. Neither is CMC, both predate this change, and
nothing here touches them. They belong to the Submission Center lane and are
recorded here only because this walk is the first thing to name them.

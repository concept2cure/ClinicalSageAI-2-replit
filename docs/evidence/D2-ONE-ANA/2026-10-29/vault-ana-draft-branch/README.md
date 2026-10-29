# Vault lists the project's governed artifacts: fold F3 slice A (D2, 2026-10-29)

**Row:** D2 (`docs/LAUNCH_DEFINITION_OF_DONE.md`). The founder's direction of 2026-10-29: "We are moving most 'app' into core functionality and away from any out of process 'app'."

**Plan:**
- `docs/design/DEVICE_FOLDS_2026-10-29.md` §F3, work items 1 and 3 (the status breakdown);
- the placement map `.design/client-journey/FUNCTION_PARITY.md:672-700` ("Into Vault": from `artifacts-center` and from `device-vault`).

**The work, named for what it is:**
- *complete* the project Vault's artifact branch (`project-vault.ts` `module3Branch`) to every artifact of the project;
- *converge* the Artifacts center's read and signature rule onto one shared read.

Nothing here is new beside an existing implementation.

## What already exists

Read at `8b3ee4b57`. Line numbers are at that commit.

### The target

`client/src/concept2cure/v2/surfaces/Vault.tsx` reads `GET /api/c2c/project-vault/:id` (`server/routes/c2c/project-vault.ts`), behind `installProjectRouteAccess(router, 'vault')` (:1156).

What it did:
- authored builds;
- the filing cabinet (uploads, with versions, history and a SHA-256);
- the data room;
- coverage;
- a **"Module 3 (CMC)"** branch (`module3Branch`, :1041-1082).

What the Module 3 branch did **not** do:
- It read `concept2cure_artifacts` only `WHERE ctd_section LIKE '3.%'`.
- Each leaf had `owner: '—'`, no hash, no signature, no review, no source count and no kind, format or model.
- Every leaf's preview claimed "compiled from CMC canonical sources", including a §3 row AnA drafted.

So an artifact AnA drafted for Module 1, 2, 4 or 5, or an imported file with no CTD section, was in the registry and not in the project's Vault.

### The sources the placement map names

- **`server/routes/artifacts-center-routes.ts:187-298`**, `GET /api/artifacts-center`, the organization-wide gallery.
  - What it computes per row:
    - `is_signed` (any active signature);
    - `signed_version` (the version the newest one covers);
    - `is_reviewed` (an approve decision on the *current* version);
    - `source_count` (`metadata.sourceArtifactIds`);
    - kind, format and model.
  - Not project-scoped. LIMIT 200. It lists archived rows.
  - `/:artifactId/export` (:338-491) is the governed DOCX/TXT download.
- **`client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx`** `ArtifactsCenter` (:1416-1731).
  - `signatureState` (:1403-1408) has four states: none, current, stale and unknown.
  - It also has the CSV manifest, open in editor and `artifacts-center.focus-artifact`.
- **`server/routes/mdx-vault.ts:107-298`**, `GET /api/mdx/vault?program_id`, the device vault.
  - It reads every artifact of the program (and its uploads), with families from the CTD first digit (`familyOf`) and a boolean `metadata.eSig`.
  - It calls `admitProject` since `8b3ee4b57`.
  - Versions are at :358-398 and the audit trail at :412-439.
  - Clients: `mdx/surfaces/VaultSurface.tsx` and `mdx/hooks/useVault.ts` (folder rail and KPI strip).

### Other readers of the registry, found by search

- **`server/routes/c2c/artifacts.ts`:**
  - `GET /api/concept2cure/projects/:projectId/artifacts` (:361, `getArtifactsFromDb` :206).
    - Project-scoped and authorized (PF-17).
    - It returns full content and every version, with no signature or review state.
    - Caller: `InsightsCatalogPanel.tsx`.
    - Not reused: it is the content read, not a governance read, and its payload carries every version's content.
  - `GET /api/concept2cure/artifacts` (:278), an organization gallery.
    - **No client caller.**
    - Its `projects` join lacks the same-organization condition that the Artifacts center fixed (PF-03).
    - Not touched here: see "Handed on".
  - Per-artifact `/versions` (:1844), `/audit-report` (:1892), `/signatures` (:1513) and `/provenance` (:1623).
    - These are what the versions/audit detail pane should reach, rather than a second copy.
- **`server/services/cmc/resolve-cmc-artifact-project.ts`**: the program-to-project spine resolver (linked, unanchored or unaddressable). Kept as the branch's first step.
- **`shared/regulatory/section-code.ts`**: `normalizeCtdCode` and `compareSectionCode`. Used for the module grouping and the in-module order.

### Who writes the registry

This is why the branch is not labelled "Drafted by AnA". Main agreed on 2026-10-29: Rule 2 says governed content is never attributed to a model.

| Writer | What it records |
|---|---|
| AnA draft-version store (`services/ana/artifactVersionStore.ts:144`) | `metadata.source = 'ana_document_studio'` |
| CMC compile, a deterministic composer (`services/module3-convergence-service.ts:658-705`) | `metadata.compiledFrom = 'module3-os'` |
| Device imports (`routes/mdx-imports.ts:364`) | `type = 'imported'`, content empty |
| Extraction pipeline (`services/autoExtractionPipeline.ts:698`) | `category = 'extracted'` |
| Writeback, export governance, figures, seals, the tagger | no single recorded marker |

### Searches run

- `concept2cure_artifacts` across `server/routes`, `server/api` and `server/src`: 33 files. The registry readers among them are above.
- `Drafted by AnA` / `AnA-draft` across client, server and shared: no implementation, only editor provenance copy.
- `signatureState`, `sigStale` and `signed_version`: only the Artifacts center.
- Deleted history:
  - `git log --all --diff-filter=D` on `*rtifacts-center*`, `*Vault*Artifact*`, `*governed-artifact*` and `*artifact-registry*`: nothing deleted.
  - The same on `client/**/surfaces/Vault*.tsx` and `server/routes/c2c/*vault*`: only `13337e02a` (deletion of `vault-structure`, which had no caller).

## What changed

### Shared rules: `shared/artifact-governance.ts` (new)

- **`artifactSignatureFacts` and `artifactSignatureState`:** the Artifacts center's signature rule, moved here. It was on the server (sigStale) and in the client (four states). Now there is one copy.
  - **`AdminSurfaces.tsx`** calls `artifactSignatureState`; its local function is gone.
- **`artifactOrigin` and `ARTIFACT_ORIGIN_LABELS`:** the origin as the row records it, from the columns in the table above.
  - Anything else is `null`, shown as "Not recorded".

### One registry read: `server/services/artifact-registry-read.ts` (new)

- **The query:** the Artifacts center's query, moved, not copied. It adds the columns the Vault needs:
  - status, section and recorded hash;
  - the author, through `public.actor_name`;
  - the origin markers;
  - `total_rows`, counted before the limit.
- **Binds**, with nothing interpolated:
  - `$1` organization;
  - `$2` program, or null for the organization; with a program, archived rows are left out and the row must reach the program through a same-organization project;
  - `$3` window.
- **`artifacts-center-routes.ts`** now calls this read. Its response shape is unchanged.
- **`sql-interpolation` baseline:** its entry (`LIMIT ${MAX_ROWS}`, now bound) is removed.

### The branch: `server/routes/c2c/project-vault.ts`

- **`governedArtifactsBranch` replaces `module3Branch`:**
  - every non-archived artifact of the project;
  - one branch, `artifacts` / "Governed artifacts";
  - grouped "Module 1" to "Module 5" in section order, with "No CTD section" last.
  - §3 rows are its Module 3 group, listed once. The §3-only branch is gone.
- **Each leaf (`src: 'artifact'`):**
  - kind, format, model, status, version, author;
  - the recorded hash, in `artifact.contentHash`, not `hash`;
  - signature (four states) and its version;
  - human review and cited sources;
  - origin.
- **Why the hash is not in `hash`:** on an upload, `hash` is the SHA-256 of the stored bytes. The CMC composer hashes its inputs, and an import records the source file's hash beside empty content.
- **The `artifacts` block:**
  - `total` (the project's);
  - by status, signatures and reviewed, over the listed window;
  - the window.
- **`documentCounts.cmcArtifacts`** becomes `documentCounts.artifacts`.
- **Honest states, on the existing contract:**
  - **Unanchored:** reported under `unavailable` with the Vault's own sentence. The resolver's sentence is about Module 3.
  - **Missing store:** reported under `unavailable`.
  - **Real failure:** a 500.
  - **Anchored with none:** an honest zero.
- **One cap for the tree's windows:** `VAULT_TREE_MAX_DOCS`.

### The screen: `client/src/concept2cure/v2/surfaces/VaultGovernedArtifacts.tsx` (new), wired into `Vault.tsx`

- **The tree** draws the branch like any other.
- **`GovernedArtifactsLane`** is the status breakdown.
  - When the branch could not be read, it says so in an alert ("could not be read … This is not an empty registry").
  - When there are none, it says "No governed artifacts in this project yet".
  - When there are more than the window, it says the counts cover the listed window.
- **`ArtifactGovernanceDetail`**, in the detail pane, shows:
  - kind, format, origin, model and author;
  - CTD section;
  - signature in words ("Signed on v3 only; the current version (v5) is not signed");
  - human review, cited sources and the recorded hash.
  - What is not recorded says "Not recorded".
- **The header** names "N governed artifacts".
- **AnA's context** carries `governedArtifacts` (counts, or "unavailable — counts unknown, not zero") and the selected artifact's state.
- **The unbacked subtitle** "SHA-256 chained · 7-year minimum retention" is not carried, and a test pins its absence.
- **Comments:** `CmcModule.tsx` names the new location of compiled §3 artifacts, and a comment in `Vault.tsx` is updated.

### Every consumer of `documentCounts.cmcArtifacts`, moved in this change

| Consumer | Change |
|---|---|
| `server/routes/c2c/project-vault.ts` | produces `artifacts` |
| `client/src/concept2cure/v2/surfaces/Vault.tsx` (`vaultCountLabel`; AnA facts pass `documentCounts` through) | reads `artifacts` |
| `server/routes/c2c/__tests__/project-vault-document-count.test.ts` | `artifacts ?? 0` |
| `client/src/concept2cure/v2/__tests__/vaultHeaderHonesty.test.tsx` | "3 governed artifacts" |
| `client/src/concept2cure/v2/__tests__/vaultSurfaceAnaContext.test.tsx` | passthrough fixture |

- **Not changed:** historical records that pin the old field as it was then.
  - `docs/evidence/D4/2026-09-24-vault-document-count/README.md`
  - `docs/evidence/D2-VAULT-VERSIONS/2026-10-01-version-list/README.md`
  - `docs/evidence/W3/2026-09-27/**/OQ-VAULT-04.api-1.json`
  - `docs/evidence/D2-ONE-ANA/2026-10-08/ana-9-rail-goes/screens/capture-log.json`
  - lint receipts under `docs/evidence/D2-EDITOR-INTEGRATION/2026-10-18/` and `docs/publications/data-room-2026-10-14/`
- **No CI script, AnA server code or OQ script reads the field.** Searched with `grep -rn cmcArtifacts` over the repo, excluding node_modules.

### Existing tests moved with the change (intent kept)

- **`project-vault-branches.test.ts`:** the Module 3 case reads the Module 3 group of "Governed artifacts". The binds are `[7, PROJECT, 2001]`. The unanchored and empty cases name the new branch.
- **`artifacts-center-signature-staleness.test.ts`:** the organization-scope case reads the shared read's binds `[42, null, 200]`.
- **`artifacts-center-foreign-project.pglite.test.ts`:** the fixture schema gains the columns the shared read selects, and `public.actor_name`.

## Red, green, mutations

| | Result | File |
|---|---|---|
| Red at `8b3ee4b57`, before any product change (3 new suites) | 23 of 25 fail | `red.txt` |
| Green on `ca574ff80` plus this change (3 new suites and the 8 moved or neighbouring suites) | 75 of 75 pass, 11 files | `green.txt` |
| Mutations of the product code | 16 of 16 red, each reverted and hash-checked | `mutations.txt` |

**The 2 that pass at red** pin existing behaviour:
- the tree draws any folder the server sends;
- a real registry failure is a 500.

**The new suites:**
- `server/routes/c2c/__tests__/project-vault-governed-artifacts.test.ts` (11 tests, route over a mocked pool);
- `server/routes/c2c/__tests__/project-vault-governed-artifacts.pglite.test.ts` (4 tests). It proves on PostgreSQL that the read excludes:
  - archived rows;
  - another program's rows;
  - another organization's rows;
  - a project of another organization anchored to this program;
  - another organization's artifact on its own project anchored here.
- `client/src/concept2cure/v2/__tests__/vaultGovernedArtifacts.test.tsx` (10 tests).

**The mutations:**

| # | Mutation | Red in |
|---|---|---|
| M1 | organization predicate dropped | PGlite |
| M2 | archived kept | PGlite, route |
| M3 | narrowed back to `ctd_section LIKE '3.%'` | PGlite |
| M4 | projects join loses its same-organization condition | PGlite, Artifacts center PGlite |
| M5 | review on any version | PGlite |
| M6 | stale signature reads as current | route, PGlite, Artifacts center |
| M7 | unrecorded origin attributed to AnA | route |
| M8 | author not read | PGlite |
| M9 | unanchored rendered as empty | route |
| M10 | missing store swallowed | route |
| M11 | total counts the window | route |
| M12 | text order instead of section order | route |
| M13 | lane drops its unavailable state | client |
| M14 | stale shown as current on screen | client |
| M15 | unrecorded origin shown as "Drafted by AnA" | client |
| M16 | AnA told nothing over a failed read | client |

**M1 survived its first run.** Every cross-tenant row in the PGlite fixture was also excluded by the projects join. Fixture row 10 is the case only the organization predicate catches. It was added, M1 was re-run (red), and green was re-recorded. `mutations.txt` records both passes.

## Gates run (on the merged tree)

| Gate | Result |
|---|---|
| `ci:sql-interpolation` (and its selftest) | artifacts-center baseline entry removed |
| `ci:json-operator-types` | 0 findings (`metadata` is json; only json operators are used) |
| `ci:tenant-isolation:no-regression` | 0 findings |
| `ci:program-ownership-single-source` | OK |
| `ci:undefined-css-classes` | OK |
| `ci:ana-surface-context` | OK, 112 exact |
| `ci:surface-discoverability` | OK |
| `ci:launch-scope` | OK |
| `ci:fixture-fallback`, `ci:no-mock-in-prod-routes`, `ci:fabricated-identity`, `ci:server-error-leaks`, `ci:unauthenticated-fetch`, `ci:drizzle-tenant-scope` | OK |
| ESLint, the changed files | 0 errors; warnings net −1 against HEAD |
| Scoped `tsc` over the changed files and their imports | 0 errors in them |

## Keep-green suites (every existing Vault suite, server and client)

**Server: 44 of 45 files, 504 of 506 tests.**

The suites:
- `server/routes/c2c/__tests__/project-vault-*.test.ts` (10)
- `server/routes/c2c/__tests__/vault-*.test.ts`
- `server/routes/__tests__/vault-*.test.ts`
- `server/routes/__tests__/artifacts-center-*.test.ts`
- `projects-dossier`, `projects-records-current.pglite`
- `launch-scope-api-gate`, `redisRateLimiter-vault-reads-and-batch-upload`, `tenant-scope-org-guc`
- `510k-estar-attachment-export.pglite`, `company-document-actions`
- `document-placement-tools`, `recorded-downloads.contract`, `estar-vault-attachment-access.pglite`, `report-package-legal`
- `mdx-vault-admits-project`
- `server/services/vault/__tests__/vault-seal.service.test.ts`

The 2 failures are `launch-scope-api-gate.test.ts`: "out-of-scope /api/csr/jobs ← ectd-compile".
- The chain is EctdCompile → OrchestratorRunControls → CsrSourceInputControls → CsrBuildProgress.
- It was introduced by `7b209818a` (CSR slice 3), which is already in HEAD.
- None of this change's files are on that path.

**Client: 59 of 59 files, 572 of 572 tests.**

The suites:
- `client/src/concept2cure/v2/__tests__/vault*.test.tsx`, including `vaultSeals`, `vaultSearchFilters`, `vaultSurface` and `vaultSurfaceLabels`
- `adminLegalHolds`, `anaDrivesScreens`, `authoringVaultPlacementFlow`, `commitmentFulfilment`, `companyDocumentSettings`
- `filingPathNoDeadEnds`, `projectDocumentDisposition`, `projectHomeEvidenceFiles`, `workbenchProjectFiles`
- `artifactsCenterStaleSignature`, `anaDrivesWave3`, `anaDrivesWave4`, `shellNav`
- `editor/__tests__/projectFiles*`, `sourceAssemblyEntry`
- `mdx/surfaces/__tests__/VaultSurface.noUnbackedClaim`, `OfficialEstarPanel.attachments`

One file (`vaultSurfaceAnaContext`) once timed out on its first test under parallel load. It passed alone in 355 ms and in the recorded green.

## Handed on (not in this slice)

- **Governed DOCX download from the artifact leaf.**
  - Reach `GET /api/artifacts-center/:artifactId/export` (`artifacts-center-routes.ts`) from Vault's detail pane.
  - The leaf's Download stays "No file to download", as it was for Module 3 leaves.
- **CSV manifest** of the artifact rows (`AdminSurfaces.tsx` `exportManifest`).
- **Versions and audit detail pane** for artifact leaves.
  - Reach `/api/concept2cure/projects/:projectId/artifacts/:artifactId/versions` and `/audit-report` (`c2c/artifacts.ts:1844,1892`), or `mdx-vault.ts:358-439`, under project route access. Choose one; do not add a third.
- **Organization-wide listing** in Vault (the Artifacts center gallery).
  - At that point, also decide what happens to `GET /api/concept2cure/artifacts` (`c2c/artifacts.ts:278`): it has no caller, and its join lacks the same-organization condition.
- **Open an artifact through `authoring.open-document`.** Today the leaf keeps the existing "Open in editor" section target.
- **AnA's hands on the branch:** Ask AnA per leaf, a `vault.focus-document` action, and retargeting the Live Drive hand-off (`V2App.tsx:675-689`) to `vault`.
- **Retiring `device-vault` and `artifacts-center`:** the checklist commit (catalogue rows, aliases, `ID_BASELINE`, tours).
- **The Artifacts center's subtitle** "Every artifact AnA has drafted" over-claims for the reason the branch is not called that. It is left for the retirement commit, which removes the screen.

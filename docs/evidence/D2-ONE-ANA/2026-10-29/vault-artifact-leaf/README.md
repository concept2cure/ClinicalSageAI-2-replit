# The Vault's governed-artifact leaf: fold F3 slice B (D2, 2026-10-29)

**Row:** D2 (`docs/LAUNCH_DEFINITION_OF_DONE.md`). The founder's direction of 2026-10-29: "We are moving most 'app' into
core functionality and away from any out of process 'app'."

**Plan:**
- `docs/design/DEVICE_FOLDS_2026-10-29.md` §F3, work items 2 and 3 (versions and audit under project route access; Ask AnA on the leaves);
- the placement map `.design/client-journey/FUNCTION_PARITY.md:672-700` ("Into Vault": from `artifacts-center` and from `device-vault`);
- slice A's "Handed on" list (`../vault-ana-draft-branch/README.md`, commit `3038bbe66`).

**The work, named for what it is:**
- *reach* the artifact's versions and audit report (`server/routes/c2c/artifacts.ts`) from the Vault's detail pane, and *complete* the versions read with each version's author;
- *reach* the governed DOCX export (`server/routes/artifacts-center-routes.ts`) from the leaf;
- *converge* the Artifacts center's CSV manifest and the Vault's onto one builder;
- *reach* the editor through the `authoring.open-document` directive the Artifacts center already rides;
- *complete* AnA's hands on the leaf: Ask AnA, and `vault.focus-document` beside `vault.search` and `vault.open-folder`.

Nothing here is built beside an existing implementation. No route was added.

## What already exists

Read at `eeaf0ac39`; line numbers are at that commit.

### The target

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| The Vault | `client/src/concept2cure/v2/surfaces/Vault.tsx` | Reads `GET /api/c2c/project-vault/:id`. Since slice A, the tree has a "Governed artifacts" branch; an artifact leaf's detail pane shows `ArtifactGovernanceDetail`. | The artifact leaf showed no versions and no audit (`:2236`, "handed on to the next slice"). Download said "No file to download" (`:2334`). Open in editor sent the section and title through `editorTarget`, the authored-section channel. Ask AnA sent the generic "Summarize …" prompt (`:2298`). |
| The branch | `client/src/concept2cure/v2/surfaces/VaultGovernedArtifacts.tsx` | The lane (status breakdown) and the leaf's governance. | No manifest, no reads. |
| AnA on the Vault | `shared/navigation/surface-actions.ts:253-281` | `vault.search`, `vault.open-folder`. | Nothing selects a document. |

### The reads the slice could reach (slice A named both; this slice picks one)

| Read | Path | Binding | What it returns | Honest states |
|---|---|---|---|---|
| **Versions, project-bound** | `server/routes/c2c/artifacts.ts:1844` `GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/versions` | `authorizedProjectId` (`artifact-project-scope.ts`, PF-17): the URL's project through `resolveCmcArtifactProject` (takes the program UUID the Vault holds), strict, then `verifyProjectAccess` on that project; `loadProjectArtifact` by artifact, organization **and** project. | Every version, newest first: version, content, hash, change description, `createdById`, date. | Failure: 500. Not this project's: 404. |
| **Audit report, project-bound** | `server/routes/c2c/artifacts.ts:1892` `GET …/audit-report` | The same. | Versions, signatures (signer, role, meaning, date), provenance events (source lineage, generation lineage, exports), and `verifyIntegrityChain`'s verdict with its scope. | Failure: 500. **Each GET records an `audit_report_export` provenance event** (`:1941`). |
| Provenance, project-bound | `server/routes/c2c/artifacts.ts:1623` `GET …/provenance` | The same. | A superset of the above. | Each sub-read is wrapped in `safeQuery(…, [])`: a failed versions or events read returns an empty list. Not usable here for that reason. |
| Versions, organization-only | `server/routes/mdx-vault.ts:374` `GET /api/mdx/vault/:artifactId/versions` | Organization only; no project. | Version rows. | A missing versions table (42P01) is answered as an empty list (`:405`). |
| Audit, organization-only | `server/routes/mdx-vault.ts:428` `GET /api/mdx/vault/:artifactId/audit` | Organization only. | `audit_logs` rows recorded against the artifact's two ids (`readAuditEvents`), limit 5. | 42P01 is a 503. |

### The other pieces the task names

| Piece | Path | What it does | What it does not do |
|---|---|---|---|
| Governed export | `server/routes/artifacts-center-routes.ts:217-373` `GET /api/artifacts-center/:artifactId/export` | Org-scoped read; refuses empty content (409); refuses without an active signature or approve decision on the current version where the export-review gate is on (403 `HUMAN_REVIEW_REQUIRED`); records the download before delivery (`sendAuditedDownload`, 503 `UNAUDITED_EXPORT_REFUSED` when it cannot). | Not project-bound: the artifact id and organization decide. |
| The Artifacts center's manifest | `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx:1561-1580`, `csvCell` `:1410` | Name, kind, format, size, model, version, signed (four states in words), project, updated. | Its own copy of the CSV escape beside `download.ts:87` `toCsv` ("Four surfaces had written this same escape-and-join by hand"). No section, status, origin, author, review, sources or hash. |
| Open in the editor | `AdminSurfaces.tsx:1726` | `resolveSurfaceAction('authoring.open-document', { title })` then `applySurfaceAction`; an unresolvable title lands on the editor. The editor resolves the title against its own list (`DocumentWorkbench.tsx:2656`), with honest misses. | — |
| AnA focuses an artifact | `shared/navigation/surface-actions.ts:625` `artifacts-center.focus-artifact`; handler `AdminSurfaces.tsx:1444` | Exact name, then unique containment, honest misses. | Only in the gallery. |
| The refusal classifier | `client/src/concept2cure/mdx/hooks/useFetchJson.ts` `readFailureFor`, `describeReadFailure` (`d1f04c379`) | Tells not-found, unchecked, not-enabled, out-of-release, no-organization, role and signature apart from a failed read. | — |
| The shared read | `server/services/artifact-registry-read.ts` (slice A) | One query for both screens. | Each route formatted size, status and section its own way: `formatBytes` in the Artifacts center, `artifactLeafStatus` and the section rule in `project-vault.ts`. |
| The module gate | `server/services/entitlements/api-prefix-map.ts:44` `buildPrefixMap`, `server/middleware/moduleEntitlementGate.ts` | A path is served when the organization holds any module that claims its longest prefix. | `/api/artifacts-center` was claimed by `artifacts-center` alone; `/api/concept2cure/projects` by `project-home` and `conversation-thread`, which have no catalog row, so under `MODULE_ENFORCEMENT=enforce` it is refused to every organization (`../core-project-record-gating/README.md`, "Left as found"). |

### Searches run

- `concept2cure/projects/[^'"]*artifacts`, `artifacts/:artifactId/versions`, `/audit-report`, `/versions` and `mdx/vault/` across `client/src`: the c2c per-artifact reads have no client caller except `review-record/export` (ReviewThreads) and the list (InsightsCatalogPanel); `/api/mdx/vault/:id/versions` and `/audit` are called by `mdx/hooks/useVault.ts` only.
- `artifacts-center` across `server`, `shared` and `client/src`: the route file, its mount (`register-regulatory-routes.ts:362`), the registry entry, the launch-scope app, `navigation/index.ts:105`, `surface-actions.ts:625`, `V2App.tsx:697-708` (Live Drive hand-off) and `AdminSurfaces.tsx`.
- `toCsv`, `downloadCsv`, `csvCell` across `client/src`: one canonical writer (`download.ts`), four callers; `csvCell` only in `AdminSurfaces.tsx`.
- `authoring.open-document` across `shared` and `client/src`: the registry, the editor's handler, the tour, `AdminSurfaces.tsx`.
- `readFailureFor`, `describeReadFailure`: `useFetchJson.ts` and its callers.
- `focus-document`, `focus-artifact`, `vault.` in the registry and `client/src`.
- The writers of the hash the leaf shows: `module3-convergence-service.ts:654` (`createSourceHash` over the narrative and section key, not SHA-256 of the stored text) and `mdx-imports.ts:364` (the source file's SHA-256 beside empty content).
- Deleted history: `git log --all --diff-filter=D --format=%h -- '*rtifactManifest*' '*artifact-manifest*' 'client/**/surfaces/Vault*.tsx' '*VaultArtifact*' '*vault-artifact*'`: nothing.

## The choice: `c2c/artifacts.ts`, not `mdx-vault.ts`

1. **Bound by organization and project already.** `authorizedProjectId` + `loadProjectArtifact` (PF-17) take the Vault's program UUID through the same spine resolver the branch uses (`resolveCmcArtifactProject`), decide access on that project, and load the artifact only when it is that project's. `mdx-vault.ts`'s two reads check the organization only.
2. **Reachable from a Vault for every client.** `/api/mdx/vault` is claimed only by `device-vault` (`ui-surface-registry.ui-v2.ts:530`), the surface this fold retires, so under enforcement a non-device organization's Vault would be refused it.
3. **Honest failures.** The c2c versions read answers a failure as a 500; `mdx-vault.ts` answers a missing versions table as an empty list.
4. **One provenance.** The audit report reads the artifact's own versions, signatures and provenance events, and states the hash-chain verdict with its scope.

The cost, and how it is met: the audit-report GET records each read as an `audit_report_export` provenance event. If the pane read it on selection, every click on a leaf would write a record, and the report's own export history would fill with views. So the pane reads it **only when a person asks**, and says so before they do: "Reading the report generates it, and that is recorded in the artifact's provenance." Versions, which record nothing, are read on selection. `/provenance` was not used: its `safeQuery` fallback turns a failed sub-read into an empty list.

No third read was added.

## What changed

### Server

- **`server/routes/c2c/artifacts.ts`, `GET …/versions`:** each version carries `createdBy`, the author's name as the tenant may show it, through `resolveActorNames` / `actorLabel` (the resolver this router already uses for reviewers), or "user <id>". A name lookup that fails fails the read (500), never an unnamed list. Nothing else in the route changed.
- **`server/services/artifact-registry-read.ts`:** `artifactCtdSection`, `artifactRegistryStatus` and `formatContentBytes`, **moved, not copied**: the section rule and `artifactLeafStatus` from `project-vault.ts`, `formatBytes` from `artifacts-center-routes.ts`. Both screens now say a row's section, status and size the same way.
- **`server/routes/artifacts-center-routes.ts`:** each gallery row also carries `ctdSection`, `status` (the Vault's vocabulary: locked is final), `origin`, `author` and `contentHash`, all from the shared read it already ran. Existing fields are unchanged.
- **`server/routes/c2c/project-vault.ts`:** an artifact leaf carries `sizeLabel`, its stored content's size, said as the Artifacts center says it.

### The module gate: one shared claim

- **`shared/constants/ui-surface-registry.ts`:** `vault` also claims `/api/artifacts-center`, with a dated note (a86ed04ed's and 66d688db9's method). The Artifacts center keeps its claim.
- **The whole map:** `green/prefix-map-diff.txt`. 284 gated prefixes before and after (HEAD `eeaf0ac39`'s registry against the working tree); one row changes, `/api/artifacts-center` gains `vault` and loses nothing.
- **What a Vault-only organization can now reach and could not before (under enforcement):**

  | Route | What it is | Role gate | Who calls it |
  |---|---|---|---|
  | `GET /api/artifacts-center` | The organization's gallery (`readArtifactRegistry`, organization-bound, LIMIT 200) | None: a read of the caller's own organization | The Artifacts center |
  | `GET /api/artifacts-center/:artifactId/export` | The governed DOCX/TXT | The export-review gate (an active signature or an approve decision on the current version, where enforced) and an identified user; recorded before delivery | The Artifacts center; now the Vault's leaf |

  Neither is a write. No other route is mounted under the prefix.
- **`/api/concept2cure/projects` is not claimed by the Vault.** See "Declined: the `/api/concept2cure/projects` claim" below.

### AnA

- **`shared/navigation/surface-actions.ts`:** `vault.focus-document` (document title, or an exact section code). The Vault's counterpart of `artifacts-center.focus-artifact`, over every leaf of the tree. It only selects.
- `ID_BASELINE` is unchanged (112, exact): the Vault already published.

### Client

- **`client/src/concept2cure/v2/artifactManifest.ts` (new):** the governed-artifact manifest, one builder. It writes through `download.ts` `downloadCsv` / `toCsv`, the canonical CSV writer, so `AdminSurfaces.tsx`'s `csvCell` (a fifth hand-rolled escape) is deleted. Columns: Name, Artifact ID, CTD section, Kind, Format, Origin, Model, Author, Status, Version, Signed (the Artifacts center's four-state wording, unchanged), Human review, Cited sources, Recorded hash, Stored content size, Project, Updated. What a row does not record is written "Not recorded" (a missing section, "None"). A status is written with the Vault's label where it has one, else as the row records it: the Artifacts center lists archived rows, and "Status unavailable" would misstate a recorded "archived".
  - The Artifacts center's columns grew from 9 to 17 and "Size" is now "Stored content size": it was always the stored text's size, never a rendered file's, and it sits beside a Format column that says DOCX. Rows end with CRLF (RFC 4180, `toCsv`) instead of LF.
- **`AdminSurfaces.tsx`:** `exportManifest` calls the shared builder; the gallery row type gains the five fields.
- **`VaultGovernedArtifacts.tsx`:**
  - `ArtifactVersions`: every version, newest first: version, date (UTC), author, current version, the version the signature covers, change description ("No change description recorded" when none), hash.
  - `ArtifactAuditReport`: read on request (above). The version-hash verdict with the server's scope sentence; for a composed or imported artifact, why the comparison cannot speak to it (its writer records a hash of its inputs, or of the source file); signatures; generation, source and export events; when it was generated.
  - Both: loading, a refusal through `readFailureFor` / `describeReadFailure` ("This artifact was not found in your organization, so the version history was not read"; "This feature is not enabled for your organization, so …"), and a genuine failure as an error ("… could not be read. Try again. Nothing is listed rather than an incomplete record."), with Try again only where it can change the answer. Never an empty history.
  - `fetchGovernedArtifactDocx` and `artifactDownloadRefusal`: the export through `apiRequest`; each refusal in words: no recorded review or signature on the current version; the download could not be recorded, so nothing was sent; no content to export yet; a session that expired; anything else through the classifier ("not enabled for your organization", "your role cannot do this"); a genuine failure.
  - `governedArtifactManifestRows`, `artifactAskPrompt`; the lane's **Export manifest** button; "Stored content" on the governance block.
- **`Vault.tsx`:** the artifact leaf's detail pane mounts the versions and the audit report; **Download DOCX** reaches the export and reports a refusal in the banner uploads use; **Open in editor** rides `authoring.open-document` by title; **Ask AnA** asks about this artifact by name, section and version; the `vault.focus-document` handler (`findNamedVaultDocument`: exact title, then exact section code, then a unique partial title; several matches are named, never guessed); four lines added to AnA's available actions.
- **`fixtures/vault-data.ts`:** a comment: `sizeLabel` on an artifact is its stored content's size.

## Declined: the `/api/concept2cure/projects` claim (main, 2026-10-29)

The leaf's versions and audit report live under `/api/concept2cure/projects`. A `vault` claim on that prefix was considered and declined:

- **Measured:** 97 routes under the prefix, 48 reads and 49 writes, in 14 of the 16 routers mounted at `/api/concept2cure` (`found/routes-under-the-two-prefixes.tsv`, from `tools/routes-under-prefixes.ts.txt`: a static read of each route, its middleware, gate markers in its handler, and the `ci:launch-scope-api` walk's callers). A role gate was found on 4 of the 49 writes: `PUT …/artifacts/:artifactId/status` (re-authentication, signing authority, signed act) and `PUT`, `PATCH …/ownership-preferences` and `DELETE /projects/:id` (`projectRecordAdmission(true)`). The others check project access, or nothing. 12 of the 97 paths are called by a launch or shell screen, two of them the Vault leaf's versions and audit report. The marker list is in the tool; a gate in a helper the handler calls by another name is not seen, so "no role gate found" is a lead for review, not a finding.
- **Today, under enforcement,** none of the 97 is reachable by anyone who is not a master admin: no longer prefix under it is claimed, and its two claimants have no catalog row, which `canAccessModule` answers "does not exist". A Vault claim would open all 97 to every Vault holder, which in practice is every organization (`vault` is a launch grant).
- **So, under enforcement,** the leaf's versions and audit read are refused, and the leaf says so: "This feature is not enabled for your organization, so the version history was not read." That is the answer Project home's unified work gets from the same prefix today. Where enforcement is off or reporting, they are served. The gate test pins the refusal, and the leaf's suite pins its words.
- **Found on the way, reported (not touched; main has another agent on it):** `GET` and `PUT /api/concept2cure/projects/:projectId/cmc` (`server/routes/c2c/program-twin.ts:644`, `:668`) read and write `projects` by integer id with no organization predicate, no project-access check and no role gate; `GET …/context` (`:705`) reads the same way. Whether row-level security on `projects` stops a cross-organization read or write on the request's connection was not determined here.

## Honest states

| State | What the leaf shows |
|---|---|
| Versions loading | "Reading the version history…" |
| Versions refused (404, 403 module gate, role, …) | The refusal in words; no Try again for an answer that a retry cannot change |
| Versions failed | "The version history could not be read. Try again. Nothing is listed rather than an incomplete record." and a Try again button |
| No versions recorded | "The registry records no versions of this artifact." (only from a successful read) |
| Audit report not asked | What it holds, and that reading it is recorded |
| Audit report failed / refused | As for versions; never "No signatures recorded" |
| Hash chain broken | "Not intact: <the server's reason>" and its scope |
| Download refused | "<title> was not downloaded — <why>." in the banner |

## Red, green, mutations

| | Result | File |
|---|---|---|
| Red at `6b70fd0a4`, before any product change (5 new or extended suites) | client 18 of 18 fail; server 7 of 23 fail, and 3 of 6 in the gate file once its requests were named | `red.txt` |
| Green on the working tree over `eeaf0ac39` | 41 of 41, 5 files | `green.txt` |
| Mutations of the product code | 26 of 26 red, each restored and hash-checked | `mutations.txt` |

**What passes at red, and why.** The server cases that pass at `6b70fd0a4` pin what must not change: the existing slice A leaf cases (11), a version read of another project's artifact is a 404, an Artifacts-center-only organization is served the export and refused the versions read, and an organization holding neither module is refused. The gate file's case "a Vault-only organization is refused the versions and audit read" was written after main's decision; it is red under M25. `red.txt` records two edits made to the tests after the run, and why each keeps the red honest.

**The new suites:**
- `client/src/concept2cure/v2/__tests__/vaultArtifactLeaf.test.tsx` (19 cases): versions (list, failure, refusal, not enabled), the audit report (read only on request, broken chain, failure), the download (served, review refusal, module-gate refusal, unrecorded export), the manifest (the Vault's rows, and the Artifacts center through the same builder and columns), the editor directive performed by the editor's handler, Ask AnA, and `vault.focus-document` (in the registry, selects, honest misses, AnA told).
- `server/middleware/__tests__/vault-artifact-leaf-gate.test.ts` (5 cases, the gate production builds): the leaf's calls as the launch-scope walk reads them, a Vault-only organization is served the export and refused the versions and audit read, an organization with neither is refused all three, and only the vault row gains.
- `server/routes/__tests__/artifacts-center-manifest-fields.test.ts` (2), `server/routes/c2c/__tests__/artifact-versions-name-their-author.test.ts` (3), and one case added to `project-vault-governed-artifacts.test.ts` (the leaf's stored content size).

**The mutations:**

| # | Mutation | Red in |
|---|---|---|
| M1 | the leaf reads versions from the organization-only device-vault read | client (4), gate (walk) |
| M2 | a failed versions read rendered as an empty history | client |
| M3 | every refusal worded as a failed read | client |
| M4 | the audit report read on selection (a provenance record per click) | client |
| M5 | a broken hash chain shown as intact | client |
| M6 | a failed audit read shown as an empty report | client |
| M7 | the review-gate refusal said as "your role" | client |
| M8 | a module-gate refusal of the download said as an outage | client |
| M9 | an unrecorded export said as a generic failure | client |
| M10 | the artifact leaf keeps "No file to download" | client (4) |
| M11 | the Artifacts center keeps its own manifest copy | client |
| M12 | the manifest says a stale signature is current | client |
| M13 | the manifest attributes an unrecorded origin to AnA | client |
| M14 | Open in editor navigates without the directive | client |
| M15 | Ask AnA sends the generic prompt | client |
| M16 | `vault.focus-document` guesses the first of several matches | client |
| M17 | `vault.focus-document` not handled | client (2) |
| M18 | a failed author lookup swallowed into an unnamed list | server (versions) |
| M19 | the versions read names no author | server (versions) |
| M20 | the gallery row passes the raw status (locked, not final) | server (Artifacts center) |
| M21 | the gallery row drops the recorded origin | server (Artifacts center) |
| M22 | the Vault leaf carries no stored content size | server (project vault) |
| M23 | the vault claim on `/api/artifacts-center` removed (HEAD's registry) | gate (Vault-only refused the export; the pin) |
| M24 | the claim moved off the Artifacts center instead of shared | gate (Artifacts-center-only refused; the pin) |
| M25 | the vault also claims `/api/concept2cure/projects` (the widening declined) | gate (versions served; the pin) |
| M26 | a recorded status without a Vault label written as "Status unavailable" | client |

## Gates run

On the working tree over `eeaf0ac39`:

| Gate | Result |
|---|---|
| `ci:ana-surface-context` | OK, 112 of 117, baseline 112 exact (unchanged: the Vault already published) |
| `ci:surface-discoverability` | OK, 119 renderable surfaces |
| `ci:sql-interpolation` | OK, no new interpolation (no SQL was written) |
| `ci:undefined-css-classes` | OK (only existing classes are used) |
| `ci:launch-scope` and its selftest | OK |
| `ci:launch-scope-api` and its selftest | OK, 544 paths, none refused. At `6b70fd0a4` it was red on `/api/csr/jobs` only (`7b209818a`); upstream fixed that by `eeaf0ac39`. |
| ESLint, the changed and new files | 0 errors. Warnings 52 at HEAD on the changed files, 52 after; the new files add none |
| Scoped `tsc` (the changed files and their imports, `tsconfig.json`'s options) | 0 errors in them. 11 elsewhere, all ambient declarations a scoped config does not include (CSS modules, `import.meta.env`, untyped `jsonwebtoken`, `qrcode`, `metrics.js`), in files this slice does not touch |

## Keep-green suites

**Client: 61 of 61 files, 511 of 511 tests.** Every `client/src/concept2cure/v2/__tests__/vault*` suite (including upstream's `vaultSeals` from `459ad5132`), `anaDrivesScreens` and `anaDrivesWave2`–`6`, `surfaceContext`, `surfaceContextIds`, `surfaceContextLoop`, `artifactsCenterStaleSignature`, `mdx/surfaces/__tests__/VaultSurface.noUnbackedClaim` and `.noInventedRecord`, `adminLegalHolds`, `authoringVaultPlacementFlow`, `shellNav`.

**Server: 68 of 68 files, 1006 of 1006 tests.** `server/routes/c2c/__tests__/project-vault-*` (including both PGlite suites), `vault-*`, `artifact-*` and `c2c-router.parity`; `server/routes/__tests__/artifacts-center-*` (including the foreign-project PGlite suite) and `vault-*`; the module-gate suites (`moduleEntitlementGate`, `moduleEntitlementMasterAdmin`, `launch-scope-api-gate`, `launch-scope-device-features`, `core-project-record-gating`, `engineering-risk-design-controls-gate`, `ivd-board-under-diagnostics`, and the new gate file); all 18 suites in `server/services/entitlements/__tests__`; `shared/navigation/__tests__/surface-actions`; `tests/ui-readiness/ui-surface-registry`; upstream's `server/services/vault/__tests__/vault-archive-builder` and `vault-seal.service`.

The lists are at the end of `green.txt`.

## Found, not fixed

- **`GET /api/concept2cure/artifacts`** (`server/routes/c2c/artifacts.ts:279`), the organization gallery slice A flagged:
  - rows are filtered by organization (`concept2cure_artifacts.organization_id`), so another organization's artifact is never listed;
  - its `projects` join is on `projects.id` only, so a row whose `project_id` names another organization's project shows that project's name (the PF-03 defect the Artifacts center's read fixed);
  - it lists archived rows, has no project-access filter (an artifact of a project the member cannot open is listed by title), and is capped at 200;
  - no client or AnA caller (searched `concept2cure/artifacts['"\`?]` across `client/src` and `server/services/ana`); claimed by `conversation-thread` and `protocol-dev`.
- **`…/cmc` and `…/context`** in `program-twin.ts`: above.
- **`/api/csr/jobs`** red in `ci:launch-scope-api` at `6b70fd0a4` was fixed upstream by the time of `eeaf0ac39` (ectd-compile now claims it).

## Handed on: what the checklist commit retiring `device-vault` and `artifacts-center` still needs

The common checklist (`docs/design/DEVICE_FOLDS_2026-10-29.md`), applied to these two ids:

1. **Delete the sources** after a grep for importers: `ArtifactsCenter` and its helpers in `AdminSurfaces.tsx` (`signatureState`, `manifestRow`, `downloadArtifact` with its `window.alert`, `ARTIFACT_FMT` if nothing else uses it) and its subtitle "Every artifact AnA has drafted"; `mdx/surfaces/VaultSurface.tsx`, `mdx/hooks/useVault.ts`, `mdx/data/vault.ts` if unimported; their tests (`artifactsCenterStaleSignature`, `VaultSurface.noUnbackedClaim`, `VaultSurface.noInventedRecord`) and this slice's Artifacts-center manifest case in `vaultArtifactLeaf.test.tsx`.
2. **`mdx/MdxSurfaceHost.tsx`:** `device-vault`'s meta entry (`:150`), its publish (`:383`) and its switch case (`:429`).
3. **Ids and claims:** `device-vault` out of `mdx/surfaceIds.ts:37`, `v2/surfaceViews.ts:453`, `ui-surface-registry.ui-v2.ts` (its `/api/mdx/vault` claim goes with it); `artifacts-center` out of `surfaceViews.ts` and `ui-surface-registry.ts`. `/api/artifacts-center` is already the Vault's. `/api/atoms`, the Artifacts center's other claim, has no client caller and would become unclaimed. `launch-scope-device-features.test.ts`'s `HOOKS` list changes.
4. **`v2/registryModel.ts`:** aliases `artifacts-center` → `vault` and `device-vault` → `vault`; both off `NAV_GROUP_OF`, `NAV_HIDDEN`, `SEGMENTS.focus` (`device-vault` at `:667`), `SURFACE_ACTIONS` and `SEGMENT_MODULES`.
5. **`launch-scope.ts`:** `artifacts-center` out of the Vault app's surfaces and modules, and out of `LAUNCH_MODULE_IDS` (a launch grant today); `device-vault` out of the Projects app and `mdx-project-features.ts`; guards in `launch-scope.test.ts`.
6. **Catalogue (Rule 1):** `db/migrations/20260810_reconcile_module_catalog.sql`: artifacts-center at `:248` (keep-list) and `:366` (upsert), device-vault at `:276` and `:371`, and the packaging rows in `20260823_module_catalog_commercial_packaging.sql`, amended in place with a dated header; fresh-database and replay cases in `catalog-module-claims.contract.test.ts`.
7. **AnA:** the `artifacts-center` target (`shared/navigation/index.ts:105`) stays and resolves through the alias. `artifacts-center.focus-artifact` (`surface-actions.ts:641` in the working tree) is removed: `vault.focus-document` is its replacement on the target, live since this slice.
8. **Tours** (`shared/navigation/demo-scripts.ts`) that stop on either id.
9. **CI:** `ID_BASELINE` 112 → 110 (both publish: `AdminSurfaces.tsx:1547`, `MdxSurfaceHost.tsx:383`); `check-launch-scope-api.ts` `REAL.components`; `dump-v2-surfaces.spec.tsx`; `ProjectMdxWorkflow.test.tsx` `NO_PROJECT_DOOR`.
10. **A fold guard** on `foldDeviceTasks.test.ts`'s model, red first, then mutations.
11. **The gates** the checklist lists.

Specific to this fold, still open:
- **The Live Drive hand-off** (`V2App.tsx:697-708`, `followWork`) still stashes `{ artifactId }` for `artifacts-center`. Retargeting it to `vault` needs the Vault to read that nav param and select the leaf whose `artifact.artifactId` matches; `vault.focus-document` selects by title, not by id.
- **The organization-wide listing.** The parity map's first row carries "an organisation-wide listing" into the Vault. The Vault has none for artifacts: its "Accessible projects" search covers uploads only. Retiring the gallery without one drops it; that is a decision before the checklist commit, not a cleanup.
- **`GET /api/artifacts-center`** loses its only screen when the gallery goes. Keep it for an organization-wide listing, or delete it then. The export route stays: the Vault calls it.
- **`server/routes/mdx-vault.ts`** loses its only client (`useVault.ts`). Its versions and audit reads are superseded for the Vault by the c2c reads above; under zero duplication they go with the screen.
- **The `/api/concept2cure/projects` claim** stays a decision of its own (above), after `…/cmc` is organization-scoped.

## Files

**Product:**
- `client/src/concept2cure/v2/artifactManifest.ts` (new)
- `client/src/concept2cure/v2/surfaces/VaultGovernedArtifacts.tsx`
- `client/src/concept2cure/v2/surfaces/Vault.tsx`
- `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx`
- `client/src/concept2cure/v2/fixtures/vault-data.ts` (a comment)
- `server/services/artifact-registry-read.ts`
- `server/routes/artifacts-center-routes.ts`
- `server/routes/c2c/project-vault.ts`
- `server/routes/c2c/artifacts.ts` (the versions read only)
- `shared/constants/ui-surface-registry.ts` (the vault entry only)
- `shared/navigation/surface-actions.ts` (`vault.focus-document`)

**Tests:**
- `client/src/concept2cure/v2/__tests__/vaultArtifactLeaf.test.tsx` (new)
- `server/middleware/__tests__/vault-artifact-leaf-gate.test.ts` (new)
- `server/routes/__tests__/artifacts-center-manifest-fields.test.ts` (new)
- `server/routes/c2c/__tests__/artifact-versions-name-their-author.test.ts` (new)
- `server/routes/c2c/__tests__/project-vault-governed-artifacts.test.ts` (one case added)

**Evidence:** this README, `red.txt`, `green.txt`, `mutations.txt`, `green/prefix-map-diff.txt`, `found/routes-under-the-two-prefixes.tsv` (and its summary), `tools/routes-under-prefixes.ts.txt`, `tools/mutate.py.txt`, `tools/mutation-spec.json`.

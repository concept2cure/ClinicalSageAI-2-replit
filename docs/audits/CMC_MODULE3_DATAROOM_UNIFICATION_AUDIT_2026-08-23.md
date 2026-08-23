# CMC ↔ Module 3 ↔ Data Room Unification — Forensic Audit (2026-08-23)

Scope: why the CMC module is absent from the left rail, where the UI stops
reflecting the underlying code base, and where the CMC → IND Module 3 →
data-room flow breaks. Every claim carries a file path. Companion plan:
`docs/plans/CMC_MODULE3_DATAROOM_UNIFICATION_WORK_ORDER_2026-08-23.md`.

## 1. What already exists (and is real)

The CMC module is not missing — it is a mature, live surface that is
deliberately hidden and structurally cut off downstream.

- **Client**: `client/src/concept2cure/v2/surfaces/CmcModule.tsx` renders a
  nine-tab Module 3 operating system (Overview, Substance & product,
  Specifications, Stability, Batch records, Change control, Quality by design,
  Module 3 build, Program records). Every endpoint it calls is real and
  mounted; there is no fixture data in these surfaces; zero-row branches
  triage loading vs error vs genuinely-empty (`cmcRegisters.tsx:280-289`).
  Governed actions (spec approve, batch release, §3.2 section approve) verify
  re-auth server-side (`specificationRoutes.ts:337`, `batchRecordRoutes.ts:323`,
  `module3OperatingSystemRoutes.ts:574`).
- **Server**: two layered stores bridged by a write-through pipeline.
  Register layer (`shared/cmc-schema.ts`, `shared/schema.ts:3760`) served by
  `server/api/cmc/routes.ts` and siblings; canonical "Module 3 OS" layer
  (`shared/schema/cmc-os.ts`: `cmc_source_objects`, `cmc_module3_sections`,
  lineage, contradictions, section versions, provenance). Register saves fire
  `writeThrough*` (`server/services/cmc-write-through.ts`) which upserts
  canonical sources and marks impacted sections stale.
  `POST /api/cmc/module3-os/compile/:projectId` composes the 17 §3.2.S/§3.2.P
  sections deterministically (`server/services/module3Composer.ts:719`) and
  auto-bridges each into a governed `concept2cure_artifacts` draft
  (`server/services/module3-convergence-service.ts:362`).
- **IND side**: a full lifecycle suite (`server/services/ind-lifecycle/`) and a
  real eCTD assembler (`server/services/ectd/assemble-from-core.ts`) over the
  canonical spine `submissions → ectd_sequences → submission_leaves`.
- **Entitlements**: the rail is gated on real license state
  (`server/services/entitlements/navigation-entitlements.ts`, commit 24f6431f).
  The `cmc` catalog row exists and is unrestricted
  (`db/migrations/20260810_reconcile_module_catalog.sql:215`, `tiers []`), so
  every org resolves entitled via source `included`.

## 2. Finding N1 — CMC is deliberately hidden from the left rail

The rail (`client/src/concept2cure/v2/Shell.tsx:110-330`) renders four
hardcoded arrays from `client/src/concept2cure/v2/registryModel.ts`:
`RAIL_CORE` (:93), `RAIL_SPECIALIST` (:101), `RAIL_EXPLORE` (:106),
`RAIL_QUICK` (:114). `'cmc'` appears in none of them and is explicitly listed
in `NAV_HIDDEN` (:149, "reachable via ⌘K/deep-link but intentionally not rail
entries"). Entitlements are NOT the blocker: were a rail entry added,
`Shell.tsx:175-176` would gate it correctly with no server work.

Reachability today is secondary-only: deep link `/concept2cure/cmc`
(`surfaceViews.ts:358`), ⌘K palette, the biopharma Home quick action
(`registryModel.ts:958`), the Home module-card grid (`registryModel.ts:614`),
and ProjectHome's workspace tools grid (`ProjectHome.tsx:842`). A CMC user has
no persistent wayfinding affordance while on any other surface.

## 3. Finding N2 — the integer/UUID spine seam silently severs CMC from its artifacts

`concept2cure_artifacts.project_id` is an integer FK → `projects.id`
(`shared/schema.ts:5522`). The v2 shell publishes the `regulatory_programs`
UUID as the open project (`Projects.tsx:283,600` → `window.C2C_PROJECT`), and
CMC surfaces pass it verbatim. Consequences, confirmed in code:

- `GET /api/cmc/module3-os/build-state/:projectId`
  (`server/api/cmc/module3BuildStateRoutes.ts:96-151`) compares the UUID
  against the integer column in queries 4-5 → `22P02` aborts the whole
  `Promise.all` → **500 for every wizard-created program**.
- `bridgeCompileToArtifact` (`module3-convergence-service.ts:362`) inserts the
  UUID into the integer column → throws → caught per-section as a *non-fatal
  warn* (`module3OperatingSystemRoutes.ts:251-255`) → **compile reports
  success while zero governed artifacts are created**.

The bridge that should join the spines already exists and is used elsewhere:
`projects.regulatory_program_id` via
`server/services/c2c/program-project-anchor.ts` (`resolveProgramProjectAnchor`)
— exactly how `server/routes/mdx-vault.ts:136-150` filters artifacts per
program. The CMC read/write paths never call it.

## 4. Finding N3 — Module 3 output never reaches the IND submission build

The CMC pipeline terminates at governed artifacts. Nothing after the
fail-closed export gate (`module3OperatingSystemRoutes.ts:818`) creates
`submission_leaves`; `CmcModule3Build.tsx:384-388` merely navigates to the
`ectd-compile` surface. Structural blocks:

- `server/services/ectd/leaf-source-resolver.ts:55` materializes only
  `coauthor_documents`, `unified_documents`, `ctd_onboarding_documents`;
  `submission_leaves.document_id` is INTEGER while `concept2cure_artifacts`
  is string-keyed — the same dead-end
  `AuthoringPlaceIntoFiling.tsx:8-19` documents for authoring documents.
- Section-code vocabulary differs: the CMC OS keys `3.2.S.1`…`3.3`
  (`module3-convergence-service.ts:62-80`) while the spine/checklist/blueprint
  use `m3.2.S.1` codes (`services/regulatory/ind-ectd-sections.ts:1107+`).
- The IND checklist counts only `coauthor_documents`-backed leaves
  (`ind-checklist-view-assembler.ts:205`).

The proven injection pattern exists in-repo: snapshot into
`coauthor_documents` then `upsertLeaf` (the AuthoringPlaceIntoFiling seam;
`ind-lifecycle-persistence.ts` for m1/m5 leaves). No code applies it to CMC.

## 5. Finding N4 — the data room is three stores that do not see each other

- v2 Vault surface (`client/src/concept2cure/v2/surfaces/Vault.tsx`) renders
  `GET /api/c2c/project-vault/:id` (`server/routes/c2c/project-vault.ts`) —
  a read-model over `c2c_documents` + rule-pack section trees only.
- Its Upload button posts to `POST /api/vault/ingest` → `vault.documents`
  (`server/routes/vault-ingest.ts:284`) — a table the tree **never reads**;
  the comment at `Vault.tsx:166` ("the row appears in the tree because the
  server wrote it") is false in effect.
- CMC-compiled §3.2 artifacts land in `concept2cure_artifacts` only — visible
  in the MDX vault listing (`mdx-vault.ts:167-174`), invisible in the v2 Vault
  and in ProjectHome's Data room (`cre_evidence_sources`).
- CMC "Push to Vault / Module 3 doc" buttons (`CmcModule.tsx:254-278`) are
  navigation-only: `window` context + surface switch, no write.
- Upload metadata is discarded: `useVaultUpload.ts:51,63-65` hardcodes
  `documentType='OTHER'` although the ingest schema accepts module-aware types
  (`MODULE_3` etc.) and the canonical CTD taxonomy exists
  (`shared/constants/domain/vault-taxonomy.ts`).

## 6. Finding N5 — change control is triplicated and half-connected

Three stores: legacy register `cmc_change_control` (`shared/schema.ts:3760`,
feeds Module 3 via `writeThroughChangeControl`), governed `cmc_change_controls`
(`db/migrations/20260730_cmc_change_control_store.sql`, served by
`/api/cmc-changes` with deterministic SUPAC/EU classification at read time),
and dead `c2c_cmc_changes` (`20260718_cmc_changes_store.sql`, zero
readers/writers). `POST /api/cmc-changes`
(`server/services/cmc/cmc-change-control-service.ts:72-101`) never
write-throughs to the canonical layer, so a change proposed on the Lifecycle
surface never marks §3.2.P/§3.2.S stale — while the same event via the legacy
register does.

## 7. Finding N6 — capture-side coherence defects

- **Project-ID split inside one module**: Specifications/Batch/QbD/
  comparability gate on `cmcProjectUuid()` while board/build/provenance use
  the raw id (`cmcShared.tsx:30-44`); a legacy numeric program gets a working
  build tab but "Open a program" prompts on sibling tabs.
- **Unlinked capture is silent**: register creates without a UUID project omit
  `projectId` (`cmcRegisterForms.ts:166,240,405,…`), the write-through never
  fires, and no UI signal marks the record as never feeding Module 3.
- **Stability register reads org-wide while writing project-scoped**
  (`CmcModule.tsx:899` vs `:967-970`).
- **Stale honesty comment**: `CmcModule.tsx:354-355` claims server re-auth is
  a follow-up; `module3OperatingSystemRoutes.ts:574` already verifies it.
- **Dead code**: `client/src/types/cmc.d.ts` (zero importers);
  `server/api/cmc/templateService.ts`, `types.js` (no importers);
  `compileModule3Sections` (`cmc-module3-compiler.ts:67`) superseded by
  `module3Composer` in production.
- **Latent fixtures**: `ind-lifecycle-data.ts:128-152` fixture
  `INDL_SECTIONS`/`INDL_FORMS` remain the DEFAULT arguments of
  `indlReadiness` (:231-234); orphaned demo eCTD sequence data at
  `ectd/TEST001/` referenced by nothing.

## 8. Finding N7 — "one project" is a convention, not a key

Three project spines: `projects` (int), `regulatory_programs` (uuid, the one
surfaces use), `cmc_projects` (uuid, unanchored; Module 3 OS FKs dropped by
`migrations/0017_module3_project_id_fix.sql` → free TEXT). Anchor exists only
for int↔uuid (`projects.regulatory_program_id`). `window.C2C_PROJECT` is a
global set in two places and read by ~15 surfaces; it does not survive reload.
`project_modules`/`project_templates` (per-project module enablement, workspace
templates) are schema+API with zero client consumers.

## 9. Disposition

N1–N5 are corrected by the companion work order in this change set. N6 items
are corrected where they touch the CMC flow (silent-unlinked signal, stability
scoping, stale comment, dead files, fixture default args, TEST001). N7 is
partially corrected (CMC reads/writes resolve the anchor; full spine
unification and workspace templates are recorded as follow-up work with the
constraint that no new spine may be added).

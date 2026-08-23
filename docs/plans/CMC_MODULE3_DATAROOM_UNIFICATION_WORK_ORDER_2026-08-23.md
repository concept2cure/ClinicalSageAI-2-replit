# CMC ↔ Module 3 ↔ Data Room Unification — Work Order (2026-08-23)

Companion audit:
`docs/audits/CMC_MODULE3_DATAROOM_UNIFICATION_AUDIT_2026-08-23.md`.
Branch: `concept2cure-v2` (Rule 0). All work lands in this change set with
tests; every gate is shown failing on the case it exists to catch before it is
reported as working.

## 0. The CMC staff model this serves

The module must carry the actual jobs of a biotech/pharma CMC organization,
each mapped to a destination that already exists and to the AnA surface
context so the assistant meets each role at their work:

| Role | Daily object of work | Module destination | Canonical store |
|---|---|---|---|
| Process development / MSAT | process parameters, validation, scale-up, tech transfer | Substance & product → Process validation register | `process_validation` → `cmc_source_objects` |
| Analytical development | method lifecycle, validation status (ICH Q2) | Substance & product → Method library | `analytical_methods` |
| Quality control | batch testing, OOS, second-person review | Substance & product → QC testing | `qc_testing` |
| Quality assurance | batch record review + release (Part 11), spec approval | Batch records; Specifications | `cmc_batch_records`, `quality_specifications` |
| Stability program manager | studies, pull points, ICH Q1E shelf life, poolability | Stability | `stability_studies` |
| Regulatory CMC author | §3.2.S/§3.2.P compile, contradictions, approval, export | Module 3 build | `cmc_module3_sections` + governed artifacts |
| Change control manager | ICH Q12 changes, SUPAC/EU variation classification, comparability (Q5E) | Change control; Lifecycle surface | `cmc_change_control(s)`, `cmc_comparability_assessments` |

The flow they share: **capture → write-through → compile → contradiction sweep
→ Part 11 approve → export gate → placement into the IND submission spine →
organized in the data room** — with AnA context published from live readiness
at every step (`CmcModule.tsx:2114-2175`).

## 1. Authority map

| Concern | Owner (unchanged) | Change |
|---|---|---|
| Left rail | `registryModel.ts` RAIL_* + `Shell.tsx` | W1: add `cmc` to RAIL_SPECIALIST; drop from NAV_HIDDEN |
| Entitlement verdicts | `navigation-entitlements.ts` | none — `cmc` catalog row already resolves |
| CMC artifact spine join | `program-project-anchor.ts` (the ONE anchor reader) | W2: CMC paths call it via one new resolver |
| Compile → governed artifact | `module3-convergence-service.ts` | W2: resolve int spine; typed honest skip |
| Placement into submissions | `submission-service` (`upsertLeaf`) | W3: new placement service uses it; nothing else writes leaves |
| Data room read-model | `server/routes/c2c/project-vault.ts` | W4: union governed §3.2 artifacts + vault uploads as derived branches |
| Vault ingest | `vault-ingest.ts` | none — UI finally supplies `documentType` |
| Change-control write-through | `cmc-write-through.ts` | W5: governed store converges onto it |

## 2. Work items

### W1 — CMC on the left rail
`registryModel.ts`: add `{ id: 'cmc', label: 'CMC / Module 3', icon: 'beaker' }`
to `RAIL_SPECIALIST`; remove `'cmc'` from `NAV_HIDDEN`. The entry inherits
entitlement gating (`Shell.tsx:175`) and the existing admin toggle loop
(`PUT /api/module-subscriptions/cmc/toggle`). Tests: registryModel tests
assert the rail entry exists, resolves in `SURFACE_VIEWS`, and is absent from
NAV_HIDDEN.

### W2 — heal the integer/UUID artifact-spine seam
New `server/services/cmc/resolve-cmc-artifact-project.ts`:
TEXT CMC project id → integer artifact-spine id: numeric string passes
through; UUID resolves via `resolveProgramProjectAnchor`; anything else (or no
anchor) → `null` with a typed reason. Consumers:
- `bridgeCompileToArtifact`: resolve before touching
  `concept2cure_artifacts`; on `null` return a typed
  `{ skipped, reason }` the compile response reports per section —
  no more silent warn-and-drop.
- `module3BuildStateRoutes` (`build-state`, `uploaded-sources`) and
  `getModule3BuildStatus`: artifact queries use the resolved id; unresolved →
  honest `artifactRegistry: 'unanchored'` field and empty artifact facts —
  never a 500.
Tests: resolver unit tests; a route-level test proving build-state on a UUID
project id (a) 500s before the fix, (b) returns 200 + honest state after.

### W3 — placement: approved Module 3 sections → IND submission spine
New `server/services/cmc/place-module3-into-submission.ts`:
1. Re-run the final-export gate logic; refuse placement unless it passes
   (fail closed — the gate's verdict is the placement's precondition).
2. Resolve the submission spine: caller supplies `submissionId` +
   `sequenceId`; the service verifies both org-scoped and the sequence
   unlocked (`upsertLeaf` re-refuses locked — belt and braces).
3. For each approved section: snapshot the approved content into
   `coauthor_documents` (org-scoped, integer-keyed, the canonical renderable
   leaf source), then `upsertLeaf` at the m-prefixed section code
   (`3.2.S.1` → `m3.2.S.1`, matching `services/regulatory/ind-ectd-sections.ts`)
   with `documentTable: 'coauthor_documents'`, md5 checksum of the snapshot.
4. Record `cmc_provenance_events` `placed_into_submission` per section.
Route: `POST /api/cmc/module3-os/place-into-submission/:projectId` (same
mount, same auth posture as approve/export). UI: `CmcModule3Build.tsx` gains
the placement action — enabled only when the readiness verdict is
export-ready, target pickers over live submissions/sequences, server verdict
verbatim, honest partial-failure reporting.
Result: placed sections appear in the IND checklist M3 progress
(`ind-checklist-view-assembler` counts coauthor-backed leaves), the package
manifest (M3 — Quality/CMC), and the eCTD assembly.
Tests: service-level (gate refusal path first — prove it refuses an
unapproved/contradicted project; then the happy path), section-code
translation, provenance rows.

### W4 — the data room organizes CMC output by what it is
`server/routes/c2c/project-vault.ts` read-model gains two derived branches:
- **Module 3 (CMC)** — governed `concept2cure_artifacts` with
  `ctd_section LIKE '3.%'` for the program (via the anchor, the
  `mdx-vault.ts` EXISTS idiom), organized by CTD section with status/version.
- **Uploaded files** — `vault.documents` rows for the program, so the
  surface's own Upload button finally lands where the surface looks.
Both branches are honest: missing store/anchor → the branch states why it is
empty. `Vault.tsx`: upload flow passes a user-selected `documentType`
(taxonomy-backed, default OTHER) to ingest; the false comment at :166 dies.
`CmcModule.tsx` push affordances: relabel to what they do — open the data
room / Module 3 build with context — since the data now flows automatically
on compile (auto-bridge) and placement.
Tests: read-model unit tests (branch presence, honest-empty reasons,
tenant scope), upload metadata pass-through.

### W5 — change-control convergence
`cmc-change-control-service.createCmcChange`: when the request carries a CMC
project id, fire `writeThroughChangeControl` so a governed change marks
§3.2 sections stale exactly as the legacy register does. Drop table
`c2c_cmc_changes` (dead: zero readers/writers) via migration.
Tests: write-through fires with project id, does not without; the migration
drops cleanly.

### W6 — capture-side coherence
- Stability register: scope the read to the open program when one is set
  (label the org-wide view honestly when none is).
- Register creates without a linked program show the fact ("Saved to the org
  register — not linked to a program; it will not feed Module 3 until
  linked.") — signal, not block: org-scoped registers are legitimate.
- Fix stale comment `CmcModule.tsx:354-355`; delete `client/src/types/cmc.d.ts`,
  `server/api/cmc/templateService.ts`, `server/api/cmc/types.js`,
  `ectd/TEST001/`; remove fixture default args from `indlReadiness`.

### W7 — AnA applied to the staff model
Extend `ANA_SURFACE_CTX.cmc` suggestions so every role in §0 has prompt
starters grounded in its live registers (readiness facts already published).
No new chat machinery — the existing surface-context channel.

### W8 — validation
- Unit/integration suites for every new path (see per-item tests).
- Live simulation against local Postgres: seed org/user/program; drive
  capture → compile → approve → gate → place → data room via the real API as
  each §0 role; verify the IND checklist and vault read-model reflect it.
- Browser pass over the rail + CMC surfaces at 1440/1280/1024/768/430.
- Report: `docs/reports/CMC_MODULE3_DATAROOM_VALIDATION_2026-08-23.md`.

## 3. Acceptance criteria
1. CMC appears on the left rail for entitled orgs and locks correctly when an
   admin disables the module.
2. A wizard-created (UUID) program: build-state returns 200 with honest
   artifact facts; compile bridges artifacts or reports exactly why not.
3. An approved, gate-passing Module 3 places into a chosen IND sequence;
   the IND checklist M3 section statuses and package manifest show it;
   placement refuses (with the gate's verdict) when the gate refuses.
4. The v2 Vault shows CMC Module 3 artifacts organized by CTD section and
   shows uploaded files; both branches honest-empty with reasons.
5. A governed change via /api/cmc-changes marks impacted sections stale.
6. No fixture data newly reachable in governed paths; deleted dead files stay
   deleted (no importers).

# A2.10 remaining fold review

Independent review, 2026-10-26, starting source `f033cc722`. Launch row D2.
This reviews current implementation rather than interpreting historical checkboxes
as completed. Only the filing-catalogue fold is assigned to implementation in the
parallel carryover work. None of the four folds below is ready for shell removal.

## What already exists

- `client/src/concept2cure/v2/surfaces/Projects.tsx` and
  `server/routes/c2c/projects.ts` already own canonical project intake, recorded
  client/pathway/workstream filtering, scoped counts and honest readiness.
  `v2/programAction.ts`, the shared destination resolver and ProjectHome already
  select a canonical project and retain its open step. A2.1–A2.9 evidence applies
  to those functions; it does not prove the remaining legacy stores are empty.
- `mdx/surfaces/Overview.tsx` derives a separate device portfolio from
  `mdx/hooks/useMdxPrograms.ts`, which adapts `/api/regulatory-programs`.
  Its in-flight figure depends on a stage index inferred from phase or stored
  progress; its blocker count is a count of adapted `blocked` statuses, not
  an inventory of open blocker records. `mdx/components/ClientReviewZone.tsx`
  reads `server/routes/mdx-client-review.ts` over unified_tasks.
- `server/services/ana-ri/mdx-command-handlers-phase2.ts` owns the persisted
  evidence-sufficiency and reviewer-simulation commands. Their canonical guards,
  confirmation/reason requirements, audit-outcome reporting and service calls
  already exist. `server/services/ana/ana-launch-scope.inventory.json` lists
  both in the flat `commands.inScope` array. They have no executable dependency
  on device-workstream; only that inventory's historical `$note` names it as
  their surface. There is no per-surface launch-claim map to migrate.
- `v2/surfaces/CroPortfolio.tsx`, `server/routes/cro-portfolio.routes.ts` and
  **`server/services/cro/cro-portfolio-view-assembler.ts`** own the cro_clients
  engagement roster, studies, submissions, milestones, leads and contract/SOW
  rollups. The assembler is under `cro/`, not `cro-portfolio/`. Onboarding
  currently calls **POST `/api/cro/clients`**, not `/api/clients`.
  `server/routes/clients-routes.ts` separately owns client_workspaces, which is
  the Projects client filter's accepted key. These are different records.
- `v2/surfaces/MissionControl.tsx`, `server/routes/mission-control.ts` and
  `server/utils/feature-persistence.ts` own category `mission_control` in
  project_memory_entries. The bootstrap and `server/middleware/staticDataGuard.ts`
  prevent enabling its API in production. This does not establish absence of
  historic stored records or authorize deleting its characterization functions.
- `v2/surfaces/BiopharmaJourney.tsx`,
  `server/services/program-journey/program-journey-service.ts`, its GET route
  and both `db/migrations/*program_journey_store.sql` creators preserve distinct
  journey parents/stages, target labels, stage reference content and stored
  display figures. A2.9 retired HTTP writers, not these readers or records.

Searches covered the four ids, every component/route/service/table named above,
program and client keys, both AnA commands, visibility writers and consumers.
Deleted-history search (`git log --all --diff-filter=D`) found the old
DeviceWorkstream shell at `2895218b8`, useMissionControl at `440071600`, and
the earlier MissionControl page family at `77034aa5f`. No matching historical
CroPortfolio/BiopharmaJourney deletion was returned in the available checkout;
this is not full-history absence. No implementation should reconstruct those
deleted parallel owners.

## Device portfolio: partial carryover, shell retained

| Function in FUNCTION_PARITY | Current replacement / remaining proof |
| --- | --- |
| Pathway/status filters and counts | Projects and GET `/api/c2c/projects` already filter and count before paging (A2.3). Their current vocabulary/scoping must remain authoritative; do not copy the older adapter's status guesses. |
| Pathway split and health strip | Scoped pathway counts exist. In-flight and blocker figures still lack equivalent canonical facts. The old stage-index threshold/progress fallback and blocked-project count must not become submissions-in-flight or open-blocker claims. |
| Class, pathway and filing date | Recorded facts exist in canonical project read/Plan. Exact visual parity for all old card details is not established by the filter tests alone. |
| Next blocker | Projects explicitly says blockers are not assessed when list projection carries NULL. ProjectWorkPanel and Submit have scoped work/verdicts, but no proof that all old metadata blocker text is carried. |
| Owner, description, activity | ProjectHome owns verified team/description/activity. Projects has `activity` in its card projection, but not all old presentation fields render in both views. |
| Per-project Ask AnA; portfolio risk prompt | ProjectHome context and Projects prompt already reach these outcomes (A2.1/A2.3). Neither authorizes a fabricated readiness report when observations are missing. |
| Client Review Room | Still only on Overview. The existing API filters org, project_id, visibility whitelist and deleted_at. programId is echoed, not used for accepted program/PM-anchor/client access verification; missing table returns an empty room. Mounting it inside canonical ProjectHome requires scope/admission/error work first. No client_visibility writer was found. |
| Two persisted commands | Already globally classified in-scope independently of the portfolio id. Correct the historical ownership note and prove launch behavior with device-workstream removed, plus unchanged ownership/confirmation/audit regressions. This is claim clarification, not newly enabled execution. |
| Guided tours | `shared/navigation/demo-scripts.ts` still has two device-workstream stops. Retarget only with the fully qualified fold so the entire tour's expected outcomes remain true. |
| MDX alias | Already reaches Projects with the MDX filter via A2.8's shared resolver and one-time action. |
| Separate target, shell, catalogue | Retain pending the other rows. Do not remove launch or MDX_PROJECT_FEATURE_SURFACE_IDS entries yet. |
| Remembered grid/list | Optional visual preference; old localStorage access is unguarded. It is not a reason to retire functions or copy unsafe storage access. |

Useful bounded follow-up: render the existing recorded activity in both Projects
views and qualify it without inventing an activity age. A Client Review Room
relocation is larger: first require canonical accepted mapping before/after the
request, explicit unavailable states, project-id response validation and actor
change protection. Sharing/classification admission stays a separate decision.

## CRO portfolio: two distinct client stores, shell retained

| Function | Current replacement / remaining proof |
| --- | --- |
| Roster and sponsor selection | Projects filters verified client_workspaces. No cro_clients→client_workspaces relationship/migration is recorded. Aliasing now would strand the engagement roster. |
| Metrics and submission rollup | Existing assembler derives contract, study and submission figures from cro_* records. No equivalent projection in Projects/Reporting is proved. The assembler uses shared pool queries; no request-scoped migration is part of this review. |
| Lead/SOW details and studies | Persisted on cro_clients/cro_team_assignments/cro_studies, with no demonstrated home on the workspace record. |
| Regulatory submissions | cro_regulatory_submissions are not canonical submission-spine rows; a display status normalization is not a mapping. |
| Sponsor onboarding | The actual screen writes `/api/cro/clients` and captures engagement contacts. Reaching `/api/clients` in Admin would create a different record. Unification must preserve the engagement before replacing this writer. |
| Ask AnA and facts | Existing context excludes contact and free-text SOW PII. Projects' client context is not equivalent to engagement facts. |
| Target alias | Retain until all data outcomes have a proved home. External sponsor user admission is not implied. |

Bounded correction completed in this continuation: CRO_TYPE knew `medtech`,
while the form/store use `medical_device` and `diagnostic`; unknown values fell
back to Biotech. The existing screen now labels those recorded values, preserves
the medtech alias, displays unknown recorded types literally, and says Not recorded
for missing types. Own-property lookup prevents prototype names becoming labels.
Ten behavior cases check both roster and selected detail; existing content,
action and PII/context tests remain green. This does not close the fold or merge
stores. Evidence: `A2.10/pre-merge-37f2ed240/commands-and-cro.md`.

## Mission control: tenant inventory and characterization missing

| Function | Current replacement / remaining proof |
| --- | --- |
| Legacy programme list | Must inventory production category mission_control/program records, migrate with identity/provenance or prove none. A synthetic local database cannot supply that evidence. |
| Product characterization and regulatory frame | Modality/INN/route/ATC/phase/orphan/expedited facts remain legacy content. Canonical project and shared regulatory/modality owners must carry these exact recorded facts before retirement. |
| Choose/create project | Already reaches canonical Projects via OPEN_PROGRAM_SURFACE and A2.4 wizard. |
| Modality CMC section model | Shared modality/regulatory content exists; its reachable canonical CMC composition must remain inside the accepted small-molecule US IND boundary. Do not widen the CMC engine while folding navigation. |
| Readiness, severity blockers, next actions and artifacts | Legacy readiness endpoint measures only the dimensions supported by its stored artifacts/evidence and leaves others null. No canonical nine-dimension migration is authorized. Project work/documents provide some outcomes but not legacy score identity. |
| Risk, stale dependencies, decisions | Existing canonical risk/source-change/DecisionLineage owners need explicit per-record reachability evidence; no migration is established here. |
| AnA target | Retain with the shell until the legacy inventory/characterization row resolves. |

## Programme journey: reference and display facts still distinct

| Function | Current replacement / remaining proof |
| --- | --- |
| Identity and target label/date/agency | Canonical project has real identity and date; legacy journey target label and modality/pathway may be distinct. No lossless record mapping is demonstrated. |
| Nine-stage arc, agency gates, deliverables, capability map and interactions | PJ_STAGES remains one authored reference owner inside BiopharmaJourney. It can move to shared and be reached on Plan as reference, without assigning stage progress or converting suggested agency interactions into events. |
| Stage-specific Ask AnA | Existing reference prompts can be carried through ProjectHome's existing onAsk, qualified against the selected programme. Stage suggestions must not imply tools or capabilities are admitted. |
| CTD readiness and NDA door | Author's dossier and Submit provide real observations. Legacy modules JSON and NDA-cockpit fold are not automatically equivalent; preserve unknown states and entitlement/admission. |
| Review clock, predicted HAQs/confidence, contradictions, RTF risk | Stored JSON/display columns have no deterministic computed equivalence. Do not render them as engine output or recreate readiness/confidence. Founder §5.9 disposition or properly sourced engine replacement remains required. |
| Blockers, stage actions and AnA context | ProjectWorkPanel/Submit and existing project stage actions carry some functions, but no full mapping of legacy records and distinct stage vocabulary is established. |
| Journey/stage writes | Retired in A2.9, with stale calls refusing. Existing GET, services and both creators remain. Do not amend both migrations to remove stores until record/parity/admission proof resolves. |

## Disposition

Keep all four shells, targets, stores, subscription records and commercial
verdicts. Complete the filing reference fold separately. Correct the two AnA
commands' historical ownership documentation using their already-independent
flat in-scope classification, and qualify the unchanged execution safeguards.
No product risk, commercial grant, client sharing or legacy data-retirement
decision is inferred from the user's request to expand this continuation.

## Focused qualification

The existing command registry maps both names to the same handler references
with device-workstream absent from the supplied launch-surface set. Two metadata
description assertions were shown red, then pass after project wording is
clarified. The inventory executable arrays, handler bodies, dispatch, launch
function, policy, ownership guard and backing services are unchanged; hashes
and comparisons are recorded in `A2.10/pre-merge-37f2ed240/commands-source-proof.json`.

Seven command suites pass 83 cases, including cross-organization ownership,
unverifiable ownership, confirmation/reason gates, CTD-program organization,
model-supplied input exclusion and audit success/failure reporting. These are
regressions of existing behavior, not a claim of new accepted-PM-anchor checks
inside these handlers or native PostgreSQL validation.

The company-type guard was shown red with eight failures and two existing-value
passes, then all 10 cases pass. Four CRO component suites pass 17 cases total.
Safe red/green logs are archived under the A2.10 evidence folder.

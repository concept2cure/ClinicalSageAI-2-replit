# Current project journey audit

Read-only source/history audit on 2026-10-30, baseline `438287ed102ff9857938276bbe835f0ec1c11a88`. No production or test edits, runner, compiler, browser or Git mutation was performed by this reviewer. Findings below distinguish source-traced gaps from behavior demonstrated by a test; no new runtime pass is claimed.

## What already exists

- `AGENTS.md`, `CLAUDE.md`, `.design/client-journey/INFORMATION_ARCHITECTURE.md:39–104` and `HANDOFF_2026-10-26.md`: the accepted six-step project journey, specialized features within project/document work, central-service exceptions, function parity before shell removal and retained entitlement/access/signature/dispatch boundaries. The earlier five-stage proposal must not be replayed over this implementation. The map's inventory counts are dated snapshots, not a current readiness verdict.
- `surfaces/ProjectHome.tsx`, `ProjectStages.tsx`, `ProjectPlan.tsx`, `shellProject.ts`: canonical Plan/Evidence/Author/Review/Submit/Respond, work-first layout with AnA beside the current step, remembered per-tab step, a new empty project starting at Plan, explicit handoff > pending action > remembered step > default precedence, and late-step callback checks against the selected project.
- `ProjectPlan.tsx`, `PlanAssign.tsx`, `editor/IndDocumentLibrary.tsx`, `ProjectBiotechPlan.tsx`, `ProjectMdxWorkflow.tsx`: existing filing plans/templates, device and biotech plan extensions, and deliverable assignments into the existing task store. Numeric task anchors remain distinct from regulatory-program UUIDs. A task's completion does not claim deliverable completion.
- `ProjectDossier.tsx`, `filingCopyIn` in the existing authoring owners, `DocumentWorkbench.tsx`: one readiness definition and editing-copy handoff, tied to the actual filing/document that a rollup measures; module rows carry the corresponding CTD module and market lines open their own copy. Readiness is not inferred from the newest document merely tagged with that module.
- `ProjectMarkets.tsx`, `ProjectRespond.tsx`, `submissionNavTarget.ts`: exact submission/sequence/workspace handoffs, server dispatch verdict and unassessed-gate caveats; regional/document-preparation-only projects explicitly do not acquire sequence/packaging/transmission capabilities.
- `ProjectHome.StartConversation`, `ProjectConversations`, `projectThreads.ts`: the existing project composer and paginated caller-owned history, mounted outside the step switch; typing does not call another mock assistant. These implementations must be retained rather than replaced.
- `dataConnect.tsx:354–430`, `useAuthoringReadSession`, `shellProject.captureShellProjectGuard`: opt-in owned-read and visit guards already exist. The project record uses the session owner at `ProjectHome.tsx:1491–1495`. Generic reads without an owner retain prior data until their passive read effect runs.

Deleted-history search for ProjectHome/projectThreads/ProjectPlan returned prior legacy removals `2895218b8` and `e5a74a4df`, not a separate implementation to restore. Current caller/owner searches covered V2App, shellProject, the project side column, generic data read, the named plan/dossier/market owners and existing project test families.

## What changed and is already addressed

| Area | Current implementation / history evidence | Implication for further work |
| --- | --- | --- |
| Project-first experience | `b648b01bf`, `c693a7260`, `2246406e4`: six steps, Plan's work/assignments, AnA beside the open step. `ProjectStages.tsx` marks only the selected step with `aria-current=step`. | Preserve the accepted spine. Do not add another planner or mark preceding stages completed from position. |
| Navigation continuity | `2aace71d4`; `ProjectHome.tsx:1500–1523`, `shellProject.ts:102–153`; tests `projectHomeStepReturn.test.tsx`. | The chosen step survives editor/Vault returns and reload. Explicit incoming handoffs win over remembered/default state. |
| Intake, client and pathway context | `a40f48f86`, `1b4761718`, `f9c84bdf1`, `b9975a914`, `37f2ed240`: canonical creator, accepted anchor/client mappings, before-paging filters/counts and filing-reference discovery folded into the existing wizard/Plan. | Do not resurrect retired alternate creators or infer eligibility from a reference/catalog row. |
| Dossier parity | `ceea5db5a`, `43bb9b3ed`, `1744fa0c8`, `8b192f1e7`: measured section/artifact/tracking reads carried into Author. | Preserve separate data bases, source identities and unavailable states; old surfaces are not a reason to create duplicate rollups. |
| Editing-copy fidelity | `556735798`, `96ce37982`, `3a6d31f6b`; `ProjectDossier.tsx:247–324`. | Module and market rollup actions now open the filing copy they measure at the appropriate module. This older handoff need is already addressed. |
| Device submissions and reporting | `7f9720d96`, `bbe7971e5`; `ProjectMarkets.tsx` and `ProjectReportsDoor`. | A device Submit reaches its pathway assembly; project reports use the shared Reporting workspace with selected-project context. |
| Review/release reliability | History includes `99c9d972c` (review route/tasks transaction), `7091309ab` (author independence), `da57fe805` and `5df0efd37` (Vault/CSR reviewer independence at release). | These are substantial concurrent safeguards. Their production code was not line-by-line audited by this project-journey review; do not describe this source review as their new qualification. |

## Prioritized remaining findings

### 1. Same-mounted project changes do not retire the unsent project composer draft

**Priority:** high for context fidelity. **Evidence:** source trace; a focused red test is still required.

`ProjectHome.tsx:1101` stores `draft` with `useState('')`; the current side column at `1925` renders `<StartConversation productName={productName} ... />` without a project/session key. `ProjectHome` explicitly handles project changes without unmount at `1504`. A same-mounted project A → B update therefore changes the composer label while retaining A's draft. `start()` seeds `window.C2C_CONVO` and navigates, so that old text can become the new project's conversation seed.

`V2App.tsx:1151` keys normal surfaces by surface/epoch, not project id. The explicit Live Drive same-surface navigation with a program does increment its remount epoch (`:447`), so that path is protected; this is not a claim that every normal project selection leaks a draft. Test the supported shell-channel transitions and same-mounted visit directly. Existing `projectHomeStages.test.tsx:160` proves only that a draft survives step changes within a project.

**Required proof before correction:** type on A; publish B through the real shell-project channel while keeping ProjectHome mounted; verify A's textarea/value cannot appear under B or seed B's conversation. Also prove step switches still preserve the same project's draft. Reuse the existing composer and visit/session identities. No second chat or new backend is needed.

### 2. Conversation pagination and some support reads are not owned by the current project/session

**Priority:** medium/high for displayed context. **Evidence:** source trace; first-commit/late-response and actor-change tests are required.

- `projectThreads.ts:43` reads first-page threads without `DataReadOwner`. Its `older` rows reset in a passive `[pid]` effect (`:53–60`), and `ProjectConversations` is unkeyed at `ProjectHome.tsx:1926`. Before passive effects, old first-page/older thread rows can be rendered on a new project's commit. Old-promise guards compare only the current pid, which does not distinguish A → B → A visits.
- `ProjectHome.tsx:1499` reads activity without the available actor/session owner. A pid switch retires it only after the generic read effect starts, and a same-pid actor/session switch does not itself trigger that read. Current owned program loading does not hide all Author content while support reads remain old.

These observations do not establish an unauthorized server read or a full-app cross-tenant leak. Global session navigation can unmount a surface, and server authorization remains intact. They identify missing local display ownership that should be tested using same-mounted visits and current actor/session guards, rather than fixed by interpreting missing data as empty.

**Required proof:** snapshot the first new-project commit before passive effects; defer replacement reads; resolve abandoned older-page responses after A → B → A; change actor/session at the same selected project. Old rows/activity must disappear immediately, late replies must not repopulate another visit, and within-project pagination must survive step changes. Extend existing owner/visit mechanisms; do not replace the generic hook or relax scope guards.

### 3. Do not close the remaining folds or formal qualification by inference

The accepted handoff and `A2_10_REMAINING_PARITY_REVIEW.md` still name four separate prerequisites: device portfolio/client review, CRO engagement-to-workspace mapping, Mission Control persisted characterization, and stored program journey/reference fields. Their standalone shells are retained for function/store/admission parity. The canonical MDX alias and filing-catalogue/dossier convergence do not prove those four folds complete. Formal URS/OQ execution also remains distinct from the published regression/native-browser evidence.

The map gives A3 legacy prompt-key convergence as the next sequenced placement task. A reliability correction inside the existing bus/project spine fits D2/W2, but a new parallel architecture or a broad capability admission is not justified by this catch-up request.

## Recommended bounded sequence

1. Let the lead isolate and qualify the current pending/immediate action-ordering concern through the one action bus. This audit does not claim its runtime reproduction.
2. Add the same-mounted composer/read ownership regressions above; prioritize preventing wrong-project carry-over while retaining within-project draft/history continuity.
3. Continue accepted A3 and the four open parity folds only from their present owners and factual prerequisites.

## Baseline source pins

```json
{
  "client/src/concept2cure/v2/surfaces/ProjectHome.tsx": "c4e05775fb27ffcc014a705910286c12129bd79db9a0c63adc2933a264e5987c",
  "client/src/concept2cure/v2/surfaces/ProjectStages.tsx": "731950b8a307aba683b6029c7b79f14969221600b2bb8f1be5cc31607cc8c607",
  "client/src/concept2cure/v2/surfaces/ProjectPlan.tsx": "04ef5c27610d959e354c20acad0938a15e481cd6522aff1f26ec0250813e3d35",
  "client/src/concept2cure/v2/surfaces/ProjectDossier.tsx": "ed20cd2989f0b397947adb5cf87e6cb894af639db26052a1cb9add9ee6308cd3",
  "client/src/concept2cure/v2/surfaces/ProjectMarkets.tsx": "5430b6510036e5b601be86fabf08371f9dff2bdbf964f884be27af375f2bf780",
  "client/src/concept2cure/v2/shellProject.ts": "b64eca13dbcf858eec808251e9d391e9cbbac43f6d4e1491cbd21e60d07497b7",
  "client/src/concept2cure/v2/surfaces/projectThreads.ts": "a5bf04435d712281605b1f6b119759332d5b13bf58df30150a412417c17f4ea4",
  "client/src/concept2cure/v2/dataConnect.tsx": "51b03e8cf336df448663742c5b31bb4dc9c93f6879b437cc490420fcc6809815",
  "client/src/concept2cure/v2/V2App.tsx": "5ca68f20b7455c01cc6a603bd435e0b35b2add32e48a247189c902fdc3e4559b"
}
```

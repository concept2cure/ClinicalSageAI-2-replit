# R1 inventory: every server route, whether a screen calls it, and what production does with it

**Package:** R1 (Reach), `docs/design/ONE_DESIGN_PLAN.md` §3. **Commit measured:** `18261a908`, 2026-11-01.
**Scope of this filing:** the inventory only. It changes no code. Each reach is done afterwards, in the plan
package that owns the screen, by the session that owns that package's files (plan §4.6: never two sessions on
one file).

## What already exists (RULE 3)

- `scripts/ci/audit-route-mounts.mjs` audits *where* routers are mounted. It does not ask whether a client calls a
  route.
- `scripts/ci/check-client-reachability.mjs` traces *client files* from `client/src/main.tsx`. It does not look at
  the server.
- `server/services/entitlements/launch-scope-api.ts` (`launchScopeApiVerdict`) and `api-prefix-map.ts` decide what
  production serves. This inventory runs that same function for every route, so its production column is the
  gate's own verdict, not a re-implementation.
- `LAUNCH_EXCLUDED_API` in that file already records some dead roots, with reasons (for example `/api/chat/stream`).
- No existing tool joins the three. Searches run: `_router.stack`, `listEndpoints`, `route inventory`, `uncalled`,
  `orphan` and `reach` under `scripts/` and `server/`. Nothing found does this.

## Method (reproducible: `method/`)

1. **Mounted routes, from the running server.** `method/trace.cjs` is preloaded into the server
   (`NODE_OPTIONS=--require`). It records each router's creating file, its routes and every `use()` mount.
   `method/compose.py` joins them into full paths. This is the server's own table, not a text search:
   **3923 handlers under `/api`**.
2. **Client callers.** `method/match.py` turns every string or template literal in `client/src` and `shared/`
   (tests excluded) that names an API path into a pattern, with `${…}` standing for one or more segments. It
   tests each route against those patterns. A route counts as **called** if any pattern matches it.
3. **Production verdict.** `method/verdict.ts` runs `launchScopeApiVerdict` with the real prefix map and
   `NEVER_GATED`:
   - `launch`: served;
   - `out-of-scope`: refused with 403;
   - `unmapped`: refused when `LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`;
   - `never-gated` and `infrastructure`: always served.
4. **Second pass** (`method/match2.py`). A route the exact pass missed is marked **probable** when a single client
   file names both its mount root and its last literal segment as a path piece. This catches URLs built from a
   base constant plus a suffix. It has false positives in both directions: for example, `POST /api/chat/stream`
   is DEAD by `LAUNCH_EXCLUDED_API` but reads as probable, because `useAnaChat.ts` names `/api/chat` and
   `/api/ana-ri/stream`. So a **probable** row is a lead to check, and a **none** row is the firmer finding.
5. **Owning package.** The route file is matched against each package's `paths` in `docs/design/one-design-plan.json`.

**Limits.** "Not called" means no literal in the client names the path. The first limit below is narrowed by the
two corrections of 2026-11-01, which follow this section:
- A URL assembled from variables declared in another file reads as not called. This **under**-counts callers, so
  each row must be checked before a reach is built.
- **The HTTP method is not compared by the literal pass.** A row it marks exact means some client code sends that
  *path*, with any method. For example, `POST /api/mdx/labeling/:id/symbols` is exact, and the client only GETs
  `/symbols` (`Labeling.tsx:211`). The second pass, since the second correction, does compare the method.
- **"Exact" does not mean reached.** A call in code that nothing runs still counts: a fixture file in §1, and
  `GET /api/global-ri/catalog/:group`, sent only from a hook no screen calls.
- AnA tools and the MCP connector call *services*, not routes. A route that is not called can still have its
  capability reachable through AnA. A reach decides whether the screen needs it as well.

## Correction, 2026-11-01: callers built from path constants

**The defect.** `POST /api/audit/reviews/:id/sign` (`server/routes/audit-compliance-reviews.ts`) was filed as not
called, and it is called. `client/src/concept2cure/v2/surfaces/ComplianceReviewRecords.tsx:212` signs a review
record through the shared `EsignModal`, at `` `${REVIEWS_PATH}/${id}/sign` ``. `REVIEWS_PATH` is
`'/api/audit/reviews'`, imported from `complianceReviewModel.ts`. Both passes missed it:
- The literal pass read the template as `${…}/${…}/sign`, which has no mount root.
- `match2.py` needs one file that names both the root and `/sign`.

P-87 (RIM) retires routes on these rows, so a false "not called" could have deleted a live Part 11 signing path.

**The fix to the method.** It works for every constant, not as a special case. `method/resolve.cjs` parses the
client with the TypeScript parser and evaluates every template and `+` chain. It substitutes:
- module-level and block-scoped `const` strings;
- constants imported from other client modules, including aliases and re-exports;
- object and enum members;
- helper returns;
- a parameter bound at its call sites or JSX props, which covers a URL passed to `apiCall`, a hook or a component
  in a variable.

`method/match.py` tests the resulting patterns only on routes the literal pass missed. It is stricter than the
literal pass: a pattern must start with `/api/<literal>`, and a runtime value matches only a route parameter, one
segment. The literal pass itself is unchanged.

**How it was checked.**
- **Reproduction:** `match.py --literal-only` reproduces `inventory.before-template-callers.json` byte for byte.
- **The known case:** `POST /api/audit/reviews/:id/sign` is now `exact` at `ComplianceReviewRecords.tsx:212`, found
  through an import.
- **The self-test:** `method/selftest-callers.py` passes, and fails on two deliberately broken copies of the method.

The full method change, the commands and every changed row are in `method/CHANGELOG-template-callers.md`.

### Second correction, 2026-11-01: the HTTP method, the call that sends the URL, and two more URL shapes

Three refuters checked the first correction row by row. It held in the direction that matters for P-87: every row
it moved from "none" to "exact" is a real call. But they found four faults that the method can fix in general, and
it now does:
- **The method was not compared.** 7 rows were marked exact on a call with another method, for example
  `DELETE /api/c2c/templates/:id` on a PUT. The second pass now reads the method of the call that sends each URL
  (an HTTP verb argument, `fetch`'s `method`, react-query's `queryKey`, or by following the URL into the client
  function it is handed to). It claims a row only when a call sends the path with the route's method. When every
  call uses another method, the row is left to `match2.py` as before, with `samePathAt` and `samePathMethods`.
- **The line named was where the URL is built.** `callerAt` is now the call that sends it, and `builtAt` is where
  it is built.
- **A URL made only of substitutions, from objects in a `const` array, was not read.** The biostatistics workbench
  posts `` `${calc.base ?? DEFAULT_CALCULATOR_BASE}${calc.path}` `` for each calculator in
  `biostatCalculators.ts` and `biostatCalculatorsIvd.ts` (`BiostatWorkbench.tsx:375`). 23 launch routes were filed
  as not called, and §2 listed them as reach candidates. The method now evaluates the URL once per object of such
  an array.
- **A callback handed down as a prop was not followed** (`CmcSectionEvidence.tsx`, `write` → `/unlink`). It is
  now.

The patterns it cannot read are listed in the warning below. The self-test was extended and seen failing on seven
broken copies of the method. Both the inventory as first filed and the new one reproduce byte for byte.

**Counts.** These cover the same 3,923 handlers at the same commit, `18261a908`.

| Caller status | As first filed | First correction | Second correction |
|---|---:|---:|---:|
| exact | 1,230 | 1,330 | 1,350 |
| probable | 510 | 425 | 428 |
| none | 2,183 | 2,168 | 2,145 |

Against the inventory as first filed, 120 rows changed: 38 from "none" to "exact" and 82 from "probable" to
"exact". By verdict they are 99 launch, 7 never-gated, 11 out-of-scope and 3 unmapped. No row lost a caller.

The corrections to the sections below:
- **§1, called and refused:** 182 as first filed, 199 after the first correction, **196** now.
- **§2, served and not called:** 341, then 327, **304** now. By owning package: none 186, S3 56, S5 28, S4 26,
  S10 8, S1 4, S8 3, S9 2.
- **§3, route files with no caller:** 171, then 170, **170** now (1,226 handlers).
  `server/routes/k510-document-preview.ts` has left the list. **20 of the 170 are called** (blind spot 1 below).

The 38 rows that were "none" and are now called. The first 15 are from the first correction, and the other 23 are
from the second:

| Route | Called at |
|---|---|
| `POST /api/audit/reviews/:id/sign` | `client/src/concept2cure/v2/surfaces/ComplianceReviewRecords.tsx:212` |
| `GET /api/510k/projects/:projectIdent/document-preview` | `client/src/concept2cure/mdx/hooks/useK510.ts:143` |
| `GET /api/cerv2/literature/screening` | `client/src/concept2cure/mdx/hooks/useCerLiterature.ts:386` |
| `PUT /api/client-branding/company-documents/branding-policy` | `client/src/concept2cure/v2/surfaces/company-documents/CompanyBrandingPolicy.tsx:17` |
| `POST /api/client-branding/company-documents/designs/:id/proof` | `client/src/concept2cure/v2/surfaces/company-documents/CompanyDesignDetail.tsx:33` |
| `POST /api/client-branding/company-documents/designs/:id/publish` | `client/src/concept2cure/v2/surfaces/company-documents/CompanyDesignDetail.tsx:25` |
| `GET /api/client-branding/company-documents/permissions` | `client/src/concept2cure/v2/surfaces/company-documents/CompanyPermissionsPanel.tsx:47` |
| `PUT /api/client-branding/company-documents/permissions/:userId` | `client/src/concept2cure/v2/surfaces/company-documents/CompanyPermissionsPanel.tsx:25` |
| `GET /api/client-branding/company-documents/revisions` | `client/src/concept2cure/v2/surfaces/company-documents/CompanyPresentationHistory.tsx:65` |
| `GET /api/client-branding/company-documents/revisions/:revision` | `client/src/concept2cure/v2/surfaces/company-documents/CompanyPresentationHistory.tsx:41` |
| `GET /api/csr/jobs/:jobId/assembly/:assemblyId/lifecycle` | `client/src/concept2cure/v2/surfaces/CsrPlacementLifecycle.tsx:44` |
| `POST /api/csr/jobs/:jobId/assembly/:assemblyId/withdraw-placement` | `client/src/concept2cure/v2/surfaces/CsrPlacementLifecycle.tsx:124` |
| `GET /api/ectd-compile/:projectIdent/filed-state` | `client/src/concept2cure/v2/surfaces/EctdFiledState.tsx:107` |
| `DELETE /api/realtime-collab/rooms/:documentId/users/me` | `client/src/concept2cure/v2/surfaces/AuthoringCollab.tsx:110` |
| `GET /api/region-profiles/:region` | `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx:553` |
| `POST /api/biostat/` + `assurance`, `diagnostic/bayesian-device`, `diagnostic/mrmc`, `diagnostic/sizing`, `dose-finding/boin`, `enrollment/backtest`, `enrollment/forecast`, `external-control/sensitivity`, `mmrm/power`, `mmrm/sample-size`, `multiplicity/test`, `survival/rmst`, `win-ratio` (13, all of `server/routes/biostat-design-stats.ts`'s "none" rows) | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` |
| `POST /api/diagnostics-performance/` + `analytical/detection-capability`, `analytical/imprecision`, `analytical/interference`, `analytical/linearity`, `analytical/method-comparison`, `analytical/qualitative-dose-response`, `analytical/reference-interval`, `clinical/accuracy`, `clinical/roc`, `clinical/weighted-kappa` (10, all of `server/routes/diagnostics-performance.ts`'s "none" rows) | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` |

> **Warning: a "none" row is still a finding of static analysis, not proof that nothing calls the route.** The
> 2,145 rows left without a caller were read from the client's source. These are the known blind spots, each with
> the rows found so far:
> 1. **A URL taken from a server response.** `GlobalRiBrowser.tsx:66-82` (`griRun`, the "Run capability" button)
>    calls `/api/global-ri` + the last route of each capability that `GET /api/global-ri/catalog` returns. Those
>    routes come from the static table in `server/services/global-ri/global-ri-capabilities.ts`. **32 "none" rows
>    and 9 "probable" rows are called this way**, all out-of-scope in production; the changelog lists every one.
>    **20 of the 170 route files in §3 are called this way:** `bioequivalence`, `clinical-evidence-standards`,
>    `companion-diagnostics`, `controlled-substances`, `establishment-registration`, `expanded-access`, `fees`,
>    `gcp`, `guidance`, `impurities`, `lifecycle`, `pediatric`, `pharmacovigilance`, `process-validation`,
>    `programs`, `promotional-compliance`, `reliance`, `strategy`, `submission-format` and `timeline`, each
>    `server/routes/global-ri/<name>.routes.ts`. Only `gdp.routes.ts` has no caller among the global-RI files there.
> 2. **A runtime prefix-rewrite map:** `rbmEndpoint` (`rbmWrites.tsx:23-42`). Its rows stay "probable"; none is
>    "none".
> 3. **Other URLs built at runtime:** a registry looked up by key, a `let` reassigned in a loop, a class field such
>    as `this.baseUrl`, a URL passed through React context, and a parameter whose call sites pass only runtime values.
> 4. **Calls from AnA tools and the MCP connector**, which reach services, not routes; and **tests**, which are
>    excluded (`biostatWorkbenchFreshness.test.tsx` asserts the call to `/api/biostat/assurance`).
> 5. **9 routes the client may reach through a literal segment in a `:param` position**, listed in the changelog
>    and not applied.
>
> The inventory is also measured at `18261a908`, and the client has changed since.
>
> **So no route is retired on this column alone.** Before a retirement (P-87 or any other), text-search the current
> client, `shared/` and `server/` for each of the route's literal segments, its last segment above all. Read every
> hit, and record the search in the retirement's evidence. Searching `server/` is what finds blind spot 1: the
> global-RI routes appear there, in the capability table, and nowhere in the client. Such a search is not a filter
> that clears rows in bulk: the last segment of most "none" rows appears somewhere in the client as a path piece,
> most of them common words (1,194 of the 2,168 counted after the first correction). It is a check to run, one
> route at a time.

## Results

These are the figures as first filed, before the corrections above. The corrected counts are in that section, and
`inventory.json` carries the corrected rows. In the tables below, a count the corrections changed is shown as
"before → now".

| Client caller | Production verdict | Handlers |
|---|---|---:|
| exact | infrastructure | 14 |
| exact | launch | 958 |
| exact | never-gated | 76 |
| exact | out-of-scope | 148 |
| exact | unmapped | 34 |
| none | infrastructure | 32 |
| none | launch | 341 |
| none | never-gated | 72 |
| none | out-of-scope | 428 |
| none | unmapped | 1310 |
| probable | infrastructure | 8 |
| probable | launch | 214 |
| probable | never-gated | 47 |
| probable | out-of-scope | 165 |
| probable | unmapped | 76 |

- **1230 handlers are called by a screen (exact)**, **510 probably are**, and **2183 have no caller found by either pass.**
- **171 route files (1227 handlers) have no client caller found by either pass.** (The exact pass alone found 236 files and 1,765 handlers.)

### 1. Called by a screen, refused in production: 182 handlers (196 after the corrections)

These are doors a client can see and production refuses. Most callers are surfaces that are themselves outside
the launch scope (locked in production), so a customer never reaches them. **The rows whose caller is a launch
screen are defects (F1).** The design session is walking the running app with `LAUNCH_SCOPE_ENFORCE=on`; this
list is its static counterpart.

| Handlers | Verdict | Route file | Example route | Caller |
|---:|---|---|---|---|

| 21 | out-of-scope | `server/routes/pdev/pdev-routes.ts` | `GET /api/pdev/programs/:programId` | `client/src/concept2cure/pdev/hooks/usePdevData.ts` |
| 14 | out-of-scope | `server/routes/intelligent-reports.ts` | `GET /api/intelligent-reports/:reportId/attestations` | `client/src/concept2cure/v2/surfaces/ReportGovernance.tsx` |
| 10 | out-of-scope | `server/routes/submission-twin.ts` | `POST /api/submission-twin/assess/:packageId` | `client/src/concept2cure/v2/surfaces/SubmissionTwin.tsx` |
| 7 | out-of-scope | `server/routes/biopharma/bla-workbench.ts` | `POST /api/biopharma/bla/analytical-similarity` | `client/src/concept2cure/v2/surfaces/BlaAssessmentWorkbench.tsx` |
| 7 | out-of-scope | `server/routes/deep-research.ts` | `GET /api/deep-research/connectors` | `client/src/concept2cure/v2/surfaces/DeepResearch.tsx` |
| 6 | out-of-scope | `server/routes/biopharma-specialty.routes.ts` | `GET /api/biopharma/orphan` | `client/src/concept2cure/v2/surfaces/BiopharmaSpecialty.tsx` |
| 6 | out-of-scope | `server/routes/quality-management-api.ts` | `GET /api/quality/dashboard/:qmpId` | `client/src/concept2cure/v2/surfaces/QmpWorkspace.tsx` |
| 5 | unmapped | `server/routes/nda-cockpit.routes.ts` | `GET /api/nda-cockpit/m1` | `client/src/concept2cure/v2/surfaces/NdaCockpit.tsx` |
| 5 | out-of-scope | `server/routes/orchestration.ts` | `POST /api/orchestration/continuity` | `client/src/concept2cure/v2/surfaces/AnaCommand.tsx` |
| 4 | out-of-scope | `server/routes/cro.ts` | `GET /api/cro/studies` | `shared/constants/ui-surface-registry.ui-v2.ts` |
| 4 | unmapped | `server/routes/labeling-pi.routes.ts` | `GET /api/labeling-pi` | `client/src/concept2cure/v2/surfaces/LabelingPi.tsx` |
| 4 | out-of-scope | `server/routes/pharmacovigilance-routes.ts` | `POST /api/pharmacovigilance/calculate-deadline` | `client/src/concept2cure/v2/surfaces/PvCockpit.tsx` |
| 3 | unmapped | `server/routes/clinical-operations-routes.ts` | `POST /api/clinical-operations/deviations` | `client/src/concept2cure/v2/surfaces/ClinicalOps.tsx` |
| 3 | out-of-scope | `server/routes/nonclinical.ts` | `GET /api/nonclinical/studies` | `client/src/concept2cure/v2/surfaces/Nonclinical.tsx` |
| 3 | out-of-scope | `server/routes/orchestration.ts` | `POST /api/orchestration/cancel/:id` | `client/src/concept2cure/v2/surfaces/Orchestration.tsx` |
| 3 | out-of-scope | `server/routes/precedent-engine.ts` | `POST /api/precedent-engine/check-claim` | `client/src/concept2cure/v2/surfaces/PrecedentEngine.tsx` |
| 3 | out-of-scope | `server/routes/regulatory-precedent-intelligence.ts` | `GET /api/regulatory-precedent-intelligence/confidence/calibration-report` | `client/src/concept2cure/v2/surfaces/FilingStrategy.tsx` |
| 3 | out-of-scope | `server/routes/safety-narrative.ts` | `GET /api/safety-narratives/cases` | `client/src/concept2cure/v2/surfaces/SafetyNarrative.tsx` |
| 2 | unmapped | `server/routes/analytics-routes.ts` | `POST /api/analytics/analyze-protocol-text` | `client/src/concept2cure/v2/surfaces/ReportEngine.tsx` |
| 2 | out-of-scope | `server/routes/c2c/templates.ts` | `GET /api/c2c/templates` | `client/src/concept2cure/v2/surfaces/AuthoringEngine.tsx` |
| 2 | out-of-scope | `server/routes/c2c/templates.ts` | `POST /api/c2c/templates/extract` | `client/src/concept2cure/v2/surfaces/TemplateLibrary.tsx` |
| 2 | unmapped | `server/routes/cmc-changes.routes.ts` | `GET /api/cmc-changes` | `client/src/concept2cure/v2/surfaces/BiopharmaSpecialty.tsx` |
| 2 | out-of-scope | `server/routes/cro.ts` | `GET /api/cro/clients` | `client/src/concept2cure/v2/surfaces/CroPortfolio.tsx` |
| 2 | out-of-scope | `server/routes/enablement.ts` | `GET /api/enablement/certifications` | `client/src/concept2cure/v2/surfaces/Training.tsx` |
| 2 | out-of-scope | `server/routes/evidence.ts` | `GET /api/evidence` | `shared/constants/ui-surface-registry.ui-v2.ts` |
| 2 | out-of-scope | `server/routes/labeling-smpc.routes.ts` | `GET /api/labeling-smpc` | `client/src/concept2cure/v2/surfaces/LabelingPi.tsx` |
| 2 | unmapped | `server/routes/maa-module1.routes.ts` | `GET /api/maa-module1/:market` | `client/src/concept2cure/v2/surfaces/MaaCockpit.tsx` |
| 2 | out-of-scope | `server/routes/market-access.routes.ts` | `GET /api/market-access` | `client/src/concept2cure/v2/surfaces/MarketAccess.tsx` |
| 2 | unmapped | `server/routes/reg-change.routes.ts` | `GET /api/reg-change` | `client/src/concept2cure/v2/surfaces/RegChange.tsx` |
| 2 | out-of-scope | `server/routes/rim.ts` | `GET /api/rim/products/:id/market-dossier` | `client/src/concept2cure/v2/surfaces/Registrations.tsx` |
| 2 | out-of-scope | `server/routes/saved-precedent-queries.ts` | `GET /api/saved-precedent-queries` | `client/src/concept2cure/mdx/surfaceIds.ts` |
| 2 | out-of-scope | `server/routes/saved-precedent-queries.ts` | `DELETE /api/saved-precedent-queries/:id` | `client/src/concept2cure/v2/surfaces/PrecedentEngine.tsx` |
| 1 | out-of-scope | `server/routes/ai-actions.ts` | `POST /api/ai-actions/execute` | `client/src/concept2cure/v2/surfaces/AnaCommand.tsx` |
| 1 | unmapped | `server/routes/batch-draft-routes.ts` | `GET /api/batch-draft/spine` | `client/src/concept2cure/v2/surfaces/BatchDraft.tsx` |
| 1 | out-of-scope | `server/routes/biopharma/programs.ts` | `GET /api/biopharma` | `shared/constants/ui-surface-registry.ui-v2.ts` |
| 1 | out-of-scope | `server/routes/change-assessment.routes.ts` | `GET /api/change-assessment` | `client/src/concept2cure/v2/surfaces/ChangeAssessment.tsx` |
| 1 | out-of-scope | `server/routes/citations.ts` | `POST /api/citations/verify` | `shared/constants/ui-surface-registry.ui-v2.ts` |
| 1 | unmapped | `server/routes/ana-intelligence.ts` | `POST /api/claude/batch` | `client/src/concept2cure/v2/surfaces/AnaVerbs.tsx` |
| 1 | out-of-scope | `server/routes/client-portal.ts` | `GET /api/client-portal/overview` | `client/src/concept2cure/v2/surfaces/ClientPortal.tsx` |
| 1 | out-of-scope | `server/routes/c2c/exports.ts` | `POST /api/concept2cure/artifacts/export-pptx` | `client/src/concept2cure/v2/surfaces/LabelingPi.tsx` |
| 1 | out-of-scope | `server/routes/c2c/artifacts.ts` | `GET /api/concept2cure/projects/all/artifacts-summary` | `client/src/concept2cure/v2/surfaces/ConversationThread.tsx` |
| 1 | unmapped | `server/routes/cro-portfolio.routes.ts` | `GET /api/cro-portfolio` | `client/src/concept2cure/v2/surfaces/CroPortfolio.tsx` |
| 1 | out-of-scope | `server/routes/csr-builder-routes.ts` | `GET /api/csr-builder` | `shared/constants/ui-surface-registry.ts` |
| 1 | out-of-scope | `server/routes/csr-workflow-routes.ts` | `GET /api/csr-workflow/board` | `client/src/concept2cure/v2/surfaces/BiopharmaProject.tsx` |
| 1 | out-of-scope | `server/routes/decision-lineage.routes.ts` | `GET /api/decision-lineage` | `client/src/concept2cure/v2/surfaces/DecisionLineage.tsx` |
| 1 | out-of-scope | `server/routes/decision-lineage.ts` | `GET /api/decision-lineage/verify-chain` | `client/src/concept2cure/v2/fixtures/decision-lineage-data.ts` |
| 1 | out-of-scope | `server/routes/deep-research-board.routes.ts` | `GET /api/deep-research/board` | `client/src/concept2cure/v2/surfaces/DeepResearch.tsx` |
| 1 | unmapped | `server/routes/doc-journey.routes.ts` | `GET /api/doc-journey` | `client/src/concept2cure/v2/surfaces/DocJourney.tsx` |
| 1 | out-of-scope | `server/routes/enablement.ts` | `GET /api/enablement` | `shared/constants/ui-surface-registry.ui-v2.ts` |
| 1 | unmapped | `server/routes/evidence-asks.routes.ts` | `GET /api/evidence-asks` | `client/src/concept2cure/v2/surfaces/Evidence.tsx` |
| 1 | unmapped | `server/routes/evidence-objects.routes.ts` | `GET /api/evidence-objects` | `client/src/concept2cure/pdev/surfaces/EvidencePicker.tsx` |
| 1 | out-of-scope | `server/routes/evidence-ask.ts` | `POST /api/evidence/ask` | `client/src/concept2cure/v2/surfaces/Evidence.tsx` |
| 1 | out-of-scope | `server/routes/global-markets.ts` | `GET /api/global-markets` | `shared/constants/ui-surface-registry.ui-v2.ts` |
| 1 | out-of-scope | `server/routes/global-ri/catalog.routes.ts` | `GET /api/global-ri/catalog` | `client/src/hooks/useGlobalRiCatalog.ts` |
| 1 | out-of-scope | `server/routes/ind-lifecycle/documents.routes.ts` | `POST /api/ind-lifecycle/safety-report` | `shared/constants/ui-surface-registry.ui-v2.ts` |
| 1 | out-of-scope | `server/routes/investigator-brochure.routes.ts` | `GET /api/investigator-brochure` | `client/src/concept2cure/v2/surfaces/InvestigatorBrochure.tsx` |
| 1 | unmapped | `server/routes/lifecycle.ts` | `GET /api/lifecycle/renewals` | `client/src/concept2cure/v2/surfaces/BiopharmaSpecialty.tsx` |
| 1 | out-of-scope | `server/routes/mdx-submission-gateway.ts` | `GET /api/mdx/gateways` | `shared/constants/ui-surface-registry.ts` |
| 1 | out-of-scope | `server/routes/mdx-qms.ts` | `GET /api/mdx/qms/readiness` | `client/src/concept2cure/quality/qmsApproval.ts` |
| 1 | unmapped | `server/routes/nonclinical-summary.routes.ts` | `GET /api/nonclinical-summary` | `client/src/concept2cure/v2/surfaces/Nonclinical.tsx` |
| 1 | out-of-scope | `server/routes/orchestration-checkpoints.ts` | `GET /api/orchestration/checkpoints` | `client/src/concept2cure/v2/surfaces/Orchestration.tsx` |
| 1 | out-of-scope | `server/routes/pharmacovigilance-board.routes.ts` | `GET /api/pharmacovigilance/board` | `client/src/concept2cure/v2/surfaces/BiopharmaSpecialty.tsx` |
| 1 | unmapped | `server/routes/precedent-engine-board.ts` | `GET /api/precedent-engine-board` | `client/src/concept2cure/v2/surfaces/PrecedentEngine.tsx` |
| 1 | out-of-scope | `server/routes/program-journey.routes.ts` | `GET /api/program-journey` | `client/src/concept2cure/v2/surfaces/BiopharmaJourney.tsx` |
| 1 | out-of-scope | `server/routes/project-sections.ts` | `GET /api/project-sections` | `shared/constants/ui-surface-registry.ts` |
| 1 | unmapped | `server/routes/registrations-standards.ts` | `GET /api/registrations/data-standards` | `client/src/concept2cure/v2/surfaces/Registrations.tsx` |
| 1 | out-of-scope | `server/routes/regulatory-workspace-routes.ts` | `GET /api/regulatory-workspace` | `client/src/concept2cure/v2/surfaces/BiopharmaProject.tsx` |
| 1 | out-of-scope | `server/routes/report-os.ts` | `GET /api/report-os/portfolio` | `shared/constants/ui-surface-registry.ui-v2.ts` |
| 1 | out-of-scope | `server/routes/report-os.ts` | `GET /api/report-os/portfolio/org` | `client/src/concept2cure/v2/surfaces/AnaCommand.tsx` |
| 1 | unmapped | `server/routes/research-admin.routes.ts` | `GET /api/research-admin` | `client/src/concept2cure/v2/surfaces/ResearchAdmin.tsx` |
| 1 | unmapped | `server/routes/shadow-review.routes.ts` | `GET /api/shadow-review` | `client/src/concept2cure/v2/surfaces/ShadowReview.tsx` |
| 1 | unmapped | `server/routes/source-tracer-routes.ts` | `GET /api/source-tracer/sections` | `client/src/concept2cure/v2/surfaces/SourceTracer.tsx` |
| 1 | out-of-scope | `server/routes/misc-inline-routes.ts` | `GET /api/templates` | `shared/constants/ui-surface-registry.ts` |
| 1 | out-of-scope | `server/api/templates/routes.ts` | `POST /api/templates` | `shared/constants/ui-surface-registry.ts` |
| 1 | unmapped | `server/routes/tenant-export.ts` | `GET /api/tenant-export/full` | `shared/authoring/figure-refs.ts` |

### 2. Not called, but served in production: the reach candidates

These are capabilities already inside the launch scope that no screen uses. They are R1's main work. Each is
reached in the screen of the package that owns it, or put to the founder for retirement.

| Owning package | Handlers |
|---|---:|
| none (no package path claims the file) | 209 → 186 |
| S3 | 69 → 56 |
| S5 | 29 → 28 |
| S4 | 26 |
| S10 | 8 |
| S1 | 4 |
| S8 | 3 |
| S9 | 2 |

By route file (largest first). Only rows with no caller found by either pass are counted:

| Not called | Route file | Packages | Example |
|---:|---|---|---|
| 45 | `server/routes/ivd-lifecycle.ts` | — | `POST /api/ivd-lifecycle/authoring/emdr` |
| 29 | `server/routes/biostatPlatform.ts` | S3 | `GET /api/biostat/continuum/:threadId` |
| 19 | `server/routes/ana-ri.ts` | S4 | `GET /api/ana-ri/commands` |
| 19 | `server/routes/submissions.ts` | S5 | `GET /api/submissions/:id` |
| 13 → 0 | `server/routes/biostat-design-stats.ts` | S3 | `POST /api/biostat/assurance`: all 13 are called by `BiostatWorkbench.tsx:375` |
| 13 | `server/routes/users.ts` | — | `GET /api/user` |
| 12 | `server/routes/manufacturing-routes.ts` | — | `POST /api/manufacturing/ai/simulate-deficiency` |
| 11 | `server/routes/ivdr-routes.ts` | — | `GET /api/ivdr/cdx-workflows` |
| 10 → 0 | `server/routes/diagnostics-performance.ts` | — | `POST /api/diagnostics-performance/analytical/detection-capability`: all 10 are called by `BiostatWorkbench.tsx:375` |
| 9 | `server/routes/fda-forms.routes.ts` | — | `GET /api/fda-forms/applicable` |
| 9 | `server/routes/ivdr-binder-routes.ts` | — | `GET /api/ivdr/binder` |
| 8 | `server/routes/clients-routes.ts` | — | `DELETE /api/clients/:id` |
| 8 | `server/routes/regulatory-correspondence.ts` | S10 | `GET /api/regulatory-correspondence/analytics/deficiency-patterns` |
| 7 | `server/routes/ana-biostats.ts` | S3, S4 | `POST /api/ana-biostats/compare` |
| 7 | `server/routes/irb.ts` | — | `POST /api/irb/submissions/:id/amendments` |
| 7 | `server/routes/protocol-consent.ts` | S3 | `PATCH /api/protocol-consent/elements/:id` |
| 6 | `server/routes/cer-routes.ts` | — | `POST /api/cer/faers/data` |
| 6 | `server/routes/project-rules.ts` | — | `DELETE /api/project-rules/:ruleId` |
| 6 | `server/routes/submission-ops.ts` | S5 | `GET /api/submission-ops/packages/:packageId/milestones` |
| 5 → 0 | `server/routes/company-document-governance.ts` | — | `PUT /api/client-branding/company-documents/branding-policy` |
| 5 | `server/routes/ind-forms.routes.ts` | — | `POST /api/ind-forms/1572/pdf-all` |
| 5 | `server/routes/statistical-defensibility.ts` | — | `POST /api/statistical-defensibility/consistency` |
| 5 | `server/routes/tenants-simple.ts` | — | `DELETE /api/tenants/:id` |
| 4 | `server/routes/cerv2-sections.ts` | — | `DELETE /api/cerv2-sections/:sectionId` |
| 4 | `server/routes/cerv2-ai-routes.ts` | — | `POST /api/cerv2/ai/analyze-section` |
| 4 | `server/routes/mdx-ivdr.ts` | — | `GET /api/mdx/ivdr/per` |
| 4 | `server/routes/tenant-config.ts` | — | `GET /api/tenant-config/:tenantId/settings` |
| 3 | `server/routes/mdx-cdx.ts` | — | `GET /api/mdx/cdx/concordance/:id` |
| 3 | `server/routes/mdx-rbm.ts` | S8 | `POST /api/mdx/rbm-assessments/seed` |
| 3 | `server/routes/projects-management.ts` | — | `DELETE /api/projects/:projectId` |
| 3 | `server/routes/protocol-amendments.ts` | S3 | `POST /api/protocol-amendments/amendments/:id/changes` |
| 3 | `server/routes/protocol-deviations.ts` | S3 | `PATCH /api/protocol-deviations/capa/:id/status` |
| 3 | `server/routes/unifiedTasks.routes.ts` | — | `POST /api/regulatory/tasks/:id/link` |
| 3 | `server/routes/taskManagement.routes.ts` | — | `POST /api/task-management/tasks/:taskId/notify` |
| 2 | `server/routes/510k-estar-routes.ts` | — | `POST /api/510k/estar/registration/assess` |
| 2 | `server/routes/biostat-bridge.ts` | S3 | `GET /api/biostat-bridge/computation-runs/:runId/reproduce` |
| 2 | `server/routes/c2c/documents.ts` | S1 | `GET /api/c2c/documents/by-legacy/cerv2-section/:id` |
| 2 → 1 | `server/routes/cerv2-document-routes.ts` | — | `POST /api/cerv2/documents/:documentId/save` |
| 2 → 0 | `server/routes/company-document-designs.ts` | — | `POST /api/client-branding/company-documents/designs/:id/proof` |
| 2 | `server/routes/c2c/reviews.ts` | S1 | `POST /api/concept2cure/review-tasks/:taskId/reopen` |
| 2 → 0 | `server/routes/csr-jobs-assembly.ts` | — | `GET /api/csr/jobs/:jobId/assembly/:assemblyId/lifecycle` |
| 2 | `server/routes/human-factors.ts` | — | `POST /api/human-factors/hfe-completeness` |
| 2 | `server/routes/ind-lifecycle/documents.routes.ts` | S5 | `POST /api/ind-lifecycle/annual-report/line-listing` |
| 2 | `server/routes/ivd-assessments.ts` | — | `DELETE /api/ivd-assessments/:id` |
| 2 | `server/routes/mdx-clia.ts` | — | `POST /api/mdx/clia/:id/apply-waiver` |
| 2 | `server/routes/mdx-notifications.ts` | — | `POST /api/mdx/notifications/:id/archive` |
| 2 | `server/routes/protocol-milestones.ts` | S3, S9 | `GET /api/protocol-milestones/documents/:id/timeline` |
| 2 | `server/routes/protocol-reviews.ts` | S3 | `PATCH /api/protocol-reviews/comments/:id/resolve` |
| 1 → 0 | `server/routes/k510-document-preview.ts` | — | `GET /api/510k/projects/:projectIdent/document-preview` |
| 1 | `server/routes/company-legal-workflows.ts` | — | `GET /api/client-branding/company-documents/legal-workflows/catalog` |
| 1 | `server/routes/csr-jobs.ts` | — | `POST /api/csr/jobs/:jobId/cancel` |
| 1 → 0 | `server/routes/ectd-compile.ts` | S5 | `GET /api/ectd-compile/:projectIdent/filed-state` |
| 1 | `server/routes/ectd-export.ts` | S5 | `POST /api/ectd/validate/preflight` |
| 1 | `server/routes/ha-interactions.ts` | — | `POST /api/ha-interactions/interactions/:id/questions` |
| 1 | `server/routes/mdx-udi.ts` | — | `POST /api/mdx/udi/:id/submit-gudid` |
| 1 | `server/routes/predicate-intelligence.ts` | — | `PATCH /api/predicate-intelligence/candidates/:id/status` |
| 1 | `server/routes/protocol-risks.ts` | S3 | `GET /api/protocol-risks/documents/:id/register` |
| 1 → 0 | `server/routes/realtime-collab.ts` | — | `DELETE /api/realtime-collab/rooms/:documentId/users/me` |
| 1 → 0 | `server/routes/region-profiles.ts` | — | `GET /api/region-profiles/:region` |
| 1 | `server/routes/validate-completeness.ts` | — | `GET /api/validate-completeness/health` |

### 3. Route files with no client caller at all: 171 (170 after the corrections)

These files are candidates for the founder to retire (RULE 6: nothing new; each is reached or retired). The full
list is in `inventory.json`. **20 of the 170 are called** by `GlobalRiBrowser.tsx` through the global-RI catalog
(blind spot 1 in the warning above), so they are not retirement candidates on this evidence. The 40 largest:

| Handlers | Route file | Production verdicts | Packages |
|---:|---|---|---|
| 71 | `server/src/routes/stability.router.ts` | unmapped | — |
| 68 | `server/routes/ana-features.ts` | out-of-scope | S4 |
| 51 | `(app-level / unattributed)` | infrastructure, never-gated, out-of-scope, unmapped | — |
| 48 | `server/routes/ivd-lifecycle.ts` | launch | — |
| 38 | `server/routes/qc.routes.ts` | unmapped | — |
| 33 | `server/routes/ana-cortex.ts` | unmapped | S4 |
| 33 | `server/routes/client-intelligence.ts` | unmapped | S1 |
| 33 | `server/routes/resolution.ts` | unmapped | — |
| 30 | `server/routes/grants.ts` | unmapped | — |
| 27 | `server/routes/operating-system.ts` | unmapped | — |
| 26 | `server/routes/cortexManagementRoutes.ts` | unmapped | — |
| 26 | `server/routes/grdheRoutes.ts` | unmapped | — |
| 26 | `server/routes/regulatory-graph.ts` | unmapped | — |
| 26 | `server/routes/regulatory-intelligence.ts` | out-of-scope | — |
| 25 | `server/routes/assumption-decision-contradiction.ts` | out-of-scope | — |
| 21 | `server/routes/ana-cortex-ft.ts` | unmapped | S4 |
| 21 | `server/routes/ind-lifecycle/registers.routes.ts` | out-of-scope, unmapped | S5 |
| 21 | `server/routes/defense-packet.ts` | out-of-scope | — |
| 20 | `server/routes/snowglobe.ts` | unmapped | — |
| 19 | `server/routes/global-compliance.ts` | unmapped | — |
| 18 | `server/routes/moduleIntegrationRoutes.ts` | unmapped | — |
| 17 | `server/src/routes/control-plane.router.ts` | unmapped | — |
| 16 | `server/routes/conversation-os.ts` | unmapped | — |
| 16 | `server/routes/unifiedTasks.routes.ts` | launch, out-of-scope, unmapped | — |
| 15 | `server/routes/audit-services.ts` | unmapped | — |
| 15 | `server/routes/docx-factory.ts` | unmapped | — |
| 14 | `server/routes/intelligence.ts` | out-of-scope | — |
| 14 | `server/routes/knowledge-base.ts` | unmapped | — |
| 13 | `server/routes/account-intelligence.ts` | unmapped | — |
| 13 | `server/routes/manufacturing-routes.ts` | launch | — |
| 12 | `server/routes/c2c/context-intelligence.ts` | unmapped | S1 |
| 12 | `server/routes/evidence-management.routes.ts` | unmapped | — |
| 12 | `server/routes/ivdr-binder-routes.ts` | launch | — |
| 12 | `server/routes/tenant-ctq-factors.ts` | out-of-scope, unmapped | — |
| 12 | `server/routes/regulatory-digital-twin.ts` | unmapped | — |
| 11 | `server/routes/biotech-artifacts.ts` | unmapped | — |
| 11 | `server/routes/change-propagation.ts` | out-of-scope | — |
| 11 | `server/routes/client-branding.ts` | unmapped | — |
| 11 | `server/routes/committees.ts` | out-of-scope | — |
| 11 | `server/routes/coverage-analysis.ts` | out-of-scope | — |

## What happens next (R1)

1. **Defects first (F1).** Check every row of §1 whose caller is a launch screen against the running app with
   `LAUNCH_SCOPE_ENFORCE=on`. That walk is shared with the design session.
2. **Reach, package by package (§2).** For each route file, confirm the row is truly not called (the limits above;
   spot-check, 2026-11-01: `/api/csr/jobs/:jobId/headings` and `…/assembly/:assemblyId/place` are called by
   `CsrRunBuilds.tsx` and `CsrAssemblyControl.tsx` through a base constant, which the exact pass missed and the
   second pass catches).
   Then name the screen in the owning package that should call it, and reach it there under that package's plan
   ID, in a file no other session holds.
3. **Retirement list (§3) for the founder.** No file is deleted by this package without a founder decision. That
   follows the working agreement: name the replacement path, or the deletion is a product decision.

## Files

- `inventory.json`: every handler, with method, path, route file, production verdict, claiming surfaces, owning
  packages and the first client caller found. A row found by the second caller pass also carries `callerAt` (the
  file:line of the call that sends the URL with the route's method), `builtAt` (where the URL is assembled), `via`,
  `how` and `pattern`. A row whose path the client sends only with other methods carries `samePathAt` and
  `samePathMethods` (7 rows).
- `method/`: the trace, compose, match and verdict scripts used to produce it. Added by the 2026-11-01 correction:
  `resolve.cjs`, the second caller pass; `recompose.py`, which re-runs the caller columns over the traced route table;
  `selftest-callers.py`; and `CHANGELOG-template-callers.md`, which records both corrections.
- `inventory.before-template-callers.json`: the inventory as first filed, before the corrections.

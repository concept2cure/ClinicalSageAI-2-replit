# Changelog: callers built from path constants (2026-11-01)

Two corrections are recorded here. The **first** (the sections up to "Limits that remained after the first
correction") added the parsed second pass. Three refuters then checked it, row by row. The **second** (the section
"Second correction" at the end) acts on what they found: it compares the HTTP method, names the call that sends
the URL, and reads two more URL shapes. `inventory.json` carries the second correction. Where the two disagree, the
second is the current state.

**Inventory:** `docs/evidence/DESIGN/R1/2026-11-01-inventory/`. **Commit measured:** `18261a908` (unchanged: the
route table, the production verdicts and the owning packages are the ones first filed; only the caller columns
are re-run). **Before:** `inventory.before-template-callers.json`. **After:** `inventory.json`.

## Why

`POST /api/audit/reviews/:id/sign` (`server/routes/audit-compliance-reviews.ts`) was filed with `caller: null`.
It is called. `client/src/concept2cure/v2/surfaces/ComplianceReviewRecords.tsx:212` signs a review record through
the shared `EsignModal`, whose `onSign` posts to `` `${REVIEWS_PATH}/${id}/sign` ``, and `REVIEWS_PATH` is
`'/api/audit/reviews'`, exported from `complianceReviewModel.ts`. P-87 (RIM) retires routes on these rows, so a
false `null` there can delete a live Part 11 signing path.

The literal pass (`method/match.py`) reads each string or template literal on its own. That template reached it as
`${…}/${…}/sign`. It has no mount root and only one literal segment, so the pass dropped it (it keeps a pattern only
with `/api/` or two literal segments). The second pass (`method/match2.py`) also missed it. It needs one file that
names both the mount root and the last segment, and `/api/audit/reviews` is in `complianceReviewModel.ts` while
`/sign` is in `ComplianceReviewRecords.tsx`. The same blind spot hides any URL assembled from a constant, a `+`
chain or a helper, and any template whose nested `${…}` or backticks split the literal regex.

## What changed in the method

1. **New: `method/resolve.cjs` (step 2b).** It parses every client file in the literal pass's own file set
   (`client/src` and `shared`, `.ts`/`.tsx`, tests excluded) with the TypeScript parser. It uses the parser only:
   no type checker, no build, about 5 s. It evaluates every template literal and every maximal `+` string chain
   that holds a path piece, and substitutes what it can resolve, in general and not by name:
   - **constant:** a `const` bound to a string, template, `+` chain or conditional, at module level or in an
     enclosing block. Lookup is lexical, so a function's own `const base` is never read from another function.
   - **import:** the same name imported from another client module: named, aliased, `* as ns`, and re-exported
     through `export { … } from` and `export * from`. Specifiers resolve with `@/`, `@shared/` and repo-root
     `shared/…`, the vite and tsconfig aliases.
   - **property:** a property of a `const` object literal, an enum member or a namespace member (`API.jobs`,
     `P.API.jobs`).
   - **helper:** a call to a function whose returns are strings (`docUrl(id)`), with its parameters bound to the
     call's arguments.
   - **argument:** a parameter used as the head of a URL inside a helper or component. Examples are
     `function useSend(base) { … ${base}/fulfill … }` and `<PlacementForm base={…} />`. The parameter is bound to
     the arguments or JSX props of every call site, in any client file, that resolves to that function. This is
     the "constant passed through a helper" case: a URL handed to `apiCall`, `apiRequest`, a hook or a component
     in a variable.

   Everything else stays a wildcard, as in the literal pass: a runtime value, `encodeURIComponent(id)`, or a
   parameter with no resolvable call site. Each URL expression is written to `resolved-patterns.json` with its
   file, line and how it was resolved:
   - `path-constant`: something was substituted;
   - `concatenation`: a `+` chain of literals and runtime values;
   - `template`: a template the regex had split.
2. **`method/match.py`: a second pass, after the literal pass.**
   - **Literal pass:** byte-for-byte as before. A route it matched keeps its caller.
   - **Which rows it tests:** only routes the literal pass missed, against the resolved patterns.
   - **Stricter than the literal pass, so it adds no loose matches:**
     - A resolved pattern must start with `/api/<literal segment>`, so a wildcard never stands for the mount root.
     - A wildcard matches a route parameter (`:id` or `*splat`) only. It never matches a literal segment and
       never spans segments. So `'/api/x/' + id` is not read as a call to every route under `/api/x/:id/…`, and
       `` `/api/submissions/sequences/${id}/${f.kind}` `` with a runtime `kind` is not read as a call to every
       action route. Those stay with `match2.py`.
   - **New fields:** a row found here records `callerAt` (file:line), `via`, `how` (the substitutions used) and
     `pattern` (what the client builds, `${…}` for a runtime value).
   - **Flags:**
     - `--literal-only` skips the pass and reproduces the before file.
     - `--probe-param-match` lists, without applying them, the rows that a looser reading would add (a route's
       `:param` matching a literal client segment).
3. **New: `method/recompose.py`.** The route table, `prod`, `claimedBy` and `packages` depend only on the server,
   which `trace.cjs`, `compose.py` and `verdict.ts` measured at `18261a908`. A caller-method change does not need
   the server again. `recompose.py routes` writes `full-routes.json` from an inventory's rows. `recompose.py
   merge` writes the inventory back with only the caller columns replaced. It also writes down the assembly step
   that the first filing did not keep in `method/`.
4. **New: `method/selftest-callers.py`.** It builds a ten-route client fixture and checks:
   - the shapes the second pass must find: an imported constant (the known case), an aliased re-export in a
     `+` chain, a namespace object property, a helper return, a parameter bound at a call site, and a JSX prop;
   - the shapes it must not find: another function's `const`, a parameter with no call site, a runtime value in
     a literal route segment, and a runtime sub-path after the mount root.
   It also checks that `--literal-only` misses the known case.

`match2.py`, `trace.cjs`, `compose.py` and `verdict.ts` are unchanged.

## How it was re-run

The client read is the client of the measured commit, extracted without a checkout:
`git archive 18261a908 client/src shared | tar -x -C <snap>`. Then, from `<snap>`:

```
python3 method/recompose.py routes inventory.before-template-callers.json <S>
node    method/resolve.cjs <S>                   # files 1177, URL expressions naming /api/: 852
python3 method/match.py <S> --probe-param-match  # with a client caller 1330 (literal 1230 + second pass 100)
python3 method/recompose.py merge inventory.before-template-callers.json <S> inventory.json "correction=…"
python3 method/match2.py inventory.json          # reclassified as probably called: 425
```

## Checks

- **The before file reproduces byte for byte.** The same commands with `match.py --literal-only` (no
  `resolve.cjs`) write a file that `cmp` finds identical to `inventory.before-template-callers.json`. The
  reconstruction of the route table, the literal pass and the assembly therefore change nothing on their own, and
  every difference below is the new pass.
- **The known case now resolves.**
  - After: `POST /api/audit/reviews/:id/sign` has `confidence: exact`,
    `callerAt: client/src/concept2cure/v2/surfaces/ComplianceReviewRecords.tsx:212`, `via: path-constant`,
    `how: import`, `pattern: /api/audit/reviews/${…}/sign`.
  - Before: `--literal-only`, on the same snapshot, gives `caller: null`.
  - At `HEAD` (`a15adc805`, client extracted the same way), the same row resolves to the same file:line.
- **The self-test passes, and fails when the method is broken.**
  - `python3 method/selftest-callers.py <empty dir>` prints `PASS`.
  - Two mutated copies of the method were run against it:
    - wildcards allowed to span segments, as in the literal pass: 4 FAILED (the runtime action segment and the
      runtime sub-path read as callers, and two rows were found only through a loose pattern);
    - lookup ignoring block scope: 2 FAILED (another function's `const` read as the head).
- **No row lost a caller, and no other row moved.** Exactly 100 rows changed: 85 `probable → exact` and
  15 `none → exact`. Every `exact` row of the before file is identical. Every row that stayed `probable` or `none`
  keeps the same caller.

## Counts by caller status

| Caller status | Before | After | Change |
|---|---:|---:|---:|
| exact | 1230 | 1330 | +100 |
| probable | 510 | 425 | -85 |
| none | 2183 | 2168 | -15 |
| **all handlers** | 3923 | 3923 | 0 |

| Client caller | Production verdict | Before | After | Change |
|---|---|---:|---:|---:|
| exact | infrastructure | 14 | 14 | +0 |
| exact | launch | 958 | 1034 | +76 |
| exact | never-gated | 76 | 83 | +7 |
| exact | out-of-scope | 148 | 162 | +14 |
| exact | unmapped | 34 | 37 | +3 |
| none | infrastructure | 32 | 32 | +0 |
| none | launch | 341 | 327 | -14 |
| none | never-gated | 72 | 71 | -1 |
| none | out-of-scope | 428 | 428 | +0 |
| none | unmapped | 1310 | 1310 | +0 |
| probable | infrastructure | 8 | 8 | +0 |
| probable | launch | 214 | 152 | -62 |
| probable | never-gated | 47 | 41 | -6 |
| probable | out-of-scope | 165 | 151 | -14 |
| probable | unmapped | 76 | 73 | -3 |

By what found them:

| Found by | Rows | Of which none → exact |
|---|---:|---:|
| `path-constant` (a constant, import, property, helper return or call-site argument substituted) | 41 | 12 |
| `concatenation` (a `+` chain joined; nothing substituted) | 51 | 0 |
| `template` (a template the regex had split at a nested `${…}` or backtick) | 8 | 3 |
| **all** | **100** | **15** |

The 100 rows fall in 46 route files.

What this moves in the README's sections:
- **§1, called and refused in production:** 182 rows before, 199 after. The new rows are `c2c/templates` (4), eTMF
  (4), governed-intelligence (4), `batch-draft`, `clinical-operations`, `decision-lineage`, `global-ri/catalog` and
  `orchestration/checkpoints`.
- **§2, served and not called:** 341 rows before, 327 after.
- **§3, route files with no caller:** 171 files and 1,227 handlers before, 170 files and 1,226 handlers after.
  `server/routes/k510-document-preview.ts` leaves the list.

For 25 of the 85 `probable → exact` rows, `match2.py` had named a different file from the caller now found.

## Every row whose caller changed (100), as of the first correction

Superseded: 7 of these rows were wrong (the only call uses another method), and 21 named a line other than the
call that sends the URL with the route's method. The current list, 120 rows, is in the second correction below.

"Before" gives the status, and for a probable row the file `match2.py` guessed. "Caller now" is the first site found,
ordered as follows: a parsed template first, then a `+` chain, then a substitution, and within each, by file and
line. "Client builds" is the URL as the client assembles it, with `${…}` for a runtime value.

| # | Method | Route | Before | Caller now (file:line) | Found by | Client builds | Production |
|---:|---|---|---|---|---|---|---|
| 1 | GET | `/api/510k/projects/:projectIdent/document-preview` | none | `client/src/concept2cure/mdx/hooks/useK510.ts:141` | template | `/api/510k/projects/${…}/document-preview` | launch |
| 2 | DELETE | `/api/admin/access/grants/:id` | probable (AdminPlatformGrants.tsx) | `client/src/concept2cure/v2/surfaces/AdminPlatformGrants.tsx:28` | path-constant: constant | `/api/admin/access/grants/${…}` | never-gated |
| 3 | PATCH | `/api/admin/master/feature-flags/:key` | probable (MasterLicensing.tsx) | `client/src/concept2cure/v2/surfaces/MasterLicensing.tsx:496` | path-constant: constant | `/api/admin/master/feature-flags/${…}` | never-gated |
| 4 | PATCH | `/api/admin/master/licensing/modules/:moduleId` | probable (MasterLicensing.tsx) | `client/src/concept2cure/v2/surfaces/MasterLicensing.tsx:389` | path-constant: constant | `/api/admin/master/licensing/modules/${…}` | never-gated |
| 5 | GET | `/api/admin/master/licensing/tenants/:id` | probable (Onboarding.tsx) | `client/src/concept2cure/v2/surfaces/MasterLicensing.tsx:251` | path-constant: constant | `/api/admin/master/licensing/tenants/${…}` | never-gated |
| 6 | POST | `/api/admin/master/licensing/trials/convert` | probable (TrialsPanel.tsx) | `client/src/concept2cure/v2/surfaces/licensing/TrialsPanel.tsx:297` | path-constant: constant | `/api/admin/master/licensing/trials/convert` | never-gated |
| 7 | POST | `/api/admin/master/licensing/trials/end` | probable (TrialsPanel.tsx) | `client/src/concept2cure/v2/surfaces/licensing/TrialsPanel.tsx:297` | path-constant: constant | `/api/admin/master/licensing/trials/end` | never-gated |
| 8 | PUT | `/api/ana-skills/organization/:id` | probable (SkillStudio.tsx) | `client/src/concept2cure/v2/SkillStudio.tsx:54` | path-constant: constant | `/api/ana-skills/organization/${…}` | launch |
| 9 | POST | `/api/audit/reviews/:id/sign` | none | `client/src/concept2cure/v2/surfaces/ComplianceReviewRecords.tsx:212` | path-constant: import | `/api/audit/reviews/${…}/sign` | never-gated |
| 10 | POST | `/api/batch-draft/documents/:id/accept` | probable (BatchDraft.tsx) | `client/src/concept2cure/v2/surfaces/BatchDraft.tsx:491` | concatenation | `/api/batch-draft/documents/${…}/accept` | unmapped |
| 11 | GET | `/api/biostat/knowledge/endpoint-method-matrix` | probable (biostatKnowledgeApi.ts) | `client/src/concept2cure/v2/surfaces/biostatKnowledgeApi.ts:149` | path-constant: constant+helper | `/api/biostat/knowledge/endpoint-method-matrix` | launch |
| 12 | POST | `/api/biostat/knowledge/ingest-csr` | probable (biostatKnowledgeApi.ts) | `client/src/concept2cure/v2/surfaces/biostatKnowledgeApi.ts:142` | path-constant: constant | `/api/biostat/knowledge/ingest-csr` | launch |
| 13 | GET | `/api/biostat/knowledge/method-landscape/:indication` | probable (biostatKnowledgeApi.ts) | `client/src/concept2cure/v2/surfaces/biostatKnowledgeApi.ts:144` | path-constant: constant | `/api/biostat/knowledge/method-landscape/${…}` | launch |
| 14 | POST | `/api/biostat/knowledge/query` | probable (biostatKnowledgeApi.ts) | `client/src/concept2cure/v2/surfaces/biostatKnowledgeApi.ts:141` | path-constant: constant | `/api/biostat/knowledge/query` | launch |
| 15 | GET | `/api/biostat/knowledge/trend/:concept` | probable (biostatKnowledgeApi.ts) | `client/src/concept2cure/v2/surfaces/biostatKnowledgeApi.ts:151` | path-constant: constant | `/api/biostat/knowledge/trend/${…}` | launch |
| 16 | DELETE | `/api/c2c/templates/:id` | probable (TemplateLibrary.tsx) | `client/src/concept2cure/v2/surfaces/TemplateLibrary.tsx:395` | concatenation | `/api/c2c/templates/${…}` | out-of-scope |
| 17 | GET | `/api/c2c/templates/:id` | probable (TemplateLibrary.tsx) | `client/src/concept2cure/v2/surfaces/TemplateLibrary.tsx:395` | concatenation | `/api/c2c/templates/${…}` | out-of-scope |
| 18 | PUT | `/api/c2c/templates/:id` | probable (TemplateLibrary.tsx) | `client/src/concept2cure/v2/surfaces/TemplateLibrary.tsx:395` | concatenation | `/api/c2c/templates/${…}` | out-of-scope |
| 19 | POST | `/api/c2c/templates/:id/render` | probable (TemplateLibrary.tsx) | `client/src/concept2cure/v2/surfaces/TemplateLibrary.tsx:417` | concatenation | `/api/c2c/templates/${…}/render` | out-of-scope |
| 20 | GET | `/api/cerv2/literature/screening` | none | `client/src/concept2cure/mdx/hooks/useCerLiterature.ts:372` | template | `/api/cerv2/literature/screening` | launch |
| 21 | PUT | `/api/client-branding/company-documents/branding-policy` | none | `client/src/concept2cure/v2/surfaces/company-documents/CompanyBrandingPolicy.tsx:17` | path-constant: import | `/api/client-branding/company-documents/branding-policy` | launch |
| 22 | GET | `/api/client-branding/company-documents/designs/:id` | probable (InsightsPackageStationery.tsx) | `client/src/concept2cure/v2/surfaces/company-documents/CompanyDesignDetail.tsx:21` | path-constant: import | `/api/client-branding/company-documents/designs/${…}` | launch |
| 23 | POST | `/api/client-branding/company-documents/designs/:id/proof` | none | `client/src/concept2cure/v2/surfaces/company-documents/CompanyDesignDetail.tsx:33` | path-constant: constant+import | `/api/client-branding/company-documents/designs/${…}/proof` | launch |
| 24 | POST | `/api/client-branding/company-documents/designs/:id/publish` | none | `client/src/concept2cure/v2/surfaces/company-documents/CompanyDesignDetail.tsx:25` | path-constant: argument+constant+import | `/api/client-branding/company-documents/designs/${…}/publish` | launch |
| 25 | POST | `/api/client-branding/company-documents/designs/:id/review` | probable (CompanyFilingIdentityReview.tsx) | `client/src/concept2cure/v2/surfaces/company-documents/CompanyDesignDetail.tsx:25` | path-constant: argument+constant+import | `/api/client-branding/company-documents/designs/${…}/review` | launch |
| 26 | GET | `/api/client-branding/company-documents/legacy-adoption` | probable (useCompanyDocumentSettings.ts) | `client/src/concept2cure/v2/surfaces/company-documents/CompanyLegacyAdoption.tsx:25` | path-constant: import | `/api/client-branding/company-documents/legacy-adoption` | launch |
| 27 | POST | `/api/client-branding/company-documents/legacy-adoption` | probable (useCompanyDocumentSettings.ts) | `client/src/concept2cure/v2/surfaces/company-documents/CompanyLegacyAdoption.tsx:25` | path-constant: import | `/api/client-branding/company-documents/legacy-adoption` | launch |
| 28 | GET | `/api/client-branding/company-documents/legal-documents` | probable (CompanySubmissionDocuments.tsx) | `client/src/concept2cure/v2/surfaces/CompanyDocumentSettings.tsx:162` | path-constant: import | `/api/client-branding/company-documents/legal-documents` | launch |
| 29 | POST | `/api/client-branding/company-documents/legal-documents` | probable (CompanySubmissionDocuments.tsx) | `client/src/concept2cure/v2/surfaces/CompanyDocumentSettings.tsx:162` | path-constant: import | `/api/client-branding/company-documents/legal-documents` | launch |
| 30 | DELETE | `/api/client-branding/company-documents/legal-documents/:id` | probable (CompanySubmissionDocuments.tsx) | `client/src/concept2cure/v2/surfaces/CompanyDocumentSettings.tsx:171` | path-constant: import | `/api/client-branding/company-documents/legal-documents/${…}` | launch |
| 31 | POST | `/api/client-branding/company-documents/letterhead/preview` | probable (useCompanyDocumentSettings.ts) | `client/src/concept2cure/v2/surfaces/useCompanyDocumentSettings.ts:167` | path-constant: constant | `/api/client-branding/company-documents/letterhead/preview` | launch |
| 32 | GET | `/api/client-branding/company-documents/permissions` | none | `client/src/concept2cure/v2/surfaces/company-documents/CompanyPermissionsPanel.tsx:47` | path-constant: import | `/api/client-branding/company-documents/permissions` | launch |
| 33 | PUT | `/api/client-branding/company-documents/permissions/:userId` | none | `client/src/concept2cure/v2/surfaces/company-documents/CompanyPermissionsPanel.tsx:25` | path-constant: import | `/api/client-branding/company-documents/permissions/${…}` | launch |
| 34 | GET | `/api/client-branding/company-documents/revisions` | none | `client/src/concept2cure/v2/surfaces/company-documents/CompanyPresentationHistory.tsx:64` | path-constant: import | `/api/client-branding/company-documents/revisions` | launch |
| 35 | GET | `/api/client-branding/company-documents/revisions/:revision` | none | `client/src/concept2cure/v2/surfaces/company-documents/CompanyPresentationHistory.tsx:41` | path-constant: import | `/api/client-branding/company-documents/revisions/${…}` | launch |
| 36 | GET | `/api/clinical-operations/studies/:studyId/deviations` | probable (ClinicalOps.tsx) | `client/src/concept2cure/v2/surfaces/ClinicalOps.tsx:356` | concatenation | `/api/clinical-operations/studies/${…}/deviations` | unmapped |
| 37 | PUT | `/api/cmc/batch-records/:id` | probable (CmcModule.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:2330` | concatenation | `/api/cmc/batch-records/${…}` | launch |
| 38 | POST | `/api/cmc/batch-records/:id/release` | probable (cmcSpec.ts) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:2386` | concatenation | `/api/cmc/batch-records/${…}/release` | launch |
| 39 | GET | `/api/cmc/batch-records/:projectId` | probable (CmcModule.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:2330` | concatenation | `/api/cmc/batch-records/${…}` | launch |
| 40 | POST | `/api/cmc/module3-os/build-section/:projectId/:sectionKey` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx:280` | concatenation | `/api/cmc/module3-os/build-section/${…}/${…}` | launch |
| 41 | GET | `/api/cmc/module3-os/build-state/:projectId` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx:205` | concatenation | `/api/cmc/module3-os/build-state/${…}` | launch |
| 42 | POST | `/api/cmc/module3-os/compile/:projectId` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx:263` | concatenation | `/api/cmc/module3-os/compile/${…}` | launch |
| 43 | PATCH | `/api/cmc/module3-os/contradictions/:id/resolve` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx:318` | concatenation | `/api/cmc/module3-os/contradictions/${…}/resolve` | launch |
| 44 | GET | `/api/cmc/module3-os/contradictions/:projectId` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:2823` | concatenation | `/api/cmc/module3-os/contradictions/${…}` | launch |
| 45 | POST | `/api/cmc/module3-os/contradictions/:projectId` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:2823` | concatenation | `/api/cmc/module3-os/contradictions/${…}` | launch |
| 46 | POST | `/api/cmc/module3-os/guard/final-export/:projectId` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx:337` | concatenation | `/api/cmc/module3-os/guard/final-export/${…}` | launch |
| 47 | POST | `/api/cmc/module3-os/place-into-submission/:projectId` | probable (CmcPlaceIntoSubmission.tsx) | `client/src/concept2cure/v2/surfaces/CmcPlaceIntoSubmission.tsx:91` | concatenation | `/api/cmc/module3-os/place-into-submission/${…}` | launch |
| 48 | GET | `/api/cmc/module3-os/provenance/:projectId/:sectionKey` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:2848` | concatenation | `/api/cmc/module3-os/provenance/${…}/${…}` | launch |
| 49 | GET | `/api/cmc/module3-os/readiness/:projectId` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:669` | concatenation | `/api/cmc/module3-os/readiness/${…}` | launch |
| 50 | GET | `/api/cmc/module3-os/sections/:projectId` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:2820` | concatenation | `/api/cmc/module3-os/sections/${…}` | launch |
| 51 | GET | `/api/cmc/module3-os/source-evidence/:projectId` | probable (CmcSectionEvidence.tsx) | `client/src/concept2cure/v2/surfaces/CmcSectionEvidence.tsx:225` | concatenation | `/api/cmc/module3-os/source-evidence/${…}` | launch |
| 52 | POST | `/api/cmc/module3-os/source-evidence/:projectId` | probable (CmcSectionEvidence.tsx) | `client/src/concept2cure/v2/surfaces/CmcSectionEvidence.tsx:225` | concatenation | `/api/cmc/module3-os/source-evidence/${…}` | launch |
| 53 | GET | `/api/cmc/module3-os/source-evidence/:projectId/documents` | probable (CmcSectionEvidence.tsx) | `client/src/concept2cure/v2/surfaces/CmcSectionEvidence.tsx:227` | path-constant: constant | `/api/cmc/module3-os/source-evidence/${…}/documents` | launch |
| 54 | GET | `/api/cmc/projects/:projectId/process-capability` | probable (CmcModule.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:2630` | concatenation | `/api/cmc/projects/${…}/process-capability` | launch |
| 55 | GET | `/api/cmc/quality/qbd/:projectId` | probable (CmcQuality.tsx) | `client/src/concept2cure/v2/surfaces/CmcQuality.tsx:166` | concatenation | `/api/cmc/quality/qbd/${…}` | launch |
| 56 | PUT | `/api/cmc/specifications/:id` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:1127` | concatenation | `/api/cmc/specifications/${…}` | launch |
| 57 | POST | `/api/cmc/specifications/:id/approve` | probable (cmcSpec.ts) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:1215` | concatenation | `/api/cmc/specifications/${…}/approve` | launch |
| 58 | GET | `/api/cmc/specifications/:projectId` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:1127` | concatenation | `/api/cmc/specifications/${…}` | launch |
| 59 | PUT | `/api/cmc/stability-studies/:id` | probable (cmcRegisterForms.ts) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:1646` | concatenation | `/api/cmc/stability-studies/${…}` | launch |
| 60 | POST | `/api/cmc/stability-studies/:id/shelf-life` | probable (cmcRegisterForms.ts) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:1680` | concatenation | `/api/cmc/stability-studies/${…}/shelf-life` | launch |
| 61 | POST | `/api/cmc/stability-studies/:id/trending` | probable (CmcModule.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:1718` | concatenation | `/api/cmc/stability-studies/${…}/trending` | launch |
| 62 | GET | `/api/coauthor/documents/:docId/compliance` | probable (EctdCoauthor.tsx) | `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:191` | concatenation | `/api/coauthor/documents/${…}/compliance` | launch |
| 63 | POST | `/api/coauthor/documents/:docId/validate` | probable (EctdCoauthor.tsx) | `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:183` | concatenation | `/api/coauthor/documents/${…}/validate` | launch |
| 64 | DELETE | `/api/coauthor/documents/:id` | probable (EctdCoauthor.tsx) | `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:399` | concatenation | `/api/coauthor/documents/${…}` | launch |
| 65 | GET | `/api/coauthor/documents/:id` | probable (EctdCoauthor.tsx) | `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:399` | concatenation | `/api/coauthor/documents/${…}` | launch |
| 66 | PUT | `/api/coauthor/documents/:id` | probable (EctdCoauthor.tsx) | `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:399` | concatenation | `/api/coauthor/documents/${…}` | launch |
| 67 | GET | `/api/csr/jobs/:jobId/assembly/:assemblyId/lifecycle` | none | `client/src/concept2cure/v2/surfaces/CsrPlacementLifecycle.tsx:44` | path-constant: argument+constant | `/api/csr/jobs/${…}/assembly/${…}/lifecycle` | launch |
| 68 | POST | `/api/csr/jobs/:jobId/assembly/:assemblyId/place` | probable (CsrAssemblyControl.tsx) | `client/src/concept2cure/v2/surfaces/CsrAssemblyControl.tsx:284` | path-constant: argument+constant | `/api/csr/jobs/${…}/assembly/${…}/place` | launch |
| 69 | POST | `/api/csr/jobs/:jobId/assembly/:assemblyId/withdraw-placement` | none | `client/src/concept2cure/v2/surfaces/CsrPlacementLifecycle.tsx:124` | path-constant: argument+constant | `/api/csr/jobs/${…}/assembly/${…}/withdraw-placement` | launch |
| 70 | GET | `/api/csr/jobs/:jobId/assembly/targets` | probable (CsrAssemblyControl.tsx) | `client/src/concept2cure/v2/surfaces/CsrAssemblyControl.tsx:250` | path-constant: argument+constant | `/api/csr/jobs/${…}/assembly/targets` | launch |
| 71 | GET | `/api/csr/jobs/:jobId/headings` | probable (CsrRunBuilds.tsx) | `client/src/concept2cure/v2/surfaces/CsrRunBuilds.tsx:112` | path-constant: constant | `/api/csr/jobs/${…}/headings` | launch |
| 72 | GET | `/api/decision-lineage/:entityType/:entityId/export` | probable (decision-lineage-data.ts) | `client/src/concept2cure/v2/surfaces/DecisionLineage.tsx:232` | concatenation | `/api/decision-lineage/${…}/${…}/export` | out-of-scope |
| 73 | GET | `/api/ectd-compile/:projectIdent/filed-state` | none | `client/src/concept2cure/v2/surfaces/EctdFiledState.tsx:107` | path-constant: argument+constant | `/api/ectd-compile/${…}/filed-state` | launch |
| 74 | GET | `/api/ectd-compile/:projectIdent/status` | probable (schema.ts) | `client/src/concept2cure/v2/surfaces/EctdCompile.tsx:1003` | path-constant: constant | `/api/ectd-compile/${…}/status` | launch |
| 75 | GET | `/api/etmf/trials/:trialId/artifacts` | probable (Etmf.tsx) | `client/src/concept2cure/v2/surfaces/Etmf.tsx:385` | concatenation | `/api/etmf/trials/${…}/artifacts` | out-of-scope |
| 76 | POST | `/api/etmf/trials/:trialId/artifacts` | probable (Etmf.tsx) | `client/src/concept2cure/v2/surfaces/Etmf.tsx:385` | concatenation | `/api/etmf/trials/${…}/artifacts` | out-of-scope |
| 77 | GET | `/api/etmf/trials/:trialId/completeness` | probable (Etmf.tsx) | `client/src/concept2cure/v2/surfaces/Etmf.tsx:130` | concatenation | `/api/etmf/trials/${…}/completeness` | out-of-scope |
| 78 | GET | `/api/etmf/trials/:trialId/inspection-package` | probable (Etmf.tsx) | `client/src/concept2cure/v2/surfaces/Etmf.tsx:424` | concatenation | `/api/etmf/trials/${…}/inspection-package` | out-of-scope |
| 79 | GET | `/api/global-ri/catalog/:group` | probable (useGlobalRiCatalog.ts) | `client/src/hooks/useGlobalRiCatalog.ts:21` | path-constant: constant | `/api/global-ri/catalog/${…}` | out-of-scope |
| 80 | GET | `/api/governed-intelligence-inconsistency/projects/:projectId/inconsistency` | probable (Inconsistency.tsx) | `client/src/concept2cure/v2/surfaces/Inconsistency.tsx:227` | concatenation | `/api/governed-intelligence-inconsistency/projects/${…}/inconsistency` | unmapped |
| 81 | POST | `/api/governed-intelligence/assumptions/:id/revalue` | probable (Inconsistency.tsx) | `client/src/concept2cure/v2/surfaces/Inconsistency.tsx:650` | concatenation | `/api/governed-intelligence/assumptions/${…}/revalue` | out-of-scope |
| 82 | POST | `/api/governed-intelligence/contradictions/:id/review` | probable (Inconsistency.tsx) | `client/src/concept2cure/v2/surfaces/Inconsistency.tsx:192` | concatenation | `/api/governed-intelligence/contradictions/${…}/review` | out-of-scope |
| 83 | POST | `/api/governed-intelligence/contradictions/scan/:projectId` | probable (Inconsistency.tsx) | `client/src/concept2cure/v2/surfaces/Inconsistency.tsx:418` | concatenation | `/api/governed-intelligence/contradictions/scan/${…}` | out-of-scope |
| 84 | PATCH | `/api/human-factors/scenarios/:id/mitigate` | probable (HumanFactors.tsx) | `client/src/concept2cure/v2/surfaces/HumanFactors.tsx:362` | concatenation | `/api/human-factors/scenarios/${…}/mitigate` | launch |
| 85 | GET | `/api/ind-master-data/sponsors/:id` | probable (IndApplicantIdentity.tsx) | `client/src/concept2cure/v2/surfaces/IndApplicantIdentity.tsx:107` | template | `/api/ind-master-data/sponsors/${…}` | launch |
| 86 | PATCH | `/api/ind-master-data/sponsors/:id` | probable (IndApplicantIdentity.tsx) | `client/src/concept2cure/v2/surfaces/IndApplicantIdentity.tsx:107` | template | `/api/ind-master-data/sponsors/${…}` | launch |
| 87 | PATCH | `/api/insights/subscriptions/:id` | probable (InsightsSchedulesPanel.tsx) | `client/src/concept2cure/v2/surfaces/insightsLibraryModel.ts:598` | template | `/api/insights/subscriptions/${…}` | launch |
| 88 | GET | `/api/mdx-rbm/rbm-board/:programId` | probable (rbm-data.ts) | `client/src/concept2cure/v2/surfaces/Rbm.tsx:143` | concatenation | `/api/mdx-rbm/rbm-board/${…}` | launch |
| 89 | GET | `/api/mdx/labeling/:id` | probable (SignedContentState.tsx) | `client/src/concept2cure/v2/surfaces/LabelingSignatures.tsx:76` | concatenation | `/api/mdx/labeling/${…}` | launch |
| 90 | PATCH | `/api/mdx/labeling/:id` | probable (SignedContentState.tsx) | `client/src/concept2cure/v2/surfaces/LabelingSignatures.tsx:76` | concatenation | `/api/mdx/labeling/${…}` | launch |
| 91 | PATCH | `/api/mdx/labeling/translations/:transId` | probable (Labeling.tsx) | `client/src/concept2cure/v2/surfaces/Labeling.tsx:314` | concatenation | `/api/mdx/labeling/translations/${…}` | launch |
| 92 | PUT | `/api/mdx/notification-subscriptions/:category` | probable (NotificationPreferences.tsx) | `client/src/concept2cure/v2/NotificationPreferences.tsx:77` | path-constant: constant | `/api/mdx/notification-subscriptions/${…}` | launch |
| 93 | POST | `/api/orchestration/checkpoints/:id/decision` | probable (Orchestration.tsx) | `client/src/concept2cure/v2/surfaces/Orchestration.tsx:668` | concatenation | `/api/orchestration/checkpoints/${…}/decision` | out-of-scope |
| 94 | DELETE | `/api/realtime-collab/rooms/:documentId/users/me` | none | `client/src/concept2cure/v2/surfaces/AuthoringCollab.tsx:110` | path-constant: constant | `/api/realtime-collab/rooms/${…}/users/me` | launch |
| 95 | GET | `/api/region-profiles/:region` | none | `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx:551` | template | `/api/region-profiles/${…}` | launch |
| 96 | GET | `/api/report-os/bundles/:bundleId/export.pdf` | probable (Insights.tsx) | `client/src/concept2cure/v2/surfaces/Insights.tsx:1396` | path-constant: constant | `/api/report-os/bundles/${…}/export.pdf` | launch |
| 97 | POST | `/api/submissions/sequences/:seqId/transition` | probable (SubmissionCenter.tsx) | `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx:767` | template | `/api/submissions/sequences/${…}/transition` | launch |
| 98 | POST | `/api/submissions/sequences/:seqId/transmit` | probable (SubmissionCenter.tsx) | `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx:910` | template | `/api/submissions/sequences/${…}/transmit` | launch |
| 99 | POST | `/api/task-management/tasks/from-template/:templateId` | probable (TaskBoard.tsx) | `client/src/concept2cure/v2/surfaces/TaskBoard.tsx:2175` | concatenation | `/api/task-management/tasks/from-template/${…}` | launch |
| 100 | POST | `/api/vault/legal-holds/:id/lift` | probable (LegalHoldsCard.tsx) | `client/src/concept2cure/v2/surfaces/LegalHoldsCard.tsx:208` | path-constant: constant | `/api/vault/legal-holds/${…}/lift` | launch |

## Not applied: a literal client segment read as a route parameter (8 rows; 9 after the second correction)

`--probe-param-match` lists these rows. Each would count as called only if a route's `:param` may match a literal
segment that the client sends. Express does route such a request to the parameter route when no literal route
comes first. That makes it a question of route order, not of how the URL was built, so these rows are left as they
were. Check them by hand before a retirement:

| Method | Route | Client sends | At |
|---|---|---|---|
| GET | `/api/auth/sso/:provider/initiate` | `/api/auth/sso/saml/initiate` | `client/src/concept2cure/components/concept2cure-auth/OrganizationSso.tsx:43` |
| DELETE | `/api/ivd-assessments/:id` | `/api/ivd-assessments/documents` | `client/src/concept2cure/v2/surfaces/IvdAssessmentWorkbench.tsx:71` |
| GET | `/api/ivd-assessments/:id` | `/api/ivd-assessments/documents` | `client/src/concept2cure/v2/surfaces/IvdAssessmentWorkbench.tsx:71` |
| GET | `/api/mdx/cdx/:programId` | `/api/mdx/cdx/pairings` | `client/src/concept2cure/mdx/hooks/useCdxClia.ts:106` |
| GET | `/api/mdx/ivdr/:programId` | `/api/mdx/ivdr/classifications` | `client/src/concept2cure/mdx/hooks/useIvd.ts:98` |
| GET | `/api/mdx/udi/:id` | `/api/mdx/udi/summary` | `client/src/concept2cure/mdx/hooks/useUdi.ts:73` |
| PATCH | `/api/mdx/udi/:id` | `/api/mdx/udi/summary` | `client/src/concept2cure/mdx/hooks/useUdi.ts:73` |
| GET | `/api/submissions/:id` | `/api/submissions/market-support` | `client/src/concept2cure/v2/MarketSupportLine.tsx:45` |

The first is a real call to the parameter route (`provider = saml`). The others are most likely calls to their own
literal routes, which only route order would send to the parameter route.

## Limits that remained after the first correction

- **Still static analysis.** A URL assembled at runtime from data is invisible to it: a server response, a
  registry looked up by key, or a `let` reassigned. So is a call made by an AnA tool or the MCP connector, which
  reaches *services*, not routes.
- **What still reads as not called:** a parameter whose call sites pass runtime values; a class field
  (`this.baseUrl`); a wrapper more than one call deep (`memo(forwardRef(…))`); a URL handed over through React
  context.
- **The HTTP method is not compared,** in either pass. A route counts as called when a client builds its path
  with any method.
- **The literal pass keeps its loose matches.** It still lets `${…}` span segments, so a template ending in a
  runtime value can mark deeper routes as called. That over-counts. This correction does not touch it, so that
  the before file stays reproducible.
- **The inventory is measured at `18261a908`.** The client has changed since. At `HEAD` (`a15adc805`) the same
  method finds 1,334 handlers with a client caller against the same route table, against 1,330 at `18261a908`.

## Second correction (2026-11-01): the HTTP method, the call that sends the URL, and two more URL shapes

### What the refuters found

Three refuters checked the first correction: every one of its 100 rows, the 89 "none" rows in governed areas plus
32 DELETE rows, and a sample of 40 "none" rows. They found:

1. **The method was not compared.** The second pass counted a call with any method. 7 rows were marked exact on a
   call that uses another method (DELETE and GET `/api/c2c/templates/:id` on a PUT, PUT `/api/cmc/batch-records/:id`
   on a GET, DELETE `/api/coauthor/documents/:id` on a PUT, GET `/api/etmf/trials/:trialId/artifacts` on a POST,
   GET `/api/ind-master-data/sponsors/:id` on a PATCH or POST, PATCH `/api/mdx/labeling/:id` on a GET). 5 more
   named a call with another method while the real call was elsewhere.
2. **The line was where the URL is built, not where it is sent** (`const target = …` at one line, the call at
   another).
3. **A URL made only of substitutions, from objects in a `const` array, was not read.**
   `biostatCalculatorContract.ts:116` builds `` `${calc.base ?? DEFAULT_CALCULATOR_BASE}${calc.path}` `` from the
   calculator tables in `biostatCalculators.ts` and `biostatCalculatorsIvd.ts`, and `BiostatWorkbench.tsx:375` posts
   it. 23 launch routes read "none": all 13 of `server/routes/biostat-design-stats.ts` and all 10 of
   `server/routes/diagnostics-performance.ts`, which README §2 listed as reach candidates.
4. **A callback handed down as a prop was not followed.** `CmcSectionEvidence.tsx` passes `write` two components
   down, and the child calls `` write(`/${id}/unlink`) ``.
5. **A URL taken from a server response** (`GlobalRiBrowser.griRun` runs the last route of each capability in
   `GET /api/global-ri/catalog`): 32 "none" rows and 9 "probable" rows are called. This cannot be read from the
   client's source. It is a known blind spot, listed below and in the README.
6. **A runtime prefix-rewrite map** (`rbmEndpoint`, `rbmWrites.tsx:23-42`). Also a blind spot; it leaves rows
   "probable", none "none".
7. **The literal pass does not compare methods either**, on rows neither correction touched (for example
   `POST /api/mdx/labeling/:id/symbols` is exact, and the client only GETs `/symbols`).

The refuters also confirmed the direction that matters for P-87: all 15 rows the first correction moved from "none"
to "exact" are real calls with the right method, the known case among them.

### What changed in the method

1. **`method/resolve.cjs`**
   - **Sinks.** Each URL is followed from where it is built to the call it is handed to: through `const` and `let`
     names, a helper's return (to the helper's call sites), a JSX prop (into the component), `new URL(…)`, and a
     query string appended after it. Each sink is recorded as `{ file, line, methods }`, the line being the
     argument as the client wrote it.
   - **The method of a call** comes from:
     - an HTTP verb among its other arguments (`apiCall('POST', u)`), including a `const`, a conditional of verbs,
       or a parameter bound at the caller;
     - an options object's `method` (`fetch(u, { method })`), and `fetch` with no method is GET;
     - react-query's `queryKey: [u]`, which the default query function (`client/src/lib/queryClient.ts`) GETs;
     - `x.get/post/put/patch/delete(u)`, `EventSource`, `window.open` and `<a href>`;
     - otherwise, following the argument into the called client function with that function's parameters bound
       to the call's arguments (`useLiveData(u)` → `liveGetOrNull` → `apiRequest('GET', …)`;
       `resource.file(u)` → the `file` function the hook returns).
   - A value that is only compared, rendered as text or listed in a hook's dependency array is not a sink. When no
     sink's method can be read, the method is unknown.
   - **`element`, a new substitution.** A parameter or prop fed from a `const` array (`ARR.find(…)`, `ARR[i]`,
     `ARR.filter(…)[0]`, spreads, `useMemo(() => …)`) is bound to each object of the array in turn, and the URL is
     evaluated once per object. So `${calc.base ?? BASE}${calc.path}` keeps each calculator's base with its own
     path.
   - `??` and `||` take the left side alone when it is always a known, non-empty string. Before, they always added
     the right side as well.
   - A URL made only of substitutions, with no literal `/`, is now evaluated too.
   - **More call sites:**
     - a function handed to a component as a prop and called there, through any number of components;
     - a function in an object literal, called as `api.name(…)`;
     - a method of an object that a client function returns (`const r = useX(); r.call(…)`).
2. **`method/match.py`, second pass.** A route the pass finds is:
   - **exact** when a call sends its path with its method. `callerAt` is that call and `builtAt` is where the URL is
     assembled;
   - **probable** when the path is built but no call with a known method sends it with this one, and some call's
     method cannot be read. It gets `callMethod: unknown`. No row is in this state at `18261a908`; the self-test
     holds the case;
   - **not claimed** when every call that sends the path uses another method. The row is left to `match2.py`, as
     before the first correction, with `samePathAt` and `samePathMethods` saying where and how the client sends
     that path.

   The literal pass is unchanged and still does not compare methods.
3. **`method/recompose.py`** carries the new fields. **`method/match2.py`** keeps a confidence that a pass has
   already set; before, it marked every row with a caller "exact".
4. **`method/selftest-callers.py`** gained 12 rows and 3 checks of `samePathAt`:
   - a PUT and a GET to a path are not calls to its DELETE;
   - a call whose method cannot be read is only probable;
   - the caller is the line that sends the URL;
   - URLs from a `const` array of objects through a JSX prop and a helper, with each object's base kept with its
     own path (`POST /api/stats/linearity` must not be found);
   - a callback handed down two components.

### How it was re-run

The commands are those of the first correction, unchanged, from a client extracted at `18261a908` with
`git archive`:

```
python3 method/recompose.py routes inventory.before-template-callers.json <S>
node    method/resolve.cjs <S>                   # files 1177, URL expressions naming /api/: 893, 833 with a known method
python3 method/match.py <S> --probe-param-match  # with a client caller 1350 (literal 1230 + second pass 120, all exact);
                                                 # 7 left to match2.py with the same path sent by another method
python3 method/recompose.py merge inventory.before-template-callers.json <S> inventory.json "correction=…"
python3 method/match2.py inventory.json          # reclassified as probably called: 428
```

### Checks

- **The before file still reproduces byte for byte.** `match.py --literal-only`, then `recompose.py merge` and
  `match2.py`, give a file that `cmp` finds identical to `inventory.before-template-callers.json`.
- **The new inventory reproduces byte for byte.** A second run of the commands above from `method/` gives an
  `inventory.json` that `cmp` finds identical.
- **The known case.** `POST /api/audit/reviews/:id/sign` is exact at
  `client/src/concept2cure/v2/surfaces/ComplianceReviewRecords.tsx:212` (`apiCall('POST', …)`), `via:
  path-constant`, `how: import`. The same method on the client at `HEAD` (`88ac297b0`) gives the same file and
  line.
- **The self-test passes, and fails on each broken copy of the method.** `python3 method/selftest-callers.py <empty
  dir>` prints `PASS` (26 checks). Seven mutated copies of the method were run against it:

  | Broken copy | Checks failed |
  |---|---:|
  | the second pass ignores the method | 6 |
  | no fan-out over a `const` array's objects | 4 |
  | callbacks handed down as props not followed | 1 |
  | `callerAt` is where the URL is built, not the call | 4 |
  | `??` always adds its right-hand side | 1 |
  | wildcards span segments (from the first correction) | 4 |
  | lookup ignores block scope (from the first correction) | 1 |

- **Every refuter finding was checked against the new rows:**
  - the 7 wrong-method rows are no longer claimed and carry `samePathAt`;
  - the 5 rows that named a call with another method, and the 3 that named the declaration, now name a call that
    sends the path with the route's method, in the file the refuters named (for the legal-documents GET,
    `CompanyLegalInventory.tsx:60`, where the URL built at `:27` is sent);
  - the 23 biostatistics and diagnostics rows are exact at `BiostatWorkbench.tsx:375`, as are
    `analytical/stability` and the two Part 11 re-authentication routes, `/api/esignature/verify-mfa` and
    `/verify-password`;
  - `POST …/source-evidence/:projectId/:linkId/unlink` is exact at `CmcSectionEvidence.tsx:233`.
- **One refuter row is kept as exact, on purpose.** `GET /api/global-ri/catalog/:group` is sent by
  `useGlobalRiCatalog.ts:34`, inside `globalRiGroupCatalogOptions`, whose only caller,
  `useGlobalRiGroupCatalog`, is never called. "Exact" means the client's source sends the path with the method.
  It does not mean the code that sends it is reached from a screen. That is true of the literal pass as well
  (README §1 names `client/src/concept2cure/v2/fixtures/decision-lineage-data.ts` as a caller).

### Counts

The same 3,923 handlers at `18261a908`:

| Caller status | As first filed | First correction | Second correction |
|---|---:|---:|---:|
| exact | 1,230 | 1,330 | 1,350 |
| probable | 510 | 425 | 428 |
| none | 2,183 | 2,168 | 2,145 |

| Client caller | Production verdict | As first filed | Second correction | Change |
|---|---|---:|---:|---:|
| exact | infrastructure | 14 | 14 | +0 |
| exact | launch | 958 | 1057 | +99 |
| exact | never-gated | 76 | 83 | +7 |
| exact | out-of-scope | 148 | 159 | +11 |
| exact | unmapped | 34 | 37 | +3 |
| none | infrastructure | 32 | 32 | +0 |
| none | launch | 341 | 304 | -37 |
| none | never-gated | 72 | 71 | -1 |
| none | out-of-scope | 428 | 428 | +0 |
| none | unmapped | 1310 | 1310 | +0 |
| probable | infrastructure | 8 | 8 | +0 |
| probable | launch | 214 | 152 | -62 |
| probable | never-gated | 47 | 41 | -6 |
| probable | out-of-scope | 165 | 154 | -11 |
| probable | unmapped | 76 | 73 | -3 |

Against the inventory as first filed, 120 rows changed: 38 from none to exact and 82 from probable to exact. No
row lost a caller, and no exact row of the first filing changed.
- **By what found them:** 69 by substitution (24 of them through a `const` array's objects), 44 by joining a `+`
  chain, and 7 from templates the regex had split.
- **The README's sections:**
  - **§1, called and refused:** 182 as first filed, 199 after the first correction, 196 now. The three out-of-scope
    rows the first correction claimed on another method's call leave it.
  - **§2, served and not called:** 341, then 327, now 304. The 23 biostatistics and diagnostics rows leave it.
  - **§3, route files with no caller:** 171, then 170, now 170 (1,226 handlers). Only
    `server/routes/k510-document-preview.ts` has left it. 20 of the 170 are global-RI files that
    `GlobalRiBrowser` does call (blind spot 1 below).

### What the second correction changed from the first (55 rows)

| # | Method | Route | First correction | Now | Why |
|---:|---|---|---|---|---|
| 1 | GET | `/api/510k/projects/:projectIdent/document-preview` | exact `client/src/concept2cure/mdx/hooks/useK510.ts:141` | exact `client/src/concept2cure/mdx/hooks/useK510.ts:143` | the first correction named where the URL is built; this is the call that sends it |
| 2 | GET | `/api/admin/master/licensing/tenants/:id` | exact `client/src/concept2cure/v2/surfaces/MasterLicensing.tsx:251` | exact `client/src/concept2cure/v2/surfaces/MasterLicensing.tsx:254` | the first correction named where the URL is built; this is the call that sends it |
| 3 | POST | `/api/admin/master/licensing/trials/convert` | exact `client/src/concept2cure/v2/surfaces/licensing/TrialsPanel.tsx:297` | exact `client/src/concept2cure/v2/surfaces/licensing/TrialsPanel.tsx:298` | the first correction named where the URL is built; this is the call that sends it |
| 4 | POST | `/api/admin/master/licensing/trials/end` | exact `client/src/concept2cure/v2/surfaces/licensing/TrialsPanel.tsx:297` | exact `client/src/concept2cure/v2/surfaces/licensing/TrialsPanel.tsx:298` | the first correction named where the URL is built; this is the call that sends it |
| 5 | POST | `/api/biostat/assurance` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 6 | POST | `/api/biostat/diagnostic/bayesian-device` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 7 | POST | `/api/biostat/diagnostic/mrmc` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 8 | POST | `/api/biostat/diagnostic/sizing` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 9 | POST | `/api/biostat/dose-finding/boin` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 10 | POST | `/api/biostat/enrollment/backtest` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 11 | POST | `/api/biostat/enrollment/forecast` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 12 | POST | `/api/biostat/external-control/sensitivity` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 13 | POST | `/api/biostat/mmrm/power` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 14 | POST | `/api/biostat/mmrm/sample-size` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 15 | POST | `/api/biostat/multiplicity/test` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 16 | POST | `/api/biostat/survival/rmst` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 17 | POST | `/api/biostat/win-ratio` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 18 | DELETE | `/api/c2c/templates/:id` | exact `client/src/concept2cure/v2/surfaces/TemplateLibrary.tsx:395` | probable (TemplateLibrary.tsx) | the client sends this path only with PUT (`client/src/concept2cure/v2/surfaces/TemplateLibrary.tsx:395`): no longer claimed; `match2.py` decides, as before the first correction |
| 19 | GET | `/api/c2c/templates/:id` | exact `client/src/concept2cure/v2/surfaces/TemplateLibrary.tsx:395` | probable (TemplateLibrary.tsx) | the client sends this path only with PUT (`client/src/concept2cure/v2/surfaces/TemplateLibrary.tsx:395`): no longer claimed; `match2.py` decides, as before the first correction |
| 20 | GET | `/api/cerv2/literature/screening` | exact `client/src/concept2cure/mdx/hooks/useCerLiterature.ts:372` | exact `client/src/concept2cure/mdx/hooks/useCerLiterature.ts:386` | the first correction named where the URL is built; this is the call that sends it |
| 21 | GET | `/api/client-branding/company-documents/designs/:id` | exact `client/src/concept2cure/v2/surfaces/company-documents/CompanyDesignDetail.tsx:21` | exact `client/src/concept2cure/v2/surfaces/company-documents/CompanyDesignDetail.tsx:51` | the first correction named where the URL is built; this is the call that sends it with the route's method |
| 22 | POST | `/api/client-branding/company-documents/legacy-adoption` | exact `client/src/concept2cure/v2/surfaces/company-documents/CompanyLegacyAdoption.tsx:25` | exact `client/src/concept2cure/v2/surfaces/useCompanyDocumentSettings.ts:112` | the first correction named a call with another method; this is the call with the route's method |
| 23 | GET | `/api/client-branding/company-documents/legal-documents` | exact `client/src/concept2cure/v2/surfaces/CompanyDocumentSettings.tsx:162` | exact `client/src/concept2cure/v2/surfaces/company-documents/CompanyLegalInventory.tsx:60` | the first correction named a call with another method; this is the call with the route's method |
| 24 | POST | `/api/client-branding/company-documents/letterhead/preview` | exact `client/src/concept2cure/v2/surfaces/useCompanyDocumentSettings.ts:167` | exact `client/src/concept2cure/v2/surfaces/useCompanyDocumentSettings.ts:170` | the first correction named where the URL is built; this is the call that sends it |
| 25 | GET | `/api/client-branding/company-documents/revisions` | exact `client/src/concept2cure/v2/surfaces/company-documents/CompanyPresentationHistory.tsx:64` | exact `client/src/concept2cure/v2/surfaces/company-documents/CompanyPresentationHistory.tsx:65` | the first correction named where the URL is built; this is the call that sends it |
| 26 | PUT | `/api/cmc/batch-records/:id` | exact `client/src/concept2cure/v2/surfaces/CmcModule.tsx:2330` | probable (CmcModule.tsx) | the client sends this path only with GET (`client/src/concept2cure/v2/surfaces/CmcModule.tsx:2330`): no longer claimed; `match2.py` decides, as before the first correction |
| 27 | POST | `/api/cmc/module3-os/contradictions/:projectId` | exact `client/src/concept2cure/v2/surfaces/CmcModule.tsx:2823` | exact `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx:289` | the first correction named a call with another method; this is the call with the route's method |
| 28 | GET | `/api/cmc/module3-os/source-evidence/:projectId` | exact `client/src/concept2cure/v2/surfaces/CmcSectionEvidence.tsx:225` | exact `client/src/concept2cure/v2/surfaces/CmcSectionEvidence.tsx:226` | the first correction named where the URL is built; this is the call that sends it |
| 29 | POST | `/api/cmc/module3-os/source-evidence/:projectId` | exact `client/src/concept2cure/v2/surfaces/CmcSectionEvidence.tsx:225` | exact `client/src/concept2cure/v2/surfaces/CmcSectionEvidence.tsx:233` | the first correction named where the URL is built; this is the call that sends it with the route's method |
| 30 | POST | `/api/cmc/module3-os/source-evidence/:projectId/:linkId/unlink` | probable (CmcSectionEvidence.tsx) | exact `client/src/concept2cure/v2/surfaces/CmcSectionEvidence.tsx:233` | new: a callback handed down two components as a prop |
| 31 | PUT | `/api/cmc/specifications/:id` | exact `client/src/concept2cure/v2/surfaces/CmcModule.tsx:1127` | exact `client/src/concept2cure/v2/surfaces/CmcModule.tsx:1184` | the first correction named a call with another method; this is the call with the route's method |
| 32 | DELETE | `/api/coauthor/documents/:id` | exact `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:399` | probable (EctdCoauthor.tsx) | the client sends this path only with GET, PUT (`client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:399`): no longer claimed; `match2.py` decides, as before the first correction |
| 33 | GET | `/api/coauthor/documents/:id` | exact `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:399` | exact `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:410` | the first correction named a call with another method; this is the call with the route's method |
| 34 | GET | `/api/decision-lineage/:entityType/:entityId/export` | exact `client/src/concept2cure/v2/surfaces/DecisionLineage.tsx:232` | exact `client/src/concept2cure/v2/surfaces/DecisionLineage.tsx:235` | the first correction named where the URL is built; this is the call that sends it |
| 35 | POST | `/api/diagnostics-performance/analytical/detection-capability` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 36 | POST | `/api/diagnostics-performance/analytical/imprecision` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 37 | POST | `/api/diagnostics-performance/analytical/interference` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 38 | POST | `/api/diagnostics-performance/analytical/linearity` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 39 | POST | `/api/diagnostics-performance/analytical/method-comparison` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 40 | POST | `/api/diagnostics-performance/analytical/qualitative-dose-response` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 41 | POST | `/api/diagnostics-performance/analytical/reference-interval` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 42 | POST | `/api/diagnostics-performance/analytical/stability` | probable (ui-surface-registry.ts) | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 43 | POST | `/api/diagnostics-performance/clinical/accuracy` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 44 | POST | `/api/diagnostics-performance/clinical/roc` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 45 | POST | `/api/diagnostics-performance/clinical/weighted-kappa` | none | exact `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | new: a property of an object in a `const` array, through a JSX prop and a helper |
| 46 | POST | `/api/esignature/verify-mfa` | probable (useEsignature.ts) | exact `client/src/concept2cure/hooks/useEsignature.ts:29` | new: a URL made only of substitutions (`${BASE}${path}`) |
| 47 | POST | `/api/esignature/verify-password` | probable (useEsignature.ts) | exact `client/src/concept2cure/hooks/useEsignature.ts:29` | new: a URL made only of substitutions (`${BASE}${path}`) |
| 48 | GET | `/api/etmf/trials/:trialId/artifacts` | exact `client/src/concept2cure/v2/surfaces/Etmf.tsx:385` | probable (Etmf.tsx) | the client sends this path only with POST (`client/src/concept2cure/v2/surfaces/Etmf.tsx:385`): no longer claimed; `match2.py` decides, as before the first correction |
| 49 | GET | `/api/etmf/trials/:trialId/completeness` | exact `client/src/concept2cure/v2/surfaces/Etmf.tsx:130` | exact `client/src/concept2cure/v2/surfaces/Etmf.tsx:132` | the first correction named where the URL is built; this is the call that sends it |
| 50 | GET | `/api/global-ri/catalog/:group` | exact `client/src/hooks/useGlobalRiCatalog.ts:21` | exact `client/src/hooks/useGlobalRiCatalog.ts:34` | the first correction named where the URL is built; this is the call that sends it |
| 51 | GET | `/api/governed-intelligence-inconsistency/projects/:projectId/inconsistency` | exact `client/src/concept2cure/v2/surfaces/Inconsistency.tsx:227` | exact `client/src/concept2cure/v2/surfaces/Inconsistency.tsx:243` | the first correction named where the URL is built; this is the call that sends it |
| 52 | GET | `/api/ind-master-data/sponsors/:id` | exact `client/src/concept2cure/v2/surfaces/IndApplicantIdentity.tsx:107` | probable (IndApplicantIdentity.tsx) | the client sends this path only with PATCH, POST (`client/src/concept2cure/v2/surfaces/IndApplicantIdentity.tsx:107`): no longer claimed; `match2.py` decides, as before the first correction |
| 53 | GET | `/api/mdx-rbm/rbm-board/:programId` | exact `client/src/concept2cure/v2/surfaces/Rbm.tsx:143` | exact `client/src/concept2cure/v2/surfaces/Rbm.tsx:144` | the first correction named where the URL is built; this is the call that sends it |
| 54 | PATCH | `/api/mdx/labeling/:id` | exact `client/src/concept2cure/v2/surfaces/LabelingSignatures.tsx:76` | probable (SignedContentState.tsx) | the client sends this path only with GET (`client/src/concept2cure/v2/surfaces/LabelingSignatures.tsx:76`): no longer claimed; `match2.py` decides, as before the first correction |
| 55 | GET | `/api/region-profiles/:region` | exact `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx:551` | exact `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx:553` | the first correction named where the URL is built; this is the call that sends it |

### Every row whose caller changed from the inventory as first filed (120)

"Called at" is the call that sends the URL with the route's method. "Built at" is where the URL is assembled, when
that is another line.

| # | Method | Route | As first filed | Called at | Built at | Found by | Client builds | Production |
|---:|---|---|---|---|---|---|---|---|
| 1 | GET | `/api/510k/projects/:projectIdent/document-preview` | none | `client/src/concept2cure/mdx/hooks/useK510.ts:143` | `client/src/concept2cure/mdx/hooks/useK510.ts:141` | template | `/api/510k/projects/${…}/document-preview` | launch |
| 2 | DELETE | `/api/admin/access/grants/:id` | probable (AdminPlatformGrants.tsx) | `client/src/concept2cure/v2/surfaces/AdminPlatformGrants.tsx:28` | same line | path-constant: constant | `/api/admin/access/grants/${…}` | never-gated |
| 3 | PATCH | `/api/admin/master/feature-flags/:key` | probable (MasterLicensing.tsx) | `client/src/concept2cure/v2/surfaces/MasterLicensing.tsx:496` | same line | path-constant: constant | `/api/admin/master/feature-flags/${…}` | never-gated |
| 4 | PATCH | `/api/admin/master/licensing/modules/:moduleId` | probable (MasterLicensing.tsx) | `client/src/concept2cure/v2/surfaces/MasterLicensing.tsx:389` | same line | path-constant: constant | `/api/admin/master/licensing/modules/${…}` | never-gated |
| 5 | GET | `/api/admin/master/licensing/tenants/:id` | probable (Onboarding.tsx) | `client/src/concept2cure/v2/surfaces/MasterLicensing.tsx:254` | `client/src/concept2cure/v2/surfaces/MasterLicensing.tsx:251` | path-constant: constant | `/api/admin/master/licensing/tenants/${…}` | never-gated |
| 6 | POST | `/api/admin/master/licensing/trials/convert` | probable (TrialsPanel.tsx) | `client/src/concept2cure/v2/surfaces/licensing/TrialsPanel.tsx:298` | `client/src/concept2cure/v2/surfaces/licensing/TrialsPanel.tsx:297` | path-constant: constant | `/api/admin/master/licensing/trials/convert` | never-gated |
| 7 | POST | `/api/admin/master/licensing/trials/end` | probable (TrialsPanel.tsx) | `client/src/concept2cure/v2/surfaces/licensing/TrialsPanel.tsx:298` | `client/src/concept2cure/v2/surfaces/licensing/TrialsPanel.tsx:297` | path-constant: constant | `/api/admin/master/licensing/trials/end` | never-gated |
| 8 | PUT | `/api/ana-skills/organization/:id` | probable (SkillStudio.tsx) | `client/src/concept2cure/v2/SkillStudio.tsx:54` | same line | path-constant: constant | `/api/ana-skills/organization/${…}` | launch |
| 9 | POST | `/api/audit/reviews/:id/sign` | none | `client/src/concept2cure/v2/surfaces/ComplianceReviewRecords.tsx:212` | same line | path-constant: import | `/api/audit/reviews/${…}/sign` | never-gated |
| 10 | POST | `/api/batch-draft/documents/:id/accept` | probable (BatchDraft.tsx) | `client/src/concept2cure/v2/surfaces/BatchDraft.tsx:491` | same line | concatenation | `/api/batch-draft/documents/${…}/accept` | unmapped |
| 11 | POST | `/api/biostat/assurance` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/biostat/assurance` | launch |
| 12 | POST | `/api/biostat/diagnostic/bayesian-device` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/biostat/diagnostic/bayesian-device` | launch |
| 13 | POST | `/api/biostat/diagnostic/mrmc` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/biostat/diagnostic/mrmc` | launch |
| 14 | POST | `/api/biostat/diagnostic/sizing` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/biostat/diagnostic/sizing` | launch |
| 15 | POST | `/api/biostat/dose-finding/boin` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/biostat/dose-finding/boin` | launch |
| 16 | POST | `/api/biostat/enrollment/backtest` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/biostat/enrollment/backtest` | launch |
| 17 | POST | `/api/biostat/enrollment/forecast` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/biostat/enrollment/forecast` | launch |
| 18 | POST | `/api/biostat/external-control/sensitivity` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/biostat/external-control/sensitivity` | launch |
| 19 | GET | `/api/biostat/knowledge/endpoint-method-matrix` | probable (biostatKnowledgeApi.ts) | `client/src/concept2cure/v2/surfaces/biostatKnowledgeApi.ts:149` | same line | path-constant: constant+helper | `/api/biostat/knowledge/endpoint-method-matrix` | launch |
| 20 | POST | `/api/biostat/knowledge/ingest-csr` | probable (biostatKnowledgeApi.ts) | `client/src/concept2cure/v2/surfaces/biostatKnowledgeApi.ts:142` | same line | path-constant: constant | `/api/biostat/knowledge/ingest-csr` | launch |
| 21 | GET | `/api/biostat/knowledge/method-landscape/:indication` | probable (biostatKnowledgeApi.ts) | `client/src/concept2cure/v2/surfaces/biostatKnowledgeApi.ts:144` | same line | path-constant: constant | `/api/biostat/knowledge/method-landscape/${…}` | launch |
| 22 | POST | `/api/biostat/knowledge/query` | probable (biostatKnowledgeApi.ts) | `client/src/concept2cure/v2/surfaces/biostatKnowledgeApi.ts:141` | same line | path-constant: constant | `/api/biostat/knowledge/query` | launch |
| 23 | GET | `/api/biostat/knowledge/trend/:concept` | probable (biostatKnowledgeApi.ts) | `client/src/concept2cure/v2/surfaces/biostatKnowledgeApi.ts:151` | same line | path-constant: constant | `/api/biostat/knowledge/trend/${…}` | launch |
| 24 | POST | `/api/biostat/mmrm/power` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/biostat/mmrm/power` | launch |
| 25 | POST | `/api/biostat/mmrm/sample-size` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/biostat/mmrm/sample-size` | launch |
| 26 | POST | `/api/biostat/multiplicity/test` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/biostat/multiplicity/test` | launch |
| 27 | POST | `/api/biostat/survival/rmst` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/biostat/survival/rmst` | launch |
| 28 | POST | `/api/biostat/win-ratio` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/biostat/win-ratio` | launch |
| 29 | PUT | `/api/c2c/templates/:id` | probable (TemplateLibrary.tsx) | `client/src/concept2cure/v2/surfaces/TemplateLibrary.tsx:395` | same line | concatenation | `/api/c2c/templates/${…}` | out-of-scope |
| 30 | POST | `/api/c2c/templates/:id/render` | probable (TemplateLibrary.tsx) | `client/src/concept2cure/v2/surfaces/TemplateLibrary.tsx:417` | same line | concatenation | `/api/c2c/templates/${…}/render` | out-of-scope |
| 31 | GET | `/api/cerv2/literature/screening` | none | `client/src/concept2cure/mdx/hooks/useCerLiterature.ts:386` | `client/src/concept2cure/mdx/hooks/useCerLiterature.ts:372` | template | `/api/cerv2/literature/screening` | launch |
| 32 | PUT | `/api/client-branding/company-documents/branding-policy` | none | `client/src/concept2cure/v2/surfaces/company-documents/CompanyBrandingPolicy.tsx:17` | same line | path-constant: import | `/api/client-branding/company-documents/branding-policy` | launch |
| 33 | GET | `/api/client-branding/company-documents/designs/:id` | probable (InsightsPackageStationery.tsx) | `client/src/concept2cure/v2/surfaces/company-documents/CompanyDesignDetail.tsx:51` | same line | path-constant: import | `/api/client-branding/company-documents/designs/${…}` | launch |
| 34 | POST | `/api/client-branding/company-documents/designs/:id/proof` | none | `client/src/concept2cure/v2/surfaces/company-documents/CompanyDesignDetail.tsx:33` | same line | path-constant: constant+import | `/api/client-branding/company-documents/designs/${…}/proof` | launch |
| 35 | POST | `/api/client-branding/company-documents/designs/:id/publish` | none | `client/src/concept2cure/v2/surfaces/company-documents/CompanyDesignDetail.tsx:25` | same line | path-constant: argument+constant+import | `/api/client-branding/company-documents/designs/${…}/publish` | launch |
| 36 | POST | `/api/client-branding/company-documents/designs/:id/review` | probable (CompanyFilingIdentityReview.tsx) | `client/src/concept2cure/v2/surfaces/company-documents/CompanyDesignDetail.tsx:25` | same line | path-constant: argument+constant+import | `/api/client-branding/company-documents/designs/${…}/review` | launch |
| 37 | GET | `/api/client-branding/company-documents/legacy-adoption` | probable (useCompanyDocumentSettings.ts) | `client/src/concept2cure/v2/surfaces/company-documents/CompanyLegacyAdoption.tsx:25` | same line | path-constant: import | `/api/client-branding/company-documents/legacy-adoption` | launch |
| 38 | POST | `/api/client-branding/company-documents/legacy-adoption` | probable (useCompanyDocumentSettings.ts) | `client/src/concept2cure/v2/surfaces/useCompanyDocumentSettings.ts:112` | same line | path-constant: constant | `/api/client-branding/company-documents/legacy-adoption` | launch |
| 39 | GET | `/api/client-branding/company-documents/legal-documents` | probable (CompanySubmissionDocuments.tsx) | `client/src/concept2cure/v2/surfaces/company-documents/CompanyLegalInventory.tsx:60` | `client/src/concept2cure/v2/surfaces/company-documents/CompanyLegalInventory.tsx:27` | path-constant: import | `/api/client-branding/company-documents/legal-documents` | launch |
| 40 | POST | `/api/client-branding/company-documents/legal-documents` | probable (CompanySubmissionDocuments.tsx) | `client/src/concept2cure/v2/surfaces/CompanyDocumentSettings.tsx:162` | same line | path-constant: import | `/api/client-branding/company-documents/legal-documents` | launch |
| 41 | DELETE | `/api/client-branding/company-documents/legal-documents/:id` | probable (CompanySubmissionDocuments.tsx) | `client/src/concept2cure/v2/surfaces/CompanyDocumentSettings.tsx:171` | same line | path-constant: import | `/api/client-branding/company-documents/legal-documents/${…}` | launch |
| 42 | POST | `/api/client-branding/company-documents/letterhead/preview` | probable (useCompanyDocumentSettings.ts) | `client/src/concept2cure/v2/surfaces/useCompanyDocumentSettings.ts:170` | `client/src/concept2cure/v2/surfaces/useCompanyDocumentSettings.ts:167` | path-constant: constant | `/api/client-branding/company-documents/letterhead/preview` | launch |
| 43 | GET | `/api/client-branding/company-documents/permissions` | none | `client/src/concept2cure/v2/surfaces/company-documents/CompanyPermissionsPanel.tsx:47` | same line | path-constant: import | `/api/client-branding/company-documents/permissions` | launch |
| 44 | PUT | `/api/client-branding/company-documents/permissions/:userId` | none | `client/src/concept2cure/v2/surfaces/company-documents/CompanyPermissionsPanel.tsx:25` | same line | path-constant: import | `/api/client-branding/company-documents/permissions/${…}` | launch |
| 45 | GET | `/api/client-branding/company-documents/revisions` | none | `client/src/concept2cure/v2/surfaces/company-documents/CompanyPresentationHistory.tsx:65` | `client/src/concept2cure/v2/surfaces/company-documents/CompanyPresentationHistory.tsx:64` | path-constant: import | `/api/client-branding/company-documents/revisions` | launch |
| 46 | GET | `/api/client-branding/company-documents/revisions/:revision` | none | `client/src/concept2cure/v2/surfaces/company-documents/CompanyPresentationHistory.tsx:41` | same line | path-constant: import | `/api/client-branding/company-documents/revisions/${…}` | launch |
| 47 | GET | `/api/clinical-operations/studies/:studyId/deviations` | probable (ClinicalOps.tsx) | `client/src/concept2cure/v2/surfaces/ClinicalOps.tsx:356` | same line | concatenation | `/api/clinical-operations/studies/${…}/deviations` | unmapped |
| 48 | POST | `/api/cmc/batch-records/:id/release` | probable (cmcSpec.ts) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:2386` | same line | concatenation | `/api/cmc/batch-records/${…}/release` | launch |
| 49 | GET | `/api/cmc/batch-records/:projectId` | probable (CmcModule.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:2330` | same line | concatenation | `/api/cmc/batch-records/${…}` | launch |
| 50 | POST | `/api/cmc/module3-os/build-section/:projectId/:sectionKey` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx:280` | same line | concatenation | `/api/cmc/module3-os/build-section/${…}/${…}` | launch |
| 51 | GET | `/api/cmc/module3-os/build-state/:projectId` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx:205` | same line | concatenation | `/api/cmc/module3-os/build-state/${…}` | launch |
| 52 | POST | `/api/cmc/module3-os/compile/:projectId` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx:263` | same line | concatenation | `/api/cmc/module3-os/compile/${…}` | launch |
| 53 | PATCH | `/api/cmc/module3-os/contradictions/:id/resolve` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx:318` | same line | concatenation | `/api/cmc/module3-os/contradictions/${…}/resolve` | launch |
| 54 | GET | `/api/cmc/module3-os/contradictions/:projectId` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:2823` | same line | concatenation | `/api/cmc/module3-os/contradictions/${…}` | launch |
| 55 | POST | `/api/cmc/module3-os/contradictions/:projectId` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx:289` | same line | concatenation | `/api/cmc/module3-os/contradictions/${…}` | launch |
| 56 | POST | `/api/cmc/module3-os/guard/final-export/:projectId` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx:337` | same line | concatenation | `/api/cmc/module3-os/guard/final-export/${…}` | launch |
| 57 | POST | `/api/cmc/module3-os/place-into-submission/:projectId` | probable (CmcPlaceIntoSubmission.tsx) | `client/src/concept2cure/v2/surfaces/CmcPlaceIntoSubmission.tsx:91` | same line | concatenation | `/api/cmc/module3-os/place-into-submission/${…}` | launch |
| 58 | GET | `/api/cmc/module3-os/provenance/:projectId/:sectionKey` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:2848` | same line | concatenation | `/api/cmc/module3-os/provenance/${…}/${…}` | launch |
| 59 | GET | `/api/cmc/module3-os/readiness/:projectId` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:669` | same line | concatenation | `/api/cmc/module3-os/readiness/${…}` | launch |
| 60 | GET | `/api/cmc/module3-os/sections/:projectId` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:2820` | same line | concatenation | `/api/cmc/module3-os/sections/${…}` | launch |
| 61 | GET | `/api/cmc/module3-os/source-evidence/:projectId` | probable (CmcSectionEvidence.tsx) | `client/src/concept2cure/v2/surfaces/CmcSectionEvidence.tsx:226` | `client/src/concept2cure/v2/surfaces/CmcSectionEvidence.tsx:225` | concatenation | `/api/cmc/module3-os/source-evidence/${…}` | launch |
| 62 | POST | `/api/cmc/module3-os/source-evidence/:projectId` | probable (CmcSectionEvidence.tsx) | `client/src/concept2cure/v2/surfaces/CmcSectionEvidence.tsx:233` | same line | path-constant: argument+constant | `/api/cmc/module3-os/source-evidence/${…}` | launch |
| 63 | POST | `/api/cmc/module3-os/source-evidence/:projectId/:linkId/unlink` | probable (CmcSectionEvidence.tsx) | `client/src/concept2cure/v2/surfaces/CmcSectionEvidence.tsx:233` | same line | path-constant: argument+constant | `/api/cmc/module3-os/source-evidence/${…}/${…}/unlink` | launch |
| 64 | GET | `/api/cmc/module3-os/source-evidence/:projectId/documents` | probable (CmcSectionEvidence.tsx) | `client/src/concept2cure/v2/surfaces/CmcSectionEvidence.tsx:227` | same line | path-constant: constant | `/api/cmc/module3-os/source-evidence/${…}/documents` | launch |
| 65 | GET | `/api/cmc/projects/:projectId/process-capability` | probable (CmcModule.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:2630` | same line | concatenation | `/api/cmc/projects/${…}/process-capability` | launch |
| 66 | GET | `/api/cmc/quality/qbd/:projectId` | probable (CmcQuality.tsx) | `client/src/concept2cure/v2/surfaces/CmcQuality.tsx:166` | same line | concatenation | `/api/cmc/quality/qbd/${…}` | launch |
| 67 | PUT | `/api/cmc/specifications/:id` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:1184` | same line | concatenation | `/api/cmc/specifications/${…}` | launch |
| 68 | POST | `/api/cmc/specifications/:id/approve` | probable (cmcSpec.ts) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:1215` | same line | concatenation | `/api/cmc/specifications/${…}/approve` | launch |
| 69 | GET | `/api/cmc/specifications/:projectId` | probable (CmcModule3Build.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:1127` | same line | concatenation | `/api/cmc/specifications/${…}` | launch |
| 70 | PUT | `/api/cmc/stability-studies/:id` | probable (cmcRegisterForms.ts) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:1646` | same line | concatenation | `/api/cmc/stability-studies/${…}` | launch |
| 71 | POST | `/api/cmc/stability-studies/:id/shelf-life` | probable (cmcRegisterForms.ts) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:1680` | same line | concatenation | `/api/cmc/stability-studies/${…}/shelf-life` | launch |
| 72 | POST | `/api/cmc/stability-studies/:id/trending` | probable (CmcModule.tsx) | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:1718` | same line | concatenation | `/api/cmc/stability-studies/${…}/trending` | launch |
| 73 | GET | `/api/coauthor/documents/:docId/compliance` | probable (EctdCoauthor.tsx) | `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:191` | same line | concatenation | `/api/coauthor/documents/${…}/compliance` | launch |
| 74 | POST | `/api/coauthor/documents/:docId/validate` | probable (EctdCoauthor.tsx) | `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:183` | same line | concatenation | `/api/coauthor/documents/${…}/validate` | launch |
| 75 | GET | `/api/coauthor/documents/:id` | probable (EctdCoauthor.tsx) | `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:410` | same line | concatenation | `/api/coauthor/documents/${…}` | launch |
| 76 | PUT | `/api/coauthor/documents/:id` | probable (EctdCoauthor.tsx) | `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:399` | same line | concatenation | `/api/coauthor/documents/${…}` | launch |
| 77 | GET | `/api/csr/jobs/:jobId/assembly/:assemblyId/lifecycle` | none | `client/src/concept2cure/v2/surfaces/CsrPlacementLifecycle.tsx:44` | same line | path-constant: argument+constant | `/api/csr/jobs/${…}/assembly/${…}/lifecycle` | launch |
| 78 | POST | `/api/csr/jobs/:jobId/assembly/:assemblyId/place` | probable (CsrAssemblyControl.tsx) | `client/src/concept2cure/v2/surfaces/CsrAssemblyControl.tsx:284` | same line | path-constant: argument+constant | `/api/csr/jobs/${…}/assembly/${…}/place` | launch |
| 79 | POST | `/api/csr/jobs/:jobId/assembly/:assemblyId/withdraw-placement` | none | `client/src/concept2cure/v2/surfaces/CsrPlacementLifecycle.tsx:124` | same line | path-constant: argument+constant | `/api/csr/jobs/${…}/assembly/${…}/withdraw-placement` | launch |
| 80 | GET | `/api/csr/jobs/:jobId/assembly/targets` | probable (CsrAssemblyControl.tsx) | `client/src/concept2cure/v2/surfaces/CsrAssemblyControl.tsx:250` | same line | path-constant: argument+constant | `/api/csr/jobs/${…}/assembly/targets` | launch |
| 81 | GET | `/api/csr/jobs/:jobId/headings` | probable (CsrRunBuilds.tsx) | `client/src/concept2cure/v2/surfaces/CsrRunBuilds.tsx:112` | same line | path-constant: constant | `/api/csr/jobs/${…}/headings` | launch |
| 82 | GET | `/api/decision-lineage/:entityType/:entityId/export` | probable (decision-lineage-data.ts) | `client/src/concept2cure/v2/surfaces/DecisionLineage.tsx:235` | `client/src/concept2cure/v2/surfaces/DecisionLineage.tsx:232` | concatenation | `/api/decision-lineage/${…}/${…}/export` | out-of-scope |
| 83 | POST | `/api/diagnostics-performance/analytical/detection-capability` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/diagnostics-performance/analytical/detection-capability` | launch |
| 84 | POST | `/api/diagnostics-performance/analytical/imprecision` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/diagnostics-performance/analytical/imprecision` | launch |
| 85 | POST | `/api/diagnostics-performance/analytical/interference` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/diagnostics-performance/analytical/interference` | launch |
| 86 | POST | `/api/diagnostics-performance/analytical/linearity` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/diagnostics-performance/analytical/linearity` | launch |
| 87 | POST | `/api/diagnostics-performance/analytical/method-comparison` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/diagnostics-performance/analytical/method-comparison` | launch |
| 88 | POST | `/api/diagnostics-performance/analytical/qualitative-dose-response` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/diagnostics-performance/analytical/qualitative-dose-response` | launch |
| 89 | POST | `/api/diagnostics-performance/analytical/reference-interval` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/diagnostics-performance/analytical/reference-interval` | launch |
| 90 | POST | `/api/diagnostics-performance/analytical/stability` | probable (ui-surface-registry.ts) | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/diagnostics-performance/analytical/stability` | launch |
| 91 | POST | `/api/diagnostics-performance/clinical/accuracy` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/diagnostics-performance/clinical/accuracy` | launch |
| 92 | POST | `/api/diagnostics-performance/clinical/roc` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/diagnostics-performance/clinical/roc` | launch |
| 93 | POST | `/api/diagnostics-performance/clinical/weighted-kappa` | none | `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:375` | `client/src/concept2cure/v2/surfaces/biostatCalculatorContract.ts:116` | path-constant: constant+element+import | `/api/diagnostics-performance/clinical/weighted-kappa` | launch |
| 94 | GET | `/api/ectd-compile/:projectIdent/filed-state` | none | `client/src/concept2cure/v2/surfaces/EctdFiledState.tsx:107` | same line | path-constant: argument+constant | `/api/ectd-compile/${…}/filed-state` | launch |
| 95 | GET | `/api/ectd-compile/:projectIdent/status` | probable (schema.ts) | `client/src/concept2cure/v2/surfaces/EctdCompile.tsx:1003` | same line | path-constant: constant | `/api/ectd-compile/${…}/status` | launch |
| 96 | POST | `/api/esignature/verify-mfa` | probable (useEsignature.ts) | `client/src/concept2cure/hooks/useEsignature.ts:29` | same line | path-constant: argument+constant | `/api/esignature/verify-mfa` | launch |
| 97 | POST | `/api/esignature/verify-password` | probable (useEsignature.ts) | `client/src/concept2cure/hooks/useEsignature.ts:29` | same line | path-constant: argument+constant | `/api/esignature/verify-password` | launch |
| 98 | POST | `/api/etmf/trials/:trialId/artifacts` | probable (Etmf.tsx) | `client/src/concept2cure/v2/surfaces/Etmf.tsx:385` | same line | concatenation | `/api/etmf/trials/${…}/artifacts` | out-of-scope |
| 99 | GET | `/api/etmf/trials/:trialId/completeness` | probable (Etmf.tsx) | `client/src/concept2cure/v2/surfaces/Etmf.tsx:132` | `client/src/concept2cure/v2/surfaces/Etmf.tsx:130` | concatenation | `/api/etmf/trials/${…}/completeness` | out-of-scope |
| 100 | GET | `/api/etmf/trials/:trialId/inspection-package` | probable (Etmf.tsx) | `client/src/concept2cure/v2/surfaces/Etmf.tsx:424` | same line | concatenation | `/api/etmf/trials/${…}/inspection-package` | out-of-scope |
| 101 | GET | `/api/global-ri/catalog/:group` | probable (useGlobalRiCatalog.ts) | `client/src/hooks/useGlobalRiCatalog.ts:34` | `client/src/hooks/useGlobalRiCatalog.ts:21` | path-constant: constant | `/api/global-ri/catalog/${…}` | out-of-scope |
| 102 | GET | `/api/governed-intelligence-inconsistency/projects/:projectId/inconsistency` | probable (Inconsistency.tsx) | `client/src/concept2cure/v2/surfaces/Inconsistency.tsx:243` | `client/src/concept2cure/v2/surfaces/Inconsistency.tsx:227` | concatenation | `/api/governed-intelligence-inconsistency/projects/${…}/inconsistency` | unmapped |
| 103 | POST | `/api/governed-intelligence/assumptions/:id/revalue` | probable (Inconsistency.tsx) | `client/src/concept2cure/v2/surfaces/Inconsistency.tsx:650` | same line | concatenation | `/api/governed-intelligence/assumptions/${…}/revalue` | out-of-scope |
| 104 | POST | `/api/governed-intelligence/contradictions/:id/review` | probable (Inconsistency.tsx) | `client/src/concept2cure/v2/surfaces/Inconsistency.tsx:192` | same line | concatenation | `/api/governed-intelligence/contradictions/${…}/review` | out-of-scope |
| 105 | POST | `/api/governed-intelligence/contradictions/scan/:projectId` | probable (Inconsistency.tsx) | `client/src/concept2cure/v2/surfaces/Inconsistency.tsx:418` | same line | concatenation | `/api/governed-intelligence/contradictions/scan/${…}` | out-of-scope |
| 106 | PATCH | `/api/human-factors/scenarios/:id/mitigate` | probable (HumanFactors.tsx) | `client/src/concept2cure/v2/surfaces/HumanFactors.tsx:362` | same line | concatenation | `/api/human-factors/scenarios/${…}/mitigate` | launch |
| 107 | PATCH | `/api/ind-master-data/sponsors/:id` | probable (IndApplicantIdentity.tsx) | `client/src/concept2cure/v2/surfaces/IndApplicantIdentity.tsx:107` | same line | template | `/api/ind-master-data/sponsors/${…}` | launch |
| 108 | PATCH | `/api/insights/subscriptions/:id` | probable (InsightsSchedulesPanel.tsx) | `client/src/concept2cure/v2/surfaces/insightsLibraryModel.ts:598` | same line | template | `/api/insights/subscriptions/${…}` | launch |
| 109 | GET | `/api/mdx-rbm/rbm-board/:programId` | probable (rbm-data.ts) | `client/src/concept2cure/v2/surfaces/Rbm.tsx:144` | `client/src/concept2cure/v2/surfaces/Rbm.tsx:143` | concatenation | `/api/mdx-rbm/rbm-board/${…}` | launch |
| 110 | GET | `/api/mdx/labeling/:id` | probable (SignedContentState.tsx) | `client/src/concept2cure/v2/surfaces/LabelingSignatures.tsx:76` | same line | concatenation | `/api/mdx/labeling/${…}` | launch |
| 111 | PATCH | `/api/mdx/labeling/translations/:transId` | probable (Labeling.tsx) | `client/src/concept2cure/v2/surfaces/Labeling.tsx:314` | same line | concatenation | `/api/mdx/labeling/translations/${…}` | launch |
| 112 | PUT | `/api/mdx/notification-subscriptions/:category` | probable (NotificationPreferences.tsx) | `client/src/concept2cure/v2/NotificationPreferences.tsx:77` | same line | path-constant: constant | `/api/mdx/notification-subscriptions/${…}` | launch |
| 113 | POST | `/api/orchestration/checkpoints/:id/decision` | probable (Orchestration.tsx) | `client/src/concept2cure/v2/surfaces/Orchestration.tsx:668` | same line | concatenation | `/api/orchestration/checkpoints/${…}/decision` | out-of-scope |
| 114 | DELETE | `/api/realtime-collab/rooms/:documentId/users/me` | none | `client/src/concept2cure/v2/surfaces/AuthoringCollab.tsx:110` | same line | path-constant: constant | `/api/realtime-collab/rooms/${…}/users/me` | launch |
| 115 | GET | `/api/region-profiles/:region` | none | `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx:553` | `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx:551` | template | `/api/region-profiles/${…}` | launch |
| 116 | GET | `/api/report-os/bundles/:bundleId/export.pdf` | probable (Insights.tsx) | `client/src/concept2cure/v2/surfaces/Insights.tsx:1396` | same line | path-constant: constant | `/api/report-os/bundles/${…}/export.pdf` | launch |
| 117 | POST | `/api/submissions/sequences/:seqId/transition` | probable (SubmissionCenter.tsx) | `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx:767` | same line | template | `/api/submissions/sequences/${…}/transition` | launch |
| 118 | POST | `/api/submissions/sequences/:seqId/transmit` | probable (SubmissionCenter.tsx) | `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx:910` | same line | template | `/api/submissions/sequences/${…}/transmit` | launch |
| 119 | POST | `/api/task-management/tasks/from-template/:templateId` | probable (TaskBoard.tsx) | `client/src/concept2cure/v2/surfaces/TaskBoard.tsx:2175` | same line | concatenation | `/api/task-management/tasks/from-template/${…}` | launch |
| 120 | POST | `/api/vault/legal-holds/:id/lift` | probable (LegalHoldsCard.tsx) | `client/src/concept2cure/v2/surfaces/LegalHoldsCard.tsx:208` | same line | path-constant: constant | `/api/vault/legal-holds/${…}/lift` | launch |

### The ninth probe row

`--probe-param-match` now also lists `GET /api/biostat/external-control/:controlId`, because the workbench builds
`/api/biostat/external-control/sensitivity`. That call is a POST, to the literal route it names, which is now exact.
It is not a call to the GET.

### Known blind spots that remain

The method reads the client's source. These patterns cannot be read from it, so their rows stay as they are, and
each must be checked by hand before a retirement:

1. **A URL taken from a server response.** `client/src/concept2cure/v2/surfaces/GlobalRiBrowser.tsx:66-82`
   (`griRun`, run from the "Run capability" button at `:369`) calls `'/api/global-ri' + <last route of the
   capability>`. The routes come from `GET /api/global-ri/catalog`, which serves the static table in
   `server/services/global-ri/global-ri-capabilities.ts`. So the last route of each of the 41 capabilities is
   called. All are out-of-scope in production.
   - **32 rows read "none" and are called:**
     - GET `/api/global-ri/bioequivalence/biowaiver/:bcsClass`, `/clinical-evidence/control-types`,
       `/cmc/universal-tests/:productType`, `/companion-diagnostics/codevelopment`,
       `/controlled-substances/handling/:schedule`, `/gcp/responsibilities/:party`, `/guidance/:topic`,
       `/ich-guidelines/:code`, `/impurities/elemental/:element`, `/process-validation/stage/:region/:stageId`;
     - POST `/api/global-ri/cta/assess`, `/designations/assess`, `/disclosure/deadlines`, `/establishment/assess`,
       `/expanded-access/recommend`, `/expedited-programs/match`, `/fees/estimate`, `/inspection/assess`,
       `/labeling/assess`, `/lifecycle/schedule`, `/meetings/recommend`, `/module1/assess`,
       `/nonclinical/tox-duration`, `/pathway`, `/pediatric/assess`, `/pharmacovigilance/assess`,
       `/promotional-compliance/assess`, `/reliance-pathways/recommend`, `/review-timeline`, `/strategy-brief`,
       `/submission-economics`, `/submission-format/assess`.
   - **9 rows read "probable" and are called:** POST `/api/global-ri/dossier/classify`,
     `/safety-reporting/classify`, `/changes/classify`, `/device/classify`, `/combination/classify`,
     `/advanced-therapies/classify`, `/exclusivity/compute`, `/import-export/requirements`; GET
     `/api/global-ri/stability/study-design`.
   - **20 route files in README §3 are called this way:** `bioequivalence`, `clinical-evidence-standards`,
     `companion-diagnostics`, `controlled-substances`, `establishment-registration`, `expanded-access`, `fees`,
     `gcp`, `guidance`, `impurities`, `lifecycle`, `pediatric`, `pharmacovigilance`, `process-validation`,
     `programs`, `promotional-compliance`, `reliance`, `strategy`, `submission-format` and `timeline`, each
     `server/routes/global-ri/<name>.routes.ts`. Of the global-RI files in §3, only `gdp.routes.ts` has no caller.
   - These 41 rows were found by reading the capability table at `18261a908` and taking each entry's last route.
2. **A runtime prefix-rewrite map.** `rbmEndpoint` in `client/src/concept2cure/v2/surfaces/rbmWrites.tsx:23-42`
   maps a relative path through `RBM_ENDPOINTS` with string operations. The RBM `:id` routes it reaches stay
   "probable". No row is "none" because of it.
3. **The literal pass does not compare methods.** A row it found is a path-level match. For example,
   `POST /api/mdx/labeling/:id/symbols` is exact, and the client only GETs `/symbols` (`Labeling.tsx:211`). The
   literal pass is left unchanged so that the before file stays reproducible. Its rows are not wrong in the P-87
   direction: they over-count callers, never under-count them.
4. **"Exact" does not mean reached.** A call in code that nothing runs still counts, for example
   `GET /api/global-ri/catalog/:group` above.
5. **What the first correction listed still applies:**
   - a class field (`this.baseUrl`);
   - a URL handed over through React context;
   - a parameter whose call sites pass only runtime values;
   - calls made by AnA tools and the MCP connector, which reach services, not routes;
   - test files, which are excluded. `client/src/concept2cure/v2/__tests__/biostatWorkbenchFreshness.test.tsx`
     asserts the call to `/api/biostat/assurance`, and the method did not see it until this correction read the
     workbench itself.
6. **The 9 probe rows** above are not applied.


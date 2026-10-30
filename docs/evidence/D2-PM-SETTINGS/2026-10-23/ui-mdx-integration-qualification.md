# Project MDx workflow merge: PM-06 integration

The root normally merged incoming project MDx work through `62a8d5e7f` at `413d7350c`. The UI agent reviewed the overlap read-only and made one authorized test-only addition before freezing all source/test files for the following sequential runs. No runtime edit was made by the UI agent.

## Preservation and composed boundary

The merged ProjectHome retains both the settings and MDx imports, exactly one governed settings header mount, and `metadataEpoch` in both project metadata and activity read dependencies. The settings callback increments that epoch without remounting ProjectHome or resetting its selected lifecycle stage. All incoming device-specific lifecycle wording, MDx context and verified-project-gated workflow panel remain present.

The existing authenticated Home save case was parameterized for its original generic fixture and an IVD 510(k) project. Every prior assertion remains. The additional case reaches actual ProjectHome, ProjectSettings, the request/receipt guards, governed confirmation, ProjectMdxWorkflow and its compiler. It verifies exactly one settings header, successful settings save, one fresh metadata/activity read each, the updated description, the retained Review stage, no portfolio navigation and the diagnostic MDx workflow before and after authoritative metadata reload.

This is **one newly authored case**, not a new settings implementation or a replacement for the original cases. Final tested hashes:

- ProjectHome: `99208c4436a2870b17348b5d71108cc270f2f02cb16c3f99a7d65b1c16bb4b21`
- projectHomeSettingsHonesty test: `711a1d4a962a660121738720f2d74ce6d767b0660d7954050e42b9d9df268e44`

## Final frozen-tree runs

Node 22, `NODE_OPTIONS=--max-old-space-size=4096`, standard repository configuration. Each row is a separate execution; files/cases do not overlap between these four rows.

| Log | Files | Passed cases | Duration |
| --- | ---: | ---: | ---: |
| `ui-mdx-settings-home-launch.txt` | 3 | 44 | 16.74s |
| `ui-mdx-retained-parents.txt` | 4 | 34 | 18.60s |
| `ui-mdx-retained-companions.txt` | 4 | 56 | 14.68s |
| `ui-mdx-direct.txt` | 4 | 16 | 11.77s |

All four executions exited 0: **150 distinct cases across 15 files**. The first row is ProjectSettings 36, Home settings 4 and LaunchScope 4. Parents are TeamSetup 5, TeamResponsibilities 12, IdentityFacts 7 and Readiness 10. Companions are Submit stage 33, sharing 9, task assignment 12 and stage CSS 2. Direct MDx/catalog coverage is ProjectHome MDx 2, ProjectMdxWorkflow 8, MdxCatalogSolution 2 and actual Apps MDx solution 4.

Settings/parent/companion coverage totals 130 cases, including the one added composed case. LaunchScope 4 had already been integrated earlier. The incoming direct MDx/catalog 16 extend this selected cohort; historical upstream executions are not added again. The parent log retains five previously recorded React `act(...)` warnings; the incoming MDx Home stage action emits three more. There are no React warnings in the composed 44-case run or retained companions. These warnings are not assertion failures or lint diagnostics.

Scoped ESLint of the sole changed test file exited 0 with no output: `ui-mdx-lint.txt`, **0 errors and 0 warnings**. Root owns broader lint, final TypeScript and build.

## Incoming evidence review

`docs/evidence/D2-MDX-PROJECT-WORKFLOW/2026-10-23/source-qualification.json` declares 66 inputs. All 66 match upstream bytes/Git blobs. On the merged tree, **65/66 match**: ProjectHome is the sole intentional difference, and its diff from upstream consists exactly of the retained PM-06 settings import, metadata/activity epoch and header settings mount. All **11** retained upstream receipt hashes and lengths match. Incoming 936/93, 69/11, 81/5, 16/2 and 41/3 cohorts explicitly overlap and remain historical qualification, not additions to the 150-case result above.

Updated source binding of the combined MDx/settings tree is root-owned; earlier source epochs remain retained. The frontend tests use synthetic auth/API/tenant seams. They do not establish deployed-client or agency acceptance, and no live provider action or transmission occurred. The UI agent performed no Git mutation, whole-project TypeScript run or build.

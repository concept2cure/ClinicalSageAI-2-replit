# CI follow-up: published reporting increment

Reviewed GitHub CI run
[38463370149](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38463370149)
for commit `a64d422ac14c5eb177734c18f4224e0517bc50b4`. No remote job was rerun.
GitHub plugin job logs and its real-database/coverage artifacts supplied the
failure evidence; local fixes below are pending with the current bridge.

## Verified corrections

- The four proof-tier fixtures passed **36/36**. Three section-save fixtures now
  apply the real authoring document-loop and governed-binding migrations. The
  previous missing-table check aborted their transaction (25P02); the product's
  seal check was preserved. The biopharma fixture includes the two actual EU
  device-class columns and still asserts exact canonical schema parity.
- Four native files passed **128/128**, no skips, against a separate canonically
  installed and deployed PostgreSQL 16.15 database. Existing shared application
  data were not used by that run. The checks prove free CMC remains tier-locked,
  professional CMC opens without a perpetual grant, all eight launch apps retain
  delegated-credential boundaries, real bootstrap behavior and actual sealed
  run/bundle PDF export. The preliminary shared-database run exposed that its
  existing bootstrap rows cannot be treated as the disposable CI fixture; that
  run was not reported as a full pass.
- Reporting PDF and export-audit tests passed **41/41**. The old CI failures were
  missing Noto fonts, including native HTTP 503 exports. Test, Coverage and
  Integration jobs now install `fonts-noto-core` and `fonts-noto-cjk`, matching
  the production writer's required packages. No skipped PDF test, lossy fallback
  font or weakened export refusal was introduced.
- Scope ESLint: **0 errors, 5 existing warnings, no new warning allowance**.
  `manifest.json` records the exact changed source digests and local results.

The native schema came from `scripts/db/install-fresh.mjs` followed by
`scripts/db/deploy-migrate.mjs`, both exit 0. The latter verified 1299/1299
runtime relation grants, zero privilege excess, all 19 authoring tables/policies
and the canonical parentage/readiness contracts. The native tests provision and
use non-superuser runtime roles with RLS enforced; owner access provisions only
the isolated synthetic fixtures. Local signing/audit configuration is not
production qualification.

## Coverage classification

The old coverage artifact reports **65 failed / 48,771 passed assertions** and
25 actual failed files, including setup failures. It contains no numeric
coverage summary. Therefore the ratchet's failure is **coverage unverified
because tests failed**, not an observed percentage regression. No coverage
baseline was lowered or regenerated.

`coverage-failure-classification.json` distinguishes eight files verified here,
four authoring mock files already updated by the bridge owner, and the following
13 files still requiring focused verification/repair. The old outstanding set
contains 24 failed assertions plus five setup/import failures:

| File | Old diagnostic / focused next check |
| --- | --- |
| `tests/regulatory/requirements-resolver.test.ts` | Fence rejects `normalizeCtdCode` legitimately used by the new static IND placement tool; preserve the one requirements dispatch while checking its function boundary. |
| `tests/routes/510k-device-routes.test.ts` | Twelve intake/update/lookup assertions fail; determine whether changed prerequisite facts or a real route regression, rather than relabeling all failures stale. |
| `tests/routes/device-projects-patch-validation.test.ts` | Three exact device-class validation message assertions disagree with the current accepted region-specific classification model. |
| `server/startup/__tests__/tenant-impersonation-detector.test.ts` | Parser-order fixture lacks the exact authenticated sealed-report conversion parser; preserve auth-before-parser proof. |
| `server/routes/__tests__/authoring-section-figure-refs.test.ts` | Module-load failure: orgMembership mock omits `requireEditorAccess`; retain authorization refusal coverage. |
| `server/routes/__tests__/authoringApprovalNoWorkflow.test.ts` | Same omitted export; the no-workflow signing behavior must still be exercised. |
| `server/routes/__tests__/authoringApprovalSealBinding.test.ts` | Same omitted export; keep the actual signature/filing binding assertions. |
| `server/routes/__tests__/authoringSignFreezeAndExportGate.test.ts` | Same omitted export; preserve the governance/signing/export refusal paths. |
| `server/routes/__tests__/authoringSavedSourcesExport.pglite.integration.test.ts` | Fixture recreates `authoring_export_history`, already supplied by current canonical migrations. |
| `server/services/ana/__tests__/draft-authoring-document-tool.pglite.integration.test.ts` | One exclusion assertion finds processed study prose in retained structured source context; verify actual allowed scope and evidence use. |
| `server/services/c2c/__tests__/node-status-follows-work.pglite.test.ts` | Two cases expect a signing request after approval/freeze to return 200; current guard returns 403. Check immutable status/audit effects and legitimate first signatures. |
| `client/src/concept2cure/v2/__tests__/biostatWorkbench.test.tsx` | The indication selector matches multiple real forms; scope to the intended calculator and retain request/result assertions. |
| `client/src/concept2cure/v2/__tests__/workbenchRendersNotComputedReason.test.tsx` | Three unmeasured-result checks use an ambiguous Interim look selector; target the actual calculator control. |

The full native CI artifact additionally had five failures: two missing-font
exports and three stale launch catalog/CMC expectations. All are covered by the
128-case corrected native pass. The independent first-run jobs for blank DB
provisioning/replay, production boot, production-image sign-in, AnA readiness,
security contracts and full-history secret scan passed. Lint's separate static
gate and dependency-ledger repairs belong to the backend owner.

These are scoped local implementation proofs. A green current remote full suite,
numeric coverage, production chain/signing secrets, scientific/model
qualification, licensed agency validation and accepted gateway transport remain
separate evidence requirements.

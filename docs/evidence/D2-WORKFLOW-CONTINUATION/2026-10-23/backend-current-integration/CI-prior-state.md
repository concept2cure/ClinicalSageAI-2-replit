# Prior canonical CI state, 23 October 2026

Read-only inspection of decoded GitHub job logs for prior canonical `9c2148dc4` (parent of `55f75b72f`). These are prior remote failures, separate from this delivery's local checks and its eventual published-SHA CI. The CLI returned empty failed-log output; the GitHub connector returned the decoded logs. Full raw logs and configuration values are not copied here.

## Browser cause

[Tier 5 Browser Smoke, run 39879778806 / job 120174090544](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/39879778806/job/120174090544) first fails in `tests/e2e/dev-auth-helper.ts:45`:

> dev-login needs an identity: set SMOKE_USER_EMAIL or DEMO_USER_EMAIL.

That same failure precedes authentication in all three failed browser steps: authenticated smoke (1 failed, 1 passed), launch access control (10 failed, 10 passed) and keyboard coverage (7 failed, 1 passed). The golden customer journey step passed its one case. Startup Redis/provider warnings and the later database log output do not replace this first browser failure as its cause. No authenticated keyboard or surface acceptance is inferred from the unauthenticated negative controls.

Platform release owns configuring the intended, already-provisioned synthetic identity and rerunning the affected browser checks. No identity, credential or permission was invented during this inspection.

## Semgrep findings

[Semgrep, run 39879778887 / job 120174090334](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/39879778887/job/120174090334) reports **15 blocking findings across 14 paths** in its changed-code comparison with `8c6bd712e`:

| Rule | Location in the prior CI log |
| --- | --- |
| GitHub Actions shell interpolation | `.github/workflows/provision-database.yml:117` |
| Nonliteral regular expression | `docs/evidence/W5/2026-10-21-ind-reference-lane/driver/walk.mjs:35` |
| Nonliteral regular expression | `server/__tests__/services/submission-orchestrator.test.ts:653` |
| Nonliteral regular expression | `server/db/bootstrap/__tests__/auth-schema-migration.test.ts:42` |
| Hardcoded JWT secret | `server/routes/__tests__/passwordResetAuditTrail.test.ts:536` |
| Express data exfiltration | `server/routes/c2c/projects.ts:605` |
| Nonliteral regular expression | `server/services/ana/skills/selector.ts:145` |
| Nonliteral regular expression | `server/services/cmc/__tests__/composition-boundary-callers.contract.test.ts:137` |
| Nonliteral regular expression | `server/services/cmc/__tests__/place-module3-into-submission-boundary.test.ts:158` |
| Nonliteral regular expression | `server/services/export/__tests__/recorded-downloads.contract.test.ts:129` |
| Nonliteral regular expression | `server/services/export/__tests__/recorded-downloads.contract.test.ts:185` |
| Nonliteral regular expression | `server/services/submission-gateways/__tests__/fda-admin-forms.test.ts:46` |
| Nonliteral regular expression | `server/services/submission-gateways/ectd-structural-validator.ts:389` |
| Nonliteral regular expression | `server/startup/__tests__/env-hosted-owner-credential.test.ts:70` |
| Nonliteral regular expression | `server/startup/__tests__/env-production-overrides-posture.test.ts:104` |

The complete rule IDs are `yaml.github-actions.security.run-shell-injection.run-shell-injection`, `javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp`, `javascript.jsonwebtoken.security.jwt-hardcode.hardcoded-jwt-secret` and `javascript.express.security.express-data-exfiltration.express-data-exfiltration`. Twelve findings are the nonliteral-regex rule: ten test/evidence locations and two production locations. The JWT location is an invalid-token negative control; this note does not dismiss the scan finding or approve a suppression.

At inspection, none of the 14 flagged paths is changed by the retained delivery against canonical `55f75b72f` (`git diff --name-only` over all flagged paths is empty). That does not qualify the unpublished delivery's security scan. Platform release and the assigned source owners retain the prior findings as open work. No scan rule, threshold, baseline, test assertion or suppression was changed. The final delivery's remote CI must be read against its actual published SHA.

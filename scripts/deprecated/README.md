# Deprecated scripts

These scripts are no longer wired into `package.json` or any CI workflow.
Each backed an npm script that has been removed in Phase D of the codebase
architecture cleanup (2026-06-28).

| File | Original npm script | Reason archived |
|---|---|---|
| `cerv2_seed_demo.js` | `cerv2:seed-demo` | CER v2 feature-branch fixture; no CI consumer |
| `verify_cerv2_workbench.js` | `cerv2:verify` | CER v2 feature-branch validator; no CI consumer |
| `cerv2_staging_verify.mjs` | `cerv2:staging-verify` | CER v2 staging gate; called only by `cerv2_deploy_rc.sh` which is also archived |
| `cerv2_deploy_rc.sh` | `cerv2:deploy-rc` | CER v2 RC deploy; calls `cerv2_staging_verify.mjs` |
| `cerv2_postmerge_verify.mjs` | `cerv2:postmerge-verify` | CER v2 post-GA verifier; no CI consumer |
| `smoke_cerv2_workbench.js` | `smoke:cerv2-workbench` | CER v2 smoke test; no CI consumer |
| `e2e_smoke_assembly.mjs` | `smoke:e2e-assembly` | Obsolete smoke test; no CI consumer |
| `pdev_smoke.mjs` | `smoke:pdev` | Obsolete dev smoke test; no CI consumer |

If you find a real need for any of these, restore the file to `scripts/`
and re-add the corresponding npm script. Otherwise they can be deleted in
a future cleanup.

The following entries were also removed from `package.json` in the same
change but kept their backing scripts (which remain in active use by
other code paths):

- `beta:seed:510k` — backing `scripts/seed-beta-510k-workspace.mjs` is
  still invoked by `scripts/run-beta-founder-proof.mjs` (the `beta:proof`
  CI entry).
- `beta:founder-proof` — superseded by `beta:proof`, which calls the
  same Playwright spec via a wrapper.
- `audit:last-20-prs`, `audit:last-20-prs:plan`,
  `audit:last-20-prs:plan:auto-install` — `:plan:strict` remains the CI
  variant; the underlying scripts are also exercised by
  `tests/ops/*.test.mjs`.
- `audit:repo-health` and `ci:audit-route-mounts` (base variants) — the
  `:strict`, `:no-regression`, and `:full-strict` flag variants are the
  ones actually invoked by CI. The base variants had zero callers.

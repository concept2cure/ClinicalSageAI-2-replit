# D5 — the audit-chain verifier runs from the production image (audit lead #1)

**Row D5.** SOP-SEC-001 §10 step 5 owes "the audit-chain verifier run against
production, output filed". It could not be run. Production's database admits only
the API's own ECS tasks (`scripts/ops/ecs-one-off-task.sh`), so the verifier has
to run from the deployed image, and the image had no runnable copy of it:

- `npm run ops:verify-audit-chain` is `tsx scripts/ops/verify-audit-chain.mjs`;
- the production stage installs `--omit=dev` (no tsx) and copies no `scripts/ops`;
- the script imports TypeScript modules plain Node cannot load.

## Change

- `scripts/build-server.mjs` now has `productionBuilds()`, the one list
  `npm run build` iterates: the server (`dist/index.js`) and the verifier
  (`dist/ops/verify-audit-chain.mjs`), with the server's own esbuild options. The
  verifier's NODE_ENV is deliberately not baked in. `dist/` is already copied whole
  by `Dockerfile.optimized`.
- `server/services/audit/__tests__/verify-audit-chain-production-bundle.test.ts`
  builds the verifier from that list, runs it in plain Node with an empty
  environment, and compares it with the source verifier on a real chain written by
  `recordGovernedAction`, before and after tampering with one row.
- SOP-SEC-001 §8 and §10 step 5 (rev 0.4), POLICY-BR-005 (0.2), POLICY-IR-004
  (0.4) and SIG-Lite E.3 now name the command that runs in the image, as a one-off
  task, and say how to read exit 1. A runner exit of 1 can also mean the container
  never started, or that Node could not load a module. `deploy-aws.yml`'s
  "exactly ONE artifact" comment is corrected.

## Proof (made to fail first)

| | Case | Result |
|---|---|---|
| red 1 | build script as it was (`git show HEAD:`) | file fails: `productionBuilds is not a function` |
| red 2 | verifier entry removed from `productionBuilds()` | file fails: `productionBuilds() has no entry for scripts/ops/verify-audit-chain.mjs` |
| red 3 | `NODE_ENV` baked into the verifier build | 1 failed, 3 passed |
| green | as committed | 4/4 (`green/test.txt`) |
| green | `node scripts/build-server.mjs`, then run the output | both bundles emitted, the verifier 41 KB, no `require(`; exit 2 |
| green | the two other tests importing `build-server.mjs` | 5/5 |

About `green/npm-run-build-then-run-the-output.txt`: run inside the repository, the
bundle loads the repository's `.env` (two directories above `dist/ops/`), so it
reached the local development database. That database's `audit_events` has no
`hmac_seal` column, and the verifier answered **exit 2, could not run**: fail
closed, not a pass. In the image the same path is `/app`, which holds no `.env`.

The review that shaped this (two reviewers, both findings confirmed by a skeptic):
the first draft's test built its own copy, so dropping the shipped build left it
green (red 2 now covers that); and the documents still named the tsx command.

## Not done here

- **The run against production.** It is the founder's live step: SOP §10 step 5.
- **An in-image check** in `Dockerfile.optimized`: run `node dist/ops/verify-audit-chain.mjs`
  in the production stage and require exit 2 with "DATABASE_URL is not set". The
  file is in another lane's 24-hour window until 2026-10-18 23:02 UTC; this is the
  next change.
- **A dispatch workflow** (`verify-audit-chain.yml`) running the verifier from the
  running revision. It needs a fourth one-off family on the deploy role
  (`terraform/stack/github_deploy.tf`, module test `roles.tftest.hcl`) and a
  stack-level name check beside the provision one in `boot_contract.tftest.hcl`.
  That file is in the MR-08 lane's window until 2026-10-19 20:37 UTC. Handed on.
  `terraform test` runs here from a local provider mirror (6/6 on the module today).

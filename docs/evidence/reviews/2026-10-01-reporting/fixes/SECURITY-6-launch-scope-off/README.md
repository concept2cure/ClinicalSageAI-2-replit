# SECURITY-6 (INF-17 extension): LAUNCH_SCOPE_ENFORCE=off in production

Review: `../../security.md`, SECURITY-6, as narrowed by its verifier. An explicit
`LAUNCH_SCOPE_ENFORCE=off` was honoured in production with no log line, and the deploy
preflight did not look at it. With it off, every router outside the seven launch apps
answers any authenticated member.

`LAUNCH_SCOPE_API_UNATTRIBUTED=report` is **not** changed. The founder decided on
2026-09-26 that it is a permitted explicit value, logged at boot (D2-API-SCOPE README).
The verifier agreed it is not a defect.

## What changed

- `.github/workflows/deploy-aws.yml`, the task-definition preflight: `LAUNCH_SCOPE_ENFORCE`
  is absent or `on`. Any other value is refused, and so is setting it from a secret,
  which the step cannot read.
- `server/services/entitlements/launch-scope.ts`: an explicit `off` in production is still
  honoured, but logged once as an error. It is logged once because the reader also runs
  on every request.
  - Refusing to boot on `off` is a production-mode change. The verifier left that call
    to the founder ("warn, or refuse, if the founder agrees"), so it is not made here.
  - The AWS deploy cannot roll the value either way.

## Shown failing first

The preflight step's own shell, run with `node scripts/ops/terraform-preflight-proof.mjs --td-json <file>`.
`<file>` is the filed Terraform rendering
`docs/evidence/D1/2026-10-01-production-blockers/preflight/api-task-definition.rendered.json`,
with one entry added by `jq`:

| Task definition | Before | After |
|---|---|---|
| unchanged (variable absent) | accepted | accepted, `after-unchanged-td.txt` |
| `LAUNCH_SCOPE_ENFORCE=off` | accepted, `before-off.txt` | **refused**, `after-off.txt` |
| `LAUNCH_SCOPE_ENFORCE=on` | accepted, `before-on.txt` | accepted, `after-on.txt` |
| `LAUNCH_SCOPE_ENFORCE=" ON "` | — | accepted, `after-on-spaced.txt` (the server trims and lowercases too) |
| `LAUNCH_SCOPE_ENFORCE` from a secret | accepted, `before-secret.txt` | **refused**, `after-secret.txt` |

The boot log: `server/services/entitlements/__tests__/launch-scope.test.ts`, "an explicit off
in production is said once". It failed against the previous `launch-scope.ts`
(`expected "vi.fn()" to be called 1 times, but got 0 times`) and passes with the change.

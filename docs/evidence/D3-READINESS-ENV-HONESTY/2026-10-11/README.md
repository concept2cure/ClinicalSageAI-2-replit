# D3: the launch dashboard reported the RLS enforcement blocker green off a laptop

**Row:** D3 (tenant isolation proven). The blocker it misreported, `flag-rls`
("RLS enforcement (RLS_ENFORCE=on)"), is the switch that makes the provisioned
policies filter rows. Also protects D1: `pilot-go-no-go.mjs` is the
pre-human-testing gate and made the same call.
**Workstream:** W2.
**Found by:** re-reading CLAUDE.md Rule 2 and running the two dashboards
`docs/LAUNCH_DEFINITION_OF_DONE.md` names as its instruments.
**Status:** fixed, reproduced red → green, falsified three ways, gated by
`tests/ops/readiness-env-honesty.test.mjs`.

## The defect

Both go/no-go probes opened with:

```js
dotenv.config({ quiet: true });
```

That merges the repository's **gitignored development `.env`** into
`process.env` before a single row is judged. Measured at `1c8e565f`:

```
row flag-rls — "RLS enforcement (RLS_ENFORCE=on)"
  severity: blocker
  owner:    Ops (deploy env)
  status:   ready
  observed: RLS_ENFORCE="on"      ← sourced from .env, not from any deployment
```

On the same tree, the same machine, the sibling gate said of the same switch:

```
⚠ [SOFT] 2. RLS enforcement posture
    RLS_ENFORCE=on but no table FORCEs row security,
    so the switch currently filters nothing
```

Two launch instruments, one commit, opposite readings — and the optimistic one
is the dashboard the definition of done cites.

`ga-readiness-report.mjs`'s own design contract forbids it:

> HONEST-BY-CONSTRUCTION. Every row states what was OBSERVED, not what was
> assumed. **Nothing is ever reported ready on the strength of a comment, a doc,
> or an intention.**

A developer's convenience file is an intention.

### Second consequence: the number moved with the shell

`dotenv.config()` resolves `.env` from `process.cwd()`, not the repository root.
Same script, same commit:

| run from | ready | blockers | nodeEnv | `flag-rls` |
|---|---|---|---|---|
| repo root | 6 | 18 | `development` | **ready** |
| anywhere else | 5 | 19 | `(unset)` | blocked |

A launch verdict that depends on which directory you stood in is not a verdict.

## The fix

`scripts/ops/lib/readiness-env.mjs` is now the one place a readiness probe
decides whose environment it is judging. Both probes use it.

- **Default: the process environment only.** No local file is read.
- **Opt-in:** `--include-local-env` loads it, resolved from the **repository
  root** so the answer cannot move with the cwd.
- **Labelled, always.** Both paths print whose environment produced the verdict;
  `--json` carries `localEnvLoaded`, `localEnvPath` and `localEnvKeys`. Names
  only, never values, per the probes' secret-handling contract.
- **An operator's explicit variable always wins** over the file.

Verification tools are deliberately untouched: `verify-audit-chain.mjs` and
`verify-otp-delivery.mjs` load `.env` to obtain credentials and *perform* an
action. Loading a file to connect is not the same act as judging readiness from
it.

## After

```
DEFAULT (repo root)      ready= 5 blockers=19 localEnvLoaded=False flag-rls=blocked
DEFAULT (other cwd)      ready= 5 blockers=19 localEnvLoaded=False flag-rls=blocked
--include-local-env      ready= 6 blockers=18 localEnvLoaded=True  flag-rls=ready
cwd-dependent rows now: NONE
```

`pilot-go-no-go.mjs` likewise now reports `Database: UNAVAILABLE — DATABASE_URL
not set` by default, where it previously printed `127.0.0.1:5432/clinicalsage`
read from the dev file with nothing saying so.

The honest count is **5 ready / 19 blockers**, not 6 / 18. This row moves by
making the instrument truthful, which lowers the headline — the previous number
was partly a reflection of a laptop.

## Verified by making the check fail

`tests/ops/readiness-env-honesty.test.mjs`, 10 cases. Each guarantee broken in
turn, against the real probe as a subprocess:

| regression reintroduced | tests that go red |
|---|---|
| silent unconditional merge (the original) | 1, 7, **9 — "a production enforcement blocker is not green by default"** |
| resolve `.env` from cwd | 2, 4 |
| file overwrites a real env var | 3 |
| *(restored)* | 10 pass |

The integration cases assert invariants that hold whatever a given `.env`
contains — the default never reports a local file loaded, and the verdict cannot
move with cwd — because `.env` is gitignored and absent in CI, so a test
asserting a specific status would pass for the wrong reason there. The
contents-dependent behaviour is unit-tested against a temp directory.

## What this does not do

It does not make D3 green. The remaining work on `flag-rls` is for Ops: set
`RLS_ENFORCE=on` in a real deployment, and — per the pilot gate's own finding —
ensure tables actually `FORCE ROW LEVEL SECURITY`, because the switch filters
nothing until they do. This change only ensures nobody reads that blocker as
satisfied when it is not.

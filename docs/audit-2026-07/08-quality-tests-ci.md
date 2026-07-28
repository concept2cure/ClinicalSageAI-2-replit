# Chapter 08 — Quality, tests and CI

**Verdict: the tests that exist are unusually good; the gates around them are unusually
easy to pass. Both halves matter.**

---

## 8.1 What was executed

Not estimated — run, on this machine, against the freshly installed database.

| Suite | Command | Result |
|---|---|---|
| **Proof tier** — `tests/schema-contract` + `tests/golden-journeys` | `vitest run` | **17 files · 171 tests · 171 passed · 0 skipped · 116s** |
| **Security** — `server/__tests__/security` + prompt-injection + SAML | `vitest run` | **40 files · 264 tests · 264 passed · 0 skipped · 20s** |
| **Production build** | `npm run build` | **exit 0 · 20.06s · 24 MB `dist/`** |
| **Typecheck** at project heap (6,144 MB) | `tsc --noEmit` | **OOM crash after 379s** |
| **Typecheck** at 24 GB heap | `tsc --noEmit` | **exit 2 · 2 errors** |

**435 tests passed and zero were skipped across the two suites that matter most.** That is a
real result and it should carry weight.

## 8.2 The proof-tier suites are the best asset in this repository

`tests/schema-contract/` (15 files) and `tests/golden-journeys/` (3 journeys + harness) do
something most codebases never attempt: they **apply the real migration files from disk** to
an in-process PGlite database and assert against the resulting schema.

The harness docstring names the exact failure it was built to prevent:

> *"the operating-system unit tests call `vi.mock('../../db')` … They pass while asserting
> nothing about the schema — mocks accept any column name and any enum value. That is how
> conflicts C-1, C-2 and C-7 survived undetected."*

It also explicitly contrasts itself with `server/db/pglite-harness.ts`, which hand-mirrors
DDL and can therefore drift.

Observed in the run: `cmc-module3-tenant-arbiter.contract.test.ts` asserting that *"source
objects … no longer let one tenant rewrite another's canonical CMC input"* — a regression
test written directly against the P0 fixed in #1186. `artifacts-relkind.contract.test.ts`
proving the artifacts migration is re-runnable, tolerates a pre-existing VIEW owning the
name, and serves *"the reader's exact query"* and *"the writer's exact statement, including
its ON CONFLICT."* `drop-draft-safety.contract.test.ts` naming each table a destructive
draft would drop and the shipped file that still reads it.

This is what mature engineering looks like. Both suites run **blocking** at `ci.yml:103`.

**One gap worth naming**: these suites prove migrations are *internally* consistent. They do
not prove the migration set is *complete* — which is exactly the hole this audit fell
through in Chapter 05, where a from-scratch install left 15 schemas and several core tables
uncreated while every contract test passed.

## 8.3 Test posture, quantified

| Measure | Value |
|---|---:|
| Test files (product, excluding skill fixtures) | **1,428** |
| `it()` / `test()` cases | **13,972** |
| `describe()` blocks | 4,135 |
| Suppressed (`describe.skip` / `it.skip` / `todo`) | **42** — very low |
| `server/services` directories with ≥1 test | **124 / 203 (61%)** |
| …at full depth including nested dirs | 149 / 413 (36%) |
| E2E specs (Playwright) | 30 |

Three runners, deliberately partitioned: Vitest 4.1.7 (server + integration + shared),
Jest 29.7 (client jsdom only), Playwright (E2E). `client/jest.config.js:25-45` *derives* its
ignore list by reading each test file and skipping anything that imports `vitest` — a real
fix for a real cross-runner collision, documented inline.

CI now stands up `pgvector/pgvector:pg15` before `npm test` (`ci.yml:236-311`) with an honest
comment: the safety-critical RLS/tenant-isolation/audit/migration suites *"EXECUTE here
instead of self-skipping on a missing DB (they previously 'passed' by skipping — false
assurance, GA testing finding)."* Catching and fixing that class of self-deception is a
strong signal.

## 8.4 Coverage is configured, then switched off

`vitest.config.ts:47-52` sets thresholds: **lines 70 · branches 60 · functions 70 ·
statements 70**.

`ci.yml:314-388` — the job titled `Coverage (advisory)` — overrides all four to **0** on the
command line and sets `continue-on-error: true`:

```
npx vitest run --coverage --coverage.thresholds.lines=0 --coverage.thresholds.functions=0 \
    --coverage.thresholds.branches=0 --coverage.thresholds.statements=0
```

`@vitest/coverage-v8` is not a declared dependency — it is `npm install --no-save`'d
transiently in CI. There is no `test:coverage` npm script despite a CI comment referring to
one. **No coverage number is enforced anywhere in this repository.**

The comment is at least honest about it. But combined with 39% of service directories having
no test at all, a buyer cannot infer coverage from "the tests pass".

## 8.5 E2E is not a pull-request gate

30 Playwright specs exist in `tests/e2e/`. `ci.yml` does not run them. They execute only in
`beta-founder-proof.yml`, triggered by `workflow_dispatch` and a weekday 9am cron. A change
that breaks the login flow or the primary workspace can merge with every PR check green.

## 8.6 The gates that cannot fail

Detailed in Chapter 11; summarised here because they belong to the quality story:

| Gate | Why it cannot fail |
|---|---|
| **Typecheck** (`ci.yml:231`) | Counts `/error TS/` and never checks tsc's exit code. tsc OOMs at the 6,144 MB cap the gate itself sets → 0 matches → pass. **Proven by execution.** With adequate heap it reports 2 errors from PR #1180, merged the day before this audit. **Corroborated in CI — see §8.6.1.** |

### 8.6.1 The gate observed passing in CI on a commit that contains type errors

The audit's own pull request (#1189) provided an unplanned control experiment.

`ci.yml:231` runs `npm run ci:typecheck:no-regression` — the exact script analysed above.
That job **completed with conclusion `success`** (run `30378548693`, 16:40:54 → 16:46:36,
5m42s) on a commit whose tree contains the two `TS7016` errors in
`server/services/ana/__tests__/{council-tool,deep-investigation}.test.ts`.

Those errors are deterministic: they arise from importing `scripts/db/migration-set.mjs`,
a local `.mjs` file with no declaration, under `noImplicitAny` with `allowJs` unset. Nothing
about a CI runner changes that outcome. So one of two things happened:

1. **tsc did not complete** — the same OOM reproduced locally at the same 6,144 MB cap — and
   the gate read 0 errors from a crash log and passed; or
2. tsc completed, saw those 2 errors, and the gate passed anyway with `2 > 0`.

The second is impossible given the script's logic (`errorCount > baselineCount → exit 1`).

**What is proven, and what is inferred.** Proven: the gate contains no exit-code check; at
the configured cap tsc OOMs and the gate then reads zero errors; with adequate heap tsc
reports 2 errors in files this audit did not touch; CI ran that script on that tree and went
green. Inferred, strongly: CI's tsc crashed rather than completed. The audit reports the
inference as an inference — but under either branch, **the gate went green over a tree that
does not typecheck**, which is the finding.

### 8.6.2 The lint gate observed passing on 6,268 warnings

The same CI job's log ends with:

```
✖ 6268 problems (0 errors, 6268 warnings)
```

and the job succeeded. This is direct confirmation of the mechanism described above:
`npm run lint` is a bare `eslint .` with no `--max-warnings`, and only 13 rules are set to
`error`. **6,268 warnings is not a gate result; it is a number nobody is reading** — and it
excludes `client/src/**` entirely, so the real figure is unknown.
| **Per-PR ESLint** (`pr-checks.yml:99`) | `npx eslint $FILES --max-warnings 0 \|\| echo "Lint warnings found"` — `\|\| echo` swallows the exit code. |
| **Repo-wide lint** (`ci.yml:221`) | `npm run lint` is a bare `eslint .` with no `--max-warnings`; only 13 rules are `error`, the rest `warn`. |
| **Semgrep** (`semgrep.yml:30`) | `continue-on-error: true` at job level. |
| **Trivy config scan** (`ci.yml:796`) | `continue-on-error: true`. (The Trivy *filesystem* scan **is** blocking.) |

And the linting hole that produced real security findings: `eslint.config.js:34` ignores
**`client/src/**` entirely** — 871 files, 191,327 lines — plus `scripts/**` at `:46`. That
is why `react/no-danger` never flagged the unsanitized `dangerouslySetInnerHTML` sinks fed
by streamed LLM output.

## 8.7 Type safety is nominal

`tsconfig.json:3-4` sets `"strict": true, "noImplicitAny": true` — genuinely on. But:

| Pattern | server (src) | client/src | shared |
|---|---:|---:|---:|
| `: any` / `as any` / `<any>` / `any[]` | **8,184** | 527 | 126 |
| `as unknown as` | 305 | 62 | — |
| `@ts-ignore` | 12 | 0 | — |
| `@ts-expect-error` | 9 | 1 | — |

862 distinct server source files contain at least one `any`, and
`@typescript-eslint/no-explicit-any` is **not enabled**, so none of them is linted. Two files
are excluded from typechecking outright (`tsconfig.json:35-36`):
`client/src/contexts/AuthContext.tsx` and `.jsx` — **the auth context is not typechecked.**

`@ts-ignore` discipline, by contrast, is excellent: 21 suppressions across ~700K lines.

The honest summary: `strict: true` plus a 0 baseline is real, but a large share of that 0 is
purchased with `any`, which `strict` cannot see — and the gate that would have policed the
rest is not working.

## 8.8 Supply chain and CI hygiene

- **Zero of 137 GitHub Actions `uses:` references are SHA-pinned** — all floating tags
  (`actions/checkout@v4` ×49). `terraform-compliance.yml:22-38` already carries
  `TODO(GA-blocker)` comments acknowledging this and noting the Checkov action was previously
  on `@master`. `pr-checks.yml:22` still uses the deprecated `returntocorp/semgrep-action@v1`.
- **Dependencies are current, not stale** — React 19.2.5, Express 5.2.1, TypeScript 5.6.3,
  Vite 6.4.3, Vitest 4.1.7, Drizzle 0.45.2, helmet 8.1.0, esbuild 0.28.1, with 12 pinned
  security `overrides`. Only laggard: `zod ^3.23.8`.
- **npm-audit allowlist reduced 27 → 1** with `npm ls` proof required per entry — the
  strongest governance artifact in the repo (Chapter 11 §11.2).
- **130 npm scripts, 55 referenced by a workflow, 75 orphaned** — including
  `audit:verify:24h`, `audit:verify:full` and `audit:archive`, which are Part 11 controls.
- **`.replit-ci.yml` is dead** — a 3.4 KB GitLab-CI-shaped file in a GitHub Actions repo,
  referencing a root `jest.config.js` that does not exist, while
  `docs/guides/REPLIT_README.md:167` still presents it as live.

## 8.9 Priority actions

| # | Action | Effort | Why first |
|---|---|---|---|
| 1 | Make the typecheck gate check `tsc.status`; raise the heap cap | **1 hour** | Until this is fixed no quality claim in this repo is verifiable, including the favourable ones. |
| 2 | Fix the 2 type errors from PR #1180 (add a `.d.ts` for `migration-set.mjs` or convert it) | 1 hour | Restores the baseline to a true 0. |
| 3 | Remove `\|\| echo` from `pr-checks.yml:99` | 15 min | Restores the per-PR lint gate. |
| 4 | Re-enable ESLint on `client/src/**`, at minimum `react/no-danger` and the security rules | days | This exclusion is directly responsible for the XSS findings in Chapter 04. |
| 5 | Enforce a coverage floor — start at the current measured number, ratchet | days | A floor that only ratchets up beats a 70% target that is overridden to 0. |
| 6 | Run E2E on PRs, even a smoke subset | days | A broken login can currently merge green. |
| 7 | SHA-pin all GitHub Actions | hours | Already self-identified as a GA blocker. |

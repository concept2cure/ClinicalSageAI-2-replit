# Chapter 11 — The suppression ledger

> Every number here was re-derived by this audit from the files themselves
> (`docs/audit-2026-07/evidence/07-suppression-ledger.json`), not quoted from the repo.

A codebase's baseline files are the most honest thing in it. They are the list of defects
the team has seen, decided not to fix yet, and told CI to stop complaining about. Read
together they answer the question a buyer actually cares about: **how much of "the tests
pass" is real?**

This repository has an unusually mature version of this practice — and an unusually large
ledger.

---

## 11.1 The ledger

| # | Baseline / allowlist | What it suppresses | Count | Gate | Blocking? |
|---:|---|---|---:|---|---|
| 1 | `.typecheck-baseline.json` | `tsc --noEmit` errors | **0** (from 2,598) | `ci:typecheck:no-regression` | ✅ — **but vacuous, see §11.3** |
| 2 | `docs/reports/orphan-endpoints-latest.json` | API endpoints with no caller | **556** of 914 (60.8%) | `audit:orphaned-endpoints:strict` | threshold **600** — 44 slots, deliberate (ci.yml:202-205) |
| 3 | `docs/reports/env-var-docs-baseline.json` | Env vars read by code, absent from `.env.example` | **244** | `check-env-var-docs.mjs` | ❌ **no npm script, no workflow — the gate does not exist** |
| 4 | `scripts/ci/unreferenced-modules-baseline.json` | Modules nothing references | **190** | `ci:unreferenced-modules` | ✅ |
| 5 | `scripts/ci/unbacked-tables-baseline.json` | Tables queried by server code that **nothing in the repo creates** | **89** | `ci:unbacked-tables` | ✅ |
| 6 | `docs/reports/requestdb-coverage-baseline.json` | Route files still on the shared pool (this is what blocks RLS) | **81** | `audit-requestdb-coverage --strict-no-regression` | ✅ |
| 7 | `scripts/ci/duplicate-table-ddl-baseline.json` | Tables with conflicting `CREATE TABLE` across files | **63** | `ci:duplicate-table-ddl` | ✅ |
| 8 | `docs/reports/tenant-isolation-baseline.json` | Raw SQL on tenant tables with no tenant filter | **25** (from 77) | `ci:tenant-isolation:no-regression` | ✅ |
| 9 | `docs/reports/route-mount-audit-baseline.json` | Duplicate mounts / multi-owner prefixes | **8 errors + 7 warnings** of 323 mounts | `ci:audit-route-mounts:no-regression` | ✅ |
| 10 | `migrations/.prefix-collisions-baseline.json` | Colliding migration number prefixes | **13 files** across 4 prefixes | `ci:migration-prefix-collisions` | ✅ |
| 11 | `docs/reports/no-mock-in-prod-routes-baseline.json` | Mock/simulated markers in production routes | **11** | `ci:no-mock-in-prod-routes` | ✅ |
| 12 | `scripts/ci/gateway-bypass-baseline.json` | Files allowed to build an LLM client outside the governed gateway | **3** | `ci:gateway-bypass` | ✅ |
| 13 | `docs/reports/repo-health-scan-latest.json` | Duplicate basenames / oversized files | **249 groups + 84 files** | `audit:repo-health:no-regression` | ⚠️ ✅ blocking, but **auto-refreshed on merge — see §11.4** |
| 14 | `.trivyignore` | CVEs + IaC misconfigurations | **8** (1 unpatched CRITICAL) | Trivy | ✅ fs scan / ❌ config scan advisory |
| 15 | `scripts/ci/audit-with-allowlist.mjs` | npm-audit high/critical | **1** (from 27) | `audit-with-allowlist` | ✅ |
| — | `scripts/.inline-state-baseline` | inline-state count | **901** (bare integer, no schema) | — | ❌ wired to nothing |

**Defect-class entries under active suppression: ~1,620.**

The counts alone understate it, because the entries are not uniform. #5 (89 unbacked
tables) is not style debt — the file's own header says each entry *"is a feature that
either returns 500 (unguarded query) or silently no-ops."* #6 (81 route files on the shared
pool) is the single item blocking tenant isolation from being switched on at all.

---

## 11.2 What the ledger does well — and it is genuinely well done

A buyer should not read the size of this ledger as carelessness. The discipline around it
is better than most commercial codebases of this size:

- **Entries are framed as defects, not approved patterns.** `unbacked-tables-baseline.json`:
  *"Each is a defect awaiting a code-derived migration or a retirement, NOT an approved
  pattern. Shrink this file; never grow it."* `duplicate-table-ddl-baseline.json`: *"Each
  entry is a defect to be reconciled per ADR-0006."*
- **Entries are pinned to their referencing file set**, so a baselined defect cannot
  silently absorb new call sites.
- **#8 requires a written justification per entry**, and
  `scripts/ci/check-baseline-justifications.mjs` enforces *bidirectional* parity — a missing
  justification and a stale one both fail CI. It was ratcheted 77 → 25, and the accompanying
  note records that a scanner-accuracy pass *"revealed ~7 queries the old extractor could
  not see (several were real cross-tenant leaks, fixed the same day)."* That is exactly the
  right behaviour.
- **#15 is best-in-class.** A 195-line header defines the rules for adding an entry
  (prove exposure with `npm ls`), a stale-entry detector reports accepted-but-no-longer-flagged
  IDs, and the list was reduced 27 → 1. The single surviving entry (`GHSA-gv7w-rqvm-qjhr`,
  esbuild) is *kept even though npm audit no longer flags it*, because `npm ls esbuild --all`
  still shows three in-range copies. That is the correct call, reasoned correctly.
- **#1's `_history` array** narrates every ratchet step including one that went *up* by 20,
  with an explanation of why the PR's own contribution was −7. Honest debt accounting.

The problem is not the practice. It is that three of the gates are not doing what the
ledger implies they are doing.

---

## 11.3 Gate #1 is vacuous — proven by execution

Full evidence in `evidence/00-live-proof-log.md` §LP-06. In short:

`scripts/ci/typecheck-no-regression.mjs` runs tsc with `--max-old-space-size=6144`, then
counts `/error TS/` matches in the output. It **never checks the child process's exit
code**. Run at that heap cap on a 15 GB host, `tsc --noEmit` spends 379 seconds thrashing
and then dies:

```
FATAL ERROR: Ineffective mark-compacts near heap limit — JavaScript heap out of memory
```

A V8 fatal-OOM message contains zero `error TS` substrings, so `errorCount = 0`, which is
`<= baseline (0)`, so the gate prints *"OK — error count 0 matches baseline"* and exits 0.

Re-run with a 24 GB heap and tsc completes with **exit code 2 and 2 real errors**, both
introduced by **PR #1180, merged the day before this audit**. Both files are unmodified in
the working tree, and this audit's own scripts are outside the tsconfig `include` list, so
they are not the cause.

**Consequence:** the headline "2,598 → 0 type errors" is not currently a verified state. The
gate passes because the compiler crashes. This is a one-line fix (`if (tsc.status === null
|| tsc.status > 1) fail`) and it should be the first thing done.

## 11.4 Gate #13 ratchets the wrong way

`.github/workflows/repo-health-baseline-refresh.yml` runs on every push to
`concept2cure-v2`, regenerates `docs/reports/repo-health-scan-latest.json`, and **commits it
back** with `[skip ci]`. The workflow header states the intent plainly: *"PRs branched after
a merge therefore always see delta 0 — the gate stays strict and self-healing."*

Within a single PR that is true. Across trunk it means the baseline can only move **up**.
`git log` shows it firing (`adb9734`, `1c1cc0a`, both `chore(repo-health): auto-refresh
baseline after merge [skip ci]`). Current suppressed state: 249 duplicate-basename groups
and 84 files over 1,500 lines. Nothing in the system can ever cause that number to fall,
and nothing flags when it rises.

## 11.5 Gate #3 does not exist

`scripts/ci/check-env-var-docs.mjs` is a complete 240-line checker. It maintains
`docs/reports/env-var-docs-baseline.json`, whose `_history` records three ratchet events on
2026-07-21 (260 → 256 → 244). There is a runbook for it at
`docs/runbooks/env-var-documentation-gate.md`.

There is **no `ci:env-var-docs` npm script and no workflow invokes it.** A 7.5 KB baseline
of 244 undocumented environment variables is being hand-maintained for a gate that has
never run. Several of the undocumented variables are security-relevant — `METRICS_TOKEN`,
`FIRECRAWL_WEBHOOK_SECRET`, `FHIR_ACCESS_TOKEN`, `ANA_ALLOW_NONPROD_CONTROL_PLANE`,
`ALLOWED_TEST_ASSEMBLY_TENANTS`.

## 11.6 Gate #2 ships with deliberate slack

`audit:orphaned-endpoints:strict` runs `--threshold 600` against **556** actual orphans.
Forty-four more dead endpoints can merge before anything fails. `Platform API Gateway`
alone owns 375 of them.

## 11.7 Orphaned enforcement

Of **130** npm scripts, **55** are referenced by a workflow and **75** are not. Most of the
orphans are the expected `:write-baseline` / `:strict` manual ratchet variants. These are
not:

| Orphaned script | What is therefore never enforced |
|---|---|
| `audit:verify:24h`, `audit:verify:full` | **21 CFR Part 11 audit-chain verification.** `scripts/run-chain-verify.mjs` prescribes crontab entries in its own header; nothing in the repo schedules it. |
| `audit:archive`, `retention:run` | Audit archival and record retention — both Part 11 controls, both operator-dependent. |
| `ci:governed-export-routes`, `ci:governed-export-consequence-shape` | Governed-export integrity checks. |
| `ci:reasoning-tier-ga-readiness`, `ci:reasoning-tier-uat-evidence` | AI reasoning-tier GA gates. |
| `ci:report-branch-drift`, `ci:ui-kits`, `audit:dead-code`, `audit:bundle` | Drift, dead code, bundle size. |
| `test:submission`, `verify:submission` | Submission-centre verification. |

Note `test:schema-contract` and `test:golden-journeys` also appear orphaned, but they are
legitimately subsumed by `test:proof-tier`, which **is** invoked blocking at `ci.yml:103`.

## 11.8 The three CI gates that cannot fail

| Gate | Mechanism | Effect |
|---|---|---|
| Per-PR ESLint (`pr-checks.yml:99`) | `npx eslint $FILES --max-warnings 0 \|\| echo "Lint warnings found"` | The `\|\| echo` swallows the exit code. **The per-PR lint gate cannot fail.** The repo-wide `npm run lint` is a bare `eslint .` with no `--max-warnings`, so warnings pass there too. |
| Semgrep (`semgrep.yml:30`) | `continue-on-error: true` at job level | Advisory. The comment is candid: *"Ratchet to blocking once the backlog is triaged."* |
| Trivy **config** scan (`ci.yml:796`) | `continue-on-error: true` | Advisory, over an acknowledged backlog of HIGH/CRITICAL IaC misconfigurations. (The Trivy **filesystem** scan **is** blocking.) |

Compounding this: `eslint.config.js:34` ignores **`client/src/**` entirely** — 871 files,
191,327 lines — with the note *"currently excluded because the UI is going through a
separate styling/refactor pass. Re-enable once that lands."* `scripts/**` (199 files) is
ignored at `:46`. Only 13 rules are set to `error`; the rest are `warn`.

That exclusion has a direct security consequence, documented in Chapter 04: the unsanitized
`dangerouslySetInnerHTML` sinks fed by streamed LLM output sit in `client/src`, where
`react/no-danger` could never have flagged them.

## 11.9 A factual contradiction between two suppression files

`.trivyignore:27-35` suppresses a react-router advisory and justifies it by asserting the
app uses `react-router-dom` on *"a couple of auth screens."* It also instructs that the ID
be added to `ACCEPTED_GHSA_IDS` in `scripts/ci/audit-with-allowlist.mjs`.

That sibling file documents having **removed the same entry twice**, each time after
verifying: *"there is NO react-router import in client/src, server/ or shared/… no
react-router entry in dependencies, devDependencies or overrides, and `npm ls react-router
react-router-dom --all` returns nothing. The package is not installed."* Followed by:
*"That is the SECOND time this exact advisory has been re-added with a usage claim that
does not survive checking."*

The `.trivyignore` entry is the third instance. One of these two files is wrong about a
checkable fact, and the mechanism for catching that already exists and was ignored.

Separately, `.trivyignore` suppresses **`CVE-2026-45829` — a pre-auth RCE in chromadb
1.5.9** — correctly noting no patched release exists, and requiring confirmation that
*"chromadb is not exposed to untrusted pre-auth network input."* **That confirmation is
recorded nowhere in the repository.**

---

## 11.10 What this chapter means for the verdict

Two readings are available and both are true.

**The generous reading**, which is fair: this team writes down its debt, pins it, justifies
it per entry, ratchets it down, and leaves comments naming the incident behind each gate.
That is rarer and more valuable than a clean-looking repo with no ledger at all. The ledger
is the reason this audit could move as fast as it did.

**The buyer's reading**, which is decisive: the ledger records ~1,620 known defects, its
flagship gate passes only because the compiler runs out of memory, one gate has no runner,
one ratchets upward by design, one ships with 44 slots of slack, three cannot fail, and the
21 CFR Part 11 audit-chain verification is an unscheduled npm script. The controls that
would tell you the product is healthy are, in several load-bearing cases, not connected to
anything.

Fixing the *gates* is days of work and should precede any other remediation, because until
they work, no other claim about this codebase can be trusted — including the claims in this
audit's favour.

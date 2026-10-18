# Cold market-readiness evaluation — evidence

**What this is.** The evidence behind
[`docs/work-orders/MR-00-market-readiness-roadmap.md`](../../../work-orders/MR-00-market-readiness-roadmap.md):
a cold evaluation of the whole repository for market readiness, the
re-verification of every finding against the current head, and the market
research the roadmap is calibrated against.

| | |
|---|---|
| Audit basis | `92ccdba1` (concept2cure-v2, 2026-09-29) |
| Re-verified at | `94b4f9238` (concept2cure-v2, 2026-10-13) — 4,144 commits later |
| Findings | 228 (23 P0 · 82 P1 · 97 P2 · 26 P3 as rated at the audit basis) |
| Lanes | 11 code lanes + 1 market lane + 1 process lane (git history) |
| Session | Claude Code, `session_01Gx2fiwvxaXi6mQgddPqMaG` |

## Rules the evaluation ran under

1. **Cold.** No lane opened a prior audit, assessment, review, evidence pack,
   handoff, changelog or status narrative — `docs/evidence/**`,
   `docs/validation/**` executed reports, `reports/**`, any file named
   `*AUDIT*`, `*ASSESSMENT*`, `*REVIEW*`, `*HANDOFF*`, `RECONCILE`,
   `CHANGELOG`, `FEATURE_INVENTORY`, `*GAP*`, and the status narrative in
   `docs/LAUNCH_DEFINITION_OF_DONE.md`. Design specs were read for intent only.
   Code comments and commit messages saying "fixed", "proven" or "green" were
   treated as claims and checked in code.
2. **Read-only.** No lane edited, committed or pushed anything. Runtime checks
   used throwaway databases on a local PostgreSQL 16.13 with pgvector 0.6.0.
3. **Evidence or UNVERIFIED.** Every finding cites `file:line` or a command and
   its output; anything that could not be settled from the repository is
   labelled UNVERIFIED, not asserted.
4. **Severity against one target.** P0 = the first paid design-partner pilot
   (sales-led, one US small/mid biotech or medtech, FDA-only, eCTD v3.2.2, one
   AWS production environment) cannot start safely; P1 = must be fixed before
   pilot users rely on it in production; P2 = before enterprise GA; P3 = polish.

## Lanes

| Lane | Report | Scope | Runtime work done |
|---|---|---|---|
| Architecture & codebase health | `lanes/arch.md` | reachability, scope, duplication, dependencies, hygiene | esbuild-accurate import graph; production launch-scope verdict for all 366 mounted `/api` prefixes; case-sensitivity bypass reproduced on Express 5 |
| Security & tenant isolation | `lanes/security.md` | authN, authZ, RLS, inputs, secrets, AI, supply chain, CI security | 19 repo gates run read-only; `npm audit --package-lock-only` |
| Part 11 / GxP | `lanes/part11.md` | 21 CFR 11 clause matrix, Annex 11, ALCOA+ | `ci:sign-ceremony`, `ci:discarded-audit-write`; URS→OQ trace check (71/71) |
| Projects, Vault, Authoring | `lanes/catalog1.md` | journeys traced client → route → service → table | AST extraction of 173 client calls cross-referenced against the mount table (0 broken; checker shown failing on injected calls) |
| Submission Center, Readiness, QMS | `lanes/catalog2.md` | eCTD, transmission, readiness, controlled documents | canonical packager run on a toy FDA IND sequence 0000; `xmllint`, `md5sum` on the output |
| AI layer | `lanes/ai.md` | gateway, model governance, PQ, RAG, grounding, MCP | bypass gate run and 7 synthetic evasion shapes tested; `pq:run` without keys (fails closed) |
| Infra, CI/CD, operations | `lanes/infra.md` | Terraform, image, pipeline, observability, DR, cost | GitHub API run history for every workflow; `ci:*` script cross-reference |
| Frontend & UX | `lanes/frontend.md` | IA, honest state, design system, a11y, performance, i18n | auth-route regex evaluated under node; contrast ratios computed from tokens; CSS nesting counted with postcss |
| Commercial & GTM | `lanes/commercial.md` | tenant lifecycle, billing, email, legal, support, integrations | OpenAPI specs cross-checked against Express routes |
| Data layer | `lanes/data.md` | schema sources, migrations, provisioning, RLS, performance, DR | `npm run db:provision` from empty (24.0 s, exit 0) twice; replay (3.3 s); upgrade simulation from `54927bde`; RLS bypass and signature mutability demonstrated as `app_service`; `pg_dump`/`pg_restore` |
| Quality engineering | `qe-summary.md` | tests, lint, typecheck, build | vitest in five shards (launch subset + four rest shards). **Terminated by a usage limit before typecheck, lint, build and Playwright ran** — see Limits |
| Market context | `market-brief.md` | competitors, buyer qualification, regulatory calendar, GTM | web search only; see Limits |
| Process (git history) | in `MR-00` | delivery velocity, where effort goes | `git log` over the shallow history |

## Re-verification at head

The audit read `92ccdba1`. Before landing, every one of the 228 findings was
re-checked against `94b4f9238` by skeptical verifiers (four parallel
workflows, 4 findings per agent for P0/P1, 8 for P2/P3). Each verifier read the
finding in full, read the code at head, located candidate fixes with
`git log 92ccdba1..HEAD -- <path>`, and assigned one status:

| Status | Meaning |
|---|---|
| `STILL_OPEN` | the evidence still holds at head |
| `PARTIALLY_FIXED` | a fix landed; what remains is named |
| `FIXED` | code at head closes the impact (commit and `file:line` cited) |
| `REFUTED` | the original finding was wrong even at `92ccdba1` |
| `UNVERIFIABLE` | needs AWS, a live provider or a founder action to settle |

Each record also carries a severity re-set against the pilot target, whether a
human tester would hit it (`blocks` / `degrades` / `no`), and — for open items
— numbered instructions written against head, testable acceptance criteria and
an effort estimate. Raw records: `reverify/*.json`. Consolidated:
[`docs/work-orders/MR-findings-2026-10-13.json`](../../../work-orders/MR-findings-2026-10-13.json).

Coverage: 229 of 229 findings carry a status at head (132 still open, 80 partly fixed, 11 fixed, 0 refuted, 6 unverifiable). HT-01 was added from the fresh-environment smoke at `aa4ee1e29` and fixed by `969d1e727` the same day.

## Live probes at head (`94b4f9238`, clean environment)

`probes-at-head.txt`:

- `node scripts/ops/ga-readiness-report.mjs` — blockers ready **0 / 19**
  (advisory 5 / 22). At `92ccdba1` it was 1 / 19; `flag-rls` is a new blocker.
- `node scripts/ops/submission-preflight.mjs` — **2 / 15** licensed or agency
  artifacts present (unchanged).
- `.gitleaksignore` — **3** entries still marked `status: live` (4 at the audit).
- GitHub: repository visibility **public**, licence **MIT**, template **true**,
  forks **1** (2026-10-13).
- CI on `94b4f9238`: typecheck and security contract tests green; the
  authenticated browser smoke failed; 8 of the last 10 `CI` runs on
  `concept2cure-v2` failed.

## Limits — read before relying on this

- **Quality-engineering lane incomplete.** The lane was terminated by an API
  usage limit after the vitest shards. No typecheck, lint, production build or
  Playwright result in this pack comes from this evaluation; CI's own results at
  head are quoted instead.
- **Two lanes ended early after delivering.** The architecture and data lanes
  delivered complete reports and were then terminated mid-follow-up by the same
  limit. Nothing in their reports depends on the unfinished follow-up.
- **No live AWS, no live model provider, no agency gateway.** Anything that
  depends on them is marked UNVERIFIABLE or UNVERIFIED.
- **Web sources were not opened.** The sandbox egress policy refused
  `fda.gov`, `ema.europa.eu` and most vendor sites, so every market claim comes
  from a search-engine extract of the cited URL and is tagged `[C]` primary or
  `[R]` secondary. Re-open a page before using a claim in a contract or pitch.
- **Shallow clone.** Git-history figures cover 2026-09-06 onward only.
- **Scores are judgement.** The 0–10 lane scores are the lane auditors'
  calibrated judgement against the pilot target, not a computed metric.

## Files

| Path | Content |
|---|---|
| `lanes/*.md` | the ten lane reports, verbatim, as delivered against `92ccdba1` |
| `qe-summary.md` | recovered quality-engineering results |
| `market-brief.md` | market-context brief (2026-09-29) |
| `reverify/*.json` | per-batch re-verification records at `94b4f9238` |
| `probes-at-head.txt` | live probe output at head |
| `tools/<lane>/*` | the small scripts lanes wrote (reachability graph, mount verdicts, client→server cross-reference, toy eCTD package, contrast and i18n scans, OpenAPI check) — inputs and large outputs are not filed. Paths read `<repo>` (the checkout the run used) and `<scratch>` (that session's scratch directory). The JavaScript and TypeScript tools are filed with a `.txt` suffix: they are archived audit scripts, not product code, so the lint gate does not inspect them. To re-run one, drop the suffix and substitute your own paths |

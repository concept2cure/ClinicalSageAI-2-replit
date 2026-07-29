# Chapter 01 — Method and coverage

This chapter exists so that every claim in this audit can be located on a spectrum from
*executed and proven* to *read and reasoned* to *not checked*. Nothing is presented as
verified that was not verified, and the boundaries are stated rather than implied.

---

## 1.1 The mandate

Evaluate this codebase **as a buyer would** — with fresh eyes, owing no loyalty to the team
that built it — and answer three questions with evidence:

1. What is actually here, across every layer, service and surface?
2. How does it stack up against the closest competitors in each offering category?
3. Can real humans use it — judged simultaneously against three bars, all of which the
   owner requires now: external pilot, paying commercial customers, and GxP/submission-grade.

## 1.2 The scale problem, stated honestly

| Measure | Value |
|---|---:|
| Files walked | 7,858 |
| Lines of TS/TSX/JS/JSX | **1,489,132** |
| `server/routes` modules | 485 |
| `server/services` files / directories | 2,368 / 203 |
| HTTP endpoint declarations | 4,077 |
| Client `.tsx` files | 527 |
| SQL files | 529 across 12 directories |
| Test files | 1,470 |
| Tables created in SQL / declared in Drizzle | 1,175 / 699 |
| Sellable "apps" in the canonical registry | 20 across 11 disciplines |
| Registered UI surfaces | ~101 |

**1.49M lines cannot be read line-by-line, by anyone, in any timeframe.** Any audit that
implies otherwise is lying. What this audit does instead is achieve *complete mechanical
coverage* of every file, *deep review coverage* of every production surface, and *executed
proof* of the claims that decide the verdict — and then say plainly which findings came
from which.

## 1.3 The four tracks

### Track 1 — Mechanical ground truth (deterministic, 100% of files)

No model judgment. Purpose-built scripts read every file and emit JSON. These set the
denominators for every later claim and are re-runnable by anyone.

| Script | Output | Covers |
|---|---|---|
| `evidence/sweep.mjs` | `01`–`09` JSON | file census, debt census, endpoint matrix, table matrix, migration apply-paths, service/test coverage, suppression ledger, secret scan, upload safety |
| `evidence/fresh-install-gap.mjs` | `10-fresh-install-gap.json` | every table and schema queried by server SQL vs what a from-scratch install actually creates |

Two methodological notes, because they affected the numbers:

- The first version of the table-reference extractor scanned raw source and matched English
  prose in comments and ES `import … from 'express'` statements, producing 1,821 false
  "missing tables". It was rewritten to parse **only string literals containing a SQL verb**,
  with comments stripped. The corrected extractor also captures `schema.table` as a
  qualified pair, which turned out to matter (§LP-02b of the live-proof log).
- The endpoint matrix reports **14.4% of endpoints carry a route-level auth guard**. This is
  *not* a claim that 85% are unauthenticated — a global default-deny boundary covers `/api`
  before any route registers, and live probing confirmed it holds (§1.5). The number
  measures **defence in depth**, not exposure. It is reported that way throughout.

### Track 2 — Deep review fan-out (every production surface)

Audit units were defined so their union *is* the production surface, then reviewed in
parallel against a fixed rubric (correctness · security · tenancy · data integrity ·
compliance · UX honesty · test coverage · operability). Every finding must carry a real
`file:line` and a concrete failure scenario — specific inputs or state leading to a specific
bad outcome. "Could be exploited" was rejected as a finding.

Units: auth & identity · multi-tenancy & isolation · Part 11 audit chain & e-signature ·
schema & migrations · AI gateway & model safety · ANA agent layer · API surface &
authorization · client shell & UX honesty · external integrations · billing & entitlements ·
infrastructure/CI/ops · file handling, document generation & governed export · plus a
per-offering pass over the 20 sellable apps.

### Track 3 — Adversarial verification

Every P0 and P1 was handed to independent verifiers **instructed to refute it**, across
three distinct lenses:

1. **Reproducibility** — read the cited code and determine whether the failure actually occurs.
2. **Production reachability** — does it occur in the shipped configuration, given env
   defaults, feature flags, `NODE_ENV` gates and the mount graph?
3. **Compensating controls** — does something elsewhere already mitigate it?

A finding publishes only on majority non-refutation, and carries its verdict. Refuted
findings are recorded as refuted rather than deleted, so the reader can see what was
considered and dismissed.

This matters because the failure mode of a thorough audit is not missing things — it is
publishing plausible-sounding wrongness with a confident file:line attached.

### Track 4 — Live proof (execution, not reading)

The claims that decide the verdict were tested by running the system. Full log:
`evidence/00-live-proof-log.md`.

| Check | Executed? | Result |
|---|---|---|
| `git fetch --unshallow` + provenance analysis | ✅ | 5,749 commits; 63.5% by named AI agents |
| `npm ci` | ✅ | clean |
| `npm run build` | ✅ | exit 0, 20.06s, 24 MB `dist/` |
| `tsc --noEmit` at the project's configured heap | ✅ | **OOM crash at 6,144 MB** |
| `tsc --noEmit` at 24 GB heap | ✅ | completes, **2 errors** above a baseline of 0 |
| Postgres 16 + pgvector provisioning | ✅ | pgvector required `apt install`, absent by default |
| `scripts/db/install-fresh.mjs` on an empty DB | ✅ | 702 tables / 572 policies — **and 10 skipped migrations, 15 missing schemas** |
| Server boot against that DB | ✅ | boots; own security self-check reports `failing` |
| `/healthz` `/readyz` `/api/health` probes | ✅ | **`/readyz` green over a DB missing auth/RBAC tables** |
| Unauthenticated probes of 9 data endpoints | ✅ | **all 401 — boundary holds** |
| Proof-tier suites (`schema-contract`, `golden-journeys`) | ✅ | see Chapter 08 |
| Headless browser walk of primary surfaces | ⬜ | **not completed — not claimed** |
| Authenticated cross-tenant probes | ⬜ | **not completed — cross-tenant findings are static-analysis only** |

## 1.4 What was NOT done — stated plainly

- **No line-by-line read of 1.49M lines.** Deep review is surface-complete, not line-complete.
- **No authenticated multi-tenant runtime probe.** The cross-tenant findings in Chapter 05
  are derived from code and schema, adversarially verified, but not demonstrated against a
  live two-org deployment. They are labelled accordingly.
- **No browser-driven journey walk.** Usability findings in Chapter 09 are derived from
  code, not from watching a human fail.
- **No penetration test.** Security findings are code-derived plus limited live probing.
- **No competitor product trials.** Competitive scoring uses public sources with URLs; it
  does not reflect hands-on use of competitor products.
- **No validation of the AI models' regulatory output quality.** Whether ANA's generated
  content is *correct* regulatory writing is a domain-expert question this audit does not
  answer. It assesses whether the system can tell you when it is wrong.

## 1.5 On disagreeing with the repository's own documents

The repo contains roughly forty self-authored audits and readiness assessments. This audit
treats them as **the seller's documents**: inputs to be tested, never sources of truth.
Where they are contradicted, both are shown side by side.

That posture was validated early. `FEATURE_INVENTORY.md` names
`client/src/concept2cure/ZenApp.tsx` as the application entry point and describes it as
113 KB; `AGENTS.md` documents a post-login crash inside it. **That file does not exist.**
The real shell is `client/src/concept2cure/v2/Shell.tsx` / `V2App.tsx`. If the two primary
onboarding documents are wrong about where the application starts, no internal document can
be used as a map.

The same posture also produced findings *in the repository's favour* — see §LP-08, where
live probing showed the authorization boundary holding on every endpoint tested, in a mode
where static reading predicted it might not.

## 1.6 Severity and gate model

| Severity | Meaning |
|---|---|
| **P0** | Blocks **G1**. Unsafe or dishonest for any human use: data loss, cross-tenant exposure, silently-wrong regulatory output, or a core journey that cannot complete. |
| **P1** | Blocks **G2**. Prevents taking money safely: billing correctness, DR, security-review survivability, claims not matched by code. |
| **P2** | Blocks **G3**. Prevents GxP/submission-grade use: Part 11, validation, retention, qualification. |
| **P3** | Quality, maintainability, performance, hygiene. |

| Gate | Bar |
|---|---|
| **G1 · External pilot** | Non-regulated data, design partners. No data loss, no cross-tenant leakage, honest empty/error states, no silently-wrong regulatory output, humans can finish the core journeys. |
| **G2 · Paying commercial** | + billing and entitlement correctness, uptime/DR, support runbooks, survives a customer security review, on-page and contractual claims matched by code. |
| **G3 · GxP / submission-grade** | + 21 CFR Part 11 / Annex 11 in full: validated e-signature, tamper-evident audit trail, retention, executed IQ/OQ/PQ, vendor-qualification survivability. |

Every finding is tagged with the highest gate it blocks. Where a gate is already failed,
the audit still enumerates every defect behind it — "already failed" is not a reason to stop
counting, because the remediation programme needs the full list to be sized.

## 1.7 Reproducing this audit

```bash
# ground truth
node docs/audit-2026-07/evidence/sweep.mjs

# fresh-install gap (requires an empty Postgres 16 + pgvector)
createdb audit_fresh
DATABASE_URL=postgresql://…/audit_fresh node scripts/db/install-fresh.mjs
DATABASE_URL=postgresql://…/audit_fresh node docs/audit-2026-07/evidence/fresh-install-gap.mjs

# the typecheck-gate defect
NODE_OPTIONS="--max-old-space-size=6144"  npx tsc --noEmit ; echo "exit=$?"   # OOM, gate reads 0
NODE_OPTIONS="--max-old-space-size=24576" npx tsc --noEmit ; echo "exit=$?"   # completes, 2 errors
```

Every table in this report traces to a file under `docs/audit-2026-07/evidence/`.

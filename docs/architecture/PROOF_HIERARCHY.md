# Proof Hierarchy — the consistent ladder of evidence

**Status:** canonical · **Owner:** platform quality · **First written:** 2026-07-30

This document names the platform's ladder of proof and the one rule that governs
it. It exists because readiness evidence is uneven: some subsystems carry
invariant-grade tests (real schema, real DB, tenant-negative, adversarial), while
others rest a release claim on far less — a comment, a route's presence, a
fixture-backed screen, a test whose services are all mocked, a skipped live
dependency, or **handcrafted XML no external tool ever re-checked.**

Those weaker artifacts are not worthless; they are just **lower on the ladder
than the claims they are asked to support.** The failure mode is not "no tests."
It is a *tier mismatch* — a Tier-7 claim ("this eCTD package will pass the
agency validator") propped up by Tier-1 evidence ("the function returned an
object of the right shape"). This document makes the ladder explicit so that
mismatch is visible and namable in review.

Related reading: `docs/audit-2026-07/08-quality-tests-ci.md` (the July 2026
quality audit — origin of the term *proof tier*), `EVALIDATOR_INTEGRATION_SPEC.md`
(Tier 7), `tests/schema-contract/harness.ts` and `tests/golden-journeys/harness.ts`
(the harnesses that make Tiers 2–6 real).

---

## The ladder

Each rung answers a strictly stronger question than the one below it. A rung does
**not** subsume the ones beneath it — it *depends* on them: an export-reopen proof
is only meaningful because the schema and DB-integration rungs already hold.

| # | Tier | The question it answers | What **qualifies** as proof | What does **NOT** qualify (and is routinely mistaken for it) | Where it lives |
|---|---|---|---|---|---|
| 1 | **Unit** | Does this pure logic compute the right output? | A deterministic function asserted over real inputs incl. edge/boundary cases and error paths. | A test that only checks a value's *shape*/type; a component that merely *mounts*; a snapshot nobody reads. | `tests/unit/`, `server/**/__tests__/*.test.ts`, `tests/services/` |
| 2 | **Schema contract** | Does the schema a deployment actually produces match what the code assumes? | **Real migration files applied from disk** to an in-process Postgres, then introspected/queried with the reader's and writer's exact statements. | `vi.mock('../db')` returning stubs that accept any column or enum value; hand-mirrored DDL in a template literal (it *is* a second copy that can drift). | `tests/schema-contract/` |
| 3 | **DB integration** | Does the service behave correctly against a real database, not a mock of one? | Service run against real DDL on PGlite/Postgres; rows actually written and read back; transactions, FKs and constraints exercised. | A test asserting a mock's `insert()` was *called*; an in-memory map standing in for a table. | `*.pglite.test.ts`, `tests/**/…-db-integration.test.ts`, the golden-journey harness DBs |
| 4 | **Tenant isolation** | Can one tenant ever see or mutate another tenant's data? | A **negative** proof: a second org/tenant is seeded and a cross-tenant read/write/list is shown to return empty or be rejected **at the DB boundary** (RLS / scoped query), not just in app code. | A single-tenant happy-path test; an `organizationId` filter asserted only in TypeScript with no adversarial second tenant. | `tests/**/*.contract.test.ts` (e.g. `socket-tenant-isolation`, `smart-field-linking-tenant-scope`, `cmc-module3-tenant-arbiter`), `tests/unit/*tenant-isolation*` |
| 5 | **Browser workflow** | Does the real user journey work in a real browser against a running server? | Playwright driving the built app end-to-end: login, navigate, act, assert persisted state — no fixture pill, no stubbed API. | A component test in jsdom; an E2E spec that only runs against a mock server or is skipped when the app/DB is absent. | `tests/e2e/*.e2e.ts` / `*.spec.ts` |
| 6 | **Export reopen** | Is the artifact we emit still valid **after we stop looking at it** — reopened from bytes on disk? | The real exporter writes the artifact to disk; a separate reader **reopens the emitted bytes**, parses them, and re-derives every integrity claim (checksums recomputed from the files, references resolved to real files, magic bytes present). | Asserting the *generator's* in-memory return value; trusting a checksum the same code path just wrote; "the XML string contains `<leaf>`." | `tests/golden-journeys/*.journey.test.ts` (see reference below) |
| 7 | **External validator qualification** | Will the artifact pass the **independent** tool the receiving authority runs — not our own checker? | An external-class validator (agency eValidator, PDF/A conformance engine, XSD/DTD, a third-party parser) run over the reopened package, returning zero error-severity findings — **and** a matching negative proof that a defect is caught. | Our own internal structural validator calling itself "validated"; a claim of conformance with no external tool in the loop. | `server/services/ectd/external-validator/` seam + the reference journey below |

---

## The one rule

> **A release claim must be backed by evidence at the tier the claim requires.
> Evidence one or more tiers below the claim is a _proof gap_ — name it, don't
> launder it.**

Concretely:

- "The calculation is correct" → Tier 1 is enough.
- "The schema ships with the column the reader needs" → needs Tier 2; a passing
  unit test that mocked the DB is a gap.
- "Tenants are isolated" → needs Tier 4; a happy-path Tier-3 test is a gap.
- "The workflow works for a user" → needs Tier 5; a mounted component is a gap.
- "The package we export is valid" → needs Tier 6; the generator's return value
  is a gap.
- "The package will be accepted by the agency" → needs Tier 7; our own internal
  validator is a gap.

A proof gap is not automatically a blocker. It is a **known, written** limitation
— recorded in the artifact's manifest/limitations or the readiness assessment —
so no reader mistakes a lower rung for a higher one. Silent tier-inflation is the
thing this document forbids.

---

## Reference implementations

Point new work at these when you need a worked example of a rung:

- **Tier 2** — `tests/schema-contract/artifacts-relkind.contract.test.ts`
  (re-runnable migration, serves the reader's exact query and the writer's exact
  `ON CONFLICT`).
- **Tier 4** — `tests/schema-contract/cmc-module3-tenant-arbiter.contract.test.ts`
  (one tenant cannot rewrite another's canonical CMC input).
- **Tiers 3 → 6 → 7 fused** —
  `tests/golden-journeys/submission-export-validation.journey.test.ts`.
  It assembles a **real** eCTD package from the canonical core over PGlite,
  reopens the emitted tree from disk (parses the backbone XML, re-verifies every
  `util/index-md5.txt` entry against the actual bytes, checks each PDF leaf's
  `%PDF` magic), then **externally qualifies** it with the license-free
  FDA-criteria eValidator subset — and proves the gate is non-vacuous by showing
  a 0-byte leaf and a deleted regional backbone are both caught. This is the
  journey that converts "handcrafted XML, checked only by our own eyes" into a
  reopened, externally-qualified artifact. Its proof packet is written to
  `tests/golden-journeys/__reports__/submission-export-validation.{manifest.json,report.md}`.

---

## Honest current state (2026-07-30)

Per the July 2026 quality audit and this pass, so no rung is overstated:

- **Tiers 1–4 are the platform's strongest asset.** The schema-contract and
  golden-journey suites apply real migrations from disk and run **blocking** in
  CI. Known limitation (audit §8.2): they prove migrations *internally
  consistent*, not the migration set *complete*.
- **Tier 5 (browser) exists but is not a per-PR gate.** 30 Playwright specs live
  in `tests/e2e/`; `ci.yml` does not run them (audit §8.5) — a broken login can
  merge green. Treat Tier-5 claims as unverified on any given PR until this is
  gated.
- **Tier 6 (export reopen)** was the thinnest rung: exporters were asserted on
  their in-memory output, and the external-validator tests ran against
  hand-authored fixture directories rather than a real emitted package. The
  reference journey above closes that for the eCTD path; other exporters (CER/IND
  PDF, DOCX) still need their own reopen proof.
- **Tier 7 (external qualification)** is real but **scoped**: the license-free
  FDA-criteria subset is *not* the commercial LORENZ agency validator. It drops
  in behind the same seam (`EVALIDATOR_BINARY`) with no test rewrite; until it
  does, a Tier-7 *pass* means "survived an external reopen-and-check," not
  "agency-accepted." That distinction is recorded in every manifest that uses it.

---

## How to run the proof tier

```bash
# Schema-contract + golden-journeys (Tiers 2–7), the blocking CI suite:
npm run test:proof-tier

# Just the export → reopen → external-qualification journey:
npx vitest run --config vitest.config.ts \
  tests/golden-journeys/submission-export-validation.journey.test.ts

# Browser workflow (Tier 5) — needs a running app + DB:
npx playwright test
```

## Classifying a test in review

Ask, in order, and stop at the first "no" — that is the tier the test actually
proves, regardless of what its name claims:

1. Does it run **pure logic** with asserted outputs? → at least Tier 1.
2. Does it apply the **real schema from migrations** (not a mock, not mirrored
   DDL)? → Tier 2.
3. Does it write and read back rows through a **real DB**? → Tier 3.
4. Does it seed a **second tenant** and prove a cross-tenant access is denied at
   the DB boundary? → Tier 4.
5. Does it drive a **real browser against a running server**? → Tier 5.
6. Does it **reopen emitted bytes from disk** and re-derive their integrity? →
   Tier 6.
7. Does an **external-class validator** pass the reopened artifact, with a
   negative proof it isn't vacuous? → Tier 7.

If a claim in the PR description or a spec sits above the tier its tests reach,
that is the proof gap to raise.

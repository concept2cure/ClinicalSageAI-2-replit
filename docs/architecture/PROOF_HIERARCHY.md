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
- **Tier 5 (browser workflow)** — `tests/e2e/authenticated-app-smoke.e2e.spec.ts`
  (helper: `tests/e2e/dev-auth-helper.ts`; recipe: `npm run test:e2e:smoke`).
  A real Chromium boots the real SPA carrying a **real** auth session — minted by
  the same flow the client uses (`POST /api/auth/dev-login` → `GET /api/v1/auth/session`
  → the four `trialsage_*` storage keys), not mocked network responses — passes
  `ProtectedRoute`, and renders authenticated-only surfaces served by the live
  server (the landing greeting `<h1>` and the Projects `<h1>`). A **negative
  control** navigates the same protected route with *no* session and asserts the
  guard bounces it to `/login`, pinning the positive test's meaning: it can only
  pass because an authenticated user was let through, not because the route is
  public. The boot-and-run recipe (`scripts/run-e2e-smoke.mjs`) seeds the login
  user, boots the server with dev-auth enabled, and drives the spec — one command,
  cold-start tolerant. It runs per PR via the **`tier5-browser-smoke.yml`**
  workflow (real `pgvector` DB provisioned from scratch + real Chromium), so this
  tier is executed, not just present. This is the pattern to copy for a
  fixture-independent browser proof; author new per-workflow specs (510(k) intake,
  submission assembly) the same way rather than depending on a seeded demo project.
- **Tiers 3 → 4 → 6 → 7 fused (eCTD)** —
  `tests/golden-journeys/submission-export-validation.journey.test.ts`.
  It assembles a **real** eCTD package from the canonical core over PGlite,
  denies a cross-tenant leaf at the DB boundary, reopens the emitted tree from
  disk (parses the backbone XML, re-verifies every `util/index-md5.txt` entry
  against the actual bytes, checks each PDF leaf's `%PDF` magic), then
  **externally qualifies** it two ways: the emitted backbone XML is validated by
  **real libxml2** (`xmllint`, via `server/services/ectd/xml-validator.ts` — the
  parser class agency tooling uses), and the license-free FDA-criteria eValidator
  subset passes the whole package. It proves the gate is non-vacuous by showing a
  0-byte leaf, a deleted regional backbone, and a malformed backbone XML are all
  caught. This is the journey that converts "handcrafted XML, checked only by our
  own eyes" into a reopened, libxml2- and externally-qualified artifact. (The
  platform's fuller qualification pipeline — `server/services/ectd/qualification/`
  `qualifyV3`/`qualifyV4`, adding DTD/XSD validation once the licensed schemas are
  vendored — plugs in at the same seam.)
- **Tiers 6 → 7 (PDF)** — `tests/export-contract/pdf-export.proof.test.ts`.
  Renders a real PDF, reopens it with `pdf-parse` (pdf.js — an engine
  **independent** of the pdf-lib writer), then qualifies it with the eCTD PDF/A
  acceptability classifier; a non-PDF, an encrypted PDF, and a corrupted PDF are
  each caught. Honest scope: `classifyPdfA` is detection-only, not a full veraPDF
  verdict.
- **Tiers 6 → 7 (DOCX)** — `tests/export-contract/docx-export.proof.test.ts`.
  Generates a real `.docx`, reopens its OOXML parts (`[Content_Types].xml`,
  `word/document.xml`), and qualifies it with `mammoth` — an OOXML reader
  **independent** of the `docx` writer; a corrupted container and a valid-zip
  that-is-not-a-docx are both caught.
- **Tiers 6 → 7 (XLSX)** — `tests/export-contract/xlsx-export.proof.test.ts`.
  Generates a real `.xlsx` via the universal packager, reopens its OOXML parts
  (`[Content_Types].xml`, `xl/workbook.xml`, the worksheet) with `adm-zip`
  **independently of the writer's object model**, and round-trips the tabular
  rows back through ExcelJS; a corrupted container and a valid-zip
  that-is-not-a-workbook are both caught.
- **Tiers 6 → 7 (CSV)** — `tests/export-contract/csv-export.proof.test.ts`.
  The packager's CSV writer is a **hand-rolled quoter** — the classic home of
  export bugs. Reopens the real bytes with `csv-parse` (a real RFC-4180 parser,
  **independent** of the writer) and round-trips a value containing a comma and
  embedded double-quotes back as a single cell; an unterminated quoted field
  throws, and stripping the writer's quotes mis-splits the comma value — the exact
  bug the quoting prevents.
- **Tiers 6 → 7 (JSON)** — `tests/export-contract/json-export.proof.test.ts`.
  `JSON.parse` is the writer's own inverse, so independence comes from an **`ajv`
  JSON-Schema** over the envelope contract (`title`/`content`/`generator`…): a
  truncated buffer fails to parse and a dropped field fails the schema, proving the
  contract is enforced, not merely that the bytes are parseable JSON.
- **Tiers 6 → 7 (HTML)** — `tests/export-contract/html-export.proof.test.ts`.
  The HTML is built by string concatenation; reopens it with `node-html-parser`
  (an **independent** DOM) and retrieves the authored title from `<title>` and
  `<h1>` and the content token from `.content` via DOM queries (never a byte
  match). A foreign document is rejected by the generator-identity check and
  stripping the `<h1>` fails the structural title check.
- **Tiers 6 → 7 (ZIP)** — `tests/export-contract/zip-export.proof.test.ts`.
  A multi-file deliverable: reopens the archive with `adm-zip` **independently of
  the `archiver` writer**, **cross-references** `manifest.json`'s `files` against
  the real entries (no phantom members), then reopens the nested `.html` (DOM) and
  `.json` (parse) members; a corrupted container fails to reopen and a valid ZIP
  lacking a manifest is rejected.
- **Tiers 6 → 7 (AcroForm fill)** — `tests/export-contract/acroform-fill.proof.test.ts`.
  Not the universal packager: `server/services/forms/fill-official-pdf.ts` fills
  official fillable PDFs (FDA eSTAR / 1571 / 1572 / 3674 …) by writing values into
  AcroForm fields with pdf-lib. The proof fills a real form, flattens it, and
  reopens with `pdf-parse` (pdf.js — **independent** of the pdf-lib writer) to
  confirm the value is actually **rendered** in the emitted document, not merely
  set in a form dictionary the writer owns. A tautology guard proves the token is
  absent from the unfilled template; a mapped-but-missing field throws under
  `missingFieldPolicy: 'error'` and a value-less key is skipped, never invented.

Each journey/proof writes a machine-readable proof packet under its
`__reports__/` directory (the JSON is the truth source; the markdown is rendered
from it).

---

## Honest current state (2026-07-30)

Per the July 2026 quality audit and this pass, so no rung is overstated:

- **Tiers 1–4 are the platform's strongest asset.** The schema-contract and
  golden-journey suites apply real migrations from disk and run **blocking** in
  CI. Known limitation (audit §8.2): they prove migrations *internally
  consistent*, not the migration set *complete*.
- **Tier 5 (browser) now has a fixture-independent proof that is EXECUTED per
  PR.** Most of the ~30 Playwright specs in `tests/e2e/` depend on a seeded demo
  project (e.g. `510k-founder-path` needs the `demo-510k` beta fixture) and had no
  login step, so they proved nothing when that fixture was absent.
  `authenticated-app-smoke.e2e.spec.ts` (above) removes both dependencies: it
  authenticates via the real dev-login flow and asserts on stable authenticated
  surfaces, with a negative control proving the guard bites. Two gates now stand
  behind it: the proof-tier gate floor-guards its **existence** (deleting it fails
  CI), and the **`tier5-browser-smoke.yml`** workflow **runs** it on every PR —
  provisioning a real schema on a `pgvector` Postgres (`scripts/db/install-fresh.mjs`,
  the same from-scratch installer ci.yml's `blank-db-provisioning` job proves),
  installing Chromium, booting the real server with dev-auth, and driving
  `npm run test:e2e:smoke`. A broken login, CORS/CSRF regression, or dead
  authenticated surface now turns that job red and blocks the PR — it can no longer
  merge green. Building the smoke also surfaced and fixed a real dev bug: the
  loopback-origin blank-page (127.0.0.1 was missing from the dev CORS/CSRF
  allowlist; `server/middleware/__tests__/enterprise-security-dev-origins.test.ts`).
  Honest scope: the gate covers the authenticated app shell (login → guard →
  landing + projects), not yet every per-workflow journey (510(k) intake,
  submission assembly) — those specs still need the same fixture-independent
  treatment before they prove anything.
- **Tier 6 (export reopen)** was the thinnest rung: exporters were asserted on
  their in-memory output, and the external-validator tests ran against
  hand-authored fixture directories rather than a real emitted package. It is now
  closed for **eCTD** (backbone XML + MD5 integrity) and **every implemented format
  of the universal packager** — **PDF** (independent pdf.js reopen), **DOCX** and
  **XLSX** (OOXML part reopen + round-trip), **CSV** (RFC-4180 round-trip through
  `csv-parse`), **JSON** (`ajv` envelope schema), **HTML** (independent DOM parse),
  and **ZIP** (`adm-zip` reopen + manifest cross-reference + nested-member
  qualification). The one packager format still without a reopen proof is **XML**,
  because it is declared but **not implemented** (`packageDeliverable` hits its
  `default` case and emits nothing) — a gap in the packager, not the proof set.
  The **official-PDF AcroForm fill** path (`fill-official-pdf.ts`, used for FDA
  eSTAR/1571/1572/3674 forms) is now covered too (fill → flatten → independent
  pdf.js reopen of the rendered value). Remaining generators outside these two
  families should follow the same fill/generate → independent-reopen pattern.
- **Tier 7 (external qualification)** is real but **scoped**: the eCTD path
  validates the backbone XML with **real libxml2** (`xmllint`) and runs the
  license-free FDA-criteria subset — but not yet the commercial LORENZ agency
  validator, nor DTD/XSD validation (which needs the licensed schemas vendored;
  both drop in behind the same `xml-validator`/`EVALIDATOR_BINARY` seams with no
  test rewrite). The PDF path uses detection-only `classifyPdfA`, *not* a full
  veraPDF verdict. Until those licensed engines are wired, a Tier-7 *pass* means
  "survived an external reopen-and-check by an independent engine (libxml2 /
  pdf.js / mammoth / FDA-criteria)," not "agency-accepted." That distinction is
  recorded in every manifest that uses it.
- **Durability.** `scripts/ci/check-proof-tier.mjs` (`npm run ci:proof-tier`)
  ratchets the proof surface: it fails if a baselined proof file is deleted, if a
  journey/proof stops emitting its manifest, or if this document references a
  proof file that no longer exists. The current inventory is in
  `docs/architecture/PROOF_TIER_LEDGER.md`.

---

## How to run the proof tier

```bash
# Schema-contract + golden-journeys + export-contract (Tiers 2–7), blocking suite:
npm run test:proof-tier

# The eCTD export → reopen → external-qualification journey:
npm run test:export-proof

# The PDF and DOCX export → reopen → qualification proofs:
npm run test:export-contract

# Browser workflow (Tier 5) — needs a running app + DB:
npx playwright test

# Enforce the proof surface does not shrink (and regenerate the ledger):
npm run ci:proof-tier               # fail if a proof was deleted / doc drifted
npm run ci:proof-tier:write-baseline # ratchet the floor after adding proofs
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

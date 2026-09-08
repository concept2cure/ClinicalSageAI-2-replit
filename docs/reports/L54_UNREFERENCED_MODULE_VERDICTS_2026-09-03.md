# L54 — per-candidate verdicts for the "unreferenced modules" set

**Date:** 2026-09-03
**Ledger row:** `L54` in `docs/GA_COMPLETION_LEDGER_2026-08.md`
**Tool:** `scripts/ci/prove-module-unused.mjs` (patched during this review — see §4)
**Scope of this document:** turn the checker's candidate set into a reviewed,
evidence-backed verdict per module. **Nothing was deleted.** No module in this
repository was removed, renamed, or edited as part of this review.

---

## 1. Where the numbers actually stand

The numbers recorded in L54 (`26 / 51 / 30` over 107 candidates) are **stale**.
The baseline `scripts/ci/unreferenced-modules-baseline.json` has since been
regenerated and now carries **101** modules, all of which still exist on disk.

| run | candidates | no reference of ANY kind | named only in docs/comments | held by code / fs-path / config |
|---|---|---|---|---|
| L54 as written | 107 | 26 | 51 | 30 |
| this review, checker as found | 101 | **23** | 40 | 38 |
| this review, checker after the §4 fixes | 101 | **23** | **44** | **34** |

The clean set is **23 modules, 4,307 lines** — not 103 modules and not ~22,300
lines. The §4 fixes did not move a single module into or out of the clean set;
they moved four modules out of *held* and into *docs/comments only*, which is
where they always belonged.

Controls pass, including two new ones that fail on the pre-fix logic (§4.3).

**A rerun after this review will print `21 / 46 / 34`, not `23 / 44 / 34`, and
that is correct.** Writing the analysis down changes what the tool sees. This
report names all 23 candidates by construction, so it was added to the script's
`SELF_REFERENTIAL` list — without that, the first run after saving it reported
`0` clean, because every candidate was suddenly "named in documentation". The
updated `L54` row then legitimately names two of them —
`server/middleware/requireLicenseAcceptance.ts` and
`server/utils/docushareHealthCheck.js` — which moves exactly those two from
*no reference* to *named only in docs*. Both already carry a **DOC-ONLY**
verdict in §3 (#7 and #19), so no verdict changes; only the bucket does. The
23 in the table above is the state of the repository as this review found it,
which is the number the verdicts in §3 describe.

This is a live example of the circularity hazard the script's header warns
about: a report *about* the codebase is not a dependency *of* the codebase, and
a dead-code count that a document can change by mentioning the code is not
measuring the code.

---

## 2. Method — the surfaces searched

The methodological warning on ledger row **L13** is the reason this section
exists. L13's delete-list of 43 "dead" audit tables contained 24 live ones
because a TypeScript-only grep cannot see how this codebase actually reaches
things. Every one of the following surfaces was searched **for every one of the
23 candidates**, so this list is what a later reader should audit rather than
trust:

1. **Full repo-relative path, extension-stripped**, as a literal, over every
   tracked file in the repo with `rg --hidden` and only
   `node_modules/.git/dist/build/coverage` excluded. That includes `.py`,
   `.sh`, `.sql`, `.yml`, `.tf`, `.tmpl`, `.json`, `.md`, and extensionless
   files (`.husky/pre-commit`, `.husky/pre-push`, `Makefile`, `CODEOWNERS`).
2. **Basename without extension, whole-word.** This is a *superset* of every
   import-specifier form the repo uses — relative (`../x`), alias (`@/x`,
   `@shared/x`), barrel re-export (`export * from './x'`), and the ESM
   extension swap (`'./x.js'` naming `x.ts`). A module with zero whole-word
   basename hits cannot be named by any specifier in any file.
3. **Every exported symbol**, whole-word, repo-wide — and every hit run down to
   the module that actually defines it. This is what separates
   `validateSchema` the middleware from `validateSchema` the local zod object.
4. **PL/pgSQL and DDL** — `db/migrations/**`, `migrations/**`, `sql/**`,
   `init-sql/**`, `database/**`. (`.sql` is covered by 1 and 2, and was also
   read directly for the four fspath hits in §4.)
5. **npm scripts** — `package.json`, `package-lock.json`. This is the surface
   that made `server/bin/run-retention.ts` (the `retention:run` entry point) a
   false positive on the old delete list.
6. **Hooks and CI** — `.husky/pre-commit`, `.husky/pre-push`,
   `.github/workflows/*.yml`, `.github/**`.
7. **Build / run / deploy surfaces** — `Makefile`, `start.sh`,
   `start-platform.sh`, `Dockerfile.optimized`, `docker-compose*.yml`,
   `.replit`, `app.yaml`, `helm/`, `terraform/`, `infra/`.
8. **Dynamic and computed imports.** Every `await import(...)`, `require(...)`,
   `readdirSync`, and `import.meta.glob` in `server/` and `client/src/` was
   enumerated. **Every specifier in runtime code is a static string literal**
   (e.g. `server/bootstrap/register-regulatory-routes.ts:68`,
   `await import('../routes/ivdr-routes')`). There is **no directory-scanning
   module loader anywhere in runtime code** — every `readdirSync` in the repo
   is in `scripts/`, and every one of those scans generically (migrations,
   evidence packs, CI corpora) rather than importing what it finds. So no
   module can be reached without being named somewhere.
9. **Test-runner globs** — `vitest.config.ts`, `vitest.workspace.ts`,
   `vitest.db.config.ts`, `vitest.clock-shift.config.ts`,
   `vitest.visual-qa.config.ts`, `playwright.config.ts`. A test file is reached
   by a glob, not an import, so "nothing imports it" is not an answer for one.
10. **Registries, catalogs, allowlists and CI baselines** —
    `scripts/ci/*baseline*.json`, the allowlists inside `scripts/ci/check-*.mjs`,
    the route-mount manifest `scripts/ci/audit-route-mounts.mjs`,
    `shared/constants/ui-surface-registry.ts`, `shared/navigation/*`.
11. **Stale build output** `dist/`, as a cross-check on whether a module was
    ever compiled into a bundle. No candidate appears there.
12. **Module system.** `package.json` declares `"type": "module"`. A `.js` file
    that ends in `module.exports = …` cannot be loaded by an ESM importer in
    this repo without `createRequire`, and no candidate is reached through one.
    This is corroborating evidence, not the primary finding.

---

## 3. Verdicts — 23 candidates

Legend: **LIVE** = something real reaches it · **DOC-ONLY** = named only in
prose, a comment, or a captured audit artifact · **NO REFERENCE** = nothing
anywhere, after all twelve surfaces in §2.

| # | module | lines | verdict | evidence |
|---|---|---|---|---|
| 1 | `server/cer2v/auto-vault.ts` | 156 | **NO REFERENCE** | Sole file in `server/cer2v/`. Export `AutoVaultIngest`: zero whole-word hits repo-wide. Zero path hits, zero basename hits. |
| 2 | `server/config/literatureSources.js` | 214 | **NO REFERENCE** | Exports `fetchPubMed`, `fetchScholar`, `fetchFAERS` — zero whole-word hits repo-wide for any of the three. Zero path/basename hits. |
| 3 | `server/config/production.js` | 36 | **NO REFERENCE** | Zero full-path hits. Basename `production` is a common word; all 30+ hits are `NODE_ENV`, deploy-environment names and prose. `module.exports = productionConfig` (line 36) — CommonJS in a `"type": "module"` package, reachable by no importer present. |
| 4 | `server/db/queryBatcher.ts` | 222 | **NO REFERENCE** | Exports `batchQuery`, `configureBatcher`, `getBatchStats`, `logBatchStats`, `resetBatchStats` — zero whole-word hits repo-wide for any. Zero path/basename hits. |
| 5 | `server/integrations/firecrawl/crawl.ts` | 6 | **NO REFERENCE** | Export `firecrawlCrawl`: zero hits. Contrast with its siblings, which *are* live: `server/routes/firecrawl.ts:2` imports `firecrawlScrape`, and `server/services/research-intelligence/runExternalEvidenceSearch.ts:1-2` imports `firecrawlSearch` and `firecrawlScrape`. `firecrawl.ts` exposes only `/scrape` and `/quota-status` (lines 170, 183) — there is no crawl endpoint. |
| 6 | `server/integrations/firecrawl/extract.ts` | 6 | **NO REFERENCE** | Export `firecrawlExtract`: zero hits. Same contrast as #5. |
| 7 | `server/middleware/requireLicenseAcceptance.ts` | 56 | **DOC-ONLY** | `docs/audit-2026-07/evidence/sweep.mjs:151` lists `requireLicenseAcceptance` in a `GUARDS` array — an audit inventory of guard names to look for, not an application of the guard. Zero route mounts. **Governance note:** this is a working license-acceptance gate (it calls the live `server/services/licensing/eula-service.js`) that gates nothing. That is a product decision to make, not a deletion to perform. |
| 8 | `server/middleware/validateDeviceProfile.ts` | 98 | **DOC-ONLY** | Only appearance is `docs/rfi/_evidence/routes.txt:557,560`, a captured `rg` transcript from a *different workspace path* (`/workspaces/Concept2Cure.RI-2-replit/…`) showing `server/routes/cerDeviceProfileRoutes.ts` using it. That route file **does not exist in this repo** (`ls` → No such file). The only current occurrence of the symbol is its own definition at line 81. |
| 9 | `server/middleware/validateSchema.ts` | 204 | **NO REFERENCE** | Exports `validateSchema`, `loadSchema`, `_clearSchemaCacheForTests`. The one symbol hit, `server/routes/cerv2-ai-routes.ts:813`, is `const validateSchema = z.object({…})` — a locally declared zod schema used at line 949, unrelated to this middleware. Zero path/basename hits. |
| 10 | `server/scripts/batch_import.js` | 53 | **NO REFERENCE** | Zero path/basename hits. `module.exports = { runBatchImport }` — CJS in an ESM package. Not named by any npm script, hook, workflow, Makefile target, or shell entry point. |
| 11 | `server/scripts/import_500_trials.js` | 54 | **NO REFERENCE** | Zero path/basename hits, no exports at all, no shebang. A standalone CLI script that no npm script, hook, workflow, Dockerfile or `.replit` entry invokes. |
| 12 | `server/scripts/verify-api-routes.js` | 54 | **NO REFERENCE** | Same shape as #11 — zero hits, no exports, invoked by nothing. |
| 13 | `server/services/analytical/acceptance.ts` | 97 | **NO REFERENCE** | Exports `evaluateAcceptance`, `guardFailuresToGaps`, `GuardGap`. `evaluateAcceptance` has exactly one whole-word hit repo-wide: its own definition. The sibling `__tests__/` directory contains only `method-validation.test.ts`, which never touches it; the `acceptance` hits in `method-validation.ts` are a property name on a different type. |
| 14 | `server/services/cmc/aiInsights.ts` | 38 | **DOC-ONLY** | `HANDOFF.md:322` names it in a prose inventory of `server/services/cmc/*`. `ui_kits/cmc/data.jsx:40` is the comment `/* AI oversight insights (deriveInsights shape). */` — a comment describing a shape, not an import. Export `deriveInsights` has no call site. |
| 15 | `server/templates/regulatory_templates.js` | 535 | **NO REFERENCE** | Zero path/basename hits. Exports `getTemplate`/`getAvailableTemplates` plus three template constants; the six `getTemplate` hits all resolve elsewhere — e.g. `server/routes/protocol-templates.ts:16` imports it from `../services/protocol-templates/protocol-templates-service`. |
| 16 | `server/templates/strategic-report-markdown.js` | 692 | **NO REFERENCE** | Zero path/basename hits. `module.exports = { … }` (line 690) — CJS in an ESM package, reached by nothing. |
| 17 | `server/templates/strategic-report-template.js` | 286 | **NO REFERENCE** | Zero path/basename hits. `module.exports = strategicReportTemplate` (line 286). |
| 18 | `server/test/quality-api-test.ts` | 404 | **NO REFERENCE — and never executed** | Zero path/basename hits. Critically, it is also **not reached by a glob**: it lives at `server/test/`, not `server/**/__tests__/`, and its name ends in `-test.ts` not `.test.ts`, so it matches no `include` pattern in `vitest.config.ts`, `vitest.workspace.ts`, `vitest.db.config.ts`, `vitest.visual-qa.config.ts` or `playwright.config.ts`. It exports `default runTests` and nothing calls it. This is 404 lines of assertions that have never run. |
| 19 | `server/utils/docushareHealthCheck.js` | 100 | **DOC-ONLY — and it invalidates a live CI justification** | Nothing imports it (zero path hits; the two basename hits are prose). But `scripts/ci/check-js-ts-shadows.mjs:62` allowlists `server/config/docushareConfig.js` with the recorded reason *"diverged config actually used in prod via docushareHealthCheck.js; .ts twin only reachable from orphaned config/index.ts barrel."* That reason is **false**: `server/utils/docushareHealthCheck.js:6` is the *only* importer of `docushareConfig.js`, and nothing imports `docushareHealthCheck.js` in turn. So the `.js` config is not "used in prod" — it is reachable only from an unreferenced module. `docs/audits/DUPLICATE_BASENAMES_AND_CANONICAL_MAP.md:46` records the same wrong conclusion. **Deleting this module is safe at runtime but leaves a live CI gate carrying a justification for a file that then has no importer at all.** Fix the allowlist entry first. |
| 20 | `server/utils/generate_sap_snippet.ts` | 246 | **NO REFERENCE** | Zero path/basename hits. Both exported names are common and resolve elsewhere: `generateSAP` in `server/services/sap-generator-service.ts` (imported by `server/routes/biostatPlatform.ts`, `server/services/ana-ri/command-executor.ts`, `tests/services/estimand-sap-section.test.ts`), and `ProtocolData` in `server/protocol-analyzer-service.ts` and four others. |
| 21 | `server/utils/pdf_qc.js` | 113 | **NO REFERENCE** | Zero path/basename hits. Export `qc_pdf`: zero whole-word hits repo-wide. Not on the `APPROVED` list in `scripts/ci/check-pdf-runtime-canonicality.mjs`, and not referenced by it. |
| 22 | `server/utils/quality-utils.ts` | 412 | **NO REFERENCE** | Zero path/basename hits. Ten exports; only the two generic type names hit anything, and both resolve elsewhere — `RiskLevel` to `shared/schema/capa-mdr.ts`, `ValidationResult` to `server/routes/ectd-compile.ts` and others. Both are already recorded in `scripts/ci/duplicate-exported-types-baseline.json` as duplicated names, which is *why* they hit. |
| 23 | `server/validation/deviceValidation.js` | 225 | **NO REFERENCE** | Zero path/basename hits, no symbol hits. `module.exports = { … }` (line 220) — CJS in an ESM package. |

### 3.1 Summary

| verdict | count | lines |
|---|---|---|
| LIVE | **0** | 0 |
| DOC-ONLY | **4** (#7, #8, #14, #19) | 292 |
| NO REFERENCE | **19** | 4,015 |
| **total** | **23** | **4,307** |

No candidate turned out to be LIVE. That is a meaningfully better result than
L13's 43-item list (24 of which were live), and it is the direct consequence of
the checker resolving specifiers against the importing file's directory rather
than string-matching — but see §5 before treating it as a delete list.

---

## 4. False positives found in the checker, and what was fixed

All three fixes are confined to `scripts/ci/prove-module-unused.mjs`. Nothing
else was touched.

### 4.1 A path named in a comment was scored as a path *dependency*

The class L54 already names, and it is worse than the row suggests — it does not
need backticks, and it does not need to be a path literal at all. Plain prose in
a JSDoc block was enough:

- `server/utils/pdfParse.ts:8` — `* same pattern as server/middleware/authAdapter.ts. Import from here instead`
- `db/migrations/20260801_consolidated_tree_reconciliation.sql:214` — `-- ─── MAUD validation (server/db/maudDb.ts) ───`
- `server/utils/expressQuery.ts:17` — `* validation.ts and server/middleware/apiValidation.ts — failed the moment it`
- `server/prisma/client.js:18` — `*   server/pipelines/bulk_import.js   → study_document.upsert (no-op stub).`
- `scripts/ci/check-js-ts-shadows.mjs:54` — `// why: shim for server/scripts/import_lumen_bio_trials.js.`
- `server/data-importer-v2.js:2` — `// rationale. server/scripts/import_lumen_bio_trials.js imports`

**Fix:** occurrences are now tested line-by-line, and an occurrence inside a
comment (`//`, `/*`, ` *`, `--`, `#`) goes to a new `mention` bucket that is
never counted as *held*. `mention` is reported separately rather than merged
into `doc`, so a reader can tell a comment from an architecture document.

**Effect on the counts:** four modules moved out of *held* and into *docs or
comments only* — `server/db/maudDb.ts`, `server/middleware/apiValidation.ts`,
`server/middleware/csrf.ts`, `server/scripts/import_lumen_bio_trials.js`.
Held 38 → 34, docs/comments 40 → 44. The clean set did not change.

Note that `server/middleware/csrf.ts` is the module L54 cites as its one
positive example of something genuinely dead. This fix is what stopped the
checker from reporting it as held.

### 4.2 A `.ts`-suffixed string literal was scored as an import edge

This one had gone unnoticed because it made the checker's own flagship example
contradict its own header. The header says nothing imports
`server/middleware/authAdapter.ts` and that it is reached only by
`fs.readFileSync`. The checker reported **import: 2**, because
`server/__tests__/security/auth-db-contract-smoke.test.ts:43-44` contains
`path.join(repoRoot, 'server/middleware/authAdapter.ts')` and the resolver
accepted any literal starting with `server/` as a module specifier.

TypeScript rejects `.ts`/`.tsx` in module specifiers, so such a literal is
always a filesystem path. **Fix:** skip those literals in the import resolver;
they fall through to the fspath test.

**Consequences of this one are worth stating plainly:** the fspath control on
`authAdapter` had a floor of `minFspath: 1`, and the *only* thing meeting that
floor was the unrelated comment in `pdfParse.ts` from §4.1. The control that
exists to prove the checker can see fs-path references was **passing on a
sentence** while the reference it names in its own `why:` string was being
counted in the wrong bucket. After both fixes: `import 0 · fspath 2`, with the
security test now correctly among the fspath evidence.

### 4.3 The controls had floors but no ceilings

A control set that only asserts "at least N" can fail on undercounting and never
on overcounting, which is exactly the failure mode of §4.1 and §4.2. Added
`maxImport` / `maxFspath` ceilings and two controls that use them:

- `server/middleware/authAdapter.ts` with `maxImport: 0`
- `server/middleware/apiValidation.ts` with `maxFspath: 0`

**Both were run against the pre-fix logic and both FAIL there** (`import 3 >
ceiling 0`, `fspath 1 > ceiling 0`; the run reports `2 control(s) DISAGREE — the
checker is wrong`). They pass against the fixed checker. Per the working
agreement, the gate was seen failing on the case it exists to catch before being
reported as working.

### 4.4 The corpus was missing whole file types

`TEXT_EXT` omitted `.mts`, `.cts`, `.py`, `.rb`, `.tf`, `.tmpl`, `.tpl`, `.j2`,
`.xml`, `.csv`, `.jsonl`, `.http`, and every extensionless file except
`Dockerfile`/`Procfile`/`Makefile` — which meant **`.husky/pre-commit` and
`.husky/pre-push` were not in the corpus at all**, alongside 34 `.py` files and
`CODEOWNERS`. A module invoked only from a git hook or a Python entry point
would have been reported as having no reference of any kind. Given that npm
scripts and hooks are two of the three surfaces L13 was burned by, this was a
live hazard rather than a theoretical one.

**Fix:** extensions added; extensionless files under `.husky/` and `bin/`, plus
`CODEOWNERS`, are now read. Corpus 8,597 → 8,739 files. No candidate gained a
reference, which is itself the useful result: it converts "we did not look" into
"we looked and there was nothing there".

### 4.5 Not fixed — known remaining imprecision

- **A path inside a JSON string is indistinguishable from a path in a comment**,
  because JSON has no comments. `scripts/ci/gateway-bypass-baseline.json:56`
  keeps `server/pipelines/bulk_import.js` in the *held* bucket via a `"reason"`
  field whose text says the module is dead code. The bucket is right in a narrow
  sense (a CI baseline does name it, and deleting the file changes that gate's
  input) and wrong in the sense that matters. Not fixable by string analysis.
- **`server/routes/templates.ts`** is held by `contact: 'server/routes/templates*.ts'`
  in the route-ownership manifest `scripts/ci/audit-route-mounts.mjs:86` — real
  registry metadata, not a functional edge.
- **`server/eval/rag/run-eval.ts`** is held by a documented invocation inside a
  markdown table string in `scripts/ai-governance/generate-evidence-pack.ts:110`.
  Generated documentation, embedded in code, so the comment filter cannot see it.

None of these three is in the 23. They are recorded so the *held* bucket is not
read as 34 functional dependencies.

---

## 5. Is there a safe-to-delete set?

**Not yet — and this is deliberately not a delete list.**

Nineteen modules survive twelve independent surface checks with nothing
referencing them, and four more are named only in prose. Every one of them
would very probably be safe to remove. But "safe to delete" is a claim about
consequences, and three consequences are unresolved:

1. **`server/utils/docushareHealthCheck.js` (#19) is not independently
   deletable.** A live CI gate, `scripts/ci/check-js-ts-shadows.mjs:62`, carries
   a written justification that depends on it and that this review found to be
   false. Deleting the module without correcting that entry leaves a gate
   asserting something untrue about a second file. The allowlist entry — and the
   status of `server/config/docushareConfig.js` itself — has to be settled
   first. That is a change to a governed path, outside this review's scope.

   **RESOLVED (same commit, ledger L150).** Settled by deleting rather than
   rewording: `docushareHealthCheck.js` and `docushareConfig.js` are both gone,
   the allowlist entry went with them (13 pairs -> 12), the baseline was
   regenerated (101 -> 100), and `DUPLICATE_BASENAMES_AND_CANONICAL_MAP.md` was
   corrected. The exemption was first proved load-bearing — with the `.js`
   present and the entry removed, the gate fails naming that pair — so it was
   suppressing a real finding, not decorating a pass. `tsc --noEmit` clean.
   This leaves two unresolved consequences below, not three.

2. **`server/middleware/requireLicenseAcceptance.ts` (#7) is a product
   decision, not a cleanup.** It is a functioning license-acceptance gate wired
   to the live EULA service and mounted on no route. "Nothing calls it" and
   "it should not exist" are different findings. Someone has to say which this
   is before it is deleted; deleting it silently removes the only implementation
   of a control the platform may be expected to have.

3. **The baseline is a ratchet.** `scripts/ci/unreferenced-modules-baseline.json`
   states that the list "may only shrink" and must be regenerated with
   `npm run ci:unreferenced-modules:write-baseline` after any deletion. Any
   removal is therefore a two-part change, and a partial one leaves CI wrong.

The honest position: **there is a reviewed candidate set of 19 modules
(#1-6, #9-13, #15-18, #20-23, 4,015 lines) for which this review can name every
surface it checked, and no surface produced a reference.** That is a strong
result and a considerably better foundation than anything L54 previously had.
It is still one step short of a safe-to-delete list, because the bar for that
is a per-module removal with the baseline regenerated and the suite green — and
that work has not been done here. Anyone doing it should start with #11, #12,
#16, #17, #21 and #23, which have no exports, no callers, and no governance
entanglement of any kind.

The four DOC-ONLY modules (#7, #8, #14, #19) should not be batched with them.

---

## 6. Reproducing this

```bash
node scripts/ci/prove-module-unused.mjs --controls   # must print "All controls agree"
node scripts/ci/prove-module-unused.mjs              # the 23 / 44 / 34 split
node scripts/ci/prove-module-unused.mjs --json       # per-module evidence
```

The per-candidate sweep in §3 is not produced by that script. It is a separate
pass over every surface in §2, and the file:line citations in the table are the
whole point — they are there to be checked, not believed.

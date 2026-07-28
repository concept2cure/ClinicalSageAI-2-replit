# Chapter 15 — Remediation plan, staged by importance

Sequenced so that each stage makes the next one *verifiable*. That ordering is not
cosmetic: several of this platform's controls currently report success without doing their
job, so fixing the instrumentation has to come before fixing what it was meant to catch —
otherwise you cannot tell a real fix from another silent pass.

Every item carries an owner-type, an effort estimate, and an **acceptance test** — a
concrete thing that must be true afterwards, so "done" is provable rather than asserted.

| Stage | Theme | Calendar | Unlocks |
|---|---|---|---|
| **0** | Make the instruments honest | **2–3 days** | Everything else becomes verifiable |
| **1** | Stop the bleeding | **1–2 weeks** | **G1 · external pilot** |
| **2** | Make it sellable | **2–4 months** | **G2 · paying customers** |
| **3** | Make it qualifiable | **6–12 months** | **G3 · GxP** |

---

## Delivered so far

Closed on branch `claude/codebase-audit-competitive-aet792` (PR #1189). Each row names the
commit that closed it and the evidence that it is actually closed — the point of Stage 0
being that a fix asserted is not a fix demonstrated.

| Item | Commit | Proof |
|---|---|---|
| **0.1** Typecheck gate inspects the exit code | `d012635e0` | `TYPECHECK_HEAP_MB=128` → `FAIL — tsc did not complete. exit status: 134`, exit 1 (previously "OK", exit 0). Clean run → `errors found: 0 (tsc exit 0)`, exit 0. The "0 type errors" baseline is a **measured** 0 for the first time. |
| **0.2** The two real `TS7016` errors | `2f9d2d2` | Renamed `migration-set.d.ts` → **`.d.mts`**. The original fix was inert: under `moduleResolution: "node"` a `.mjs` specifier resolves only to `.mts`/`.d.mts` and never consults `.d.ts`. |
| **0.3** Per-PR lint gate can fail | `1e5808d59` | `\|\| echo` removed. Probed in `server/`: an error → exit 1; warning-only → exit 0, so the 6,268-warning backlog still passes. |
| **0.4** Installer fails loudly | *this stage* | Empty DB → **exit 1**, naming 10 unapplied files, instead of `✅`. See below. |
| **0.5** `/readyz` fails closed | `d8df70fc5` | Five terminal branches — including the `catch` that runs when schema verification itself throws — never recorded a verdict, leaving `'unknown'`, which was served as 200. Now `'unknown'` and `'error'` both fail. Auth/RBAC/licensing tables (`auth_users`, `roles`, `permissions`, `user_roles`, `licenses`) fail readiness by name. 15 tests; proven by reverting the `catch` alone and watching exactly that case go red. |
| **1.4** Schedule-of-Events tenant arbiter | `0f6fbcbfe` | Arbiter is now `(organization_id, project_id)` and the narrow unique index is **dropped**, so `ON CONFLICT (project_id)` is no longer expressible. A composite FK to `projects(id, organization_id)` makes a cross-tenant schedule row impossible at the database level. Contract test reproduces the defect first against the old index. 10 tests. |
| **1.5** Stored XSS in Batch Draft | `b3e1e26ca` | Closed at three independent layers: `derivePreview` no longer decodes `&lt;`/`&gt;` back into live markup, `bdSample` escapes everything it interpolates, and the sink runs the shared DOMPurify allowlist. 17 tests, asserting on the DOM rather than on substrings. |
| **1.7** AnA attach button | `271d43aa3` | Uploads now go through `useChatUpload` → `POST /api/chat/upload`. A failed upload is never described as attached. 8 tests, including one asserting the real `File` reaches the `FormData` with non-zero size — which the old implementation could not have satisfied. |
| **—** Unsupported compliance claims | `66529834a` | "SOC 2 Type II" removed from `SECURITY.md` and the signup screen (no report of any type exists; the platform's own `/api/part11/soc2/controls` said so while the landing copy claimed otherwise). Blanket encryption-at-rest and "MFA enforced everywhere" likewise corrected. A new CI gate blocks their return. |

**Not yet closed from Stage 0/1:** 0.6, 0.7, 0.8, 1.1, 1.2, 1.3, 1.6, 1.8, 1.9, 1.10, 1.11.

### On item 0.4 — what the installer was hiding

The acceptance test above understates it. `install-fresh.mjs` did not merely mislabel
unapplied migrations as "safe to skip"; it **printed the psql loop for the governed-content
tree as advice and never ran it**, then declared success. A fresh install therefore produced
a database with **no `audit` schema and no 21 CFR Part 11 tamper-proof audit trail** — and
because the app boots without it (audit degrades non-fatally), nothing ever said so.

Measured on an empty Postgres, before and after:

| | Before | After |
|---|---|---|
| Governed-content files applied | **0 of 43** | **43 of 43** |
| Tables in the `audit` schema | **0** | **17** |
| Unapplied raw migrations | 10, called "safe to skip" | 10, **named**, with the failure reason for each |
| Exit code | **0**, with `✅ Application schema install complete.` | **1**, with `❌ Install INCOMPLETE — not reporting success.` |

`--allow-incomplete` is available for a deliberate partial install; it still names every gap
and says the database is not production-ready.

---

## Stage 0 — Make the instruments honest (2–3 days)

Nothing here is a feature. All of it is the difference between a green check that means
something and one that does not.

| # | Action | Owner | Effort | Acceptance test |
|---|---|---|---|---|
| **0.1** | **Fix the typecheck gate.** `scripts/ci/typecheck-no-regression.mjs` counts `/error TS/` and never inspects `tsc.status`. Add `if (tsc.status === null \|\| tsc.status > 1) → fail loudly`, and raise `--max-old-space-size` above the level at which tsc OOMs (6,144 MB is currently below it). | Platform | **1 h** | Kill tsc mid-run → the gate **fails**. Run clean → it reports the true count. |
| **0.2** | Fix the 2 real type errors surfaced once tsc completes (`TS7016` on `scripts/db/migration-set.mjs` from PR #1180 — ship a `.d.ts` or convert the module). | Platform | 1 h | `tsc --noEmit` exits 0; baseline is a true 0. |
| **0.3** | **Remove `\|\| echo` from `pr-checks.yml:99`** so the per-PR lint gate can fail. | Platform | 15 min | A PR with a lint error goes red. |
| **0.4** | **Make `install-fresh.mjs` fail loudly** instead of printing `✅` while calling unapplied migrations "safe to skip". | Data | 2 h | Empty DB + a deliberately broken migration → non-zero exit. |
| **0.5** | **Fix `/readyz`.** `server/startup/services.ts` :92/:94/:99 return without calling `setSchemaReadiness`, leaving it `'unknown'` → rendered `"skipped"` → probe stays green. Make unknown **fail**, and fail on the "important" table set, not only the 2 critical ones. | Platform | 4 h | Boot against a DB missing `auth_users` → `/readyz` returns **503** naming it. |
| **0.6** | **Wire the env-var-docs gate.** A 240-line checker maintains a 244-entry baseline for a gate no workflow invokes. Add the npm script and the CI step, or delete all three. | Platform | 1 h | Adding an undocumented env var fails CI. |
| **0.7** | **Stop the repo-health baseline auto-ratcheting upward.** `repo-health-baseline-refresh.yml` commits a refreshed baseline on every merge, so that debt can only grow. Freeze it and ratchet down deliberately. | Platform | 2 h | Baseline cannot increase without a human commit. |
| **0.8** | ~~Lower `audit:orphaned-endpoints` `--threshold` from 600 to the actual count (556) so the 44 slots of slack close.~~ **Corrected — see below.** Lower `audit:orphaned-endpoints:strict` from 600 to **570**. | Platform | 15 min | A PR adding 15 unwired endpoints fails CI; a PR deleting client code does not. |

### Correction to item 0.8 — three errors in one row

Found by re-verifying this chapter's own items against the live tree before implementing
them, which is the discipline Chapter 03 exists to enforce. All three confirmed by execution.

1. **Wrong script.** `audit:orphaned-endpoints` (`package.json:90`) takes no `--threshold`
   and always exits 0. The 600 lives on `audit:orphaned-endpoints:strict`
   (`package.json:91`), which is what `ci.yml` actually runs. Chapter 12 repeats the same
   mis-citation.

2. **Wrong target, and it reverses a reasoned decision without rebutting it.** The 44 slots
   are not unnoticed slack. `.github/workflows/ci.yml:202-205` documents them, from whoever
   performed the previous 900 → 600 ratchet:

   > The 44 of remaining headroom is deliberate: a feature branch legitimately adds
   > endpoints before the client that calls them exists, and one PR adding 45 unwired
   > endpoints is worth a conversation rather than a silent pass.

   Zero headroom is also the wrong goal on its own terms. Orphans are computed as
   `declared − consumed`, so the gate is equally sensitive to **deleting client code** as to
   adding endpoints. Pinned at 556, a PR that removes the last caller of a handful of
   endpoints fails CI having added nothing. **570** closes 30 of the 44 slots while leaving
   room for the legitimate case the existing comment describes.

3. **Stale denominator.** Live count is `Declared: 914 / Consumed: 358 / Orphans: 556` —
   556 of **914 (60.8%)**, not 916 (60.7%). The orphan numerator is unchanged, so the
   headline finding stands; only the total drifted.

> **Why this is Stage 0 and not Stage 3.** As of today the flagship quality gate passes
> because the compiler runs out of memory, the readiness probe reports healthy over a
> database with no auth tables, and the installer reports success while omitting 15 schemas.
> Until those three are fixed, no claim about this codebase can be trusted — including the
> favourable claims in this audit.

---

## Stage 1 — Stop the bleeding → unlocks G1 (1–2 weeks)

| # | Action | Owner | Effort | Acceptance test |
|---|---|---|---|---|
| **1.1** | **Close the fresh-install gap.** Create the 15 missing schemas (`innovation`, `cortex`, `intelligence`, `clinical_ops`, `intelligent_docs`, `signing`, `manufacturing`, `regulatory_intel`, `regulatory_harmonization`, `compliance`, `labeling`, `site_intel`, `ectd`, `predicate`, `core`) and their tables, or retire the code that queries them. Resolve `predicate` vs `precedent`. | Data | **1 week** | `fresh-install-gap.mjs` reports **0** missing schemas and 0 missing tables for mounted routes. |
| **1.2** | **Put `ai_threads` and `chat_messages` on an apply path.** Their only creator is `db/migrations/20260224_ai_trace_chain.sql`, which nothing applies — while the mounted chat routes query them. The conversation surface is what `README.md:25` calls "the product". | Data | 4 h | Fresh install → send a chat message end-to-end without a 500. |
| **1.3** | **Add a fresh-install completeness gate to CI.** Provision an empty DB, run the installer, diff every schema/table referenced in server SQL against what exists. This audit's `fresh-install-gap.mjs` is ~150 lines and already does it. | Data | 2 days | The gate fails on today's tree and passes after 1.1/1.2. |
| **1.4** | **Fix the Schedule-of-Events tenant arbiter** — tenant column into the unique index, `organization_id` into the `SET` list, and 404 when `resolveProjectType()` returns null instead of proceeding. | Backend | 4 h | Two-org integration test: org A cannot upsert org B's schedule. Model on `tests/schema-contract/cmc-module3-tenant-arbiter.contract.test.ts`. |
| **1.5** | **Sanitise `BatchDraft.tsx:490`** through the existing `renderSafeMarkdown` choke point. | Frontend | 2 h | A drafted section containing an `onerror` payload renders inert. |
| **1.6** | **Re-enable ESLint on `client/src/**`** — 871 files currently unlinted. Start with `react/no-danger` and the security rules; warn on the rest. | Frontend | 3 days | `npm run lint` covers `client/src`; `react/no-danger` is an error. |
| **1.7** | **Fix or remove the AnA attach button.** It stores only file names and posts `"Attached N file(s)"` (`Shell.tsx:428-431`), silently discarding every file — while a working upload path exists at `hooks/useChatUpload.ts`. A control that lies is worse than a missing one. | Frontend | 1 day | Attaching a PDF sends its bytes; the model can quote it. |
| **1.8** | **Harden the uploads.** Add `fileFilter` + `limits.fileSize` to `stability.router.ts` (it has neither) and wire `uploadAllowlist`/`uploadSafety` into all 28 multer sites (currently 2). | Backend | 3 days | Every multer site has a filter, a size limit and signature+AV verification. |
| **1.9** | **Apply `ssrfGuard`** to `citation-verification-service.ts:108` and the `AnaToolExecutor` fetch sites — these fetch model-supplied URLs. | Backend | 2 days | An internal-IP citation URL is refused. |
| **1.10** | **Give the product a front door.** Choose the surfaces the pilot uses and put them in `RAIL_PRIMARY` (today: 5 of ~101, with 41 in `NAV_HIDDEN`). Either surface the translation workspace or disable its mounted backend — do not ship a live offering with no UI. | Frontend/Product | 3 days | Every pilot journey is reachable by clicking, with no typed URLs. |
| **1.11** | **Run one cross-tenant probe** against a seeded two-org deployment, converting Chapter 05's static findings into demonstrated results. | QA | 2 days | A documented probe report; any leak found becomes a Stage 1 item. |

**Exit criterion for G1:** Stage 0 + Stage 1 complete, a fresh install boots and passes every
golden journey, and the cross-tenant probe is clean.

---

## Stage 2 — Make it sellable → unlocks G2 (2–4 months)

| # | Action | Owner | Effort | Acceptance test |
|---|---|---|---|---|
| **2.1** | **Correct `SECURITY.md`.** Remove "SOC 2 Type II controls" (no report exists) and soften "21 CFR Part 11 compliant" to "built to support Part 11 workflows" — the wording the team already adopted on the signup page. Qualify the at-rest-encryption and rate-limiting claims. | Product/Legal | **1 h** | No unqualified compliance claim survives without an artifact behind it. |
| **2.2** | **Complete the `requestDb(req)` migration** for the remaining 81 route files, then flip `RLS_ENFORCE=on`. **The long pole, and the item that actually closes the tenant-isolation risk.** | Backend | **2–3 months** | `RLS_ENFORCE=on` in staging with all golden journeys green and a cross-tenant probe returning zero rows. |
| **2.3** | **Audit the remaining 114 `ON CONFLICT` sites** plus every Drizzle upsert on a tenant-bearing table. | Backend | 3 weeks | A contract test per tenant-bearing arbiter. |
| **2.4** | **Write and rehearse DR.** Define RPO/RTO, run a real `pg_dump` + restore into a scratch branch, write the runbook. Nothing of this exists today. | Ops | 3 weeks | A restore rehearsal report with measured RTO. |
| **2.5** | **Prove alerting reaches a human.** `SENTRY_DSN` is wired but has never been shown to page anyone; alerting covers one subsystem. | Ops | 1 week | A deliberately triggered error pages the on-call. |
| **2.6** | **Verify entitlement enforcement server-side** — prove a locked module is refused by the API, not merely hidden in the UI. | Backend | 3 days | An unentitled tenant calling a paid endpoint directly gets 403. |
| **2.7** | **Enforce a coverage floor** at today's measured number and ratchet. Thresholds are currently set then overridden to 0 with `continue-on-error`. | Platform | 1 week | Coverage below the floor fails CI. |
| **2.8** | **Run E2E on PRs**, at least a smoke subset. A broken login can currently merge green. | Platform | 1 week | Breaking login fails a PR check. |
| **2.9** | **SHA-pin all 137 GitHub Actions** references; replace the deprecated `returntocorp/semgrep-action@v1`. Already self-flagged as a GA blocker. | Platform | 1 day | No floating action tags remain. |
| **2.10** | **Resolve chromadb `CVE-2026-45829`** — record the exposure determination the suppression itself demands, or remove the dependency. | Security | 1 day | Either a written determination or the package is gone. |
| **2.11** | **Flip `AI_PII_ENFORCEMENT` to `block`**; document zero-retention as a deployment prerequisite. | Backend | 4 h | Pasting a patient identifier is blocked, not merely logged. |
| **2.12** | **Reconcile the 140 duplicate table definitions**, prioritising any whose definitions disagree. | Data | 1 month | `ci:duplicate-table-ddl` baseline reaches 0. |
| **2.13** | **Retire or wire the ~181 orphaned `db/migrations/` files**; make the manifest authoritative or delete it. | Data | 3 weeks | Every `.sql` file is on an apply path or in `_legacy/`. |
| **2.14** | **Delete the dead client trees** (~25,000 LOC across 11 legacy mini-apps, 7,174 LOC of dead v2 surfaces, ~13,000 LOC of unreferenced ANA UI) and `.replit-ci.yml`. | Frontend | 1 week | `ci:unreferenced-modules` baseline falls sharply; no dead deployment target remains. |

---

## Stage 3 — Make it qualifiable → unlocks G3 (6–12 months)

| # | Action | Owner | Effort | Acceptance test |
|---|---|---|---|---|
| **3.1** | **Bind e-signatures to records.** `promote-artifact.ts:245` promotes to `approved` with no `electronic_signatures` row, no `signatureId`, no `manifestHash` — satisfying neither §11.50 nor §11.70. **Do this before qualification**, or qualification certifies the gap. | Backend | 1 week | Promotion without a valid signature is refused; the manifest carries name, timestamp and meaning. |
| **3.2** | **Make boot validate-only.** Move `ensureCoreTables.ts`'s 7 `CREATE TABLE`s into migrations. Starting the app currently mutates the schema (proven: 702 → 717 tables) — incompatible with change control. | Data | 3 days | Booting twice against a fresh DB leaves the table count unchanged. |
| **3.3** | **Schedule the Part 11 controls.** `audit:verify:24h`, `audit:verify:full`, `audit:archive` and `retention:run` are orphaned scripts; `retentionCron.ts` has no scheduler caller. | Ops | 3 days | Chain verification runs on schedule and its result is attestable. |
| **3.4** | **Execute IQ/OQ/PQ** under a named validation owner; sign the VSR; establish change control. All execution records are currently blank. | Validation (non-eng) | **months** | A signed VSR, not `1.0.0-DRAFT`. |
| **3.5** | **Close the traceability matrix's own open items** — true PDF/A-1b conformance, and a DB-backed delete→audit test to replace the mocked one. | Backend | 1 month | TM-CORTEX-001 has no open items. |
| **3.6** | **Add policies to the 21 RLS-enabled-but-policy-less tables**; make an explicit decision on the 118 with RLS off. | Data | 1 week | No table is RLS-enabled without a policy outside the 6-entry allowlist. |
| **3.7** | **SOC 2 Type II engagement**, if the claim is to be kept rather than removed. | Compliance | months | A real report with an observation window. |

---

## The order in one paragraph

Fix the instruments first (**Stage 0, days**) — otherwise you cannot tell a real fix from
another silent pass. Then fix what makes the product unsafe or dishonest for a human
(**Stage 1, weeks**): a fresh install that half-works, a health probe that lies, one live
cross-tenant write path, one reachable XSS fed by model output, and a UI whose attach button
discards files. That reaches a credible external pilot. Then do the two things that take real
time and cannot be rushed (**Stage 2, months**): finish the request-scoped DB migration so
tenant isolation is two-layer, and build the operational apparatus — DR, alerting, coverage,
E2E — that a paying customer's procurement will ask for. Correct `SECURITY.md` on day one of
that stage; it costs an hour and removes a live legal exposure. Only then start the
qualification programme (**Stage 3**), because qualifying a system with unbound e-signatures
and a schema that mutates at boot would certify the wrong thing.

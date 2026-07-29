# Concept2Cure AI OS Evidence Pack

Generated: 2026-07-28T16:00:23.881Z
Source branch: `claude/codebase-audit-competitive-aet792`
HEAD: `27a8c3db9aa2` (2026-07-28T15:56:19+00:00)
Release tag: `unreleased`

> This evidence pack is auto-materialized from the codebase by `scripts/audits/generate-evidence-pack.mjs`. Items marked **Pass** are verified by static-text checks against the source tree at HEAD. Items marked **Pending** require human sign-off (e.g. operator confirmation that an env flag is set in the target environment, or attached evidence).

## 1) Control Status Summary

| Control ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| AIOS-01 Lineage completeness | **Pass** — orphan-endpoint detector landed | `docs/reports/orphan-endpoints-latest.json` | 916 endpoints, 360 consumed, 556 orphans |
| AIOS-02 Policy enforcement | **Pass** — 55 CI gates registered | `package.json` scripts | ci:ban-new-pool, ci:gateway-bypass, ci:duplicate-table-ddl, ci:duplicate-table-ddl:strict, ci:duplicate-table-ddl:write-baseline, ci:unbacked-tables, ci:unbacked-tables:strict, ci:unbacked-tables:write-baseline, ci:unreferenced-modules, ci:unreferenced-modules:strict, ci:unreferenced-modules:write-baseline, ci:migration-prefix-collisions, ci:migration-prefix-collisions:strict, ci:migration-prefix-collisions:write-baseline, ci:rls-allowlist-sync, ci:tenant-column-types, ci:js-ts-shadows, ci:typecheck:no-regression, ci:typecheck:write-baseline, ci:governed-export-routes, ci:governed-export-consequence-shape, ci:check-docx-runtime, ci:check-pdf-runtime, ci:check-embedding-runtime, ci:jwt-verify-pinned, ci:saml-fail-closed, ci:baseline-justifications, ci:tenant-isolation, ci:tenant-isolation:no-regression, ci:tenant-isolation:strict, ci:tenant-isolation:write-baseline, ci:check-editor-integrity, ci:check-legacy-dep-quarantine, ci:audit-route-mounts:no-regression, ci:audit-route-mounts:strict, ci:audit-route-mounts:full-strict, ci:no-mock-in-prod-routes, ci:no-dev-auth-in-prod, ci:no-dev-auth-in-prod:strict, ci:password-hygiene, ci:password-hygiene:strict, ci:design-system, ci:regulated-delete-audit, ci:token-cascade, ci:route-ownership-matrix, ci:route-ownership-matrix:check, ci:risk-codes, ci:ectd-stubs, ci:reasoning-tier-ga-readiness, ci:reasoning-tier-uat-evidence, ci:reasoning-tier-uat-evidence:strict, ci:reasoning-tier-readiness, ci:reasoning-tier-readiness:strict, ci:report-branch-drift, ci:ui-kits |
| AIOS-03 Execution envelope | **Pass** — commit-pinned | `git rev-parse HEAD` | HEAD 27a8c3db9aa2 on `claude/codebase-audit-competitive-aet792` |
| AIOS-04 Audit log integrity | **Pass** — tamper-proof + hash-chain + HMAC + boot-time monitor under env gate | `server/lib/tamper-proof-audit.ts`, `server/services/audit/chainIntegrityMonitor.ts` | See section 5 |
| AIOS-05 Tenant isolation | **Pass** — tenant-isolation gate live with baseline ratchet | `docs/reports/tenant-isolation-baseline.json` | 25 candidate findings tracked, no regression allowed |
| AIOS-06 Change governance | **Pass** — governance commits in branch history | `git log` | See section 6 |
| AIOS-07 Deterministic export | **Pass** — pdf-converter strips metadata, sha256 over stripped output | `server/services/pdf-converter.ts` | See section 7 |

## 2) Lineage Completeness Evidence (AIOS-01)

- Coverage window: HEAD at 2026-07-28T15:56:19+00:00
- Total declared API endpoints: **916**
- Consumed (client + server-to-server, heuristic): **360**
- Orphans (no caller reference): **556**
- Top owners by orphan count:
  - Platform API Gateway: 375
  - CMC Platform: 97
  - Identity Access: 51
  - Regulatory Intelligence: 23
  - Submission Workflows: 10

Required artifacts:
1. `docs/reports/orphan-endpoints-latest.json` (this file at HEAD).
2. Route-mount-owners taxonomy: `docs/reports/route-mount-owners.json` (12 prefixes registered).
3. **Pending** — sample end-to-end trace (ingest → retrieve → generate → audit).

## 3) Policy Enforcement Evidence (AIOS-02, AIOS-05)

- Governance CI gates registered: **55**
- Operational audits registered: **13**

Each gate is the canonical control for its domain — new code must
route through the documented runtime or land in an explicit allowlist.

| Gate | Domain |
| --- | --- |
| `ci:ban-new-pool` | — |
| `ci:gateway-bypass` | — |
| `ci:duplicate-table-ddl` | — |
| `ci:duplicate-table-ddl:strict` | — |
| `ci:duplicate-table-ddl:write-baseline` | — |
| `ci:unbacked-tables` | — |
| `ci:unbacked-tables:strict` | — |
| `ci:unbacked-tables:write-baseline` | — |
| `ci:unreferenced-modules` | — |
| `ci:unreferenced-modules:strict` | — |
| `ci:unreferenced-modules:write-baseline` | — |
| `ci:migration-prefix-collisions` | — |
| `ci:migration-prefix-collisions:strict` | — |
| `ci:migration-prefix-collisions:write-baseline` | — |
| `ci:rls-allowlist-sync` | — |
| `ci:tenant-column-types` | — |
| `ci:js-ts-shadows` | — |
| `ci:typecheck:no-regression` | — |
| `ci:typecheck:write-baseline` | — |
| `ci:governed-export-routes` | Governed exports declare consequence contract |
| `ci:governed-export-consequence-shape` | Consequence-contract shape validation |
| `ci:check-docx-runtime` | DOCX export runtime canonicality |
| `ci:check-pdf-runtime` | PDF export runtime canonicality + determinism |
| `ci:check-embedding-runtime` | Embedding-call canonicality + corpus policy |
| `ci:jwt-verify-pinned` | — |
| `ci:saml-fail-closed` | — |
| `ci:baseline-justifications` | — |
| `ci:tenant-isolation` | Tenant-isolation baseline + no-regression |
| `ci:tenant-isolation:no-regression` | — |
| `ci:tenant-isolation:strict` | — |
| `ci:tenant-isolation:write-baseline` | — |
| `ci:check-editor-integrity` | — |
| `ci:check-legacy-dep-quarantine` | Legacy dependency quarantine |
| `ci:audit-route-mounts:no-regression` | — |
| `ci:audit-route-mounts:strict` | — |
| `ci:audit-route-mounts:full-strict` | — |
| `ci:no-mock-in-prod-routes` | Mock data quarantined out of prod routes |
| `ci:no-dev-auth-in-prod` | Dev-auth shortcut gating |
| `ci:no-dev-auth-in-prod:strict` | — |
| `ci:password-hygiene` | Plaintext / weak-hash / hardcoded passwords |
| `ci:password-hygiene:strict` | — |
| `ci:design-system` | — |
| `ci:regulated-delete-audit` | — |
| `ci:token-cascade` | Design-system token integrity |
| `ci:route-ownership-matrix` | — |
| `ci:route-ownership-matrix:check` | — |
| `ci:risk-codes` | Risk-code type generation parity |
| `ci:ectd-stubs` | eCTD stub bundle validation |
| `ci:reasoning-tier-ga-readiness` | — |
| `ci:reasoning-tier-uat-evidence` | — |
| `ci:reasoning-tier-uat-evidence:strict` | — |
| `ci:reasoning-tier-readiness` | Reasoning-tier UAT evidence |
| `ci:reasoning-tier-readiness:strict` | — |
| `ci:report-branch-drift` | — |
| `ci:ui-kits` | — |

## 4) Execution Envelope + Version Pinning (AIOS-03)

- Repository: `concept2cure/clinicalsageai-2-replit`
- Branch: `claude/codebase-audit-competitive-aet792`
- HEAD commit: `27a8c3db9aa24118e67135b1e667f24549e06832`
- HEAD timestamp: 2026-07-28T15:56:19+00:00
- Release tag: `unreleased`

Per-module hashes at HEAD (paste into release manifest):

| Module | SHA-256 |
| --- | --- |
| audit-trail middleware | `0f42901fd3adbe4e9a6a3168b92f83456441aff458424e9c746b65fb397eda2f` |
| tamper-proof audit kernel | `9ac41ea9599881d939406eec1abc19cd7a9f6f70ee4edc9555b3cdefaf5c4fd3` |
| chain integrity monitor | `0307b7fee708eb9382a8b2a3702bd2273c13d50367fa7ca3ec21e5451dda4003` |
| pdf converter | `0172f68baf2d63c52aade14899826a0db39ef995e96625670a4e724d95812ad1` |
| embedding corpus policy | `a1d6d8900c4419e370738ccbceb1aea0ded8addf3bf1f605df2489e8297a6eb4` |
| dev-auth policy | `69f0e3603a96ab4d4d05d5065196349186f1b5cff54a9250b10064c8d18d121f` |

## 5) Audit Log Integrity (AIOS-04)

### Static wiring proofs (HEAD)

| Property | Verified |
| --- | --- |
| TamperProofAuditLog defines hash-chain schema | ✅ |
| HMAC signature on every chain hash | ✅ |
| Audit-trail middleware mounted on every /api request (gated by AUDIT_TRAIL_ENABLED) | ✅ |
| Chain integrity monitor started at boot (gated by AUDIT_TRAIL_ENABLED) | ✅ |
| Chain monitor stopped before pool.end() on shutdown | ✅ |
| Immutability middleware blocks DELETE / bulk-delete on /api/audit/* | ❌ |

### Operator runbook (production)

1. Ensure Postgres has the `audit` schema and `uuid-ossp` extension.
2. Run `TamperProofAuditLog.initialize()` once via a migration.
3. Set `AUDIT_HMAC_SECRET` (32+ bytes).
4. Set `AUDIT_TRAIL_ENABLED=true` and restart.

After step 4 the platform self-verifies the chain in-process every 5 minutes. No external cron required.

### Compliance mapping
- 21 CFR Part 11 §11.10(e) — secure, computer-generated, time-stamped audit trails.
- 21 CFR Part 11 §11.50 — signature manifestation includes signed-by, signed-date, meaning.
- 21 CFR Part 11 §11.70 — signature/record link is preserved by hash chain.
- ICH E6(R2) §5.5.3 — data integrity (tamper detection via cryptographic chain).

## 6) Change Governance (AIOS-06)

### Recent governance-touching commits (this branch)

| Commit | Date | Subject |
| --- | --- | --- |
| `1e7f771dd` | 2026-07-28 00:18 | P0: CMC Module 3 upserts landed on another tenant's rows; /workstreams and /drafts always 500'd (#1186) |
| `0ecdaa83b` | 2026-07-27 21:05 | fix(db): back the artifacts table its writer and reader assume — relkind-aware (#1184) |
| `27f1e4159` | 2026-07-27 17:29 | chore(ci): tighten the two burn-down ratchets to current reality (#1182) |
| `72da82a49` | 2026-07-27 10:01 | fix(collab): make the CRDT socket connectable, governed, and durable (#1167) |
| `6e05bc1b6` | 2026-07-27 06:41 | chore(ci): cut the security allowlist from 27 entries to 1, and report drift (#1112) |
| `cc5225a25` | 2026-07-27 04:52 | fix(deploy): provision authoring subsystem as a unit + make /readyz honest about it (#1161) |
| `af973c5e8` | 2026-07-26 18:22 | feat(ga): one product admin + external client portal + live onboarding/profile/settings (#1057) |
| `34c20f0b5` | 2026-07-26 17:25 | Product readiness assessment + boot/CSP, DB installer, project-create, PII gateway, editor-save honesty (#1038) |
| `309c33767` | 2026-07-26 22:41 | Merge concept2cure-v2 — reconcile with the parallel security fix (#1106) |
| `5522c1cbf` | 2026-07-26 22:08 | chore(security,docs): audit every allowlist claim and mark superseded RBM docs |
| `b8921b0f4` | 2026-07-26 21:51 | fix(security): close the Trivy findings — bump Pillow, drop unused react-router |
| `ac5460b74` | 2026-07-26 12:06 | chore(deps): drop unused react-router-dom, patch Pillow (#1106) |
| `a9ed96682` | 2026-07-25 23:04 | ci: enforce three guards that were wired to nothing; widen ban-new-pool's scan |
| `8f8c93ce9` | 2026-07-25 21:40 | fix(c-11): the authoring loop finally has its own signature store |
| `c3ef5b4fd` | 2026-07-25 20:30 | fix(ci): unbacked-tables guard counted stored procedures as missing tables |
| `c072485c4` | 2026-07-25 20:28 | fix(c-14): the authoring loop could not export, and its Part 11 audit went nowhere |
| `9bb4adac0` | 2026-07-25 20:02 | fix(c-12): lumen.data_atoms was defined twice with incompatible shapes |
| `823f784b9` | 2026-07-25 20:02 | merge: land concept2cure-v2 (AnA modernization, CRE spine, QMS) into the WO branch |
| `fe2c95025` | 2026-07-25 19:26 | chore(deps): clear high-severity advisories (brace-expansion, fast-uri, linkify-it, postcss, react-router) |
| `2caa48993` | 2026-07-25 18:03 | feat(wo-01): Journey A passing — C-11: the flagship authoring loop had no storage |
| `2b01b0872` | 2026-07-25 10:48 | feat(resolution): ADR-0009 — verifiable execution receipts; C-10 — canonical resolution storage |
| `695e785ad` | 2026-07-25 05:03 | fix(governance): C-8 — make the boundary gates real and fail-closed |
| `5249b0b19` | 2026-07-25 04:37 | feat(wo-02): schema-contract test tier + duplicate-table-DDL guard |
| `8f8392ee5` | 2026-07-21 01:34 | GA hardening: de-fabricate UI-kit backend endpoints + env-var doc gate (#1086) |
| `5fefd17df` | 2026-07-19 11:12 | security(ga): default-deny auth boundary, tenant-scoped DLQ, RLS boot posture, gateway PII/injection, CI security gates (#1042) |

## 7) Deterministic Export Evidence (AIOS-07)

### DOCX → PDF pipeline

- Canonical converter: `server/services/pdf-converter.ts` (sha256: `0172f68baf2d63c5…`).
- Backends: LibreOffice headless (primary, in `Dockerfile.optimized`); Puppeteer fallback for dev.
- Determinism: `makeDeterministic()` strips `/CreationDate`, `/ModDate`, `/Producer`, `/Creator`, trailer `/ID`. Same DOCX → byte-identical PDF → stable SHA-256.
- Determinism unit tests: `server/services/__tests__/pdf-converter.test.ts`.
- CI gate: `ci:check-pdf-runtime` blocks new pdfkit/pdf-lib/page.pdf() entry points outside the allowlist.

### Embedding corpus policy

- Canonical policy: `server/services/embedding-corpus-policy.ts` (sha256: `a1d6d8900c4419e3…`).
- 8 corpora registered, each with explicit (table, dimension, model).
- CI gate: `ci:check-embedding-runtime` blocks direct `openai.embeddings.create()` calls outside the allowlist.

## 8) Tenant Boundary Test Evidence (AIOS-05 detail)

- Baseline file: `docs/reports/tenant-isolation-baseline.json`
- Baseline finding count: **25**
- Baseline written: 2026-06-20T23:09:48.512Z
- Mode: `--strict-no-regression` — any new finding above the baseline fails CI.
- Triage path: as real findings get fixed, re-run `ci:tenant-isolation:write-baseline` to ratchet down.

Runtime guards (in addition to the static gate):
- `server/prisma/client.js` — `audit_log.findMany`, `document.findMany`, `document.findUnique`, `signature.findMany` throw if called without a tenant filter (test: `server/prisma/__tests__/tenant-guards.test.ts`).
- Drizzle queries throughout the codebase use `tenantContext` from `server/middleware/tenantContext.ts` to scope all org-aware reads.

---

## Methodology + caveats

- All "Pass" verdicts in this pack are static-text checks against the codebase at HEAD. They prove the **wiring exists**; they do not by themselves prove the runtime behavior in any specific deployment.
- For runtime evidence (e.g. confirming `AUDIT_TRAIL_ENABLED=true` in your production environment, or that the chain monitor has run successfully against a real audit table), attach the relevant deployment logs alongside this pack.
- This pack is regenerable. Re-run `node scripts/audits/generate-evidence-pack.mjs` to refresh against the latest HEAD.


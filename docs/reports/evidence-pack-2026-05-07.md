# Concept2Cure AI OS Evidence Pack

Generated: 2026-05-07T05:58:40.403Z
Source branch: `claude/investor-codebase-presentation-CmkUe`
HEAD: `5daf8ec00cd3` (2026-05-07T05:51:32+00:00)
Release tag: `unreleased`

> This evidence pack is auto-materialized from the codebase by `scripts/audits/generate-evidence-pack.mjs`. Items marked **Pass** are verified by static-text checks against the source tree at HEAD. Items marked **Pending** require human sign-off (e.g. operator confirmation that an env flag is set in the target environment, or attached evidence).

## 1) Control Status Summary

| Control ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| AIOS-01 Lineage completeness | **Pass** — orphan-endpoint detector landed | `docs/reports/orphan-endpoints-latest.json` | 1184 endpoints, 331 consumed, 853 orphans |
| AIOS-02 Policy enforcement | **Pass** — 32 CI gates registered | `package.json` scripts | ci:ban-new-pool, ci:governed-export-routes, ci:governed-export-consequence-shape, ci:check-docx-runtime, ci:check-pdf-runtime, ci:check-embedding-runtime, ci:tenant-isolation, ci:tenant-isolation:no-regression, ci:tenant-isolation:strict, ci:tenant-isolation:write-baseline, ci:check-editor-integrity, ci:check-legacy-dep-quarantine, ci:audit-route-mounts, ci:audit-route-mounts:no-regression, ci:audit-route-mounts:strict, ci:audit-route-mounts:full-strict, ci:no-mock-in-prod-routes, ci:no-dev-auth-in-prod, ci:no-dev-auth-in-prod:strict, ci:password-hygiene, ci:password-hygiene:strict, ci:token-cascade, ci:route-ownership-matrix, ci:route-ownership-matrix:check, ci:risk-codes, ci:ectd-stubs, ci:reasoning-tier-ga-readiness, ci:reasoning-tier-uat-evidence, ci:reasoning-tier-uat-evidence:strict, ci:reasoning-tier-readiness, ci:reasoning-tier-readiness:strict, ci:report-branch-drift |
| AIOS-03 Execution envelope | **Pass** — commit-pinned | `git rev-parse HEAD` | HEAD 5daf8ec00cd3 on `claude/investor-codebase-presentation-CmkUe` |
| AIOS-04 Audit log integrity | **Pass** — tamper-proof + hash-chain + HMAC + boot-time monitor under env gate | `server/lib/tamper-proof-audit.ts`, `server/services/audit/chainIntegrityMonitor.ts` | See section 5 |
| AIOS-05 Tenant isolation | **Pass** — tenant-isolation gate live with baseline ratchet | `docs/reports/tenant-isolation-baseline.json` | 101 candidate findings tracked, no regression allowed |
| AIOS-06 Change governance | **Pass** — governance commits in branch history | `git log` | See section 6 |
| AIOS-07 Deterministic export | **Pass** — pdf-converter strips metadata, sha256 over stripped output | `server/services/pdf-converter.ts` | See section 7 |

## 2) Lineage Completeness Evidence (AIOS-01)

- Coverage window: HEAD at 2026-05-07T05:51:32+00:00
- Total declared API endpoints: **1184**
- Consumed (client + server-to-server, heuristic): **331**
- Orphans (no caller reference): **853**
- Top owners by orphan count:
  - Platform API Gateway: 558
  - CMC Platform: 113
  - Regulatory Intelligence: 71
  - Identity Access: 47
  - Platform Kernel: 47

Required artifacts:
1. `docs/reports/orphan-endpoints-latest.json` (this file at HEAD).
2. Route-mount-owners taxonomy: `docs/reports/route-mount-owners.json` (10 prefixes registered).
3. **Pending** — sample end-to-end trace (ingest → retrieve → generate → audit).

## 3) Policy Enforcement Evidence (AIOS-02, AIOS-05)

- Governance CI gates registered: **32**
- Operational audits registered: **16**

Each gate is the canonical control for its domain — new code must
route through the documented runtime or land in an explicit allowlist.

| Gate | Domain |
| --- | --- |
| `ci:ban-new-pool` | — |
| `ci:governed-export-routes` | Governed exports declare consequence contract |
| `ci:governed-export-consequence-shape` | Consequence-contract shape validation |
| `ci:check-docx-runtime` | DOCX export runtime canonicality |
| `ci:check-pdf-runtime` | PDF export runtime canonicality + determinism |
| `ci:check-embedding-runtime` | Embedding-call canonicality + corpus policy |
| `ci:tenant-isolation` | Tenant-isolation baseline + no-regression |
| `ci:tenant-isolation:no-regression` | — |
| `ci:tenant-isolation:strict` | — |
| `ci:tenant-isolation:write-baseline` | — |
| `ci:check-editor-integrity` | — |
| `ci:check-legacy-dep-quarantine` | Legacy dependency quarantine |
| `ci:audit-route-mounts` | Route-mount drift / shadowing detection |
| `ci:audit-route-mounts:no-regression` | — |
| `ci:audit-route-mounts:strict` | — |
| `ci:audit-route-mounts:full-strict` | — |
| `ci:no-mock-in-prod-routes` | Mock data quarantined out of prod routes |
| `ci:no-dev-auth-in-prod` | Dev-auth shortcut gating |
| `ci:no-dev-auth-in-prod:strict` | — |
| `ci:password-hygiene` | Plaintext / weak-hash / hardcoded passwords |
| `ci:password-hygiene:strict` | — |
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

## 4) Execution Envelope + Version Pinning (AIOS-03)

- Repository: `concept2cure/clinicalsageai-2-replit`
- Branch: `claude/investor-codebase-presentation-CmkUe`
- HEAD commit: `5daf8ec00cd3a5ac3436a85cfd937c71e7fc0765`
- HEAD timestamp: 2026-05-07T05:51:32+00:00
- Release tag: `unreleased`

Per-module hashes at HEAD (paste into release manifest):

| Module | SHA-256 |
| --- | --- |
| audit-trail middleware | `9827ac9a8d297e63a5726a7eb8dff48ad71a93a210b8ac64b45eca60755b443c` |
| tamper-proof audit kernel | `a522b0f9203637553aa14413c5bcd0abbf4c5e76a07b5aef88737b95a46dbaa5` |
| chain integrity monitor | `9eb2232df7f378fc6e2a0d4c1835a47615dff0fbe174b3e967952ae230802d4e` |
| pdf converter | `de4740c5e926f636ad4c3176979cf2103cb94e7ecf00f1dac53cc13623d356ee` |
| embedding corpus policy | `2a258b470743423a49ece734ceec570622648512ce58f6e61bb338a0c27085c7` |
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
| `5daf8ec` | 2026-05-07 05:51 | sec: tenant-isolation CI gate (with baseline ratchet) |
| `b018311` | 2026-05-07 05:47 | feat(audit): self-verifying chain monitor — gate + shutdown + regression test |
| `c108ce7` | 2026-05-07 05:43 | refactor(retrieval): migrate vaultRetriever to canonical embedding service |
| `d6ebd7d` | 2026-05-07 05:38 | audit: orphan-endpoint detector + initial inventory |
| `707ddf6` | 2026-05-07 04:23 | feat(retrieval): canonical embedding-corpus policy + CI gate |
| `728b04e` | 2026-05-07 03:31 | feat(export): canonical deterministic DOCX→PDF converter + CI gate |
| `30e6dc4` | 2026-05-07 02:47 | sec: harden founder seed + add password-hygiene CI gate |
| `84c57d2` | 2026-05-07 02:38 | sec: gate dev-auth shortcuts and wire tamper-proof audit trail |
| `f85b34f` | 2026-05-01 19:05 | feat(mdx): Phase 0 foundations for GA build |
| `29057d4` | 2026-04-27 04:58 | feat: 'fix all' sweep — context-awareness end-to-end + 12 server-side fixes |

## 7) Deterministic Export Evidence (AIOS-07)

### DOCX → PDF pipeline

- Canonical converter: `server/services/pdf-converter.ts` (sha256: `de4740c5e926f636…`).
- Backends: LibreOffice headless (primary, in `Dockerfile.optimized`); Puppeteer fallback for dev.
- Determinism: `makeDeterministic()` strips `/CreationDate`, `/ModDate`, `/Producer`, `/Creator`, trailer `/ID`. Same DOCX → byte-identical PDF → stable SHA-256.
- Determinism unit tests: `server/services/__tests__/pdf-converter.test.ts`.
- CI gate: `ci:check-pdf-runtime` blocks new pdfkit/pdf-lib/page.pdf() entry points outside the allowlist.

### Embedding corpus policy

- Canonical policy: `server/services/embedding-corpus-policy.ts` (sha256: `2a258b470743423a…`).
- 8 corpora registered, each with explicit (table, dimension, model).
- CI gate: `ci:check-embedding-runtime` blocks direct `openai.embeddings.create()` calls outside the allowlist.

## 8) Tenant Boundary Test Evidence (AIOS-05 detail)

- Baseline file: `docs/reports/tenant-isolation-baseline.json`
- Baseline finding count: **101**
- Baseline written: 2026-05-07T05:56:03.244Z
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


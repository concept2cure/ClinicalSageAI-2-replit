# D6 — platform security audit and US / Japan / EU remediation plan, 2026-09-24

**Launch row:** D6, security posture (`docs/LAUNCH_DEFINITION_OF_DONE.md`). Findings that belong to D3 and D5 are
handed to those lanes on `docs/work-orders/README.md`.
**Audited commit:** `adbf2d186cf8136c786cd76377c1b2c15eb8bc69`.
**Session:** `session_0194UQPxy9Er2ibRAjog8Ven`. **No code was changed by this session.**

## What this folder proves

| File | What it is |
|---|---|
| `../../../security/SECURITY_AUDIT_2026-09-24.md` | The report: 81 findings (1 Critical, 23 High at the auditors' commit; DP-01 and most of DP-10 closed by other lanes before the audited head), verified strengths, disposition of every prior assessment, and the claims register. |
| `../../../security/REGULATORY_CONTROL_MAP_US_JP_EU.md` | Clause-by-clause map for Part 11, HIPAA, PMDA ER/ES, APPI, the Japanese cloud guidelines, Annex 11, GDPR, the AI Act, NIS2, the CRA and eIDAS. |
| `../../../security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` | P0–P3 with owners, effort, failing-first acceptance tests, rows and clauses. |
| `citations-verified.txt` | Every `path:line` the three auditors cited (297), resolved against `git ls-files` at the audited commit with the cited line printed. 297 resolve; one auditor filename was corrected (`server/mcp/tools/runtime.ts`). Produced by `verify-citations.py`. |
| `gates/SUMMARY.txt` and `gates/*.txt` | 31 read-only gates, `npm audit --json` and the GA readiness probe, one output file each, with exit codes and timings. 29 pass; `ci:server-error-leaks` and `ci:dead-audit-catch` are red on trunk; `npm audit` 0 critical / 0 high / 32 moderate; readiness 6 of 41. |
| `tests/test-security.txt` | `npm run test:security`: 45 files, 377 tests pass. |
| `tests/qms-effective-only-by-signature.txt` | The repository's own tests for the QMS closure (`e1c224f6`): 28 pass. This is what marks DP-01 closed at head. |
| `repro/IAM-01-ana-namespace-pre-mfa-token.txt` | The real `/ana` namespace middleware admits an `mfa_challenge` token (3 of 3 cases; the "DEFECT" case is the finding). The database-backed lookups inside `verifyLiveToken` were stood in by the real `verifyJwtWithRotation`; neither lookup reads the token class (`server/services/token-revocation.ts:218-226`). The temporary test file was deleted after the run and is not part of the tree. |
| `repro/DP-03-DP-04-postgres16-transcript.txt` | PostgreSQL 16.13 transcript: the exact revocation UPDATE from `signature-persistence.ts:867-875` raises `IMMUTABILITY_VIOLATION` (§4) while the two-column control succeeds (§5); as a `LOGIN NOSUPERUSER NOBYPASSRLS` role a plain `DELETE FROM audit_logs` is refused (§8) and `SET LOCAL app.audit_archive_bypass='on'` lets it through (§9, `rows_left 0`). `ddl-from-0000.sql` is the baseline DDL applied; the trigger migrations applied are named in the transcript header. |
| `repro/ddl-from-0000.sql` | The two table definitions extracted verbatim from `migrations/0000_sweet_joseph.sql`. |

## Posture of the proofs

- Everything here ran on the audited commit in this session's container: Node 22.22.2, npm 10.9.7, PostgreSQL 16.13
  (no `pgvector`, so the whole migration set was not applied; each reproduction applied only what it needed and says
  so). Nothing ran against a deployed environment: there is none (row D1).
- **Verified by execution:** IAM-01, DP-03, DP-04 (defects) and DP-01 (closed). **Verified by reading** at the
  audited commit: every other row of the register, with the citation check as the evidence that the cited lines
  exist. The report's §9 says which is which.
- The first weekly security lens (`docs/evidence/reviews/2026-09-24/security.md`) was produced by the
  `.claude/agents/security-auditor.md` definition executed through a general-purpose agent, because this session
  started before the definition existed and the harness loads agent definitions at session start. Later sessions
  invoke it by name.

## What is owed

- Every P0 item in the plan, each with its acceptance test; three lanes can take them in parallel (plan §5).
- Corrections to the SIG-Lite, the trust statement and the DPA per the claims register (plan P1-14); the root
  `SECURITY.md` lines the register refuted were corrected in this session because `security.txt` sends a researcher
  there.
- The founder decisions in plan §6.

## How to re-run

```bash
npm ci
for g in $(grep -oE "^[a-z_:-]+" gates/SUMMARY.txt | grep -v "^npm\|^ga\|^commit\|^finished"); do npm run --silent "${g//_/:}"; done  # gate names are the SUMMARY rows with ":" spelled "_"
npm run test:security
npx vitest run --config vitest.config.ts server/routes/__tests__/qms-effective-only-by-signature.test.ts server/services/ana/__tests__/ana-cannot-sign.test.ts
python3 verify-citations.py /path/to/plan-or-report <out.txt>   # resolves path:line tokens against git ls-files
```

The two database reproductions are transcripts of ad-hoc `psql` sessions; the statements are in the file and can be
replayed against any PostgreSQL 16 with `ddl-from-0000.sql`, `db/migrations/20260730_esign_audit_db_level_immutability.sql`
and `db/migrations/20260617_audit_logs_immutability.sql` applied.

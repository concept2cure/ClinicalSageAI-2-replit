# D6 — P0 closures from the 2026-09-24 security audit (Phase B tranche, 2026-09-24/25)

**Rows:** D6 (D5 for the Part 11 items). **Source:** `docs/security/SECURITY_AUDIT_2026-09-24.md` (findings) and
`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` §1 (items). **Rule:** every item was shown failing
first (a test written against the unchanged code, its output filed under `red/`), fixed with the smallest change that
closes the finding, shown passing (`green/`), and committed on its own with the item id in the subject. The audited
commit was `adbf2d18`; the red runs cite the HEAD they ran against.

| Item | Finding | Commit | Closed | Folder |
|---|---|---|---|---|
| P0-1 | IAM-01 (Critical) `/ana` socket namespace admitted pre-MFA tokens | `7c4faf2a` | yes | `P0-1/` |
| P0-13a | IAM-16 `AUTH_BOUNDARY_MODE=warn` honoured in production | `d7f08922` | boot refusal; preflight half is W2's | `P0-13a/` |
| P0-7 | DP-03 signature revocation refused by its own trigger | `b33ec50d` | yes (migration amended in place) | `P0-7/` |
| P0-5 | IAM-05 SCIM wrote the global identity row | `423aff25` | yes (no-migration form) | `P0-5/` |
| P0-6 | IAM-07 cross-tenant file read by predictable name | `cc1cb31a` | yes | `P0-6/` |
| P0-11 | DP-07 embeddings reached OpenAI with no placement decision | `df479b5f` | application half; Terraform key set and DPA open | `P0-11/` |
| P0-3 | IAM-03 SAML not bound to a tenant | `a96fbea0` | yes; `admitLiveSession` provider carry follows | `P0-3/` |
| P0-4 | IAM-04 sessions did not end | `613c6e00` | part (a); `session_version` is P0-4b | `P0-4/` |
| P0-16a | INF-11 Trivy suppressions with no expiry, tree-wide S3 ignores | `14639fa3` | `.trivyignore` half; gate wiring and `if: always()` follow | `P0-16a/` |
| P0-9a / P0-8a | DP-06, DP-04 no trigger self-check; the sweep verified one store | `e8724680` | startup self-check and sweep; Terraform flags, bypass GUC, grant, anchor open | `P0-9a/` |
| P0-12 (part 1) | DP-08, DP-09 model output ran the GDPR erasure | `8ebe3040` | erasure e-signed and human-confirmed; every-write tier designed, waits on hot files | `P0-12/` |
| P0-3 / P0-4 follow-up | second authenticator, provider carry, SAML event sentences | `872c8648` | yes | `P0-3-P0-4-followup/` |
| P0-2 (d) | IAM-02 open dynamic client registration | `5c10785e` | bound to `MCP_CLIENT_REDIRECT_ALLOWLIST`; whether production sets it is the founder's; parts (a)–(c) are the D8 lane's | `P0-2d/` |
| P0-8a (archive path) | DP-04 the audit-log delete door was a session setting any role could set | see `git log -- db/migrations/20260617_audit_logs_immutability.sql` (`054c1764`) | archive door + ledger + enforced floor; `app_service` DELETE grant and the anchored chain head open | `P0-8a/` |

`gates/SUMMARY.txt` is the Phase A gate set re-run on the tranche's working tree at `9dba7621` (every gate green; `ci:tenant-entry-points` was red on the sweep's changed digest and its justification was re-read and refreshed in `fc3b34bb`; `npm audit` shows the two image-size highs the ledger already carries as unreachable), with the migration gates and the new
`ci:trivyignore-hygiene` added; compare with `../2026-09-24-security-audit/gates/SUMMARY.txt`.

## How to read a folder

`README.md` states what was wrong (with `file:line` at the audited commit), what is true now, a red/green table naming
the test files and the HEAD the red ran against, and what is not done. `red/` and `green/` hold the verbatim test and
gate output, each ending in an `exit=` line.

## Not reached in this tranche, and why

- **Hot files (board §0, 24-hour rule).** P0-18 (QMS trigger; `scripts/db/migration-set.mjs`), the P0-8a grant half
  (`scripts/db/provision-app-role.mjs`; the archive door itself landed), the P0-12 every-write tier (`server/routes/ana-ri/utility.ts`,
  `server/services/ana-ri/command-executor.ts`, `server/routes/ana-ri/post-processing.ts`), the P0-4b migration, and the
  `ci:trivyignore-hygiene` wiring (`package.json`, `.husky/pre-push`). Each has its design written in the nearest
  item's README or the plan row.
- **Other lanes' files.** Every Terraform and workflow half (W2): P0-9 flags, P0-10, P0-13b, P0-15, P0-16b, P0-17's
  key set. P0-2 (a)–(c): D8. P0-10's 23 sign writers: D5.
- **Founder decisions.** P0-14 (branch protection and GitHub settings), P0-17 (which key production ships, DPA Annex
  III), whether production ships an MCP client allowlist (P0-2d).
- **Real-database runs.** No PostgreSQL with pgvector is reachable from this container, so the `tests/db/*.dbtest.ts`
  the plan names for P0-4 and P0-5 are written where the worker could and not executed; the PGlite contracts and the
  P0-7 PostgreSQL 16 transcript are the executed evidence.

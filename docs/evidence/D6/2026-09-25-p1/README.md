# D6 — P1 closures from the 2026-09-24 security audit (Phase B, second tranche, 2026-09-25)

**Rows:** D6 (D5 for the Part 11 items). **Source:** `docs/security/SECURITY_AUDIT_2026-09-24.md` (findings) and
`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` §2 (items). **Rule:** as in the P0 tranche
(`../2026-09-24-p0/README.md`): every item shown failing first against the unchanged code (`red/`), fixed with the
smallest change that closes the finding, shown passing (`green/`), committed on its own with the item id in the subject.

| Item | Finding | Commit | Closed | Folder |
|---|---|---|---|---|
| P1-14 | INF-32, claims register §7.1/§7.2: dead `security.txt` policy link, Host-built canonical, questionnaire and trust statement overstating controls | `ee35804a` | yes (this session's parts; the one sub-processor list is INF-21's) | `P1-14/` |
| P1-6 | IAM-13 webhook delivery through a bare `fetch` following redirects, error bodies echoed | `eeaa8267` (+ `49995fa0` lint) | yes | `P1-6/` |
| P1-9 | IAM-12 main socket namespace: query-string token, no membership re-check | `901f9c9e` | yes | `P1-9/` |
| P1-4 | IAM-10 role from a stale JWT on guarded routes | `414f203e` | yes | `P1-4/` |
| P1-21 | DP-17 governed sign accepted a null or free-text meaning | `3d09bf2a` | vocabulary half; the first-signing acknowledgement and identity-proofing record remain | `P1-21-meaning/` |
| P1-3 | IAM-09 lockout counter read-then-write and fail-open; resend refilled guesses; `/api/v1/auth` unlimited | `1219a144` | this session's parts; a per-challenge resend cap and Redis in production remain | `P1-3/` |
| P1-2 | IAM-08 recovery codes issued and never redeemable | `fdc1e53e` | recovery-code half (service + enterprise challenge); `routes/auth.ts` wiring and the emailed-code fallback wait on its window | `P1-2-recovery/` |
| P1-17 | IAM-18 (2)(3) `/api/metrics` readable by any user; public AI-gateway health with provider detail and exception echo | see `git log -- server/startup/operator-endpoints.ts` | yes; leak baseline 146 → 145 | `P1-17/` |
| P1-5 | IAM-14 unbounded memory upload in the stability router; no count of unguarded upload sites | see `git log -- scripts/ci/check-upload-guards.mjs` | the router and the gate; wiring and the 12-file sweep remain | `P1-5/` |
| P1-27 (first part) | DP-24 `ci:dead-audit-catch` red on trunk | `3625a205` (another lane) | closed on trunk; recorded in the register | — |

## Not reached in this tranche, and why

- **Hot files (board §0).** `routes/auth.ts` (until 01:07 UTC 09-26): the `/mfa/verify` call site for recovery codes,
  the emailed-code fallback for authenticator accounts, a resend cap. `routes/audit-trail-routes.ts` (01:39): P1-20.
  `routes/authoring.router.ts` (01:51): its two upload sites. `package.json` and `.husky/pre-push` (07:23): wiring of
  `ci:upload-guards` and `ci:trivyignore-hygiene`.
- **Larger items** left with their acceptance tests in the plan: P1-1 (inactivity logoff), P1-22 (retention and legal
  hold), P1-19/P1-24/P1-25 (D5), P1-7/P1-8 (D3), the Terraform and workflow items (W2), the founder's (P1-10, P1-11,
  P1-13, P1-15, P1-16, Redis).
- **Helper agents** were unavailable for most of the tranche (session limit); the items above were done directly.

## How to read a folder

As in the P0 tranche: `README.md` states what was wrong (with `file:line`), what is true now, a red/green table naming
the tests and the HEAD the red ran against, and what is not done; `red/` and `green/` hold verbatim output ending in an
`exit=` line.

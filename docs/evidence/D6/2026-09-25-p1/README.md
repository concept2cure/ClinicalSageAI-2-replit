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
| IAM-18 residuals (4)(5)(9)(10) | detector mounted before auth; enterprise sign-in admitted inactive accounts; AI prefixes metered as API; AI-assistance mount ungated | see `git log -- server/services/audit/audit-api-authority.ts` (neighbouring commits) | yes; (6)(7)(8) written up in the folder, (8) then closed with P1-2 part 2 | `P1-17-residuals/` |
| P1-5 sweeps 1 and 2 | IAM-14 the nine remaining upload routes outside `authoring.router.ts` | two commits after the gate | 13 unguarded sites → 4 in 3 files (one hot, two gate limits) | `P1-5/sweep/` |
| P1-20 | DP-18 audit reads and exports for any member; free-text event types written | commits of 2026-09-26 | yes, the ledger list route included | `P1-20/` |
| P1-2 part 2 | IAM-08 recovery codes at the main challenge; emailed-code fallback for authenticator accounts; IAM-18 (8) timing oracle | commit of 2026-09-26 | yes (routes half) | `P1-2-recovery/` (red-routes, green-routes) |
| P0-12 part 2 (P0 item) | DP-08 model output ran 36 writes unaided | commits of 2026-09-26 | yes: server half (every write a proposal, confirm tier) and client half (the confirm-only step in the sign-off dialog) | `../2026-09-24-p0/P0-12/` |
| P1-27 (second part) | DP-26 browser Sentry events unscrubbed; DP-27 `Math.random` organisation API key | commit of 2026-09-26 | yes for both; DP-28 (`tamper_proof_log` tenant column) and the logger key list open | `P1-27/` |
| P1-1 | IAM-06 no inactivity logoff, no session lifetime; a refresh renewed any session | two commits of 2026-09-26 | server: idle window (tenant-set, 15 min default) and 12-hour lifetime at both authenticators, the verifier and the refresh; client: idle warning, sign-out with the reason on the sign-in page; OQ step and concurrent-session limit follow | `P1-1/` |

## Not reached in this tranche, and why

- **Hot files (board §0).** `routes/authoring.router.ts` (until 23:24 UTC 09-26): its two upload sites.
  `.husky/pre-push` (07:23 UTC 09-26) and `package.json` (another lane's merge touched it at 02:20 UTC 09-26): wiring of
  `ci:upload-guards` and `ci:trivyignore-hygiene`. `routes/auth.ts` and `routes/audit-trail-routes.ts` left their
  windows and were done (P1-2 part 2, P1-20).
- **Larger items** left with their acceptance tests in the plan: P1-1's OQ step and concurrent-session limit (the
  server and client halves landed), P1-22 (retention and legal hold), P1-19/P1-24/P1-25 (D5), P1-7/P1-8 (D3), the Terraform and workflow items (W2), the founder's (P1-10, P1-11,
  P1-13, P1-15, P1-16, Redis).
- **Helper agents:** one completed the second upload sweep under the control tower; one dispatched for the P0-12 client
  half did not report back and wrote nothing, so that half is a hand-off with its contract in the P0-12 README.

## Trunk CI

Trunk CI was red before this lane's first push and after every one of them, on the same three jobs and steps, and this
lane added no failing step: Lint ("server SQL references a table nothing creates", "Proof tier", "requestDb adoption",
"ESLint warning ratchet" — the tree-wide ratchet, distinct from the per-push one), Security Scan (Trivy config,
`AWS-0011` CloudFront without a WAF, the founder's INF-05 decision) and Test ("Run tests"). Compared on `5f1e35b0`
(this lane) against `ba25be2f` (the neighbouring commit): identical failing steps, one fewer in this lane's run.

## How to read a folder

As in the P0 tranche: `README.md` states what was wrong (with `file:line`), what is true now, a red/green table naming
the tests and the HEAD the red ran against, and what is not done; `red/` and `green/` hold verbatim output ending in an
`exit=` line.

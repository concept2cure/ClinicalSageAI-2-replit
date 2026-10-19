# Security lens review, 2026-10-19: commit e1f3fd425 (88-file scope)

HEAD is `9795a1e1e` on `concept2cure-v2`. I made no edits and ran no gate with `--write-baseline`. Every finding below was traced by reading code at HEAD. None was executed against a running server, database, or HSM/KMS. Paths are under `/home/user/ClinicalSageAI-2-replit`.

**Verdict:** I found no Critical or High issue in scope. The landing is mostly tightening: project admission on c2c routes, signing-authority and request-pinned connections, chained audit in transactions, and honest 501/503 refusals where the old code faked success. I found three kinds of defect:
- an unguarded sibling left beside a route the landing guarded (IAM-31);
- unaudited sharing writes (DP-80);
- two small defects the landing itself introduced (IAM-32, DP-81).

## How I triaged

- **Middleware first.** I read all five middleware files, with the full bodies of the three that matter (`tenantLifecycleGuard`, `lazyRequestDbClient`, `authoringObjectAuthorization`).
- **Mechanical sweep of the diff (+3,809 / −2,780 lines).** I grepped added lines for:
  - body, query, or header tenant keys;
  - optional org parameters;
  - env reads;
  - new `tenant-isolation-safe` suppressions;
  - swallowed catches;
  - new `jwt.verify` callers.
- **Route registrations.** I listed every route registration added or removed. None lost an auth guard, and the only new public path is `GET /api/auth/sso/saml/configuration`.
- **New code next.** In order:
  1. the AS2 receipt route and its CMS verification;
  2. the CSR source router;
  3. the orchestrator `resume`;
  4. the notification target resolver;
  5. the SAML-to-MFA change;
  6. agency transmit;
  7. vault;
  8. offboarding.
- **Long tail.** I read the diff plus a sibling-route check.
- **Production reachability.** I ran the repo's own `launchScopeApiVerdict` on suspected doors. `decision-lineage`, `defense-packet`, `ivd`, `etmf`, `safety-narratives` and `capa-mdr` are out-of-scope and return 403 in production. `graphrag` and `/api/concept2cure/audit-logs` are unmapped and return 403 in production.

## CONFIRMED (traced)

**IAM-31, Medium. An ungated, unaudited second door writes project AI instructions. It predates the landing.**
- Route: `server/routes/concept2cure.ts:1549` (`PATCH /projects/:id/ownership-preferences`). Write path: `:1597-1612`.
- The landing guarded its sibling and left this one. The hunk touches only `PUT /projects/:id`: `+router.put('/projects/:id', projectRecordAdmission(true), …`. The helper is at `:121`; the PATCH is in no hunk.
- Exploit:
  1. Any signed-in member, `viewer` included, sends `PATCH …/projects/<n>/ownership-preferences {"projectInstructions":"…"}`.
  2. `<n>` can be any integer project id in the org, including a private project they were never shared on.
  3. The router middleware at `:152-155` checks only org context. The handler selects by (id, org) and rewrites `settings.customInstructions` with no role or sharing check.
  4. `project-instructions.ts:62-71` and `submission-chat-handler.ts:1488-1501` append that text to the AnA system prompt of every session on the project. That is stored instruction injection into other users' sessions.
  5. No `logAuditEntry` call, so no chained audit row.
- Reachable in production (verdict `launch`). No client or test references the route.
- Clauses: 21 CFR 11.10(d)(e)(g); Annex 11 §12.1.
- Fix: delete it, or add `projectRecordAdmission(true)` plus a chained audit row with before/after values.

**DP-80, Medium. Project sharing changes write no audit row, and member removal is a hard delete. It predates the landing.**
- Routes: `concept2cure.ts:1872` (visibility; write `:1923-1936`), `:1960` (member upsert; `:2048-2066`), `:2090` (member removal; `.delete(projectMembers)` at `:2131`).
- There is no `logAuditEntry` anywhere in `:1872-2155`, and `db/migrations/20260401_project_sharing_visibility.sql` has no trigger. The only trace is the generic fire-and-forget request observer (`server/startup/audit-trail.ts`), which records no before/after values.
- Authorization is present (`canManageProject`), so only an owner, creator, or admin can change sharing. A flip between private and org-public, and any member removal, leaves no reviewable record. No client calls these routes, but they are reachable (`launch`).
- Clauses: 11.10(d)(e); Annex 11 §12.4; HIPAA §164.312(b). It is the same class as DP-49 and DP-57, which were closed for tenant roles and config.
- Fix: write a chained row inside the change's transaction, make removal a soft delete, and require a reason.

**IAM-32, Low. SAML `provider` and `sessionIndex` claims do not survive any token re-mint. The landing introduced the exposure and partially reopens IAM-03's provider carry.**
- Hunk: `sso.ts` removed the direct mint (an access token only, no refresh token) and now issues a login challenge. `auth.ts:1881` adds `provider:'saml'` to the access token minted at `/mfa/verify`, but the refresh token minted beside it (`auth.ts:1889`) carries neither claim. SAML sessions therefore get a refresh token for the first time.
- Re-mints that drop the claims: `/api/auth/refresh` (`auth.ts:1588-1596`), enterprise `/refresh-token` (`authEnterprise.ts:1050-1060`), and `/select-organization` (`authEnterprise.ts:948`).
- Effect after the first refresh or org switch:
  1. `requirePlatformAdmin.ts:71` and `master-admin.ts:158` stop excluding an IdP-asserted e-mail from the platform-admin and owner allowlists.
  2. `sso.ts:649-652` no longer sees a federated session, so logout skips IdP single logout.
- Why Low: the IdP must assert an allowlisted owner e-mail for an account that is a member of the IdP's org, and the attacker must still pass the new local second factor. The tenant binding (`sso.ts:845-935`) is intact.
- Test gap: `auth-carries-provider.test.ts` covers only the access-token path.
- Fix: carry both claims through `continuedSessionClaims` and the refresh token, and add the refresh path to that test.

**DP-81, Low. An unverified AS2 response is served as "agency" provenance. The landing introduced it.**
- Hunks:
  - `fda-esg.ts:803`: `+if (attempt.ok) await writeAs2Metadata(…,'as2Receipt', as2ReceiptMetadata(attempt.response, outcome))`. `attempt.ok` means any HTTP answer arrived, including 4xx and 5xx.
  - `fda-esg.ts:510-514` computes `verified`, but the download never reads it.
  - `fda-esg.ts:885-893` serves any stored `bodyBase64` with `provenance: 'agency'`.
- Path: an intermediary returns a 502 HTML page, or a 200 with an unsigned MDN, and the transmittal goes `in_transit`. The download is then named `agency-acknowledgement-<id>.txt`, and the toast says "the agency's own bytes" (`GatewayTransmittals.tsx:286-295`, fed by `mdx-submission-gateway.ts:446`).
- Clause: 11.10(e), original and attributable records. The header of `acknowledgement.ts` names this exact risk.
- Fix: serve `'agency'` only when `captured.verified === true`; otherwise return the platform record.

**IAM-33, Low. Any member can inject unattributed notices. It predates the landing, which only swapped the DB client.**
- Route: `mdx-notifications.ts:119-143`. `notification-service.ts:66-92` has no `created_by`. The mount at `register-inline-routes.ts:1228` has no role gate. The `/api/mdx/notifications` prefix is `launch` (`launch-scope-api.ts:68`).
- A `viewer` can post `severity:'critical'`, category `admin` or `system`, to the whole org, a role, or a user.
- No client calls the route; the task tray only lists and marks read. `actionUrl` is neutralised client-side by `notificationTarget.ts`, so this is spoofing, not XSS.
- Clause: 11.10(d)(e).
- Fix: delete the route or require editor access and record the actor.

**DP-49 is unchanged and still open.** The landing adds an outbound invitation e-mail on the 202 cross-org path (`tenant-users.ts:497`, `pending-invitation-delivery.ts`). That path still has no chained audit row.

## PLAUSIBLE / latent

None of these is reachable in production under the shipped defaults.
- `DecisionLineageService.getLineageGraph` takes `organizationId?` (`services/workflow/DecisionLineageService.ts:380`). The first two reads filter by `documentId` only, and the route passes `authedOrgId(req) ?? undefined` (`routes/decision-lineage.ts:63`). The path is `out-of-scope`, and the parent-scoped RLS policies cover the child tables. The drizzle gate scans only `routes/` and `api/`, so nothing watches the service.
- `GET /api/concept2cure/audit-logs` (`concept2cure.ts:2484`) is the DP-18 pattern again: any member reads the org's `regulatory_audit_logs`, including user names, IPs and before/after values. It is unmapped, so 403 in production unless `LAUNCH_SCOPE_API_UNATTRIBUTED=report`.
- The tenant purge now hard-refuses a tenant that holds QMS versions or frozen inputs (`tenant-offboarding.ts:491-526`, called at `:873`). No disposition path exists yet, so an Art. 28(3)(g) deletion instruction cannot be met for such a tenant. This is documented as partial in `docs/evidence/AUDIT-REMEDIATION/2026-10-14/tenant-retention-preflight.md`. It is a founder/DPO decision, not a defect.

## Clean categories

- **Tenant key provenance.** Every new route derives the org from the session. The one body-supplied org key (`tenant-users.ts:384`) is verified by DB membership plus admin in `authorizeOrgAccess` (`:82-113`). The diff adds no optional org parameter.
- **Second doors for transmit.** I enumerated all writers of `submission_transmittals.status`. All are on the transmit or governed path, or are the new CMS-verified receipt. No HTTP route lets a caller choose a status.
- **AS2 receipt verification.** It is pinned to the agency certificate (`as2-cms.ts:92`, `-nointern -noverify`). It also checks the Message-ID and the payload MIC (`fda-esg-receipts.ts:35`). It writes the status, `recordGovernedAction`, and the chained `ECTD_TRANSMITTED` row in one transaction.
- **Input handling.** The new `multer` site has an extension allowlist and `assertUploadSafe` (`mdx-as2-receipt.ts:13,55`). `openssl` runs through `execFile` with fixed arguments in a 0700 temp directory. There is no `sql.raw` and no new user-URL fetch.
- **Env flags.** Only two env reads were added (certificate paths), and there is no `*_ACCEPT_*`.
- **AI egress.** Changed model calls now pass `organizationId` and `userId` into `getGateway()`.
- **Error leaks.** The gate is green and the new refusals use fixed strings.
- **Public SAML endpoint.** `GET /api/auth/sso/saml/configuration` is a new public path. It discloses only SAML-enabled org slugs, which `saml/initiate` already discloses.

## Gates (all pass; outputs in `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/df678b90-6e5c-570f-95c8-b0431c63411d/scratchpad/gates/`)

| Gate | Result | Baseline size and direction |
|---|---|---|
| ci:tenant-isolation:no-regression | pass | 0 current / 0 baseline (was 7 vs 8 on 10-08); 45 inline suppressions in force, 7 added by the landing, all `users` identity reads |
| ci:org-path-param-guards | pass | 45/45 guarded, baseline 0, flat |
| ci:unauthenticated-fetch | pass | 75 sites scanned (was 71), 0 baselined |
| ci:gateway-bypass | pass | 8 baselined, flat |
| ci:session-scoped-rls-bypass | pass | 4 occurrences in 1 unmounted file (was 34 in 7 files), down |
| ci:server-error-leaks | pass | 10 sites in 10 files, flat |
| check:security-patterns | pass | 0 violations in 3,292 files (was 3,083) |
| ci:committed-secrets, ci:no-dev-auth-in-prod, ci:jwt-verify-pinned, ci:client-ip-single-source, ci:regulated-delete-audit, check:compliance-claims, ci:upload-guards | pass | none; upload-guards has 1 baselined |
| ci:path-containment | pass | 3 baselined, flat |
| ci:dead-audit-catch | pass | 0, flat |
| ci:discarded-audit-write | pass | 0 (was 119 in 52 files at the parent, 112 on 10-08). The landing broadened the scanner to bare statements and emptied the baseline. Its own note says promise chains and aliases are still unreviewed. |
| ci:sign-ceremony | pass | 19 sites, 4 re-authentications that sign nothing (was 20), down |
| ci:drizzle-tenant-scope | pass | 100 sites (was 110). 27 are fixed but not banked, so that much headroom remains in the ratchet. |
| ci:tenant-entry-points | pass | 13 entry points, 7 not considering entitlement (was 14 and 9), down |

## Baseline ids re-verified as still closed (by code at HEAD)

- **IAM-03, tenant binding:** `sso.ts:205,845-935`.
- **IAM-04 / IAM-06, refresh:** `auth.ts:1481-1600`, with revoke-on-rotate at `authEnterprise.ts:956,1068`.
- **IAM-07:** `c2c/exports.ts:522`.
- **IAM-10:** `server/auth.ts:280-296`.
- **IAM-15:** no header-as-tenant read in scope.
- **DP-01:** `controlled-document-service.ts:19-24,143-155`.
- **DP-02 ceremony** on every changed signer:
  - `governed-signed-act.ts:206`
  - `submission-sign-release.ts:166`
  - `mdx-qms.ts:551-590`
  - `mdx-submission-gateway.ts:308,500`
- **SEC-1008-1:** `governed-transmit.ts:486`.

## Coverage of the 88 files

- **Read in depth** (diff plus HEAD code and callees):
  - Middleware: all five files in `server/middleware/`.
  - Gateways and tenant: `server/services/submission-gateways/` (all 8 files), `server/services/tenant/` (both files).
  - Vault: `server/services/vault/` (all 4 files).
  - In `server/routes/`: `mdx-as2-receipt`, `mdx-submission-gateway`, `gateway-accounts`, `submission-orchestrator`, `csr-source-inputs`, `submission-sign-release`, `governed-signed-act`, `api-keys`, `auth`, `authEnterprise`, `sso`, `tenant-users`, `concept2cure`, `graphrag`, `mdx-qms`, `decision-lineage`, `mdx-notifications`, `safety-narrative`, `defense-packet`, `ana-model-provenance`, `ana-intelligence`.
  - In `server/routes/c2c/`: `exports`, `project-access`.
- **Diff only, with sibling spot-checks:** all remaining files in `server/routes/`, including all of `server/routes/c2c/` and `server/routes/ind-lifecycle/` and the admin files, `510k-estar`, `audit-services`, `billing-dashboard`, `licensing`, `scim-ip-allowlist`, `cerv2-document`, `authoring.router`, `cmc-*`, and `taskBoard`.
- **Not opened:** none; I opened all 88 diffs.

## Not verifiable by reading

- Live RLS policies, the production environment values (`LAUNCH_SCOPE_*` rely on code defaults), and whether the runtime image has the `openssl` CLI.
- OpenSSL's `cms -verify -nointern -noverify` behaviour, which I read but did not execute.
- The SAML-to-MFA flow end to end against a real IdP.
- Infrastructure and CI honesty: out of this lens's scope.

# Third-party penetration test — GA scope of work for the launch catalog

**Status:** Draft for the founder's vendor RFP. Plan item **P1-15**
(`REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` §2); launch row **D6** ("third-party pen test with findings closed",
`docs/LAUNCH_DEFINITION_OF_DONE.md`).
**Owner:** founder (vendor, contract, budget, the staging environment); this lane
(`session_0194UQPxy9Er2ibRAjog8Ven`, D6) for the technical scope and the retest list.
**Written:** 2026-09-26 at trunk `6eeee017`. Every route named below was checked against its mount in
`server/bootstrap/`, `server/startup/` or `server/index.ts` at that commit and cites the file and line; the check is
re-runnable (`docs/evidence/D6/2026-09-25-p1/P1-15/`).
**Supersedes:** `docs/beta/security/PEN_TEST_SCOPE_2026-05-01.md`, which scoped a limited BETA test of the
medical-device 510(k) surface. That surface is outside the launch catalog and is not tested here except for its refusal
(§3).

---

## 1. Engagement summary

| Field | Value |
|---|---|
| Objective | Independent evidence, against the launch catalog as it will ship, that (a) the 2026-09-24 audit's closed findings stay closed, (b) no tenant can reach another tenant's records through any door, and (c) no door signs, approves, retires or deletes a governed record without the ceremony the platform claims. |
| Duration | 15 working days of testing; one retest window of 5 working days after remediation; a second retest window of 2 days if any Critical or High fails the first retest. |
| Methodology | **Black-box** for the application surface (§2) from the tester's own network through the staging CloudFront distribution. **White-box** for the tenant-isolation, IDOR and retest work: read-only access to the repository (`concept2cure-v2` at the commit pinned at kick-off, §8), the audit register (`SECURITY_AUDIT_2026-09-24.md`), this document, and read-only SQL on the staging database as a role with `SELECT` only, so the tester can prove what a request wrote (or did not). No write access to the repository, CI or Terraform. |
| Environment | **A staging tenant pair, never production.** Staging is production's composition (`terraform/environments/staging`, one `terraform/stack` with two roots; `LAUNCH_DEFINITION_OF_DONE.md` row D1, B8). Two organisations A and B, each with an owner, an admin, a manager, a member and a viewer; one platform administrator held by the founder and lent for the bounded tests that need it (§5). `RLS_ENFORCE=on`, `NODE_ENV=production`, `LAUNCH_SCOPE_ENFORCE` on, `MCP_ENABLED=true`, `ENABLE_COLLAB_CRDT=true`, a SAML test IdP configured for organisation A, a SCIM bearer for organisation A. |
| Data | Synthetic only. No PHI, no real sponsor content, no real regulatory dossier (§5). |
| Approach | Manual testing with tooling; no destructive or volumetric testing; rate limits confirmed by a single 429, not exhausted. |
| Reporting | CVSS v3.1 base score and vector per finding; executive summary; technical appendix with reproduction; each finding tagged **new**, **regression of `<id>`** (a closed register id that re-opened) or **variant of `<id>`** (an open id, §4.2); retest report and retest letter (§6). |
| Budget | The founder's. The BETA document estimated $15–25k for 10 days on a narrower surface; this scope is roughly 1.5× the testing and adds white-box tenant work. |

The tester is not asked to find the platform's whole attack surface from nothing. The audit already did that
(91 register ids, `SECURITY_AUDIT_2026-09-24.md` §4). The tester is asked to **break the closures** (§4.1), to **not
re-report what is known open** (§4.2), and to find what the audit and the weekly lens missed on the surface in §2.

## 2. In scope — surfaces by path

### 2.1 How requests reach the application, and what is reachable

The staging CloudFront distribution forwards these path patterns to the API (the rest is the SPA from S3):
`/api/*`, `/readyz`, `/healthz`, `/collab`, `/collab/*`, `/scim/*`, `/mcp`, `/mcp/*`, `/.well-known/*`, `/authorize`,
`/token`, `/register`, `/revoke`, `/oauth/*` (`terraform/modules/cloudfront/main.tf:8-23`).

**`/socket.io/*` is not in that list at HEAD.** The socket.io namespaces (§2.5) are reachable only where the listener
is reachable directly. Before kick-off the founder and the W2 lane decide one of: add `/socket.io/*` to
`alb_path_patterns` on staging (WebSocket through CloudFront), or give the tester a direct origin hostname for the
socket tests. Without one of the two, §2.5 and the IAM-01/IAM-12/IAM-19 retests cannot run and the report must say so.

Every `/api/*` request passes, in order: the Redis rate limiter (`server/startup/middleware.ts:60`), the auth boundary
(`:154`, default-deny with the allowlist in `server/middleware/public-api-allowlist.ts:33-73`), the tenant-header
impersonation detector (`:160`), the body parsers (`:182-183`; the 50 MB Concept2Cure parser at `:193`), then the
launch-scope verdict and the entitlement gate. A path outside the launch catalog answers `403 LAUNCH_SCOPE` in
production before its handler runs (`server/services/entitlements/launch-scope-api.ts`;
`docs/evidence/D2-API-SCOPE/2026-09-25/`). A second, unconditional `/api` gate follows the route registrations
(`server/bootstrap/register-platform-routes.ts:245`).

Unauthenticated `/api` paths the tester may reach without a token are exactly the allowlist entries
(`public-api-allowlist.ts:33-73`): `/api/auth/*`, `/api/setup/*`, `/api/health*`, `/api/metrics` (scrape token at the
handler), `/api/cortex/health`, `/api/claude/health`, `/api/ai-gateway/health`, `/api/claude/models`, `/api/v1/*` (the API-key API), the billing and Firecrawl
webhooks, `/api/csp-report`, `/api/billing/dtc-pricing`, `/api/time`, `/api/diag`. Anything else without a token must be
`401`; that is itself a test.

### 2.2 The six launch apps and their `/api` mounts

The canonical list is not this table: it is `UI_SURFACES[].apiPrefixes` in `shared/constants/ui-surface-registry.ts`
for the surfaces `LAUNCH_APPS` names in `shared/constants/launch-scope.ts:43-121`, which `ci:launch-scope-api`
(`scripts/ci/check-launch-scope-api.ts`) holds true. The table is that list as computed on 2026-09-26
(`docs/evidence/D6/2026-09-25-p1/P1-15/launch-api-prefixes.txt`, with the script), each prefix with the mount that
serves it. Regenerate before kick-off; a prefix that appears in the registry and has no mount is not a target.

| App (`LAUNCH_APPS.id`) | Surfaces | API prefixes and mounts |
|---|---|---|
| **Projects** (`projects`) | `projects`, `project-home`, `program-journey`, `filings-catalog`, `tasks` | `/api/projects` (`server/bootstrap/register-project-routes.ts:33`); `/api/c2c/projects` (`register-inline-routes.ts:848`); `/api/concept2cure/projects` and the rest of `/api/concept2cure` (`register-concept2cure-routes.ts:30-48`); `/api/programs` (`register-document-routes.ts:292`); `/api/regulatory-programs` (`register-inline-routes.ts:1172`); `/api/program-journey` (`:1007`); `/api/project-home` (`register-regulatory-routes.ts:346`); `/api/tasks`, `/api/regulatory/tasks` (`register-core-routes.ts:156-157`); `/api/task-management` (`register-regulatory-routes.ts:328`); `/api/project-sections` (`register-document-routes.ts:220`); `/api/ectd` (`:127,140`); `/api/submission-ops` (`register-inline-routes.ts:1171`); `/api/regulatory-correspondence` (`:1241`); `/api/regulatory/registry` (`register-ai-routes.ts:51`); `/api/rim` (`register-inline-routes.ts:747`); `/api/biopharma/*` (`:1044,1053,1062`); `/api/approval-workflows` (`register-advanced-platform-routes.ts:225`) |
| **Vault** (`vault`) | `vault`, `artifacts-center` | `/api/c2c/project-vault` (`register-clinical-intel-routes.ts:187`; upload `server/routes/c2c/project-vault.ts:1671`, download `:1543`); `/api/mdx/vault` (`register-inline-routes.ts:1180,1200-1202`; `server/routes/mdx-vault.ts:105,324,354`); `/api/vault/ingest` (`register-inline-routes.ts:863`; `server/routes/vault-ingest.ts:150`); `/api/vault/legal-holds` (`:874`; `server/routes/vault-legal-holds.ts:246-248`); `/api/artifacts-center` (`register-regulatory-routes.ts:337`); `/api/biotech-artifacts` (`register-document-routes.ts:156`); `/api/corpus` (`:371`); `/api/regulatory-programs`, `/api/submission-ops` as above. `/api/atoms` is registry-declared with no mount at HEAD: not a target |
| **Authoring** (`authoring`) | `document-authoring`, `template-library`, `review`, `regulatory-workspace`, `protocol-dev` | `/api/authoring` (`register-inline-routes.ts:317`, behind `authoringPermissionsRouter` and `authoringObjectAuthorization` at `:310-311`); `/api/authoring-actions` (`:326`); `/api/authoring-pdf` (`register-ind-lifecycle-routes.ts:38`); `/api/c2c/documents` (`register-inline-routes.ts:817`); `/api/c2c/templates` (`:1033`); `/api/templates` (`register-core-routes.ts:41`); `/api/coauthor` (`register-document-routes.ts:103`); `/api/concept2cure/artifacts`, `/review-tasks`, `/review-threads`, `/reviews` (`register-concept2cure-routes.ts:30-36`); `/api/review` (`register-regulatory-routes.ts:301`); `/api/regulatory-workspace` (`:310`); `/api/csr-workflow` (`:292`); `/api/data-origins` (`register-inline-routes.ts:336`); `/api/study-design` (`:373`); `/api/biostat-bridge` (`:383`); `/api/irb` (`:419`); `/api/esignature` (`:272`); `/api/part11` (`register-advanced-platform-routes.ts:192`); `/api/realtime-collab` (`:173`); `/api/protocol-dev` (`register-inline-routes.ts:1017`) and `/api/protocol-{portfolio,development,risks,amendments,deviations,reviews,consent,templates,milestones,export}` (`:583-720`); `/api/workflow` (`register-document-routes.ts:386`); `/api/clinical-regulatory-evidence/*` (`register-clinical-intel-routes.ts:261`). `/api/document-authoring` is registry-declared with no mount at HEAD: not a target |
| **Submission Center** (`submission-center`) | `submission-center`, `dossier-map`, `ectd-compile`, `ectd-coauthor`, `ectd-publishing`, `gateway-transmittals` | `/api/submissions` (`register-governance-routes.ts:65`, the core router `server/routes/submissions.ts`; and `register-document-routes.ts:188`, sign-release `server/routes/submission-sign-release.ts:164`); `/api/submission-orchestrator` (`register-document-routes.ts:173`); `/api/ectd`, `/api/ectd-compile` (`:127,140,105`); `/api/dossier-map` (`register-inline-routes.ts:981`); `/api/content-assembly` (`:1263`); `/api/global-ri` (`:488`); `/api/mdx/gateways` (`:1223`; `server/routes/mdx-submission-gateway.ts:75-458`, transmit at `:195`); `/api/region-profiles` (`register-governance-routes.ts:66`); `/api/510k/estar` (`register-regulatory-routes.ts:88`); `/api/c2c/actions/sign` (`register-inline-routes.ts:345`; `server/routes/c2c/actions.ts`); `/api/c2c/projects`, `/api/rim`, `/api/submission-ops` as above |
| **Submission Readiness** (`submission-readiness`) | `dispatch-readiness` | `/api/submissions/sequences/:seqId/dispatch-readiness` and the sequence routes beside it (`server/routes/submissions.ts:896-1658`, mounted at `register-governance-routes.ts:65`); the surface also reads `/api/c2c/projects` |
| **QMS controlled documents** (`qms`) | `quality`, `qmp` | `/api/mdx/qms/*` (`register-inline-routes.ts:1235`; `server/routes/mdx-qms.ts:341-1552`: documents `:341-750`, approve `:595`, revise `:643`, retire `:707`, changes `:1290-1552`, change approve `:1446`, transition `:1389`); `/api/quality` (`register-project-routes.ts:96`); and the **legacy second QMS API** `/api/qms/*` (`register-document-routes.ts:271`; `server/routes/qms.ts:66-222`), in scope because it is mounted and DP-34 is open on it |

### 2.3 The authentication doors

| Door | Mount | Routes to cover |
|---|---|---|
| Main sign-in | `/api/auth` and its alias `/api/v1/auth` (`register-platform-routes.ts:93-94`) | `server/routes/auth.ts`: `GET /session` (`:242`), `POST /login` (`:408`), `/signup` (`:879`), `/verify-email` (`:1212`), `/resend-verification` (`:1262`), `/logout` (`:1291`), `/refresh` (`:1355`), `GET /me` (`:1531`), `/mfa/verify` (`:1650`), `/mfa/resend` (`:1858`), `/mfa/setup` `/enable` `/disable` (`:1974,2051,2130`), the four password-reset spellings (`:2487-2491`), `/password/change` (`:2502`), `/license-request` (`:2677`). `/dev-login` (`:747`) must be unreachable in production (`server/routes/sso.ts:607,625`) |
| Enterprise sign-in (the RFP brief called this `/api/enterprise/auth`; the mount is `/api/auth/enterprise`) | `/api/auth/enterprise` (`register-platform-routes.ts:157`) | `server/routes/authEnterprise.ts`: `/check-sso-domain` (`:192`), `/check-email` (`:207`), `/verify-password` (`:249`), `/verify-mfa` (`:465`), `/mfa/*` (`:651-723`), `/electronic-signature` (`:789`), `/select-organization` (`:847`), `/refresh-token` (`:1015`), `GET /session` (`:1085`), `/logout` (`:1119`) |
| SSO (SAML) | `/api/auth/sso` (`register-platform-routes.ts:167`) | `server/routes/sso.ts`: `/saml/initiate` (`:294`), `/saml/callback` (`:471`), `/saml/metadata` (`:611`), `/saml/logout` and its callback (`:700-701,767-768`), the generic `/:provider/initiate` and `/:provider/callback` (`:776,793`) |
| SCIM 2.0 | `/scim/v2` (`register-platform-routes.ts:183`; admin `/api/admin/scim-tenants` `:196`, `/api/admin/scim-ip-allowlist` `:226`) | `server/routes/scim.ts`: `Users` GET/POST/PUT/PATCH/DELETE (`:509,619,696,775,879`), `Groups` (`:967-1009`), discovery (`:486,1052,1065`) |
| Identity and tenant context | `/api/users`, `/api/user` (`:121-122`); `/api/setup` (`:142`); `/api/tenants` (`register-tenant-routes.ts:51`); `/api/tenant-config` (`:63`); `/api/api-keys` (`register-document-routes.ts:397`; `server/routes/api-keys.ts:106,178,201`) | first-run setup, the tenant list and purge (`server/routes/tenants-simple.ts:381,479`), tenant settings (session idle window, concurrent-session limit), organisation API keys |
| MFA | in both sign-in doors above | emailed one-time code, TOTP, recovery codes, resend cap, lockout |

### 2.4 The connector for Claude (remote MCP server) and its OAuth endpoints

Mounted at the application root when `MCP_ENABLED=true` (`server/index.ts:120`), ahead of the core middleware, with its
own parsing, CORS, headers and rate limits (`server/mcp/index.ts:2-21`). Endpoints (`server/mcp/index.ts:7-11`):
`/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-authorization-server`, `/authorize`, `/token`,
`/register` (dynamic client registration behind the redirect-origin guard, `:192-194`), `/revoke` (the SDK's
authorization router, `:211`), `/oauth/consent` (`:225-230`) and `/mcp` itself (`MCP_PATH`, `server/mcp/config.ts:13`;
Bearer-only, `server/mcp/index.ts:233-240`). The tools behind it are in `server/mcp/tools/` (19 at D8's proof). The
tester registers a client at an origin the founder puts in `MCP_CLIENT_REDIRECT_ALLOWLIST` and tries an origin that is
not.

### 2.5 The socket namespaces

| Namespace | Where | What to test |
|---|---|---|
| Main (`/`) at path `/socket.io/` | `server/socketServer.ts:278`; handshake `:225-280` | token only in `auth` (never the query string); membership at handshake and on the timer; `session:ended` then disconnect for a removed member, a revoked session, a suspended tenant; room isolation (no cross-tenant event) |
| `/ana` (AnA duplex chat) | `server/services/ana/ana-realtime.ts:212`, attached from `server/socketServer.ts:1148-1152` | refuses `mfa_challenge`, `mfa_partial` and refresh tokens; membership and tenant lifecycle at handshake; the tool loop runs only for a full session; **known open:** no periodic re-check after connect (IAM-19) |
| `/collab` (Hocuspocus CRDT, `ws`) | `server/services/hocuspocus-server.ts:432`; attached when `ENABLE_COLLAB_CRDT=true` (`server/startup/services.ts:562-566`) | token class, membership, lifecycle and per-document authorization (`hocuspocus-server.ts:211-300`); a document of organisation B opened with organisation A's session |

### 2.6 The audit trail's inspector-facing doors, including the signed export

Mounted at `/api` (`register-inline-routes.ts:263`, `createAuditTrailRoutes`): `GET /api/audit/logs` (`server/routes/audit-trail-routes.ts:222`), `/api/audit/events` GET/POST and `/batch` (`:268,300,356`), `POST /api/audit/signatures` (`:477`) and `GET …/:signatureId/verify` (`:548`), `GET /api/audit` (`:588`), **`GET /api/audit/export`** (`:614`), **`GET /api/audit/export/signed`** (`:668`), **`POST /api/audit/export/verify`** (`:723`), the chain-monitor status and check (`:757,789`), and `POST /api/audit/bulk-delete`, which must answer `403 IMMUTABILITY_VIOLATION` for every caller including a platform administrator (`:806-815`). Also the ledger `/api/audit-trail` (`register-regulatory-routes.ts:319`) and the platform SIEM export `/api/admin/audit` (`register-platform-routes.ts:213`; `server/routes/admin/audit-siem.ts`).

### 2.7 File upload and download

Nineteen files build uploads (`npm run ci:upload-guards`, 2026-09-26: "4 unguarded multer site(s) across 3 file(s)";
baseline with reasons `scripts/ci/upload-guards-baseline.json`). The launch-catalog sites: `POST /api/vault/ingest`
(`server/routes/vault-ingest.ts:150`; `assertUploadSafe` inside the ingest transaction), `POST
/api/c2c/project-vault/:id/file` (`server/routes/c2c/project-vault.ts:1671`) and `GET
/api/c2c/project-vault/:id/documents/:documentId/download` (`:1543`), the Authoring image and DOCX imports in
`server/routes/authoring.router.ts` (the two baselined sites that still trust the declared MIME type, IAM-14), the chat
evidence upload (`server/routes/chat/upload.ts`, mount `/api/chat` at `register-ai-routes.ts:49`), the exports `POST
/api/concept2cure/artifacts/export-{docx,pdf,pptx}` (`server/routes/c2c/exports.ts:87,127,362`) and `GET
/api/concept2cure/documents/download/:filename` (`:424`), and `POST /api/document-understanding/analyze` (mount
`register-clinical-intel-routes.ts:96`; `server/routes/document-understanding.ts:476`). Cases: path traversal, ZIP-slip,
polyglots, ZIP bombs, MIME confusion, macro-bearing DOCX, an HTML file served as a document, a filename that collides
with another tenant's, and a download of another tenant's object by id or by name. The guard under test is
`server/middleware/uploadSafety.ts:178-196` (antivirus fails closed in production).

### 2.8 The SPA as served, and the AI layer's doors

The SPA document from S3 through CloudFront: response headers (HSTS, CSP, `nosniff`, frame `DENY`; INF-04) on `/` and on
`/api/*`, framing of the signing and approval screens, DOM XSS through rendered markdown (the single sanitizer,
`client/src/concept2cure/components/ana/renderSafeMarkdown.ts:135-146`), the sign-in page's handling of a session handed
over in the URL fragment (IAM-18 (6)). The AI doors the shell uses from every app: `/api/ana-ri` (`register-ai-routes.ts:35`;
the stream `server/routes/ana-ri/stream.ts:209`, its control `:2723`, `POST /governed-action`
`server/routes/ana-ri/utility.ts:558`), `/api/ana` (`:28`), `/api/chat` (`:49`). What the tester tries here is prompt
injection that causes a write without a person's confirmation, a tool that reaches another tenant's record, and a tool
that reads an arbitrary file path (the P1-34 evidence README names these as hand-ons).

### 2.9 Operator and disclosure endpoints

`/healthz`, `/readyz` (`server/startup/inline-endpoints.ts:49-50`); `/api/health/full`, `/api/health/jobs`,
`/api/metrics` behind `requireMetricsAuth` (`:205,225,264`); `/api/ai-gateway/health` (a status word, `:667`) and
`/detail` behind the same guard (`:679`); `/.well-known/security.txt` and `/.well-known/security-policy`
(`server/routes/well-known.ts:71,88`; mount `register-platform-routes.ts:237`).

## 3. Out of scope

- **The non-catalog modules.** `CLAUDE.md` Rule 2 and `LAUNCH_DEFINITION_OF_DONE.md` ("Not in scope for launch"): the
  regulatory digital twin, the epistemic / causal / self-evolving engines, federated learning and the manufacturing
  digital twin; and every other surface outside `LAUNCH_APPS` (the CMC, device, IVD, CER, pharmacovigilance,
  stability and clinical-intelligence mounts among them). In production these answer `403 LAUNCH_SCOPE` (§2.1). The
  only test against them is that refusal: the tester confirms a sample of out-of-scope mounts is refused for every
  role, and reports any that is not. Where §4.1 names a route on an out-of-scope mount (IAM-11's `/api/stability`), the
  retest is the refusal plus the repository's own test re-run white-box; the founder may grant a second pass with
  enforcement off if the vendor's method needs it.
- **The AWS account.** IAM, KMS, S3, RDS, CloudTrail, GuardDuty, Config, the VPC, the ECS task definition, Secrets
  Manager. The INF-* findings that live there are a cloud-configuration review (P1-10, P1-11, P1-16), not this
  engagement. `terraform/` may be read as white-box context. Response headers as observed from outside (INF-04) are in
  scope because they are the application's behaviour as seen by a browser.
- **Denial of service** of any kind: volumetric, application-layer, resource exhaustion, rate-limit exhaustion beyond
  confirming that a limiter answers `429` once. Lockout tests stop at the sixth password and the fourth resend.
- **Production**, any tenant's real data, the founder's accounts and devices, the GitHub organisation and CI
  (INF-01, INF-02, INF-09, INF-10 are the founder's and the W2 lane's), social engineering, physical access.
- **Third parties:** Anthropic, OpenAI, Moonshot, AWS Bedrock, Stripe, the SMTP provider, Firecrawl, FDA ESG, the SAML
  test IdP's own service. The connectors to them are in scope only as this platform's client behaviour (SSRF, token
  handling, error echo).

## 4. The retest list

This is the heart of the engagement. The register is `SECURITY_AUDIT_2026-09-24.md` §4 (91 ids at 2026-09-26: IAM-01…19,
DP-01…39, INF-01…33); the plan is `REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` §1–§2. Every id below was read from the
register's Status cell and the plan's Item cell on 2026-09-26. **§4.1** lists every id the register marks closed or partly
closed since the audit, with the door to retest and the expected result; a failure is reported as **regression of
`<id>`** with the original severity as the floor. **§4.2** lists every id still open: the tester confirms the state in one
line each and does **not** re-report it as a finding, unless a route or consequence outside the register's description is
found (then: **variant of `<id>`**). **§4.3** maps the plan rows marked Closed to the ids, so the vendor can read either
document.

The commit hashes are the closing commits named in the register; the tester reads them for the fix's shape. Where a
closure is "config on staging", the test is that staging shows the behaviour, with the W2 lane's deploy record as the
white-box source.

### 4.1 Closed or partly closed — retest each

| Id | Sev (audit) | What was closed (plan item, commit) | Door to retest | Expected |
|---|---|---|---|---|
| IAM-01 | Critical | `/ana` namespace admitted pre-MFA tokens, query-string tokens, no membership or lifecycle check (P0-1, `7c4faf2a`) | socket.io `/ana` (`ana-realtime.ts:212`) with (a) the 5-minute `mfa_challenge` token a correct password yields at `POST /api/auth/login`, (b) a `mfa_partial` token, (c) a refresh token, (d) a full token in the query string, (e) a full token of a user removed from the organisation, (f) a full token of a suspended tenant | (a)–(f) refused at handshake; no agent turn runs |
| IAM-02 (d), (e) | High | Dynamic client registration open (P0-2d, `5c10785e`); the connector token minted outside the session register (P1-38) | `POST /register` with a `redirect_uri` outside `MCP_CLIENT_REDIRECT_ALLOWLIST`, with `http://` off loopback, with a fragment; then the full OAuth flow and the token at `/mcp` after the tenant's idle window and after the 12-hour lifetime; a sixth connector session for one account | `400 invalid_redirect_uri` for each bad URI; the idle and expired token refused at `/mcp`; the oldest connector session superseded at the pool limit. **(a)–(c) remain open (§4.2)** |
| IAM-03 | High | SAML matched by e-mail alone, default-IdP fallback for any org slug, platform-admin grant from an asserted e-mail, no auth event (P0-3, `a96fbea0`) | `POST /api/auth/sso/saml/callback` (`sso.ts:471`) with (a) an assertion from the default IdP naming organisation B's slug, (b) an assertion carrying the platform owner's e-mail, (c) an assertion whose NameID matches no membership of the configuration's organisation, (d) a replayed assertion (`InResponseTo` is `always`, IAM-18 (6)); read the auth event afterwards | (a) refused; (b) a session with no platform role; (c) refused; (d) refused; an `audit_logs` row for each attempt |
| IAM-04 (a) | High | Revocation memory shorter than the refresh lifetime; logout left the refresh token live; enterprise refresh renewed forever; password change kept other sessions (P0-4a, `613c6e00`) | `POST /api/auth/logout` (`auth.ts:1291`) then `POST /api/auth/refresh` (`:1355`) with the old refresh token; `POST /api/auth/enterprise/refresh-token` (`authEnterprise.ts:1015`) twice with the same token; `POST /api/auth/password/change` (`:2502`) from session 1 then a request from session 2 | refresh after logout `401`; the second refresh with a rotated-away token `401`; session 2 ended. **(b) `session_version` / `terminateAllSessions` remain open (§4.2)** |
| IAM-05 | High | SCIM wrote `users.status` / `users.name` globally; POST with an existing e-mail reactivated a platform-suspended account (P0-5, `423aff25`) | `/scim/v2/Users` (`scim.ts:619,696,775,879`) with organisation A's bearer against a user who is also a member of B: DELETE, PATCH `active:false`, PUT with a new name; POST with the e-mail of a platform-suspended account | B's membership and `users.status` unchanged; the rename of a shared account refused; the suspended account stays suspended |
| IAM-06 | High | No idle logoff, no lifetime, no concurrent-session limit; mints outside the session register (P1-1, P1-1 concurrency, P1-38) | any authenticated route after 16 minutes idle (default; the tenant's `sessionTimeoutMinutes`); after 12 h; the sixth concurrent sign-in for one account (default `maxConcurrentSessions` 5); `GET /api/auth/session` from the superseded session; the first-run setup token and the connector token as sessions | `401` with the idle reason; `401` at the lifetime; the oldest session `SESSION_SUPERSEDED`; every access token carries `sid`/`sst`/`idl`. **Residual (§4.2): the `tenant-config.ts` schema key for the limit; without Redis the stores are per task** |
| IAM-07 | High | Download by filename and `analyze {filePath}` with no ownership check; generated files in one directory for all tenants (P0-6, `cc1cb31a`) | `GET /api/concept2cure/documents/download/:filename` (`exports.ts:424`) with a name organisation A generated, from B; `POST /api/document-understanding/analyze` (`document-understanding.ts:476`) with `filePath` traversals and A's path from B; two tenants generating the same `<Title>_<type>_<date>.docx` | `404` for the foreign file; traversal refused; no collision (per-organisation prefix) |
| IAM-08 | Medium | Recovery codes never accepted; emailed code tried first for TOTP accounts; `/mfa/resend` minted a code for TOTP challenges (P1-2 parts 1–2; P1-38) | `POST /api/auth/mfa/verify` (`auth.ts:1650`) with a recovery code, then the same code again; a TOTP-enrolled account with an emailed code at `/mfa/verify` and at `POST /api/auth/enterprise/verify-mfa` (`authEnterprise.ts:465`); `POST /api/auth/mfa/resend` (`:1858`) for a TOTP challenge | the code accepted once, then refused; the emailed code refused for an authenticator account at both doors; no code mailed for a TOTP challenge. **Open (§4.2): the org-level "require an authenticator app" policy** |
| IAM-09 | Medium | Lockout counter read-then-write and fail-open; resend refilled guesses; `/api/v1/auth` unlimited (P1-3, `1219a144`; resend cap, IAM-18-8) | 20 parallel wrong passwords at `POST /api/auth/login`; five wrong emailed codes, `/mfa/resend`, a sixth code; four `/mfa/resend` in one challenge; the same at the `/api/v1/auth` alias (`register-platform-routes.ts:94`) | locked after 5; spent guesses kept across a re-issue; the fourth resend `429 MFA_RESEND_LIMIT` with its audit row; the alias limited as the primary. **Open (§4.2): Redis in production** |
| IAM-10 | Medium | Roles read from the JWT; a demoted admin kept privileges (P1-4, `414f203e`) | demote an admin of A through `/api/users` or SCIM, then an admin-only request with the same token (e.g. `/api/admin/*`, `register-platform-routes.ts:30`; `/api/api-keys` POST, `api-keys.ts:106`) | `403` on the next request, no re-login needed to lose the role |
| IAM-11 | Medium | Drafting `task_status` / `start_task` without a tenant predicate; stability result PATCH/DELETE by id (P1-8, `83849bfd`) | `GET /api/v1/drafting/task_status/:task_id` and `POST …/start_task` (`server/routes/misc-inline-routes.ts:452,416`) across tenants; `PATCH`/`DELETE /api/stability/results/:resultId` (`server/src/routes/stability.router.ts:2093,2133`) on B's row from A | `404` for the foreign task; in production the stability mount is `403 LAUNCH_SCOPE` (§3); white-box: the P1-8 dbtest (`docs/evidence/D6/2026-09-25-p1/P1-8/`) green, a `stab_audit` row per change |
| IAM-12 | Medium | Main namespace: query-string tokens, no membership re-check (P1-9, `901f9c9e`) | main socket (`socketServer.ts:278`): token in the query string; a member removed from A while connected; a session revoked by logout while connected | handshake refused; `session:ended` and disconnect within the re-check interval (≤ 60 s) |
| IAM-13 | Medium | Webhook delivery through a bare `fetch` following redirects and echoing bodies (P1-6, `eeaa8267`) | an automation webhook target (`server/services/automation/webhook-notifications.ts`) at a public URL that 302s to `169.254.169.254` / `10.x` / `localhost`; a target that answers 500 with a body | the redirect refused (DNS-pinned `safeFetch`, `server/utils/safeFetch.ts`); no body echoed to the tenant |
| IAM-14 | Medium | Unguarded uploads: the stability router's unbounded memory buffer; 13 → 4 baselined sites (P1-5 and two sweeps) | every §2.7 upload with the polyglot / ZIP-bomb / MIME-confusion set; the gate `npm run ci:upload-guards` read white-box | each guarded site refuses (`assertUploadSafe`, `uploadSafety.ts:178-196`) or bounds the size. **Known (§4.2): the two Authoring import sites trust the declared MIME type; the chat and vault-ingest entries are gate limits, not defects** |
| IAM-15 | Medium | Nine `x-org-uuid` header fallbacks; `X-Client-ID` trusted by the feature gate and two writers (lane `…01W5zW66` `b1618c69`; P1-7b) | `/api/ana/*` (`register-ai-routes.ts:28`), `/api/chat/*` (`:49`) and `/api/concept2cure` AI-editing with an `x-org-uuid` of B from A's session; a feature-gated route and the cerv2 save / regulatory-submissions writers with an `X-Client-ID` of B's workspace | the header ignored (the session's tenant used; `403 TENANT_MISMATCH` with an audit row where the detector applies); `403` on the foreign workspace. **Residual (§4.2): `server/routes/cortex-unified.ts:128`** |
| IAM-16 | Low–Medium | `AUTH_BOUNDARY_MODE=warn` honoured in production (P0-13a, `d7f08922`; preflight half, W2) | staging configuration record (white-box); black-box: any unlisted `/api/*` path without a token | boot refuses `warn`; `401` from the boundary for every unlisted path |
| IAM-17 | Low–Medium | Sign-up returned an admin session with no e-mail verification; no common-password check; password change unaudited; login timing revealed accounts (P1-2 sign-up, P1-2 passwords, P1-2 part 2, the password-change event) | `POST /api/auth/signup` (`auth.ts:879`): the response, then `POST /login` before `POST /verify-email` (`:1212`); a verification link used twice; `/resend-verification` for an unknown address; a password from the common list or containing the e-mail / organisation name at signup, `/api/setup`, `/password/change` and reset; `/login` timing for an unknown vs known e-mail; the audit trail after `/password/change` | no session at sign-up; `AUTH_EMAIL_UNVERIFIED` at both doors; the link accepted once; identical answers for unknown addresses; the weak password refused at all four doors; no timing oracle (the shared pad, `server/services/login-timing-pad.ts`); a `user_password_changed` row. **Open (§4.2): breach-corpus lookup (founder); `mustChangePassword` advisory** |
| IAM-18 (1) | Low | `ci:server-error-leaks` red; 147 → 120 → 119 sites carrying the caught error's text (P1-17 and its paydown) | the 5xx bodies of every §2 route the tester reaches | a static envelope with a request id, never `err.message`. **Known (§4.2): the baselined sites in `scripts/ci/server-error-leaks-baseline.json` are being paid down, not closed; report only a leak of secrets, paths or SQL** |
| IAM-18 (2), (3) | Low | `/api/metrics` readable by any user; public gateway health listing providers and echoing exceptions (P1-17) | `GET /api/metrics`, `/api/health/full`, `/api/health/jobs` (`inline-endpoints.ts:264,205,225`) anonymous and as a member; `GET /api/ai-gateway/health` and `/detail` (`:667,679`) | `401`/`403` without the scrape token or a platform administrator; health a status word, detail gated, no exception text |
| IAM-18 (4), (5), (9), (10) | Low | Impersonation detector mounted before auth; enterprise steps admitted suspended accounts; AI prefixes metered as API; `/api/ai-assistance` ungated (`50b04d99`; (4) re-checked 2026-09-26) | a request with a foreign `x-org-uuid` and a real token through the boundary; `POST /api/auth/enterprise/verify-password` and `/verify-mfa` for a suspended account; `/api/ai-assistance` (`register-core-routes.ts:130`) anonymous | `403 TENANT_MISMATCH` with an audit row naming the full `/api` path; the suspended account refused at both steps with no `user_login success`; `401` |
| IAM-18 (6) | Low | SAML session returned in a query string; `InResponseTo` `ifPresent` (IAM-18-6) | the SSO callbacks' redirect (`sso.ts:471,793`); a SAML response without `InResponseTo` | the session in the URL fragment, adopted only after `GET /api/auth/session` confirms it; the response refused |
| IAM-18 (7) | Low | 50 MB JSON parsed before auth on `/api/concept2cure` (IAM-18-7) | a 40 MB body to `/api/concept2cure/*` without a token | `401` before the body is read |
| IAM-18 (8) | Low | Login timing revealed which e-mails exist, at both doors and for null-hash accounts (P1-2 part 2 `e93c7878`; IAM-18-8) | `POST /api/auth/login` and `POST /api/auth/enterprise/verify-password` for unknown, known and SSO-only (null-hash) addresses, timed | indistinguishable (cost-12 pad) |
| DP-01 | High | A QMS document made effective by any member's POST/PATCH, the legacy transition, or the AnA tool (`e1c224f6`) | `POST`/`PATCH /api/mdx/qms/documents[/:id]` with `status: 'effective'` (`mdx-qms.ts:362,449`); `POST /api/qms/documents/:id/transition` to `effective` (`qms.ts:91`); the AnA tool `approve_qms_document` from chat | refused at all three; `effective` only through `POST /api/mdx/qms/documents/:id/approve` (`:595`) with the ceremony. **Residual (§4.2): no database constraint yet (P0-18)** |
| DP-03 | High | Revoking a signature ran an UPDATE the immutability trigger refused (P0-7, `b33ec50d`) | `POST /api/c2c/actions/revoke-signature` (`server/routes/c2c/actions.ts:813`) on a signature the tester's account made | the revocation lands (`superseded_by` set), the original row otherwise unchanged; white-box: the trigger's amended allow-list (`db/migrations/20260730_esign_audit_db_level_immutability.sql`) |
| DP-04 (part) | High | The session-settable archive bypass on `audit_logs` (P0-8a, `e8724680` sweep; `054c1764` archive door) | white-box, read-only SQL as the tester's role is not enough: the founder's W2 lane runs, in the tester's presence, `BEGIN; SET LOCAL app.audit_archive_bypass='on'; DELETE FROM audit_logs …` as `app_service` on staging | refused; the only deletion path is `audit_logs_archive_delete()` with its ledger and 24-month floor. **Open (§4.2): the `app_service` DELETE grant and the anchored chain head** |
| DP-06 (part) | High | Startup self-check for the immutability triggers; the multi-store sweep; `AUDIT_TRAIL_ENABLED` / `AUDIT_REQUIRE_ENFORCE` set in Terraform (P0-9, `e8724680`; W2) | staging configuration record; white-box: an `audit_events` row for a request the tester makes (the interceptor runs) | the flags set; rows written; the sweep covers `audit_logs`, `audit_events` and `tamper_proof_log` |
| DP-07 (part) | High | Embeddings through the gateway's placement decision (P0-11, `df479b5f`) | white-box on staging with a tenant whose residency or ZDR policy excludes OpenAI: ingest a vault document, read the gateway log | a `GatewayPolicyError`, no egress. **Open (§4.2): the Terraform key set and DPA Annex III** |
| DP-08 | High | Model output executed writes with no confirmation (P0-12 part 2; P1-34) | `POST /api/ana-ri/stream` (`stream.ts:209`) and the tools behind chat: prompt the model into `update_artifact`, `save_document_to_vault`, `update_vault_document`, `qms_change_transition`, `retire_qms_document`, `export_document`; `POST /api/ana-ri/governed-action` (`utility.ts:558`) with a forged confirmation | every write a proposal awaiting a person's confirmation; approve / retire / sign classes refused; an unclassified tool name proposed, never run (`server/services/ana/tool-authorization.register.json`). **Open (§4.2): DP-09's handler bug; prompts on the non-SSE chat paths** |
| DP-09 (part) | High | The AnA erasure command auto-ran and swallowed errors (P0-12 part 1, `8ebe3040`) | `erase_personal_data` from chat | routed to the governed GDPR path, e-signed and human-confirmed; nothing erased from chat alone. **Open (§4.2): the handler's transaction bug** |
| DP-10 (mostly) | High | The tenant purge on a pool, no legal hold, a truncated export accepted, bytes left (`2ddb77b0`) | `POST /api/tenants/:id/purge` (`tenants-simple.ts:479`, platform administrator, lent for this test on a disposable staging organisation): with a legal hold in place; with a truncated export | refused for the hold; refused for the truncated export; one transaction; bytes gone after commit. **Open (§4.2): no chained audit row; 27-table coverage; S3 old versions (P1-23)** |
| DP-11 (part) | Medium | The signed export read `audit_events` only (VR-02, `3c7fb27c` + `5eb52e22`) | `GET /api/audit/export/signed` (`audit-trail-routes.ts:668`) as an owner, then `POST /api/audit/export/verify` (`:723`) with the manifest, and with one byte changed | both stores in one stream; manifest v2 with `sources` and `auditLogsChain`; the tampered export fails verification. **Open (§4.2): the export key's `JWT_SECRET` fallback and the symmetric signature (P1-19b)** |
| DP-17 (part) | Medium | The governed sign accepted a null or free-text meaning (P1-21, `3d09bf2a`) | `POST /api/c2c/actions/sign` with no `meaning`, then with `meaning: 'because'` | `400` both. **Open (§4.2): the first-signing acknowledgement and identity-proofing record (DP-22)** |
| DP-18 | Medium | Audit reads and exports for any member; free-text event types (P1-20) | `GET /api/audit/logs`, `/events`, `/export`, `/export/signed` and `/api/audit-trail/ledger` as a viewer and a member; `POST /api/audit/events` with `event_type: 'anything'` and a 1 MB `metadata`; `/batch` likewise | `403` for viewer and member (owner, admin, manager, platform administrator pass); `400` for the unknown type and the oversized metadata |
| DP-20 (mostly) | Medium | Retention sweep unscheduled; no legal-hold API; deletion audit to a file (P1-22) | `GET`/`POST /api/vault/legal-holds`, `POST …/:id/lift` (`vault-legal-holds.ts:246-248`) as each role and across tenants; a held document past its `retention_until` when the sweep runs | holds visible and placeable only within the tenant by the roles the route allows; the held document survives; each disposition writes a chained row. **Open (§4.2): per-organisation policies** |
| DP-24 | Low | `ci:dead-audit-catch` false positive (`3625a205`) | none — a CI gate, not a door | no retest; listed so the id is accounted for |
| DP-25 | Low | Mixed clocks, no declared time source (P1-26, VMP-001 v0.2 §7a) | `POST /api/audit/events` and every signing route with a client-supplied `timestamp` / `created_at` in the body | the writer's UTC time recorded, the client's ignored (`docs/evidence/D6/2026-09-25-p1/P1-26/writers.txt`). The VMP's approval is the founder's |
| DP-26 | Low | Browser Sentry unscrubbed; server log wrote e-mail and IP in clear (P1-27, both halves) | white-box: the staging log for a request carrying an e-mail address in a path, query, body and header; the client bundle's Sentry `beforeSend` (`client/src/utils/sentryScrub.ts`, `sendDefaultPii: false`) | `a***@domain` and the network part of the IP in every log value, message and array; the scrubber present |
| DP-27 | Low | `organizations.api_key` minted with `Math.random` (P1-27) | `/api/tenants` (`register-tenant-routes.ts:51`): no route mints an organisation API key; `/api/api-keys` (`api-keys.ts:106,178,201`) as admin and as member | the mint route absent; keys hashed, scoped, admin-only creation, `503` on store failure |
| DP-31 | Medium | QMS change approved with no ceremony on either door (P1-28 `028a0c70`; P1-34) | `POST /api/mdx/qms/changes/:id/transition` with `to: 'approved'` (`mdx-qms.ts:1389`) as every role; `POST …/:id/approve` (`:1446`) without credentials, with a wrong second factor, with the ceremony; the AnA tool `qms_change_transition` to `approved` | `transition` refuses `approved` for every caller; `approve` `428` without credentials, the signature row present with them; the AnA door refused. **Known (§4.2): the HTTP `closed` transition is unsigned** |
| DP-32 (HTTP and legacy) | Low–Medium | An effective controlled document retired by a reason alone (P1-29 HTTP and legacy doors; P1-34 AnA confirm) | `POST /api/mdx/qms/documents/:id/retire` (`mdx-qms.ts:707`) with a reason alone, then with the approve ceremony; `POST /api/qms/documents/:id/transition` to `retired` (`qms.ts:91`) | `400 ESIGNATURE_COMPONENT_MISSING`; the retirement with its own digest, signature row and chained pair in one transaction; the legacy door refuses `retired`. **Open (§4.2): the AnA door's refusal (P1-29 Part B)** |
| DP-36 | High | The propose-only partition covered the command bridge only; ~40 directly registered write tools ran unconfirmed (P1-34, `aa4d5552`) | as DP-08, aiming at the directly registered tools (`save_document_to_vault`, `update_vault_document`, `file_chat_upload_to_vault`, `seed_tmf`, `save_report_definition`, the QMS tools) and at a tool name not in the register | proposals, refusals or a proposal for the unknown name; nothing written |
| DP-37 | Medium | The vault-document leaf-program lookup carried no tenant predicate; only `verifyLeafSource` stood before it (P1-35, `6ce7c30b`, lane `…01DiJJAk`) | `PUT /api/submissions/sequences/:seqId/leaves` (`submissions.ts:934`) as an author of organisation A with `documentTable: 'vault_documents'` and the uuid of a document organisation B holds; the same request with A's own document | refused for B's uuid (no leaf written, no program resolved, nothing about B's document in the body); A's own document recorded against A's program |
| DP-38 | Low–Medium | `POST /api/audit/signatures` on the organisation guard alone (P1-36) | `POST /api/audit/signatures` (`audit-trail-routes.ts:477`) as viewer, `user`, member, then owner; `GET /api/audit/chain-monitor/status` and `POST …/check` (`:757,789`) as an owner | `403 AUDIT_WRITE_RESTRICTED` before the body is read for the first three; `201` for the owner; the chain-monitor routes refuse anyone but a platform administrator and never carry error text |
| DP-39 | Low | The log mask skipped the message string and array elements (P1-37) | as DP-26 with the address only in the message, and in an array | masked |
| INF-03 | High | The task role's `s3:PutObject` on the frontend bucket removed (P0-15, W2, in Terraform) | none — AWS is out of scope (§3); the proof is the W2 lane's `terraform apply` record | no retest here; listed so the id is accounted for |
| INF-04 | High | No security headers on the SPA document (W2; a CloudFront response-headers policy) | `curl -I` of `/` and of `/api/health` through the staging distribution; frame the sign-in and signing screens from another origin | HSTS, CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (or `frame-ancestors 'none'`); framing refused. Not yet verified on a live distribution by anyone: this retest is the first proof |
| INF-07 (part) | High | IR-004 §3a notification matrix, incident log, access-review procedure, training record (P1-13) | none — documents | no retest; the vendor's report will be the first entry that exercises `docs/security/INCIDENT_LOG.md`'s neighbour, the finding log |
| INF-08 | Medium | Trivy steps skipped after an earlier failure (W2, `if: ${{ !cancelled() }}`) | none — CI | no retest |
| INF-11 | Medium | `.trivyignore` entries without expiry (P0-16a, `14639fa3`; gate wired by W2) | none — CI | no retest |
| INF-17 | Medium | Accepted-risk `*_ACCEPT_*` flags booted production (P0-13 boot refusal; W2 preflight) | staging configuration record (white-box) | none of the five flags set; the preflight refuses each (`docs/evidence/W2/2026-09-25-audit-posture-deploy/`) |
| INF-22 (eng half) | Medium | A full-history secret scan in CI (P0-17, W2) | white-box: the tester with repository access will see the historical credentials; they are known (four live history credentials, `docs/evidence/W2/2026-09-26-p0-17-history-secret-scan/`) | not re-reported; the tester does **not** test them against the third-party host. Rotation is the founder's (§4.2) |
| INF-32 | Low | `security.txt` pointed at an unserved policy and built `Canonical` from the Host header (P1-14, `ee35804a`) | `GET /.well-known/security.txt` with a forged `Host`; `GET /.well-known/security-policy` (`well-known.ts:71,88`) | `Canonical` from `APP_URL`, unaffected by the header; the policy served |

Count: **48 ids** in this table (IAM 18: IAM-01…18; DP 22; INF 8), of which 41 have a door to retest and 7 are
closed CI, Terraform or document items listed so the register reconciles (DP-24, INF-03, INF-07, INF-08, INF-11; INF-17
and INF-22 are configuration checks).

### 4.2 Known open — confirm, do not re-report

Each is a plan row with an owner. The tester confirms the state in one line and reports a **variant** only if a door or a
consequence outside the register's description is found.

| Id | Sev | Plan row | What remains open (the register's words, abridged) |
|---|---|---|---|
| IAM-02 (a)–(c) | High | P0-2 (D8 lane) | the general verifier rejects no `token_use=mcp` outside `/mcp`; `requireScope` does not read `scope`; `verifyPlatformBearer` and consent check neither revocation nor `users.status` |
| IAM-04 (b) | High | P0-4b | no per-user `session_version`; `terminateAllSessions` ignored |
| IAM-06 residual | High | P1-1 residual | the `tenant-config.ts` schema key for `maxConcurrentSessions`; without Redis the limit and the idle store hold per task (P1-3, founder) |
| IAM-08 residual | Medium | P1-2 residual | no org-level "require an authenticator app" policy |
| IAM-09 residual | Medium | P1-3 (founder) | Redis not a production boot requirement: limiters and the revocation tier are per task |
| IAM-14 residual | Medium | P1-5 residual | the two Authoring import sites trust the declared MIME type (`authoring.router.ts`) |
| IAM-15 residual | Medium | P1-7 residual | `server/routes/cortex-unified.ts:128` |
| IAM-17 residual | Low–Medium | P1-2 (founder) | no breach-corpus lookup; `mustChangePassword` advisory |
| IAM-18 (1) residual | Low | P1-17 paydown | 119 baselined 5xx sites still carry the caught error's text; ratcheting down |
| IAM-19 | Medium | P1-33 | the `/ana` socket has no periodic session re-check after connect |
| DP-01 residual | — | P0-18 | no database trigger refuses `qms_documents.status='effective'` without a signature row |
| DP-02 | High | P0-10 | 23 HTTP "sign" writers (`scripts/ci/sign-ceremony-baseline.json`) skip `reverifySigner`; the artifact approve/lock attestation is session-only |
| DP-04 residual | High | P0-8 | `app_service` still holds DELETE on `audit_logs` / `audit_events`; no chain head anchored outside the database |
| DP-05 | High | P2-10 | the API task carries the database owner URL and both HMAC keys; e-signature hashes unkeyed |
| DP-06 residual | High | P0-9 (W2) | the flags are set in Terraform, not yet verified against a live deploy |
| DP-07 residual | High | P0-11 (founder) | Terraform provisions only an OpenAI key; DPA Annex III disagrees with the stack |
| DP-08 residual | High | P0-12 | the erasure handler's transaction bug (DP-09); prompts on the non-SSE chat paths |
| DP-09 residual | High | P0-12 / P2-9 | the handler swallows query errors inside BEGIN…COMMIT |
| DP-10 residual | High | P1-23 | the purge writes no chained audit row; 611 org-keyed tables outside the 27-table set; S3 old versions never expire |
| DP-11 residual | Medium | P1-19b | the export key falls back to `JWT_SECRET`; symmetric seal an inspector cannot verify offline |
| DP-12 | Medium | P1-19b | `audit_events` seal column with no writer; its hash covers 9 fields |
| DP-13 | Medium | P1-19 | the `audit_logs` chain trigger accepts unchained rows silently; `old_values` hard-coded NULL |
| DP-14 | Medium | — | 207 fire-and-forget `logAction` sites vs 16 chained writers; 133 discarded writes baselined |
| DP-15 | Medium | P1-24 | no triggers on the domain history tables; `linkDomainHistory` uncalled |
| DP-16 | Medium | P1-24 | `authoring_signatures` protected by convention; the `concept2cure_signatures` trigger on no apply path |
| DP-17 / DP-22 residual | Medium | P1-21 | no first-signing acknowledgement, no identity-proofing record |
| DP-19 | Medium | P2-9 | data-subject export silently partial; erasure with no hold check |
| DP-20 residual | Medium | P1-22 | retention policies global, not per organisation |
| DP-21 | Medium | P1-25 | no audit-trail review workflow |
| DP-23 | Medium | P1-11 | no key id or rotation for the audit HMAC keys |
| DP-28 | Low | P1-27 | `tamper_proof_log` one global chain, no tenant column |
| DP-29 | Low | — | approved-model enforcement depends on the caller's declared task type |
| DP-30 | Low | — | project archive/delete records no reason |
| DP-31 residual | Medium | P1-34 hand-on 6 | the HTTP `closed` change transition is unsigned |
| DP-32 residual | Low–Medium | P1-29 Part B | the AnA door `retire_qms_document` is confirm-plus-reason, not a refusal |
| DP-33 | Low | P1-30 | `DELETE /api/authoring/docs/:docId` authorised by a static `x-admin-token`, no tenant predicate, actor-less audit row; contained by `ADMIN_TOKEN` being unset — the tester confirms it is unset on staging |
| DP-34 | Medium | P1-31 | `/api/qms/*` (§2.2) is a second QMS write API on `authenticateToken` alone: a viewer can retire or supersede an effective document, requalify a supplier, disposition nonconforming product, with no audit row. Exploitable at HEAD and known; the tester confirms and does not re-report |
| DP-35 | Medium | P1-32 | Authoring freeze counts as `finalized` with no re-authentication |
| INF-01 | High | P0-14 (founder) | `concept2cure-v2` unprotected; CI blocks nothing |
| INF-02 | High | P1-12 | security gates PR-only or pre-push-only |
| INF-05 | High | P1-10 | no GuardDuty, Config, Security Hub, flow logs, access logs, alarms, WAF |
| INF-06 | High | P1-10 (founder) | nothing pages anyone; no Redis, no Sentry DSN in the stack |
| INF-07 residual | High | P1-13 (founder, counsel) | the DPA's bracketed figure; the tabletop; the first access review and training completion |
| INF-09 | Medium | P1-12 | a tag deploy does not check CI for its SHA; no `trivy image`, cosign or SLSA |
| INF-10 | Medium | P1-12 | Semgrep advisory |
| INF-12 | Medium | P3-6 | floating action tags in a `contents: write` workflow; Dependabot ecosystems; base image not digest-pinned |
| INF-13 | Medium | P1-11 | `pgaudit` set but not preloaded |
| INF-14 | Medium | P1-11 | RDS on the AWS-managed key |
| INF-15 | Medium | P1-16 | single region; synthetic DR proof; RTO/RPO unmeasured |
| INF-16 | Medium | — | boot checks test secret length only |
| INF-18 | Medium | P1-11 | Secrets Manager without a CMK or rotation |
| INF-19 | Medium | P1-12 | evidence artifacts live only in GitHub |
| INF-20 | Medium | P1-12 | `cerv2-staging-deploy.yml` advisory dependency gate; force-pushed tags |
| INF-21 | Medium | P2-2 (counsel) | three disagreeing sub-processor lists |
| INF-22 residual | Medium | P0-17 (founder) | the historical credentials (four) not shown rotated |
| INF-23 | Low | — | `secret_arns` defaults to `["*"]` in the module |
| INF-24 | Low | P1-12 | `npm install` rather than `npm ci` in CI |
| INF-25 | Low | P3-5 | container rewrites its own code; no read-only root; tests in the image |
| INF-26 | Low | — | compose files: Redis without a password, `sslmode=prefer`, demo login |
| INF-27 | Low | — | committed demo credentials; hard-coded master-admin e-mail fallback |
| INF-28 | Low | P3-6 | stale deployment configurations and remote branches |
| INF-29 | Low | — | S3 gateway endpoint without route tables; KMS endpoint ineffective; RDS 15.4 |
| INF-30 | Low | — | workflow secrets interpolated into `run:`; the Neon URL in `GITHUB_ENV` unmasked |
| INF-31 | Low | P3-6 | 32 moderate advisories; unused production dependencies |
| INF-33 | Low | — | `.gitignore` covers `*.tfstate` but not `*.tfvars` |

Count: **65 rows**: 43 wholly open ids (IAM 1: IAM-19; DP 17, with DP-22 sharing the DP-17 row; INF 25) and 22
residual rows of ids that also appear in §4.1 (IAM 9, DP 11 — the DP-17/DP-22 row counted once above — INF 2).
43 wholly open plus the 48 of §4.1 is the register's **91**. DP-37 was listed open in the first draft although the
register closed it before the pinned commit (`6ce7c30b` is an ancestor of `6eeee017`); the adversarial check of this
scope caught it and it moved to §4.1.

### 4.3 The plan rows marked Closed, by id

| Plan row | State on 2026-09-26 | Ids (retest in §4.1) |
|---|---|---|
| P0-1 | closed `7c4faf2a` | IAM-01 |
| P0-2 | part (d) closed `5c10785e`; (a)–(c) open (D8) | IAM-02 |
| P0-3 | closed `a96fbea0` | IAM-03 |
| P0-4 | part (a) closed `613c6e00`; (b) open | IAM-04 |
| P0-5 | closed `423aff25` | IAM-05 |
| P0-6 | closed `cc1cb31a` | IAM-07 |
| P0-7 | closed `b33ec50d` | DP-03 |
| P0-8 | sweep half `e8724680`; archive door `054c1764`; grant and anchor open | DP-04 |
| P0-9 | startup self-check `e8724680`; Terraform/preflight flags (W2) | DP-06 |
| P0-11 | application half `df479b5f`; key set and DPA open | DP-07 |
| P0-12 | part 1 `8ebe3040`; part 2 closed 2026-09-26; re-opened in part by DP-36 and closed again by P1-34 | DP-08, DP-09 |
| P0-13 | boot refusal `d7f08922`; preflight half (W2) | IAM-16, INF-17 |
| P0-15 | closed in code (W2); `curl -I` proof waits on `terraform apply` | INF-03, INF-04 |
| P0-16 | `.trivyignore` `14639fa3`; `if:` half and gate wiring (W2) | INF-08, INF-11 |
| P0-17 | engineering half (W2: history scan); rotation open | INF-22 |
| P1-1 | closed 2026-09-26; `tenant-config.ts` key and OQ step residual | IAM-06 |
| P1-2 | recovery codes, emailed-code fallback, sign-up verification, common passwords closed; org policy and breach corpus open | IAM-08, IAM-17 |
| P1-3 | closed `1219a144`; resend cap (IAM-18-8); Redis open | IAM-09 |
| P1-4 | closed `414f203e` | IAM-10 |
| P1-5 | gate and `stability.router.ts` closed; 13 → 4 sites; two Authoring sites open | IAM-14 |
| P1-6 | closed `eeaa8267` | IAM-13 |
| P1-7 | closed 2026-09-26 (`b1618c69`; P1-7b); `cortex-unified.ts:128` residual | IAM-15 |
| P1-8 | closed `83849bfd` | IAM-11 |
| P1-9 | closed `901f9c9e` | IAM-12 |
| P1-13 | documents half closed | INF-07 |
| P1-14 | closed `ee35804a` | INF-32 (INF-21 open) |
| P1-17 | closed; paydown 146 → 119 continuing | IAM-18 |
| P1-19 | `audit_logs` half `3c7fb27c` + `5eb52e22`; P1-19b open | DP-11 (DP-12, DP-13 open) |
| P1-20 | closed 2026-09-26 | DP-18 |
| P1-21 | vocabulary half `3d09bf2a` | DP-17 (DP-22 open) |
| P1-22 | closed but for per-organisation policies | DP-20 |
| P1-26 | closed (VMP-001 v0.2 §7a) | DP-25 |
| P1-27 | `3625a205`; browser and server halves, API key closed; `tamper_proof_log` column open | DP-24, DP-26, DP-27 (DP-28 open) |
| P1-28 | closed `028a0c70` | DP-31 |
| P1-29 | HTTP and legacy doors closed; Part B open | DP-32 |
| P1-34 | closed `aa4d5552` | DP-36 (DP-31; DP-32 partial) |
| P1-35 | closed `6ce7c30b` (lane `…01DiJJAk`) | DP-37 |
| P1-36 | closed 2026-09-26 | DP-38 |
| P1-37 | closed 2026-09-26 | DP-39 |
| P1-38 | closed 2026-09-26 | IAM-02 (e), IAM-06, IAM-08 residuals |
| Open rows | P0-10, P0-14, P0-18, P1-10, P1-11, P1-12, P1-15 (this), P1-16, P1-18, P1-23, P1-24, P1-25, P1-30, P1-31, P1-32, P1-33 | §4.2 |

### 4.4 Threat scenarios that must produce a finding if they succeed

Carried from the BETA scope and widened to the catalog: cross-tenant read, write or delete through any §2 door (the
two-layer isolation is RLS under `app.rls_enforce='on'` as a `NOSUPERUSER NOBYPASSRLS` role plus the handler's own
predicate — the tester should defeat the handler and see whether RLS holds, and note where only RLS held); IDOR by
`programId`, `projectId`, `documentId`, `sequenceId`, `client_workspace_id`; JWT confusion (algorithm, `none`, the
previous-secret window, token class — `mfa_challenge`, `mfa_partial`, refresh, connector — at every HTTP and socket
door); a signature, approval, release, retirement or freeze without the ceremony (`reverifySigner`,
`server/services/part11/reverify-signer.ts`) or replayed against another record; an audit row altered, deleted, back-dated
or written with a body-supplied actor; a governed write from model output without a person's confirmation; upload
abuse (§2.7); SSRF from the connectors and webhooks; an out-of-scope module reached despite `LAUNCH_SCOPE`.

## 5. Rules of engagement

**Accounts.** The founder provisions, before kick-off, on staging: organisations A and B with owner, admin, manager,
member and viewer each; a TOTP enrolment for one account per organisation and an emailed-code-only account for another;
a SAML test IdP bound to A; a SCIM bearer for A; the vendor's OAuth client origin in `MCP_CLIENT_REDIRECT_ALLOWLIST`; a
read-only database role. The platform administrator account is the founder's; it is lent, with the founder present, for
the DP-10 purge test and the DP-38 chain-monitor check only, on a third, disposable organisation C. Every password is
rotated at close-out; SCIM and API keys are revoked.

**Data.** The default posture is "no PHI in the platform" (`docs/security/policies/POLICY-DR-007-data-retention-and-residency.md:33`)
and it binds the tester absolutely: no PHI, no real personal data beyond the test accounts' own, no real sponsor or
regulatory content. Test documents are synthetic and marked `PENTEST` in title and content. Staging is a GxP-shaped
system: its audit trail is append-only and the tester's every action becomes a permanent row; the founder snapshots the
staging database before kick-off and restores it after the retest, and the vendor's report records the UTC time of each
test so rows can be correlated. Payloads, exports, screenshots and tokens the vendor collects are handled under the NDA,
stored encrypted, and deleted 30 days after the retest letter, except what is filed as evidence (§6) with secrets
redacted.

**Coordination.** Named contacts on both sides; a private channel; a daily one-paragraph status; a Critical or High
finding reported within 24 hours of confirmation, before the report; no public disclosure; the vendor holds no access
after close-out.

**Stop conditions** (testing pauses until the founder says otherwise): any indication of reaching production or a
system not in §2; a credential outside the provisioned set found working anywhere; another tenant's real data seen (there
is none on staging, so its appearance means the environment is wrong); an availability impact on staging beyond the
tester's own accounts; a third party's system touched.

**Prohibited.** Denial of service; brute force beyond a lockout's threshold; social engineering; testing the third
parties in §3; any write to the repository, CI, Terraform or the AWS account; retaining a token or export after
close-out; testing during a scheduled staging deploy window the founder announces.

## 6. Deliverables

1. **Kick-off readout** (day 1): confirmed scope, the pinned commit, the staging configuration record, contacts, the
   NDA executed, the socket reachability decision (§2.1).
2. **Checkpoint** (end of week 1): preliminary findings with provisional CVSS, and the §4.1 rows retested so far.
3. **Final report:** executive summary; a findings table with CVSS v3.1 score and vector, the register tag (new /
   regression of / variant of), the door, reproduction steps, evidence, and a recommended fix; a §4.1 retest table with
   pass/fail per id; a §4.2 confirmation table; the §3 refusal sample; the commit and configuration tested.
4. **Retest report** after remediation: pass/fail per finding, with the commit each fix landed in.
5. **Retest letter** (the artifact the D6 row names): on the vendor's letterhead, naming the scope document, the tested
   commits, the retest date, the findings closed, and any accepted risk with the founder's written acceptance attached.
6. **Close-out attestation:** accounts disabled, data deleted, no access retained.

**Evidence retention.** Every deliverable is filed under `docs/evidence/D6/<date>-pen-test/` with a README naming the
vendor, the commit, the staging configuration record and the file list; secrets and tokens redacted before filing. The
folder is retained with the rest of the launch evidence (the compliance-evidence bucket with object lock once D1 is
applied, `terraform/modules/compliance-evidence/main.tf`; `POLICY-DR-007`). The findings become plan rows in
`REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` with owners and acceptance tests, and regressions re-open their register
id in `SECURITY_AUDIT_2026-09-24.md` §4 by amending the Status cell.

## 7. Acceptance

The plan row P1-15 reads "report and retest letter filed"; the D6 row reads "third-party pen test with findings closed".
Both are met when:

- the final report and the retest letter are filed under `docs/evidence/D6/<date>-pen-test/`;
- every Critical and High finding is remediated and passes retest, or carries a dated risk acceptance signed by the
  founder with a plan row and an owner;
- every Medium and Low is a plan row with an owner and a date;
- no §4.1 id regressed, or each regression is closed and retested;
- the disclosure surface is corrected in the same change: SIG-Lite A.5 (`SECURITY_QUESTIONNAIRE_SIG_LITE.md:18`, "No.
  None has been performed."), the trust statement's penetration-test bullet (`TRUST_STATEMENT.md:59`), and the
  commercial paper that today discloses "no third-party penetration test" (`docs/commercial/PILOT_AGREEMENT.md:214`,
  `MASTER_SUBSCRIPTION_AGREEMENT.md:204`, `PRICING.md:74`) cite the report by date.

## 8. Before the vendor starts — the pre-engagement checklist

| # | Item | Owner |
|---|---|---|
| 1 | Staging applied from `terraform/environments/staging` and `/readyz` green through CloudFront (row D1) | founder + W2 |
| 2 | `/socket.io/*` reachable for the tester (§2.1), or the report will say the socket retests did not run | founder + W2 |
| 3 | `MCP_ENABLED=true`, `MCP_CLIENT_REDIRECT_ALLOWLIST` with the vendor's origin; a SAML test IdP for A; SCIM bearer for A; `ENABLE_COLLAB_CRDT=true` | founder |
| 4 | The commit pinned and this document's §2.2 table regenerated against it (`docs/evidence/D6/2026-09-25-p1/P1-15/`); the register and plan re-read and §4 refreshed if any id moved | this lane |
| 5 | Accounts, roles, the read-only database role, the snapshot (§5) | founder |
| 6 | NDA, contacts, channel, the deploy-freeze window for staging during testing | founder + vendor |
| 7 | Vendor chosen (the BETA document's shortlist stands as the starting list; fixed fee; a retest included; prior GxP or medical-device experience) | founder |

---

*Draft prepared 2026-09-26 by the D6 lane (`session_0194UQPxy9Er2ibRAjog8Ven`) for the founder's vendor RFP. The route
inventory, the API-prefix computation and the citation check are under `docs/evidence/D6/2026-09-25-p1/P1-15/`. This
document changes no code and closes nothing; P1-15 closes when §7 holds.*

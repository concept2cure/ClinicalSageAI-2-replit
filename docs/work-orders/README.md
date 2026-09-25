# Work orders — index and session handoff

**Read this before starting work in this directory.** It exists because work on
these orders spans many sessions, and a session that starts from a fresh clone
inherits the repository and nothing else — no prior conversation, no plan file,
no task list. Everything a new session needs to avoid redoing settled work, or
repeating a mistake that has already been paid for, has to be written down here.

Last updated 2026-09-19.

---

## 0. Who is working on what — claim your lane here

Sessions cannot message each other. This table is the only coordination
mechanism, so **claim before you start and release when you stop.** Keep entries
to one line; edit only your own row to limit merge conflicts.

| Lane | Session | State |
|---|---|---|
| **D6 — P0 closures from the 2026-09-24 security audit, this session's tranche** (`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` §1). Landed on trunk, one commit per item, each red-then-green under `docs/evidence/D6/2026-09-24-p0/<item>/`: P0-1 `7c4faf2a`, P0-13a `d7f08922`, P0-7 `b33ec50d`, P0-5 `423aff25`, P0-6 `cc1cb31a`, P0-11 `df479b5f`, P0-3 `a96fbea0`, P0-4a `613c6e00`, P0-16a `14639fa3`, P0-9a/P0-8a-sweep `e8724680`, P0-12 part 1 `8ebe3040`, auth follow-ups `872c8648`, P0-2d `5c10785e`; register and plan rows carry the commits (`aadcae18`). P0-8a archive door (the session-settable bypass replaced by a SECURITY DEFINER function, ledger and enforced floor; sixteen `tests/db` teardowns converted to an owner-side trigger disable, edited inside their windows because CI's `test:db` would otherwise go red) landed as `054c1764`. **Hand-offs (files inside other lanes' 24 h windows or other lanes' scope):** wire `scripts/ci/check-trivyignore-hygiene.mjs` as `ci:trivyignore-hygiene` in `package.json` + `.husky/pre-push` (windows close 16:51 / 21:18 UTC 09-25); P0-12 every-write confirm tier (`routes/ana-ri/utility.ts`, `command-executor.ts`, `post-processing.ts`, client sign-off; design in `P0-12/README.md`) and the erasure handler's transaction bug (`command-executor.ts` ~1694); P0-18 QMS trigger (`migration-set.mjs`); P0-4b `session_version` (migration); P0-8 `app_service` DELETE grant (`provision-app-role.mjs`; `APPEND_ONLY_TABLES` should name `public.audit_logs` and `public.audit_log_archives`) and the anchored chain head; `chain.ts` verifier vs archived rows (D5 lane); `migration-set.mjs` comment still names the old setting; **W2:** `AUDIT_TRAIL_ENABLED` / `AUDIT_REQUIRE_ENFORCE` in the task definition and preflight, Trivy `if: always()`, a path-scoped `DS002` exception, P0-10, P0-13b, P0-15, P0-17 key set; **D8:** P0-2 (a)–(c); **founder:** `MCP_CLIENT_REDIRECT_ALLOWLIST` origins, P0-14, P0-17. Not touched: `routes/auth.ts` was cold by the time P0-4 landed; `environment.ts`, `terraform/**`, `.github/workflows/**`, `c2c/artifacts.ts`, `mdx-qms.ts`, `AnaToolExecutor.ts`, `audit/chain.ts` untouched | `…session_0194UQPxy9Er2ibRAjog8Ven` | **released** 2026-09-25 02:40 UTC — row **D6** (D5 for P0-7/P0-12/P0-8a); fourteen items landed, evidence index `docs/evidence/D6/2026-09-24-p0/README.md` |
| **D6 — P1 tranche from the 2026-09-24 security audit, this session** (`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` §2, cold files only, one commit per item, red then green under `docs/evidence/D6/2026-09-25-p1/<item>/`): P1-9 `server/socketServer.ts` (main namespace: membership at handshake and on a timer, token only in `auth`); P1-6 `server/services/automation/webhook-notifications.ts` (delivery through `safeFetch`, no echoed bodies); P1-3 `server/services/auth-security-service.ts`, `server/services/emailOtpService.ts`, `server/bootstrap/register-platform-routes.ts` (atomic lockout, resend keeps the count, `/api/v1/auth` behind the failures-only limiter); P1-4 `server/middleware/auth.ts`, `server/auth.ts`, `server/middleware/orgMembership.ts` (additive only: the role the membership lookup already selects rides onto `req.user`); P1-2 recovery-codes half `server/services/mfaService.ts`; P1-21 vocabulary half `server/services/part11/signature-persistence.ts`, `server/routes/c2c/actions.ts`. Not touched: `routes/auth.ts`, `authEnterprise.ts` (another lane's change merged 01:44), `startup/inline-endpoints.ts` (until 18:50), `audit-trail-routes.ts` (until 01:39 09-26), every Terraform / workflow file | `…session_0194UQPxy9Er2ibRAjog8Ven` | **claimed** 2026-09-25 03:10 UTC — row **D6** |
| **D6 — platform security audit and US/JP/EU remediation plan.** Read-only audit at `adbf2d18` by three domain auditors (identity/API; audit trail, Part 11, retention, AI; infra/CI/governance) with every finding re-read by the control tower; files: `docs/security/SECURITY_AUDIT_2026-09-24.md`, `docs/security/REGULATORY_CONTROL_MAP_US_JP_EU.md`, `docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md`, `docs/security/SECURITY_README.md` (index), `.claude/agents/security-auditor.md` (the weekly review's missing fourth lens), `docs/evidence/reviews/2026-09-24/security.md`. No code is changed; each P0 is handed to the lane that owns its files | `…session_0194UQPxy9Er2ibRAjog8Ven` | **released** 2026-09-24 — row **D6**, done in `d409114e` (+ this commit); evidence `docs/evidence/D6/2026-09-24-security-audit/`, first weekly security lens `docs/evidence/reviews/2026-09-24/`. Handed on, not edited: every P0 in `docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` §1 (three parallel lanes: identity P0-1…6/13; Part 11 substrate P0-7…10/18; cloud and pipeline P0-11/14…17; AnA P0-12), and DP-31…33 for the QMS/Authoring lanes (P1-28…30) |
| **D3 — the cortex query route's client-supplied tenant key.** `server/routes/cortexQueryRoutes.ts` (`x-org-uuid` fallback; the search branch that runs with no org predicate), measured end to end on the two-tenant fixture as its own file (`tests/db/cortex-query-tenant-header.dbtest.ts`). Evidence: `docs/evidence/D3/2026-09-24-cortex-tenant-header/`. Not `send-message.ts`'s identical fallback (the chat lane's), which is reported there, not edited | `…session_01J935DZwfFEardJCv85SJds` | **released** 2026-09-24 — row **D3**, done in `c062f4b0`; evidence as named. Handed on (not edited): `search_atoms_hybrid` broken on every from-blank install, its argument order, and `send-message.ts`'s identical fallback — under "→ Retrieval, unclaimed" below |
| **D5 — the e-signature modal's transport, and the document-lifecycle placement this session wired.** `client/src/concept2cure/hooks/useEsignature.ts`, `scripts/ci/check-unauthenticated-fetch*` (done: the shared `<EsignModal>` could verify no signer in any environment; evidence `docs/evidence/D5-ESIGN-TOKEN/2026-09-24/`). Done too: `server/routes/document-lifecycle.ts` (mounted at `/api/regulatory/documents`, so the re-verification's "`POST /api/regulatory/documents/:id/sign` records an approval with no re-auth" is THIS router, not another lane's) — signing and `advance → approved` go through `reverifySigner` with server role and signing authority, a body `signatureRef` is never cited, the gate runs before the ceremony, and every write needs `regulatory-author`; evidence `docs/evidence/D5-LIFECYCLE-SIGNING/2026-09-24/`. Not touched here, handed on below once the re-verification's skeptics finish: the artifact status route (→ `…01Wcyqbq`), the AnA vault tools (→ `…01DiJJAk`). Also owns `VAULT_DATA_ROOM_ASSESSMENT_2026-09-05.md` | `…session_01KnUGoX3g4R4FWKWGc2sTbN` | **claimed** 2026-09-24 — row **D5**; the transport half and the lifecycle signing half done; the handoff list for other lanes follows. **Later the same day, this lane's own defects from the re-baseline:** the lifecycle route's leaf-writer refusals were 500s (`4df7e138`, D5); the public API's scope test compared `/docs` with itself (`5157a08c`) and its read model reported an ingest stage nothing records (`e4ecfb26`), evidence `docs/evidence/D6-API-SCOPES/2026-09-24/`; the assessment is re-baselined (§0) and corrected in place. The recorded-provider reader is the D1 storage lane's (row above) and was not touched here. Duplicated `…01DiJJAk`'s "0% complete" fix by not re-reading its claim; yielded at merge. **Evening, from the Vault-against-Veeva mapping (`wf_7221b784-39b`):** a search hit opened the first hit's record (`431c75a8`); the data room's counts stopped at 200 silently, counted re-uploads twice and called a refusal "classified" (`docs/evidence/D2-DATA-ROOM-COUNTS/2026-09-24/`; the evidence spine's adapter now exposes `isCurrent`). **For the D1 storage lane (`…01AiwZKG`):** `server/routes/__tests__/vault-download.test.ts` was red on trunk after `7fd5d6af` because its storage mock had no `getStorageProviderFor`. It is fixed in `ecca937c` (mock only, same assertions); please check it matches your intent. |
| **D3 — the RAG pipeline's vault tenant key.** `server/services/advancedRAGPipeline.ts` (`withTenantContext` / `retrieve` only: a guard, no other line changed), `tests/db/rag-pipeline-tenant-scope.dbtest.ts`. Evidence: `docs/evidence/D3/2026-09-24-rag-pipeline-tenant/`. Not `send-message.ts` or `ana-features.ts` (their header fallbacks stay with their lanes) | `…session_01J935DZwfFEardJCv85SJds` | **released** 2026-09-24 — row **D3**, done. **Claimed late:** this row was written when the work was filed, not before it began; the file had another lane's edit within 24h (`ffc1643a`, `…01DiJJAk`, the vault arm's recall query, 16:30). This change is additive, outside that query, made on top of it, and that lane's `vault-passage-search.dbtest.ts` passes with it |
| **D3 — vault RLS's ownership and delegation inputs are writable by every tenant.** `core.get_program_org_id` resolves a program's owner from `core.programs` / `core.program_ownerships` *before* the canonical `regulatory_programs`, and `identity.can_access_program` / `can_write_program` honour `identity.org_relationships`, which has no RLS. As `app_service` with RLS enforcing, one row written in tenant A's scope reads B's vault (a planted `core.programs` row also locks B out; a self-granted delegation also writes B's documents, unseen by B). No application code writes either table, so no HTTP path is known to reach it. Files: `db/migrations/20260828_program_org_resolution_canonical.sql` (amended in place, Rule 1), the migration giving `identity.org_relationships` RLS, a new `tests/db/vault-program-ownership.dbtest.ts` on the shared fixture. Evidence: `docs/evidence/D3/2026-09-24-vault-program-ownership/` | `…session_01J935DZwfFEardJCv85SJds` | **released** 2026-09-24 — row **D3**, done: the resolver consults `regulatory_programs` first (creator amended in place), and `identity.org_relationships` is sponsor-write/party-read under FORCEd RLS. Red 4 of 6, each half shown load-bearing by its own mutation, green 6 of 6; from empty, 22 vault and fixture suites 207 of 207. Left open and recorded there: `core.programs`' `org_id IS NULL` arm (the uuid sweep's), `identity.organizations` without RLS. **2026-09-25:** the same self-grant reached the 43 tables policied through `identity.can_access_org`/`can_write_org` (ai, ectd_v4, fhir, innovation, product_master, identity.users); shown rewriting another tenant's `ectd_v4` submission before, refused after, 7/7 |
| **D2 / D6 — launch scope enforced at the API, not only in navigation.** Hand-on item 5 below, unclaimed: `moduleEntitlementGate` never reads launch scope, defaults to off, and passes every path no `apiPrefixes` entry names. `server/middleware/moduleEntitlementGate.ts` (launch-scope branch), `server/services/entitlements/launch-scope.ts`, a CI gate proving no launch or shell surface calls a refused path, and evidence in `docs/evidence/D2-API-SCOPE/`. The `MODULE_ENFORCEMENT` modes and tier logic are left alone | `…session_01E8btkB8mcLirW4rNvsMNxK` | **claimed** 2026-09-25. Landed: stage 1 (mapped out-of-scope paths answer 403 `LAUNCH_SCOPE` in production), 2a (every launch call attributed, `ci:launch-scope-api`) and 2b (unclaimed paths reported, refused only with `LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`); OQ-005 v0.6 / URS-005 v0.4 not yet executed. **Operator step left:** read the staging report, then set enforce. Evidence `docs/evidence/D2-API-SCOPE/2026-09-25/` |
| WO-15 finding 5 — `c2c_template_specs.doc_types` | `…session_01E2moDuSNSNTBqAHV5GtWoz` | **released** — fixed |
| WO-15 finding 8 — the two blind gates | `…session_01E2moDuSNSNTBqAHV5GtWoz` | **released** — fixed `b9152a016` |
| WO-15 finding 4 — `/api/design-risk` | `…session_01J935DZwfFEardJCv85SJds` | **released** — done `153481465` |
| WO-16C — discarded §11.10(e) audit-write outcomes: the `ci:discarded-audit-write` population (148 sites / 70 files on 2026-09-24), launch-path sites first. Files another lane touched in the last 24h are skipped, not raced | `…session_01E8btkB8mcLirW4rNvsMNxK` | **claimed** 2026-09-24. Measured: 25 of 148 are on launch paths; 14 converted, the client now shows a lost row; 148 → 133. Left and handed on: see *Found by the WO-16C audit-outcome lane* below |
| WO-15 finding 2 — `project_charters` 27 vs 48 columns | `…session_01E2moDuSNSNTBqAHV5GtWoz` | **released** — fixed |
| `KNOWN_UNLISTED` triage — 10 entries, 16 tables | `…session_01E2moDuSNSNTBqAHV5GtWoz` | **released** — fixed, all ten now on the applier |
| **W1 / D2** — the relations server SQL names that no provisioned database has, measured against *launch reach* (a launch-app or shell action, an AnA tool, or a boot/cron/worker path). Distinct from `…01PwLFr8`'s first-render surface sweep and `…01KiDof7`'s all-SQL guards. Evidence: `docs/evidence/W1/2026-09-24-launch-reach/` | `…session_01E2moDuSNSNTBqAHV5GtWoz` | **released** 2026-09-24 — every baselined relation classified by launch reach; the two production-reached ones fixed (enterprise onboarding intake `254f502da`, Firecrawl webhook); `ci:runtime-ddl` added (`cbe9844c1`); baseline 42 → 40. Earlier, pre-Rule-2: DEAD surfaces deleted (§7), triage corrected (§8), CMC playbook provisioned (§9) |
| AnA client-files surface — `server/services/vault/document-*`, `vault-ingest/placement.service.ts`, `server/services/ana/document-*-tools*`, `ana-session-bootstrap*`, `server/startup/document-catalog-bootstrap.ts`, `server/services/chat-uploads/*`, the retrieval-atom blocks of `server/routes/chat/upload.ts`, persona's CLIENT'S FILES section, and the lane's own tables `vault.document_catalog` / `vault.document_read_receipts` (`migrations/20260905_document_catalog.sql`) | `…session_01DiJJAkasGVrccrxjhYyjxG` | **claimed** — re-scoped 2026-09-24 under Rule 2: **row D3** (local half — RLS on the lane's two tables, which have none), evidence `docs/evidence/D3/2026-09-24-vault-catalog/`; green is **blocked** on D1 (D3's named evidence is a staging contract log). Defects in the lane's own code found in the same pass (model-governance classification, Part 11 attribution of AnA filing, unverified key_data figures) are fixed as defects with evidence under the row each touches. Also done 2026-09-24: the three items the vault re-baseline handed this lane, and the Vault's document count (URS-VAULT-004; `docs/evidence/D4/2026-09-24-vault-document-count/`). The Vault read model and surface are `…01KnUGoX`'s; the assessment's search-coverage and data-room-count findings stay with that lane, not taken here. **No toggle is turned on** — that is the founder's decision. |
| WO-3 — tenant-isolation proof: the `app.current_org_id` distribution (`orgMembership` enrichment, token mint paths) | `…session_01J935DZwfFEardJCv85SJds` | **released** 2026-09-19 — question answered, degraded path pinned; the 230-route migration itself is NOT claimed |
| IND eCTD demo path — JM's *"WO-09 Biotech IND eCTD Sequence Demo"*, **not** `WO-9-pilot-surface-lock.md` below (two work orders share the number). `server/services/ind-forms/*`, `server/routes/ind-forms.routes.ts`, `IndFormsPanel.tsx`, `AuthoringPlaceIntoFiling.tsx`, `ind-checklist-view-assembler.ts`, `scripts/seed/ga-demo.d/111-*`/`112-*`. Record: `docs/reports/wo9-phase1-ectd-unblock-2026-09-03.md` | `…session_01TtwRHmBMya3QTFCbFsBjoj` | **claimed** — row D7 (W5), evidence `docs/evidence/W5/2026-09-23-ind-ectd/`. Clicks 1–3 in human testing. Clicks 4–6 built 2026-09-23 (compile package + leaf hierarchy; named-rule dispatch readiness; next sequence, lifecycle view, eValidator report import). **Open, JM's decision:** how sequence 0000 becomes the filed prior that 0001's replace/delete bind against. **Blocked:** DTDs/ICH stylesheet (egress refused), ESG credentials, PDF/A toolchain. Record: report §19 |
| W2 / D1 — Terraform to a booting task: B1 (`DATABASE_URL` is a JSON credential), B2 (illegal RDS name), B3 (task definition lacks the preflight's variables), B5 (health check calls `wget`). `terraform/environments/production/*`, `terraform/modules/{rds,secrets,ecs-fargate}/*`. Brief: `docs/evidence/W2/2026-09-23/README.md`. B4/B6/B7 go to the founder, not defaulted | `…session_013CtPf8pjozina2nVvDYkyB` | **blocked** on the founder, with everything provable offline done and pushed (`docs/evidence/W2/2026-09-23b/README.md`): B1–B3, B5 and eight more; the first-provision path; the GitHub deploy/build roles; the compliance-evidence module; the first-apply runbook (item 5). What D1 still needs is an AWS account, DNS/ACM, secret values and the apply, plus decisions B4, B6+B7, audit trail and storage. Also blocked: the lock file's other platforms (`registry.terraform.io` refused by this session's egress). Lane stays claimed for the apply follow-through |
| W2 / D1 + D6 — B9: the ALB answers CloudFront alone (origin-facing prefix list + origin secret header), so `TRUST_PROXY_HOPS=2` records the user, and the CloudFront→ALB path works: origin certificate check, API 403/404 no longer rewritten to `200 index.html`, `/readyz` `/healthz` `/collab` `/scim/v2` the connector (`/mcp`, OAuth, `/.well-known`) routed to the ALB, deploy smoke test through the public URL and failing closed (audit SMOKE-01). `terraform/modules/{alb,cloudfront}/*`, the `smoke-test` job of `.github/workflows/deploy-aws.yml`. **Lines in the B1–B5 lane's files** (listed here for that lane, which this session had no way to message): `environments/production/main.tf` — the `alb` and `cdn` blocks and `trust_proxy_hops = 2` after `api_target_group_arn` in `ecs`; `variables.tf` — a validation inside `domain_aliases` and `cloudfront_origin_secret` appended at the end; `terraform.tfvars.example` — the secret note and `domain_aliases` | `…session_01GSjEDJLuZsEzPa9PnVg1yF` | **released** 2026-09-24 — done in code, not applied; evidence `docs/evidence/W2/2026-09-24-b9/`. Handed on: HEALTH-01's ALB half (target group `health_check.path`, `modules/alb`) to B5, whose change may edit that attribute; staging's `alb`/`cdn` composition to B8; domain, both certificates, the origin secret and `cloudfront:GetDistribution` on the deploy role to the founder |
| W2 / D1 — TRIVY-01 (July audit, P1): the deploy's `security-gate` runs a blocking Trivy IaC scan ahead of `build-push`, and on 2026-09-24 it fails on 16 HIGH/CRITICAL findings in 5 files, so no tagged deploy can reach production. Each finding fixed, or excepted at the resource with a written reason; then the advisory copy in `ci.yml` becomes blocking so the tree cannot drift back. `.trivyignore`, `infra/k8s/bff-with-predicate-shadow.yaml`, `terraform/bootstrap/*`, `terraform/modules/{alb,cloudfront}/*`, the config-scan step of `ci.yml`; in `terraform/modules/ecs-fargate/main.tf` one comment line on the task egress rule | `…session_01GSjEDJLuZsEzPa9PnVg1yF` | **released** 2026-09-24 — done for the 16 findings it had (evidence `docs/evidence/W2/2026-09-24-trivy/`); the backends' `encrypt = true` removed in `environments/{production,staging}/main.tf` (one line each). Went red again on `7925a33d3` (vault bucket, AWS-0132 ×2); that lane fixed it in `2fe4ec4b2`, the scan exits 0 on trunk, and `ci.yml`'s copy now blocks. Founder decision: a WAF on CloudFront (AWS-0011) |
| W2 / D1 + D6 — SMTP in the stack: login OTP is mandatory second factor and the server says "NO user can log in" without SMTP, but `terraform/stack` carries no SMTP setting and the deploy preflight requires none, so a deploy would boot, read ready, and admit nobody. `terraform/stack/{variables,main}.tf` (SMTP variables; two `module.secrets` entries; SMTP names appended to `boot_environment`/`boot_secrets`, not the vault lane's lines), the preflight's `for VAR in` list in `deploy-aws.yml`, the roots' pass-through (`environments/*/{main,variables}.tf`, tfvars examples) | `…session_01GSjEDJLuZsEzPa9PnVg1yF` | **released** 2026-09-24 — done, not applied: the stack carries SMTP (port 465 only: the mailer requires TLS on no other), the preflight refuses a task definition without it; evidence `docs/evidence/W2/2026-09-24-smtp/`. Founder: provider (SES suggested), verified sending domain, credentials, then `npm run pilot:verify-otp` to a real inbox |
| W2 / D1 — production as configured: two API tasks + a worker from one image, no Redis, no sticky sessions, only the environment `terraform/stack` renders. What breaks for a client that no single-process test shows: state held in one task's memory (sessions, sign-in codes, locks, collab documents, run control), schedulers running on every task, files written to one task's disk, environment the app reads that the stack never sets, binaries the image lacks. Audited by a multi-agent sweep with adversarial verification; each confirmed defect fixed failing-first in its own change, or handed to the lane whose files it is in | `…session_01GSjEDJLuZsEzPa9PnVg1yF` | **claimed** 2026-09-24 — evidence `docs/evidence/W2/2026-09-24-multi-task/` |
| **Launch-catalog review follow-through (D2/D5/D6)** — the 2026-09-22 periodic review's OPEN findings (`docs/evidence/reviews/2026-09-22/`): status each at HEAD, then fix the open, unclaimed ones failing-first (Part 11 #2 QMP audit, #3 contradiction-resolution audit, #4 release-signature manifestation, #5 server-side reason-for-change, T2 task-write authority). T1 (discarded task-ledger outcome) is WO-16C's and is not touched. Also: an adversarial pass over the 54 governed files added 09-19→09-24; findings inside another lane's files are written up here for that lane, not edited. Files another lane touched in the last 24h are skipped. Evidence: `docs/evidence/reviews/2026-09-22/follow-through/` | `…session_01WcyqbqWn6LszBqUWUSNnqA` | **claimed** 2026-09-24. **Handed off, not edited — trunk CI is red on the ESLint warning ratchet (6434 > 6431, +3)** at `7ac08e800`; `--since 019afa70d` names them: package-spine `af6440e98` +2 (`ectd/package-sequence-lifecycle.ts:190` `planSequence` 127 lines; `ectd/package-leaf-bytes.ts:105` `packageLeafBytes` complexity 22), Q3A `3f934764d` +1 (`cmc/__tests__/stability-source.test.ts:164` 109-line arrow). Lint red skips Build and Release Evidence on every trunk push. Pre-push gates lint errors only, so each lane can reproduce with `node scripts/ci/check-eslint-warning-ratchet.mjs --since <its base>`. P4 is fixed in both halves: the server change, and EctdCompile.tsx once it had gone 24h untouched. P5, P6, P7 and V1 are open. P5 and P6 wait on claimed lanes' windows (authoring.router.ts, `…01AiwZKG`, until 09-25 00:58; DocumentWorkbench.tsx, `…01T2wooC`, until 09-25 16:37). **For `…01KnUGoX` (Projects, row D2):** P7, the activity feed that shows `User <id>`: projects.ts :1283 needs a users join, and ProjectHome :1063. **For the AnA lane (`…01DiJJAk`):** V1, Vault filing that sends no reason (Vault.tsx :1358/:1382/:1395; project-vault /file). Plan: `follow-through/README.md`. **New-code audit 2026-09-24:** #1 fixed here: a QMS SOP could be made effective with no e-signature, via the AnA tool, `/api/qms/.../transition` and the mdx-qms create/PATCH. The register now signs through `EsignModal`. #3 fixed (batch leaf pin verdict). #2 is next in this lane. **For the AnA lane (`…01DiJJAk`):** #5 (model-gate field regex), #9 (file-to-vault orphan) and #13 (default M2; `FileToVaultDialog` folder). **For D8:** #6 (the MCP token path skips account standing). Details: `docs/evidence/reviews/2026-09-22/follow-through/README.md`. **P1-28 / DP-31 done 2026-09-25:** a QMS change is approved only through the signed `POST /api/mdx/qms/changes/:id/approve`. `transitionChange` refuses `approved` for every caller, and ChangeControl has Approve via `EsignModal`. **For `…01AiwZKG`:** update the `qms_change_transition` description (AnA cannot approve) and the stale `SegregationOfDutiesError` comment in its handler. **2026-09-25:** P5, P6, P7 and Q1 were fixed by `…01FSu2RL`; nothing in this lane's list is open. **For WO-16C (`…01E8btkB`), who holds `c2c/artifacts.ts` until 19:05 UTC:** after `42eb291d6` an artifact edited during review can never be approved, because the assign route never opens a new round and the decision route refuses a second decision. Fix: open round `latest + 1` when the latest round's decisions carry another `version_reviewed` (details in `follow-through/README.md`). |
| Package-model spine — sequence lifecycle and FDA acceptability of what `POST /api/submission-ops/packages/:id/assemble` → `executeGovernedTransmit` files: `server/services/ectd/{package-sequence-lifecycle,leaf-pdf,package-leaf-bytes}.ts`, the assemble route's lifecycle block, governed-transmit's filed-sequence record. Not the IND demo lane's files; `…015weqdG` has also worked this spine unclaimed, so each file's last-24h history is checked before an edit | `…session_01LjrcEe8y3zUQxwX91zzTaM` | **claimed** 2026-09-24 — row **D7** (W5). Lifecycle work filed: `docs/evidence/W5/2026-09-24-package-spine-lifecycle/`. Next: an adversarial pass over what this spine hands FDA, fixes failing-first, evidence under the same row |
| **D6 — tenant offboarding: the purge.** The "→ tenant offboarding, unclaimed (D6)" findings in `server/services/tenant/tenant-offboarding.ts` and the receipt write in `tenant-full-export.service.ts` / `routes/tenant-export.ts`: the purge's transaction on a Pool; a truncated export authorizing a full purge; no legal hold consulted; stored object bytes left behind. Proof on a deploy-shaped PostgreSQL 16. Not the data return's missing bytes (a design question, reported). Evidence `docs/evidence/D6/2026-09-24-purge/` | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-24 — done, each shown failing first (3/11 → 11/11): one transaction on one client (a part-way failure had already destroyed the vault records), legal holds refuse, only a complete export authorizes, the bytes are erased after commit. Open: the data return's bytes (founder), legacy-path and rendered-leaf bytes |
| **D4 / D2 — retrieval returns rows.** The "→ Retrieval, unclaimed" findings: `search_atoms_hybrid` fails on every from-blank install (json vs jsonb), so every Authoring AI draft is ungrounded; `enhancedEmbeddingService.searchHybrid`'s argument order. The creating migrations are amended in place (Rule 1); the callers are read, not rewritten. Proof on a deploy-shaped PostgreSQL 16 + pgvector. Evidence `docs/evidence/D4/2026-09-24-atom-search/` | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-24 — done: both findings, plus a third found behind them (project crowd-out), each shown failing first |
| **W2 / D1 — vault bytes outlive a task.** The "→ W2 (D1)" findings below: the storage provider (`S3StorageProvider.get` past 1000 keys; an unrecognised `STORAGE_PROVIDER` falling back to local), the byte reader's recorded-provider handling, the preflight requiring durable storage, and the vault bucket + task env in `terraform/stack` (new `vault_storage.tf`; the `ecs` env block only). Not the OIDC role or pipeline outputs (`…013CtPf8`). Earlier today, unclaimed and now recorded here: B8 staging stack, RDS CA bundle, document-fidelity F-34..F-40 | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-24 — row **D1**. Done, each shown failing first (`docs/evidence/W2/2026-09-24-vault-storage/`): S3 could not load in the ESM bundle; lookup stopped at 1000 keys and read errors as missing; an unknown provider fell back to local; production booted with no durable store; the stack had no bucket and the preflight required none. `/readyz` reports the store; readers open the store each row recorded (`getStorageProviderFor`), to …01KnUGoX's spec. Open, not done: the backfill script in the image |
| **W2 / D1 — a blank database installs again.** `scripts/db/install-fresh.mjs`, and `019_gcc_idempotency_ratelimit.sql` (amended in place): the installer's closing coverage gate flagged the child tables that `20260813_child_table_parent_scoped_rls.sql` scopes, and only `deploy-migrate` applied that file. Every install from blank has exited 1 since `2ddbfb6a6`: 80 tables, and 83 after `d46d52515`. CI Blank DB, Integration Tests and Boot Smoke provision that way | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-24 — row **D1**. Done: the installer applies the uuid half of the final sweep pair, then the child scope, each from its own file. The dead `audit.request_correlations` is no longer created. Red exit 1 at both trunk heads, green exit 0, and the final policies in every schema are identical to trunk's path (`docs/evidence/W2/2026-09-24-install-child-scope/`). Four findings handed on below |
| **W2 / D1 — the deploy halves of security-plan P0-9 and P0-13.** `terraform/stack/main.tf` `boot_environment` (`AUDIT_TRAIL_ENABLED` and `AUDIT_REQUIRE_ENFORCE`, both `true`), the `deploy-aws.yml` preflight step (requires both, and refuses any `*_ACCEPT_*` override), `tests/boot_contract.tftest.hcl`, and `scripts/ops/terraform-preflight-proof.mjs` if its proof needs a case. Not the rest of the preflight (TRIVY-01 and SMTP rows are other lanes') | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-25 — row **D1**. Done: Terraform sets both flags, the preflight requires them and refuses every `*_ACCEPT_*`, and the CI boot smoke boots that posture. Proof red, then green; four preflight mutants refused; the bundle boots ready in that posture (`docs/evidence/W2/2026-09-25-audit-posture-deploy/`) |
| **W2 / D1 — security-plan P0-15.** `terraform/stack/main.tf` (`s3_bucket_arns`), `terraform/modules/cloudfront` (a response-headers policy on the SPA behavior), `modules/ecs-fargate/outputs.tf`, `tests/boot_contract.tftest.hcl` | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-25 — row **D1**. Done in code: the task role cannot reach the frontend bucket, and the SPA gets HSTS, nosniff, DENY and a framing CSP. Red twice, then green 22/22 (`docs/evidence/W2/2026-09-25-p0-15-task-role-and-site-headers/`). The `curl -I` check waits on `terraform apply` |
| **W2 / D1 — security-plan P0-16, the `if: always()` half (INF-08).** The four Trivy steps in `ci.yml` / `deploy-aws.yml` and a contract test | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-25 — row **D1**. Done: `if: ${{ !cancelled() }}`; contract test red 2/2, then green (`docs/evidence/W2/2026-09-25-trivy-after-failures/`) |
| **D5 — AnA's task writes commit their ledger row with the change.** The WO-16C hand-on ("Found by the WO-16C audit-outcome lane" item 1): `server/services/ana-ri/command-executor.ts` `mirrorProjectTaskToUnified` and `updateTask`'s mirror block only, so the `unified_tasks` write and its `task.create` / `task.transition` row commit or roll back together. Not the rest of that file | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-24 — row **D5**. Done: `boardWriteWithLineage`; red 2/4 without it, green 4/4 (`docs/evidence/D5/2026-09-24-ana-task-ledger/`) |
| **D5 — AnA's QMS change-control and governed-fact tools report their audit row.** WO-16C hand-on item 2: `AnaToolExecutor.ts` `qms_change_create` / `_transition` / `_link` (`void auditService.logAction`), and the two discarded writes in `server/services/living-record/fact-change-orchestrator.ts` that `establish_governed_fact` / `apply_fact_change` and `routes/change-propagation.ts` answer. Those tool handlers only, not the rest of `AnaToolExecutor.ts` | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-25 — row **D5**. Done: red 4/14 and 6/6 without, green after (`docs/evidence/D5/2026-09-25-ana-governed-tool-audit-outcome/`). `check_consistency` done the same day: headers on the route, `auditTrail` on the tool |
| **W1 / D2 — AnA's progress and output record, one in every host.** `client/src/concept2cure/v2/{AnaWorkPanel,AnaWorkSections,anaWorkModel,AnaActivity,AnaOutputs,workDock}.tsx?`, `components/ana/{anaProgress,useAnaChat*}`, `server/services/ana/{turn-plan,turn-context-used}.ts`; also `hooks/useChatUpload.ts` (`composeTurn`), `server/services/ana/tool-trace.ts` (`refusalOf`). Evidence: `docs/evidence/W1/2026-09-24-ana-progress/` (live run in `live/`) | `…session_01T2wooCZu46W7msw4TJuuzr` | **claimed** 2026-09-24 — pushed: the record in all five hosts, the plan persisted with the turn, five in-catalog AI waits; third pass: uploads by id from every composer, auditor fixes, a refused tool no longer reported as success, all verified on the running app. PDF bytes still gated by `ANA_ENABLE_PDF_INTAKE` (founder's call) |
| **D3 — atom search takes its tenant from the session, or does not run.** `enhancedEmbeddingService.searchHybrid`'s no-org branch ranks every tenant's `lumen_data_atoms` wherever RLS is not enforcing, and since the D4 fix (`881680d73`) it returns rows: Authoring's AI draft (`authoring.router.ts`) and deep research (`deep-research.ts`) call it with no key at all, `evidence-ask.ts` with an optional one. Also the nine client `x-org-uuid` fallbacks the D3 RAG row left to "their lanes", none of which is claimed: `ana-features.ts` ×5, `c2c/ai-editing.ts` ×2, `chat/send-message.ts` ×2. One scope-derived resolver in a new `server/db/currentTenant.ts`; cortex's local `sessionOrgUuid`, the derivation inside `advancedRAGPipeline.assertCallerTenantIsSession` (those lines only) and the unused `utils/tenantContext.getSecureOrgUuid` move onto it. Two-tenant dbtest, RLS on and off. Evidence: `docs/evidence/D3/2026-09-24-atom-search-tenant-key/` | `…session_01W5zW66wy5szuFwRQYUKmkE` | **released** 2026-09-24 — row **D3**, done; evidence as named (the old service served tenant B's atom to tenant A with RLS off; the fix holds with it off, 18/18). Recorded there, not edited — each an open finding for whoever takes it: six callers pass their similarity threshold as `semanticWeight`, so nothing filters by it; `ai-editing.ts` and deep research still show a failed retrieval as "no sources"; `middleware/tenantAuth.ts` admits by `x-tenant-id` header when there is no JWT user |
| **D4 — the approved-model gate's free-text classifier sees only the field names it already knows.** The "For the model-governance lane" hand-on below: `FREE_TEXT_FIELD` is a fixed name list and the "every tool with a free-text input is classified" test draws its population from the same list, so a tool storing model-written prose under any other name (`summary`, `purpose`, `rationale`…) is never gated and never flagged. The population is re-derived from the schema, not the name list; every tool it surfaces is classified from its handler. `server/services/ana/governed-write-tools.ts`, `server/services/ana/__tests__/governed-write-gate.test.ts` only. Evidence: `docs/evidence/MODEL-GOVERNANCE/2026-09-24-free-text-classifier/` | `…session_01P7hJNw5CGQ3YC1p2QXuzzB` | **claimed** 2026-09-24 — row **D4** |
| **D3 — the child scope runs after every table and parent policy the set creates.** Handed-on items 1 and 4 below ("Handed on by the install child-scope change"): `20260813_child_table_parent_scoped_rls.sql` runs mid-set, before the uuid half of the final pair policies `regulatory_harmonization.export_jobs`, and before every file a new migration is inserted as, so a child is unscoped until the second deploy. It moves into the isolation tail. Files: the entry's position and comment in `scripts/db/migration-set.mjs`, the tail check in `scripts/ci/check-migration-set-order.mjs`, the pair expectation in `tests/schema-contract/{uuid-tenant-isolation,c48-stage1-identity-org-bridge}.contract.test.ts`, a coverage check after the first deploy in `ci.yml`'s Blank DB job, and this lane's L201–L203 evidence and ledger text (the atom-search attribution). Evidence: `docs/evidence/D3/2026-09-24-child-scope-first-deploy/` | `…session_01GyGhjgjrNvxgwH4JhTMRZX` | **claimed** 2026-09-24 — row **D3** |
| **D8 — the connector admits accounts that are out of use, and its tokens open the whole API.** Review finding #6 and the D6 audit's P0-2 / IAM-02 parts (a) and (c): `verifyPlatformBearer` (the connector's one verifier, also the consent POST's) reads neither the revocation list nor `users.status`, and the code and refresh exchanges re-check membership only, so a suspended or deprovisioned account's refresh token mints access for 30 days; a connector-issued token is `type:'access'`, so `/api/*` and the sockets accept it as a full session whatever scope was consented. The canonical checks (`isTokenRevoked`, `isAccountActiveBeforeTenant`) are reused, not copied. `server/mcp/auth/{platform-token,provider,consent}.ts`, `server/middleware/tokenType.ts` (the token-class rule), `server/mcp/__tests__/*`, a new `server/mcp/__tests__/mcp-account-standing.dbtest.ts`. Not P0-2 (d), dynamic client registration (a founder decision, reported); (b) `requireScope` is reported, not edited. Evidence: `docs/evidence/D8/2026-09-24-account-standing/` | `…session_01JNRgCKWRqqJxZ1cJCyxoor` | **claimed** 2026-09-24 — row **D8**. **Widened 2026-09-25, same row:** driven over HTTP as the production runtime role, the connector cannot issue or read any grant — `mcp_oauth_authorization_codes`/`_refresh_tokens` are under the tenant sweep and `server/mcp/auth/store.ts` touches them in the pre-auth scope, so consent answers 500 ("new row violates row-level security policy") and no client can connect. The existing connector dbtest runs as a superuser and never drives consent. `store.ts` is added to this lane. Not `server/mcp/{config,index}.ts` (D6 P0-2d, `5c10785e`, last 24h) |

If you are one of the sessions above, correct your own row. If a lane you want
is claimed, take the next unclaimed finding in §3 rather than duplicating it.

### Found by the vault re-baseline (`…01KnUGoX`) — confirmed, handed on, not edited

A re-verification of `VAULT_DATA_ROOM_ASSESSMENT_2026-09-05.md` against HEAD
after 394 commits (14 section verifiers, each overturned or upheld by an
adversarial skeptic; 2026-09-24). Every item below was upheld by its skeptic.
Items in this lane's own code are fixed in this lane, not listed here.

**→ `…01Wcyqbq` (launch-catalog follow-through, D2/D5/D6)**
- `server/routes/c2c/artifacts.ts` status route writes Part 11 'approval'/'publish' signatures to `concept2cure_signatures` from the session alone (no re-verification); the printed signer name falls back to 'unknown'; the signature is not atomic with the status change and is skipped silently when no version row exists; the removal note and its pinning test say this router writes no signature substrate (false). The seal-verified route persists a client-supplied `signerRole`.
- AnA `approve_qms_document` makes a QMS controlled document effective with no password/MFA, no signing-authority and no self-approval check; the QMS router accepts `status: 'effective'` directly on create and patch; three paths bypass the signed approval; two parallel QMS document-control backends, the guarded one unreached.
- `AUTH_BOUNDARY_MODE=warn` is honoured in production: one env var turns default-deny off with an info log.
- Submission Center shows a passing Validation gate when the readiness read fails.

**→ `…01DiJJAk` (AnA client files, D3)**
- ~~The AnA vault write tools (`file_chat_upload_to_vault`, `place_project_document`) carry no org-role gate: a viewer writes the vault through AnA.~~ **Done 2026-09-24:** the role check now sits in `ingestVaultDocument` / `placeVaultDocument` (`server/services/vault/vault-write-authority.ts`), on the tenant scope's `organization_users` role. Evidence: `docs/evidence/D3/2026-09-24-vault-write-role/`.
- ~~The vault passage tool refuses on two AnA entry points that never pass `organizationUuid`.~~ **Done 2026-09-24:** `executeAgenticLoop` fills it from the same-tenant request scope, which covers deep investigations. The realtime `/ana` namespace opens no tenant scope at all and has no client; that is reported, not fixed. Evidence: `docs/evidence/D4/2026-09-24-passage-search-entry-points/`.
- ~~AnA's Vault screen context reports uploaded files as "0% complete" (the surface itself was fixed to show no percentage, `28324fdf`).~~ **Done 2026-09-24:** an upload's `pct` is `null` on the server and in the client type, and the published context says `percentComplete: null` for an upload. Evidence: `docs/evidence/D4/2026-09-24-vault-upload-completion/`. (`…01KnUGoX` had fixed the same defect locally in `3b525ea9` without re-reading this claim; it yielded to this change at merge. What it adds: a search-hit selection is pinned too, in `vaultSurfaceLabels.test.tsx`.)

**D1 migration replay — NARROWED (done, `…01KnUGoX`, 2026-09-25, `docs/evidence/D1-MIGRATION-CHECK-REPLAY/2026-09-25/`).** Three CHECK constraints broke every deploy after the first row their later widening admits. The earlier file's unconditional `DROP`/`ADD` is replayed and validates rows against its narrower list: span-lineage kinds (`20260907` over a `machine_draft` span), `c2c_documents` doc types (`20260806b` over an EU MDR/IVDR document), and orchestrator run status (the store port over an `awaiting-signature` run). Each was amended in place, guarded on `pg_get_constraintdef`, and reproduced red → green on PGlite (`tests/schema-contract/check-constraint-replay.pglite.test.ts`). `ci:migration-drop-safety` gains the NARROWED mode (selftest 12/12, 4/12 against the old gate), and CLAUDE.md RULE 1 gains the corollary. Not the W2 `B4` above: a different finding.

**Vault / data room — Veeva parity plan (`docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`).** Twenty slices (VR-01…VR-20), each with its launch row, owner notes and tests-first list, and twelve founder decisions (FD1…FD12) no session may take. **Done: VR-01** (`docs/evidence/D5-VAULT-HISTORY/2026-09-24/`), **VR-02** (`docs/evidence/D5-SIGNED-EXPORT-AUDIT-LOGS/2026-09-25/`) and **VR-03** (`docs/evidence/D5-LIFECYCLE-APPEND-ONLY/2026-09-25/`): the lifecycle trail only grows, signatures are written once, and nothing is deleted (enforced by a trigger, `migrations/20260925_canonical_documents_append_only.sql`); the verifier recomputes hashes; a revision ends the review round; transitions are serialized under a row lock (two concurrent → one 200 + one 409 on real PostgreSQL, where HEAD gave 200 + 200). **Hand-off to the D6 lane (`…0194UQPx`):** add `canonical_documents_guard_row` and `canonical_documents_guard_truncate` (source `migrations/20260925_canonical_documents_append_only.sql`) to `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS` in `server/services/audit/audit-immutability-triggers.ts`; not edited here, as it is inside that lane's 24 h window. **Fixed for the D1 storage lane (`…01AiwZKG`):** two vault-leaf assembly suites were red on trunk after `7fd5d6af` (fixture lacked `storage_provider`, mock lacked `getStorageProviderFor`); `b99f98cf`, fixtures only. VR-02 is the first half of security plan **P1-19** (the export reads `audit_logs`); the KMS signature and export key-id halves remain for the Part 11 substrate lane. **Claimed by `…01KnUGoX`, in order: VR-01** (every Vault download joins the sequenced audit chain, and a document shows its own history; D5), **VR-02** (the signed audit export contains the Vault's events; D5), **VR-03** (done, above). Slices that touch another lane's files (VR-05, VR-08, VR-11, VR-14) are proposed to that lane here before any edit.

**→ `…01DiJJAk` (AnA client files), from `…01KnUGoX`'s Vault-against-Veeva mapping, 2026-09-24**
- The vault view a document was filed under is not stored with the filing. `resolveVaultView` runs per read and falls back to the service view on any error, so a filing made under one view can land in a folder the next read's view does not have. The read side now shows such documents rather than dropping them (`docs/evidence/D2-VAULT-CABINET-OTHER-VIEW/2026-09-24/`). Recording the view belongs in `placeVaultDocument` and the ingest, which are your files.
- A same-hash re-upload rewrites the row's governed metadata (classification, retention policy, title, lineage, storage pointer) without recording the old values (mapper evidence: the ingest's ON CONFLICT DO UPDATE). For an immutable record, that path must either refuse a metadata change or write it as an audited event.

**→ D3, unclaimed**
- ~~The cortex vault Q&A route takes its tenant key from the client's `x-org-uuid` header, and both its SQL predicate and RLS trust it.~~ **Done 2026-09-24 (`c062f4b0`, row D3):** worse than stated — mounted under `cortex-unified`, whose `extractTenantContext` drops `organizationUuid`, the header was the ONLY key the handler used, and no header ran an unfiltered search. For the atom corpus RLS contained it; **for the vault corpus it did not** — generate/advisory modes hand the uuid to the RAG pipeline, which wrote it into the GUC vault RLS reads (the re-baseline's wording was right; corrected same day, see `docs/evidence/D3/2026-09-24-rag-pipeline-tenant/`). The key now comes from the session only; no usable org is a 403. Evidence: `docs/evidence/D3/2026-09-24-cortex-tenant-header/`.
  - *For that lane, from `…01KnUGoX`, found at HEAD but not measured:* `server/routes/ana-features.ts` has the same `tenantContext?.organizationUuid || req.headers['x-org-uuid']` fallback at five POST routes: `/citations/run` (:2360), `/citations/projects/:projectId/batch-run` (:2597), `/submission-chat/stream` (:4879), `/submission-chat` (:4952), `/authoring-plan` (:5037). At `/citations/run` the value reaches `ragPipeline.retrieve({ organizationUuid, artifactScope: { projectId, organizationUuid } })` (`services/ana/citation-engine.ts:383-428`), where the project id is the tenant's own. Whether a foreign uuid retrieves anything depends on how the retrieval arms combine the two, and on when `tenantContext` lacks the uuid (the re-baseline found a structural path for `tenantContext` readers). Neither is measured here. The file is not edited here.
- ~~The vault context-expansion (small-to-big) query has no org predicate and relies on RLS alone; it runs by default for regulatory_qa and foresight.~~ **Done 2026-09-24 (row D3, `…01J935DZ`; claimed only when filed — recorded, not hidden):** worse than stated, and one level up. The RAG pipeline wrote its *caller's* `organizationUuid` into `app.current_org_id`, the GUC vault RLS reads, and used it as the vault arm's predicate too, so a caller passing another tenant's uuid read that tenant's vault **with RLS enforcing** (shown as `app_service`). `advancedRAGPipeline.ts` now refuses, inside a tenant scope, a uuid or org id that is not the session's, also when the scope carries no uuid. The context-expansion query's RLS is now keyed on the session, so it gets no predicate of its own. System scope still trusts its caller. This also closes the `ana-features.ts` `/citations/run` question below for request-scoped callers. Evidence: `docs/evidence/D3/2026-09-24-rag-pipeline-tenant/`.
- ~~Authoring file-to-vault (`e0f99d3c`) writes `vault.documents` without `requireEditorAccess`: a viewer can write.~~ **Closed 2026-09-24 by the client-files lane** at the shared service (same evidence as above): the viewer is refused 403 at ingest, after a render that writes nothing. The route itself still has no gate of its own; adding `requireEditorAccess` there would refuse earlier, and that is the authoring lane's call.

**→ `…01LjrcEe` / `…01TtwRHm` (D7)**
- Vault leaves are exempt from the approval ('finalized') transmit gate: an unapproved upload can be placed and transmitted.
- AnA `place_into_sequence` cannot file a vault document, and its description says vault is unmaterializable.
- Two vault byte readers: the eCTD resolver reads through the provider only; `readVerifiedVaultBytes` falls back to the legacy path.

**→ W2 (D1)**
- The in-repo production deployment writes vault bytes to per-task ephemeral disk: two Fargate tasks, no `STORAGE_PROVIDER`, no vault bucket, and the deploy preflight does not require one. An unrecognised `STORAGE_PROVIDER` value falls back to local silently.
- `S3StorageProvider.get` cannot find objects past the first 1000 keys.
- The byte reader ignores the recorded provider; there is no local-to-S3 migration path, and `scripts/backfill-vault-storage.mjs` (runnable since `eaedc4d1`) is not in the production image.
  - **Done 2026-09-24 (`…01AiwZKG`):** `readVerifiedVaultBytes` (download and eSTAR) and the eCTD resolver's vault branch open the store the row recorded. A `local` row is served while S3 is configured, another org is still refused, and an unimplemented or unopenable recorded store is `STORED_FILE_UNREADABLE`, without asking the configured store (`docs/evidence/W2/2026-09-24-vault-storage/`, R6). The spec, as left:
  - *From `…01KnUGoX`, which wrote a red test for this, then withdrew it on seeing the claim above:* mint with the real `LocalStorageProvider`, set `STORAGE_PROVIDER=s3` with no bucket (the S3 provider cannot even be built), and `readVerifiedVaultBytes` on a row recorded `local` answers `STORED_FILE_MISSING`. It should serve the bytes, still refuse another org, and refuse a recorded name this server does not implement rather than ask the configured store. The readers of a `vault.documents` row are `readVerifiedVaultBytes` (the download route and `estar-attachment-plan.ts`) and the vault branch of `leaf-source-resolver.ts`; none selects `storage_provider` today. **Not solvable from the row:** `rendered_leaf_files` and the AI-action handlers (`ocr-extract-text`, `extract-template-from-upload`) hold a bare version id with no recorded provider at all.

**→ tenant offboarding (D6)** — **four of these done 2026-09-24 (`…01AiwZKG`, `docs/evidence/D6/2026-09-24-purge/`): the Pool transaction, the truncated export, the legal hold, and the stored bytes. Still open: the data return carries no document bytes.** Originally: see `docs/evidence/D6-EXPORT-COVERS-PURGE/2026-09-24/` §"Not done": the purge erases vault records and chunks but not the stored object bytes (its own "HONEST SCOPE" comment says so; the assessment had marked this CLOSED), the purge's transaction runs on a Pool, a truncated export authorizes a full purge, no legal hold is consulted, the return carries no document bytes. Legal holds cannot be placed or lifted through the product at all, and retention destruction is audited to a local file, not the Part 11 chain.

**→ Retrieval, unclaimed (D2 / D4) — found by the cortex tenant-key lane (`…01J935DZ`), not edited**
- ~~`search_atoms_hybrid` cannot return a row on any installation built from empty:~~ **Done 2026-09-24 (`…01AiwZKG`, evidence `docs/evidence/D4/2026-09-24-atom-search/`):** two type casts in the creating migration, amended in place; a second mismatch (`real` keyword score) was found behind the first. Original finding: it declares `structured_data jsonb`, `lumen_data_atoms.structured_data` is `json`, and every call fails — even on an empty table — *"Returned type json does not match expected type jsonb in column 5"* (`docs/evidence/D3/2026-09-24-cortex-tenant-header/red/search_atoms_hybrid-type-mismatch.txt`). Callers on launch paths: Authoring's AI draft (`authoring.router.ts`, which reports it honestly as `retrievalStatus: 'failed'` — so every draft is ungrounded), AnA chat (`chat/send-message.ts`), `c2c/ai-editing.ts`, `evidence-ask.ts`, `deep-research.ts`, `advancedRAGPipeline.ts`. Creators: `db/migrations/20260730_fix_atom_embedding_dimension.sql`, `20260125_add_atom_embeddings.sql` (Rule 1: amend in place, dated note).
- ~~`enhancedEmbeddingService.searchHybrid` passes that function's arguments out of order:~~ **Done, same change:** arguments in their declared positions, `match_count` sent, and the org/project filter moved INTO the function (`filter_atom_ids`); filtering its top rows afterwards returned a project nothing. Original finding: the org branch sends the result limit as `keyword_weight`, the no-org branch sends it as `semantic_weight`. Ranking, not isolation; only observable once the item above is fixed.
- `chat/send-message.ts` falls back to the client's `x-org-uuid` header exactly as the cortex route did (also noted by the D4 passage-search lane). **Corrected same day: NOT contained.** Its tool uuid reaches `search_document_passages` → the RAG pipeline, which wrote it into the vault's RLS GUC, so a header naming another tenant read that tenant's vault with RLS enforcing (shown at the pipeline, `docs/evidence/D3/2026-09-24-rag-pipeline-tenant/`). The pipeline now refuses a uuid that is not the session's, which closes this for every caller; the fallback itself is still the chat lane's to remove.

**→ Projects, unclaimed (D2)**
- ProjectHome's "Dossier readiness" ring always shows 0%, contradicting the Projects list; the numeric readiness engine queries a column that does not exist. **Claimed 2026-09-24 by `…session_01KnUGoX3g4R4FWKWGc2sTbN` (row D2)**: the ring first (`server/routes/c2c/projects.ts` detail read, `ProjectHome.tsx`), then the engine's `project_id` query. Evidence `docs/evidence/D2-PROJECT-READINESS/2026-09-24/`. **Ring: done** (`61a7221d`). **Engine: deliberately NOT fixed; this needs a decision.** The missing column is what keeps an invented figure dark. With no twin assessment, `computeReadinessScore` scores consistency as the constant `70` and quality and compliance by heuristics (`estimateQuality`: 65 ± profile counts; `estimateCompliance`: 80 − risks). A program with no documents would read about 46. Today every call throws 42703 and all nine callers get null or an error (project-home, AnA context enrichment and orchestrator, next-best-action, RIM, intelligence routes ×2, AI editing ×2). Fix the query alone and they all publish that number. Before the query is fixed, the engine must either (a) report each dimension as null when not assessed, with no overall score unless every dimension has a real input, or (b) be retired in favour of the canonical readiness (`readinessByProject` / `readinessEvaluator`, which already says `assessed: false`). That is the re-baseline's "readiness built three times, all disagree", and it belongs to whoever owns project intelligence, or to the founder. Also in that function: `program_milestones.id` is a uuid mapped through `Number()`, so every overdue-milestone gap would carry NaN. The correct join, when it is time, is `projects.regulatory_program_id` (the anchor, `services/c2c/program-project-anchor.ts`). `recommendation-engine.ts:231-237` has the same query; its generator fails, is logged and skipped, and `program_milestones` has no writer, so it produces nothing either way.
- Two task stores: tasks from AnA, agency communications and the schedule never reach the task board. The Blocked tile and the Blocked/Complete filters are always empty, and AnA is told "0 blocked".
- ~~The portfolio is cut off at 50 programs without saying so~~ **Done 2026-09-24 by `…01KnUGoX`**: the count reads "50+", a note says what the figures cover, and AnA is told (`docs/evidence/D2-PROJECTS-PORTFOLIO/2026-09-24/`). Loading the rest is not done. ~~The TaskBoard critical-path view claims a calculation it does not perform.~~ **Done 2026-09-24 by `…01KnUGoX`**: the header says the tasks are hand-marked and shown in dependency order (`docs/evidence/D2-TASKBOARD-CRITICAL-PATH/2026-09-24/`).

**→ Data room — founder decisions first (see the assessment §5 Data room)**
- Under production RLS the client portal cannot serve any principal outside the owning tenant, so a grant INSERT alone would not make the external path work; no code path places a program into a client workspace; the org default workspace is not excluded from portal scope; portal deliverables read `public.documents`, not the vault.

### Found by the WO-16C audit-outcome lane (`…01E8btkB`) — not fixed, handed on

Full record: `docs/evidence/D5-AUDIT-OUTCOMES/2026-09-24/README.md`.

1. ~~**D5 tasks lane:** AnA's `create_task` / `update_task`~~ **Done 2026-09-24 (`…01AiwZKG`, `docs/evidence/D5/2026-09-24-ana-task-ledger/`):** the board write and its lineage row share one transaction, and AnA's result says when the board was not written. Originally: AnA's `create_task` / `update_task`
   (`server/services/ana-ri/command-executor.ts` ~1021, ~1302) mirror a row
   into `unified_tasks`, then write the `task.create` / `task.transition`
   ledger row best-effort, outside any transaction. Every other task write now
   commits its row on the write's transaction (`auditTaskActionInTx`).
2. ~~**Whoever next edits `AnaToolExecutor.ts`:**~~ **Done 2026-09-25 (`…01AiwZKG`, `docs/evidence/D5/2026-09-25-ana-governed-tool-audit-outcome/`):** the three change-control tools and both governed-fact tools carry `auditTrail`, and say when the row was not written. The orchestrator now returns it, so `routes/change-propagation.ts` answers it too. The consistency check is done too: the route keeps its array body and reports the row in the `X-Audit-Row-*` headers, and the tool passes `auditTrail` on. Originally: QMS change control (×3,
   launch-app) discards its audit outcome. `apply_fact_change`,
   `establish_governed_fact` and `check_consistency` copy chosen result fields,
   so an outcome their services carry would be dropped at the tool.
   `run_shadow_review` spreads its result and already carries `auditTrail`.
3. ~~**eCTD callers:**~~ **Done 2026-09-24 (`…01AiwZKG`, `docs/evidence/D5/2026-09-24-assemble-audit-outcome/`):** the assemble route returns `auditTrail`, and a refusal is 422 `ECTD_ASSEMBLE_BLOCKED` with its record (it was 500). **Still open** (an earlier line here wrongly said they do not call it): `submission-service/submission-service.ts:844` (freeze/dispatch pre-check) and `:1312` (transmit), which receive the outcome and do not answer it. (`routes/ectd-compile.ts:976` also calls it and has answered it since `1c6f56e31`.) `ectd-export.ts` does not call it. Originally: `assembleSequence` now returns `auditTrail`.
   `routes/submissions.ts` and `submission-service.ts` receive it and do not
   answer it. (`routes/ectd-export.ts` does, since 2026-09-25, as headers via
   the canonical `setAuditRowHeaders`. The inline pair in `submissions.ts`
   ~965 is the last hand-written copy of that helper.)
4. **QMS owner:** `server/routes/qms.ts` is a second QMS document-control API
   (create, transition) that no client calls. The launch QMS surfaces use
   `/api/mdx/qms/*` and `/api/quality`.
   **2026-09-25: this is also a security finding, DP-34**
   (`docs/security/SECURITY_AUDIT_2026-09-24.md` §4.5, plan P1-31).
   - Its only guard is `authenticateToken`.
   - A `viewer` can retire or supersede an effective SOP, requalify or revoke a
     supplier, and disposition nonconforming product.
   - Most of those writes record no audit row.
   - Every capability has an audited twin on `/api/mdx/qms/*`.
   - Deleting it was attempted in the review session and stopped at a permission
     check. It waits on the founder.
5. **W1 / D2 (launch catalog):** launch scope is enforced in navigation only.
   `applyLaunchScope` locks the rail, the Apps catalog and deep links. The one
   API-level check, `server/middleware/moduleEntitlementGate.ts`, never reads
   launch scope. It defaults to `MODULE_ENFORCEMENT=off` (`.env.example:369`,
   `enforcement-mode.ts:142`), and even in `enforce` a path that no
   `UI_SURFACES[].apiPrefixes` entry names passes untouched
   (`if (!modules || modules.size === 0) return next()`). The measurement in
   `docs/evidence/D5-AUDIT-OUTCOMES/2026-09-24/launch-path-classification.json`
   found 118 audited write sites reachable only as API or from non-launch
   surfaces, among them the whole legacy `/api/concept2cure/*` namespace, which
   no `apiPrefixes` entry names. D2 reads "every other surface behind a flag
   that is off in production". Whether that covers the API is the row owner's
   call. As built, a signed-in organisation in production can call every one of
   those write routes.

### Found by the weekly review's second pass (`…015oLV2v`, 2026-09-25) — handed on

Full record: `docs/evidence/reviews/2026-09-24/lenses.md`.

1. **Auth owner (D6), then Tasks (T2's UI half).** The server refuses a `viewer`
   on every task write (`requireEditorAccess`). The task board still offers the
   viewer *New task*, *Start workflow*, move, archive and sign, and refuses only
   after the click (`TaskBoard.tsx:745-746,895-896`). The client cannot tell
   who may write:
   - `GET /api/v1/auth/session` answers `roles: ['user']` for a viewer and a
     member alike (`server/routes/auth.ts`, `sessionRoles`).
   - It answers `permissions: []` for everyone.
   - Proposal: the session derives one permission from the server's own
     `GOVERNED_WRITE_ROLES` (`orgMembership.ts:473`), for example
     `governed:write`, so the client mirrors no role list.
   - The board then hides or disables its write controls without it.
   - Not taken tonight because `auth.ts` is in the D6 session's active lane.
2. **Founder: DP-35.** Authoring freeze needs no re-authentication and no
   signing authority. It counts as `finalized` for eCTD leaf completeness and
   as COMPLETE on the IND checklist. `ind-checklist-view-assembler.ts:71-79`
   already leaves "should an unsigned freeze count as complete" open. Plan row
   P1-32.
3. **Design-system session.**
   `client/src/concept2cure/v2/__tests__/documentCanvasPolish.test.tsx` has
   been red since the motion-token change (`92d0fe0b`). Its ease-out check
   reads `transform var(--dur) var(--ease)` as "not ease-out", because it
   does not resolve the token.

### Found by the IND eCTD demo lane (`…01TtwRHm`) — not fixed, not this lane's to decide

1. **Two go/no-go gates disagree about a clinical hold.** `ind-lifecycle/ind-dispatch-gate.ts`
   hard-blocks on any open critical action, a 21 CFR 312.42 hold included;
   `ectd/dispatch-gate.ts`, which `assess-dispatch-readiness` composes and the governed
   freeze/dispatch transition enforces, has no hold check. Its header calls the first
   gate "complementary", so two gates is deliberate — the disagreement is not. Do NOT
   simply copy the hold into the second gate: during a hold the sponsor must still be
   able to send the complete response that lifts it (312.42(e)), so a blanket refusal
   is its own defect. Product decision for JM (it is Click 5 of the demo). Session
   `…015weqdG` is doing unclaimed work beside this (`50e78caa4`, `3c101fc96`).
2. ~~**A same-named `normalizeCtdCode` with a different contract.**~~ **Done 2026-09-24 (`…01AiwZKG`):** the `ind/ctd` copy is `ctdGuidanceKey` (a lookup key, and says so), the registry no longer re-exports it, and `tests/schema-contract/one-normalize-ctd-code.contract.test.ts` refuses any other definition or a re-export not from the shared module (red 2/2 before, green after). Of the two private copies, `ich-headings.ts` no longer exists. `dispatch-readiness.ts`'s `normalizeCode` is a differently named private comparison key inside the dispatch gate; changing what the gate compares is the package-spine lane's call. Originally:
   `server/services/ind/ctd/index.ts:41` (re-exported at `ind-section-registry.ts:404`)
   returns a string for `m1/us/1.2`, where `shared/regulatory/section-code.ts` returns
   null — the exact input the `upsertLeaf` gate exists to refuse. An import resolved by
   autocomplete reopens that gate. Two more private copies:
   `ectd-packager/ich-headings.ts:160` and `ectd/dispatch-readiness.ts:162` (which
   lower-cases where the shared one upper-cases).
3. ~~**The BX-204 dossier-map seed files three of its four Module 1 rows under codes
   that mean something else**~~ **Done 2026-09-24 (`…01AiwZKG`):** Draft Labeling is `m1.14.1.3`, Meeting Materials `m1.6.2`, Financial Disclosure `m1.3.4`, each read from `CV_CONTEXT_OF_USE`. The seed deletes the three misfiled `(code, title)` rows for its own project before inserting, so a database seeded before the fix is corrected on reseed, not only a fresh one (checked on a local database with the old rows planted: re-seed leaves `m1.1`, `m1.14.1.3`, `m1.3.4`, `m1.6.2`, once each). `tests/schema-contract/dossier-map-seed-module1-codes.contract.test.ts` requires every Module 1 row's code to exist in the FDA table and its FDA meaning to match the title (red 3/5 before, green 5/5 after). Originally: (`scripts/seed/ga-demo.d/105-dossier-map.mjs:30-33`,
   checked against the vendored FDA table `controlled-vocab/cv-v4-data.ts`): Draft
   Labeling at `m1.3.1` (FDA: 1.14.1.x), Meeting Materials at `m1.14.1` (FDA: 1.6.x),
   Financial Disclosure at `m1.12.4` (FDA: 1.3.4; FDA's 1.12.4 is "request for comments
   and advice"). It is a BLA, not on the IND demo path. `ON CONFLICT DO NOTHING` means a
   corrected code reaches only a freshly seeded database.

### Handed to the W2 schema-guards lane (`…01KiDof7`) — found by `…01E2moDu`, not edited

`ci:unbacked-tables`, `ci:column-reachability` and `ci:migration-reachability`
each count **runtime DDL in server code** as a way a table gets created. On
production's connection it creates nothing. PostgreSQL refuses `CREATE … IF NOT
EXISTS` to the non-owner runtime role **even when the object exists**, because it
checks privilege first. That is how `license_requests` passed `ci:unbacked-tables`
while no provisioned database had it, and lost every enterprise onboarding
request in production. It is fixed now.

New runtime DDL is now blocked at the source by `ci:runtime-ddl` (pre-push and CI,
with a self-test). What those three guards still accept as created is the 14
baselined files in `scripts/ci/runtime-ddl-baseline.json`. Whether to stop
counting them is your call: doing so surfaces the latent EULA and `ai_feedback`
tables as unbacked. Evidence: `docs/evidence/W1/2026-09-24-launch-reach/`.

### Handed on by the install child-scope change (`…01AiwZKG`), not edited

1. **To the D3 lane: a blank database's first deploy leaves
   `regulatory_harmonization.export_job_audit_log` unscoped (L203's table).** The
   set creates its parent `export_jobs`, and the uuid half of the final sweep
   pair policies it. The child scope runs before that pair, logs "the parent is
   not scoped … skipping", and so the child is scoped only on the second deploy.
   The installer cannot close this, because the table does not exist at install
   time. CI cannot see it: its coverage step runs after the idempotency re-run.
   A coverage check between CI's first and second `deploy-migrate` would catch
   this case and the whole class. Measured: after install, 0 rows; after one
   deploy, this 1; after two, 0.
2. **To the W2 schema-guards lane: the same shape in
   `20260828_drop_orphaned_org_guc_policies.sql`.** It drops an orphaned
   `*_org_policy` only where `tenant_isolation_policy` already exists, and on
   four of its five tables the final sweep adds that policy later in the same
   set. The first deploy logs "keeping … canonical tenant_isolation_policy is
   absent" four times, and the second drops all five. The policies are inert,
   so this widens nothing, but the empty-string cast the file exists to defuse
   stays armed until the second deploy.
3. ~~**To the audit-trail lane (unclaimed): the system audit chain forked once in
   four full real-database runs.**~~ **Done 2026-09-24 (`…01AiwZKG`, `docs/evidence/D5/2026-09-24-audit-chain-search-path/`):** the writer asked `current_schema()` whether `audit_logs.chain_seq` existed. `master-licensing-console.dbtest.ts` puts a private schema first on its runtime role's search_path, so the writer fell back to `occurred_at` order and chained row 45 to 43. It now asks about `to_regclass('audit_logs')`. `chain-concurrency.dbtest.ts` case 4 is red without the fix and green with it. The full suite is 684/684 with 0 fallback warnings (every earlier run printed one). Originally: Tenant 0's `audit_logs` rows `chain_seq` 44
   (`user_password_reset_failed`, 20:43:00) and 45 (`module_packaging`, 20:43:11,
   the first `licensing-history` write) both commit to 43, so
   `verifyAuditChain({tenantId: 0})` reports broken and
   `tests/db/licensing-history.dbtest.ts` fails its three integrity cases.
   `chain_seq` is a global sequence, so 44 was inserted first. Both writers use
   `auditService.logAction` (`BEGIN`, per-tenant advisory lock, head read,
   insert, `COMMIT`), and the policy is all-or-nothing per tenant. So either
   the writers did not take the same lock, or row 44's transaction stayed open
   past row 45's head read. The run shared the CPU with a second database
   install. The schemas were identical to the passing runs (`pg_dump -s`). A
   forked chain is a Part 11 §11.10(e) finding, not a flake. Evidence:
   `docs/evidence/W2/2026-09-24-install-child-scope/README.md`.
4. **To the D3 lane: `atom-search` is green.** L201 and L202 report 53/54 and
   656/661, with `tests/db/atom-search.dbtest.ts` failing on "the pre-existing
   `search_atoms_hybrid` defect". That was fixed in `881680d73`, an ancestor of
   both commits. On a database built from blank at trunk it passes 5/5. The
   database behind those numbers predates the fix. A from-blank rebuild would
   also have shown the installer failure above.

### Handed to the AnA / council lane (`…01DiJJAk`) — found, not fixed, by the schema-authority lane

Two findings surfaced inside that lane's files. Reported rather than edited,
per the claim above. **Neither is a regression from the reporting lane's work.**

1. **`ana_runs` does not exist on a provisioned database.**
   `server/services/ana/run-control.ts` queries it; it arrived with AnA commit
   `45748a8f5` and nothing creates it in any lineage. This makes
   `ci:tables-live-schema` **red on clean trunk**. It was deliberately NOT
   added to `scripts/ci/tables-live-schema-baseline.json`: that file's own
   comment says *"Re-running `--baseline` to make a failure go away converts a
   caught defect into an accepted one."* The fix is a migration in
   `C2C_MIGRATION_FILES`, not a baseline entry.

2. **`lumen.data_atoms` is read by live code and written by nothing.**
   `server/services/multi-agent-council.ts:864,1070` and
   `server/services/innovation/auto-traceability-service.ts:371` SELECT from
   the schema-qualified `lumen.data_atoms`. Every live INSERT
   (`routes/chat/upload.ts`, `routes/c2c/artifacts.ts`,
   `routes/c2c/knowledge-sources.ts`, `routes/cortexAdvisoryRoutes.ts`,
   `services/projects/contextual-ingest.ts`,
   `services/clinical-regulatory-evidence/retrieval-atoms.service.ts`) targets
   **`lumen_data_atoms`** — a different, public-schema table. Reads and writes
   have been aimed at two different relations.

   This split **predates** the 2026-09-18 deletion of
   `server/workers/enhanced-ingestion-pipeline.ts` and was not caused by it.
   That file was the only writer of the schema-qualified table, but nothing
   imported it, so it never ran: those reads already returned nothing. Deleting
   it removed the *appearance* of a writer, not a writer. Deciding which
   relation is canonical is a council-lane call.

**Cleared from another lane (2026-09-19):** the 16 dead symbols reported here on
2026-09-17 — unused imports and destructurings in
`client/src/concept2cure/v2/surfaces/AuthoringPlaceIntoFiling.tsx` and
`server/services/workflow/DecisionLineageService.ts` — were still there a day
later with the files untouched since, so they were deleted rather than left to
block the ratchet for whoever added the next legitimate warning. Nothing but
dead symbols was touched; both files' suites pass. Baseline relocked at 6522.

**Ratchet debt absorbed from other lanes (2026-09-19, third time):** four more
warnings arrived on trunk from lanes that pushed them, each one blocking every
other lane's next push until somebody paid it. Cleared in place, semantics
untouched, suites green:

| File | What | Why it was fixed here |
|---|---|---|
| `server/services/ana/__tests__/run-control.pglite.integration.test.ts` | 103-line describe | Fixture builder hoisted (splitting broke five cases). The owning lane landed the same fix independently; the merge took theirs. |
| `server/services/ana/__tests__/verified-seal-service.test.ts` | 102-line describe | Split at the E11 binding cases — 11 tests still pass. |
| `tests/resolution/bundle-execution.test.ts` | mock query chain at complexity 16 | Three `document_span_lineage` branches extracted to `spanLineageAnswer` — 18 tests still pass. |

The pattern is worth naming: a warning added in one lane is invisible to the
lane that added it (the pre-push hook does not run the ratchet; CI does) and
costs the NEXT lane to push a diagnostic round each time. Running
`npm run ci:eslint-ratchet` before you push keeps it in the lane that created it.

**Typecheck on trunk, eSTAR lane (2026-09-19):** `4cf0a8a6b` made
`EstarFilingPanel`'s `programId` required — deliberately, so the compiler
catches a surface that forgets and silently reads org-wide content — and left
one call site behind in its own render test, so `ci:typecheck:no-regression`
was red on trunk (baseline 0, found 1). Fixed in both lanes within minutes of
each other; the merge kept that lane's version, which carries the better
comment. No action needed — recorded because the required prop did exactly what
its docblock said it would, and the gap was only the last call site.

**Two new pre-push gates (2026-09-19) — both added after they caught a real
defect, one of them mine:**

- `ci:untracked-imports` — a pushed file must not import a module git does not
  have. An unanchored `uploads/` in `.gitignore` (meant for the runtime
  directory at the repo root) silently excluded `server/services/uploads/`, so
  a commit shipped a route importing a file that was not in the repository and
  trunk was unbuildable. Nothing local could see it: typecheck, 6,117 unit
  tests and the dbtests all read the WORKING TREE, and `git add -A` printing
  nothing is byte-identical to success. The gate reads the INDEX. `/tmp/`,
  `/uploads/`, `/logs/` are now anchored; `data/logs/` is listed explicitly
  because the unanchored form was genuinely covering it.
  Repo-wide (`--all`) it also reports **21 pre-existing broken relative
  imports**, mostly in `db/migrations/_consolidated/*.ts` importing
  `../server/db` from a path where that does not resolve. Left alone: the gate
  is scoped to what a push changes, so no lane inherits the backlog. If those
  files are dead, deleting them clears it.
- `ci:pushed-lint-errors` — ESLint ERRORS in the pushed files only, ~1.4s. The
  warning ratchet is not on this hook (minutes on 1,790 files) and deliberately
  ignores errors, so until now **nothing ran ESLint before a push**.

Both are scoped to the diff against the upstream ref, so they hold a lane to its
own code. Both fail closed on an ESLint crash or an unreadable index.

**For the model-governance lane (2026-09-24) — the free-text classifier cannot see most field names:**
`server/services/ana/governed-write-tools.ts` finds tools that store model-written
text with `FREE_TEXT_FIELD`, a fixed list of whole property names (`content`,
`body`, … `summary_text`). `catalog_project_document` writes `summary`,
`purpose`, `document_kind` and `key_data`; `place_project_document` writes
`rationale` into a Part 11 row. Neither name is on the list, so both come back
with no free-text fields, sit in neither `GOVERNED_CONTENT_WRITE_TOOLS` nor
`FREE_TEXT_NON_GOVERNED_TOOLS`, and the approved-model gate never applies. The
test that should catch it — "every tool with a free-text input is classified"
(`governed-write-gate.test.ts`) — draws its population from the same regex, so
it can only fail for a name already on the list. Widening the regex by
`summary|purpose|rationale|document_kind` alone surfaces 12 unclassified tools
(reproduced in a scratch probe, 2026-09-24). The fix is the classifier's, not a
per-tool patch; this lane has not changed that file. Separately, `key_data`
figures are now verified against the document text
(`docs/evidence/MODEL-GOVERNANCE/2026-09-24-catalog-key-data/`), which covers
the figures but not which model wrote the prose.

**For the RAG / memory owners (2026-09-24) — filtered vector search can miss:**
the vault reader's dense arm (`AdvancedRAGPipeline.searchVaultSimilar`) put its
tenant predicate in the `WHERE` of `ORDER BY embedding <=> $q LIMIT k`. With an
approximate index (`ivfflat`, probes 1) the scan picks candidates from one list
and filters afterwards, so a tenant's search returned nothing while its matching
passages sat in unprobed lists — reproduced on real PostgreSQL, fixed with a
`MATERIALIZED` CTE that scopes first and ranks exactly
(`docs/evidence/D4/2026-09-24-vault-passage-recall/`). The same shape is in
`searchRagChunksSimilar`, `searchClientMemorySimilar` and
`searchProjectMemorySimilar` in that file. Where the table has an approximate
index and the filter is a tenant, the same miss is possible — HNSW included,
once a tenant is a small fraction of the table. Not changed here: not this
lane's corpora.

**For tenant offboarding / retention, D6 (2026-09-24, from the AnA client-files lane): no stored Vault object is ever deleted.**
Only one place in `server/` calls the storage provider's `delete()`: the
refused-upload cleanup added today (`server/services/vault/vault-ingest-discard.ts`).
Nothing else, including the tenant purge, document deletion (a soft delete),
retention and version replacement, removes a document's bytes.
`tenant-offboarding.ts` says so in its purge list ("does NOT delete the stored
object bytes … a storage-lifecycle concern this function does not perform"),
and its path description (`uploads/vault/<program>/<sha256>`) predates the
provider: bytes are at `<org>/<program>/versions/<versionId>/` (local) or the
same keys in the bucket (S3). So an offboarded tenant's documents stay on disk
or in the bucket after the purge reports success. Two smaller leaks feed the
same pile: re-uploading identical bytes to the same code and version repoints
`storage_version_id` to the new copy and leaves the old one unreferenced, and
bytes stored before this lane's fix for refused uploads. The provider has what
a purge needs, `list(orgId, projectId)` and an org-checked `delete`. What it
needs first is a decision this lane should not take alone: legal holds (which
the D6 note above says cannot be placed at all) must be able to stop it. Not
changed here.

**For the D3 isolation and eCTD package-spine lanes (2026-09-24): trunk is over the warning ratchet.**
Running `check-eslint-warning-ratchet.mjs` on trunk gives 6434 warnings against a
baseline of 6431. `--since 019afa70d` (the last baseline commit) names the files
that grew:
`tests/db/two-tenant-application-rls.dbtest.ts` +2 (a describe arrow at 118
lines, and the file at 580 lines; last touched `a2eb23243`),
`server/services/ectd/package-leaf-bytes.ts` +1 (`packageLeafBytes` has
complexity 22), and `server/services/ectd/package-sequence-lifecycle.ts` +1
(`planSequence` is 127 lines; both from `af6440e98`). The gate runs in CI only,
so no pre-push hook sees it. This lane has not touched these files, because both
lanes are active and the fixes are refactors of their code.

*Resolved for the dbtest the same day.* The two-tenant fixture moved to
`tests/db/two-tenant-fixture.ts` and the `/proof` scaffolding to
`tests/db/tenant-proof-routes.ts`. The Report OS contract (L184), which by then
had added a 291-line describe, moved to
`tests/db/report-os-tenant-from-session.dbtest.ts`. The cases are unchanged:
23 + 14 = 37/37 on a from-blank database as `app_service` with RLS enforcing.
The ratchet is at 6431 = baseline. **A new D3 tenant contract goes in its own
`*.dbtest.ts` on that fixture, not as another describe in the WO-03 file.**

**ESLint ERROR cleared from another lane (2026-09-19):**
`server/services/ana/__tests__/agentic-loop-cancel-entries.test.ts:169` (commit
`1e8ddb6d2`) carried four literal spaces inside a regex, which `no-regex-spaces`
reports as an **error**, not a warning — so the Run ESLint step was red on
trunk, and the ratchet, which only counts warnings, said OK. Changed to `{4}`;
identical semantics, 13 tests still pass. Worth knowing in that lane: the
warning ratchet passing is not the lint step passing.

**Note for the vault-storage lane:** `server/services/vault/storage-migration.service.ts`
(`c029711ae`) landed `migrateVaultStorage` at complexity 17 / 102 lines, which put
`ci:eslint-warning-ratchet` one over its baseline. It was paid down elsewhere rather than
in your file, so the gate is green and the function is untouched — but it is still two
warnings you own. Splitting the per-document body out of the loop clears both.

**Live-schema baseline — where it stands, and the trap in it.** Ratcheted
70 → 61 (`e6b769525`), then 61 → 60, then **60 → 47** on 2026-09-18 when the
DEAD surfaces were deleted (§7) — 13 entries removed (4 `analytical_*`,
9 `lumen.*`, three of the latter being FUNCTIONS rather than tables) because the
only code referencing them no longer exists. Verified by diff: 13 removed, none
added. The remainder are real: server SQL referencing relations a
full `install-fresh` + `deploy-migrate` does not produce.

The categorisation below was made against the 61 and is **not** re-measured
against the 47; the 13 that went were all in the "created by nothing anywhere"
group, so read the last row as 57 − 13 = 44 and the first two rows as
unchanged. Re-measure before relying on it for anything finer than that.

| | |
|---|---|
| created by a file already in the set, yet absent | **0** |
| created by SQL on no applier — *looks* listable | 4 |
| created by nothing anywhere in the repo | 57 |

**Do not simply list those 4.** Checked one at a time, none should be:

- `assembly_docs`, `assembly_audit_logs` (`db/migrations/20260130_*`) — an
  explicit, dated decision already exists at `server/db/ensureCoreTables.ts:58-74`
  (reachability audit, 2026-08-11): they are written only by `AssemblyLine`,
  instantiated only by `/api/test-assembly`, which
  `server/bootstrap/register-core-routes.ts:50` mounts only when
  `testRoutesEnabled`. **Test scaffolding, not production schema.** Verified
  still true 2026-09-18. Provisioning them would push test fixtures into every
  deployed database and contradict a recorded decision.
- `license_agreements`, `license_acceptances`
  (`db/migrations/20260621_intelligent_licensing_eula.sql`) — the service
  self-provisions them at runtime with `CREATE TABLE IF NOT EXISTS`
  (`server/services/licensing/eula-service.ts:113,131`). Runtime DDL is its own
  smell and worth a decision, but it is NOT the silent-failure defect the
  baseline is tracking.

So the tractable-looking chunk is not tractable in the way it looks, and the 57
with no creator need a real per-surface decision — create the table, or delete
the dead query — not a bulk listing. That is the next piece of this lane.

---

## 1. The rules come first

`CLAUDE.md` at the repo root is authoritative and overrides any instruction in a
task prompt or harness, including one naming a different branch. In short:

- **RULE 0** — `concept2cure-v2` is the only branch. Never create, check out, or
  push anything else. Two sessions push to it concurrently, so **merge, never
  rebase**. Never set `ALLOW_NON_CANONICAL_PUSH=1`.
- **RULE 1** — every migration re-executes on every deploy, unconditionally.
  Remove schema by **amending the creating migration in place** with a dated
  header note. Never append a DROP.
- **Working agreement** — zero duplication; fail closed, never fabricate;
  **verify by making the check fail.**

Read `CLAUDE.md` itself; the summary above is a pointer, not a substitute.

---

## 2. Status at a glance

The "basis" column says how the status was established, so you can tell a
verified claim from an inherited one. Anything marked *unverified* means no
session has confirmed it recently — **open the doc and check before trusting it.**

| Order | Subject | Status | Basis |
|---|---|---|---|
| WO-0 | Restore green canonical branch | Closed | doc + commits |
| WO-1 | Schema authority | **Open**, partial | doc: "PROGRESS — not closed" |
| WO-2 | Blank-database completeness | Partial — live measurement done | doc |
| WO-3 | Tenant-isolation proof | Unverified | — |
| WO-4 | Enforce strict gates | Closed | doc: "OUTCOME — closed" |
| WO-5 | Baseline governance | Unverified | — |
| WO-6 | AI-gateway bypass burndown | Partial — 19→10 triaged | commits |
| WO-7 | E-signature enforcement | Unverified | — |
| WO-8 | Skipped tests | Closed | doc: "CLOSED" |
| WO-9 | Pilot surface lock | Unverified | — |
| WO-10 | Deletion program | Unverified | — |
| WO-11 | — | **Withdrawn**, the finding was wrong | prior session |
| WO-12 | Complexity refactor | Unverified | — |
| WO-13 | GRDHE tenant scoping | Partial | doc: "What is now fixed" |
| WO-14 / 14A | Cortex Prime broken and mounted | Partial, some left deliberately undone | doc |
| WO-15 | Schema the code expects that no deploy creates | **All nine resolved** — 8 fixed, 1 refused | verified 2026-09-17 |
| WO-16 / 16B / 16C | Fabricated content sweep | Largely closed | docs + commits |

---

## 3. WO-15 — the active lane

Nine findings. State as of 2026-09-17:

| Finding | State |
|---|---|
| 1 | **Refused** by adversarial review. Stays refused — do not reopen without new evidence. |
| 2 | **Fixed** — 21 declared columns added on the applier. Confirmed as written, and it corrected my own finding-3 error: push does NOT create the charter tables. |
| 3 | **Fixed** `0186d8d2d` — charter audit Part 11 append-only triggers |
| 4 | **Fixed** `153481465` — `/api/design-risk` deleted: 20 endpoints over ten tables that exist on no database |
| 5 | **Fixed** — `20260716_template_doc_types.sql` listed in the set, its false `KNOWN_UNLISTED` exemption removed. Confirmed, not corrected: the finding was right. |
| 6 | Fixed (earlier session) |
| 7 | **Fixed** `4c6f38153` — `contradiction_consequence_log` column name + fabricated `detected_by` default |
| 8 | **Fixed** `b9152a016` — the installer could not see the `vault` schema, which was hiding `vault.evidence_citations`: declared, INSERTed into by `advancedRAGPipeline.ts:1316`, created by no applier |
| 9 | Fixed (earlier session) |

Findings 3 and 7 in `WO-15-...md` each carry a **CORRECTED** block. The original
finding text is preserved beneath it under "Original finding, as written" — read
the correction first; in both cases the original headline was wrong.

**All nine findings are resolved: 8 fixed, 1 (finding 1) refused by adversarial
review and staying refused.** Three had wrong headlines (3, 7 and — in the
opposite direction — my own correction to 3); two were right as written (5, 2).
Check each claim, do not assume either way.

One item surfaced here was NOT part of WO-15's nine and is now also **fixed**:
10 of the 15 `KNOWN_UNLISTED` entries in
`tests/ops/apply-c2c-migrations-manifest.test.mjs` failed that list's own stated
reason, covering 16 tables. All ten are now on the applier and their exemptions
are gone, with `tests/schema-contract/known-unlisted-reason-holds.contract.test.ts`
enforcing the rule the list only stated in prose. The first figure published here
was "14 of 16" from a crude heuristic; re-measured it was 10 of 15. See WO-15
finding 5.

With WO-15 and the `KNOWN_UNLISTED` triage both closed, the next unclaimed work
is the untouched orders in §2 — WO-3, WO-5, WO-7, WO-9, WO-10 and WO-12 are all
marked *unverified*, meaning no session has confirmed their status recently. Start
by re-deriving the status rather than trusting the row.

---

## 4. Lessons that cost real time — do not relearn these

**A green migration against a database that happens to be complete is not
evidence that the migration *set* is complete.** Finding 3's first attempt added
`migrations/20260629_charter_tables_rebuild.sql` to `C2C_MIGRATION_FILES` and
passed a live-database proof. It was wrong: the file has five
`REFERENCES project_charters(id)` clauses and nothing in the set creates that
table. (This paragraph first said "Drizzle push does" — it does not, and that
error is itself WO-15 finding 2's subject: `project-charter.ts` is re-exported
from `shared/schema/index.ts`, which is not a drizzle entrypoint, so the charter
tables are outside the push surface and come from install-fresh's overlay.) The
live database already had the table from install-fresh, so the proof could not
expose the gap.
`tests/schema-contract/tenant-isolation-sweep.contract.test.ts` C-33 applies the
set to a **bare** database and caught it. Run the schema-contract shards before
believing any change to the set.

**There is no such thing as a standalone deploy-migrate-lineage database.**
`scripts/db/deploy-migrate.mjs` refuses an unprovisioned database ("Missing base
tables: organizations, users, c2c_documents, …"), so install-fresh provisions
every database and its step-3 overlay (`migrations/*.sql`) always applies first.
Several WO-15 findings are framed as two competing lineages. **That framing is
wrong wherever it appears** — check it before acting on it. In finding 7 it
*understated* the defect: it is always the same four writes that fail, on every
database, not four-of-nine depending on how the database was built.

**`CREATE TABLE IF NOT EXISTS` converges nothing.** It never adds a column to, or
alters a column on, a table that already exists. Amending a creating migration
fixes only what a *new* database gets; an existing one needs
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` inside `C2C_MIGRATION_FILES`, which is
the only applier that touches a populated database. Both halves are usually
required and neither substitutes for the other.

**A gate's blind spot is where the defects live.** The installer verified
`drizzle-kit push` by counting tables, and both halves of the count were
public-only — the regex matched `pgTable('name')`, the query filtered
`table_schema = 'public'` — so all six `vault.table('name')` declarations were
outside its view while it printed "declared tables verified present". Behind
that: `vault.evidence_citations`, declared in Drizzle, created by a file under
`db/migrations/_legacy/` that no applier's non-recursive glob descends into, and
INSERTed into by `advancedRAGPipeline.ts:1316` on every retrieval — the 42P01
swallowed by a `console.warn`. When a gate has only ever passed, ask what it
cannot see, then hide something it should catch and check that it fails.

**"A real implementation exists" and "which one is canonical" are different
questions.** An earlier fix in this sweep resolved a fabrication by wiring a
route to a real implementation that was not the canonical one, entrenching a
duplication while removing the fabrication. Check for a canonical implementation
(own test suite, multiple consumers) before wiring anything.

**Prove it by making the check fail.** For a schema change that means breaking a
real database in the exact way the migration exists to repair — drop the trigger,
drop the column, run the real applier, watch it come back. For a code change it
means running the new test against the unfixed code first and seeing it name the
real defect.

---

## 5. Verification commands

Per change, not batched at the end:

```bash
npm run ci:migration-set-order && npm run ci:migration-drop-safety
npm run ci:migration-reachability && npm run ci:duplicate-table-ddl

# Run in three shards — one invocation OOMs the container.
npx vitest run tests/schema-contract/ --shard=1/3   # then 2/3, 3/3

DATABASE_URL='postgresql://…' node scripts/db/deploy-migrate.mjs
npm run ci:tables-live-schema
```

A local Postgres may already be running with the socket in `/tmp` rather than
`/var/run/postgresql` — `PGHOST=/tmp` reaches it. `c2c_testdb` is an
install-fresh-provisioned database suitable for applier proofs.

---

## 6. If you are a new session picking this up

1. Read `CLAUDE.md`, then §3 and §4 above.
2. Open `WO-15-...md` and read findings 3 and 7's **CORRECTED** blocks — they
   record how the two most recent fixes were reached and what was wrong with the
   original analysis.
3. Start on finding 4 with the `audit:orphaned-endpoints` check.
4. Update this file when a status changes. A stale index is worse than none,
   because it is trusted.

---

## 7. The DEAD-surface deletion (2026-09-18, schema-authority lane)

The live-schema baseline listed relations that server SQL references and that no
database has. Grouped by referencing file, they were a handful of coherent
**surfaces**, not independent tables — so the unit of work was a surface, and the
decision per surface was binary: **LIVE** → provision it durably, **DEAD** →
delete it. This records the DEAD half.

### What was deleted, and the evidence for each

| File | Why it was safe to delete |
|---|---|
| `server/services/analytical/lims.ts` | Unreferenced module (nothing imports its exports). Sole referencer of 4 `analytical_*` tables. |
| `server/services/knowledge-graph.ts` | Unreferenced. Sole referencer of 6 `lumen.*` graph tables/views. |
| `server/api/neuro-symbolic/routes.ts` | Unmounted route module — on no router. |
| `server/workers/entity-extraction-worker.ts` | Imported only by the two modules above. |
| `server/workers/enhanced-ingestion-pipeline.ts` | Unreferenced. |
| `server/workers/layout-aware-ingestion.ts` | **Cascade** — imported *only* by `enhanced-ingestion-pipeline.ts:17`. |
| `server/db/database.js` | Self-described legacy shim; zero import specifiers anywhere. |

The last two were not in the original set. They became unreachable *because of*
the first five, and `ci:unreferenced-modules` reported them as NEW unreferenced
modules on the next run. **That gate finding the cascade is the reason to trust
the deletion**: deleting a module surfaces whatever only it kept alive, so the
gate, not the analysis, decides when the cascade has stopped.

### What the deletion moved

| Gate / baseline | Before | After |
|---|---|---|
| `scripts/ci/tables-live-schema-baseline.json` | 60 | 47 |
| `scripts/ci/unbacked-tables-baseline.json` | 37 | 27 |
| `scripts/ci/unreferenced-modules-baseline.json` | 97 | 94 |
| `scripts/db/referenced-tables-baseline.json` (`knownMissing`) | 10 | 9 |

Every baseline moved in the **shrink** direction only; the regenerated
`unreferenced-modules` baseline was diffed to confirm it removed exactly three
entries and added none. A `--write-baseline` that quietly adds an entry launders
a new defect into an accepted one, so the diff is the check, not the exit code.

### Two things the deletion forced, neither of them mechanical

- **`tests/schema-contract/c2c-apply-path.contract.test.ts`** pinned an INSERT
  column list by reading `enhanced-ingestion-pipeline.ts`. With that file gone
  the test failed on its own `read()`. It was **removed rather than re-pinned**,
  because there is no remaining writer to pin it to — and that absence is itself
  the finding now recorded in §0 for the council lane. The surviving assertions
  still carry C-12, and were proven to discriminate by deleting `atom_type` from
  the canonical migration and watching the suite go red.
- **`server/services/embedding-corpus-policy.ts:130`** named
  `layout-aware-ingestion.ts` as "the active writer" of `vault.document_chunks`.
  It was not: the real writer is
  `server/services/vault/document-chunking.service.ts:110`, which is imported by
  `vault-ingest.service.ts:333` and `startup/document-catalog-bootstrap.ts:48`.
  The registration's *conclusion* (3-small) was right by luck — the real writer
  independently uses the same model — but its stated evidence named a module that
  never ran. Corrected in the policy file and its test.

**The lesson worth keeping:** a comment naming the module that justifies a
config value is load-bearing evidence. When it names a module nothing imports,
the value has never actually been checked against anything.

---

## 8. Triage correction — two "DEAD" verdicts were wrong (2026-09-18)

The plan's cluster triage was produced by Explore agents. Re-verified by tracing
mounts directly, **two of the three DEAD verdicts do not hold.** Recording this
because acting on them would have deleted live surfaces.

| Surface | Agent verdict | Verified | Evidence |
|---|---|---|---|
| `server/api/cmc/playbookRoutes.ts` | DEAD | **LIVE** | `blueprintRoutes.ts:9` imports it, `:748` mounts it at `/playbook`; `register-core-routes.ts:68` mounts `blueprintRoutes` at `/api/cmc/blueprint` — unconditionally (a plain `try` block, not a feature gate). Reachable at `/api/cmc/blueprint/playbook/*`. |
| `server/api/cmc/portfolio.ts` | DEAD | **LIVE** | Same router: `blueprintRoutes.ts:8` imports, `:746` mounts at `/portfolio`. Reachable at `/api/cmc/blueprint/portfolio/*`. |
| `server/routes/cognitive-ecosystem.ts` | DEAD | **DEAD, but blocked** | Explicitly retired (#844, Phase 0.2) and unregistered — see the note at `register-document-routes.ts:246`. See below for why it was not deleted. |

So 8 of the 47 baselined relations belong to **live, mounted endpoints** and need
**provisioning**, not deletion:

- `/api/cmc/blueprint/playbook/*` → `cmc_workflows`, `cmc_workflow_instances`,
  `cmc_workflow_tasks`, `cmc_checklist_instances`, `cmc_ai_tool_executions`
- `/api/cmc/blueprint/portfolio/*` → `reg_submissions`, `reg_m3_sections`,
  `reg_rpi_snapshots`

**The method that caught this:** grep for the *exact* import path, not the
basename. A basename search for `portfolio` matches `ind-portfolio`,
`portfolio-simulation` and `protocol-portfolio-metrics`, none of which is the
file in question — and a bare `from './types'` matches every service directory
in the repo. A loose pattern produced a confident, wrong DEAD verdict; the same
loose-matching error cost this lane a day earlier (§4).

### Why `cognitive-ecosystem` was NOT deleted, though it is dead

It is a self-contained unmounted island: the route, plus the 11-file
`server/services/cognitive-ecosystem/` subtree. The **only** external importer of
that subtree is the route's own line 28 — and that import is empty
(`import { } from '../services/cognitive-ecosystem'`), the residue of the
retirement. Nothing else in `server/` or `client/` imports any of it.

Route and subtree are therefore **one decision, not two**: only the route is in
`unreferenced-modules-baseline.json`; the 11 service files are absent from it
precisely *because* that empty import still counts as a reference. Delete the
route alone and the whole subtree becomes newly unreferenced — the same cascade
§7 describes, but this time landing on files that must not be quietly baselined.

**The blocker is Part 11, and it is real.** `cognitive-audit.service.ts` is the
sole writer of four `cognitive_audit.*` tables that **do exist** on a provisioned
database (`db/migrations/064_gcc_cognitive_audit_schema.sql`) and are **not** in
the live-schema baseline. `server/services/audit/domain-history-link.ts:216-237`
records that service as the registered `owner` of all four, with semantics like
*"One AI reasoning step with its prompt and semantic content (own hash chain)"*
and *"One e-signature applied over cognitive-audit content."*

Deleting it would remove the only writer of provisioned electronic-signature and
audit-chain schema and leave four dangling owner entries in the audit domain map.
That is a compliance decision, not a cleanup, so it is **recorded rather than
guessed at**. Whoever takes it needs to answer: are the `cognitive_audit.*`
tables retired along with the subtree — in which case the domain-map entries and
migration 064 go too — or is the subtree meant to be re-mounted?

Contrast with `federated_*` (4 baselined entries, referenced by the route and by
`federated-learning.service.ts` only): those tables exist nowhere, so they carry
no such coupling. They are blocked only by being on the same island.

---

## 9. CMC playbook provisioned — and the fabrication that provisioning would have switched on (2026-09-19)

First of the **LIVE** surfaces from §8. `/api/cmc/blueprint/playbook/*` is
mounted unconditionally and all five of its tables were missing, so every one of
its endpoints returned 500.

### The part that was not mechanical

`playbookRoutes.ts` answered an empty read with **two hardcoded template objects
under `success: true`**:

```ts
if (result.rows.length === 0) {
  const defaultWorkflows = [ /* two invented ICH templates */ ];
  return res.json({ success: true, data: defaultWorkflows });
}
```

While the table did not exist the query **threw**, so that branch was
unreachable and the 500 was honest. **Creating the table would have made it
live** — turning an honest failure into invented data presented as records. The
migration alone would have made the product less truthful than it was.

So the branch was deleted in the same commit, and the twelve real templates are
now seeded rows. **Generalise this before provisioning any other surface in §8:
check what the handler does with an empty result before you give it one.** An
empty-result fallback is invisible while the table is missing.

### Where the schema came from

A correct DDL file already sat at `server/database/cmc-playbook-schema.sql`, on
**no applier** — not `install-fresh`, not `deploy-migrate`, not drizzle push.
That is precisely why the tables were missing. It was **moved**, not copied:
`ci:duplicate-table-ddl` scans 573 non-archived `.sql` files, so a second
creator is a new duplicate, and the working agreement requires the parallel path
to be deleted in the same change.

Four deliberate changes, each with a dated note in the migration:

| Change | Why |
|---|---|
| `cmc_workflows` omits the `organizations` FK | Its seed writes `organization_id = 0`, the platform's documented shared tenant (`playbookRoutes.ts:41`, `tenantRls.ts:93`, `authedOrgId.ts:55`). `organizations.id` is `serial` and **no applied migration inserts any organizations row**, so org 0 does not exist and the FK would fail the seed at apply time. The other four tables keep it. |
| `cmc_workflow_tasks` gains `organization_id INTEGER NOT NULL` | It had no tenant column, which puts a table outside the population **every** RLS sweep operates on — the exact cause `check-unkeyed-request-tables.mjs` was written for. `playbookRoutes.ts` now supplies it; column and code had to land together. |
| `command` is `TEXT`, not `VARCHAR(255)` | It stores `req.body.command`, unbounded client input. |
| Row-count assertion on the seed | RULE 1: seed data reaching a deployed database cannot be corrected in place, so a truncated seed must fail at apply time. |

`cmc_checklist_items` and `cmc_guideline_access` were **not** carried over — no
TypeScript references either. Don't provision a table before it is real.

### Verified, including by making each check fail

- Applies to a bare database and **replays cleanly** (still 12 rows) — RULE 1.
- Seed assertion proven: deleting one row from the literal fails apply with
  *"expected 12 rows at organization_id = 0, found 11"*.
- Ordering proven load-bearing: moving the entry after the sweep turns
  `ci:migration-set-order` red; restored, green.
- `tests/schema-contract/cmc-playbook-schema.contract.test.ts` (13 tests) pins
  every handler statement **extracted from source**, so it cannot drift. Both
  regressions were induced and caught: dropping `organization_id` from the tasks
  INSERT, and restoring the fabricating fallback.
- `tables-live-schema-baseline.json` 47 → 42, hand-edited, exactly those five.

### Still NOT provisioned: `reg_*` / the portfolio surface

`/api/cmc/blueprint/portfolio/*` is equally live, but provisioning it was
**refused** — three blockers, all evidenced:

1. **Nothing writes the data.** No file in the repo INSERTs into
   `reg_submissions` or `reg_m3_sections`. They are read-only. Provisioning
   yields permanently empty tables and a feature that is inert while *looking*
   provisioned. The single INSERT anywhere in the group is
   `reg_rpi_snapshots` at `portfolio.ts:187`, which derives from the two empty ones.
2. **The only DDL contradicts the code.** `db/migrations/_legacy/060_regulatory_foundation.sql:25`
   defines one `upstream_json jsonb`; the code needs three separate columns —
   `up_proc`, `up_quality`, `up_stability` (`rpi.ts:35,42,49`, `portfolio.ts:112,254`).
   `upstream_json` appears in no TypeScript; the three `up_*` appear in no SQL.
   Both `_legacy` trees are walked by no applier.
3. **The status domain disagrees.** Code treats `'LOCKED'` as terminal
   (`portfolio.ts:111,253`, `rpi.ts:24`); the DDL enumerates
   `'MISSING','DRAFT','READY','COMPLETE'` with no `'LOCKED'`. A `COMPLETE`
   section would be counted as *missing*.

Authoring a shape no migration ever agreed on, for tables nothing fills, is
schema invention. It needs a product decision about where submissions data comes
from — not a guess from this lane.

### Two findings handed on, not fixed here

- **`reg_submissions` is read with no tenant filter in two places.**
  `server/src/services/reg/rpi.ts:17` (`where sub_id=$1` only) relies on its
  caller having already scoped by `tenant_id`; `server/src/services/integrations/gmail.ts:89`
  does `SELECT sub_id … ORDER BY created_at DESC LIMIT 1` with no filter at all,
  returning the newest row **across all tenants**. Only reachable through
  `gmailIngestToReg`, which nothing calls — dead today, a cross-tenant read the
  moment it is wired up.
- **`playbookRoutes.ts:444` `generateFallbackResult`** returns synthesized
  regulatory prose when the AI call fails, persisted into
  `cmc_ai_tool_executions.result`. It is at least labelled `status: 'fallback'`
  (line 421). Left alone deliberately — a different concern from this migration,
  and `server/api/` is outside the WO-16C fabrication sweep's stated scope of
  `server/services/` and `server/routes/`, so it belongs to nobody right now.

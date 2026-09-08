# GA ops / procurement runbook — 2026-08

**Branch:** `claude/medical-device-regulatory-modules-lfpw5m` · **Written:** 2026-08-14 ·
**Machine-checkable companion:** `node scripts/ops/ga-readiness-report.mjs`

## What this document is

This platform is built to **fail closed on missing licensed assets and credentials**.
That is a design choice, not a defect: every submission path refuses to produce an
artifact it cannot honestly produce, and says exactly why. The consequence is that
GA does not depend only on code — it depends on a **procurement and ops checklist**
that has to be executed by people who do not write code.

Every claim below is traceable to a file, a line, and an environment variable.
Nothing here is asserted as ready on the strength of a comment, a doc, or an
intention. Where something is blocked, the row names the gate that blocks it, who
owns unblocking it, what "done" looks like, and the exact command or endpoint that
flips it from blocked to ready.

Three verification runs stand behind this document, executed on 2026-08-14:

| Run | Result |
|---|---|
| `node scripts/ops/submission-preflight.mjs` | exit 1 — **0/17 licensed artifacts present** |
| `node scripts/ops/ga-readiness-report.mjs` | exit 1 — **3/40 rows ready, 18 blockers outstanding** (re-run 2026-08-14 after B21 landed; the 3 ready rows are the tenant entitlement switches, which are ready when *unset*) |
| `npm run qualify:ectd` | **Overall: PASS** — 5/5 regions+versions, 0 validator errors |

That contrast is the whole story: the engine qualifies green, and every procurement
row is empty.

---

## 1. Blocker register

Each row states the gate as `file:line` plus the env flag that controls it. "Verify"
is the command or endpoint whose output changes when the item lands — not a
subjective sign-off.

### B1 · FDA eSTAR interactive PDF templates

| | |
|---|---|
| **What** | The 9 official FDA eSTAR / PreSTAR2 interactive AcroForm PDFs. CDRH/CBER ingests **the official PDF**, not a ZIP of separately-rendered section PDFs. |
| **Observed** | `assets/estar-templates/` contains only `README.md`. 0 of 9 templates vendored. |
| **Why it blocks** | `server/services/pathway-engines/estar/estar-fill.ts:106` pushes a blocker and returns `filled:false` when the template is absent. `POST /api/510k/estar/official` (`server/routes/510k-estar-routes.ts:613`) then answers **422 `ESTAR_NOT_PRODUCIBLE`** rather than emitting a PDF. In production with `ESTAR_REQUIRE_TEMPLATE=true`, `estar-template-registry.ts:173` also blocks the build. |
| **Env flag** | `ESTAR_REQUIRE_TEMPLATE` (`estar-template-registry.ts:197`), `ESTAR_TEMPLATE_DIR` (`:95`) |
| **Owner** | **Procurement / Regulatory Ops** — download from FDA; no purchase, but a deliberate acquisition + version pin. |
| **Done means** | All 9 filenames from `ESTAR_TEMPLATE_MANIFEST` (`estar-template-registry.ts:80–92`) present in `assets/estar-templates/`, and the `version` field in the manifest changed from `'unset'` to the vendored FDA revision. Several descriptors may point at the same physical PDF (one nIVD eSTAR carries 510(k)/De Novo/PMA). |
| **Version caution** | `ESTAR_RETIREMENT_DATE = '2026-08-03'` (`estar-versions.ts:76`). As of today nIVD/IVD **6.2** and PreSTAR **2.2** are past retirement. Vendor nIVD/IVD **7.0** and PreSTAR **3.0**. |
| **Verify** | `node scripts/ops/submission-preflight.mjs` — the `estar_template` rows flip to `[x]`. Then `GET /api/510k/estar/readiness?type=510k&variant=device` reports `templateAvailable:true`. |

### B2 · eSTAR canonical → AcroForm field maps

| | |
|---|---|
| **What** | The per-descriptor map from our canonical field keys to the **exact** AcroForm field names inside each vendored eSTAR PDF. |
| **Observed** | All 9 maps in `server/services/pathway-engines/estar/estar-field-map.ts:33–45` are literal `{}`. |
| **Why it blocks** | `estar-fill.ts:113` pushes a second, independent blocker when `isFieldMapPopulated(descriptorId)` is false. **B1 landing does not clear B2** — a vendored template with an empty map still yields `filled:false`. |
| **Env flag** | None. This is a **version-pinned data change in tracked source**, deliberately not env-driven: a wrong `acroField` would silently fail to fill the official form, so the file states honestly that it does not guess. |
| **Owner** | **Engineering (regulatory pathway)**, executing after Procurement delivers B1. Not an ops toggle. |
| **Done means** | Every descriptor whose pathway you intend to file has a non-empty map, each `acroField` copied verbatim from `listAcroFields()` output against the vendored PDF and eyeballed against the form. |
| **Verify** | `GET /api/510k/estar/readiness` reports `fieldMapPopulated:true` and `ready:true` **on its own** — the readiness probe derives both booleans from `fillEstarSubmission`, so no code change is needed to flip it. Full procedure in §3. |

### B3 · eCTD DTDs (ICH backbone + 4 regional)

| | |
|---|---|
| **What** | `ich-ectd-3-2.dtd`, `us-regional-v3-3.dtd`, `eu-regional.dtd`, `jp-regional.dtd`, `ca-regional.dtd` — vendored into `assets/ectd-dtd/`, bundled into every generated package at `util/dtd/`. |
| **Observed** | `assets/ectd-dtd/` holds `README.md`, `.gitignore`, `checksums.txt` (placeholder comments only), and `fixtures/`. **0 of 5 DTDs.** The `checksums.txt` manifest has **0 non-comment entries.** |
| **Why it blocks** | Every backbone the packager emits carries a `DOCTYPE … SYSTEM "util/dtd/…"` pointing at a file the package does not contain (`server/services/submission-gateways/regional-packager.ts` `buildIndexXml` / `buildFdaBackbone` / `buildEmaBackbone` / `buildPmdaBackbone` / `buildHcBackbone`). `server/services/ectd/dtd-bundler.ts:143` raises a blocker under `ECTD_REQUIRE_DTD` in production. Until then packages are self-declared **not submission-ready**. |
| **Env flag** | `ECTD_REQUIRE_DTD` (`dtd-bundler.ts:163`), `ECTD_DTD_DIR` (`:75`) |
| **Owner** | **Procurement / Regulatory Ops** acquires (this build environment's egress policy blocks the agency sites — fetch from a network-permitted machine). **Engineering** commits verbatim + records checksums in the same commit. |
| **Done means** | All 5 files committed with their agency license headers intact, `checksums.txt` carrying 5 real `sha256sum`-format lines, and an entry in `docs/runbooks/ectd-dtd-vendoring.md` recording source URL / spec version / date / who fetched. Filenames are **load-bearing** — renaming any one breaks self-containment. |
| **Verify** | `npm run qualify:ectd` — the per-region note *"No DTDs vendored … DTD validity is skipped"* disappears and an `xmllint --dtdvalid` validator row appears and passes for each region. Also `node scripts/ops/ga-readiness-report.mjs` flips both `ectd-dtds` and `ectd-dtd-checksums`. |

### B4 · LORENZ eValidator licence (agency-grade eCTD validation)

| | |
|---|---|
| **What** | A licensed agency-grade eCTD validation engine. **No agency-grade validation has ever run against a package this platform produced.** |
| **Observed** | Neither `EVALIDATOR_BINARY` nor `EVALIDATOR_ENDPOINT` is set. `resolveExternalValidator()` (`server/services/ectd/external-validator/index.ts:32`) therefore falls through the LORENZ adapter and the FDA-criteria fallback to `NoopExternalValidator`, which reports `ran:false` — never a false green. |
| **Why it blocks** | `server/services/ectd/external-validator/gate.ts:52` — under `ECTD_REQUIRE_EVALIDATOR` in production, a validation that could not run **is itself a blocker**: you cannot prove the package passes the agency validator, so you must not transmit. |
| **Env flag** | `ECTD_REQUIRE_EVALIDATOR` (`external-validator/config.ts:23`), `EVALIDATOR_BINARY` / `EVALIDATOR_ENDPOINT` (`:10`), `EVALIDATOR_PROFILE_<REGION>` (`:15`) |
| **Interim mitigation** | A **licence-free FDA-criteria subset** exists and is opt-in: `EVALIDATOR_USE_FDA_CRITERIA_FALLBACK=true` (`fda-criteria-adapter.ts:32`). It raises the floor and is explicitly **not** a substitute — `resolveExternalValidator` prefers LORENZ whenever configured. Turn it on now; it costs nothing and surfaces real findings. |
| **Owner** | **Procurement** (licence) + **Ops** (install the engine into the deploy image / stand up the endpoint). |
| **Done means** | Licence purchased, engine reachable, `EVALIDATOR_BINARY`/`EVALIDATOR_ENDPOINT` and a per-region profile set, and one real package validated end-to-end with the findings triaged. |
| **Verify** | `npm run qualify:ectd` — the note *"No external eValidator configured"* disappears and a named eValidator row appears in each region's `validators[]` with `ran:true`. |

### B5 · FDA ESG credentials (and 12 other gateway credential sets)

| | |
|---|---|
| **What** | Per-agency production transport credentials. The registry (`server/services/submission-gateways/index.ts:41–55`) holds **13 gateway entries across 12 regulators**: FDA ESG, EMA CESP, EUDAMED, PMDA, Health Canada CESG, MHRA, NMPA, TGA eBS, Swissmedic, ANVISA, CDSCO SUGAM, MFDS dBIO, HSA PRISM. |
| **Observed** | **Zero** credential variables set for any gateway. |
| **Why it blocks** | Each gateway's credential preflight throws `CredentialError` naming the exact missing vars — e.g. `server/services/submission-gateways/fda-esg.ts:82–88` requires `FDA_ESG_URL`, `FDA_ESG_AS2_FROM`, `FDA_ESG_CERT_PATH`, `FDA_ESG_KEY_PATH`, `FDA_ESG_FDA_CERT_PATH` (staging uses the `FDA_ESG_STAGING_` prefix). |
| **Env flags** | See the `GATEWAY_CREDENTIALS` table in `scripts/ops/ga-readiness-report.mjs` — it mirrors each gateway's preflight var list. |
| **Owner** | **Regulatory Ops** (agency account registration, cert issuance) + **Ops** (load into the production secrets manager, never a committed `.env`). |
| **Code state** | FDA ESG AS2-over-HTTPS + SFTP is **real protocol code** (RFC 4130 framing, mTLS, MDN handling, ack1/ack2/ack3). The other 12 are **interface-complete and unexercised** — real HTTPS/mTLS transports with agency-specific auth, but no live traffic has ever run through any of them. |
| **Known gap in the AS2 code** | PKCS#7 envelope signing/encryption is not implemented; the current implementation frames + signs and relies on TLS for confidentiality (`fda-esg.ts:126–133` comment). The comment defers to `docs/runbooks/fda-esg-setup.md` — **that file does not exist**; the nearest real runbooks are `docs/runbooks/esg-production-setup.md` and `docs/runbooks/fda-esg-production-uat.md`, and neither carries the PKCS#7 follow-up. **Confirm with FDA during UAT that TLS-protected AS2 is accepted for your account** before treating this as closed, and land the follow-up in a runbook that exists. |
| **Roadmap (not a blocker)** | **FDA ESG NextGen** retired WebTrader in **April 2025** and now offers a **REST API** path alongside AS2. `docs/COMPETITIVE_LANDSCAPE_2026-08.md:118` records the NextGen REST adapter as a backlog item. AS2 remains valid; treat REST as a Phase-6 adapter, not a GA gate. |
| **Done means** | ESG account issued, certs installed on the deploy host, vars in the secrets manager, and the UAT in `docs/runbooks/fda-esg-production-uat.md` executed against FDA's pre-production environment with a real ack1 observed. |
| **Verify** | `gatewayConfigurationStatus(orgId, 'production')` (`submission-gateways/index.ts:180`) reports `configured:true` for `fda:esg` — surfaced by `GET /api/submissions` (`server/routes/submissions.ts:161`) and the MDX gateway routes. Then `npx tsx scripts/fda-esg-uat-smoke.ts` for the live handshake. |

### B6 · MedDRA licence (and WHODrug)

| | |
|---|---|
| **What** | The MedDRA (MSSO) and WHODrug (UMC) proprietary coding dictionaries. |
| **Observed** | `MEDDRA_DICTIONARY_PATH` and `WHODRUG_DICTIONARY_PATH` both unset. |
| **Why it blocks** | `server/services/medical-coding/medical-coding-service.ts:264` returns `status:'license_required'` with **no code** when unset; `:302` (`codeWhodrug`) does the same. The platform never fabricates a coded term. Downstream: E2B(R3) ICSRs and the PV case-intake PT picker (`server/routes/pharmacovigilance-routes.ts:665`) cannot code. |
| **Env flag** | `MEDDRA_DICTIONARY_PATH` (`:114`), `WHODRUG_DICTIONARY_PATH` (`:115`) |
| **Owner** | **Procurement** — MSSO / UMC subscriptions, both annual and organisation-scoped. |
| **Done means** | Subscriptions active, dictionaries exported to the documented `MeddraRow`/`WhodrugRow` shape, files placed on the deploy host, env vars pointing at them, and the version recorded (`terminologyVersions['MEDDRA'].version_code` — the exporters currently fall back to `'27.1'` at `server/services/grdhe/exportGenerators/emaAEE2BR3.ts:477`; that fallback must be replaced by the real licensed version). |
| **Verify** | `node scripts/ops/ga-readiness-report.mjs` flips `meddra-licence` / `whodrug-licence`; a `codeMeddra()` call returns `status:'coded'` rather than `'license_required'`. |

### B7 · E2B(R3) ICSR gateway — **credentials are not sufficient**

| | |
|---|---|
| **What** | Live transmission of E2B(R3) ICSRs to a safety gateway. |
| **Observed** | `ICSR_GATEWAY_URL` and credentials unset. |
| **Why it blocks — and how this differs from B5** | Two gates, and **the second is code, not procurement**. (1) With no gateway configured, production throws `IcsrGatewayNotConfiguredError` (`server/services/ind-lifecycle/icsr-gateway-transport.ts:211`) rather than fabricate an ACK. (2) **With a gateway configured, `transmitIcsr` still refuses** — `:189–200` throws *"ICSR gateway transport client is not implemented … Refusing to fabricate a gateway acknowledgement."* Provisioning credentials moves this from one refusal to a different refusal. |
| **Env flags** | `ICSR_GATEWAY_URL`, `ICSR_GATEWAY_USERNAME`, `ICSR_GATEWAY_PASSWORD`, `ICSR_GATEWAY_CERT_PATH` (`:89–92`) |
| **Owner** | **Engineering** (build the AS2/SFTP transport client) **then** **Regulatory Ops** (credentials). Ordering matters — credentials first buys nothing. |
| **Done means** | Transport client implemented and unit-tested, then credentials provisioned, then one real ICSR round-tripped in the agency's test environment. |
| **Verify** | `transmitIcsr` returns a receipt with `simulated:false, status:'transmitted'`. Today the only non-throwing outcome is a non-production receipt explicitly marked `SIMULATED-`. |

### B8 · `RLS_ENFORCE=on` flip

| | |
|---|---|
| **What** | Turning Postgres Row-Level Security from *compiled but bypassed* to *actively filtering*. |
| **Observed** | `RLS_ENFORCE` unset in this environment. |
| **Why it blocks** | `server/db/rlsEnforcement.ts:76–105` — production **refuses to boot** unless `RLS_ENFORCE` is exactly `on`; aliases (`enforce`/`true`/`1`) are rejected in production so `grep RLS_ENFORCE=on` is the whole audit. Fired at import from `server/config/environment.ts:283`. |
| **Env flag** | `RLS_ENFORCE` (canonical literal `on`) |
| **Owner** | **DB owner / Ops** — this is a deploy-env change, not a code change. |
| **Evidence it is safe to flip** | `docs/RLS_ENFORCEMENT_BURNDOWN.md` records status **evidence complete (2026-08-13)**: `tests/schema-contract/rls-two-tenant-full-schema.contract.test.ts` seeds two tenants into 220 of 222 policied tables, drops to a `NOSUPERUSER NOBYPASSRLS` role, and asserts zero cross-tenant leaks in both directions, own-rows-still-visible, fail-closed with no scope, `WITH CHECK` rejection, and `FORCE` on every RLS table — with a negative control that must go red if seeding breaks. CI additionally runs `scripts/db/rls-coverage-check.sql` (`.github/workflows/ci.yml:846`) so no org-keyed table can ship unpoliced. |
| **Done means** | `RLS_ENFORCE=on` set in the production environment and the app boots clean. Watch `tenant_session_var_missing_total` for scheduled-worker paths that forgot a scope. |
| **Verify** | Boot the production image; `assertRlsEnforcementForProduction` returns `'on'` instead of throwing. `npm run pilot:go-no-go` gate 2 flips from WARN/FAIL to PASS. |

### B9 · Corpus ingestion sweep

| | |
|---|---|
| **What** | The precedent corpus (CT.gov flywheel) that the RAG/precedent surfaces retrieve from. |
| **Observed** | `ENABLE_CORPUS_INGESTION` not `true` — the sweep is a no-op. |
| **Why it blocks** | `server/jobs/corpusIngestionSweep.ts:153` self-guards to a no-op unless the flag is `true`; `planFromEnv` (`:72`) additionally produces an **empty plan** when `CORPUS_INGESTION_INDICATIONS` is empty, so the flag alone still ingests nothing. Product consequence: honest cold-start ("insufficient data, low confidence") rather than fabrication — correct, but thin. |
| **Env flags** | `ENABLE_CORPUS_INGESTION`, `CORPUS_INGESTION_INDICATIONS`, `CORPUS_INGESTION_PHASES`, `CORPUS_INGESTION_LIMIT`, `CORPUS_INGESTION_CRON` |
| **Owner** | **Ops** (schedule + outbound access to clinicaltrials.gov) + **Product** (choose the indication set). |
| **Done means** | Flag on, a real indication list configured, and a backfill run so the corpus is non-trivial at launch rather than filling weekly from zero. |
| **Verify** | `node scripts/verify-rag-corpus.mjs` reports non-zero row counts **with embeddings**. Backfill on demand with `tsx scripts/ingest-corpus.ts --indication "<cond>" --phase 3 --limit 100` (`--dry-run` first). |

### B10 · Email OTP proven to real external inboxes

| | |
|---|---|
| **What** | Login OTP over email is **mandatory 2FA**. If SMTP does not truly deliver, nobody can log in. |
| **Observed** | `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` all unset. |
| **Why it blocks** | `server/services/emailService.ts` `isEmailConfigured()` returns false → the transporter is `null` and mail is silently not sent. `server/startup/services.ts:277–291` logs **CRITICAL** in production. Note the sharper risk: *configured* is not *delivering*. |
| **Env flags** | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_PORT` (default 465; `secure` is **derived from the port**, not from any env var), `SMTP_FROM` |
| **Owner** | **Ops** |
| **Done means** | A real OTP delivered to at least one Gmail **and** one Outlook/corporate inbox, not just a `transporter.verify()` handshake. Beware look-alike vars: `SMTP_PASSWORD`, `SMTP_SECURE`, `EMAIL_FROM`, `MAIL_FROM` are **ignored** on the OTP path. |
| **Verify** | `npm run pilot:verify-otp -- you@example.com` — the script mirrors `emailService.ts` verbatim (PREFLIGHT → CONNECT → SEND → GUIDANCE), classifies failures as auth/DNS/TLS/timeout/firewall, and exits non-zero on any failure. Keep the output as evidence. |

### B11 · Backup / restore rehearsal

| | |
|---|---|
| **What** | A proven path back from data loss: RPO/RTO, a real `pg_dump` + restore, a runbook. |
| **Observed** | **No DR runbook exists** at any expected path. `scripts/backup.sh` archives **source code only** (`client/`, `server/`, `shared/`, configs) — it does not touch the database. |
| **Why it blocks** | There is no code gate here; this is a pure operational obligation, which is exactly why it is easy to skip. `docs/audit-2026-07/10-infra-and-ops.md:72–73` records that **both** "restore from backup" and "reprovision from source" are unproven paths today, and `:144` sizes the remediation at P1 / 3 weeks. |
| **Owner** | **Ops / DB owner** |
| **Done means** | Neon PITR/branching confirmed on; one real `pg_dump` + restore into a scratch branch executed end-to-end; RPO/RTO written down; a committed runbook naming the rehearsal date and the operator. Account for boot-time schema mutation (`server/db/ensureCoreTables.ts`) when reasoning about a from-scratch rebuild. |
| **Verify** | `node scripts/ops/ga-readiness-report.mjs` flips `backup-restore-rehearsal` once the runbook is committed — **and the runbook must record a real rehearsal, not merely exist.** The script can only see the file; a human signs off that the restore actually ran. |

### B12 · CI coverage thresholds

| | |
|---|---|
| **What** | Coverage measured **and enforced** in CI. |
| **Observed** | `.github/workflows/ci.yml:502` `coverage` job runs with `--coverage.thresholds.lines=0 --coverage.thresholds.functions=0 --coverage.thresholds.branches=0 --coverage.thresholds.statements=0` **and** `continue-on-error: true`. It measures; it can never fail a PR. The target `70/60/70/70` lives in `vitest.config.ts:60–65` and is not currently reachable. |
| **Correction to the brief** | The CI comment refers to a `test:coverage` npm script; **no such script exists** in `package.json`. The overrides are inlined in the workflow. Anyone told to "drop the threshold overrides in `test:coverage`" will not find it — edit `.github/workflows/ci.yml:564`. |
| **Owner** | **Engineering** |
| **Done means** | Real coverage at or above the `vitest.config.ts` target, then the four `--coverage.thresholds.*=0` overrides and `continue-on-error` removed in the same PR. |
| **Verify** | The `coverage` job fails a PR that regresses below the threshold. Until then treat all coverage numbers as advisory. |

### B13 · `SENTRY_DSN` / error monitoring

| | |
|---|---|
| **What** | Error monitoring and paging. |
| **Observed** | `SENTRY_DSN` unset. |
| **Why it blocks** | `server/startup/env.ts:82` lists it as *recommended* in production and warns (it does not refuse to boot). `server/utils/sentry.ts:5` and `client/src/utils/sentry.ts:3` are inert without a DSN, so **every unhandled server and client exception in production is invisible**. |
| **Env flags** | `SENTRY_DSN` (server), `VITE_SENTRY_DSN` (client) |
| **Owner** | **Ops** |
| **Done means** | Both DSNs set **and** a deliberately-thrown test exception observed reaching an on-call human — presence of the var is not proof of paging. |
| **Verify** | `npm run pilot:go-no-go` gate 6 flips from WARN to PASS; then throw a test exception and confirm the page. |

---

## 2. Blockers found that were not on the brief

These were discovered while re-verifying the list above. Each carries its own evidence.

### B14 · eCTD v4.0 RPS message schema not vendored

`assets/ectd-schema/` holds a README + placeholder `checksums.txt` and **no `.xsd`
files**. `server/services/ectd/schema-bundler.ts` requires `rps-message.xsd` for a
v4.0 package (`requiredSchemasForVersion`), and `assessSchemaReadiness` (`:105`)
blocks under `ECTD_REQUIRE_RPS_SCHEMA` (`:132`). The live qualification run confirms
it: `qualification-reports/v4.0-fda.json` note — *"RPS XSD validation skipped —
vendor the ICH RPS message schema into `assets/ectd-schema/` (rps-message.xsd) to
enable it."* The ICH implementation package is **licensed**; `rps-message.xsd` is
gitignored and must not be committed. `genericode.xsd` (OASIS, redistributable) is
accepted but not required.
**Owner:** Procurement (ICH licence). **Only gates an eCTD v4.0 sequence, not v3.2.2.**

### B15 · PDF/A toolchain absent from the deployment image

`ECTD_REQUIRE_PDFA` (`server/services/ectd/pdfa-readiness.ts:100`) folds into the
pre-transmit gate (`server/services/submission-gateways/pre-transmit-check.ts`), but
the conversion/validation pipeline shells out to **Ghostscript** and **veraPDF**
(`server/services/ectd/pdfa-pipeline.ts:27` carries an explicit deployment TODO;
binary resolved from `VERAPDF_BINARY`/`VERAPDF_COMMAND`). Turning the flag on before
those binaries are in the image converts a silent gap into a hard production block.
**Owner:** Ops (deploy image). **Verify:** `npm run pilot:go-no-go` gate 7 (PDF export
capability — chromium + veraPDF) reports PASS.

### B16 · The 510(k) ESG transmit path used by the ANA/MDX surface has no transport

There are **two** ESG code paths and only one of them is real.
`server/services/submission-gateways/fda-esg.ts` is the real AS2/SFTP implementation.
But `server/services/ana-ri/mdx-command-handlers.ts:650` — the 510(k) "transmit"
action — instantiates `server/services/ESGSubmissionService.ts`, whose
`transmitToESG` (`:337–356`) **throws `not-implemented` in every non-simulation
environment**, and whose `downloadAcknowledgment` (`:597–603`) does the same. It fails
closed correctly (simulation is opt-in and restricted to `NODE_ENV` exactly
`development`/`test`, `:59–62`, and the local record is stamped *"THIS IS NOT AN
AGENCY ACKNOWLEDGEMENT"*), so there is no fabrication hazard — but **a first real
510(k) e-submission from that surface is blocked by missing code, not by missing
credentials.** `docs/runbooks/esg-production-setup.md` still carries
`Status: TODO — production transport not implemented` with unassigned owners.
**Owner:** Engineering — either wire `ESGSubmissionService` through the real
`getGateway('fda','esg')` path, or route the 510(k) surface at the real gateway
directly. **This is the single highest-value item on the 510(k) critical path after
B1/B2.**

### B17 · `AUDIT_HMAC_KEY` must be provisioned or the risk explicitly accepted

`server/services/audit/auditSealPosture.ts:81` — production **refuses to boot** with
no `AUDIT_HMAC_KEY` unless `AUDIT_SEAL_ACCEPT_UNSEALED=true` is set to record the
accepted risk; a key shorter than 32 chars refuses regardless. Fired at import from
`server/config/environment.ts:291`. The public SHA-256 hash chain still runs
unsealed, so this is a defence-in-depth choice — but it is a **boot-blocking
decision** somebody must make before the first production start.
**Owner:** Ops / Security (key held outside the app database).

### B18 · `MFA_ENCRYPTION_KEY` must be provisioned

`server/config/environment.ts:259–275` — production refuses to boot without a
dedicated `MFA_ENCRYPTION_KEY` of at least 32 characters; MFA secrets must not be
encrypted under a `JWT_SECRET`-derived key in production. **Owner:** Ops / Security.

### B19 · AI content-safety gates default permissive

`AI_PII_ENFORCEMENT` defaults to `audit` (not `block`) and `AI_GROUNDEDNESS_ENFORCE`
defaults off. `server/startup/ai-governance-posture.ts:63` warns loudly in production
and only **fails closed** when `AI_GOVERNANCE_REQUIRE_ENFORCE=true`. For a real-PHI /
paying-customer posture, set `AI_PII_ENFORCEMENT=block` and
`AI_GROUNDEDNESS_ENFORCE=1`, then set `AI_GOVERNANCE_REQUIRE_ENFORCE=true` so the
posture is boot-checked rather than assumed. **Owner:** Ops + AI governance owner.

### B20 · Ordering hazard on the enforcement flags

The five `*_REQUIRE_*` flags are **not** "turn on for safety" switches — each converts
a missing artifact from a warning into a hard production block. Setting
`ECTD_REQUIRE_DTD=true` before B3 lands blocks every production eCTD package; setting
`ECTD_REQUIRE_EVALIDATOR=true` before B4 lands blocks every production dispatch on
"validator did not run"; setting `ESTAR_REQUIRE_TEMPLATE=true` before B1 lands blocks
every production eSTAR build. **Flip each flag in the same change window as the
artifact it enforces, never before.** `RLS_ENFORCE=on` is the exception — its
artifact (the policies) is already provisioned, so it flips independently.

### B21 · FDA recognized consensus standards dataset not vendored

A 510(k) has to declare conformity to the consensus standards FDA recognizes for
the device, and a submitter's first question at intake is which those are.
**openFDA has no endpoint for this.** It serves `device/classification.json`,
`device/510k.json`, MAUDE, recalls, registration/listing and GUDID; FDA publishes
the recognition database separately, through the CDRH Recognized Consensus
Standards search
(<https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfStandards/search.cfm>).
So this cannot be closed by an API client — it is an acquisition, like B1 and B3.

`assets/fda-recognized-standards/` holds a `README.md` and a `.gitignore`;
**0 records vendored.** The code half is built and tested:
`server/services/fda-recognized-standards/recognized-standards-dataset.ts` reads
the drop-point (or `FDA_RECOGNIZED_STANDARDS_DIR`) and validates it whole-file —
a malformed or unprovenanced dataset is reported **absent**, never partially
loaded, because a half-parsed regulatory dataset answers some product codes
correctly and others with a silent empty.
`recognized-standards.service.ts` returns one of three explicitly labelled
outcomes and `GET /api/510k/device/standards` passes them through unchanged:
dataset-not-held, dataset-held-and-lists-nothing, and here-is-FDA's-list. The
510(k) intake panel renders all three separately. Nothing anywhere seeds,
infers, or scores a standard.

**No `*_REQUIRE_*` flag was added, deliberately.** Per B20 those flags convert a
missing artifact into a hard production block, and each one must gate a real
artifact-dependent production path. Nothing in a 510(k) build depends on this
dataset — the gate is the labelled empty state at the query, which is always on.
An enforcement flag with nothing behind it would be a phantom gate.

**Severity: advisory, not blocker.** A 510(k) can be filed with the standards
identified by hand. What is lost without the dataset is the intake-time mapping
Essenvia and Formly surface, not the filing itself, so this row does not gate the
readiness report's exit code.

**Owner:** **Procurement / Regulatory Ops** — export the CDRH database, normalize
it into the shape in `assets/fda-recognized-standards/README.md`, record the
provenance block (source, FDA Recognition List number, publication date,
retrieval date, retriever). The loader refuses a dataset with no provenance:
an unsourced recognition list is indistinguishable from someone's notes, and
this is content a submitter will cite to FDA.

**The rule that governs the acquisition:** never write a standard against a
product code FDA has not published it against. If FDA publishes no product-code
association for a standard, `productCodes` is `[]` — an empty list is a true
statement, and an inferred one is a regulatory claim nobody made. Do not merge in
a consultant's or a vendor's curated list and present it as FDA's.

**Not the same as the `/api/standards` path.**
`server/services/regulatory-graph/standards-applicability.service.ts` recommends
applicability *per program* with deterministic rules and confidence scores over
the internal `device_test_standards` catalog, and persists human decisions. That
is a recommender. This is FDA's published fact, keyed by product code, with no
inference. The first may consume the second later; it must never present the
second's data as its own recommendations.

**Done means:** the normalized export at
`assets/fda-recognized-standards/fda-recognized-consensus-standards.json` (or
`FDA_RECOGNIZED_STANDARDS_DIR`), carrying a provenance block whose
`recognitionListNumber` matches FDA's current Recognition List. Treat a new FDA
Recognition List as a fresh acquisition, not a hot-swap.
**Verify:** `node scripts/ops/ga-readiness-report.mjs --all` — the
`fda-recognized-standards` row flips from `[ ]` to `[x]` and reports the record
and product-code counts it observed. Then `GET /api/510k/device/standards?ident=<program>`
answers `available:true` with `datasetLoaded:true`. Presence is not proof the
export is current; the recognition-list number against FDA's is the human half.

---

## 3. The eSTAR field-map procedure

This is the one blocker whose second half is engineering work, so it gets step-by-step
treatment. Follow it once per descriptor you intend to file.

**Precondition:** you hold the official FDA eSTAR PDF for the descriptor (B1).

### Step 1 — Vendor the PDF

Place the file in `assets/estar-templates/` under the exact name from
`ESTAR_TEMPLATE_MANIFEST` (`estar-template-registry.ts:80–92`), e.g.
`eSTAR-510k-non-ivd.pdf`. Or point `ESTAR_TEMPLATE_DIR` at a directory holding it.
Several descriptors legitimately resolve to the same physical FDA PDF — the one nIVD
eSTAR carries 510(k), De Novo and PMA — so a maintainer may copy the same file under
each expected name.

Confirm it is seen:

```
node scripts/ops/submission-preflight.mjs | grep eSTAR-510k-non-ivd
```

Then pin the revision: change that descriptor's `version` from `'unset'` to the FDA
template revision you downloaded. A version bump later is a tracked asset update that
**forces re-validation of the map** (step 3).

### Step 2 — Run the scaffold endpoint

`POST /api/510k/estar/scaffold-field-map` (`server/routes/510k-estar-routes.ts:515`,
mounted at `/api/510k/estar` by `server/bootstrap/register-regulatory-routes.ts:30`)
is a maintainer tool. It requires authentication and editor access. It enumerates the
real AcroForm fields via `listAcroFields` (`server/services/forms/fill-official-pdf.ts:266`)
and emits a skeleton.

```
curl -sS -X POST https://<host>/api/510k/estar/scaffold-field-map \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"type":"510k","variant":"device"}' | jq .
```

Pass `{"type":..., "variant":..., "templateBase64":"<base64 of the PDF>"}` instead if
you want to scaffold before vendoring. With neither, the endpoint answers **422
`ESTAR_TEMPLATE_UNAVAILABLE`** naming the expected filename — it never guesses.

The response carries:

- `descriptorId` — the key you will populate in `ESTAR_FIELD_MAPS`
- `fieldCount` / `fillableCount`
- `skeleton` — `{ <slugified-placeholder-key>: { acroField: "<exact real name>", type } }`
  for every text / checkbox / dropdown / radio field
- `nonFillable` — buttons, signatures, option lists (reported, not mapped)
- `note` — restating that the keys are **placeholders**

The endpoint slugifies the real AcroField names into placeholder keys
(`slugifyAcroFieldName`, `:486`). It does **not** invent canonical keys, and it
de-duplicates collisions with a numeric suffix.

### Step 3 — Verify each canonical key against the real AcroForm

This is the step that cannot be automated, and the reason the map ships empty.

For each entry in the skeleton:

1. Open the vendored PDF and locate the field. Confirm the `acroField` string matches
   **byte for byte** — FDA names often carry container prefixes
   (`topmostSubform[0].Page1[0].DeviceName[0]`) that the slugifier strips from the
   *key* but preserves verbatim in `acroField`.
2. Rename the placeholder key to your canonical key — the name callers will pass in
   `POST /api/510k/estar/official`'s `data` object.
3. Confirm the `type` matches the widget (a checkbox mapped as `text` fills nothing).
4. Drop entries you do not intend to populate. A partial map is legitimate:
   `fillOfficialPdf` runs with `missingFieldPolicy:'skip'` and reports
   `filledFields` / `skippedFields` / `warnings` honestly (`estar-fill.ts:124–133`).

A wrong `acroField` **silently fails to fill** the official form. That is precisely
the failure this procedure exists to prevent — verify, do not assume.

### Step 4 — Populate `estar-field-map.ts`

Replace the `{}` for that descriptor in
`server/services/pathway-engines/estar/estar-field-map.ts:33–45`:

```ts
'510k-device': {
  deviceName: { acroField: 'topmostSubform[0].Page1[0].DeviceName[0]', type: 'text' },
  isIvd:      { acroField: 'topmostSubform[0].Page1[0].IsIvd[0]',      type: 'checkbox' },
  // …one verified entry per canonical field
},
```

This is a **data change in tracked source**, reviewed like any other PR, pinned to the
template `version` from step 1. No new code is required or wanted.

### Step 5 — The readiness probe flips on its own

`GET /api/510k/estar/readiness?type=510k&variant=device`
(`server/routes/510k-estar-routes.ts:808`) runs a dry `fillEstarSubmission` with empty
data — side-effect-free, persists nothing — and reports:

```json
{ "descriptorId":"510k-device", "ready":true, "officialEstarPdf":true,
  "templateAvailable":true, "fieldMapPopulated":true, "blockers":[] }
```

`ready` is computed as `templateAvailable && fieldMapPopulated`, the **same gate**
`POST /api/510k/estar/official` enforces. The UI's official-eSTAR panel
(`client/src/concept2cure/mdx/surfaces/OfficialEstarPanel.tsx`, mounted on the 510(k),
PMA and IVD surfaces) is driven by this probe through `useEstarReadiness(type, variant)`:
its readiness gate shows the blockers while `ready` is false, its governed field preview
(`useEstarOfficialFields`) lists every administrative field with the value the platform
holds and its source — a blank field with a declared source reads "Not set" and names
the home to fill in, never a guessed value — and its one Generate control un-disables
itself once the probe reports ready, with no front-end change.
`tests/routes/estar-official-pdf.test.ts:235` pins both halves of this behaviour — the
not-ready path with blockers, and the ready path once a template + map are present.

### Step 6 — Produce one real eSTAR before declaring victory

`POST /api/510k/estar/official` should now return a filled PDF instead of 422. Open it
in Adobe Acrobat (FDA's reference reader), confirm the fields you mapped are populated
where you expect, and confirm nothing was written to the wrong widget. Only then is
B2 closed for that descriptor.

---

## 4. Critical paths — three journeys, three different blocker sets

The blockers are not uniform across products. These are the minimum true statements
for each journey's **first real filing**.

### 4a · First real 510(k)

Ordered. Each step is a hard precondition for the next.

1. **B1** — vendor `eSTAR-510k-non-ivd.pdf` (or `-ivd`) at nIVD/IVD **v7.0**.
   *(Procurement)*
2. **B2** — scaffold, verify, populate `'510k-device'` in `estar-field-map.ts`; confirm
   `GET /api/510k/estar/readiness` → `ready:true`. *(Engineering, §3)*
3. **Client registration facts** — `fda_esg_account`, `cdrh_portal_account`,
   `organization_identity` (DUNS/FEI), `mdufa_fee_account`. These are modelled at
   `server/services/pathway-engines/estar/estar-registration.ts:54–80`; 510(k) is
   fee-bearing so **all four** are required. *(Regulatory Ops, per customer)*
4. **B16** — a real transport on the 510(k) transmit path. *(Engineering — currently
   the binding constraint on this journey)*
5. **B5** — FDA ESG credentials + the UAT in `docs/runbooks/fda-esg-production-uat.md`
   with a real ack1 observed. *(Regulatory Ops + Ops)*
6. **B8, B10, B13, B17, B18** — the boot/ops floor: RLS on, OTP delivering, monitoring
   live, both boot keys provisioned.

**Not on this path:** eCTD DTDs (B3), eValidator (B4), RPS schema (B14), MedDRA (B6).
A 510(k) is an eSTAR PDF, not an eCTD sequence. The recognized-standards dataset
(B21) is also not a gate — a submitter can identify their standards by hand; its
absence costs the intake-time mapping, not the filing.

### 4b · First real CER (EU MDR Annex XIV)

The CER path is the **least procurement-blocked** of the three — its outputs are
documents the manufacturer or notified body reads, not agency-gateway transmissions.

1. **Ops floor only** — B8 (RLS), B10 (OTP), B13 (Sentry), B17/B18 (boot keys).
2. **B15** — PDF/A toolchain, *if* you intend to hold CER exports to submission-grade
   PDF. The CER export routes are already fail-closed twice over
   (`server/routes/cerv2-export-routes.ts:268` returns 422 rather than emit fabricated
   regulatory text).
3. **B9** — corpus/literature depth. Not a gate on producing a CER; a gate on the CER
   being *good*. The conformance validator emits `literature_review: status 'fail'`
   when it is absent (`server/services/cer/cerConformanceValidator.ts:154–161`,
   MEDDEV 2.7/1 rev 4 §9) — at `recommended` severity, so it does **not** invalidate
   the report, only flags it. A missing `clinical_evidence` section *is* mandatory and
   does invalidate. `buildCerStructure` starts clinical-evidence and literature
   sections honestly empty ("no literature search has been recorded") rather than
   inventing content.
4. **B6 (MedDRA)** — only if the CER's PMS/vigilance section codes adverse events.
   Otherwise not on this path.
5. **EUDAMED credentials** (`EUDAMED_URL`, `EUDAMED_BEARER`) — only for EUDAMED
   registration/vigilance submission, not for producing the CER itself.

**Not on this path:** eSTAR templates, eCTD DTDs, eValidator, FDA ESG.
**This is the shortest route to a first real customer deliverable.**

### 4c · First real NDA / eCTD sequence

The most procurement-heavy path — and the only one where the *validation* story
matters as much as the *assembly* story.

1. **B3** — vendor all 5 DTDs + checksums, so packages are self-contained.
   *(Procurement acquires, Engineering commits)*
2. **B4** — licensed eValidator. **Turn on `EVALIDATOR_USE_FDA_CRITERIA_FALLBACK=true`
   today** as an interim floor while the licence is procured. *(Procurement + Ops)*
3. **B15** — Ghostscript + veraPDF in the deploy image, then `ECTD_REQUIRE_PDFA=true`.
   *(Ops)*
4. **Flip the enforcement flags in the same window as their artifacts** — B20.
5. **B5** — FDA ESG credentials + UAT. The real AS2 code path *is* reachable here via
   `getGateway('fda','esg')`, unlike the 510(k) surface (B16). Resolve the PKCS#7
   question with FDA during UAT.
6. **B6 (MedDRA/WHODrug)** and **B7 (ICSR transport)** — required for the safety
   reporting that accompanies an IND/NDA lifecycle, not for the initial sequence.
   B7 needs engineering before credentials.
7. **B14** — only if filing eCTD **v4.0**. v3.2.2 does not need the RPS schema.
8. **Ops floor** — B8, B10, B13, B17, B18.

**Sequencing note:** steps 1–3 are independent of each other and can run in parallel;
step 4 must follow all three; step 5 is independent of 1–4 and has the longest agency
lead time, so **start B5 first even though it lands last**.

---

## 5. What is already true

The delta to GA is procurement and ops, not architecture. This section is the evidence.

### The eCTD engine qualifies green, today

`npm run qualify:ectd` run on **2026-08-14T03:12:45Z** — **Overall: PASS**, 5/5:

| Report | Region / version | Validators | Checksums | Lifecycle |
|---|---|---|---|---|
| `v3.2.2-fda` | FDA v3.2.2 | xmllint ×2, dtd-checksum-manifest, stf-cross-linking, cross-references — all ok | 7 verified, 0 mismatch | append/delete/replace ok |
| `v3.2.2-ema` | EMA v3.2.2 | same 5 — all ok | 7 verified, 0 mismatch | ok |
| `v3.2.2-pmda` | PMDA v3.2.2 | same 5 — all ok | 7 verified, 0 mismatch | ok |
| `v3.2.2-ca` | Health Canada v3.2.2 | same 5 — all ok | 7 verified, 0 mismatch | ok |
| `v4.0-fda` | FDA v4.0 (HL7 RPS) | rps-model-validator, xmllint, schema-checksum-manifest — all ok | 3 verified, 0 mismatch | revise ok |

The harness generates golden packages, runs the accepted validators, **reopens each
ZIP to re-verify every checksum**, exercises a real lifecycle sequence, and records the
exact spec versions qualified against (FDA eCTD Validation Criteria **v4.5**, File
Format Types **v9.3**, US Regional DTD **v3.3**, ICH eCTD **v3.2.2**, eCTD v4.0 CV
package **v1.1**). Reports in `qualification-reports/`.

Crucially, the reports **name their own gaps** rather than papering over them:
*"No external eValidator configured…"*, *"No DTDs vendored…; DTD validity is
skipped"*, *"RPS XSD validation skipped"*. A harness that reported PASS without those
notes would be the thing to distrust.

### The fail-closed refusals are real and tested

Every one of these was read in source during this audit:

| Refusal | Where | Behaviour |
|---|---|---|
| Official eSTAR | `estar-fill.ts:106,113` → route `:613` | 422 `ESTAR_NOT_PRODUCIBLE` with named blockers; never a fabricated PDF |
| eSTAR scaffold | `510k-estar-routes.ts:543` | 422 `ESTAR_TEMPLATE_UNAVAILABLE`; never guesses field names |
| Agency validation | `external-validator/index.ts:47–66` | a configured engine that **throws** is reported `ran:false, passed:false` — never a fabricated pass |
| eValidator gate | `external-validator/gate.ts:52` | "could not run" is itself a blocker under enforcement |
| Recognized standards | `recognized-standards-dataset.ts` `loadRecognizedStandardsDataset` → `recognized-standards.service.ts` | absent, unparseable or schema-invalid dataset is reported **absent** (never partially loaded); the lookup answers `available:false` with the reason and an empty list, and keeps "dataset not held" distinct from "list holds nothing for this code". No seeded standards anywhere |
| MedDRA / WHODrug | `medical-coding-service.ts:264,302` | `status:'license_required'`, no code returned |
| ICSR transmit | `icsr-gateway-transport.ts:181,196,211` | refuses on gaps, refuses when unimplemented, refuses when unconfigured — never a fake ACK |
| ESG 510(k) | `ESGSubmissionService.ts:350,597` | `not-implemented` in every non-simulation env; simulation opt-in and restricted to `NODE_ENV` exactly `development`/`test` |
| Local ESG record | `ESGSubmissionService.ts:560–573` | stamped *"THIS IS NOT AN AGENCY ACKNOWLEDGEMENT … Do not archive it as evidence"* |
| Gateway credentials | every gateway's preflight | `CredentialError` naming the exact missing vars |
| Production boot | `environment.ts:275,283,291,299` | refuses to boot on weak MFA key, non-canonical `RLS_ENFORCE`, unsealed audit without explicit acceptance |

Verified by test run on 2026-08-14: `vitest run server/services/pathway-engines/estar/__tests__
server/services/ectd/external-validator/__tests__ server/services/submission-readiness/__tests__`
→ **13 files, 94 tests, 0 failures**. `node --test tests/ops/submission-preflight.test.mjs`
→ **4/4 pass**, including *"the CLI does not check artifacts that no source requires
(no phantom gaps)"* — the manifest test that keeps the CLI's expected-artifact lists
pinned against the TypeScript sources.

### The governed chains are in place

- **Human authorization on every transmit.** `assertTransmitAuthorized`
  (`submission-gateways/index.ts:66`) is enforced at `getGateway`, so no caller can
  route around it — including tool handlers dispatching on model-supplied JSON. It
  requires either a `governed-http` authorization (named actor + a reason ≥8 chars +
  a verified re-authentication timestamp) or a `governed-signature` (Part 11 sequence
  signature id). Transmission is irreversible; the gate treats it that way.
- **Tamper-evident audit chain.** `server/services/audit/chain.ts` writes a SHA-256
  hash chain (`recordHash` bound to `previousHash` at a fixed sequence position), with
  optional HMAC seals (`audit-hmac-seal.ts`) and a daily integrity monitor
  (`chainIntegrityMonitor.ts`, 21 CFR Part 11 §11.10(e)).
- **RLS proven, not asserted.** See B8 — a full-schema two-tenant probe across 220 of
  222 policied tables, with a negative control, running on every PR.
- **Server-computed dispatch gates.** `assess-dispatch-readiness.ts` computes every
  gate input from server state, so a client cannot pass `validationErrors: 0` to talk
  the gate out of a blocker.
- **Procurement visibility already modelled in-product.**
  `server/services/submission-readiness/procurement-preflight.ts` aggregates the three
  drop-points into one report with a pure, unit-tested `buildPreflightReport`. It is
  not yet mounted on a route — the CLI (`scripts/ops/submission-preflight.mjs`) is the
  current surface.

### The gateway estate is built

13 gateway entries across 12 regulators, each with real HTTPS/mTLS transport code,
agency-specific auth construction, credential preflight, acknowledgement handling, and
a shared pre-transmit precondition gate (size limit / PDF/A / DTD self-containment /
external validation). None has ever carried live traffic. That is a credentials-and-UAT
problem for 12 of them, and a credentials-plus-PKCS#7-confirmation problem for FDA ESG.

---

## 6. Using the machine-checkable report

```
node scripts/ops/ga-readiness-report.mjs           # human-readable, blocked rows only
node scripts/ops/ga-readiness-report.mjs --all     # include ready rows
node scripts/ops/ga-readiness-report.mjs --json    # machine-readable
```

Read-only: disk + `process.env` only. No network, no database, no writes. Exit code 0
when every `blocker`-severity row is ready, 1 otherwise — so it can gate a deploy
pipeline. Advisory rows never change the exit code.

Run it **with the same environment the app will boot with**; `NODE_ENV` and the
secrets are what it reads. It is echoed in the output header so a report from the
wrong environment is obvious.

**Its limits, stated plainly.** A row reading `ready` means the artifact or variable is
**present**. It is not proof the DTD is the mandated production version, that the
licence is paid, that a credential authenticates, or that a restore actually ran. Those
are proven by the verification commands in §1 — by `qualify:ectd`, by
`pilot:verify-otp`, by the ESG UAT — not by this script. Presence is necessary and
never sufficient.

Pair it with the two existing probes:

| Command | Covers |
|---|---|
| `node scripts/ops/submission-preflight.mjs` | the 3 licensed-artifact drop-points, exit-coded |
| `node scripts/ops/ga-readiness-report.mjs` | the whole GA blocker set (40 rows) |
| `npm run pilot:go-no-go` | live DB + env gates: schema, RLS posture, demo admin, boot secrets, SMTP, Sentry, PDF export |

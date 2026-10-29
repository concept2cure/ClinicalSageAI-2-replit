# MR-08 — Vault: scanned uploads and real document control

| | |
|---|---|
| Phase | Phase 0 (Stage 1) · Phase 1 (Stages 2–3) · Phase 2 (Stage 4) · Phase 3 (Stages 5–7) |
| Highest open severity at head | P1 |
| Human testing | Blocks: the upload journey (Vault ingest, Data Room capture, Template Library) on `docker-compose.beta.yml`, `docker-compose.yml` and `npm start`. Every file is refused with 503 `FILE_SCAN_UNAVAILABLE` (SEC-01, CAT1-01). Degrades: no `.xpt`, a 50 MB cap and scanned PDFs that can 504 behind the ALB (CAT1-05); no restore of a prior version (CAT1-04); the withdraw panel is shown but not activated (CAT1-15); no DOCX preview or bulk export (CAT1-14); no drag-and-drop or folder upload (CAT1-17). |
| Owner | mixed. Engineering writes the code. The infrastructure owner runs the staging proof (Stage 2). The founder makes five scope calls. |
| Effort | S + S + M + M + M + L + L. About 12–14 engineer-weeks. Stages 1–3, which unblock testing and the pilot, take about 3–4 weeks. |
| Depends on | MR-03 (an applied staging stack; OPS-13's `withConversionSlot` limiter), MR-09 (CAT1-02's DOCX→PDF pipeline, Stage 6), MR-15 (CAT1-06 project membership, Stage 7), F-4, F-6, F-18, F-27 |
| Findings | 10 total — open 2 · partially fixed 6 · fixed 1 · refuted 0 · unverifiable 1 |
| Basis | cold audit at `92ccdba1`, re-verified at `94b4f9238` on 2026-10-13 — [evidence](../evidence/reviews/2026-10-13-market-readiness/) · [findings register](MR-findings-2026-10-13.json) |

> **Re-checked 2026-10-18 at `8ca7e74ca`** (every finding that stopped a tester's journey at `94b4f9238`). Start from this, not from the 13 October text below, for:
> - **CAT1-01**: partially fixed (fb95b9680); for testers it now degrades the journey but does not stop it. Evidence at head: [findings register](MR-findings-2026-10-13.json), `CAT1-01.recheck`.
> - **SEC-01**: partially fixed (fb95b9680); for testers it now degrades the journey but does not stop it. Evidence at head: [findings register](MR-findings-2026-10-13.json), `SEC-01.recheck`.

> **Stage 1 landed on 2026-10-18 in `fb95b9680`.** Both compose stacks scan uploads; production refuses to boot without a scanner; `/readyz` reports it; CI's production-boot jobs run it. Evidence, and what stayed BLOCKED: [`docs/evidence/MR-08/2026-10-18/stage-1/`](../evidence/MR-08/2026-10-18/stage-1/README.md). The next session starts at Stage 2, and confirms the two CI jobs went green on the push that carried `fb95b9680` first.

## Goal

Every file that enters the Vault is scanned for malware before it is stored, on every deployment the repository ships. A production-mode process with no scanner refuses to start, so it cannot run and quietly refuse uploads. The Vault holds what a US IND actually carries: SAS transport datasets with their `define.xml` and stylesheet, large study reports and scanned legacy PDFs. It holds them without timing out and without exhausting a task's memory. It works as a controlled document store. An editor can restore a prior version as a new version with a recorded reason. A mistaken upload is withdrawn through a recorded decision. Legal holds are placed and lifted in the product. A crafted archive cannot take a task down. An auditor can see each of these controls as a test that failed before the change and passes after it.

## Why it matters

- The designated human-testing stack is `docker-compose.beta.yml`, whose header reads "Beta Environment — Human Testing & QA". It refuses every upload with 503. Upload is the first step of every launch journey (Vault → Authoring → Submission Center), so a tester on that stack cannot start any of them.
- A production-mode process with no scanner boots green. The boot self-test marks antivirus "skipped", and `/readyz` never asks about it. Only the AWS deploy preflight catches the gap. The Helm chart, `app.yaml`, both compose stacks and `npm start` do not.
- A small biotech's IND carries SEND datasets for its nonclinical studies: `.xpt` files, `define.xml` and the define stylesheet. The Vault refuses `.xpt` and the stylesheet. Module 4/5 content therefore cannot live in the system that is meant to build the pilot's FDA sequence.
- A scanned 300-page report is OCR'd inside the HTTP request. Behind the ALB's 60-second idle timeout (`terraform/modules/alb/main.tf:36`), the user can see a 504 while the server admits the document anyway. A retry then lands as a re-upload or as a new version.
- GxP buyers check document control first: restore a prior version, withdraw a mistaken upload, put a document on legal hold. Today restore returns 409. Withdraw says "awaiting verified activation". Holds have an API but no screen, and the database lets anyone edit or delete a hold row.
- Any user with upload rights can send a zip bomb, as a template DOCX, a legacy-import archive or an eCTD package for validation. It decompresses in the API process and can take the task down (SEC-17).

## State at head

| Finding | Status at head | Severity (pilot) | Tester impact | Evidence at head |
|---|---|---|---|---|
| SEC-01 | PARTIALLY_FIXED | P2 | Blocks (compose stacks) | `docker-compose.yml:87` and `docker-compose.beta.yml:82` set `NODE_ENV: production` with no `clamav` service and no `CLAMAV_HOST`; `server/middleware/uploadSafety.ts:221-236` then returns 503 |
| CAT1-01 | PARTIALLY_FIXED | P2 | Blocks (compose stacks, `npm start`) | `server/services/securityHealth.ts:222-233` returns `skipped`, `critical:false` when `CLAMAV_HOST` is unset, even in production; `/readyz` (`server/startup/inline-endpoints.ts:50`) has no scanner dependency; `scripts/ci/check-compose-boot-contract.mjs:142` checks env names only |
| CAT1-05 | PARTIALLY_FIXED | P1 | Degrades | `shared/constants/document-intake-formats.ts:17-33` has no `.xpt`, `.xsl`, `.pptx` or `.zip`; `:46` caps at 50 MB; `server/routes/vault-ingest.ts:69-80` uses `multer.memoryStorage()`; `server/services/vault/vault-ingest.service.ts:381-404` extracts and OCRs inside the request |
| CAT1-04 | PARTIALLY_FIXED | P2 | Degrades | No restore route beside `GET …/versions` (`server/routes/c2c/project-vault.ts:1647`); re-uploading v1's bytes returns 409 `CONTENT_ALREADY_A_VERSION` (`server/services/vault/vault-version-checkin.ts:171-184`); no check-out |
| CAT1-15 | PARTIALLY_FIXED | P3 | Degrades (the register said none) | `Vault.tsx:1794` renders `DocumentDisposition`, but `server/services/document-data-disposition/service.ts:86` returns 503 `DISPOSITIONS_NOT_ACTIVATED` unless `C2C_DOCUMENT_DISPOSITIONS_ENABLED=1`, which no deployment sets (`.env.example:82` is `0`); `server/routes/vault-legal-holds.ts:252-254` has no client caller; `vault.legal_holds` has no append-only trigger |
| CAT1-14 | STILL_OPEN | P2 | Degrades | No export, preview or share route in `server/routes/c2c/project-vault.ts`; the Vault shows a text excerpt; `convertDocxToPdf` (`server/services/pdf-converter.ts:75`) has no callers |
| CAT1-17 | PARTIALLY_FIXED | P3 | Degrades | `Vault.tsx:1394` has `multiple` only, with no drop zone and no `webkitdirectory`; `client/src/concept2cure/v2/useVaultUpload.ts:236` uploads one file at a time with no per-file progress |
| CAT1-13 | UNVERIFIABLE (FORCE half settled here) | P2 | Not observable in testing | No folder or document ACL anywhere. `vault.documents` RLS is enabled and deliberately not FORCEd (`migrations/20260905_vault_documents_organization_id.sql:55-63`; `migrations/20260926_vault_documents_record_immutability.sql` notes). Boot refuses a runtime role that owns it (`server/db/rlsEnforcement.ts:286-296`) |
| SEC-17 | STILL_OPEN | P2 | Not observable in testing | `server/services/templates/templateExtractor.ts:261` (`new AdmZip`) and `:119,:161,:276,:360,:376` (`readAsText`) are unbounded; so are `server/services/legacy-importer/detector.ts:184` and `server/services/submission-gateways/ectd-structural-validator.ts:266` (client bytes from `server/routes/ectd-export.ts:905`); no shared limit helper exists |
| CAT1-21 | FIXED | none | none | `server/routes/authoring.router.ts:8418` calls `assertUploadSafe` on image bytes |

## Already done at head — do not redo

- **The AWS task scans uploads** (9c335454d, 2026-10-01).
  - `terraform/modules/ecs-fargate/main.tf:152-160` sets `CLAMAV_HOST=127.0.0.1` on the API container, and `:167` makes the API wait on the scanner (`HEALTHY`).
  - `:213-270` add an essential, digest-pinned `clamav` container with `CLAMD_CONF_StreamMaxLength=100M`, `CLAMD_CONF_AlertExceedsMax=yes` and the `clamdcheck.sh` health check. The pin is at `terraform/stack/variables.tf:91`.
  - `.github/workflows/deploy-aws.yml:709-737` refuses a task definition that lacks the scanner.
  - `terraform/stack/tests/boot_contract.tftest.hcl:250-301` asserts the wiring, including StreamMaxLength = `FILE_LIMITS.maxUploadBytes`.
  - When `CLAMAV_HOST` is set, the boot self-test sends EICAR and fails critical if clamd misses it (`securityHealth.ts:235-262`).
- **Every upload path goes through `assertUploadSafe`** (731538322). The Data Room route runs it at `server/routes/chat.ts:103-118`, and the handler's fail-open copy is gone (`server/routes/chat/upload.ts:102-105`). Authoring images run it at `authoring.router.ts:8418`, which closes CAT1-21. Only `uploadSafety.ts:189` and `securityHealth.ts:239` call `scanBuffer`.
- **Scanner outcomes are typed.** An EICAR hit returns 400 `FILE_SCAN_REJECTED` (`uploadSafety.ts:207-218`), not the 422 the original audit assumed. A file over clamd's limits returns 422 `FILE_SCAN_INCOMPLETE` (`:190-204`).
- **Versioning works.**
  - Check-in landed in 5b9b67bbf: `vault-ingest.ts:133`, `vault-version-checkin.ts` and `migrations/20260930_vault_documents_version_lineage.sql`.
  - The version list and compare landed in 15a38fbfe: `project-vault.ts:1647` and `VaultVersions.tsx`.
  - A name clash offers "Upload as a new version" (38179495f).
- **Major-only numbering is a founder decision, not a gap.** `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` §5 records FD1 (2026-09-24): sequential majors, with approval as a lifecycle stage beside the version (`server/services/vault/vault-lifecycle.ts`). Do not add minor versions.
- **The allowlist was widened** (10222a024). `.tsv`, `.json`, `.xml` (so `define.xml` is admitted) and four image types are in, with byte checks. 13efb8fca gave the Vault and Data Room one 50 MB cap.
- **The withdraw decision is built** (2c2417d7a, 78081933e). Its parts are `server/routes/c2c/document-data-dispositions.ts`, `DocumentDisposition.tsx` and `migrations/20261006_document_data_dispositions.sql`. New decisions are off by default until staging activation (`docs/architecture/DOCUMENT_DATA_LIFECYCLE_2026-10-06.md:68-74`).
- **Legal-hold and retention routes exist.** `server/routes/vault-legal-holds.ts` places, lists and lifts holds with chained audit rows. `RetentionPeriodCard.tsx` sets the retention period from `AdminSurfaces.tsx:925`.
- **The FORCE half of CAT1-13 is settled by design.** `vault.documents` stays ENABLE without FORCE so that the owner-run purge function reaches it. Production refuses to boot when the runtime role owns an RLS table that is not FORCEd (`rlsEnforcement.ts:286-296`). MR-05 owns any change to that posture.

## Work, in order

### Stage 1 — Every production-mode stack scans uploads, and says when it cannot (Phase 0 · S · engineering) — closes SEC-01 (compose part), CAT1-01 (compose, boot and readiness parts)

1. **Record the red cases first.** File each under `docs/evidence/MR-08/<date>/stage-1/`:
   - `docker compose -f docker-compose.beta.yml --env-file .env.beta up --build`. Sign in as an editor and POST a clean one-page PDF to `/api/vault/ingest`. Capture the 503 `FILE_SCAN_UNAVAILABLE`.
   - After step 3 adds the rule, but before step 2 edits any compose file, run `npm run ci:compose-boot-contract`. It must fail and name both stacks' missing scanner.
   - The new `securityHealth` case (step 4) and the new `/readyz` test (step 5), run against HEAD.
2. **Add the scanner to both compose stacks.** Add this service to `docker-compose.yml` (network `c2c`, defined at `:354`) and `docker-compose.beta.yml` (network `c2c-beta`, `:261`). Do not put it under a profile, and publish no host port:
   ```yaml
   clamav:
     image: clamav/clamav:1.4.6@sha256:57deb108fc4c72778aa83eafbca7bb7153e28c3f57c005afd38d31f16da86f23  # = terraform/stack/variables.tf:91
     restart: unless-stopped
     environment:
       CLAMD_CONF_StreamMaxLength: 100M      # = FILE_LIMITS.maxUploadBytes (server/config/platform-limits.ts:84)
       CLAMD_CONF_AlertExceedsMax: 'yes'     # quoted: YAML 1.1 reads a bare yes as a boolean
     healthcheck:
       test: ['CMD-SHELL', 'clamdcheck.sh']
       interval: 30s
       timeout: 10s
       retries: 3
       start_period: 300s
     deploy:
       resources:
         limits:
           memory: 4G                        # = var.scanner_memory (terraform/modules/ecs-fargate/variables.tf:62)
     networks: [c2c]                         # c2c-beta in docker-compose.beta.yml
   ```
   - On each `app` service (`docker-compose.yml:74`, `docker-compose.beta.yml:69`), add `clamav: {condition: service_healthy}` under `depends_on`, and add `CLAMAV_HOST: clamav` and `CLAMAV_PORT: '3310'` under `environment`.
   - Update each file's header comment. Uploads are scanned by the `clamav` service. The first `up` waits up to 5 minutes while clamd loads its database. clamd holds about 1.3 GB, and twice that during a signature reload, so the host needs about 8 GB of RAM for app plus scanner.
   - Run `docker manifest inspect` on the pinned digest. If it has no `arm64` entry, add `platform: linux/amd64` to the service and say so in the header for testers on Apple silicon.
3. **Make the compose gate check the scanner.** In `scripts/ci/check-compose-boot-contract.mjs`, add `checkScanner(doc, serviceName)` and call it from `checkCompose` (`:190`) for every service whose `NODE_ENV` resolves to `production`. Fail unless all of these hold:
   - `CLAMAV_HOST` is a literal naming a service in the same file;
   - that service has a `healthcheck.test`, and the app's `depends_on` names it with `condition: service_healthy` (list-form `depends_on` fails);
   - its `image` equals the default in `terraform/stack/variables.tf:91`, read by regex;
   - its `CLAMD_CONF_StreamMaxLength` equals `<maxUploadBytes>M`, read from `server/config/platform-limits.ts` with the same regex as `boot_contract.tftest.hcl:283`;
   - its `CLAMD_CONF_AlertExceedsMax` is `yes`.

   Add `--self-test` cases to `selfTest` (`:207`): no clamav service; `CLAMAV_HOST` naming a missing service; `depends_on` without `service_healthy`; a different digest; a StreamMaxLength mismatch. Each must fail. Do not add `CLAMAV_HOST` to `COMPOSE_EXCUSED`.
4. **Fail boot when production has no scanner.** In `server/services/securityHealth.ts` `checkClamavConnectivity` (`:222`), when `NODE_ENV === 'production'` and `CLAMAV_HOST` is unset, return `status: 'fail'`, `critical: true` and the reason `CLAMAV_HOST not set: production refuses every upload (server/middleware/uploadSafety.ts)`. Keep `skipped` for development and test. `server/startup/security-self-test.ts` already exits on a critical failure in production. Extend `server/services/__tests__/securityHealth.test.ts` (next to the "skips when CLAMAV_HOST is unset" case at `:114`) with a production-and-unset case.
   - **Consequence for CI.** `ci.yml` `production-boot-smoke` (`:1871`) and `production-image-boot` (`:2101`) boot `NODE_ENV=production` with no scanner, so they turn red. That is correct. Fix them by running the scanner, never by setting `SECURITY_SELF_TEST_NONBLOCKING`:
     - start the pinned image with `docker run -d --name clamav -p 127.0.0.1:3310:3310 <digest>`;
     - poll `docker exec clamav clamdcheck.sh` for up to 300 s;
     - set `CLAMAV_HOST=127.0.0.1` and `CLAMAV_PORT=3310`.
   - **Prove uploads in CI.** Extend `scripts/ci/image-boot-signin.mjs` after its step 5. Create a project through `POST /api/c2c/projects`, POST an EICAR `.txt` to `/api/vault/ingest` and expect 400 `FILE_SCAN_REJECTED`, then POST a one-page PDF and expect 201. CI then proves scanned uploads on the shipped image every run.
   - **Consequence for other deploy paths.** `charts/concept2cure-app/values.yaml:79` and `app.yaml:4` also run production mode with no scanner. After this step they refuse to boot and name `clamav_connectivity`, which is the honest outcome. Whether those deploy paths stay is MR-14's call. Do not add scanner plumbing to them here.
5. **Make `/readyz` report the scanner.**
   - Add `pingClamd(timeoutMs = 2000)` to `server/utils/virusScan.ts`, the one clamd client. It sends `zPING\0` and resolves `true` on `PONG`.
   - In `mountFastPathHealthEndpoints` (`server/startup/inline-endpoints.ts:50`), add `deps.virusScan`:
     - in production with `CLAMAV_HOST` set, use the ping result, cached for at most 30 s, as `ok` or `down`;
     - in production with it unset, report `down`;
     - otherwise report `skipped`.
   - Add the scanner to the header list at `:6`.
   - Add `server/startup/__tests__/readyz-virus-scan.test.ts`, modelled on `readyz-vault-storage.test.ts`. A `net.Server` that accepts and never answers must give 503 with `virusScan: 'down'`. One that answers `PONG\0` must give 200.
   - The deploy's post-roll smoke already reads `/readyz` through the public URL (`deploy-aws.yml:1041-1059`), so a broken scanner now fails the deploy. Do not point the ECS container `healthCheck` (`ecs-fargate/main.tf:181-205` explains why) or the ALB check (`alb/main.tf:103`, `/api/health`) at `/readyz`.
6. **Prove the image honours `CLAMD_CONF_*`.** This is the same digest Terraform runs, and it settles CAT1-01 remaining item 4. Run the beta stack once with a throwaway, uncommitted override setting `CLAMD_CONF_StreamMaxLength: 1M`. A 2 MB PDF must get 503, because clamd refuses the stream and the client cannot tell that from an outage. With the committed `100M`, the same PDF gets 201 and a 49 MB PDF gets 201.
7. **Document the local path.** In `docs/LOCAL_TESTING.md`:
   - `npm start` (`package.json:40`, `NODE_ENV=production`) now needs a scanner: `docker run -d --name clamav -p 127.0.0.1:3310:3310 <pinned digest>` and `CLAMAV_HOST=127.0.0.1`;
   - `npm run dev` is unchanged, with the scan skipped and a warning;
   - the beta stack needs no manual step.

**Acceptance**
- Red first, captured: on the HEAD beta stack a clean PDF to `POST /api/vault/ingest` returns 503 `FILE_SCAN_UNAVAILABLE`. After the change it returns 201, an EICAR `.txt` returns 400 `FILE_SCAN_REJECTED`, and with `docker compose stop clamav` the next upload returns 503 and `/readyz` returns 503 with `virusScan: 'down'`.
- `npm run ci:compose-boot-contract` fails on HEAD's compose files, naming the missing scanner in both stacks, then passes. `npm run ci:compose-boot-contract:selftest` passes, and every new case fails when its rule is commented out.
- A `NODE_ENV=production` boot with `CLAMAV_HOST` unset exits non-zero and names `clamav_connectivity`. The new unit test is red at HEAD.
- The `/readyz` test is red at HEAD and green after the change.
- CI's two production-boot jobs pass with a real clamd, and `production-image-boot` shows the EICAR 400 and the clean-PDF 201.
- The 1M/100M override pair is recorded.

### Stage 2 — Prove scanning on the applied AWS staging stack (Phase 1 · S · infrastructure owner) — closes SEC-01, CAT1-01

1. This stage starts once MR-03 has applied `terraform/environments/staging`, which needs F-4, and the founder has named the scanner's operational owner (F-6).
2. As a signed-in editor on staging, run each check and file the request and response under `docs/evidence/MR-08/<date>/stage-2/`:
   - an EICAR `.txt` to `/api/vault/ingest` returns 400 `FILE_SCAN_REJECTED`;
   - a clean PDF returns 201;
   - a 49 MB PDF returns 201;
   - `GET /api/admin/security-health` shows `clamav_connectivity: pass`;
   - `/readyz` shows `virusScan: ok`.
3. **Show the failure on staging too.** Register a one-off task-definition revision with `CLAMAV_HOST` pointed at an unreachable address. The task must refuse to boot, and the boot log in CloudWatch must name `clamav_connectivity`. Roll back to the committed revision.
4. **Check signature freshness.** The CloudWatch stream with prefix `clamav` must show freshclam updating `daily.cld` over the NAT. An alarm on freshclam failure belongs to MR-04 (OPS-06). Record that dependency in the evidence.

**Acceptance**
- The five staging results above are captured.
- The unreachable-host revision fails to boot, with its log captured.
- A freshclam update line from the last 24 hours is captured.

### Stage 3 — Admit IND content, bound archives and take OCR off the request (Phase 1 · M · engineering) — closes SEC-17; advances CAT1-05 (file types and extraction)

**Steps 1(c), 1(d) and 2 done 2026-10-29: SEC-17 is closed** (`docs/evidence/D6/2026-10-29-archive-limits/`). `server/services/archive/safeZip.ts` is called from:
- `assertUploadSafe` (422);
- `extractTemplateFromFile` (422 on both template routes);
- `extractDocumentText`, before mammoth and exceljs;
- `validateEctdPackage` (422; a package this server assembled passes `origin: 'platform-generated'`);
- the legacy import detector (an error finding).

The bounded reader is replaced by one measured inflate before any reader, which also covers mammoth and exceljs. The reason is recorded there.

**Step 3 and step 1(a) done 2026-10-29** (`docs/evidence/D2-VAULT-DEFINE-STYLESHEET/2026-10-29/`):
- `.xsl` and `.pptx` are Vault formats.
- `.xsl` binds `application/xslt+xml` for its own name only, is checked as text and is read as raw text.
- A version is stored under the type its name binds: an `.xpt` sent as octet-stream is stored as `application/x-sas-xport`.
- A test holds every Vault format to a byte check and a name binding.

**Steps 1(b) and 4 to 6 done 2026-10-29** (`docs/evidence/D1/2026-10-29-ocr-off-request/`):
- Ingest reads a text layer only, within 20 MiB and 10 s, and records `extraction_pending` otherwise.
- `server/jobs/vaultProcessingSweep.ts` reads each pending version once. It claims each one by advisory lock, reads it through the verified reader with OCR in a conversion slot, and writes the text, the outcome and a chained audit row, then indexes the passages.
- The ingest response, the catalog record, AnA's catalog eligibility and search say a version is still being read.

Born-digital files are still read and chunked in the request. Re-proposing a filing after the read is not done. Both are recorded there. Stage 3 is complete apart from that.

1. **Red tests first**, each run on HEAD and captured:
   - (a) a valid SAS V5 `.xpt` to `/api/vault/ingest` returns 400 `FILE_TYPE_NOT_ALLOWED`;
   - (b) a 300-page image-only PDF holds the response open until OCR finishes;
   - (c) a crafted DOCX whose `word/document.xml` inflates to 200 MB at 1000:1 is parsed by `extractFromDocx`, with unbounded memory;
   - (d) `validateEctdPackage` inflates the same bomb.

   Generate the bombs in the test with JSZip and shrink the limits through the helper's options, so the fixtures stay small.
2. **One archive-limit helper**, `server/services/archive/safeZip.ts`:
   - `inspectZip(buf, limits)` reads the end-of-central-directory record (ZIP64 included) and the central directory without inflating. It returns each entry's name and its compressed and uncompressed sizes.
   - `assertZipWithinLimits(buf, limits = DEFAULT_ZIP_LIMITS)` throws `ArchiveLimitError` (`code: 'ARCHIVE_LIMITS_EXCEEDED'`) when any of these is exceeded:
     - more than 10,000 entries;
     - more than 512 MiB uncompressed in total;
     - any entry over 1 MiB with a ratio above 100:1;
     - any entry name that is absolute or contains `..`.
   - `readZipEntryBounded(file, maxBytes)` counts bytes through JSZip's `internalStream('nodebuffer')` and aborts at the cap, because declared sizes can lie.
   - Call `assertZipWithinLimits` in:
     - `assertUploadSafe` (`server/middleware/uploadSafety.ts`) for every ZIP-based MIME (`ZIP_BASED_MIMES` in `server/utils/fileSignature.ts:56`), after the signature check and before the scan. Add `ARCHIVE_LIMITS_EXCEEDED` (422) to `UploadSafetyCode` (`:66-72`).
     - `templateExtractor.ts` `extractFromDocx` (`:255`). Its five `readAsText` calls go through the bounded reader.
     - `legacy-importer/detector.ts:184`.
     - `ectd-structural-validator.ts:266`.
     - `server/services/ocr/extractDocumentText.ts`, before `mammoth` (`:165`) and `exceljs`.
   - Map the error to 422 in `server/routes/c2c/templates.ts`, `server/api/templates/routes.ts`, `server/routes/mdx-imports.ts` and `server/routes/ectd-export.ts`. Do not add a second helper anywhere.
3. **File types**, in `shared/constants/document-intake-formats.ts`:
   - `.xpt`: `textExtraction: 'none'`, `byteCheckSupported: true`, `chat: false`, `vault: true`, limitation "SAS transport v5; stored and hashed, not parsed or validated as SEND/SDTM."
   - `.xsl`: `utf8`, `chat: false`, `vault: true`. This is the define.xml stylesheet FDA expects beside `define.xml`.
   - `.pptx`: `textExtraction: 'none'`, `vault: true`.
   - `.zip`: only if the founder admits it (NEW decision below). If admitted, it is stored opaque and never expanded into Vault documents.

   In `server/utils/fileSignature.ts`:
   - Add a branch to `verifyFileSignature` for `application/x-sas-xport`. The first 48 bytes must equal `HEADER RECORD*******LIBRARY HEADER RECORD!!!!!!!`. A `LIBV8` header is refused with "SAS transport version 8 is not accepted by FDA; export as version 5 (XPORT)".
   - Add `NAME_BINDINGS` (`:197`):
     - `.xpt` → canonical `application/x-sas-xport`, declared `application/x-sas-xport` or `application/octet-stream`. Browsers send octet-stream.
     - `.xsl` → canonical `application/xslt+xml`, declared that, `application/xml`, `text/xml`, `text/xsl` or `text/plain`. Add `application/xslt+xml` to `TEXT_LIKE_EXACT`.
     - `.pptx` already binds (`:207`).
   - Today `assertUploadSafe` checks the declared type before the name binding (`uploadSafety.ts:148-176`), so octet-stream fails at step 1. Run `verifyDeclaredTypeForName` first and let it return the canonical type. Use that type for the signature check, and return it to `ingestVaultDocument` as the stored `mime_type`.
   - Add a unit test asserting every `vault: true` format has `byteCheckSupported: true` and a name binding. Show it failing by adding `.xpt` without a binding.
   - Update `client/src/concept2cure/v2/__tests__/documentIntakeFormats.test.ts`.
4. **OCR off the request path.** In `server/services/vault/vault-ingest.service.ts`:
   - Inline, keep only text-layer extraction. Call `extractDocumentText(buf, mime, name, { ocr: false })`, adding that option in `server/services/ocr/extractDocumentText.ts`, and only for files up to `INLINE_EXTRACT_MAX_BYTES` (20 MiB) within `INLINE_EXTRACT_BUDGET_MS` (10 s). This keeps today's filing suggestion for born-digital files.
   - When the inline step yields no text (scanned or image), exceeds the cap or exceeds the budget, record the catalog outcome as `extraction_pending` through `recordExtractionOutcome` (`:642`) in the ingest transaction. Add `extraction_pending` to the catalog vocabulary in `server/services/vault/document-catalog-core.ts`, and add a dated note to the vocabulary comment in `migrations/20260905_document_catalog.sql:34-37`. The column is app-enforced TEXT, so no constraint changes.
   - Remove the awaited post-commit `chunkDocumentForIngest` (`:715-718`). Chunking moves to the sweep.
   - Use `vault.document_catalog` as the one processing-state store. Do not revive `vault.documents.processing_status`, which is written once as `PENDING` and read by nothing that matters (`vault-document-index.service.ts:55`).
5. **The sweep**, `server/jobs/vaultProcessingSweep.ts`, started from `server/index.ts` beside `startTaskDueSweep`. It runs every 15 s and is also nudged in-process after each ingest commit. It is on by default.
   - List organisations with pending work under `runWithSystemTenantScope('vault-processing-sweep', …)`. Process each document under `runWithOrgJobScope(orgId, …)`.
   - Claim each `extraction_pending` document with `pg_try_advisory_lock(hashtextextended('vault-extract:' || id, 0))` on a dedicated client held for the work. A crashed process releases the lock, and no lease column is needed.
   - Read the bytes through the verified reader (step 1 of Stage 5 moves it into `server/services/vault/`). Run full `extractDocumentText` with OCR. Record `extracted` or `extraction_failed`, with the reason and the page count.
   - Re-propose filing only for placements that are `unfiled` or `suggested`, and only through the placement service's audited writer (`server/services/vault/vault-placement.service.ts`). Never override `confirmed`.
   - Then call `backfillVaultChunks(orgId, { apply: true })` (`server/services/vault/document-chunking-backfill.service.ts:147`). It already picks up `chunk_status IS NULL`, so it is the one chunking path.
   - Bound OCR with OPS-13's `withConversionSlot` (`server/services/conversion-slots.ts`, MR-03). If MR-03 has not landed it, create that file exactly as OPS-13 specifies and claim it in §0. Never add a second limiter.
6. **Honest state.**
   - The ingest response carries `extraction: 'extracted' | 'pending' | 'failed'`.
   - `Vault.tsx` and `VaultCatalogRecord.tsx` (`emptyText`, `:237`) show "Reading the text of this version…" for pending, and the stated reason for failed. They never show an empty excerpt.
   - Full-text and passage search (`GET /api/c2c/project-vault/:id/search`, `project-vault.ts:1567`) return `pendingCount`, and the UI says "N documents are still being read and are not searched yet". `server/services/vault/document-catalog-eligibility.ts` treats `extraction_pending` as not yet eligible for retrieval.

**Acceptance**
- (a) A V5 `.xpt` sent as `application/octet-stream` uploads with 201, is stored as `application/x-sas-xport`, and downloads with `X-Content-SHA256` equal to its source hash. A PE executable renamed `.xpt` gets 400 `FILE_SIGNATURE_MISMATCH`. A V8 `.xpt` gets 400 with the version message. `define.xml` and its `.xsl` upload. All are red on HEAD.
- (b) A 300-page image-only PDF returns 201 in under 5 s with `extraction: 'pending'`. Within the sweep interval plus OCR time, the catalog shows `extracted`, the page count is 300 and passages are indexed. With the sweep stopped, search reports `pendingCount: 1`.
- (c) The bomb DOCX gets 422 `ARCHIVE_LIMITS_EXCEEDED` at upload and from `extractFromDocx`; the bomb package gets the same from `validateEctdPackage`. Process RSS stays under +64 MB. All are red on HEAD.
- (d) Two API processes against one database each start the sweep. Each pending document is extracted exactly once, as shown by one `extracted` outcome and one audit row.

### Stage 4 — Large files: disk-buffered receive, streamed storage and scan, raised ceiling (Phase 2 · M · engineering, founder ceiling) — closes CAT1-05

1. **Red first** with the local provider. A 200 MB PDF gets 413 at HEAD. With the cap raised alone and nothing else changed, process RSS grows by more than the file size. Capture both.
2. **One disk receiver**, `server/middleware/diskUpload.ts`:
   - `createDiskUpload({ maxBytes, allow })` uses `multer.diskStorage` into a per-request `fs.mkdtemp(os.tmpdir())` directory and removes it in a `finally` on every outcome, 4xx and 5xx included.
   - Mount it in `server/routes/vault-ingest.ts` in place of `:69-80`, keeping `requireEditorAccess` before it (`:148`).
   - Mount it on the Data Room capture in `server/routes/chat.ts:56` too. 13efb8fca made the two caps one on purpose: a document the Vault admits must be capturable into the Data Room. Raise neither cap until both receivers are on disk.
3. **Streamed storage.**
   - Add `putStream({ orgId, projectId, filename, mime, stream, metadata })` and `getStream(vaultVersionId, orgId)` to `IStorageProvider` (`server/services/storage/storage-provider.ts:51`).
   - Implement them in `s3-provider.ts` with `@aws-sdk/lib-storage` `Upload` (multipart), pinned to the installed `@aws-sdk/client-s3` line (`package.json:454`). Compute SHA-256 while streaming. Implement them in `local-provider.ts` with `stream.pipeline`.
   - Keep `put(Buffer)` for small callers.
   - `ingestVaultDocument` takes the temp path and uses `putStream`. The download route (`project-vault.ts:1793`) verifies and then sends in two streamed passes: hash first, then stream. It never buffers the file. Make the same change in the verified reader.
4. **Streamed scan.**
   - Add `scanFile(path)` to `server/utils/virusScan.ts`, sending INSTREAM chunks from a read stream.
   - `assertUploadSafe` already accepts a path (`uploadSafety.ts:131-134`) but reads the whole file. Read only the first 8 KiB for the signature checks, and stream the rest to clamd. It stays fail-closed in production.
5. **Raise the ceiling together, everywhere** (NEW founder decision; the recommendation is 500 MB):
   - set `VAULT_UPLOAD_MAX_BYTES` and `CHAT_UPLOAD_MAX_BYTES` (`document-intake-formats.ts:45-46`), `FILE_LIMITS.maxUploadBytes` (`server/config/platform-limits.ts:84`) and `CLAMD_CONF_StreamMaxLength` in Terraform (`ecs-fargate/main.tf:242`) and both compose files;
   - set `CLAMD_CONF_MaxFileSize` and `CLAMD_CONF_MaxScanSize` explicitly at or above the ceiling in the same places. Do not rely on image defaults: with `AlertExceedsMax=yes`, a file over them is refused as 422 `FILE_SCAN_INCOMPLETE`;
   - extend `boot_contract.tftest.hcl` (`:276-285`) and the Stage 1 compose rule to assert all three values.
6. **Infrastructure.**
   - Add `s3:AbortMultipartUpload` and `s3:ListMultipartUploadParts` to the task role (`terraform/modules/ecs-fargate/main.tf:96`).
   - Add an `aws_s3_bucket_lifecycle_configuration` with `abort_incomplete_multipart_upload { days_after_initiation = 1 }` to `terraform/stack/vault_storage.tf`.
   - Add a `terraform test` assertion for both, red first.
7. **The time budget.** The ALB idle timeout is 60 s. Measure on staging the server time from the last request byte to the response for a file at the ceiling. If it exceeds 30 s, stop and report **blocked**: anything larger needs asynchronous admission (quarantine, scan in the sweep, then admit), which is a separate design and not in this order.

**Acceptance**
- A 200 MB PDF uploads with 201 on the local provider, and RSS grows by less than 64 MB during the request. Red on HEAD (413).
- On staging, a file at the ceiling uploads with 201 within 30 s of server time after the last byte, and downloads with a matching `X-Content-SHA256`.
- Under `NODE_ENV=production`, EICAR still gets 400 and an upload with clamd stopped gets 503.
- The temp directory is empty after a success, a 4xx and a 5xx.
- `terraform test` and `ci:compose-boot-contract` fail when any of the three clamd limits is below the ceiling.

### Stage 5 — Document control: restore, withdraw, legal holds, and check-out if decided (Phase 3 · M, L with check-out · engineering) — closes CAT1-04, CAT1-15

1. **Red first.**
   - Add `tests/db/vault-version-restore.dbtest.ts`. Check in v1, then v2, then `POST …/versions/<v1>/restore` with a reason, and expect v3 with v1's `content_hash` superseding v2. At HEAD the route 404s, and re-uploading v1's bytes returns 409 `CONTENT_ALREADY_A_VERSION`.
   - Add `tests/db/vault-legal-hold-append-only.dbtest.ts`. Running as the runtime role, `UPDATE vault.legal_holds SET reason = …` and `DELETE` both succeed at HEAD.
2. **Restore.**
   - Move `readVerifiedVaultBytes` from `server/routes/c2c/project-vault.ts:833` into `server/services/vault/vault-bytes.ts`, so services do not import a route, and import it from both places.
   - In `vault-version-checkin.ts`, add `planRestore(q, { organizationId, programId, headId, sourceVersionId, lock })`:
     - reuse `planCheckIn`'s head, currency, link-conflict and `nextMajorVersion` checks;
     - require the source to be a live member of the same family (`vault-version-family.ts` `VALID_LINK`);
     - refuse 409 `ALREADY_CURRENT` for the head itself;
     - waive `CONTENT_ALREADY_A_VERSION` only when the matching row is the source.
   - Add `restoreVaultVersion()` in a new `server/services/vault/vault-version-restore.ts`:
     - call `vaultWriteRefusal()` (`vault-write-authority.ts:39`);
     - read the source through the verified reader, refusing 409 `SOURCE_BYTES_UNVERIFIED` on a hash mismatch;
     - write a new object through the storage provider, so the new row has its own `storage_version_id` and every row stays write-once under `migrations/20260926_vault_documents_record_immutability.sql`;
     - in one transaction under `recheckUnderLock` (FOR UPDATE, as `vault-ingest.service.ts:490`), insert the row with the next major, `supersedes_id = head`, the source's hash and the inherited filing (`inheritedPlacement`), copy the source's extraction outcome, and write a chained audit row `vault.version.restored` with `{ sourceVersionId, sourceVersion, supersedes, reason }`.
   - Factor the `INSERT INTO vault.documents` (`vault-ingest.service.ts:506`) into one shared row writer, and use it from both ingest and restore.
   - The restored version starts its own lifecycle record (`vault-lifecycle.ts`). It does not inherit the source's approval (FD4).
   - Add a route: `POST /api/c2c/project-vault/:id/documents/:documentId/versions/:versionId/restore` beside `GET …/versions` (`project-vault.ts:1647`), behind `requireEditorAccess`, with body `{ reason }` of 10–2000 characters. Return the planner's 404 and 409 refusals verbatim.
   - In `VaultVersions.tsx`, add "Restore as new version" with a reason prompt on non-current rows.
3. **Activate withdrawal.**
   - On staging (after MR-03), verify the list in `docs/architecture/DOCUMENT_DATA_LIFECYCLE_2026-10-06.md:74`: migration present, runtime-role permissions, consumer behaviour, concurrent writes, tenant retention. File it under `docs/evidence/MR-08/<date>/stage-5-dispositions/`.
   - After the owner accepts (NEW decision), set `C2C_DOCUMENT_DISPOSITIONS_ENABLED=1` and a dedicated 32+ character `DOCUMENT_DISPOSITION_PREVIEW_SECRET` from Secrets Manager in `terraform/stack` (`api_environment`, `api_secrets`) and in `docker-compose.beta.yml`.
4. **Append-only legal holds.** Add a new `IF NOT EXISTS`-guarded file `migrations/<date>_vault_legal_holds_append_only.sql`, inserted after `20260906b_vault_legal_holds.sql` (`scripts/db/migration-set.mjs:2178`) and before the final sweep pair.
   - Use `CREATE OR REPLACE FUNCTION`, and create each trigger only when it is absent. Do not DROP anything.
   - Refuse `DELETE`, `TRUNCATE` and any `UPDATE` except the write-once lift (`lifted_at`, `lifted_by`, `lift_reason` going `NULL` to a value).
   - Register the triggers in `server/services/audit/audit-immutability-triggers.ts` (next to `:74-77`), so production refuses to boot without them.
5. **Legal holds in the product.**
   - In the Vault document panel (`Vault.tsx`, near `:1794`), show an "On legal hold" badge with reference, reason and placed-by, read from `GET /api/vault/legal-holds`. Add `documentId` and `programId` query filters to `listHolds`.
   - Add Place and Lift actions with a required reason for `HOLD_AUTHORITY_ROLES` (`vault-legal-holds.ts:31`).
   - Add a holds register beside `RetentionPeriodCard` (`AdminSurfaces.tsx:925`).
   - Use the existing `POST /api/vault/legal-holds` and `POST /:id/lift` routes. Add no new hold API.
6. **Check-out**, only if the founder decides for it (NEW). The Vault plan excluded it: "check-in without check-out is enough for immutable versions".
   - Add a new migration in `C2C_MIGRATION_FILES` before the final pair. It creates `public.vault_document_checkouts` with `id uuid pk`, `organization_id INTEGER NOT NULL`, `program_id uuid NOT NULL`, `document_code text NOT NULL`, `checked_out_by int NOT NULL`, `checked_out_at timestamptz DEFAULT now()`, `expires_at timestamptz NOT NULL`, `reason text`, and `UNIQUE (organization_id, program_id, document_code)`. The tenant sweep gives it RLS.
   - Add `POST` and `DELETE …/documents/:documentId/checkout` with audit rows, modelled on `DurableLockManager` (`server/routes/realtime-collab.ts:777`).
   - `planCheckIn` and `planRestore` refuse 409 `DOCUMENT_CHECKED_OUT`, naming the holder and expiry. A manager may override with an audited reason.
   - Do not build on `document_locks` (`shared/schema.ts:2062`). Its `document_id` is an integer, it has no `organization_id`, and only `migrations/0000_sweet_joseph.sql` creates it, which is not on the applier.

**Acceptance**
- Restoring v1 creates v3 with v1's SHA-256, superseding v2, with the reason in the audit chain. v1 and v2 stay listed and downloadable, and v3 shows as not yet reviewed.
- A viewer's restore gets 403. Restoring another program's version gets 404. A source whose stored bytes no longer match gets 409. Each is red before its check exists.
- With activation on, a withdrawal preview has no activation blocker, and the apply returns 201 with a chained audit receipt. Withdrawing a document on an active hold gets 409 `DISPOSITION_BLOCKED`.
- As the runtime role, UPDATE or DELETE of a hold row is refused, and a lift with a reason succeeds. Red at HEAD. Production boot fails with the trigger missing.
- A viewer cannot see Place or Lift, and the API refuses them.
- If built: while user A holds a check-out, user B's check-in or restore gets 409 `DOCUMENT_CHECKED_OUT`, and org Y cannot read org X's check-out row as the runtime role.

### Stage 6 — Upload ergonomics, preview and bulk export (Phase 3 · L · engineering) — closes CAT1-17, CAT1-14 (export and preview; the external data room is F-27)

1. **One drop zone.** Extract the Data Room drop zone (`ProjectHome.tsx:611-640`) into `client/src/concept2cure/v2/FileDropZone.tsx` with `accept`, `multiple` and `directory` props. Use it in `ProjectHome.tsx` (`CHAT_UPLOAD_ACCEPT`) and around the Vault picker (`Vault.tsx:1390`, `VAULT_UPLOAD_ACCEPT`).
   - Folder upload uses a second hidden input with `webkitdirectory`, plus `DataTransferItem.webkitGetAsEntry` for dropped folders.
   - Files outside `VAULT_UPLOAD_EXTENSIONS` are listed as skipped with the reason, never dropped silently.
2. **Per-file progress.** In `useVaultUpload.ts`, replace the sequential `fetch` (`:135`, loop at `:236`) with XHR, so `upload.onprogress` is available, at a concurrency of 2. Each file's row shows queued, uploading n%, scanning and storing, stored as vN, or refused with the server's message verbatim. Allow a document type per row, defaulting to the batch selection.
3. **Bulk export.** Build the Vault plan's VR-20 archive builder once, as `server/services/vault/vault-archive-builder.ts`, taking a selection of version ids in one program. Later the seal will call the same builder.
   - The archive holds the originals at index-numbered paths, `manifest.json`, `SHA256SUMS` and the chained audit rows for those versions.
   - Verify every version against its `content_hash` before writing. Refuse the whole export if one fails.
   - Run it in the Stage 3 sweep and check it with `assertZipWithinLimits` before serving.
   - Add routes: `POST /api/c2c/project-vault/:id/exports` returns 202 `{ exportId }`; `GET …/exports/:exportId` returns the status; `GET …/exports/:exportId/download` serves the archive, audited.
   - Job state lives in a new `public.vault_exports` table (`organization_id INTEGER NOT NULL`, `program_id uuid`, `requested_by`, `status`, `selection jsonb`, `storage_version_id`, `sha256`, `error`, timestamps), in `C2C_MIGRATION_FILES` before the final pair.
4. **Preview.** Add `GET …/documents/:documentId/preview`.
   - It serves a PDF original inline after the verified read.
   - A DOCX is rendered on first request through MR-09's pipeline (`runDocxPdfPipeline`, `server/services/docx-pdf-pipeline.ts`) inside `withConversionSlot`. The rendition is cached by `content_hash` under a derived storage key.
   - The response is `Content-Disposition: inline`, labelled "Preview rendition of version N — not the recorded file".
   - A rendition is never a Vault version, never a submission leaf, and never what download serves. Do not call `convertDocxToPdf` (`pdf-converter.ts:75`).
5. **External sharing is not in this order.** F-27, and the Vault plan's FD12, say: design now, build after D1–D10 are green.

**Acceptance**
- Dropping a folder of 12 files, 2 of them `.exe`, uploads 10 with a row each and lists the 2 as skipped. Red on HEAD, which has no drop target.
- Exporting 5 versions returns 202, then a ZIP whose `SHA256SUMS` verifies against each version's `content_hash`. Tampering with one stored object makes the export fail as a whole.
- A DOCX preview renders inline with the rendition label, and download of the same document still returns the original bytes with a matching `X-Content-SHA256`.

### Stage 7 — Folder and document permissions (Phase 3 · L · engineering) — closes CAT1-13

1. **Settle the database half with evidence.** On the deploy-shaped database the `production-boot-smoke` job builds, record three things under `docs/evidence/MR-08/<date>/cat1-13-rls/`:
   - `relrowsecurity`, `relforcerowsecurity` and the owner of `vault.documents`;
   - `current_user` of the runtime pool (`app_service`);
   - a two-organisation read as `app_service` with `RLS_ENFORCE=on` that returns only its own rows.

   That closes the UNVERIFIABLE part. FORCE stays off by design, and any change belongs to MR-05.
2. **Build the ACL model** after MR-15 lands project membership (CAT1-06) and F-18 sets the default.
   - Add `public.vault_folder_grants` (`organization_id INTEGER NOT NULL`, `program_id uuid NOT NULL`, `folder_id text NOT NULL`, `user_id int` or `role text`, `permission` of `read` or `write`, `granted_by`, `granted_at`, `revoked_at`, `reason`) in `C2C_MIGRATION_FILES` before the final pair.
   - With no grant rows, project membership decides.
3. **Enforce in one place.** Write one check, `vaultAccess({ programId, folderId, userId, need })`. Call it from every Vault read and write route in `project-vault.ts`, from `/api/vault/ingest`, from AnA's Vault tools (`server/services/ana/document-tools-shared.ts`) and from the eCTD leaf resolver's Vault reads.
   - Search and counts exclude unreadable documents without revealing them.
   - Add a route-inventory test that fails when a Vault route does not call the check.
4. **Manage grants** from the project's settings, for the project lead and org managers, with every grant and revoke audited.

**Acceptance**
- The RLS evidence is filed.
- User B, a project member with no grant on a restricted folder, gets 404 on download and versions, does not see the document in the list or search, and AnA cannot retrieve it. After a grant it is visible, and after revocation it is gone. Red on HEAD, where any org member reads it.
- The route-inventory test fails when the check is removed from one route.

## Definition of done

- On `docker-compose.beta.yml`, `docker-compose.yml`, `npm start` with a local clamd, CI's production image, and the applied AWS staging stack, an EICAR file is refused with 400 and a clean PDF is stored with 201. A production-mode process without a scanner refuses to boot, and `/readyz` reports the scanner.
- A SAS V5 `.xpt`, `define.xml` and its stylesheet are stored and hashed. A scanned PDF uploads in seconds and is read in the background, with an honest pending state. A file at the founder's ceiling uploads without buffering in memory.
- No user-supplied archive is inflated past the shared limits on any path that reads one.
- A prior version can be restored as a new version with a reason. A mistaken upload can be withdrawn through the activated disposition decision. Legal holds are placed and lifted in the product, and their rows are append-only in the database.
- Every finding in this order has `statusAtHead` updated with its closing commit, and each acceptance check's red and green runs are filed under `docs/evidence/MR-08/`.

## Founder decisions this order needs

- **F-6** — Confirm the clamd sidecar as built rather than managed S3 malware scanning, and name the person who owns signature freshness and digest moves. Blocks Stage 2.
- **F-4** (through MR-03) — AWS accounts, region and domain for the staging stack. Blocks Stage 2 and the staging parts of Stages 4 and 5.
- **NEW: Vault admission limits.** Decide the largest file the Vault and Data Room accept. The recommendation is 500 MB: synchronous admission holds to about that size behind the 60 s ALB timeout, and anything larger needs a separate asynchronous design. Also decide whether `.zip` is admitted. The recommendation is no for the pilot, because eCTD wants individual `.xpt` files, not archives. Blocks Stage 4 and the `.zip` part of Stage 3.
- **NEW: Turning on document withdrawal.** The owner or reviewer must accept the staging verification that `docs/architecture/DOCUMENT_DATA_LIFECYCLE_2026-10-06.md:74` requires before `C2C_DOCUMENT_DISPOSITIONS_ENABLED=1`. Blocks Stage 5 step 3.
- **NEW: Legal-hold authority.** Decide who may place and lift a hold, and whether lifting needs an e-signature. This is the Vault plan's open FD7, adjacent to F-12. The shipped default is `AUDIT_READER_ROLES` with a reason and no signature. It does not block Stage 5; the default ships until decided.
- **NEW: Check-out and check-in.** The Vault plan excluded check-out. The recommendation is to build it only when a pilot customer's SOP requires it. Blocks Stage 5 step 6.
- **NEW: Renditions.** The Vault plan excluded renditions and an in-browser viewer. Confirm that a labelled preview is in GA scope. Blocks Stage 6 step 4.
- **F-18** — Project visibility default. Blocks Stage 7.
- **F-27** — The external data room. It is outside this order, and Stage 6 builds nothing for it.

## Do not

- Do not get a stack or CI job green by setting `NODE_ENV` to anything but `production`, by setting `SECURITY_SELF_TEST_NONBLOCKING=true`, by adding `CLAMAV_HOST` to `COMPOSE_EXCUSED`, or by running a stub that answers `PONG` and `OK`. A fake scanner is a scanner that admits malware.
- Do not raise `VAULT_UPLOAD_MAX_BYTES` before the receiver, storage writes and scan all stream and the clamd limits match. A raised cap on `memoryStorage` lets a few concurrent uploads exhaust a task's memory.
- Do not add a second clamd client, a second upload-safety path, a second archive helper or a second concurrency limiter. `virusScan.ts`, `uploadSafety.ts`, `safeZip.ts` and OPS-13's `conversion-slots.ts` are the only ones.
- Do not restore by relabelling a version, un-superseding an old row or editing `content_hash`. Restore inserts a new row. Do not introduce minor versions (FD1), and do not build check-out on `document_locks`.
- Do not change hold or document immutability by appending a DROP or by editing rows by hand. Add the guard in a new `IF NOT EXISTS` file or amend the creating migration in place with a dated note (Rule 1).
- Do not expand an uploaded `.zip` into Vault documents. Do not serve a DOCX rendition as the recorded file.

## How to run this order

- Claim it with one line in `docs/work-orders/README.md` §0 before starting, and release it when you stop. Name the launch row each stage moves: D1 (Stages 1–2), D2 (Stages 3, 4 and 6), D5 (Stage 5), D6 (SEC-17 in Stage 3) and D3 (Stage 7).
- Commit to `concept2cure-v2` only; merge, never rebase.
- Show each acceptance check failing on the current code before the fix, then passing. File that evidence under `docs/evidence/MR-08/<date>/`.
- When a finding closes, update its `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` with the closing commit.
- Coordinate with MR-03 on OPS-13's `conversion-slots.ts`, whichever order lands it first; with MR-09 on the DOCX→PDF pipeline; and with MR-15 on membership. Claim shared files in §0 before editing them.

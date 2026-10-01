# D1 — production as configured can take an upload, has an owner, and mounts the connector (2026-10-01)

Row **D1**. Lane: `…session_01SuVLo2`, claimed `92bc1291`. This covers the env-contract blockers of the multi-task audit
(`docs/evidence/W2/2026-09-24-multi-task/audit-findings.md`): U1 scanner and U9 connector, handed here by
`…01GSjEDJ`, plus the missing platform owner. Each item was open at `2625137d`.

Toolchain for every Terraform result below: Terraform 1.9.8 (CI's version, checksum-verified from
releases.hashicorp.com), `hashicorp/aws` 5.70.0 and `hashicorp/random` 3.6.3 from a local filesystem mirror, run on a
scratch copy of the repository so no `.terraform/` reached the tree. The AWS provider is mocked, as CI runs it
(`terraform-tests.yml`).

## What changed, red then green

| # | Defect at `2625137d` | Change | Red (trunk) | Green |
|---|---|---|---|---|
| 1 | `CLAMAV_HOST` set nowhere, so production refused **every** Vault upload with 503 `FILE_SCAN_UNAVAILABLE`, while `/readyz` read ready | **`9c335454`**. A ClamAV 1.4.6 (LTS) container runs beside the API, pinned by digest, with its database bundled. It is essential and health-checked (`clamdcheck.sh`). The API waits on it (`dependsOn HEALTHY`) and reaches it on loopback. `StreamMaxLength` equals the platform's largest upload, and the test reads it from `platform-limits.ts`. `AlertExceedsMax` is on. The task leaves the app 2048 MiB beside the scanner's 4096. The preflight requires the scanner. | `red/1-scanner-terraform-test.txt`: 4 assertions fail. `preflight/1-scanner-trunk-accepts-no-scanner.txt`: trunk's preflight **accepts** a task with no scanner. | `green/1-3-4-terraform-test-final.txt` (39/39). `preflight/1-scanner-cases.txt`: refused with no scanner, loopback with no scanner, a scanner not waited on, and a scanner with no health check; the rendered task definition is accepted. |
| 1b | clamd answers `OK` for a file over its size or nesting limits, having scanned part of it or none | Same commit. A `Heuristics.Limits.Exceeded` result is not clean and is marked `incomplete`. The upload is refused with 422 `FILE_SCAN_INCOMPLETE`, which names the cause; it is not reported as a virus or as an outage. | `red/1-scanner-unscannable-file.txt`: 2 failing | `green/1-scanner-unscannable-file.txt`: 38/38 (with `securityHealth`) |
| 2 | `templates/forms/acroforms` not in the image | Landed first by `…01GSjEDJ` as `4d3f141d1` (U7), with `ci:image-runtime-assets`. This lane's identical COPY and its narrower contract test were reverted before reaching trunk (`f2e2f3a5`): one implementation. | `2-forms-docker-build-proof.txt`, first half: a build of trunk's production `COPY` lines on busybox has no forms directory. | Second half: with the line, all five forms ship, and each SHA-256 equals its manifest. The landed line is the same line. |
| 3 | No platform owner named. First-run setup is open to anyone in production: it creates an active administrator for **any address**, with no e-mail verification, and returns a session. Naming the owner's address in an allowlist would therefore hand that address's cross-tenant access to whoever reached a fresh deployment first. Two concurrent first calls both succeeded. | **`b221cd64`**. In production, `POST /api/setup/initialize` needs the deployment's `SETUP_TOKEN` (32+ characters, constant-time compare, `X-Setup-Token`) and is closed without it. The create transaction takes an advisory lock and counts again under it. `BUSINESS_CENTER_EMAILS` now refuses a SAML identity, by the platform guard's own `tokenProvider` rule (IAM-03 parity). The stack renders `platform_owner_emails` (required, lower case) into `PLATFORM_ADMIN_EMAILS` and `BUSINESS_CENTER_EMAILS`, on the API only. It generates `SETUP_TOKEN` into Secrets Manager, for the API only, and the `first_run_setup` output names the call. | `red/3-owner-setup-route.txt`: 6 failing, including production setup returning 201 with no token and two concurrent first calls both returning 201. `red/3-owner-business-allowlist-saml.txt`: 2 failing. `red/3-owner-terraform-test.txt` | `green/3-owner-setup-route.txt`: 71/71 across the setup and neighbouring suites. `green/3-owner-business-allowlist-saml.txt`: 31/31. `green/3-owner-terraform-test.txt`: 39/39, including refusals of an empty owner list and of an upper-case address. |
| 4 | `MCP_ENABLED` never set, although CloudFront routes the connector's paths to the ALB, so no Claude client could connect | **`42842480`**. Sets the D8 lane's decided values (P-2): `MCP_ENABLED=true`, `MCP_PUBLIC_URL` at the deployment's origin, and `MCP_CLIENT_REDIRECT_ALLOWLIST=https://claude.ai,https://claude.com`. The preflight requires all three and checks their values. | `red/4-connector-terraform-test.txt`. `preflight/4-connector-cases.txt`, last case: trunk's preflight **accepts** a task with no connector settings. | `preflight/4-connector-cases.txt`: refused with none set, with `false`, with an empty allowlist and with an http origin; the rendered task definition is accepted. `green/preflight-proof-final.txt`: every proof step holds. |

## Decisions taken here (CPO mandate, 2026-10-01)

- **The scanner runs beside the API rather than as a service of its own.** There is nothing separate to route, scale
  or secure, and each task's uploads are scanned by a scanner that lives and dies with it. It is essential: a task whose
  scanner has died is replaced, not left refusing uploads.
- **ClamAV's LTS line (1.4.x), pinned by index digest.** The tag is rebuilt daily with fresh signatures, and the digest
  keeps a deployment reproducible. freshclam updates the database over the NAT. Moving the digest is for clamd itself,
  not for signatures (`terraform/stack/variables.tf`, `scanner_image`).
- **A file the scanner cannot read whole is refused, and told as that.** Without `AlertExceedsMax`, a crafted archive
  over the scan limits is answered `OK`.
- **The owner is bootstrapped by password sign-in address, then designated in the app.** The address allowlists are
  the documented bootstrap. Their holder grants `super_admin` in the audited Access Management console, after which
  the lists can shrink. `MASTER_ADMIN_EMAILS` stays unset.
- **First-run setup belongs to whoever holds the deployment's secret.** Holding it is the proof of operator
  authority, which is why the address it names is not verified by mail.

## Owed, and by whom

- **Founder (unchanged from W2):** the AWS account, DNS/ACM, secret values, and the `terraform apply`. New with this
  change: `platform_owner_emails` in the tfvars. After the apply, one `POST /api/setup/initialize` with the token
  from the `first_run_setup` output.
- **Cost of the scanner:** 4 GiB per API task (production and staging defaults are now 6144 MiB; staging moves from
  512 to 1024 CPU, since Fargate caps 512 at 4 GiB). At two production tasks that is about 8 GiB of Fargate memory
  more than before.
- **Not measured here:** clamd's load time and the scan time of a 100 MB PDF on one shared vCPU. The client gives a
  scan 30 s (`virusScan.ts`). These need the first staging task.
- **Docker Hub's anonymous pull limit** applies per NAT address. To pull from a registry of your own, mirror the same
  digest and set `scanner_image` (its description says how).
- **Two parallel scan doors fail open in production when the scanner is down:** `server/routes/chat/upload.ts` and
  the authoring images route call `scanBuffer` directly and admit an unscanned file. The fix is to move both onto
  `assertUploadSafe`. Both files were changed by other lanes in the last 24 hours:
  - the chat door belongs to the AnA client-files lane (`…01DiJJAk`, which also holds U4);
  - the authoring door is queued to this session after them.
- **The rest of U9, not done:** `/readyz` reporting the connector's state, and an explicit 404 on the connector's
  paths when it is off. The preflight now requires the connector on, so this stack cannot roll a task with it off.

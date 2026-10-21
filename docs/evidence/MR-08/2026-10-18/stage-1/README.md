# MR-08 Stage 1 — every production-mode stack scans uploads, and says when it cannot

Work order: `docs/work-orders/MR-08-vault-upload-safety-and-document-control.md`, Stage 1.
Base: `concept2cure-v2` at `8ca7e74ca`. Uncommitted when this file was written.
Launch row: D1 (production boot contract). Closes SEC-01 (compose part) and CAT1-01 (compose, boot and readiness parts).

Evidence files are in this directory. Files under `fix-round/` come from the review round of the same day.
They replace the top-level `compose-config.txt`, `compose-gate-after.txt` and `selftest.txt`, which show
`docker-compose.yml` before the scanner got its own network.

## What Stage 1 changed

| Area | Change |
|---|---|
| Compose (`docker-compose.yml`, `docker-compose.beta.yml`) | A `clamav` service on each stack, from the image Terraform runs (`terraform/stack/variables.tf`, `scanner_image`). It has `StreamMaxLength 100M`, `AlertExceedsMax yes`, a healthcheck with a 300 s start period, a 4G limit and `platform: linux/amd64`. It publishes no port and uses no profile. The app has `depends_on: clamav: service_healthy`, `CLAMAV_HOST: clamav` and `CLAMAV_PORT: '3310'`. In `docker-compose.yml` the scanner is on its own bridge, `c2c-scan`, and only the app also joins it (fix round, defect 6). |
| Compose gate (`scripts/ci/check-compose-boot-contract.mjs`) | `checkScanner` checks every production app service. `CLAMAV_HOST` must be a literal that names a service in the same file. That service needs a healthcheck. The app needs `depends_on` with `service_healthy`. The image must be Terraform's. `StreamMaxLength` must be `maxUploadBytes`, and `AlertExceedsMax` must be `yes`. Added in the fix round: the scanner may have no `ports`, `expose`, `profiles` or `network_mode`. It must share a network with the app, and no network with an optional-profile service. A production app may not set `SECURITY_SELF_TEST_NONBLOCKING`. Each rule has a `--self-test` case. |
| Boot (`server/services/securityHealth.ts`) | In production, `clamav_connectivity` fails with `critical: true` when `CLAMAV_HOST` is unset, so the boot self-test exits. Outside production the check is skipped. |
| Boot (`server/startup/env.ts`, `security-self-test.ts`) | Fix round, defect 5: production refuses `SECURITY_SELF_TEST_NONBLOCKING=true` at boot (exit 1, naming it). The self-test no longer honours it in production and no longer prints it as an override. |
| Readiness (`server/utils/virusScan.ts`, `server/startup/inline-endpoints.ts`) | `pingClamd` (`zPING`, true only on `PONG`) feeds `/readyz` `virusScan`. Production reports `ok`/`down` from a ping cached for 30 s, and `down` with `CLAMAV_HOST` unset. Elsewhere it reports `skipped`. Fix round: the port is validated and `connect` is guarded, so the promise never rejects (defect 1). `/readyz` turns any throw into `down` (defect 1). Concurrent callers share one in-flight ping, and a clock stepped back counts as expired (defect 2). |
| CI (`.github/workflows/ci.yml`, `scripts/ci/image-boot-signin.mjs`) | `production-boot-smoke` and `production-image-boot` start the pinned clamd and wait for it. They read the digest from `variables.tf` with `awk`. The image sign-in also uploads EICAR (expects 400 `FILE_SCAN_REJECTED`) and a one-page PDF (expects 201). |
| Docs (`docs/LOCAL_TESTING.md`) | Explains that `npm start` needs a scanner, with the image read by CI's `awk` line and no hard-coded digest (defect 7). `npm run dev` is unchanged. The compose stacks need no manual step. Lists the deploy paths that now refuse to boot (defect 8). |
| Terraform comments (`terraform/stack/main.tf`, `tests/boot_contract.tftest.hcl`) | The comments now say the worker task cannot boot without a scanner (defect 8). Behaviour and defaults are unchanged. |

## Acceptance, line by line

| Acceptance line | Status | Evidence |
|---|---|---|
| Red first: on the HEAD beta stack, a clean PDF to `POST /api/vault/ingest` returns 503 `FILE_SCAN_UNAVAILABLE` | **Server part shown; compose stack BLOCKED** | `upload-head-no-scanner.txt`: the HEAD server code, booted in production mode with no `CLAMAV_HOST` (what the beta stack ran), answers the clean PDF with 503 `FILE_SCAN_UNAVAILABLE`. The beta stack itself could not run: its app image fails to build on this host (`fix-round/compose-build-blocked.txt`, Docker Hub 429 on `node:22-slim`). |
| After the change: 201, EICAR `.txt` 400 `FILE_SCAN_REJECTED` | Shown on a production-mode server with the pinned clamd, not the compose stack (BLOCKED, as above) | `upload-after-with-scanner.txt` |
| With the scanner stopped, the next upload returns 503 and `/readyz` returns 503 with `virusScan: 'down'` | Shown with a TCP relay standing in for `docker compose stop clamav` | `scanner-gone-readyz-and-upload.txt` |
| `npm run ci:compose-boot-contract` fails on HEAD's compose files and names the missing scanner in both stacks, then passes | Done | `compose-gate-before.txt` (both stacks named). `fix-round/compose-gate-before.txt` (the fix-round rules fail the flat-bridge `docker-compose.yml`). `fix-round/compose-gate-after.txt` (passes). |
| `:selftest` passes, and every new case fails when its rule is commented out | Done | `selftest.txt` (the original 8 rules). `fix-round/compose-selftest-before.txt` (the new cases red before their rules existed). `fix-round/mutate-compose-gate.txt` (each of the 7 new rules disabled in turn). `fix-round/mutate-compose-gate-original-rules.txt` (the original 8, re-run against the final gate). `fix-round/compose-gate-after.txt` (all pass). |
| A `NODE_ENV=production` boot with `CLAMAV_HOST` unset exits non-zero and names `clamav_connectivity`; the new unit test is red at HEAD | Done | `boot-production-no-scanner-after.txt`, `fix-round/boot-production-nonblocking-refused.txt` (still exits, and the override hint is gone), `unit-securityHealth-before.txt` / `-after.txt` |
| The `/readyz` test is red at HEAD and green after the change | Done | `unit-readyz-before.txt` / `-after.txt`. Fix round: `fix-round/unit-readyz-virus-scan-before.txt` / `-after.txt` and `fix-round/unit-readyz-virus-scan-throw-before.txt` / `-after.txt` |
| CI's two production-boot jobs pass with a real clamd, and `production-image-boot` shows the EICAR 400 and the clean-PDF 201 | **BLOCKED** | CI has not run this change: it is uncommitted, and this round could not commit or push. `production-image-boot` also needs the image build, which fails here (`fix-round/compose-build-blocked.txt`). The local equivalent is `upload-after-with-scanner.txt`, the same script run against the same bundle. |
| The 1M/100M override pair is recorded | Done with standalone scanners, not the compose stack (BLOCKED, as above) | `fix-round/step6-streammaxlength-1M.txt`: a 2 MiB PDF gets 503 `FILE_SCAN_UNAVAILABLE`, clamd logs `INSTREAM: Size limit reached`, and a 0.5 MiB control gets 201. `fix-round/step6-streammaxlength-100M.txt`: 2 MiB and 49 MiB PDFs each get 201. Each file shows `clamd.conf`. The PDFs are checked in `fix-round/pdf-generator-check.txt`. |

### Fix round: each defect and its evidence

1. `pingClamd` rejected on a malformed `CLAMAV_PORT`, and `/readyz` answered a bare 500. `fix-round/unit-virusScan-before.txt` / `-after.txt` cover the ports `abc`, `70000`, `3310.5` and `-1`. `fix-round/unit-readyz-virus-scan-before.txt` / `-after.txt` cover `/readyz` with `CLAMAV_PORT=abc` (500, now 503 `down`). `fix-round/unit-readyz-virus-scan-throw-*.txt` covers the endpoint's own guard.
2. There was no shared in-flight ping. `fix-round/unit-virusScan-*.txt` covers 50 concurrent calls (now 1 connection) and a clock stepped back.
3. The cache test followed its constant. `fix-round/cache-bound-mutant.txt`: the old test passes against a 10-minute cache. The new tests fail both on the constant and on a comparison mutant that leaves the constant at 30 000.
4. Stale comments: the headers of `virusScan.ts` and `securityHealth.ts` are corrected. Fail-open applies only outside production.
5. `SECURITY_SELF_TEST_NONBLOCKING`. `fix-round/nonblocking-grep.txt` shows nothing sets it. `fix-round/unit-env-security-self-test-nonblocking-posture-*.txt` and `fix-round/unit-security-self-test-no-production-optout-*.txt` are the red/green unit runs. `fix-round/boot-production-nonblocking-refused.txt` is the real bundle. The compose gate cases are in `fix-round/compose-selftest-before.txt` and `fix-round/mutate-compose-gate.txt`.
6. Scanner reach: the gate rules and `fix-round/mutate-compose-gate.txt`. `fix-round/compose-config.txt` shows both files rendered by `docker compose config`, including who is on the scanner's network with every profile on. **Choice for `docker-compose.beta.yml`: left on `c2c-beta`.** That bridge holds only db, redis, app and clamav. No optional-profile service joins it, so the gate passes it as it is.
7. `fix-round/local-testing-digest.txt`: no digest literal is left. The doc's `IMAGE=` line runs, and it is byte-identical to `ci.yml`'s two lines.
8. Terraform comments and `docs/LOCAL_TESTING.md`. See "Production boot sites" below.
9. Step 6: as in the acceptance table. The compose build was tried once and is BLOCKED (`fix-round/compose-build-blocked.txt`).
10. This file.

Final runs: `fix-round/unit-all-after.txt` (12 files, 111 tests), `fix-round/eslint.txt` (0 errors; the warning ratchet holds) and `fix-round/tsc.txt`.

### Re-review round (same day)

An independent re-review confirmed the fixes above held. It found three smaller defects, and each is fixed:

- **`scanBuffer` had the defect `pingClamd` was fixed for.** It parsed `CLAMAV_PORT` with `Number()`. A malformed port threw out of the promise, so a non-production upload got a bare 500, and the file header's "every failure resolves" was false. It now uses the same `clamdPort()` rule as `pingClamd`, and its `connect` is guarded. A port that is not a port, or a `connect` that throws, resolves `{ scanned: false, clean: true, reason: 'clamav_unreachable' }`. The two clients can no longer disagree about whether `3310.0` is a port.
- **Three guards were not pinned by a test:** a peer that accepts and then hangs up or resets, the port rule on its own, and the `connect` guard on its own. Each now has a test. The port tests write the live test server's own port as `3310.0`, `0x…` and `…e0`, so removing the rule connects and gets `PONG` on any machine. An earlier version only failed because a clamd happened to listen on 3310 here. `fix-round/mutate-scanner-guards.txt` applies each guard's removal on its own, and each turns its tests red (the `scanBuffer` port mutant is re-run with nothing listening on 3310).
- **The compose gate crashed instead of failing one case.** With the missing-service rule disabled, the fix-round reach checks read `scanner.ports` on an undefined scanner, and the self-test died with a `TypeError`. `mutate-compose-gate-original-rules.txt` had recorded that as "exit=1". The reads are null-safe now. `fix-round/mutate-compose-gate-missing-service.txt` shows the same mutation failing the case it guards, "CLAMAV_HOST naming a missing service", by name.

After these: 19 test files, 203 tests pass across the scanner, readiness, boot, upload-safety and seed suites. `ci:compose-boot-contract` and its self-test pass.

### Final review (on the committed change, `fb95b9680`)

A final security review found no blocker and no major issue. It confirmed:
- no production path accepts an unscanned upload or boots without a scanner;
- every form of `SECURITY_SELF_TEST_NONBLOCKING=true` is refused (case, padding, tab, NBSP and BOM);
- the compose isolation renders as intended with every profile on;
- the digest has one definition.

It found three minor gaps, fixed in the follow-up commit. Evidence is under `final-review/`:

- **The documented `npm start` scanner ran without the two settings everything else sets.** Without `CLAMD_CONF_StreamMaxLength` and `CLAMD_CONF_AlertExceedsMax=yes`, clamd answers OK for a file over its default limits after scanning only part of it. That reads as a clean scan. `docs/LOCAL_TESTING.md` now passes both, the stream limit read from `platform-limits.ts` by CI's own line. `.env.example`'s production boot contract now names `CLAMAV_HOST`.
- **The compose gate's reach rule had blind spots.** Three gaps:
  - an optional service using `network_mode` to share the app's or the scanner's network namespace, or the host's, was skipped;
  - YAML merge keys (`<<: *anchor`), which Compose honours, were not resolved, so a scanner's `ports` could arrive unseen;
  - networks were compared by compose key, not by the bridge Docker creates, so two keys named alike were treated as separate.

  All three are closed. `extends:` on the app or the scanner is refused, because the gate cannot read the other file. Eight self-test cases cover them, and `final-review/mutate-compose-gate-reach.txt` removes each rule in turn and shows its case failing.
- **`scanBuffer` given something other than a Buffer** threw a `TypeError` inside the socket's connect callback, where nothing catches it, and its promise hung. It now resolves `{ scanned: false, clean: true, reason: 'not_a_buffer' }`, which production refuses. `final-review/unit-scanbuffer-not-a-buffer-before.txt` shows the three uncaught `TypeError`s; `-after.txt` shows them passing.

## Production boot sites that now refuse to boot (left to MR-14)

Each of these runs the server with `NODE_ENV=production` and no scanner. Since this stage, each one exits at boot and names
`clamav_connectivity`. That is the honest outcome: before, each booted and then refused every upload. Whether each path
stays, and gets a scanner, is MR-14's call. Stage 1 adds no scanner plumbing to them.

- **Replit deployment.** `.replit` `[deployment]` runs `npm run start`, which is `NODE_ENV=production node dist/index.js`, with no `CLAMAV_HOST`.
- **The Terraform ECS worker task.** `terraform/stack/main.tf` `worker_environment` has no scanner and no `CLAMAV_HOST`, by design, and `tests/boot_contract.tftest.hcl` asserts that. No worker image exists either (`.github/workflows/deploy-aws.yml`, "No worker image"). The comments now say the worker cannot boot. Behaviour is unchanged.
- **The Helm chart.** `charts/concept2cure-app/values.yaml` sets `NODE_ENV: production`.
- **App Engine.** `app.yaml` sets `NODE_ENV: production`.

The paths that do boot are the two compose stacks (with their `clamav` service) and the Terraform API task (its scanner
container, `CLAMAV_HOST=127.0.0.1`). So does `npm start` with the scanner from `docs/LOCAL_TESTING.md`.

## Deferred (recorded, not fixed here)

**NODE_ENV case and whitespace.** `server/config/environment.ts` trims and lower-cases `NODE_ENV`. `uploadSafety.ts`,
`securityHealth.ts` and `inline-endpoints.ts` compare it raw (`=== 'production'`). So `Production` or `production `
(trailing space) loads the production config but skips all three scanner controls: the fail-closed upload, the boot
refusal, and `/readyz`. The same raw comparison is in `startup/env.ts` and `security-self-test.ts`. The risk is narrow:
`deploy-aws.yml`, Terraform and the compose gate each pin the exact string `production`. The fix changes environment
parsing for every caller, so it belongs in its own change.

## Method notes

- The production-mode server is `node scripts/build-server.mjs` → `dist/index.js`, from this working tree. It boots with
  ci.yml `production-boot-smoke`'s environment against a throwaway Postgres 16 + pgvector over TLS on 127.0.0.1:5544,
  provisioned by `scripts/db/install-fresh.mjs` and `scripts/db/deploy-migrate.mjs`. The runtime role, `app_service`, is
  NOSUPERUSER and NOBYPASSRLS. The database, the bundle and the extra scanners were removed afterwards.
- Scanners come from the pinned digest `clamav/clamav:1.4.6@sha256:57deb108…`. `c2c-clamav` (3310, 100M) is the shared,
  long-running one. The fix round added `c2c-clamav-1m` (3311) and `c2c-clamav-100m` (3312) and removed them afterwards.
  The image's own signature database was used; freshclam had no internet here.
- `fix-round/upload-sizes.mjs` is `scripts/ci/image-boot-signin.mjs` cut at its EICAR step. It then uploads one padded
  PDF per size.

# D1 — MR-03 Stage 6 step 2: how long compile and assemble take, against the 60-second edge (2026-11-12)

Stage 6 step 2 (OPS-17) asks for p50 and p95 of compile, package assemble, sequence assemble and export, for an FDA
IND sequence of 50 and of 200 leaves, on the production image. The result decides whether steps 4–6 are built:
compile and assemble answer 202 with a job, and the three screens poll. If every p95 is under 45 s, those steps
are skipped.

**Result: a 200-leaf IND of 80-page documents compiles in p95 59.3 s on a 4-core host.** That is at the 60 s edge
(CloudFront `origin_read_timeout` and the ALB `idle_timeout`). The API task in production has 2 vCPU. Under the work
order's own rule, **steps 4–6 are needed.**

## The numbers

Measured by `measure-edge-timings.mjs` (this folder) at trunk `547dd420e` plus the STF fix below.

| Leaves | Pages per leaf | Uploaded | Compile p50 / p95 / max | Sequence assemble p50 / p95 / max | Runs | File |
|---|---|---|---|---|---|---|
| 50 | 8 | 1.4 MB | 4.77 / 4.96 / 4.96 s | 4.90 / 5.10 / 5.10 s | 5 | `timings-8-pages.txt` |
| 200 | 8 | 5.8 MB | 19.04 / 20.43 / 20.43 s | 19.50 / 20.32 / 20.32 s | 5 | same |
| 50 | 80 | 14.3 MB | 13.37 / 13.95 / 13.95 s | 13.40 / 13.68 / 13.68 s | 3 | `timings-50x80-pages.txt` |
| 200 | 80 | 58.1 MB | **55.45 / 59.25 / 59.25 s** | **54.38 / 55.96 / 55.96 s** | 3 | `timings-200x80-pages.txt` |

- Every call answered HTTP 200.
- Every compile completed and rendered every leaf (`leafFilesRendered` = leaves).
- Time is linear in both leaves and pages. The two 50-leaf runs fit about 0.08 s per leaf plus 0.0024 s per page. That
  fit predicted 54 s for 200 × 80; 55.5 s was measured.
- Compile and the sequence assemble cost the same, because both run `assembleSequence`. The packaging is the cost, not
  the compile's validation or its record.

**What this implies.** On this host, a 200-leaf IND crosses 45 s once its leaves average about 65 pages, and crosses
60 s at about 85. A pivotal clinical study report alone runs to hundreds of pages, so a real IND of that size will be
cut at the edge. The server finishes the compile and records it while the browser gets a 504 (OPS-17).

## How it was run, and how that differs from production

The production image could not be built in this session: its network refuses `deb.debian.org`, which the image's
packages come from (attempt recorded below). So the same code ran directly on the host, with the same toolchain:

- **Server:** `node dist/index.js`, built by `scripts/build-server.mjs` from the trunk commit. It ran with the
  environment `ci.yml`'s `production-image-boot` job boots the image with (`NODE_ENV=production`, `RLS_ENFORCE=on`, the
  runtime role only). Added: the heap cap the ECS task sets, `--max-old-space-size=2457`. `/readyz` was 200 with every
  dependency `ok`.
- **Database:** `pgvector/pgvector:pg15` with TLS, provisioned by `npm run db:provision` as the provision image runs it.
- **Scanner:** the clamd image `terraform/stack/variables.tf` pins. Every upload went through it.
- **PDF/A toolchain:**
  - Ghostscript 10.02.1 and OCRmyPDF from Ubuntu, where the image has Debian's;
  - veraPDF 1.30.2, fetched by `scripts/ops/fetch-verapdf.sh` with its pinned SHA-256.
  - The image's own `scripts/ops/check-pdfa-toolchain.sh` passed on this host.
- **Host:** 4 vCPU (Intel Xeon, 2.30 GHz) and 15 GB of memory. The production API task has 2 vCPU and 8 GB, which
  is shared with clamd. **Production is expected to be slower, not faster.**
- **Documents:** synthetic text PDFs of 8 or 80 pages (40 lines a page), unique bytes each. They are placed across
  Modules 1–5 with a reason. Module 4 and 5 study leaves get a study id and the ICH STF tag for a report body
  (`pre-clinical-study-report` and `study-report-body`). Real documents carry images and fonts, so they cost at least
  as much per page.
- **Identity:** the IND's application number, its bound applicant (with a D-U-N-S number) and its regulatory contact
  were recorded as the database owner, not through Submission Center's Forms and letters screens. Compile refuses
  without them. They are read once and change nothing about what is assembled.
- **Not measured:**
  - Package assemble (`/api/submission-ops/packages/:id/assemble`), which works on a separate package model.
  - Export (`/api/ectd-export/:id`). Production answers it 403 `LAUNCH_SCOPE`: it is outside the launch catalog and
    no user reaches it.

The first attempt to build the production image in this session reached the image's `npm ci` through the session's
proxy. It stopped at `apt-get` when the network policy refused `deb.debian.org` (HTTP 403). Moving the session to the
repository's saved environment was declined.

## A defect found on the way, and fixed

A Module 4 study report tagged `study-report`, which the ICH STF specification does not define for it, made
`POST /api/submissions/sequences/:id/assemble` answer **500 "Request failed."**. The server log held the sentence the
person needed: *"a nonclinical study report is tagged "pre-clinical-study-report". Correct it in Submission Center,
Builder, Edit study tagging."*

The cause: `generateStfFiles` refuses such a leaf with a plain `Error`. `assemble-from-core` turns only the packager's
`ValidationError` into the recorded 422 `ECTD_ASSEMBLE_BLOCKED`, which a lane added earlier the same day for FDA 1789.

- **The fix:** the packager raises the STF generator's refusal as its `ValidationError`, with a finding naming the file
  (`generateStfOrRefuse`, `server/services/submission-gateways/regional-packager.ts`). A programming error, anything
  but a plain `Error`, still passes on.
- **The test:** `stf-packaging.test.ts`. Red 1 of 6 (`stf-refusal-red.txt`), green 6 of 6 (`stf-refusal-green.txt`).
  Every test file that imports the packager, the assembly service or the STF generator passes: 83 files, 996 tests
  (`stf-refusal-suites.txt`).
- **On the running server, after the fix,** the same request answered 422 `ECTD_ASSEMBLE_BLOCKED` with that sentence,
  and its audit row was persisted and chained. Compile, which runs the same assembly, reported the sentence among its
  blockers instead of a bare failure.

## Then: steps 4–6, built and measured again

| Commit | What |
|---|---|
| `37e55e96a` | **Compile.** `POST /api/ectd-compile/:projectIdent/compile` asked with `Prefer: respond-async` answers 202 `{jobId, poll}` once every refusal is decided. It runs the same `compileFromSpine` in the request scope, holding its connection (`retainRequestDbClient`). `GET …/jobs/:jobId` returns the full `CompilationResult`, for the session's organization only. The job is a row of `artifact_compute_jobs`, under an `ectd-in-process` profile seeded in place in `20260326_artifact_compute_plane.sql` (RULE 1). A sweep marks a job abandoned past its 30-minute timeout, once across tasks. `EctdCompile.tsx` polls every 2 s and shows the seconds; the polling helpers are split into `ectdCompileJob.ts`. |
| `114773a67` | **The test package.** `POST /api/submissions/sequences/:seqId/assemble` does the same. The job holds the route's answer: 200, or the recorded 422 refusal. `SequenceAssembleTestPackage.tsx` follows it, keeping "could not be confirmed" for a failed job or an unreadable poll. |

**How each was shown:**
- **Compile, route test:** fails on trunk, which has no job route (`compile-job-red.txt`); 6 of 6 green
  (`compile-job-green.txt`).
- **Compile, screen test:** 4 of 5 fail on trunk (`screen-job-red.txt`); 5 of 5 green (`screen-job-green.txt`).
- **Test package, route test:** 4 of 7 fail on trunk (`assemble-job-red.txt`); 7 of 7 green (`assemble-job-green.txt`).
- **Test package, screen test:** 5 of 5 fail on trunk (`testpkg-job-red.txt`); 5 of 5 green (`testpkg-job-green.txt`).
- **Live, on the server built from each change, at 200 × 80 pages:**
  - compile answered 202 in 19–36 ms, and its job completed in 51–59 s with 200 leaves rendered;
  - the test package answered 202 in 23–26 ms, and its job completed in 49–51 s
  - (`timings-200x80-pages-async.txt`, `timings-200x80-pages-async-both.txt`).

**Not changed: package assemble** (`/api/submission-ops/packages/:id/assemble`). No screen calls it. Gateway
Transmittals became read-only on 2026-10-17 (LX-13), and a sequence is transmitted from its Dispatch tab. The work order
names `GatewayTransmittals.tsx` for it, which predates that change.

**Left: the staging acceptance** (MR-03 Stage 5). A 200-leaf compile behind CloudFront with no 504 in the access log.

# WC evidence — VSR-001 findings F-4, F-5, F-7, F-8 fixed, 2026-09-21

**Row moved:** D4 (validation package) — four product findings from the local
CSA execution (`docs/validation/VSR-001-VALIDATION-SUMMARY-REPORT.md` §4) now
have a code change, a test that failed before the change and passes after it,
and a live re-execution against a server on port 5600. **State after this
session:** F-4, F-5, F-7 and F-8 are closed in code; the OQ steps that recorded
them (OQ-VAULT-02, OQ-PROJ-10 / OQ-SUBC-13, OQ-SUBC-10, OQ-SRDY-07) need a full
`npm run validation:oq` re-execution and a regenerated TM-001 before the row
moves — this folder holds the per-finding proof, not a re-signed package.

No git command was run. `changed-files.txt` lists every file touched, by
finding.

## Method: every test was made to fail first

`tests-before-fix.txt` is one vitest run of the seven test files against the
unchanged code: **23 failed, 15 passed** — and the failures reproduce the VSR's
observations exactly (`expected 500 to be 400` for the `.exe`; the dossier-map
assembler called with `[7, 6191805]`, the integer `parseInt` makes of a UUID;
`expected 429 to be 200` for one authenticated user). `tests-after-fix.txt` is
the same run after the changes: **38 passed, 0 failed**.

## F-4 — `.exe` refused with 500 → 400 `FILE_TYPE_NOT_ALLOWED`

- **Root cause.** `server/routes/vault-ingest.ts` gave multer a `fileFilter`
  that refused with a bare `Error`; multer passed it to `next(err)`, nothing
  in between recognised it, and the platform's generic handler answered
  `500 SERVER_ERROR "File type .exe is not allowed"` (OQ-VAULT-02). Nothing was
  stored — integrity held — but a 500 says the server broke, and URS-VAULT-003
  asks for a 4xx.
- **Fix.** A typed `FileTypeNotAllowedError` from the filter and a
  `receiveUpload` wrapper that owns every multer outcome: 400
  `FILE_TYPE_NOT_ALLOWED` naming the accepted set, 413 `FILE_TOO_LARGE` on
  `LIMIT_FILE_SIZE`, 400 `UPLOAD_INVALID` for any other `MulterError` (wrong
  field name, too many files). An unknown error still reaches the generic
  handler.
- **Test.** `server/routes/__tests__/vault-ingest-refusal-status.test.ts` —
  runs the router under the app's real `errorHandler` so the 500 reproduces
  pre-fix; the service is mocked and asserted never called on a refusal; the
  happy path (a `.pdf`) still reaches the governed ingest.
- **Live.** `live-api-checks.txt`: `POST /api/vault/ingest payload.exe` →
  `HTTP 400 {"error":{"code":"FILE_TYPE_NOT_ALLOWED","message":"File type .exe
  is not allowed. Accepted: .pdf, .docx, …"}}`; wrong field name → 400
  `UPLOAD_INVALID`.

## F-5 — one browser session tripped the per-IP limiters

- **Root cause.** Two limiters, both keyed by client IP for every request:
  1. `server/middleware/rateLimiter.ts` (legacy, in-memory) is mounted by
     eleven routers (`createRateLimiter()`), all sharing ONE module-level
     store, `api` bucket **60/min** — that is the `X-RateLimit-Limit: 60` the
     VSR saw. Tasks + Vault + Submission Center make more than sixty calls
     across those routers in a minute. It runs after `authenticateToken`, so
     it *had* a verified identity and never used it.
  2. `server/middleware/redisRateLimiter.ts` is mounted on `/api` by
     `startup/middleware.ts` **before** the auth boundary; its key generator
     preferred `req.userId`, which is never set that early, so it always fell
     back to IP at `api` **100/min**.
  Behind a corporate NAT the whole office shares each bucket.
- **Fix (numbers documented in `server/config/platform-limits.ts`).**
  - Anonymous traffic (no identity, no credential): **unchanged** — per IP at
    the existing ceilings (100/min Redis `api`, 60/min legacy `api`).
  - Legacy limiter: a verified identity (`req.userId` / `req.user.id`) is
    keyed `user:<id>` at `maxRequestsAuthenticated` = **600/min** (shared
    across the eleven routers, as before).
  - Redis limiter: a verified identity → `user:<id>`; else a presented bearer
    credential → `cred:<sha256 prefix>` at **600/min** for `api` and
    `concept2cure`, **and** a second count against `ipcred:<ip>` at
    `maxRequestsPerIpAuthenticated` = **3,000/min**, so minting unverified
    tokens cannot escape the per-IP bound (rotation is bounded at fifty
    users' worth). Resource-priced buckets (ai, documents, validation, upload)
    keep their ceilings, now per identity rather than per address; `auth`
    declares no authenticated ceiling (a login carries no credential).
  - Headers report the ceiling that applied to the request's own bucket.
- **Tests.** `server/middleware/__tests__/rateLimiter-identity-key.test.ts`
  (per-IP still trips at 60; one user passes 61 and trips at 601; two users
  behind one NAT do not share; anonymous traffic from that NAT keeps its own
  bucket) and `redisRateLimiter-identity-key.test.ts` (per-IP trips at the
  per-IP ceiling; a credential passes it and trips at the credential
  ceiling; two credentials do not share; rotating credentials from one
  address trips the per-IP credentialed guard; a verified user id wins over
  the credential; the platform numbers are ordered as documented).
- **Live.** `live-rate-limit-headers.txt`: authenticated `GET /api/submissions`
  and `GET /api/c2c/projects` → `X-RateLimit-Limit: 600`; the same paths with
  no credential → `X-RateLimit-Limit: 100` then 401.
  `live-rate-limit-burst.txt`: one authenticated session, **150 × GET
  /api/submissions in 3 s → 150 × 200**; **150 × GET /api/c2c/projects in 2 s
  → 150 × 200** (pre-fix: 429 from the 61st and 101st respectively); control:
  105 anonymous requests → 100 × 401 then **5 × 429** — the per-IP bucket is
  still enforced.
- **Not changed, on purpose.** The Redis limiter's mount order
  (`startup/middleware.ts`) is outside this finding's files; keying by the
  presented credential works where it is mounted today and stays correct if
  it is ever moved behind auth (verified identity wins).

## F-7 — dossier map `parseInt`'d the program UUID

- **Root cause.** `server/routes/dossier-map.routes.ts` accepted only an
  integer and `parseInt`'d `projectId`; the shell supplies the
  `regulatory_programs` UUID (`DossierMap.tsx`). `parseInt('6191805f-…')` is
  `6191805`, an integer that belongs to nobody (500 observed, OQ-SUBC-10);
  any other UUID was a 400. The program had also been created with
  `projectAnchorSkipped: NO_CLIENT_WORKSPACE`, so no PM-spine id exists for
  it at all.
- **Fix.** An identifier is never parsed as a number. A UUID is checked to
  exist in the acting org (404 `PROGRAM_NOT_FOUND` otherwise) and resolved
  through the existing bridge `resolveProgramProjectAnchor`
  (`services/c2c/program-project-anchor.ts`, the one reader of
  `projects.regulatory_program_id`). A program with no anchor answers an
  **empty map whose `meta` says `anchored:false, reason:PROGRAM_UNANCHORED`**;
  an anchored one is assembled from its project id. An integer still names a
  legacy `projects.id`, digits only (`12abc` is 400, never project 12). The
  surface now reads the program through `readShellProject` (the shell's one
  reader, replacing a hand-rolled copy) and renders the unanchored answer as
  "This program has no CTD section-tracking store yet" — distinct from "No
  dossier map yet", which would claim the sections exist and are unauthored.
- **Tests.** `server/routes/__tests__/dossier-map-read.test.ts` (extended:
  the `6191805f-…` UUID reaches the anchor lookup and the assembler is called
  with the anchored id 42, never 6191805; unanchored → empty + `anchored:false`;
  foreign UUID → 404 with nothing read; `12abc` → 400) and
  `client/src/concept2cure/v2/__tests__/dossierMapProgramScope.test.tsx`
  (UUID sent verbatim; anchored map renders; unanchored renders as "no section
  store", not "No dossier map yet"; no program → nothing fetched).
- **Live.** `live-api-checks.txt`: the new program's UUID → 200
  `anchored:false, reason:PROGRAM_UNANCHORED`; a UUID in no org → 404
  `PROGRAM_NOT_FOUND`; `12abc` → 400; `1` → 200. The W3 program
  `6191805f-…` still exists in this same local org, so it answers
  `anchored:false` (verified by SQL: the row exists, and 0 `projects` rows
  anchor either program); the anchor module logged no lookup failure, so
  "unanchored" was a real no-anchor, not a swallowed privilege error.
- **Open.** Every program in an organisation without a client workspace is
  unanchored, so the dossier map is honestly empty for all of them; the
  section-tracking store is keyed by the legacy project id (the same gap
  `ectd-compile.ts` names as `PROGRAM_SECTION_STORE_BLOCKER`). That is the
  document-identity contract's slice, not this finding's.

## F-8 — dispatch readiness gated `subs[0]`, not the open program's sequence

- **Root cause.** `DispatchReadiness.tsx` read `GET /api/submissions` and took
  the first row — the organisation's most recently updated submission,
  whichever program it belonged to — then its last sequence. With two
  submissions it gated another program's filing and told a program whose
  sequence existed that it had none (OQ-SRDY-07). A failed discovery was also
  rendered as that empty state.
- **Fix.** The open program (`readShellProject`; the OQ harness seeds the id
  alone) is resolved to its record (`GET /api/c2c/projects/:id`), its
  submission is chosen by the **server's own** program↔submission identity
  convention (application type + product_name / name / code against the
  submission's product_name / title, newest first —
  `services/cmc/submission-spine.ts`, `routes/c2c/project-intake.ts`), and
  that submission's latest sequence is gated. Each other state is rendered as
  itself: no program open, no submission for the program, no sequence on it,
  discovery failed (an error, not an empty state). The header prints the
  sequence **number** (`Sequence 0000 (id 20)`) and the program, because a
  filing is known by its number and the assessment carries only the row id.
- **Tests.** `client/src/concept2cure/v2/__tests__/dispatchReadinessProgramScope.test.tsx`
  (two submissions, `subs[0]` belongs to another program: the open program's
  sequence 9 is gated and sequence 7 is never fetched; program with no
  sequence → honest empty naming the program, not the other program's gate;
  no submission → says so; no program → nothing gated; failed discovery →
  error). `dispatchReadinessServerGate.test.tsx` now seeds the open program.
- **OQ runner.** `tests/validation/lib/fixtures.mjs`: `createProgram` carries
  intake's `meta.submissionId` as `spineSubmissionId`;
  `createSubmissionWithSequence` accepts `submissionId`. OQ-SRDY-00 now builds
  its sequence on the **program's own** submission — the previous fixture
  created a submission titled "OQ-005 IND …" for a program named "OQ-005
  Readiness program …", which by the platform's identity rule is not that
  program's, so the step could never have passed against a correctly scoped
  surface. The step note is updated.
- **Live.** `oq/OQ-SUBMISSION-READINESS/` is `tests/validation/oq/submission-readiness/run.mjs`
  re-executed against port 5600 (see "OQ re-execution" below);
  `steps/OQ-SRDY-07.png` shows the surface gating the program's own sequence.
- **Open.** The identity rule now exists in the client as well as in three
  server modules; a program-scoped server read (a `programId` on
  `submissions`, or the spine exposed on `GET /api/ectd-compile/:id/status`)
  would let the client stop mirroring it. Not in this finding's files.

## OQ re-execution against 5600 — the four protocols that recorded the findings

Run with `VALIDATION_BASE_URL=http://localhost:5600 VALIDATION_EVIDENCE_ROOT=…/WC/2026-09-21/oq
VALIDATION_RUN_DATE=2026-09-21 node tests/validation/oq/<app>/run.mjs`; console output in
`oq-<app>-run.txt`, records and screenshots under `oq/OQ-<APP>/`. Chromium 141 through
`playwright-core`, identity via dev-login, same local database as the W3 run.

| Protocol / step | W3 (2026-09-20) | WC (2026-09-21) |
|---|---|---|
| OQ-002 Vault — **OQ-VAULT-02** `.exe` refused (F-4) | fail: 500 `SERVER_ERROR` | **pass: 400** `{"error": {"code": "FILE_TYPE_NOT_ALLOWED", "message": "File type .exe is not allowed. Accepted: .pdf, .docx, .doc, .txt, .rtf, .xlsx, .xls, .csv, .md` |
| OQ-001 Projects — **OQ-PROJ-10** Tasks surface (F-5) | pass, but nine `429` console errors and a 62 s wait | **pass, 0 console 429s, 0 rate-limit retries across all 16 steps** |
| OQ-004 Submission Center — **OQ-SUBC-10** dossier map by program UUID (F-7) | fail: 500 | **pass: 200** `{"count":0,"source":"project_sections","programId":"…","projectId":null,"anchored":false,"reason":"PROGRAM_UNANCHORED"}` |
| OQ-004 Submission Center — **OQ-SUBC-13** surface renders (F-5) | pass with ten `429` console errors | **pass, 0 console 429s** |
| OQ-005 Submission Readiness — **OQ-SRDY-07** gates the open program's sequence 0000 (F-8) | fail: showed another submission's "Sequence 18" | **pass**: `steps/OQ-SRDY-07.png` shows "OQ-005 Readiness program … · Sequence 0000 (id 22)" with the program's own three blockers |

Other steps, for the record: OQ-002 passes VAULT-00…07 and 10, fails
VAULT-08 / 08b (F-1 / F-2, another session's findings) and VAULT-09 (the Vault
surface's page text did not contain the document title within the harness's
wait; its console shows no 429 and no 500 — the W3 IQ-DEV-001 privilege
deviation is gone, VAULT-04 now lists 73 documents — so this is the untouched
Vault surface's own timing, recorded here and not WC's); OQ-004 is 14 pass + OQ-SUBC-08 deviation (the
password the runner does not hold — as in W3); OQ-005 is 9/9 pass (OQ-SRDY-03,
the dispatch QC that called the model in W3 — F-9 — passed here against
another session's in-progress change to `submission-ai-service.ts`, which is
not WC's to claim); OQ-001 still fails OQ-PROJ-06 / 06b (F-1 / F-2, another
session's findings). A first attempt at OQ-005 and OQ-002 failed on step 00
with `audit_logs … violates check constraint audit_logs_chained_rows_have_chain_seq`
(23514) — another session applied `migrations/20260921_audit_logs_chain_seq.sql`
(F-1 work) to the shared local database mid-run while this server still ran the
older audit writer; both protocols were re-executed once creates worked again.

## Gates

| Gate | Result | File |
|---|---|---|
| `npm run typecheck:fast` | 5 errors, all in `server/services/signature/__tests__/kms-signer.test.ts` (pre-existing, W3b's fake-KMS typing); **0 in any WC file** | `typecheck-fast.txt` |
| `npx eslint` on every changed file | 0 errors; 5 warnings, all pre-existing in kind and count (`_omitted` in the existing test; `DispatchReadiness` and `DossierMap` function length/complexity, both already over the limit before this change; `redisRateLimiterMiddleware` complexity 17, unchanged) | `eslint-changed-files.txt` |
| `npm run ci:eslint-ratchet` (repo-wide) | **FAIL, not from WC's files**: the rules that grew are `no-console`, `no-undef`, `max-lines`, `max-depth`, `no-useless-assignment`, `security/detect-possible-timing-attacks` and `max-lines-per-function`; none of the first six occur in any WC file, and the files another session modified in this working tree during the run carry exactly those rules (46 `no-console`, 5 `no-undef`, …) | `eslint-ratchet.txt`, `eslint-ratchet-attribution.txt` |
| `npm run validation:lint` | 0 errors; 28 warnings, none in the two runner files WC changed | `validation-lint.txt` |
| `npm run ci:launch-scope` | pass | `ci-gates.txt` |
| `npm run ci:ana-surface-context` | pass, 114 of 120 — baseline exact, no new publisher added | `ci-gates.txt` |
| vitest, the seven touched test files | 38 passed | `tests-after-fix.txt` (and `tests-before-fix.txt`: 23 failed pre-fix) |

Server for the live checks: `npx tsx server/index.ts` with `ALLOW_DEV_AUTH=1
PORT=5600 SKIP_DB_STARTUP_TEST=true LAUNCH_SCOPE_ENFORCE=on`, database
`clinicalsage` on 127.0.0.1:5432 as role `c2c`, identity
jonmichaelpsmith@gmail.com (dev-login), organisation 2, no AI provider
(`/readyz` 503 `ana=down`, as in W3).

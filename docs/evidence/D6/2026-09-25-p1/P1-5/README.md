# P1-5 — an unbounded memory upload, and no count of upload sites without the guard (IAM-14, Medium)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-14. **Plan item:** P1-5 (this commit: the
named router and the gate; the sweep of the remaining sites is the rest of the item).

## What was wrong

`server/src/routes/stability.router.ts` built its uploads with `multer({ storage: multer.memoryStorage() })`: no
`limits.fileSize`, so a client could buffer any number of bytes into the process heap before anything looked at the
request; no `fileFilter`, so `payload.exe` declared as `text/csv` was admitted on its declared type; and a private copy
of the signature logic instead of the platform's guard (`assertUploadSafe`, which also runs the malware scan and fails
closed in production). Across the server, the audit counted 25 multer handlers of which 7 ran the guard, and nothing
stopped the next one arriving without it.

## What is true now

- The stability router's instance is bounded (25 MB, one file), filtered through `makeUploadFileFilter` on the
  router's own type list with the platform's blocked extensions, and its three multipart routes run `assertUploadSafe`
  through the one `validateUploadedFile`; multer's outcomes are answered as 413 / 415 / 400 instead of a 500. The private
  magic-number and printable-text copies are gone.
- `scripts/ci/check-upload-guards.mjs` counts every `multer(…)` site in `server/` lacking `limits.fileSize`, a
  `fileFilter`, or an `assertUploadSafe` call in its file; `--list` prints the population, `--selftest` constructs the
  failing cases (a bare site, a guarded one, a comment that is not a site, a reasonless baseline entry, a file above its
  count) and exits non-zero unless every one is caught. `scripts/ci/upload-guards-baseline.json` holds the 13 remaining
  sites across 12 files, each with a written reason naming what is missing and who owns it; two are gate limits (the
  guard runs in another file), ten are defects.

| | File | Result |
|---|---|---|
| red | `red/gate-on-audited-router-and-selftest.txt` | the scanner on the router as committed at `73512fda`: one site lacking all three; `--selftest` 6 / 6 caught |
| red | `red/upload-guard-before-fix.txt` | the behavioural test on the committed router: a 26 MB body and a `.exe` declared as CSV both reach the handler; 4 failed / 1 passed |
| green | `green/upload-guard-after-fix.txt` | 17 / 17 across the new suite, the router's honesty suite and the signature-write-paths gate test |
| green | `green/gates.txt` | `check:security-patterns` 0 violations; `ci:upload-guards` OK (13 sites / 12 files, none new) |

Tests: `server/src/routes/__tests__/stability-upload-guards.test.ts` (supertest over the real router; the db and the
tenant scope are doubles; the size-limit case sends 26 MB and gets 413 before any query).

## Not done here

- **Wiring.** `package.json` and `.husky/pre-push` were both touched by another lane at 07:23 UTC on 2026-09-25, so the
  `ci:upload-guards` script and its pre-push line (beside `ci:sign-ceremony`) wait for that window (07:23 UTC on
  2026-09-26), together with `ci:trivyignore-hygiene` from P0-16a. Until then the gate runs by hand.
- **The 12 files in the baseline.** Ten defects (four in the launch catalog: Authoring's image and DOCX import, AnA
  knowledge sources, Authoring templates, Projects onboarding, the Submission Center's official-form upload) and two
  gate limits. `authoring.router.ts` is inside another lane's window until 01:51 UTC; the rest are cold and are the
  next D6 upload session's, one commit each, shrinking the baseline.
- **`DocumentDataCenterService.ts`** stores to disk with no filter; it is outside the launch catalog and in the baseline.

## Sweep, part 1 (same day): the four launch-catalog files

`sweep/catalog-four/` — `server/routes/c2c/knowledge-sources.ts` (AnA knowledge sources: gained a `fileFilter` and the
byte check), `server/routes/c2c/templates.ts` (Authoring templates: byte check in both handlers through one helper),
`server/routes/onboarding-proposals.ts` (Projects onboarding: `fileFilter` and byte check), `server/routes/ind-forms.routes.ts`
(Submission Center official-form upload: the scan after its own PDF magic check). Multer's outcomes are answered by one
shared `receiveUpload` (`server/middleware/uploadAllowlist.ts`: 413 / 415 / 400 with a code) instead of a per-router
copy; its unit test is `server/middleware/__tests__/uploadAllowlist-receive.test.ts`. `red.txt` is the scanner on the four
files as committed (each lacked the byte check, two also the filter); `green.txt` is 100 / 100 across the four routes'
existing suites and the receiver's; the baseline shrank from 12 files to 8.

## Sweep, part 2 (same day, by a helper agent under the control tower): the five files outside the launch catalog

`sweep/{academic-resource-upload,client-intelligence,knowledge-base,preclinical,DocumentDataCenterService}/` — each
gained what it lacked (a `fileFilter` built from its own type list where it had none; `assertUploadSafe` on the buffer,
or on the path with the file removed on refusal for the two disk stores; the shared `receiveUpload` for multer's
outcomes) and a test of its own (35 cases: oversize 413, `.exe` as an accepted type 415, an unread type 415, wrong bytes
400 `FILE_SIGNATURE_MISMATCH`, no-file pass-through, a control that reaches the handler; the disk stores also assert the
refused file is gone). Red ran against the committed files; the pre-existing suites of those files (33 cases) still pass.
`gate-after-sweep-2.txt`: the baseline is down to 3 files / 4 sites: `authoring.router.ts` (inside another lane's
window until 01:51 UTC) and the two gate limits (`chat.ts`, `vault-ingest.ts`, whose guard runs in another file).

Two observations from the sweep, for the next session: (1) `DocumentDataCenterService.uploadDocument` keeps a private
`validateFileSignature` that is now redundant with the guard; (2) a Windows browser sends a `.csv` as
`application/vnd.ms-excel`, which the shared byte check reads as an OLE container and refuses (400) at every
`assertUploadSafe` site, this sweep's included; that is a platform-wide rule in `server/utils/fileSignature.ts`, not a
per-route one.

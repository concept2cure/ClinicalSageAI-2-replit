# D5 — the document-lifecycle route recorded Part 11 signatures without re-verification, 2026-09-24

**Launch row:** D5, Part 11 evidence (`docs/LAUNCH_DEFINITION_OF_DONE.md`) —
"every signing path re-verifies the signer through one ceremony". Two paths in
`server/routes/document-lifecycle.ts` did not.

**Reachability, stated plainly.** The router is mounted at
`/api/regulatory/documents` behind `authenticateToken`
(`server/bootstrap/register-regulatory-routes.ts:484`). No file in `client/src`
calls it (0 references), so no product screen reached these defects. Any
authenticated API caller did — including a `viewer`.

## 1. What was wrong

| # | Path | Defect |
|---|---|---|
| 1 | `POST /:id/sign` | Recorded a "reviewed" or "approved" Part 11 signature from the session alone: no password, no second factor (§11.200). The signer's **role came from the request body**. The actor fell back to the string `'unknown'` when no user id resolved. |
| 2 | `POST /:id/advance {to:'approved'}` | Minted an approval through the `applySignature` binding, citing **whatever `signatureRef` the request body supplied** — which then entered the hash-chained audit trail. |
| 3 | every write (`POST /`, `/:id/sign`, `/:id/advance`) | No role gate. The canonical leaf write this route can lead to (`PUT /sequences/:seqId/leaves`) requires `regulatory-author`, which a viewer does not hold. |
| 4 | `advance` actor | `'unknown'` fallback; and the leaf-writer binding (wired 2026-09-19) was injected only when a user id resolved — so the pipeline test, whose request user had no `id`, silently tested the unwired path. |

## 2. The fix

- Signing goes through the platform's one ceremony, `reverifySigner`
  (`server/services/part11/reverify-signer.ts`): account standing, lockout,
  password, enrolled second factor. The identity is the authenticated user or
  nothing (401). The role is the server's reading (`resolveUserRole`, moved from
  a private copy in `esignature.ts` to `server/types/auth-request.ts` so both
  routes share it) and must carry signing authority (`isSigningAuthorized`,
  §11.10(g)).
- `advance → approved` runs the same ceremony. The request body's `signatureRef`
  is no longer read by any transition; the binding mints the reference
  server-side.
- **The gate is asked before the ceremony.** A wrong password counts against the
  account's lockout (F-27); asking for one on a transition the gate refuses would
  let an illegal jump spend a signer's attempts.
- Every write carries `requireRole('regulatory-author')`, as the canonical leaf
  write does.

## 3. Proof — real PGlite, over HTTP

`tests/regulatory/document-lifecycle-pipeline.pglite.test.ts` (11 cases). The
ceremony is injected as a stand-in that checks the password; everything else —
persistence, the gate, the hash chain, the role gates — is the real code.

| | |
|---|---|
| `red/pipeline-before-fix.txt` | The router as at `36aea616`: **7 of 11 fail.** A sign-off with no password is recorded (200). The body's role `qualified-person` is recorded as the signer's. `'forged-ref'` from the request body becomes the approval's `signatureRef` **in the audit chain**. A viewer creates a document (201). A request with no user signs (200). |
| `red/mutant-ceremony-before-gate.txt` | The fixed router with the gate pre-check removed: the illegal-jump case fails (the ceremony ran, 401 instead of 409). This is the case that pins the ordering; it passes on the old code only because the old code checked no credential at all. |
| `green/pipeline-after-fix.txt` | 11 of 11. |

The test file's own history is part of the finding: it previously signed with no
password and its request user had no `id`, so it asserted both defects as the
working behaviour.

## 4. Not done here — owed

- The recorded `ApprovalSignature` does not carry how identity was established
  (`password` / `password+mfa`); the ceremony returns it and the type has no
  field for it. Manifestation (§11.50 printed name) is not on this record either.
- A second-factor case is not exercised here: the stand-in ceremony checks the
  password only. The real `reverifySigner`'s MFA path is pinned by its own tests
  (`server/services/part11/__tests__/reverify-signer.test.ts`) and `tests/db/signing-lockout.dbtest.ts`.

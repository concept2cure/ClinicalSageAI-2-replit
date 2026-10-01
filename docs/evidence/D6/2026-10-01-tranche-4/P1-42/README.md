# P1-42: an e-signature states its meaning; `audit.explain` is limited to audit readers

Security audit 2026-09-24, findings **DP-55** (Medium, 21 CFR 11.50(a)(3)) and **DP-53** (Low, latent; 11.10(d), GDPR 5(1)(f)).
Plan row P1-42. Launch row D6 (with D5 for Part 11). Audited at `9e9a9614` (HEAD when the work started, `red/HEAD.txt`).

## What was wrong

**(a) DP-55.** `POST /api/esignature/sign` (`server/routes/esignature.ts`) treated `signatureMeaning` as optional free
text. It wrote `signatureMeaning ?? null` into the manifest, the audit row and the `electronic_signatures` row. The
column is nullable, and the one writer (`persistElectronicSignature`, `server/services/part11/signature-persistence.ts`)
stored whatever it got. So a signature could be recorded with no meaning, or with one nobody defined
("I approve"). The governed sign path (`/api/c2c/actions/sign`, P1-21) already refused both. This route and the
writer did not.

**(b) DP-53.** The AnA command `audit.explain` (`server/services/ana-ri/command-rbac.ts`) had no `minRole`. The handler
(`mdx-explain-audit-row.ts`) reads one `audit_logs` row, including IP address and user agent, so any member of the
organisation could have AnA read it to them. The registry note understated the gap. `authorizeCommand` returned
`ok` for every read **before** looking at any role, so adding a `minRole` to the entry alone would have done nothing.

## What is true now

**(a)**
- `/api/esignature/sign` refuses a missing, empty or non-string meaning with **400 `SIGNATURE_MEANING_REQUIRED`**. It
  refuses one outside the closed vocabulary (`GOVERNED_SIGN_MEANINGS`, `server/services/part11/signature-meanings.ts`)
  with **400 `SIGNATURE_MEANING_UNKNOWN`**. These are the same function (`signMeaningRefusal`) and the same codes the
  governed path uses.
- The refusal comes after the signing-authority check and **before** re-verification, so no password is checked and
  nothing is read for a request that would be refused anyway. The caller's text is not echoed back.
- The request-shape checks (anchor, purpose, action, meaning) moved into `signRequestRefusal`. Handler complexity went
  from 49 to 42 and length from 209 to 202 lines.
- **The writer fails closed too.** `persistElectronicSignature` now calls `assertRecordedMeaning` before the INSERT, so
  every row needs a vocabulary meaning, whoever the caller is.
  - The one exemption is a **governed revocation** (`signature_type = 'governed-revocation'`). It withdraws a
    signature rather than asserting a meaning, and its manifest records the act. Even so, a meaning it *does* carry
    is held to the vocabulary.
  - Every caller was checked: the document route (now validated), release signing (`'approval'`, `z.literal`), every
    governed `sign` (already asserted in `persistGovernedActionSignature`), QMS approve/retire/change-approve
    (`'APPROVED'`, `z.literal`), and revocation (exempt when null).
- **Zero duplication.** `assertGovernedSignMeaning` re-implemented the REQUIRED/UNKNOWN classification. It now derives
  it from `signMeaningRefusal`, so the routes and the writer cannot disagree. The thrown messages are unchanged.

**(b)**
- `audit.explain` is `{ effect: 'read', object: 'audit_row', minRole: 'manager' }`. In the RBAC hierarchy, `manager`
  admits manager, admin and super_admin. This matches `AUDIT_READER_ROLES`, except for `owner`, which is not an
  organisation role in `organization_users` (see residuals).
- `authorizeCommand` step 3 role-checks a read that carries a tier through `roleDecision`. Tiered writes use the same
  function, so the two paths cannot drift. Untiered reads are unchanged and stay open in the degraded-read mode.
  `authorizeCommand` complexity went from 21 to 20.
- **Id-type mismatch: not fixed, because it is not a one-line change.** `audit_logs.id` is `uuid`, but the handler
  validates a positive integer and binds it to `id = $1`. Postgres rejects that
  (`invalid input syntax for type uuid: "1842"`, `red/audit-explain-id-type.txt`), so the command always ends in
  `EXECUTION_FAILED`. Fixing it touches the validator, the SQL, the row type, the tool metadata and the existing tests.
  The proposed change is under Residuals.

## Red / green

| Check | Red (HEAD source, new tests) | Green (after) |
|---|---|---|
| `esignature-sign.test.ts`, new describe `§11.50(a)(3) signature meaning` (11 cases) | 7 fail: no / empty / null / number / object / free-text / near-miss meaning all got **201** | 11 pass: 400 with the right code, `poolQuery` never called; vocabulary meanings persist verbatim at `$16` |
| `electronic-signature-meaning-required.test.ts` (new, 12 cases) | 6 fail: writer accepted null / '' / absent / "I approve", a revocation with a free-text meaning, and a non-revocation with null | 12 pass: refused before any query; the revocation-with-null row is written |
| `command-rbac.test.ts`, new describe `audit.explain is limited to the audit-reader tier` (9 cases) | 8 fail: viewer and member admitted, RBAC never consulted, identity not required | 9 pass: viewer/member get `RBAC_DENIED`, manager/admin admitted, lookup error or missing identity refused |
| `command-rbac.test.ts` registry invariant (rewritten: only `audit.explain` is a tiered read, at `manager`) | fails: `[]` vs `[['audit.explain','manager']]` | passes |
| **Totals** (`red/vitest-red.txt`: the three files above; `green/vitest-green.txt`: the same three plus `tests/routes/concept2cure.test.ts`) | **22 failed** / 59 passed | **81 passed** in the three files (91 with concept2cure) |
| Regression: 61 files that reach the writer, the route, the RBAC gate or the executor (`green/vitest-regression.txt`) | the first run found 3 failures in 2 fixtures that still sent free-text or missing meanings, fixed below | **753 passed**, 2 skipped |
| Regression: 17 more files that import the route or writers (`green/vitest-regression-2.txt`) | — | **134 passed** |
| ESLint on the 8 changed files (`red/eslint-before.txt`, `green/eslint-after.txt`) | 7 warnings at HEAD | 7 warnings. `signature-persistence.ts` held at 499 counted lines (the first draft reached 505, which added a `max-lines` warning; removed through the de-duplication above) |
| `ci:sign-ceremony:selftest` | — | 13 passed |
| `ci:server-error-leaks` | — | OK; none of these files are listed |

`ci:sign-ceremony` itself exits 1 in this working tree. The cause is baseline over-allowance in
`biosketch.ts`, `committees.ts`, `coverage-analysis.ts` and `dmsp.ts`. Those are another implementer's uncommitted
P0-10 edits, not files this item touched (`green/ci-sign-ceremony.txt`).
`server/routes/__tests__/domain-sign-ceremony.routes.test.ts` is untracked P0-10 work in progress, so it is excluded
from regression run 2. Its failures are "expected 401, got 201": a ceremony not yet built.

## Commands

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run \
  server/routes/__tests__/esignature-sign.test.ts \
  server/services/part11/__tests__/electronic-signature-meaning-required.test.ts \
  server/services/ana-ri/__tests__/command-rbac.test.ts
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run $(grep -rlE "signature-persistence|routes/esignature|esignature'|command-rbac|authorizeCommand|explainAuditRow|part11ComplianceService|persistGoverned|executeCommands" server tests --include=*.test.ts | grep -v '\.dbtest\.')
node scripts/ci/check-sign-ceremony.selftest.mjs
npm run ci:server-error-leaks
npx eslint --no-warn-ignored -f json <changed files>
```

## Residuals

1. **Client: the one UI caller of `/api/esignature/sign` sends free text.** `client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes.tsx`
   (`ApprovalCard`, about line 678) collects the meaning in an `<input>` with the placeholder "e.g. Reviewed and approved".
   The server now refuses anything outside the vocabulary, and `useElectronicSignature` shows the server's sentence,
   so the signer sees why. The card should offer the vocabulary instead: a `<select>` over
   `authorship | review | approval | responsibility | release`, the same lower-case ids as
   `client/src/concept2cure/hooks/useEsignature.ts` `EsigMeaning`, with labels from
   `client/src/concept2cure/_shared/signatureMeaning.ts`. Pre-fill it from `a.meaning` only when that is one of them.
   Not in this item's file list, so not made here.
2. **`audit.explain` id type.** In `mdx-explain-audit-row.ts`, validate `auditRowId` as a uuid string instead of a
   positive integer, query `WHERE id = $1::uuid AND tenant_id = $2`, type `AuditRow.id` as `string`, set the metadata
   `parameters` to `auditRowId (uuid)`, and move `mdx-explain-audit-row.test.ts` to uuid ids. Until then the command
   cannot return a row. Now that it is tiered, the fix is safe to make.
3. **`owner` is not in `ROLE_HIERARCHY`** (`server/services/roleBasedAccess.ts`). An `organization_users.role = 'owner'`
   would fail `hasRole(…, 'manager')` for every manager-tier AnA command, not only this one. The documented organisation
   vocabulary is admin/manager/member/viewer, and `owner` appears only as a platform role, so this is noted, not changed.
4. **`persistElectronicSignature` complexity** is still 23, the same as before this change.

# P1-29 (Part A) — retiring a controlled QMS document is a signed transition (DP-32, Medium)

**Row:** D5 (Part 11 substrate), filed under the D6 tranche. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md`
DP-32. **Plan item:** P1-29 (`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` §2). **This folder is Part A:**
the HTTP door, the legacy door, the client and the OQ step. **Part B — the AnA door — is deferred** (below).

The "reason is optional" half of DP-32 was closed on 2026-09-25 by `6582e3a3` (lane `…01FSu2RL`; test fix `578c5178`):
the reason became mandatory (floor 8) and the route editor-gated. What remained open, and what this closes, is the
signature: retiring an effective procedure ended its use for everyone trained on it on possession of an editor session.

## What was wrong (at HEAD `7fbe51c5`)

- **HTTP door** — `server/routes/mdx-qms.ts:684-716`, `POST /api/mdx/qms/documents/:id/retire`: `requireEditorAccess`,
  `requireGovernedReason`, then an autocommitted `pool.query(UPDATE qms_documents SET status='retired' …)` (:694-704) and
  `recordAuditRow` **after** the write (:710-713). No `resolveSignerOrgRole` / `isSigningAuthorized`, no `reverifySigner`,
  no meaning, no `electronic_signatures` row, no §11.70 digest, no transaction. The approve route in the same file
  (:517-624) had all of that since VSR-001 F-3; the change approval got it on 2026-09-25 (P1-28, `028a0c70`).
- **Legacy third door** (not in the audit register) — `POST /api/qms/documents/:id/transition {to:'retired'}`,
  `server/routes/qms.ts:91-104` → `server/services/qms/qms.service.ts:61-90` `transitionDocument`: `authenticateToken` +
  `orgGuard` only, **no reason at all**, no role gate, fire-and-forget audit. The service refused `to='effective'` (:71-75)
  and admitted `draft|effective|superseded → retired` (:21-27).
- **Client** — `client/src/concept2cure/quality/SopRegister.tsx:555-575`: the Retire chip opened `GovernedConfirmDialog`
  (reason ≥ 8, confirm word) and posted `{reason}`.
- **OQ** — `tests/validation/oq/qms/run.mjs` OQ-QMS-10 posted `{reason}` as the run identity and expected 200; the
  2026-09-23c execution record (`docs/evidence/W3/2026-09-23c/OQ-QMS/`, step 10, `"by":1`) is the record of that door.

## What is true now

- **`retireQmsDocumentSigned`** (`server/services/qms/document-approval-signature.ts`), the sibling of
  `approveQmsDocumentSigned`: the row is read `FOR UPDATE` through the shared `lockDocumentRow` (split out of
  `lockApprovableDocument`, whose approval refusals are unchanged); `INVALID_STATE` when already retired; the admissible
  set is the one the old route had (any non-retired document — narrowing it is a lifecycle decision, not a security fix,
  and is left to the founder); then, on the caller's transaction: the UPDATE (`status='retired'`, `metadata.retired =
  {reason, meaning, contentDigest, bindingBasis, by, at, fromStatus}`), `recordGovernedAction` (command `retire`, target
  `qms-document:<id>`, domain `qms`, surface `api`), and exactly one `electronic_signatures` row through
  `persistGovernedActionSignature` (`signature_type qms-document-retirement`, meaning `APPROVED` from
  `TASK_SIGNATURE_MEANINGS`, binding basis `qms-document-version-content-sha256`). Any throw rolls all three back.
- **The bound digest** is `computeQmsDocumentRetirementDigest`: the approval recipe over the same version content with
  `metadata.retired` excluded as well, because the retirement writes that block and stores the digest inside it (the
  same reason the recipe excludes `metadata.approval`). It therefore recomputes from the stored, retired row. **The
  approval recipe is unchanged:** `revise` admits a retired row back to draft (`mdx-qms.ts`, `status IN
  ('effective','superseded','retired','in_review')`), so a retired → revised → approved row's approval digest must keep
  covering the row as it then is; changing the shared recipe would have broken the recomputation of such approvals.
- **The route** keeps `requireEditorAccess` in front (every write in the file has it; the signing-authority check inside
  the ceremony is the stricter) and is otherwise the approve ceremony: `retireBody = approveBody.omit({effectiveDate})
  .extend({reason: governedReason})` (floor 8, the rule `6582e3a3` set; approve's own floor of 3 predates that rule and
  is not touched here) → 400 `ESIGNATURE_COMPONENT_MISSING` naming the missing fields (shared helper
  `esignatureComponentMissing`, now also used by the two approve routes, same text as before) → `verifyApprovalSigner`
  (403 `QMS_NO_SIGNING_AUTHORITY` before the credential, then `reverifySigner`: 401 / 423 / 400 `MFA_TOKEN_REQUIRED`) →
  `BEGIN` → `retireQmsDocumentSigned` → `COMMIT` → `ok(res, document, {auditTrail: {persisted: true, chained: true},
  signature})`; `QmsApprovalRefusedError` → 404 / 409 `QMS_INVALID_STATE`; anything else → `ROLLBACK` + `serverError`
  (the caught text never reaches the body — asserted). `verifyApprovalSigner` lost an unused `req` parameter and gained
  the act name for its 403 sentence. `requireGovernedReason` is no longer imported by this file.
- **Legacy door:** `transitionDocument` refuses `to === 'retired'` as it refuses `'effective'`, naming the signed route;
  no caller of the function can reach `retired` unsigned. P1-31 (DP-34) later deletes `server/routes/qms.ts`; this is the
  one-line refusal until then, so the two items do not collide.
- **Client:** `qmsApproval.ts` gains the `document-retire` target (one call, one body for the three signed routes);
  `SopRegister.tsx` opens `EsignModal` for Retire (action "Retire controlled document", meanings `['approval']`) and posts
  through `postQmsApproval`. `GovernedConfirmDialog`, `apiRequest`, `serverMessage` and the `retireErr` state left the
  file. The file uses no `react-i18next`, so no locale key was needed. The replacement is reachable at the same chip
  (`SopRegister.tsx`, Retire on an effective row), pinned by `SopRegisterApproval.test.tsx`.
- **OQ-006 v0.7** (`docs/validation/OQ-006-QMS.md`): OQ-QMS-10 is **credentialed** (signer posts the signed body; 200;
  `metadata.retired` stamps; `meta.signature`; two signature rows for SOP B, the new one `qms-document-retirement`;
  §11.70 recomputation from the stored row via `tests/validation/lib/qms-digest.mjs` `computeQmsDocumentRetirementDigest`;
  second retire 409). New **OQ-QMS-10b** (scripted, runs before 10, with or without the credential): `{reason}` alone →
  400 `ESIGNATURE_COMPONENT_MISSING`, document and signature rows unchanged. The runner's signed-act helpers
  (`approveSigned`, the predicates) moved unchanged to `tests/validation/oq/qms/signed-acts.mjs`, which also holds
  `retireSigned`; `run.mjs` had reached the 500-code-line lint limit (483 at HEAD, 488 now).
  **Not yet executed at v0.7** — no server or database here; the next credentialed run files the record.

## Evidence

| File | What it shows |
|---|---|
| `red/mdx-qms-retire-before-fix.txt` | The rewritten route suite against HEAD: **14 of 15 failing**. The headline case, *a reason alone does not retire*, received **200** with `"status":"retired"` and `meta.auditTrail` — the door open. Only *viewer 403* passed (the `6582e3a3` gate). |
| `red/legacy-transition-door-before-fix.txt` | `qms-effective-only-by-signature.test.ts`: *refuses to=retired and changes nothing* → **200**, the SQL-aware fake row moved to `retired`. 1 of 9 failing. |
| `red/sop-register-retire-before-fix.txt` | `SopRegisterApproval.test.tsx`: the Retire chip opened the reason-only dialog, not the signature dialog; 3 of 13 failing. |
| `red/retirement-digest-before-fix.txt` | `document-approval-signature.test.ts`: `computeQmsDocumentRetirementDigest is not a function` (the function did not exist); 2 of 8 failing. |
| `green/mdx-qms-retire-after-fix.txt` | 15 / 15: viewer 403 before any query; reason-only 400 naming `meaning, password`, nothing verified or written; empty body; floor; meaning; no authority 403 before the password; 401 counted; 423; MFA; already retired 409 rolled back; 404; the signed path `BEGIN, SELECT, UPDATE, COMMIT` with one ledger row (command `retire`) and one signature bound to `computeQmsDocumentContentDigest(row)` (no prior stamp on the fixture), the pool never written; draft retirable with `fromStatus: 'draft'`; `password+totp` only when verified; signature write throwing → `ROLLBACK`, 500, no caught text. |
| `green/legacy-transition-door-after-fix.txt` | 9 / 9. |
| `green/client-register-after-fix.txt` | 17 / 17 across `SopRegisterApproval` and `ChangeControlApproval` (the latter shares `qmsApproval.ts`). |
| `green/retirement-digest-after-fix.txt` | 8 / 8. |
| `green/sibling-approval-suites-unchanged.txt` | 21 / 21 across `qms-document-approval-signature` and `qms-change-approval-signature` (they share `verifyApprovalSigner` and the 400 helper). |
| `green/eslint-touched-files.txt` | Warning count per touched file, now versus `HEAD`; none rose; the new file lints clean. |
| `green/ci-sign-ceremony.txt` | `OK — 23 baselined site(s) remain, exactly as baselined` (command `retire` + `persistGovernedActionSignature` in a handler that calls the ceremony; the gate counts literal `sign` writes). |
| `green/ci-validation-traceability.txt` | `every file cited by 6 URS document(s) resolves; every OQ step carries its protocol's kind` — OQ-QMS-10 (credentialed = scripted) and 10b (scripted) reconcile between `run.mjs` and OQ-006 §2. |
| `green/ci-server-error-leaks.txt`, `green/check-security-patterns.txt` | `145 baselined site(s) … no file gained one`; `0 violations`. |

## Re-run

```
NODE_OPTIONS=--max-old-space-size=1536 npx vitest run \
  server/routes/__tests__/mdx-qms-retire.test.ts \
  server/routes/__tests__/qms-effective-only-by-signature.test.ts \
  server/services/qms/__tests__/document-approval-signature.test.ts \
  server/routes/__tests__/qms-document-approval-signature.test.ts \
  server/routes/__tests__/qms-change-approval-signature.test.ts \
  client/src/concept2cure/quality/__tests__/SopRegisterApproval.test.tsx \
  client/src/concept2cure/quality/__tests__/ChangeControlApproval.test.tsx
npm run --silent ci:sign-ceremony && npm run --silent ci:validation-traceability
npm run validation:oq -- qms      # against a server, with OQ_SIGNER_EMAIL / OQ_SIGNER_PASSWORD (/ OQ_SIGNER_TOTP_SECRET)
```

## What is left open

- **Part B — the AnA door (hot until 2026-09-27 03:15 UTC, lane `…01AiwZKG`, which made the identical refusal for
  `qms_change_transition` in `5fef3b3b`).** `registerToolHandler('retire_qms_document')`,
  `server/services/ana/AnaToolExecutor.ts:13668-13712`, still **executes** the retirement from a chat turn: reason ≥ 8,
  `BEGIN` → `UPDATE status='retired'` → `recordGovernedAction(command 'transition', kind 'retire')` → `COMMIT`, no
  ceremony and no signature row; it is outside the P0-12 proposal gate (`governed-tool-gate.ts:95`, direct tools are
  UNGOVERNED by design). **Until Part B lands, retirement without a signature is still reachable from chat.** As the
  scout wrote it, in one commit: (a) replace the handler body with `refuseSignatureInChat('retire_qms_document',
  'Retiring a controlled document', "the Quality register: the document's Retire button asks for your password and
  second factor")`, as :13606-13612 does for `approve_qms_document`; (b) `qms-labeling-analytics-tool-defs.ts:77-89`
  description begins "AnA cannot sign. Retiring a controlled QMS document is the terminal lifecycle state of an effective
  procedure and is an electronic signature (21 CFR 11.50) …", `required: ['document_id']`; (c) drop or convert the two
  retire-writes cases in `server/services/ana/__tests__/qms-change-tools.test.ts:241-262`; and, landing with them although
  their files are cold (they would be red on trunk otherwise): `ana-cannot-sign.test.ts:41-56` adds
  `['retire_qms_document', { document_id: 3, reason: 'Superseded by SOP-901 rev 4.' }]` to `SIGNING_TOOLS` (the red-first
  test), `qms-vault-audit-atomicity.contract.test.ts:293-310` drops the retire block and its header line :11, and
  `npm run manifest:ana` regenerates `docs/ana-capability-manifest.json` (stale since `6582e3a3`: "optional reason",
  `governed: false`).
- **TM-001** is generated from executed records (`npm run validation:traceability` reads
  `docs/evidence/W3/2026-09-23c/*/result.json`); OQ-QMS-10b has not been executed, so regenerating now would not show it.
  Built into the scratchpad for the record: apart from the generated-at line the output differs from the committed
  matrix only in ways unrelated to this item (URS-PROJ-013, added by P1-1, appears as *uncovered*; URS-SRDY-008's
  restated text). TM-001 is regenerated after the next credentialed OQ-006 execution. Not written here (shared file).
- **Validation documents owed before signature** (not this item's files): `docs/validation/URS-006-QMS.md:33`
  URS-QMS-007 restated as a signed transition (proposed text in the structured result); VSR-001 §8 ("retire with
  reason") wording; the historical execution records under `docs/evidence/W3/*/OQ-QMS/` are records and are not edited.
- **Product decisions, not taken here:** narrowing the retirable states to effective / superseded; an author ≠ retirer
  two-person rule (the plan row does not ask for one; a retirement is not an approval of one's own work).
- **`server/routes/qms.ts`** stays mounted until P1-31 deletes it; its `to='retired'` now refuses in the service.
- The `metadata.retired` block is overwritten by `||` if a document is retired, revised and retired again; the first
  retirement's stamp survives only on its signature row and ledger pair. The retirement digest excludes the block, so
  the second retirement still recomputes from the stored row.

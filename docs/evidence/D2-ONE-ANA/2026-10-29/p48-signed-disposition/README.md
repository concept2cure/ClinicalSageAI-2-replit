# P-48: a nonconformance's disposition and a supplier's approval are signed decisions

Row: D2 (launch catalog: QMS), with D5 (Part 11). The plan's inventory
(`docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md` §2.3) lists "NCR disposition and supplier approval not
signed". This change covers the disposition; supplier approval is owed.

21 CFR 820.90(b)(1) requires the disposition of nonconforming product to be documented, with the justification for use
as is and the signature of the person who authorized it.

## What already exists

| Piece | Path | What it did before this change | What it did not do |
|---|---|---|---|
| Disposition route | `PATCH /api/mdx/qms/nonconforming/:id/disposition`, `server/routes/mdx-qms.ts` | Any editor set the disposition with an optional rationale, and an audit row was written beside it. | It was no signature, so it had no password, no meaning and no `electronic_signatures` row. A second PATCH overwrote a disposition already made. |
| Signing ceremony | `signGovernedAct`, `server/routes/governed-signed-act.ts` | The one ceremony for a route's signed act: components, meaning set, signing authority, re-verification, then the domain write, the ledger pair and the signature in one transaction. QMS periodic review signs through it. | — |
| Meanings | `DECISION_ACT_MEANINGS` (approval, responsibility), `server/services/part11/signature-meanings.ts` | The set for a decision on a record. | — |
| Signing dialog | `EsignModal`, `client/src/concept2cure/_shared/components/EsignModal.tsx` | The shared dialog. ChangeControl approval and periodic review use it. | The record registers (`QmsRecords.tsx`) had no way to open it. |
| Client signing call | `postQmsPeriodicReview`, `client/src/concept2cure/quality/qmsApproval.ts` | Sent a signed act and read the signature time, telling refused apart from unconfirmed. | It was specific to periodic review. |

Searches run:
- `nonconforming` with `disposition` in `server/`, `client/src/`, `shared/` and `tests/`;
- `signGovernedAct`, `EsignModal` and `DECISION_ACT_MEANINGS`;
- `UPDATE qms_nonconforming_products` in `server/`. After this change there is one writer.

## What changed

- **Server.** The route keeps its path and method, and is now a signed act. In front of the ceremony it keeps
  `requireEditorAccess` and adds `signedActAttempts`:
  - the meanings are approval or responsibility;
  - the signer's reason is recorded as the disposition's rationale;
  - `pending` is refused as a decision;
  - the update runs only on an open record (no disposition, or `pending`) of the signer's organisation
    (`recordNcDisposition`, `server/services/qms/nonconformance-disposition.ts`);
  - a record already dispositioned answers 409 `NC_ALREADY_DISPOSITIONED`, and one in another organisation answers
    404. Neither signs anything.
  - The ledger pair and the signature replace the old audit row.
- **Client.**
  - A register row action may now `sign` instead of `submit` (`qmsRegisterKit.tsx`). Its form collects the decision,
    and nothing is sent until the signature. The register then opens the shared `EsignModal` (`QmsRecords.tsx`).
  - Disposition is the first such action. The drawer picks the disposition ("Continue to sign"); the dialog takes
    approval or responsibility and the reason.
  - `qmsApproval.ts` gains `sendSignedAct`, the one client call for a ceremony-signed route. Periodic review and
    `signNcDisposition` both use it.
  - `dispositionNonconformance`, the unsigned writer, is deleted.

## Proof

- `server/routes/__tests__/qms-signed-decisions.test.ts` passes 3 of 3, mounting the QMS router with the
  ceremony's dependencies reduced to their verdicts:
  - a signed disposition commits in the order BEGIN, the update (with the reason as the rationale), the `sign` ledger
    entry, the signature, COMMIT, and answers 201 with the signature id;
  - nothing is written without the signature (400), with a wrong password (401), as `pending` (400) or with the
    meaning `review` (400);
  - a second disposition answers 409 and rolls back, signing nothing.
  - **Shown failing first:** against the route as it was, all three fail; the unsigned PATCH answered 200.
- `server/services/qms/__tests__/qms-signed-decisions.pglite.test.ts` passes 2 of 2, against PostgreSQL in
  process with the canonical DDL:
  - the disposition is set once, with the reason as its rationale, and a second is refused with the first kept;
  - `pending` counts as open, and another organisation's record is not found and is left unchanged.
  - **Shown failing first:** without the open-record guard, the first case fails.
- `QmsRecords.test.tsx` passes 13 of 13. Choosing Rework and continuing opens "Sign disposition", offering approval
  and responsibility, with nothing sent yet. Signing sends `PATCH …/nonconforming/4/disposition` with
  `{ disposition, reason, meaning, password }`, and the register says "NC-2026-004: Rework was signed."
  - **Shown failing first:** with only approval offered, the case fails.
- The two route tests that sent the unsigned PATCH now assert it is refused and writes nothing:
  - `qms-legacy-api-retired.test.ts`: a member's unsigned disposition answers 400 `ESIGNATURE_COMPONENT_MISSING`, the
    record stays pending and no audit row is written. A viewer is still refused with 403;
  - `tests/mdx-qms-labeling-search-analytics-routes.test.ts`: 400, with no update issued.
- The Quality client suite, every QMS route test, `server/services/qms` and the labeling and analytics routes pass
  610 of 610 (49 files). `tsc --noEmit` reports no error in the changed files.

## Second change: a supplier's approval standing is signed

21 CFR 820.50 and ISO 13485 §7.4.1 make approving a supplier a quality decision. Before this change:
- the standing was a field any editor could PATCH, with an audit row beside it;
- a create could set it to approved;
- there was no signature.

### What already exists

| Piece | Path | Before this change |
|---|---|---|
| Supplier writes | `POST` and `PATCH /api/mdx/qms/suppliers`, `server/routes/mdx-qms.ts` | Both took `approvalStatus` and `approvalDate`. |
| AnA's `register_supplier` | `server/services/ana/AnaToolExecutor.ts` | Writes `pending` only, so it sets no standing. It is a second unaudited writer of supplier rows; that is owed below. |
| Reminders | `scheduleSupplierTasks`, `server/services/qms/qms-record-tasks.ts` | Recording `approvalDate` completes the re-approval task, and a revoked supplier owes no task. |

### What changed

- **`POST /api/mdx/qms/suppliers/:id/approval`**, a signed act through `signGovernedAct` with approval or
  responsibility. It sets approved, conditional or revoked through `recordSupplierApproval`
  (`server/services/qms/supplier-approval.ts`):
  - approving or conditionally approving dates the approval on the day it is signed;
  - a standing that would not change answers 409, and another organisation's supplier answers 404;
  - after the commit, the supplier's tasks follow: an approval completes the re-approval task, and a revocation
    closes both.
- **The unsigned writes refuse the standing** with 422; they never drop it and write the rest:
  - a PATCH carrying `approvalStatus` or `approvalDate`;
  - a create setting anything but pending.
  - A create records pending.
- **The supplier register** gains an Approval action, which signs, and drops the approval fields from Add supplier
  and Update. `createSupplier` and `updateSupplier` no longer carry them.
- **One route test and one PGlite file now cover the signed QMS decisions:** `qms-signed-decisions.test.ts` and
  `qms-signed-decisions.pglite.test.ts`, renamed from the disposition-only files.

### Proof

- **`qms-signed-decisions.test.ts`** passes 5 of 5. The supplier cases:
  - an approval commits in the order BEGIN, the update, the `sign` ledger entry, the signature, COMMIT;
  - a PATCH carrying the standing beside an audit date answers 422 and writes nothing;
  - a create as approved answers 422;
  - signing pending answers 400;
  - signing the current standing answers 409 and signs nothing.
- **`qms-signed-decisions.pglite.test.ts`** passes 3 of 3:
  - an approval sets the date;
  - an unchanged standing is refused;
  - a revocation is recorded;
  - another organisation's supplier is not found, and its row stays pending.
- **`QmsRecords.test.tsx`** passes. Approval, then Approved, then Continue to sign opens "Sign supplier standing",
  with nothing sent yet. Signing sends `POST …/suppliers/9/approval` with `{ approvalStatus, reason, meaning,
  password }`, and the register says "Acme Biologics is now approved."
- **Updated tests:**
  - `qms-legacy-api-retired.test.ts`: a manager's unsigned revoke answers 422, the supplier stays approved, and no
    audit row is written;
  - `qms-governed-writes-audited.test.ts`: the supplier update case audits an audit-date change, not a standing.
- **Shown failing first:**
  - Without the PATCH's refusal, the standing beside an audit date was dropped and the audit date written: the case
    failed (1 failed, 4 passed). The first version of that case sent the standing alone, which an empty update
    refused anyway; that version passed with the refusal removed, so it was strengthened.
  - With the client posting to the plain supplier route, the screen case fails.
- The Quality client suite, every QMS route test, `server/services/qms` and the labeling and analytics routes pass
  614 of 614 (49 files).

## Owed

- ~~AnA's `register_supplier` writes `qms_suppliers` through the pool with no audit row.~~ Done in the third change
  below.
- Re-approval due after an approval: the register's re-approval date is still set by Update, not by the approval.
- **Correcting a signed disposition.** A correction would be a second signed act that names the first, never an
  overwrite. Not offered.
- A Postgres dbtest of the route (no server here); the domain SQL is proven on PGlite.

## Third change: AnA's QMS record tools write the routes' audited records

- **What existed.** AnA's `register_supplier` and `log_nonconforming_product` (`server/services/ana/AnaToolExecutor.ts`)
  inserted `qms_suppliers` and `qms_nonconforming_products` rows through the pool, with no §11.10(e) row. Beside them,
  `POST /qms/suppliers` and `POST /qms/nonconforming` (`server/routes/mdx-qms-records.ts`) inserted the same rows with
  one. That was two writers of each record, and one of them was unaudited. AnA's governed tools are expected to carry
  `auditTrail` out of the service (`withAuditNote`, `AnaToolExecutor.ts`); these two did not.
- **What changed.**
  - One writer for each record, `recordNewSupplier` and `recordNewNonconformance`
    (`server/services/qms/qms-record-create.ts`), with the routes' own audit actions (`mdx.qms.supplier.qualify`,
    `mdx.qms.nonconforming.create`).
  - Both routes and both tools call them. Each tool returns `auditTrail`, and its message says so when the row did not
    land.
  - Admission stays with each caller, before anything is written: `admitProject` and the quality agreement on the
    routes, the registry's `foreignProgramRefusal` on the tool.
- **Proof.**
  - `server/services/ana/__tests__/qms-record-tools-audited.test.ts` passes 3 of 3: each tool's record carries its
    audit row under the organisation and the user, and a row that did not land is said.
  - **Shown failing first:** against the tools as they were, all three fail.
  - The QMS route tests, the labeling and analytics routes and the 40 AnA test files that name these tools or the
    tool register pass 227 and 521. `tsc --noEmit` reports no error.
- **Owed.** The tools still run on the pool, not a request-pinned, tenant-scoped client, as they did before. Moving
  AnA's writes onto a tenant-scoped client is a platform change for every tool, not this one.


# `ci:sign-ceremony` sees approvals, not only `sign` rows

**Row:** D5 (Part 11 evidence).

## Why

`ci:sign-ceremony` refused a `sign` ledger write without the signature ceremony.
An approval is read as a signed record whatever verb the ledger records it
under. Two approvals in the QMS launch app got past it, because each stamped
approver and approval time under `command: 'transition'`, from an AnA tool and
from HTTP:
- the controlled-document approval, fixed in `e1c224f69`;
- the change-control approval, fixed in `028a0c704`.

## The change

A SQL write that sets `approver_id`, `approved_by`, `approved_by_user_id` or
`approved_at` to a value is now a site (kind `approval-stamp`, one per line).
Clearing one (`= NULL`, a revision) is not a stamp. A stamp needs a
signature-row write in its handler. Re-verification is not demanded there,
because an approval's ceremony is usually the route's, one function boundary
away, which this scanner already documents it cannot follow.

The limits are written into the script:
- a template-built placeholder (`approved_by = $${i}`) is not seen;
- Drizzle `.set({ approvedBy })` is not seen at all;
- a helper that stamps for a caller holding the ceremony is baselined with that
  reason.

## Shown failing

- `red.txt`: the widened gate against the previous baseline fails, exit 1, on
  every stamp without a signature row: 17 sites in 11 files.
- The selftest gains four cases, built from the two QMS defects as they stood
  before their fixes:
  - the AnA tool's one-line stamp fails;
  - the service-built stamp fails;
  - a stamp beside its signature row passes;
  - a cleared approval is not a stamp.
- `green.txt`: 17/17 selftests, and the gate passes at 40 baselined sites
  (23 before, plus 17).

## The 17, each with its reason in `scripts/ci/sign-ceremony-baseline.json`

| Verdict | Files |
|---|---|
| Ceremony one function away (helper for a signed caller) | `authoring.router.ts` (`approveAndFreezeDocument`, under `/docs/:docId/sign`), `qms/document-approval-signature.ts` (`applyApproval`) |
| Not a signature: an operator released a bulk import of drafts | `mdx-imports.ts`, `AnaToolExecutor.ts` (`approve_import`) |
| Not a signature: a pre-drafting plan released for drafting | `ana/authoring-plan-generator.ts`. Noted: the approve route has no role gate and can stamp a null approver. It has no client caller. |
| Unreachable at this head | `decision-record-service.ts`: nothing moves a decision to `approved` |
| Outside the launch catalog (RULE 2), recorded so it cannot grow | `ivdr-binder-routes.ts`, `mdx-labeling.ts`, `cognitive-ecosystem/global-dossier.service.ts`, `grants/grants-service.ts` |
| **A real gap, found by this widening, outside the catalog** | `rbm/rbm-actuator.ts`: the mdx-rbm approve routes re-verify the signer and refuse the author, but write no `electronic_signatures` row. A re-authenticated RBM approval leaves no signature record. |

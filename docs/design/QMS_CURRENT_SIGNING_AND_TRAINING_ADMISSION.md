# Proposed next bounded QMS signing admission

Approved bounded implementation contract, 2026-10-14. Initial inspection was
against merged HEAD 171866a97b58376db6652790dbe39326891e7c39. Root authorized
source and fixture preparation after publication; root separately coordinates
heavy runners and owns publication. Verification requirements below are goals,
not claims that the resulting code or native fixtures have already passed.

## Existing gap and retained behavior

mdx-qms verifyApprovalSigner (line 606) calls canonical checkSigningAuthority
and reverifySigner before opening a transaction. Document approve/retire and
change approve then open pool clients and their direct domain services wait
on FOR UPDATE. Those services write status, governed audit and one signature
without rereading current authority after that wait. They do not call
signGovernedAct and do not inherit its prepare -> current authority ->
flagged strict resource permission order.

Keep the precredential authority/reauth check, exact domain SoD, row/digest
reservation, existing signature type/binding and atomic domain/audit/signature
writes. Do not replace the QMS domain writer with GSA or alter allowed signer
roles, default governance flag, resource grants, historical records or actor
authorship. Retirement remains its current lifecycle/SoD policy; approval
continues to reject the original author and all controlled-text contributors.

## Narrow insertion and executor

Use the request-owned client in HTTP routes via requestConnectable(req), whose
release is deliberately a no-op because the request owns the pinned connection.
The domain services already accept SignatureDbClient; validate on that exact
client after their current target reservation and before applyApproval,
applyRetirement or the change approval UPDATE. Service callers consequently
cannot accidentally bypass the new postwait admission.

Suggested shared QMS admission ABI (no new permission policy or signing writer):

    assertCurrentQmsSigningAuthority(client, {
      organizationId, userId, target
    }): Promise<void>

Its implementation reuses checkSigningAuthority(userId, orgId, client). The
existing executor branch of resolveSignerOrgRole reads active user/current
organization/member and holds FOR SHARE on those rows on this transaction.
No token/body role can substitute. If GOVERNANCE_RBAC_ENFORCE === 'true',
reuse resolveSignerOrgRole(userId, orgId, client) and canonical
can(orgId, role, { action: 'sign', resourceType: target.split(':')[0] },
    { executor: client, strict: true }).

The canonical permission action is sign, as in signGovernedAct; existing QMS
ledger targets define qms-document:<id> and qms-change:<id>. The domain audit
commands remain approve/retire. Do not invent qms_document or another grant
namespace because a table/audit resource uses underscores. Confirm actual
tenant resource grants before claiming default permission outcomes.

Map canonical authority/permission refusals to the current QMS envelopes with
403 for a verified denial and safe 503 for unverifiable admission. Keep internal
SQL/grant errors in logs. Do not collapse an unknown permission read to denial
or grant. A validator exception must occur before the domain UPDATE, governed
action, audit row or signature persistence. The validator may reuse/extract
canonical permission-gate code, but must not copy a role allow-list.

Patch sketch:

    approveQmsDocumentSigned(client, params):
      row = await lockApprovableDocument(client, orgId, userId, documentId)
      await assertCurrentQmsSigningAuthority(client, {..., target: `qms-document:${documentId}`})
      // unchanged contentDigest, applyApproval, ledger and signature

    retireQmsDocumentSigned(client, params):
      row = await lockRetirableDocument(client, orgId, documentId)
      await assertCurrentQmsSigningAuthority(client, {..., target: `qms-document:${documentId}`})
      // unchanged retirement lifecycle, binding and signature

    approveQmsChangeSigned(client, params):
      row = await lockApprovableChange(client, orgId, userId, changeId)
      await assertCurrentQmsSigningAuthority(client, {..., target: `qms-change:${changeId}`})
      // unchanged proposer SoD, digest and signature

The current document/change HTTP wrappers do not have explicit COMMIT-uncertain
classification: they roll back best effort and return safe generic serverError.
Do not claim their existing error means confirmed rollback. Preserve the new
controlled-text/training unconfirmed-commit paths. Any proposed broader signer
uncertainty response must be specified and proven separately, including a
committed row whose COMMIT reply was lost and a reload that observes it.

## Native proof contract (root assigns runner later)

Use an isolated synthetic QA tenant and actual native PostgreSQL app_service
NOSUPERUSER/NOBYPASSRLS, canonical auth HTTP, signing policy, QMS migrations,
ledger and electronic signature persistence. Use no mock role/permissions or
signature writer and do not repair historical data.

For each target family, hold its authoritative row FOR UPDATE on connection A.
Launch actual signed HTTP request B as a current active approver with valid
reauth; wait for its target lock using pg_stat_activity/pg_locks or a bounded
request-owned query observation barrier that does not change query results.
Commit actor demotion/membership removal/account disable on separate admin
connection C while B is waiting, then release A. The new postwait read must
refuse B before target mutation, governed action, audit and signature; query
all four stores through the runtime role to prove unchanged/no extra rows.

Positive control uses the identical wait with authority unchanged, then proves
actual target transition plus exactly one chained act/signature and honest
digest/manifest/factor attribution. A strict resource grant withdrawal case
uses the same lock barrier with GOVERNANCE_RBAC_ENFORCE=true and canonical
permission rows; deny/unavailable reads fail closed. Flag-off preserves the
existing canonical authority policy without the optional resource check.

Keep current contributor/proposer self-approval negatives and genuine
independent approver positives. Prove request-owned SQL is used, explicit tenant
predicates hold, foreign targets disclose nothing, and pooled/failed permission
reads cannot substitute a success. Record the original runtime red before the
fix and a green on the final source; do not broaden a baseline or relabel a
skipped test as passed.

Actual native table-lock tests must have bounded observation/timeouts and
finally cleanup releasing/rolling back every connection; no global table locks.
Fresh membership row locks prevent actor/role changes through signing COMMIT
after the new read. Canonical can() currently does not serialize independent
grant writers through COMMIT; document that practical limit rather than claim
a stronger guarantee from a single postwait read.

## Current-merge regression set (root runs once after compiler)

QMS core 149 registered cases across seven files:
server/services/qms/__tests__/training.pglite.integration.test.ts
server/services/qms/__tests__/training-controlled-text.pglite.integration.test.ts
server/routes/__tests__/qms-personal-training.test.ts
server/routes/__tests__/qms-document-approval-signature.test.ts
server/routes/__tests__/qms-legacy-api-retired.test.ts
server/routes/__tests__/mdx-qms-retire.test.ts
server/services/qms/__tests__/document-approval-signature.test.ts

Canonical signing/AnA adjuncts:
server/services/part11/__tests__/signing-authority-transaction.pglite.integration.test.ts
server/services/part11/__tests__/governed-signature-permissions.pglite.test.ts
server/services/part11/__tests__/one-signing-authority-policy.test.ts
server/routes/__tests__/qms-change-approval-signature.test.ts
server/services/ana/__tests__/qms-training-native-action.test.ts
server/services/ana/__tests__/qms-vault-audit-atomicity.contract.test.ts

Existing separate native baseline:
tests/db/qms-document-signature-required.dbtest.ts (13 cases; does not prove
new personal training/text saves or postwait revocation).

## Separately reported current-release validity gap

New training eligibility checks metadata.approval + current content digest,
not actual live electronic_signatures. Canonical signature withdrawal does not
automatically change an already-effective QMS document. Source tracing shows
its unchanged metadata can remain eligible after approval is revoked. This is
not yet an executed reproduction; root must decide its bounded admission scope
and native post-release revoke -> GET/POST/compliance proof separately. Preserve
historical personal receipts as retained facts; do not delete/rewrite them when
current release authority is withdrawn.

Root accepted this second scope as requiring an actual retained native red
before implementation. Proposed current-release admission ABI:

    readCurrentQmsReleaseApproval(q, {
      organizationId, document, currentContentDigest
    }): Promise<{ state: 'valid'|'withdrawn'|'changed'|'unverified'|'unavailable',
                  signatureId: number|null }>

Read only exact same-tenant qms-document:<id> qms-document-approval signature
records, with their actual version/doc number, APPROVED meaning, command
approve, binding basis qms-document-version-content-sha256, current authoritative
content digest, actual approving actor and persisted signed time/identity.
Use existing isSignatureWithdrawn and manifestSignatureHash recipes from
signature-persistence, and factual persisted manifest/column equality. Do not
promote an arbitrary newest signature, a retirement signature, another tenant
or target, a ledger-only record, a stamp, or a hash-only match into current
release approval. Do not assert the protocol-specific manifest kind/binder
applies unchanged to QMS; inspect the actual QMS writer recipe.

All reading and recomputation use caller q. GET current training context,
compliance current eligibility, and creation of a new personal acknowledgement
must share this current approval admission. The new write must reread admission
after its actual document FOR UPDATE reservation, before receipt/audit writes;
no earlier read/token can grant it. Current release read failure is explicitly
unavailable/held, distinct from proven withdrawn approval. Retained historical
personal receipts continue to describe what the person acknowledged then,
while current completion is withheld when current release authority is absent.

Native proof: create a genuine independent QMS release through canonical auth
HTTP and actual domain signature persistence. Prove its readable training GET,
new acknowledgement and current roster receipt with the actual live signature.
Withdraw that exact approval through the canonical revoke action on its
actual same-tenant target; prove withdrawal fields/signature history and QMS
document history retained. With document status/body unchanged, GET/compliance
must withhold current eligibility and POST new acknowledgement must refuse
without additional receipt/audit writes. Retain the pre-fix native red and
final green. Add controlled failed-verification and mismatched exact identity
cases; no synthetic approval stamps or role allow-list may prove the positive.

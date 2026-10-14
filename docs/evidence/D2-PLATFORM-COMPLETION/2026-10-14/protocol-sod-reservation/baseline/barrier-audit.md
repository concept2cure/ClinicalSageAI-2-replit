# Read-only protocol SoD barrier feasibility audit — 2026-10-14

Repository: `/workspace/ClinicalSageAI-2-replit`, `concept2cure-v2`.
No application source was edited, tests/compiler were run, database records were
changed, or signature/authentication calls were made for this audit.

## Feasible native queue

The current bounded parent reservation protects content/finalization ordering,
but does not reserve the protocol before the ceremony's independence lookup.
The deterministic baseline queue is **holder → same-signer section writer →
approval signer**. Start the writer first, observe its native parent lock wait,
then start the signer. Do not start the signer before the writer and expect a
later writer to overtake it.

1. Create a new isolated, structurally finalizable synthetic clinical protocol
   using the existing canonical create/writer/governed-action helpers, authored
   entirely by a different actor. Use a fresh active membership-backed approver
   who has not authored any content in this protocol. Preserve org18/doc9/sig12,
   and org2/user25.
2. On a separate restricted-role tenant-stamped holder connection, BEGIN and
   lock the isolated parent using `SELECT id FROM protocol_documents WHERE
   id=$1 AND organization_id=$2 FOR UPDATE`.
3. Start the real PATCH `/api/protocol-development/sections/:sectionId` with the
   future approval signer's genuine JWT. Set real changed synthetic prose and
   retain `status: 'complete'`; give the real reason and optional exact current
   `expectedUpdatedAt` token. Observe its parent `FOR UPDATE` lock wait in
   `pg_stat_activity`, with `pg_blocking_pids` containing the holder pid.
4. Start real POST `/api/protocol-development/documents/:documentId/finalize`
   using that SAME principal, `meaning: 'approval'`, real password/required
   current second factor, reason. Observe a distinct signer pid waiting on the
   parent `FOR UPDATE`, ordered behind the writer/holder. At this observation,
   the actual code has completed all three SoD reads on the signing client.
   No artificial callback or mocked SoD/authentication is needed.
5. While both are blocked, the writer has performed only an unlocked scoped
   child→parent identity read, so it has written neither prose nor lineage nor
   update ledger. Thus the signer is genuinely independent when its SoD SQL
   executes. Record canonical `resolveTargetAuthors` showing the approver absent
   before releasing the holder.
6. COMMIT the holder. The writer obtains the parent, checks editable status,
   bumps parent MVCC, locks/rereads the child/token, updates section content,
   enforces real author lineage, updates parent state/timestamp, appends the
   real `update` governed action, and commits. The signer then obtains the
   parent and finalizes the now-changed complete protocol. It does not recheck
   SoD. Its canonical content binder should bind the new prose, making this
   an independence failure despite an internally matching digest.
7. Record actual statuses/outcomes, queue SQL/pids, committed writer action,
   updated section lineage, current canonical authorship (approver now present),
   protocol status/version, major snapshot, sign action/audit and signature
   meaning/binding. The invariant assertion should refuse independent approval
   after the signer authored the protocol. Do not call a current matching
   signature digest a passed independence check.
8. Always release barriers and roll back/release held clients in finally; bound
   waits and settle all request promises. Preserve new records and real history.

## Exact production sequence

- `server/services/protocol-development/protocol-signature.ts:34`,
  `signProtocolAct`: thin wrapper over the canonical `signGovernedAct`.
- `server/services/part11/governed-signature-ceremony.ts:165`,
  `signGovernedAct`: validates meaning; live membership signing authority at
  186; optional RBAC at 190; real verifyReauth at 198; connects at 204; BEGIN and
  tenant context at 206–207; **checkMeaningAgainstAuthorship at 208**;
  **input.write at 209**; governed sign/audit pair and electronic signature;
  COMMIT. `GovernedSignatureInput` currently has no `prepare` hook.
- `server/services/part11/governed-signature-ceremony.ts:132`,
  `checkMeaningAgainstAuthorship`: for approval calls
  `assertSignerIsNotAuthor(..., {command:'sign', meaning, client})` at 151.
- `server/services/protocol-development/protocol-development-service.ts:418`,
  `finalizeProtocolTx`: the first operation is
  `lockProtocolForSignatureTx` / `loadDoc(..., true)` (110/86), whose SQL is
  `SELECT protocol_kind,status,version FROM protocol_documents WHERE id=$1
   AND organization_id=$2 AND deleted_at IS NULL LIMIT 1 FOR UPDATE`.
  Completeness is then read on that same transaction client, followed by the
  real major snapshot and finalized parent update. No further SoD call occurs.
- `server/routes/protocol-development.ts:391`, real section PATCH:
  `governed()` → `updateSectionTx` → `recordGovernedAction` on the same client
  with `command:'update'`, `domain:'protocol_development'`,
  `target:'protocol-section:<sectionId>'`, `userId` from authenticated session.
- `protocol-development-service.ts:249`, `updateSectionTx`: scoped live child
  parent lookup; `reserveProtocolForWriteTx` at 257; scoped child FOR UPDATE;
  current timestamp check; section UPDATE; lineage; parent UPDATE. The reservation
  locks the parent, rechecks editable status, and bumps `updated_at` with
  `clock_timestamp()` before protected DML.

## Exact authorship queries

`server/services/governance/separation-of-duties.ts:217`,
`protocolDocumentAuthors`, executes these three reads on the signing client,
with no row lock and no subsequent reread after reservation:

```sql
SELECT created_by FROM protocol_documents
 WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL LIMIT 1;

SELECT created_by FROM protocol_sections WHERE protocol_document_id=$1 AND organization_id=$2
UNION SELECT created_by FROM protocol_objectives WHERE protocol_document_id=$1 AND organization_id=$2
UNION SELECT created_by FROM protocol_eligibility_criteria WHERE protocol_document_id=$1 AND organization_id=$2
UNION SELECT created_by FROM protocol_schedule_visits WHERE protocol_document_id=$1 AND organization_id=$2
UNION SELECT created_by FROM protocol_soa_assessments WHERE protocol_document_id=$1 AND organization_id=$2
UNION SELECT created_by FROM protocol_soa_cells WHERE protocol_document_id=$1 AND organization_id=$2
UNION SELECT created_by FROM protocol_team_members WHERE protocol_document_id=$1 AND organization_id=$2;

SELECT DISTINCT a.proposed_by FROM c2c_ana_actions a
 WHERE a.org_id=$2 AND a.domain='protocol_development' AND a.command='update'
   AND ((a.target=$3 AND NOT (COALESCE(a.payload,'{}'::jsonb)
         ?| array['commentId','assignmentId','paramsId','itemId','version']))
     OR ((a.target LIKE 'protocol-visit:%' OR a.target LIKE 'protocol-soa-assessment:%')
         AND a.payload->>'documentId'=$4)
     OR a.target IN (SELECT 'protocol-section:'||s.id FROM protocol_sections s
                    WHERE s.protocol_document_id=$1 AND s.organization_id=$2)
     OR a.target IN (SELECT 'protocol-soa-assessment:'||x.id FROM protocol_soa_assessments x
                    WHERE x.protocol_document_id=$1 AND x.organization_id=$2));
```

Parameters: `[docId, orgId, 'protocol-document:'+documentId, documentIdAsString]`
for ledger query, `[docId, orgId]` for the first two. The `AuthorSet` unions and
sorts actual ids. A section edit becomes authorship through the real update
ledger, because `protocol_sections.created_by` remains the original creator.
Protocol version snapshots are deliberately excluded despite the stale comment
above this function mentioning them; approval finalization must not make its
independent signer an author through its own snapshot.

## Current gates and observation limits

- Exercise all application transactions with `APP_DATABASE_URL`, never owner;
  assert actual current runtime `rolsuper=false`, `rolbypassrls=false`, pinned
  `app.rls_enforce=on`, and tenant policies/FORCE RLS on protected stores.
  The existing native helpers in
  `tests/db/protocol-finalization-concurrency.dbtest.ts` already establish these
  invariants. Owner access is for isolated fixture setup/observations only.
- Both actual routes are mounted behind `authMiddleware` and the router-wide
  `requireEditorAccessForWrites`. Actual auth verifies an access JWT, token
  revocation/session/account state, membership, active tenant/lifecycle and
  applicable quota; it resolves the role from persisted membership and opens
  tenant scope. Mint fresh tokens only AFTER fixture membership timestamps,
  retaining the existing whole-second issuance timing control.
- Approver/reviewer/admin are signing roles under the default policy; the live
  persisted role must also satisfy governed writing authority. `approver` is a
  real extending governed-write role. A token role alone proves nothing.
- `checkSigningAuthority` reads the membership again; RBAC is honored if
  `GOVERNANCE_RBAC_ENFORCE=true`. Reauth uses the actual stored password hash,
  active/locked account state and actual MFA service. Production requires an
  authenticator when unenrolled; a native non-production fixture can use the
  existing honest password-only mode. Do not weaken or replace these rules.
- The common `/api/c2c/actions` typed `resolveTarget` ownership resolver is NOT
  called by `recordGovernedAction` or `signGovernedAct`. For these domain routes,
  exact tenant/live ownership is enforced by scoped section identity read,
  `loadDoc`, current editable-state reservation, SoD SQL and content binder.
  No current protocol project/Vault access gate exists in this path; source
  access/qualification is outside this bounded proof, with no claims about it.
- Keep the shared `protocol-sign` limiter unchanged: ten attempts per signer
  per five minutes across finalize and dispositions. One fresh approver for this
  case avoids collision with existing helper attempts; do not disable/reset it.
- The post-sign `deriveGovernedTargetBinding` reads real current content on the
  supplied client. A matching digest proves content binding, not independence.
- Current facet/export read gates require a real coherent REPEATABLE READ or
  SERIALIZABLE transaction when passing an explicit executor; the default read
  opens its own tenant-stamped REPEATABLE READ READ ONLY snapshot. Do not pass a
  bare READ COMMITTED transaction and interpret `unverified` as no signature.
  Controlled export holds changed/no-current binding with 409 and unavailable
  verification with 503. These read guards do not recheck signer independence.
- Review disposition has a distinct unresolved race: current
  `setDispositionTx` locks only the live assignment, checks lifecycle and exact
  assigned signer/meaning, updates it, then reads parent version. The binder
  reads mutable parent/children later. A parent-only holder does not currently
  block a disposition; use its own real assignment barrier and separate proof.
  The future lock-only `prepare(client,meaning)` hook from the design has not
  been implemented. Parent reservation must precede canonical SoD, with review
  assignment identity resolved before parent lock and exact assignment reread
  after parent lock; do not move SoD after finalize writes its snapshot.

Conclusion: feasible current-code native baseline, not an observed reproduction.

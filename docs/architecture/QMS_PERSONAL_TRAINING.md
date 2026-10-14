# Personal read-and-understood acknowledgement in Quality

Workstream D2 / W1, 2026-10-14. Evidence:
`docs/evidence/D2-QMS-TRAINING/2026-10-14/`.

The existing launch-enabled Quality register has a training section, an
acknowledgement endpoint and a canonical training-record table. Its action
currently asks AnA to attest for a team, while tool authorization deliberately
refuses `ack_training`: this is the trainee's own act. This work completes that
existing flow inside Quality. It adds no separate Training app, LMS, model call,
approval engine, dependency or table.

## Contract and ownership

- Root owns this contract, `shared/qms/training.ts`, evidence, integration and
  publication on `concept2cure-v2`.
- Backend scope: `server/routes/mdx-qms.ts`, a focused service under
  `server/services/qms/`, and their tests. Existing document approval and
  retirement semantics remain canonical.
- UI scope: existing `client/src/concept2cure/quality/` register, hooks/models,
  its existing dialog styles, the canonical `RichSectionEditor`, and focused
  component tests. No new navigation
  surface or standalone training experience.

`GET /api/mdx/qms/documents/:id` keeps its existing document data and adds
`meta.training` matching the shared context schema. It provides verified
released section text, exact version/digest, availability and the signed-in
person's current receipt. Unreadable context is an error, never an empty or
completed training state.
`canEditControlledText` is derived from current server-verified membership,
tenant posture and draft/in-review status; unknown availability offers no edit.

`POST /api/mdx/qms/documents/:id/training-ack` remains the sole native training write.
The strict shared input requires `documentVersion`, `contentDigest`,
`understood: true` and `method: 'attestation'`. Actor and tenant come from the
authenticated request, never from that body. Viewer membership may acknowledge
its own reading; this does not grant signing or editing authority. Trainer,
team, quiz and electronic-signature claims are refused.

The response data is the shared acknowledgement shape. A newly created receipt
confirms its chained audit in `meta.auditTrail`; an already-current receipt is
returned with `meta.alreadyAcknowledged: true` without another insertion.

## Finish the existing controlled-text writer

The audit also found that native QMS creation writes a header/skeleton only.
The accepted PATCH `metadata` and `sections` fields never reach its column map,
and its top-level section schema strips `body`. Training alone would therefore
leave the quality owner without a native way to prepare readable procedures.

The existing document dialog reuses `RichSectionEditor` in plain-text mode for
section bodies. It starts from recorded sections, or the existing standard
section skeleton when no sections were recorded. Blank draft text is never
presented as a released procedure or generated on the owner's behalf.

The existing `PATCH /api/mdx/qms/documents/:id` gains a strict `controlledText`
branch matching `qmsControlledTextInputSchema`: expected document version and
current content digest, exact section bodies, and an explicit reason. It may
not mix header/status/approval changes into this body. Current editor authority
is rechecked, and the target document is locked on the request client. Only
draft/in-review content may change; a save returns it to draft for review.
Only the sections are merged into server-owned metadata, preserving unrelated
values and clearing any obsolete approval stamp. The content change and its
chained audit commit together. The response preserves the existing document
shape and includes refreshed `meta.training` and the confirmed audit outcome.
The authenticated text editor joins the protected contributor set without
replacing the original author or dropping earlier contributors. The existing
canonical approval gate refuses a signer who authored or edited that text;
the two-person rule covers later editors too. Clients cannot supply or clear
these authorship identities through the controlled-text request. An unreadable
contributor record refuses approval rather than silently dropping its members.

The GET context exposes the canonical current content digest for draft editing
too. This digest alone confers no released/training standing: `eligible` stays
false until the existing approval workflow makes verified readable text
effective. Closing or navigating away from unsaved text uses the editor's
existing dirty-work contract; an implicit unmount cannot save governed text.

## Release and record integrity

Readability means actual controlled text in `metadata.sections[].body`, as
used by the existing approval tests. Labels, template hints and empty skeletons
are not the released procedure. The reader displays escaped recorded text;
it does not fetch mutable artifact bytes or generate missing instructions.
Incomplete/unknown section bodies and artifact-only records cannot be attested.

Eligibility requires an effective, non-deleted, trainable document whose
effective date is not in the future. Its recomputed
`computeQmsDocumentContentDigest` must match the existing approval digest.
The POST rechecks active membership/account/organization and locks the tenant
document on the request-pinned transaction. The submitted version and digest
must still match; a revision/retirement/changed release refuses the stale act.

The existing `qms_training_records` row and its chained audit commit together.
An audit failure rolls the acknowledgement back. COMMIT uncertainty is reported
as unconfirmed and requires re-reading, never as a confirmed rollback. The
server retains the existing 365-day refresh interval. Row metadata retains
the declaration, content digest and released document snapshot so the exact
acknowledged text survives a later in-place QMS revision. No existing history
is relabelled as verified acknowledgement.

Current coverage counts distinct active current organization members with an
unexpired acknowledgement for the exact document version and content digest.
It excludes departed members, obsolete revisions, expired receipts and legacy
unbound records. Historical rows remain. The UI names this roster coverage;
it does not imply assessed competence, a role-specific training matrix or an
electronic signature.

## Verification

Show the old behavior failing before the repair. Cover explicit personal action,
viewer eligibility, inactive/foreign identities, actor/body spoofing, released
text versus outline, stale version/digest, expiry, duplicate submissions, current
membership coverage and audit rollback. Test executed SQL with canonical QMS
DDL and the native UI against the shared wire contract. Inspect settled light,
dark and mobile layouts using existing design tokens and dialog patterns.

Other verified opportunities are deferred: exact-item TaskTray handoffs,
version-bound Authoring peer-review verdicts, and typed remediation targets for
readiness findings. Existing Authoring/Vault/submission flows are already
connected. The parallel approval-orchestrator store is deliberately outside
the current launch workflow and is not revived here.

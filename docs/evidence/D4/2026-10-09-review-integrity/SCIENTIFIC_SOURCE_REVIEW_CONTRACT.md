# Version-bound scientific source review — implementation contract

Status: CONTRACT ONLY. This document does not introduce an accepting scientific
review path, qualify sources, authorize a seal, or change release status.
Baseline: b11199c26c7719aaab46e49963fdc4e4c453c849, concept2cure-v2 only.

## Existing path to extend, not duplicate

The existing review assignments and decisions are in
`concept2cure_review_assignments` and `concept2cure_review_decisions`. The current
review submission is in `server/routes/c2c/artifacts.ts`. Signed approval and lock
use `refuseSignedArtifactAct` and `commitSignedArtifactAct`, through the status
route or `server/services/ana-ri/ana-signed-artifact-act.ts`. Reuse those records,
existing sign-off, canonical authoring source references, and lineage. Do not
introduce a parallel review registry, signature system, source store or editor.

Existing decisions record `version_reviewed`; that is a version NUMBER, not the
primary key of `concept2cure_artifact_versions`. Likewise, existing
`approved_version_id` / `published_version_id` on the artifact represent version
numbers in the inspected signed-act code. A future source-review snapshot must
name both the immutable version-row PK and the version number without confusing
them. Generic review completion or an ordinary signature does not establish
scientific source qualification.

The accompanying patch repairs assignment-to-decision matching and unavailable
contradiction-check handling in this path. It deliberately does not change the
no-reviewer or all-withdrawn quorum policy. A scientific-review consumer MUST NOT
reuse those empty policies as evidence that scientific review occurred.

## Required server-owned review snapshot

Extend the existing review-decision persistence contract with an explicit,
versioned structured snapshot. Its schema, migration, durable deployment path,
immutability rules and writer must be implemented together. Do not hide positive
qualification in a free-text comment or accept a client-supplied boolean.

| Bound item | Required evidence |
| --- | --- |
| Tenant and project | Authenticated tenant, currently owned project, canonical program anchor when required by the existing target loader. |
| Target | Artifact PK and external identifier, stored version-row PK, version number, exact content digest, section/module identity, and the version the reviewer actually saw. |
| Assignment | Existing assignment ID, reviewer ID, review round and active status; one matching decision, not a completed status alone. |
| Reviewer authority | Attributable authenticated account, current membership and permitted scientific-review scope; use the existing sign-off ceremony. A generic role is not proof of scientific competence. |
| Source set | Canonical source-reference IDs, exact source/data versions or immutable representations, their digests, reviewed scope and dispositions. Resolve these server-side from the target's authoring references/lineage. |
| Scientific determination | Explicit assessment, rationale, exceptions and unresolved issues. Copying fidelity, heading coverage, a checksum or an LLM assertion is not the determination. |
| Applicability | Reviewed submission type, section, therapeutic area/modality, development phase and jurisdiction where material; unknown applicability remains unassessed. |
| Temporal basis | Server recording time, review time and applicable rule/guidance revisions or effective dates, with a defined re-review condition. Do not infer regulatory currency from a successful request. |
| Audit/signature | Existing governed decision/signature references and atomic audit/provenance persistence, tied to the snapshot digest. |

The snapshot is positive only after a human reviewer, authorized for the supported
scope, completes the real review. Existing historical decisions without the
snapshot stay ordinary reviews; never backfill them as scientifically qualified.

## The version the reviewer saw

The request must identify the target/version and source snapshot presented to the
reviewer. The server must compare them with canonical current records before
recording a decision. Reading the newest version at submit time and stamping it
onto a decision about an older screen is prohibited. Changes require a new review,
not silent adoption of the new bytes. Scientific source-review recording and its
assignment completion, signature, provenance and audit must be one atomic act.

## Seal admission and atomic recheck

Before any seal/signature/provenance write, resolve the recorded review by its
server-owned reference and verify integrity, actor/assignment identity, scope,
current target, exact source versions, and current dispositions. Reuse the current
DOCX target loader and lineage/disposition machinery rather than independently
reimplementing eligibility. The consuming seal transaction must recheck under a
common lock/snapshot discipline respected by review, source-disposition and target
writers; an earlier preflight alone is not enough.

Missing, malformed, unauthenticated, negative, incomplete, cross-tenant, stale,
superseded, withdrawn or mismatched evidence refuses before governed writes.
Failure to read or authenticate evidence is unavailable, not an empty collection
and not approval. Contradiction service failure is not clearance. Quorum repair
alone cannot authenticate a scientific review or the full audit chain.

A valid recorded DOCX fidelity result still establishes copying fidelity only.
Keep `SOURCE_QUALIFICATION_UNASSESSED` for that unsupported admission path. The
previous seal-declaration patch continues to reject caller assertions of
`sourceQualification` and `sealEligible` without authenticating a supported review.
Only after a reachable, tested scientific-review writer/consumer pair exists may
the absent-receipt legacy `ok: true` admission be replaced. Do not silently delete
that capability while presenting a partial foundation as its completed replacement.

## Evidence lifecycle and retained data

Deleting an original upload is not automatically the same action as deleting the
data extracted from it. When the user retains extracted data, retain its immutable
representation, provenance and parent-document lineage under the existing retention
policy. A review can remain relevant only to the exact eligible retained evidence
it actually assessed; do not require a new upload merely because the original was
removed, and do not treat a missing original as proof that retained data is adequate.

Deleting the underlying evidence, withdrawing it, superseding its data version, or
changing the target/use context requires explicit invalidation or re-review for
future sealing. Preserve historical decisions and signatures as historical facts;
do not overwrite them to claim a new version was reviewed. A newer file does not
silently rewrite the evidence set of an old review.

## Required qualification before an accepting path ships

Exercise the real review writer, assignment completion, signed-act consumer and
seal transaction on the deployed PostgreSQL schema. Include authorized success;
missing/ordinary-only reviews; wrong reviewer/assignment; duplicate decisions;
wrong tenant/project/artifact; stale target bytes or row identity; changed source
version/disposition; retained-data versus evidence-deletion cases; incomplete
applicability; audit/signature failures; request retry; and concurrent target,
review and source changes between preflight and commit.

Prove no partial writes on refusal and prove the successful seal references the
same reviewed target/source snapshot. The user must be able to reach the review
through the existing workflow. Do not substitute a fabricated fixture receipt for
the real writer. Live source-review evaluation, regulatory currency, complete IND
coverage, model PQ and release-gate success remain separate qualifications.

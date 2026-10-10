# Next IND governance prerequisite: version-bound scientific review

Read-only audit, 2026-10-10 UTC. Implementation inspected at
`017d90a5fe09720f30b96380cdfc4423ac97e70c`, with the relevant governance paths
unchanged from `26b187705e0f6cc38ed4c2ec4ceee8eb149ba596`.
This is open work under IND coverage plan item 1h, not a delivered repair,
executed negative control, scientific qualification or approval verdict.

The existing authenticated review-submit route at
`server/routes/c2c/artifacts.ts:3932–4049` accepts decision/comment, loads the
current artifact, then records that current `artifact.version` as
`versionReviewed`. It does not compare an immutable target version/hash the
reviewer actually examined or persist a reviewed scientific-source snapshot.
Decision insertion, assignment completion and provenance insertion are separate
writes. Existing project/artifact ownership, role, assignment and self-review
checks must be retained and reused.

The next bounded repair should bind this existing writer to actual reviewed
facts before connecting it to scientific source-qualified seal admission:

- Explicit scientific-source-review scope; ordinary approval retains its
  ordinary meaning and does not automatically become scientific evidence.
- Reviewer-observed immutable target identity, version and content hash.
- Exact reviewed source identities, hashes, versions and dispositions loaded
  by the server within the same tenant/project; citation copying alone is not
  proof that a source was examined or scientifically acceptable.
- Applicable product/phase context, evidence cutoff, review verdict and
  unresolved limitations, with the actor and assignment authenticated.
- Atomic target/source comparison, decision, assignment completion and the
  snapshot-bearing existing provenance event. Retain an append-only history.

Required executable red control: a reviewer examines target v1/hash1, then the
head advances to v2/hash2 before submission. An approval must return 409 and
write no decision, assignment completion or provenance for the changed target.
The current writer visibly stamps the freshly loaded head; the actual concurrent
reproduction and its repair remain to be implemented and tested.

Other acceptance refusals: omitted or forged snapshot facts, wrong tenant or
project, missing assignment, changed/withdrawn sources, stale cutoff, negative
verdict and mismatched review scope. An ordinary content review cannot satisfy
an explicit scientific review requirement. Verify matching positives with real
controlled source/target versions and authorized reviewers.

Existing `server/services/ana/draft-project-sources.ts` and
`server/services/clinical-regulatory-evidence/span-lineage.service.ts` already
carry source hashes and disposition/historical citation identities. Reuse those
records and the existing review/provenance paths, rather than creating another
source registry or accepting caller `ok` as scientific proof.

Seal admission is a distinct subsequent step. The current
`server/services/ana/verifiedSealService.ts` rejects supplied qualification claims but retains the
legacy no-claim sealing path. The existing no-claim test is not proof of
scientific qualification. Likewise, ordinary approval quorum can allow no
assignments and explicitly disclaims scientific qualification. Wiring these
paths together without actual version-bound review would not close plan 1h.

The seven pharmacology leaves delivered in this batch remain exact advisory
instructions. They do not close this governance gap. Batch B (ten PK summary
leaves) is the next content scope; governance source qualification must remain
visible alongside catalogue work. No UI, API, database or seal behavior was
changed by this read-only audit.

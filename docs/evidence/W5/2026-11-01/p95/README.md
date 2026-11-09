# P-95: review before a regulated document is approved — design, not yet built (2026-11-02)

**Decision.** The coordinating session relayed the founder's answer to question 5 of `../README.md`.
P-95: review is mandatory before a regulated document is approved. "Regulated" is the document-type
catalog's existing classification; where the catalog does not say, the document counts as regulated
(fail closed).

The work is split two ways:
- **This lane:** the server refusal, in `server/services/artifact-approval-act.ts`, under F1.
- **The coordinating session:** the reach, under D4. That means the existing reviewer-assignment route,
  called from the editor's Review panel.

**Update 2026-11-02.** P-95 is now recorded in `docs/LAUNCH_DEFINITION_OF_DONE.md`. The round repair
landed (`0f7706e637`). The no-reviewer refusal waits for D4's reach.

**Update 2026-11-09.** The coordinating session relayed answers to the three open questions below, under
P-107:
- **Q1** is landed on the artifact door (`../p95-q1/`): the reviewer is neither the approving signer
  nor an author.
- **Q2**, two reviewers for `regulated_dual_review`, is a later slice.
- **Q3:** every fileable door applies P-95 with its own record's review. The authoring-document door is
  the coordinating session's.
- The no-reviewer refusal (changes 1 to 6) stays held until the artifact panel's reach is on origin.

**Not built yet (as first written).** At the time of writing, P-95 is not on `origin/concept2cure-v2`
(`docs/LAUNCH_DEFINITION_OF_DONE.md` ends at P-91; the commit that records it, `1c48581ae`, is
unpushed). This lane builds nothing on a decision it cannot read in the repository. It also should
not land the refusal before the reach; see the sequencing hazard below.

## What already exists (RULE 3)

These findings were read at HEAD `4ea4b534e3` by two read-only agents.

| Path | What it does | What it does not do |
|---|---|---|
| `server/services/artifact-approval-act.ts` `reviewQuorumVerdict` | The one review quorum. One decision per active assignment, bound to the version. It is read by both doors' preflight (`refuseSignedArtifactAct`) and again in the signing transaction (`artifact-signed-act.ts`) | **No assignments counts as a met quorum** (`:109`), as does every reviewer withdrawn (`:118`). This is pinned by `__tests__/fixtures/artifact-review-quorum-cases.json` cases 1 and 2 |
| `server/routes/c2c/artifacts.ts` `POST …/artifacts/:artifactId/reviewers` and `POST …/reviews/submit` | Assigns reviewers and records version-bound decisions; refuses the creator as a reviewer | **No caller in `client/src` and no AnA tool.** Review rounds never advance (no `+1` anywhere), so after a request-changes, a reject or an edit the quorum can never be met again |
| `server/services/concept2cure/authority/documentClassSemantics.ts` | 12 document classes, each with an approval path | No class has a zero-review path. The least is `single_reviewer`. Nothing on an artifact row deterministically names its class |
| `shared/regulatory/global-document-registry.ts`, `document-taxonomy.ts`, template catalogs | Classify registry documents by segment and category | No regulated/not-regulated boolean. No artifact column holds a registry id |
| `shared/regulatory/document-lifecycle.ts` | The canonical regulated-document spine. It already refuses in-review → approved without a review sign-off (`REVIEW_SIGNOFF_REQUIRED`), for every type | Not on the Concept2Cure artifact path |

**What follows.** No catalog says any artifact may be approved without review, and nothing on the
artifact row resolves to a catalog class. Under P-95's fail-closed rule, **every Concept2Cure artifact
counts as regulated today**. The refusal needs no classification lookup.

## The change, when P-95 is on trunk

**1. `reviewQuorumVerdict`.** Zero assignments, or every reviewer withdrawn, becomes
`{ met: false, code: 'REVIEW_REQUIRED', message }`.
- The message names the remedy: assign a reviewer in the document's Review panel; once every reviewer
  has approved this version, it can be approved.
- Both doors and the signing transaction already read this one function, so there is no second copy.

**2. `refuseSignedArtifactAct`.** It passes `code` through. The status route and AnA already forward it.

**3. Order is unchanged.** Lock coverage, then contradictions, then the author (P-18), then review
(P-95). On the status route this all happens before the password; on AnA, after the sign-off.

**4. Lock is not re-checked, and nothing is retroactive.**
- Every approval after P-95 passed it at that version.
- An approval from before P-95 stays approved and can be released. Returning such an artifact to review
  clears its approval (migration `20260923b`), so it is re-approved under P-95.

**5. A companion repair is required for P-95 to be workable.** `POST …/reviewers` must open round
`latest + 1` when the latest round has no pending or in-progress assignment. Without it, any
request-changes or edit after a decision blocks approval permanently, and P-95 makes that universal.

**6. Tests, red first, extending existing files.**
- The fixture's cases 1 and 2 flip to `met: false`.
- New `REVIEW_REQUIRED` cases go on both doors and in the signing transaction.
- The existing approval cases in the ceremony, AnA and lock-coverage suites seed a completed,
  approving review.
- Mutants cover both branches, the code pass-through, the transaction re-read and the round increment.

## Sequencing hazard — for the coordinator and the founder

**Approval is unreachable in the product the moment the refusal lands, unless the reach lands
first.**
- Today the only working UI approval (AnA's signed `update_artifact_status`) works because no reviewer
  is assigned.
- After the refusal, every artifact is refused until the editor's Review panel calls
  `POST …/reviewers` and `POST …/reviews/submit`. Those are the routes the quorum reads; the
  task-management and authoring review routes do not satisfy it.

**Recommended order:**
1. ~~The round repair (this lane, F1).~~ *Landed 2026-11-02, `0f7706e637` (`../review-round/`). It
   also refuses an all-withdrawn latest round under P-95, and refuses a new round over an objection to
   the current version.*
2. D4's reach of the two routes (the coordinating session).
3. The P-95 refusal (this lane, F1).

## Open questions (P-95 does not settle them)

1. *(Answered 2026-11-09, landed in `../p95-q1/`.)* **What counts as a review?** Must the reviewer differ from the approver (the signer) and from every
   author, version writers included, as P-18 reads authors? Today the assignment and submit routes
   refuse only the creator, and nothing compares the reviewer with the signer. An approver could assign
   themselves, review and then approve.
2. **How many reviewers for `regulated_dual_review` classes?** Does such a class need two completed
   reviewers? The quorum today counts whatever was assigned.
3. **Should the authoring-document and Vault approval doors also apply P-95?** They are other files,
   and this refusal does not reach them.

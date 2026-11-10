# The review round advances, without setting an objection aside (F1, P-95, 2026-11-02)

**Defect.** `POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/reviewers` always assigned
into the latest review round. The tables allow one assignment per reviewer per round
(`c2c_review_assign_unique`). The quorum (`reviewQuorumVerdict`) reads only the latest round, and its
refusals say "Route this document for review again".

That was impossible. Once a reviewer asked for changes or rejected, or the document was edited after a
decision, the artifact could never be approved:
- re-assigning that reviewer answered `already_assigned`;
- another reviewer added to the round left the old decision in it;
- a completed assignment cannot be withdrawn;
- a second decision is refused.

This was shown red through the real routes.

It is the first step of the order in `../p95/README.md`: the round repair, then D4's reach of the
review routes, then P-95's refusal for an artifact with no reviewer.

## What already exists (RULE 3)

| Path | What it is |
|---|---|
| `server/routes/c2c/artifacts.ts` | `POST/GET/DELETE …/reviewers`, `…/reviewers/:id/remind`, `POST …/reviews/submit`, `GET …/reviews/status` |
| `server/services/artifact-approval-act.ts` `reviewQuorumVerdict` | The one quorum, read by both approval doors and inside the signing transaction. Fixture: `server/services/__tests__/fixtures/artifact-review-quorum-cases.json` |
| `db/migrations/20260314_phase12_multi_user_review.sql`, `shared/schema.ts` | The review tables |

Searched for any code that computes a round (`reviewRound` / `review_round`) and for history
(`git log --all -S 'reviewRound + 1'` and similar). Only readers were found; nothing computed a next
round.

## The change

1. **Choosing the round** (`reviewRoundForNewAssignment`):
   - If no assignment exists yet, the assignment opens round 1.
   - If the latest round is open (an assignment in it is neither completed nor withdrawn), it joins
     that round.
   - If the latest round is closed, it opens the next one. The answer and the provenance event then
     carry `previousRound`.
2. **Under the artifact's row lock** (`insertReviewAssignments`, `SELECT … FOR UPDATE`). Two concurrent
   assignments could otherwise choose different rounds and split one, leaving a reviewer in a round the
   quorum no longer reads. A real-PostgreSQL test proves the lock.
3. **No new round over an objection to the current version** (`objectionToCurrentVersion`, answered
   409). Found by the adversarial review: once rounds advance, a co-reviewer could assign themselves
   into a new round and approve over a request for changes, with the document unchanged. The author
   edits first.
4. **A latest round whose every reviewer was withdrawn is no review** (`reviewQuorumVerdict`, P-95).
   Also found by the review: otherwise, assigning a reviewer and then withdrawing them would approve
   over an earlier request for changes with no approval on record.
   - No assignment at all still meets the quorum until the editor's Review panel reaches the reviewer
     route (the P-95 sequencing hazard).

**Still open.**
- *For the founder:* is a reviewer who asked for changes carried into the next round? Today a new round
  holds only the reviewers assigned to it, and after an edit a different reviewer's approval alone meets
  the quorum. The request for changes stays in the record.
- *Known, not repaired:* the handler checks `status = 'review'` before taking the lock and does not
  re-read it. An assignment can land on an artifact approved in between. This is older than this change,
  and a single-connection test cannot reproduce the race, so no untested guard was added.

## Runs

| Run | File | Result |
|---|---|---|
| The tests against HEAD's two source files | `red-first-at-head.txt` | 12 red: every closed-round case, the objection and all-withdrawn cases, and the fixture |
| Mutant: no objection rule | `mutant-no-objection-rule.txt` | 2 red: the unchanged-document case and the self-assignment case |
| Mutant: an all-withdrawn round met again | `mutant-all-withdrawn-met.txt` | 2 red: the route case and the fixture |
| Green, PGlite: the ceremony suite and the quorum integrity suite | (in the commit) | 123/123 |
| Real PostgreSQL 16, as a role row-level security applies to | `realpg-green.txt` | 4/4: routing again after an edit, and both lock races |
| Implementer round's mutants: the lock, the ordering, the round choice | `implementer-round/` | each killed. One equivalent mutant survives, as explained there |
| Downstream: 110 suites importing the router or the review tables | `downstream-110-suites.txt` (`downstream-suites.txt`) | 2,603 pass, 11 fail. The 11 fail identically at HEAD `cecf28fb3b` (`pre-existing-at-head-cecf28fb3b.txt`) |
| Lint | — | 25 warnings on the changed files, before and after; 0 errors |
| Scoped tsc on `artifacts.ts` | — | 0 errors |

**Review.**
- First round: two adversarial lenses found the patch unsound. Their findings were the all-withdrawn
  bypass, the round order untested past round 2, a race, and a false claim in the commit body.
- Repair round: fixed the race, the order and the body. A re-check then found it still unsound on the
  bypass and on self-assignment.
- Both are closed in this commit. Each is shown red as a mutant.

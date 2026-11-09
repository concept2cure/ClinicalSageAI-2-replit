# P-95 Q1: a review counts only when the reviewer is neither the signer nor an author (F1, 2026-11-09)

**Decision.** On 2026-11-09 the coordinating session relayed this answer to open question 1 of
`../p95/README.md`, under P-107:

> The reviewer is neither the approving signer nor an author, read as P-18 reads authors. An approver
> who signed as a reviewer on the same route or round cannot approve that version. This applies on
> both doors.

This change applies that answer on the Concept2Cure artifact door.

**Why now.** It refuses nothing on an artifact with no reviewer, so it lands before the artifact panel
reaches the review routes. The no-reviewer refusal (changes 1 to 6 in `../p95/README.md`) stays held
until that reach is on origin.

**Package.** F1 (Repairs). The hold is registered in `.design/claude-convergence/COORDINATION.md`
(`3c0d02039b`) and released after this push.

## What already exists (RULE 3)

| Path | What it does | What it did not do |
|---|---|---|
| `server/services/artifact-approval-act.ts` `reviewQuorumVerdict` | The one quorum: one decision per active assignment in the latest round, bound to the version. Both doors' preflight (`refuseSignedArtifactAct`) reads it, and the signing transaction reads it again | Did not compare reviewers with the signer or with the authors. An approver could assign themselves, review, then approve. An author's decision counted |
| `server/services/governance/separation-of-duties.ts` `resolveTargetAuthors`, `artifact:` target | P-18's authors of an artifact: its creator and every version's writer, scoped to the organisation (`7b7b043fda`) | Was read only for the signer, never for the reviewers |
| `server/routes/c2c/artifacts.ts` `POST …/reviewers`, `POST …/reviews/submit` | Assign and decide; both refuse the creator as a reviewer | Did not refuse a user who wrote a later version |
| `server/services/artifact-signed-act.ts` `commitSignedArtifactAct` | Re-reads the quorum under the artifact's row lock | Read it without the signer |

**Searched for:** any existing reviewer-versus-signer comparison (`reviewer_id` against `signerId`,
`userId` or `signed_by`), in `server/services`, `server/routes/c2c` and `shared/`; and
`git log --all -S 'reviewed this version'`. Nothing was found. `separation-of-duties.ts` has the authors
reader, which is reused here, and no reviewer rule.

## The change

All three parts extend existing files. No file, route, table, mount or tool is added.

1. **The quorum** (`reviewQuorumVerdict`). It takes the signer's id as an optional fifth argument. Once
   the round would otherwise be met, `reviewIndependenceVerdict` refuses:
   - **the signer recorded a decision on this version, in any round:** "Cannot approve: you reviewed this
     version in review round N, and an approval is signed by someone who did not review it. Ask another
     approver to sign." A closed round followed by a colleague's new round does not clear it. This was
     found in this lane's own adversarial pass over the first draft, which read only the latest round;
   - **an author reviewed the latest round,** read through `resolveTargetAuthors` (creator and version
     writers). This includes a decision recorded before its reviewer wrote a version.
   - Every earlier refusal keeps its words, because this check comes last.
2. **Both callers pass the signer.**
   - The preflight, `refuseSignedArtifactAct`, used by both the status route and AnA's
     `update_artifact_status`.
   - The signing transaction, `commitSignedArtifactAct`, under the row lock. A reviewer assignment made
     during re-authentication is caught here.
3. **The routes refuse earlier, in plain words.**
   - `POST …/reviewers` refuses to assign an author (400).
   - `POST …/reviews/submit` refuses a decision from a version writer (403), next to the existing creator
     refusal.
   - The quorum would refuse both anyway. The routes say so before any work is wasted.

**Not changed.**
- An artifact with no reviewer still meets the quorum, per the sequencing hazard in `../p95/README.md`.
- Q2 (`regulated_dual_review` needs two completed reviewers) is a later slice.
- The authoring-document door (RR5) is the coordinating session's.

## Runs

| Run | File | Result |
|---|---|---|
| Red first: this change's tests against HEAD `3c0d02039b`'s three sources | `red-first.txt` | 8 red. Integrity suite: the fixture's author case and the signer case. AnA: the signer's approval was signed. Ceremony suite: the signer's own approval; their review in a closed round; the reviewer assigned during re-authentication; the version writer assigned or deciding; an author's decision in the quorum |
| Mutant: the signer check reads only the latest round (the first draft) | `mutant-signer-latest-round-only.txt` | 1 red: the closed-round case |
| Mutant: the preflight passes no signer | `mutant-preflight-no-signer.txt` | 3 red, on the status route and in the integrity suite: the refusal is gone before the password. On AnA, the transaction still refuses, so its case stays green: the second check works as designed |
| Mutant: the signing transaction passes no signer | `mutant-transaction-no-signer.txt` | 1 red: the reviewer assigned during re-authentication |
| Mutant: the quorum skips the author check | `mutant-quorum-no-author-check.txt` | 2 red |
| Mutant: the reviewers route skips the author check | `mutant-assign-no-author-check.txt` | 1 red |
| Mutant: the submit route skips the version-writer check | `mutant-submit-no-author-check.txt` | 1 red |
| Green: ceremony, quorum integrity and AnA signed-act suites | (in the commit) | 167/167 |
| Downstream: every suite importing the changed modules | `downstream-27-suites.txt` | 27 files, 567/567 |
| Lint | `eslint-changed-files.txt` | 0 errors; 25 warnings before and after |
| Scoped tsc on the six changed TypeScript files | — | 0 errors in them. 7 TS7016 errors in unrelated imports, because the scoped config leaves out the ambient declarations. The pre-push typecheck is the full check |

Every run in this table is on the final code.

**Tests changed on purpose.**
- In `ana-signed-artifact-act.pglite.integration.test.ts`, the quorum cases seeded the signer as the
  reviewer. Q1 forbids that, so the reviewer is now a third user (`REVIEWER = 779`).
- In the same file, one case was added: the signer reviewed this version, so AnA refuses, as the status
  route does.

## Still open

- **Q2:** `regulated_dual_review` classes need two completed reviewers. This is a later slice, after the
  no-reviewer refusal.
- **For the founder (from `../review-round/`):** is a reviewer who asked for changes carried into the
  next round?
- **Known, not repaired:** `POST …/reviewers` checks `status = 'review'` before taking the row lock.

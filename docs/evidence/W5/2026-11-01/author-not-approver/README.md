# An author cannot approve or release their own artifact (P-18); the stale role table goes (F1, 2026-11-01)

Found while re-checking the 2026-09-22 record's "Approval role tables" item (`../README.md`). Both
halves of that item were already fixed:
- `7038fec50a` removed the unsigned approve and lock doors;
- `c91dba5264` made the quorum assignment-bound.

The re-check found two things the fixes left.

1. **An author could approve their own Concept2Cure artifact.** Decision P-18 says "An author still
   cannot approve their own document." A user with the approver or admin role could:
   - draft a Module 2 artifact through AnA;
   - route it to review, where no screen assigns a reviewer;
   - approve and then release it with their own password, through either door: the status route or
     AnA's `update_artifact_status`.

   Under DP-35 that approval makes the copy filable. Nothing compared the signer with the author.
2. **A second approval role table.** `AUTHORITY_BOUNDARY_MAP` in `shared/types/decision-architecture.ts`
   still held role lists for the removed approve and lock routes. They gated nothing, but differed
   from the governed table for five role/act pairs. `isActorAuthorized` also let every role through
   for an action the map does not list; a viewer got `authorized: true`.

## What already exists (RULE 3)

| Path | What it does |
|---|---|
| `server/services/governance/separation-of-duties.ts` | The canonical author ≠ signer check (`assertSignerIsNotAuthor`, `separationOfDutiesRefusal`, `requiresIndependence`, the authorship registry). It did not model Concept2Cure artifacts. |
| `server/services/artifact-approval-act.ts` | The one transition role table and `refuseSignedArtifactAct`, the preflight both doors call |
| `server/services/artifact-signed-act.ts` | Commits approve and lock as one signature transaction, re-reading the quorum under the row lock |
| `shared/types/decision-architecture.ts` | `AUTHORITY_BOUNDARY_MAP` and `isActorAuthorized` |

Both repairs extend these files. They add no file, route, table or surface.

## The repairs

**Commit 1 (`Completes: server/services/artifact-approval-act.ts`).**
- The authorship registry gains the `artifact:` target. Its authors are the creator and every version's
  writer, both scoped to the organisation.
- `refuseSignedArtifactAct` asks the canonical check, with `lock` and `sign`/meaning as the other
  governed doors do. The signing transaction asks again under the row lock.
- On the status route the author is refused before the password is verified.
- On AnA the refusal comes after the sign-off, as that door's role, lock-coverage and quorum refusals
  already do. The executor asks for the signature first by design.
- An artifact that records no author is refused 409, under the canonical rule.

**Commit 2 (`Completes: shared/types/decision-architecture.ts`).**
- The two stale entries hold no role list.
- `isActorAuthorized` refuses an authority that carries a `blockedReason`, and refuses an action the
  map does not list, for every role.

## Review

The repairs were implemented in a plain `git archive` copy of HEAD. Two adversarial lenses reviewed
them:
- **Correctness:** sound.
- **Proof:** found the commit body's claims about when the password is asked, and its red count,
  wrong. A repair round reworded them, and a re-check found the repair sound.

**Non-blocking items noted by the re-check:**
- No test pins that an unrecorded version is attributed to the creator, never the signer
  (`artifact-signed-act.ts`).
- Two test titles read "a approver"; they are fixed here.

## Runs

| Run | File | Result |
|---|---|---|
| Commit 1, red first: the tests against HEAD's sources, in the main tree | `red-first-commit1.txt` | 19 red (6 review-integrity, 7 AnA, 5 ceremony, 1 separation-of-duties) |
| Commit 1, green | `green-commit1.txt` | 192/192 |
| Every suite importing commit 1's modules | `downstream-commit1.txt` (`downstream-suites.txt`) | 51 files: 1,084 pass and 6 fail. The 6 fail identically at HEAD `922278f865` (`pre-existing-at-head-922278f865.txt`): launch-scope gate, protocol signatures, dispatch-verdict parity |
| Mutants of commit 1 | `implementer-round/repair-mutant-*.txt`, `repair-mutants-summary.txt` | each killed. One equivalent mutant (`lock` vs `sign` for a lock) survives, as explained there |
| Commit 2, red first | `implementer-round/repair-red-first-c2.txt` and `red-first-commit2.txt` (main tree) | 14 red |
| Commit 2, green | `green-commit2.txt` | see the file |

**Who is affected.**
- **CI.** CI's browser journeys never self-approve: the golden journey's reviewer is a second user.
- **Demos.** An admin approving or releasing an artifact recorded as their own is now refused, and a
  second user must sign. The demo seeds that insert approved artifacts directly are not refused,
  because the signed act is not on their path. They are listed in commit 1's body for the DATA
  package.
- **Playwright specs.** Four specs that create and approve with one user were already refused (401,
  no re-authentication) and are now refused 403 first. CI does not run them.

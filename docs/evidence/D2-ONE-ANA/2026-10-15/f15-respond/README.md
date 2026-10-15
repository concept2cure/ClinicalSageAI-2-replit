# F15: Respond answers the agency

Launch row **D2**. `docs/design/FILING_SPINE.md` F15. The proposed workflow decision put F15 after D10. The founder said on 2026-10-15 to proceed ("get past it, go").

**What was wrong.** Respond had one card, "Response authoring". It opened the editor with no letter (FILING_SPINE §6 row 17). Nothing on the page started a response sequence, and Submission Center read no `followUp`. F0's reachability gate held this as its last red hop.

## What changed

The Respond tab (`client/src/concept2cure/v2/surfaces/ProjectRespond.tsx`) has the three steps of an answer.

1. **Add the agency's letter.** The data room's own upload (`useChatUpload`), so the letter is a project source like any other.
2. **Draft the response with AnA.** The person chooses the letter from the data room's sources whose text can ground a draft. A scanned file nothing could read is not offered, and with none readable the button is disabled and says why. The letter is pinned (`window.C2C_SOURCE_PINS`, the data room's handoff), and the request asks AnA to quote each question and to use no question number or due date the letter does not state.
3. **Start a response sequence.** Submission Center opens on the chosen market's Sequences tab with `followUp: 'response'`, and the next sequence's type starts as `response` (`SubmissionCenter.tsx`, which takes only a follow-up type the server accepts). With no submission yet, it says so and offers nothing.

The coming-later line names question-by-question tracking, agency meetings and precedent responses. P-32 opens `haq-manager` as a Submission Center feature, but that has not landed in `launch-scope.ts` yet, so it is not offered here.

## Deletion check (CLAUDE.md working agreement)

- **Removed.** ProjectHome's `StagePanel`, whose only remaining caller was Respond, and `PJ_STAGE_TOOLS`, whose only entry was "Response authoring", along with its fixture-allowlist line.
- **Replaced by.** `ProjectRespond.tsx`. Drafting reaches the editor through AnA's canvas with the letter pinned. Reachability is held by `projectRespondStage.test.tsx` and by F0's gate (`tests/ui/filing-path-reachability.test.ts`).
- **History search.** `git log --all --diff-filter=D -- 'client/**/*Respond*'` finds nothing earlier.

**Moved unchanged, to avoid a circular import.** The data room's read helpers moved to `projectSources.ts`, and the coming-later line to `ProjectComingLater.tsx`. The Data room and Respond share them.

## Red, then green

- `red/respond-red.txt`: the F15 suite cannot load, because nothing renders Respond's steps. F0's gate passes only because the hop is in its baseline.
- `red/followup-type-red.txt`: with Submission Center's old default restored, the next sequence is typed `amendment`, not `response`.
- `green/vitest.txt`: Project home, Respond, Submission Center, filing path, Projects and `tests/ui`, all passing.
- F0's gate failed until the hop was removed from `tests/ui/filing-path-reachability.baseline.json`. Its list of red hops is now empty.
- Typecheck: 0 errors. 12 copy, design and scope gates are green. No lint count changed.

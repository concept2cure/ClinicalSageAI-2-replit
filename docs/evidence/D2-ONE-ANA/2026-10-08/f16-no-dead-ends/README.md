# F16: no dead ends on the filing path

Launch row **D2**. Slice F16 of `docs/design/FILING_SPINE.md` §7.2. Claimed on the board by `…session_011DpxUyQmE1enma4gTjcfBy`.

## What was wrong

Five exits on the path from a project to a dispatched sequence led nowhere. Each one either sent the person to a screen locked in this release, or showed them nothing to do. With launch scope enforced, `device-510k`, `etmf` and `ectd-coauthor` are all outside the scope:

1. **Submission Center, device filings.** Every row offered "Open 510(k) surface", which opens `device-510k`.
2. **Vault, with a project open.** "Inspection readiness" opened `etmf`.
3. **Vault, with no project open.** It said "Open a project to see its vault" and gave nothing to click.
4. **Submission Center, Builder.**
   - With no Co-Author documents, it said "author one in the eCTD Co-Author first". The Co-Author is locked, and scrapped (FILING_SPINE.md §5).
   - The Builder did not say where documents actually come from: the editor's Place into filing, or the Vault's Place into submission.
5. **The launch-scope panel a deep link lands on** (`LaunchScopeGate.tsx`). A sentence, and no way back.

## What changed

- **`surfaceAvailable.ts` (new).** It holds `useSurfaceAvailable`, moved unchanged out of `ProjectHome.tsx` so that every screen asks the same question before it offers a door: flag on, and not launch-scope locked. It has its own module rather than living in `navEntitlements.tsx`, because a call inside one module never goes through that module's test mock. `ProjectHome.tsx` now imports it, and its local copy is deleted.
- **`SubmissionCenter.tsx`.** "Open 510(k) surface" renders only where `device-510k` is available. The Builder receives `onNav`.
- **`Vault.tsx`.**
  - "Inspection readiness" renders only where `etmf` is available.
  - The no-project empty state has one action, "Open Projects", which navigates to `projects`.
- **`SubmissionSeqWorkspaces.tsx`.**
  - A new `BuilderSources` note under the leaf form says documents reach the sequence from an authored document's Place into filing, or a file's Place into submission in the Vault. It also says copying a leaf from another market's sequence comes later.
  - It has two doors, "Open documents" and "Open the Vault", each gated on availability.
  - The empty Co-Author list no longer sends the person to the Co-Author.
  - The existing Co-Author placement is kept, because it places real persisted rows for organisations that have them.
- **`LaunchScopeGate.tsx`** takes `onNav` and shows one button, "Back to Projects". `V2App.tsx` passes the shell's `nav`.

## Runs

| File | Result |
|---|---|
| `red/vitest.txt` | `__tests__/filingPathNoDeadEnds.test.tsx` at `f10e35a1`, before the change, with launch-scope verdicts as production has them: **5 failed, 1 passed**. The pass is the precondition check that the three surfaces are out of scope and the three doors are in scope. |
| `green/vitest.txt` | **6 passed**. |

- Every test under `client/src/concept2cure/v2`, plus `tests/ui` (the F0 gate) and `shared/navigation`: **5168 passed, 488 files**.
- `tsc --noEmit -p tsconfig.json`: **0 errors**.
- `ci:launch-scope`, `ci:canvas-path`, `ci:surface-discoverability` and `ci:design-system`: all green.

## Not done here

- The device market row saying what the platform cannot carry is F19's.
- Copying a leaf across markets is named as coming later, not built.

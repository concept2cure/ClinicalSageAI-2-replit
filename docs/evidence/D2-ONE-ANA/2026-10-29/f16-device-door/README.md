# F16: the device filing door follows the launch scope the founder set (D2, 2026-10-29)

Lane: `…session_01T2wooCZu46W7msw4TJuuzr`. Spec: `docs/design/FILING_SPINE.md` F16, "No dead ends on the filing path". The gate (`client/src/concept2cure/v2/__tests__/filingPathNoDeadEnds.test.tsx`) has been red on trunk since `62a8d5e7` (2026-10-23), with 4 of 7 failing.

## What already exists

- **The founder's request of 2026-10-23** (`62a8d5e7`, `shared/constants/launch-scope.ts`, the Projects app): "MDX disciplines and pathways are features of the client's project, not separate applications." `device-510k` and 24 other device surfaces moved into the launch scope, under Projects. Each one keeps its commercial verdict.
- **The door rule** (`client/src/concept2cure/v2/surfaceAvailable.ts`): a launch screen offers a door into another surface only where `useSurfaceAvailable()` says it can be opened, meaning the feature flag allows it and it is not launch-scope locked. F16 put it on two places:
  - Submission Center's device filing rows, which offer "Open 510(k) surface" (`SubmissionCenter.tsx`, `available('device-510k') && …`);
  - the empty state, which names "the 510(k) surface's filing panel" only when that surface can be opened, and otherwise says it "is not part of this release".
- **The product was already right.** With `device-510k` in scope, the row offers the door and the empty state names the panel. Only the gate was stale: it still asserted `isLaunchSurface('device-510k') === false`, expected the door to be absent, and used `device-510k` as its example of a locked surface for `LaunchScopeGate`.
- Nothing was built. No product file changes.

## What changed

The gate now follows the founder's scope, and it keeps the rule it exists for.

- **The scope pin.** `etmf` and `ectd-coauthor` are still outside the scope. `device-510k` is inside, beside `projects`, `vault` and `document-authoring`.
- **The door.** A device filing row offers "Open 510(k) surface", once per row, and it opens `device-510k`.
- **The rule.** `lockedHere`, a per-case addition to the launch-scope verdicts, shows the door follows the verdict rather than a hard-coded id. With `device-510k` locked, the row offers nothing and the empty state says the surface is not in this release.
- **The empty state.** When the surface can be opened, it names the 510(k) filing panel.
- **The launch-scope panel.** It is shown on `etmf`, a surface that is still locked, and it still has one way back: Projects.
- `docs/design/FILING_SPINE.md`: the device-surfaces row of the surface table now says what the scope is.

## Red, then green

| | File | Result |
|---|---|---|
| Red at `96ce3798` | `red.txt` | 4 failed, 3 passed: the scope pin, the door "absent", the empty state "locked", and the gate panel rendering its children (`device-510k` is no longer locked) |
| Green | `green.txt` | 9/9 |
| Mutations | `mutations.txt` | 6/6 red: the guard dropped, the door never offered, the door opening Projects, the empty state fixed either way, and the panel losing its way back |

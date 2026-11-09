# A retired sender's handoff no longer clears the current editor target (F1, 2026-11-09)

**The finding.** While verifying the D4 ribbon fix, the editor suites showed one failure that is the same at HEAD:
`editor/__tests__/sourceAssemblyOwnership.test.tsx`, "does not replace an unrelated valid target when its sender is
already retired".

**What already exists (RULE 3).** `client/src/concept2cure/v2/editorTarget.ts`, `setEditorTarget`:
- A handoff that carries source context (assembly sources or a document start) is published only while its sender is
  current (`sourceContextAvailable`).
- The test pins the contract from `4d8cf50d0a` (2026-10-26): a sender that is already retired may not replace, or
  clear, the target another, current sender set.
- `3d9879dfc7` (2026-11-06) changed that branch from `return` to `clearEditorTarget(); return;`. That broke the
  contract, and the case stayed red.
- The same commit's other two clears are kept. A filing intent or document start that fails to read still clears.
  The `return` applies only to a retired sender's handoff.

**The change.** The branch returns without touching the current target. A comment gives the reason.

**Red, then green.**

| Run | Result | Detail |
|---|---|---|
| At HEAD (`red-at-head.txt`) | 1 of 46 fails | "expected null to match object": the valid target was cleared |
| With the change (`green.txt`) | 61 of 61 pass | `sourceAssemblyOwnership` with `workbenchRemedies` |

`workbenchRemedies`' insert-empty case failed when the two suites were run together at HEAD, and passes with the
change.

**The wider run.** Every client suite that sets or reads the editor target: 54 files, 917 of 919 tests pass. The
remaining failure is `anaDrivesWave4`'s credential-drawer case, which fails the same way at HEAD and is unrelated.

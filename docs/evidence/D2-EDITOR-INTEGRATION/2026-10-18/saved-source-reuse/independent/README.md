# Independent saved-source editor interactions

W1 / D2; canonical `concept2cure-v2`, initial source `e62320e0a`.
The [contract](../../../../../design/SAVED_ASSEMBLY_SOURCES_2026-10-18.md)
is qualified through the actual DocumentWorkbench, RichSectionEditor, existing
build disclosure, assembly/review controllers, editorTarget channel and canonical
transports. HTTP responses are synthetic. Unrelated filing, collaboration and
document-creation children are omitted. AuthService session adoption, shell
project visits, dirty editing and ceremony admission use actual implementations.

The [twelve interaction cases](../../../../../../client/src/concept2cure/v2/editor/__tests__/savedAssemblySourcesFlow.test.tsx)
verify:

- Opening/remounting the editor and opening build controls do not read saved
  references or write. Explicit Check displays historical references without
  making them the current selection. Use performs a second exact GET before
  adopting selectors, without restoring a reason, plan, candidate or AnA option.
- Both build modes require a fresh preview. Exact mixed Data Room/Vault selectors
  reach preview/commit; queued AnA generation receives the newly previewed
  manifest, including different excerpt bounds from the historical receipt.
  Existing text and the one RichSectionEditor remain. No candidate is accepted.
- A valid empty receipt differs visibly from a failed read. Malformed manifests,
  foreign-document success receipts and a changed latest event do not select
  sources or write. Historical checks preserve uncertain structural-write holds.
- Dirty text and an open governed form block reuse. A new catalogue handoff wins
  over a delayed historical response. Doubled checks and late replies cannot
  revive metadata across project-visit or actual account/session ABA.
- Opening manual AnA review during the reuse GET prevents late adoption and
  preserves the edited review body. Closing the panel followed by a fresh
  explicit Check and Use permits reuse; no acceptance or structural write occurs.

Retained receipts:

- [Missing-feature RED](initial-red.txt): 2/2 failed because the actual editor had
  no **Check saved sources** action.
- [First candidate](first-candidate.txt): 12/12 passed.
- [Assertion intermediate](alert-query-intermediate.txt): 11 passed, one failed
  because a strengthened failure-message assertion matched multiple editor alert
  regions. Scoping it to the saved-source notice preserved the expected message.
- [Final frozen-source run](green.txt): 12/12 passed.
- [Final strict lint](lint.txt): the owned interaction test passed with zero
  errors and warnings. Successful empty output is retained as an empty file.

Run commands used Node 22 with the existing workspace toolchain:

```sh
PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vitest run client/src/concept2cure/v2/editor/__tests__/savedAssemblySourcesFlow.test.tsx --reporter=verbose
PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH ./node_modules/.bin/eslint client/src/concept2cure/v2/editor/__tests__/savedAssemblySourcesFlow.test.tsx --max-warnings 0
```

All 24 client/shared/test pins matched before and after the final run; see
[summary.json](summary.json). Original and repository receipt hashes and the
limited final-newline normalization appear in
[receipt-storage.json](receipt-storage.json). Counts are separate receipts, not
an aggregate of unique cases. Database/audit/source admission and browser work
are separate evidence. This synthetic HTTP qualification makes no live-provider,
deployment, human-review or regulatory-readiness claim.

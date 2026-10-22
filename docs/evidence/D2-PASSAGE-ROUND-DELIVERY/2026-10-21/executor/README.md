# Classic executor proof frozen before implementation

The new `passage-round-executor.test.ts` suite ran against unchanged production
inputs: **9 intended failures and 5 passing controls, 14 tests total**. The
canonical run exited 1 because the existing round budget slices passage JSON
and the existing classic host has no staged-result observer. These are real
behavior failures through exported, existing code; no missing module or export
caused the failures.

## What already exists

- `server/services/ana/AnaToolExecutor.ts` already registers governed handlers
  and runs the classic loop, dispatch, budgeter, source handoff guard,
  settlement, per-result cap and untrusted framing. Its execution callback sees
  raw results; there is no post-guard, classic-capped staging callback yet.
- `server/services/ana/agentic-loop.ts` already budgets every round and protects
  private deferred reads. Passage results currently remain cuttable.
- `server/services/ana/read-receipts.ts` already defers and guards read results,
  admitting legacy history only for unchanged eligible bodies.
- `server/services/ana/__tests__/read-delivery-executor.test.ts` already drives
  the native classic host against a scripted gateway and in-memory Vault. This
  proof extends those seams in a disjoint new suite.
- `support/read-delivery-vault.ts` and `support/source-read-tool-fixture.ts`
  already substitute source admission, source verification and persistence,
  and read back unframed gateway-request bodies. They are reused unchanged.

The root [inventory](../INVENTORY.md) and [contract](../CONTRACT.md) record the
prior code/name and deleted-history searches and reviewed interface.

## Cases and boundaries

The nine intended failures qualify:

1. Four synthetic 7,400-character passage bodies retain their first three
   complete bodies and references; the fourth is fixed withholding JSON without
   its document id or source text. Raw execution callbacks retain original
   handler results. Unicode and a closing tool-output tag pass native framing.
2. A private admitted source read retains priority even when it is last in the
   call list. Its exact read window and receipt remain intact; only two of four
   large passage bodies can fit beside it.
3. The proposed observer sees actual classic-capped gateway-request bytes,
   including id, tool name and round; terminal narration rounds; reused ids in
   successive rounds; and a source-refused handoff after the underlying fixture
   document changes. Entry mutation, array mutation and a thrown observer
   error must leave the already formatted request unchanged.

Five passing controls retain small passage and ordinary body bytes, an admitted
read's text and legacy receipt, no observation on a no-tool fast answer, and no
observation/model continuation after execution is cancelled before handoff.

The gateway is scripted, passage/ordinary handlers return synthetic bodies, and
the Vault, admission, verification and receipt writer are fixture substitutes.
Native loop dispatch, budget placement, guard/settlement orchestration, capping
and framing execute. This does not qualify source admission, SQL/native
transactions, provider delivery, real retrieval, multilingual relevance or
agency acceptance. The observation means bytes staged in a gateway request,
not bytes served by a provider.

`baseline-command.json` records exact Node 22 argv, canonical configuration,
one worker and 4 GiB heap. All 26 root baseline inputs and all 29 selected inputs
recorded here remained unchanged. This is a selected input set, not an exhaustive
dependency graph. `baseline-red.txt` preserves raw combined stdout/stderr bytes,
including full assertion diffs and terminal whitespace. Multiple soft assertions
can fail within one failed test; the frozen count is tests, not assertion lines.

Scoped ESLint exited 0 with **0 errors and 0 warnings**; its complete stdout and
stderr are retained. `frozen-test.json` binds the unchanged test bytes. No
production edits, compiler run, Git mutations or live provider/database calls
were performed by this owner. Test bytes remain frozen for root's implementation
and final qualification.

# WB — the new checks, seen failing on the defects they exist to catch

CLAUDE.md working agreement: "a gate that has only ever been seen to pass has not
been tested." Each mutation below was applied to the working tree, the affected
test file was run, and the file was restored byte-for-byte (`diff -q` against the
backup printed `files-restored`). Nothing from these mutations was committed.

## F-3 — `server/routes/__tests__/qms-document-approval-signature.test.ts`

### Mutation A — the `electronic_signatures` write removed from `approveQmsDocumentSigned`

```
 × … the signed write path > signs: one electronic_signatures write on the transaction, bound to the content digest, meaning APPROVED, then COMMIT
   → expected "vi.fn()" to be called 1 times, but got 0 times
 × … the signed write path > records password+totp only when the verifier actually verified a second factor
 × … the signed write path > rolls the approval back when the signature row cannot be written — never effective without a signature
   → expected 200 to be 500 // Object.is equality
 Test Files  1 failed (1)
      Tests  3 failed | 7 passed (10)
```

### Mutation B — the route defaults the missing components (`{password:'x', meaning:'APPROVED', reason:'session', ...body}`), i.e. the original F-3 behaviour of accepting an empty body

```
 × … electronic signature > refuses an empty body with 400 naming the missing signature components, and writes nothing
 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
```

## F-9 — `server/services/submission-ai/__tests__/dispatch-qc-deterministic.test.ts`

### Mutation C — `runDispatchQc` restored to the pre-fix shape: the model is called unconditionally and its `clearedToDispatch` decides

```
 × … without a provider: returns the deterministic verdict, narrative null, and never calls the model
   → The AI request could not be completed.
 × … the verdict is byte-identical with and without a provider
   → The AI request could not be completed.
 × … a model claiming cleared cannot clear a blocked verdict
   → expected true to be false // Object.is equality
 × … a model claiming blocked cannot block a cleared verdict — its verdict is never read
   → expected false to be true // Object.is equality
 × … a non-JSON model response leaves the verdict intact and names why the narrative is absent
   → The AI response was not valid JSON.
 × … a provider error leaves the verdict intact
   → The AI request could not be completed.
 × … the model is handed the deterministic verdict to narrate, not asked for one
   → Cannot read properties of undefined (reading 'clearedToDispatch')
 Test Files  1 failed (1)
      Tests  7 failed | 4 passed (11)
```

The first two failures in Mutation C are the OQ-SRDY-03 deviation reproduced in
a unit test: with no provider the old code threw instead of answering.

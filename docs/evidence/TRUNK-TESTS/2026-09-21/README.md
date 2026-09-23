# Two trunk test failures — diagnosis and fix

Date: 2026-09-21 · Scope: the two files named below, plus the production files the
root causes turned out to be in. No git operations were run from this session.

Both files failed on trunk before any of the day's work and were still failing when
this session started. Each was run, read, and diagnosed on its own terms; one turned
out to be a product defect, one a stale traversal in the test plus a product defect
underneath it. No assertion was weakened: every `expect` that was there before is
still there, unchanged, and one was added.

There is no AI provider configured in this environment. Nothing here needed one —
both paths are deterministic. The embedding call in file 2 is stubbed by the test,
as its own header says.

---

## 1. `tests/routes/chat-upload-to-memory.test.ts` — PRODUCT DEFECT

### The failure (before)

```
$ npx vitest run --config vitest.config.ts tests/routes/chat-upload-to-memory.test.ts

 × chat upload → extraction → project memory (e2e) > writes a text file's real content
   into the artifact and embedded memory atom
   AssertionError: expected "vi.fn()" to be called with arguments: [ 4242 ]
   Received: 1st vi.fn() call: [ - 4242, + "4242" ]
 × chat upload → extraction → project memory (e2e) > OCRs an uploaded image and stores
   the recognised text in memory
   AssertionError: expected "vi.fn()" to be called with arguments: [ 77 ]
   Received: 1st vi.fn() call: [ - 77, + "77" ]

 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
```

### Root cause

`server/services/chat-uploads/upload-retrieval-atom.ts:174`

```ts
const atomId = Number(rows[0].id);            // :170
// embedAtom takes the id as a string (it interpolates into a parameterized read).
await getEmbeddingService(db as any).embedAtom(String(atomId));   // :174
```

The one writer of a chat upload's retrieval atom parsed the returned primary key
with `Number()` and converted it straight back to a string one line later.

The comment that justified it is not true of the function it describes.
`EnhancedEmbeddingService.embedAtom` (`server/services/enhancedEmbeddingService.ts:225`)
does not interpolate anything — the id is a bound `$1` / `$3` parameter in both of its
statements. And `lumen_data_atoms.id` is `serial`
(`migrations/0000_sweet_joseph.sql:3959`), so the id is an integer.

What invited the coercion was the signature: `embedAtom(atomId: string, …)`, a `string`
parameter for an `int4` primary key. Every other caller of `embedAtom` in the repo
passes the row id exactly as it came back from the insert:

- `server/services/projects/contextual-ingest.ts:184`
- `server/routes/c2c/artifacts.ts:728` and `:1052`
- `server/routes/c2c/knowledge-sources.ts:574`

So one capability reached one function in two shapes, for a reason that does not exist.

### Decision: the product is wrong, the test is right

The test pinned "the atom was embedded with the id the insert returned", and that is
the behaviour that must hold. Loosening it to `expect.anything()` or to `'4242'` would
have written the divergence into the contract. The assertion is untouched.

Honest limit on the claim: on Postgres this coercion is not user-visible. `WHERE id = $1`
with the text `'4242'` against an `int4` column is coerced by the server and matches. It
is a type divergence and a false comment, not a data-loss bug. It is fixed because the
divergence is real, not because a test complained about it.

### The fix

- `server/services/chat-uploads/upload-retrieval-atom.ts:171-180` — pass `atomId`, the
  number the insert returned. The old comment is replaced with what `embedAtom` actually
  does and why the other four call sites look the way they do.
- `server/services/enhancedEmbeddingService.ts` — `embedAtom`, `queueAtomForEmbedding`,
  `logEmbeddingAudit` and `AtomEmbeddingJob.atomId` now type the id as `number`, the type
  the column has, so the coercion cannot be re-invented against the signature. Type-only:
  no runtime change, and every existing caller already passed a number.

### After

```
$ npx vitest run --config vitest.config.ts tests/routes/chat-upload-to-memory.test.ts
 ✓ writes a text file's real content into the artifact and embedded memory atom
 ✓ does NOT store a filename placeholder when extraction yields real text
 ✓ reports extraction status for an org-scoped upload (no project, no artifact)
 ✓ OCRs an uploaded image and stores the recognised text in memory
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

The OCR case ran rather than skipping — the Tesseract language data is vendored here.

---

## 2. `tests/concept2cure/mdx-surfaces-interactive-smoke.test.tsx` — STALE TRAVERSAL + PRODUCT DEFECT

### The failure (before)

```
 ✓ Analytics: every button click is handler-safe
 ✓ Postmarket: every button click is handler-safe
 × Engineering: every risk-matrix cell click is handler-safe → expected 2 to be greater than 5
 × UDI: every label-preview / format-picker click is handler-safe → expected 2 to be greater than 5

 Test Files  1 failed (1)
      Tests  2 failed | 3 passed (5)
```

### Root cause A — the helper measured only the first paint (test)

`clickEveryButton` took ONE `container.querySelectorAll('button')` snapshot and clicked
that list. Engineering and UDI hold their rich content inside a "Situational awareness"
accordion that is collapsed on first paint — by design, stated in each surface's own
module docstring (`EngineeringSurface.tsx:336`, `UdiSurface.tsx:6-8`). So the snapshot
saw two controls; clicking the accordion head revealed the rest *after* the list had
been taken, and the suite drove none of it. That is the opposite of what the file is
named for.

This is a stale traversal, not a stale expectation. What changed under it is that the
surfaces moved their content behind progressive disclosure. The `> 5` threshold is not
weakened — it is now measured against what the surface can actually reach.

Instrumented proof of the diagnosis (temporary `console.log` in the helper, since removed):

```
DEBUGBTN 0 "Ask AnA"                                      btn ghost small
DEBUGBTN 0 "Situational awarenessDevice registry · regi…" eng-awareness-head
```

Two buttons, both in round 0, and nothing in round 1.

### Root cause B — the UDI documents gate discarded its own rows (product)

`client/src/concept2cure/mdx/surfaces/UdiSurface.tsx` (before, at the gate on the
primary zone):

```tsx
<DataGate state={live.labels} label="labeling documents" onRetry={live.refresh} …>
  {() => (
    <DocumentsPanel … docs={documents} … />     // ← ignores the rows the gate passed
  )}
</DataGate>
```

`DataGate`'s contract is that the render prop receives the data the gate resolved
(`components/DataGate.tsx:52`). This call site ignored its parameter and read
`documents`, which is derived from `readyRows(live.labels)` and is therefore `[]` in
every non-`ready` state. Consequences, both real:

1. The one panel this doc-first surface exists for could not be populated by the
   supported sample path at all, so the gate was also given no `sample` — while its
   three sibling panels in the same file pass `UDI_DEVICES`, `UDI_SYMBOLS`, `UDI_MRI`.
   The kit's `UDI_LABELS` fixture (`data/udi.ts:96`) was referenced by nothing but a
   `typeof` in `hooks/useUdi.ts:30`.
2. Had a `sample` been added without fixing the render prop, the gate would have drawn
   its standing "example content" banner over an **empty** panel — a labelled claim
   with nothing under it.

`EngineeringSurface.tsx:476` has the same shape — `sample={ENG_RISKS}` with a render
prop that ignores its rows and maps `visibleRisks` instead, so its sample banner also
sits over an empty list. **Not fixed here**: it is not a root cause of either failing
test and Engineering is outside this session's scope. Reported so it is not lost.

### Decision

- Helper: strengthen the traversal (click → re-query → click what the last click
  revealed, until the set closes; elements tracked by DOM identity so a surviving
  control is clicked once and an accordion is never toggled shut by the helper;
  `maxRounds` bounds a ping-pong). Engineering passes on this alone.
- UDI: fix the product. The mapping became a pure function of the rows passed in
  (`toLabelDocuments`), the render prop uses its parameter, and `UDI_LABELS` is wired
  as the gate's `sample` like its siblings.
- The metric tiles above the gate deliberately stay on `readyRows(live.labels)`. They
  are ungated, so a figure in them is read as the tenant's own; sample rows must not
  reach a number that carries no banner.

### Fail-first proof

The `> 5` count could not tell "the gate rendered" from "the gate's rows reached the
panel": `DocumentsPanel` draws its framework filter chips even with zero docs, so
reverting the render-prop fix alone still passed. That made the count a weak witness,
so an assertion was ADDED to the UDI case:

```tsx
expect(container.querySelectorAll('.docs-row').length).toBeGreaterThan(0);
```

With the product fix reverted (`docs={documents}` restored, everything else in place):

```
 × UDI: every label-preview / format-picker click is handler-safe
   → expected 0 to be greater than 0
   166|  expect(container.querySelectorAll('.docs-row').length).toBeGreater…
      Tests  1 failed | 4 skipped (5)
```

Restored, it passes. The check has now been seen to fail on the case it exists to catch.

### After

```
 ✓ Analytics: every button click is handler-safe
 ✓ Postmarket: every button click is handler-safe
 ✓ Engineering: every risk-matrix cell click is handler-safe
 ✓ UDI: every label-preview / format-picker click is handler-safe
 ✓ MDX Files tab — renders all five filesystem roots on PathwayPanes(k510)
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

---

## Files changed

| File | Kind |
|---|---|
| `server/services/chat-uploads/upload-retrieval-atom.ts` | product |
| `server/services/enhancedEmbeddingService.ts` | product (types only) |
| `client/src/concept2cure/mdx/surfaces/UdiSurface.tsx` | product |
| `tests/concept2cure/mdx-surfaces-interactive-smoke.test.tsx` | test |
| `tests/routes/chat-upload-to-memory.test.ts` | **unchanged** |

No fixture or sample data was added to a governed path. `UDI_LABELS` is the design
kit's existing sample fixture, reachable only behind the explicit `sampleMode`
boundary and only under `DataGate`'s standing banner; it is force-disabled in
production builds (`lib/sampleMode.ts:35`). No credentials appear in this file.

## Regression run — the two files plus every suite importing what changed

```
$ npx vitest run --config vitest.config.ts \
    tests/concept2cure/mdx-surfaces-interactive-smoke.test.tsx \
    tests/concept2cure/design-system-surfaces-smoke.test.tsx \
    tests/routes/chat-upload-to-memory.test.ts \
    tests/routes/chat-governed-upload.test.ts \
    server/services/chat-uploads/__tests__/upload-retrieval-atom.test.ts \
    server/services/__tests__/enhancedEmbeddingService.source-identity.test.ts \
    server/services/innovation/__tests__/embedding-failure-honesty.contract.test.ts \
    client/src/concept2cure/mdx/components/__tests__/dataGateContract.test.tsx \
    client/src/concept2cure/mdx/lib/__tests__/useSampleRows.test.tsx

 Test Files  9 passed (9)
      Tests  63 passed (63)
```

`tests/db/document-catalog.dbtest.ts` also imports `writeUploadRetrievalAtom`; it needs
a provisioned Postgres and was not run here. The change to that module is one argument's
type on a call the DB test does not assert.

## Gates

```
$ npm run typecheck:fast
> NODE_OPTIONS="--max-old-space-size=24576" tsc --noEmit -p tsconfig.check.json
[exited with code 0]

$ node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD
[ci:eslint-warning-ratchet] --since HEAD (8a40bb187) -- 4 lintable file(s) changed; linting both versions of each...
[ci:eslint-warning-ratchet] no file changed its warning count since HEAD.
```

The 4 lintable files are exactly the four changed above; none of them appears in the
ratchet output, which reports only files whose warning count moved.

# AnA client rendering QA — fixed speed and experience batch

Baseline: `185b6f089d58f4bb9f1cead26d9aef9a403f4576` on `concept2cure-v2`.
Launch evidence row: D4. Scope: the existing chat markdown renderer's cache-hit path.

## Delivered behavior

`client/src/concept2cure/components/ana/renderSafeMarkdown.ts` now promotes a
cache hit to the most recently used position. Actively viewed answers therefore
remain cached as distinct streaming prefixes arrive. Unread entries remain
eligible for eviction, with the existing **200-entry limit**.

This is a cache-order change. The marked parser, DOMPurify allowlists, escaping
fallback, authored-figure handling, and rendered HTML remain the same. No
component markup, styles, panel dimensions, widths, layout, or dependencies were
changed in this frontend slice.

## Fail-first and regression evidence

The existing untracked batch regression test was run before the fix. Its
frequently read answer case failed: it expected 601 parser calls for the answer
plus 600 distinct prefixes, but the insertion-order cache made 604 calls.
The other two cache cases passed. The complete failing run is retained in
`markdown-cache-red.txt` (Node v24.19.0).

After the fix, **81 tests passed across 4 files** on canonical Node v22.23.3:

- `client/src/concept2cure/components/ana/__tests__/renderSafeMarkdown-cache.test.ts`
- `client/src/concept2cure/components/ana/__tests__/renderSafeMarkdown.test.ts`
- `client/src/concept2cure/v2/editor/__tests__/authoredHtml.test.tsx`
- `shared/__tests__/figure-refs.test.ts`

The successful run is retained in `markdown-cache-green-sanitizer.txt`.

| QA flow | Verified outcome |
| --- | --- |
| Read the same answer while 600 distinct prefixes stream | The answer is parsed and sanitized once; every cached result matches its original safe HTML. |
| Add a 201st distinct unread entry | The oldest unread entry is evicted and re-rendered when requested; the cache limit is not increased. |
| Repeatedly display malicious markdown | Script, image, event-handler, and JavaScript-URL sinks stay absent on cache hits. |
| Render ordinary chat content | Markdown formatting and allowed links still render; disallowed HTML remains stripped. |
| View authored figures after chat rendering | Governed references use the authenticated resolver; external and unsupported images cannot retain live fetchable sources; inline PNG behavior remains intact. |

These are automated renderer and component checks under jsdom. Live browser
frame rate, responsive layout, and end-to-end client latency were not measured.
There is no layout or width change to validate in the frontend diff.

## Reproducible renderer benchmark

Run from the repository root using the canonical Node 22 runtime:

```sh
node docs/evidence/D4/2026-10-08-ana-speed-experience/markdown-cache-benchmark.mjs
```

The script compiles the real baseline and working renderers, uses installed
marked and DOMPurify under jsdom, and starts with empty private caches. It
renders 80 representative retained answers, then 600 growing markdown prefixes,
reading all retained answers after each prefix: **48,680 render calls** per run.
The corpus includes headings, bold text, links, lists, tables, and malicious HTML.
Three repetitions alternate before/after order, after warming the libraries.
Both renderer sources are checked for the 200-entry limit.

| Deterministic operation | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Markdown parses | 1,000 | 680 | 320 / 32% |
| DOMPurify sanitizations | 1,000 | 680 | 320 / 32% |

The unavoidable cold work is 80 history answers plus 600 distinct prefixes.
The corrected cache removes **all 320 avoidable history re-renders** in this
workload. Each history answer and every streamed prefix is compared between
before/after runs; output remains identical. Malicious history content is also
checked explicitly after rendering.

Exact per-run wall-clock measurements and medians are in
`markdown-cache-benchmark.json` and `markdown-cache-benchmark.txt`. Timings vary
with concurrent host load; the deterministic operation counts are the stronger
evidence. This measures synchronous client renderer work, not provider latency,
time to first token, or a browser frame-rate guarantee. The benchmark script's
zero-warning lint result is recorded in `markdown-cache-benchmark-lint.txt`.

## Independent backend diff review

Read-only review of the accompanying `stream.ts` and `chat-context-builder.ts`
changes found no introduced admission or memory-scope regression:

- Streaming recall begins after thread resolution, history read, and question
  persistence succeed. Their existing error returns still occur before recall.
- Canonical chat recall chains on the same caller/organization admission
  promise and uses its returned thread ID; denied or missing access supplies an
  empty ID rather than the untrusted requested ID.
- Organization, project, query, per-layer limit, and memory character budget
  are unchanged. Prompt construction still waits for the memory result.
- Early rejections have immediate fallback handlers while independent route
  reads remain pending.

The backend tests cover pending admission, all three streaming persistence
failure stages, slow memory, and early rejection. Backend execution logs and
overall release gates belong to the batch delivery record.

# Frozen strict raw-body budget fail-first qualification

## What already exists

`server/services/ana/agentic-loop.ts` already owns classic per-result caps,
round targets/floors, private read placement and whole passage withholding. This
suite calls that implementation directly. It exposes ordinary floor overflow,
whole protected results beside a zero custom ordinary floor, and irreducible
per-call bodies. It does not create a second allocator or use private hooks.
The parent contract and inventory name the remaining host and receipt seams.

## Frozen baseline result

- Baseline inputs: `../baseline-inputs.json`; all 21 pinned files matched before
  and after execution. The pin file itself is unchanged across both checks.
- Node: v22.23.3; canonical Vitest v4.1.7, config, one worker, no file parallelism
  and 4096 MB heap. Exact command: `red.command.txt`; complete output:
  `red.raw.txt`; exit status: 1.
- 24 tests: 17 intended failures, 4 passing controls, 3 explicitly skipped
  optional assertion-export checks. No missing export/import causes a failure.
- The aggregate regression returns 29,960 raw UTF-16 characters against 24,000.
  The custom floor/marker regression remains above 500 characters. The fixed
  ordinary envelope cases fail because historical bodies remain cut/plain text.
- Reachable protected-priority fixtures use `minPerResult: 0`: retained whole
  protected JSON exactly fills a valid custom total while a tiny ordinary sibling
  adds 1–2 characters. Historical output is independently pinned equal to the
  original. Expected strict behavior replaces the last passage before a private
  read, or the last private read with the exact trusted re-read offset.
- Tiny totals, 12,001 short calls and invalid totals return instead of producing
  the specified typed refusal. Tests also freeze input/map immutability, private
  map precedence, no short-body enlargement and exact existing replacements.
- Passing controls preserve exact legacy omitted/false floor/marker bytes,
  under-budget whole JSON, existing over-ceiling protected replacements and zero
  empty-body behavior. Optional final assertion tests activate when the export
  exists; they cover UTF-16 measurement, unchanged final arrays and late refusal
  envelope growth. Native host growth/order qualification belongs to the other
  assigned worker, not this pure suite.

The test file is frozen at the SHA-256 in `frozen-hashes.json`; do not amend it
for implementation convenience. Production, Git and compiler work belong to
root. No live provider, source access, persistence or database operation was
qualified; canonical setup mocks database access.

# Frozen classifier context-refusal carry qualification

## What already exists

`server/services/ai-gateway/gateway-error-map.ts` already maps canonical
`GatewayContextWindowError` to TOKEN_LIMIT_EXCEEDED and the shared 413 table.
`context-budget.ts` already authors deterministic size, ceiling and reduction
messages. This suite extends their existing public classification seam; it does
not add another estimate or admission policy. Parent inventory/contract name
native carriers and UI recovery, which are owned by other workers.

## Frozen baseline result

Baseline `30afd3bd17a90c8de4a44098354d9de3a34cb4bc`. All 24 selected input
hashes matched before and after qualification; `baseline-inputs.json` itself
also matched across both checks. Node v22.23.3, canonical Vitest v4.1.7, canonical
config, one worker, no file parallelism and 4096 MB heap. Exact argv and shell
commands, complete raw logs, machine report and exit statuses are retained here.

ESLint finished before freeze with exit 0, zero errors and zero warnings.
The final baseline run has 20 tests: 4 intended failures, 16 passing controls,
zero skips. All four failure diffs are exactly the absent fixed earlier-work
suffix on actual typed context errors: reserved output, no reserve, no fit
details, and frozen/repeated-call immutability. The existing export is imported
normally and only its optional second-argument type is widened; absent exports
or failed imports do not cause the red run.

Passing controls pin omitted/empty/false options and canonical numeric text;
provider-wrapped token/context/max_tokens failures; wrapped provider overload,
rate limit and ordinary unavailable errors; generic/source policy, no-provider,
SyntaxError and untyped/forged errors. Even a forged context-error name on a
real wrapped provider token failure receives its historical sanitized message
without the new note. These controls protect the typed compatibility boundary.

The test is frozen at its SHA-256 in `frozen-hashes.json`; no implementation
convenience edits are permitted after freeze. Root owns production, Git and
compiler work. This suite uses synthetic fit numbers and real error classes;
canonical setup mocks database access. It qualifies no live provider/database,
exact tokenizer, provider serialized payload, action rollback or receipt write.

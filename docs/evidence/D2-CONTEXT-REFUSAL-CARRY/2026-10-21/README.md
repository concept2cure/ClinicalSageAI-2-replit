# Reach existing context-window refusal through AnA — D2 / W2

This completes the existing full-request admission error path through AnA's two
server carriers and current UI. [CONTRACT.md](CONTRACT.md) fixes the interface,
partial-work honesty and compatibility boundary before production changes.

## What already exists

- `server/services/ana/agentic-loop.ts`, `AnaToolExecutor.ts` and
  `server/routes/ana-ri/stream.ts` already protect raw result-body integrity and
  the 24,000-character bound. `tool-output-frame.ts` adds untrusted-data framing.
- `server/services/ai-gateway/context-budget.ts` and `gateway.ts` already
  estimate the complete request and refuse models whose windows cannot fit.
  `gateway-error-map.ts` already supplies TOKEN_LIMIT_EXCEEDED/413 and actionable
  size guidance. No new admission engine or arbitrary framed-character limit.
- `server/routes/chat/send-message.ts` and the SSE catch already retain failed
  records, but discard this typed refusal. Existing raw-body422 remains intact.
- `client/src/concept2cure/components/ana/useAnaChat.ts` already carries SSE
  failures/records but shows generic retry copy; its non-2xx parser loses the
  message/record. Existing `queryClient.ts` safe readers and `anaProgress.ts`
  record validation are reused. Existing gateway, host and hook suites expose
  the verification seams. [INVENTORY.md](INVENTORY.md) records prior searches.

## Qualification

Five owners froze six new suites: **80 tests, 33 intended failures and 47 passing
controls**, with no skips or missing-export failures. Three existing real
gateway-admission controls also passed. All 24 selected baseline inputs stayed
unchanged before production. [Classifier](classifier/SUMMARY.md),
[chat](chat/README.md), [stream](stream/README.md), [client](client/README.md) and
[native executor/cost](executor/README.md) evidence names exact commands, hashes,
raw transcripts and substituted boundaries. The latter are passing controls,
not invented red evidence. [frozen-tests.json](frozen-tests.json) pins the suites.

Root removed one extra test EOF newline before production edits and repeated
that chat baseline: three intended failures, four controls, no skips; every
assertion/fixture and all 24 inputs were unchanged. Original bytes and the
repeat proof remain in [whitespace-review](whitespace-review/refrozen.json).
Earlier worker fixture/lint attempts remain labeled and preserved.

The initial full regression passed **970 tests / 79 suites**. Explicit included
lint then found two client warnings that the default command's ignored-file
result concealed. Root established the actual 37-warning client baseline by
linting byte-identical original Git source via stdin under its actual filename,
then extracted two small recovery helpers without changing frozen tests. The
final included lint across all ten changed TypeScript files has **zero errors,
80 existing warnings, zero growth and zero test warnings**. Initial runs remain
retained. No suppression or warning baseline changed. Three independent reviews
cleared production; a further review cleared the helper extraction and unchanged
server hashes. The final canonical Node 22 run passed the same **970 tests / 79
suites, with zero skips**. Commands/results are under `root/`; publication
evidence records actual normal hooks and fresh remote verification.

## Behavior and limits

The existing canonical classifier preserves default/false outputs. Its explicit
prior-work option appends guidance only to a genuine typed context refusal;
provider-wrapped token failures, copied error names, raw-body422 and generic
responses retain their existing behavior. Both chat routes use the existing
413 table and retain failed/stopped records. An early context refusal closes
its timeline in the existing recorder/mirror without prematurely opening SSE.
The client carries sanitized guidance and valid records through HTTP/SSE,
preserves partial text, uses fixed safe fallback copy and performs no automatic
resubmission. Other error messages are not made displayable by this change.

Root owns production and Git. All work goes directly to `concept2cure-v2`.
No tool, provider, model, dependency, schema, admission engine or user surface
is added. Context admission remains a lenient estimate, not exact tokenizer or
provider-payload measurement. No SDK dispatch for the refused invocation says
nothing about earlier calls/actions or host-admission receipts. No live
provider/DB, source-admission authority, whole-turn rollback, multilingual
relevance or agency acceptance is claimed by these fixtures. Selected source
pins are not an exhaustive dependency graph. Raw `.txt` transcripts retain exact
bytes; lint JSON summaries omit duplicated source and retain raw stdout hashes.

## Canonical integration — 2026-10-23

The interrupted push was rejected after its checks passed because the branch
advanced. The incoming DT3 stop/reconnect behavior is preserved, together with
this context recovery. The dated [contract amendment](CONTRACT.md#integration-amendment--2026-10-23)
documents the superseded stop-carrier assertion and retained original bytes.
Historical 970-test results qualify the pre-merge implementation only; fresh
merged-tree results and publication checks are recorded separately.

Fresh merged-tree qualification passed **1,183 tests / 97 suites**, with zero
failures or skips. Included lint across all ten changed TypeScript files has
zero errors and the same 80 existing warnings (zero growth). All 682 selected
source/test/config inputs are pinned; this selection is not an exhaustive
dependency graph. See [merged qualification](root/resume-qualification.json)
and [publication](PUBLICATION.md) for normal push and remote verification.

Code was pushed normally as `264560f40a3d984289d5fb3311d0986094735410`. All gates passed, including
whole-tree TypeScript with zero errors. A fresh fetch verified identical local
and remote heads, all 682 selected inputs, 134 qualification artifacts and 44
retained ancestors; no merge conflicts remained. Publication proof follows in
the same canonical branch.

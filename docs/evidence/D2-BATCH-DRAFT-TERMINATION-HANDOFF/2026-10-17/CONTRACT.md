# D2 — preserve generation termination through BatchDraft acceptance

Control tower approves this bounded W2 / D2 contract before implementation on 2026-10-17. Baseline: `45fbf8d8f9ce65da6f67ab805da2551f6621fdc9`. All code, tests, records and normal pushes stay directly on `concept2cure-v2`; root owns Git. Evidence stays here.

## Verified defect

The generic `/api/claude/batch` service already returns `finishReason` and `truncated`. The actual BatchDraft component drops both while mapping responses into cards and omits them from its acceptance POST. The existing accept route checks snake_case `finish_reason` and `truncated`, so a known cut-off generation can be displayed as ready and its termination evidence never reaches that refusal check. The separately delivered AnA-tool receipt fix does not fix this screen.

## Interface and behavior

1. Add explicit per-card `finishReason: string | null` and `truncated: boolean`, defaulting to null/false. A missing flag means no reported cutoff, not confirmed completeness. Preserve the exact string reason (including whitespace) or explicit null; never invent `end_turn`. Normalize only explicit true or a recognized truncating reason to known cutoff.
2. Use one pure canonical finish-reason implementation in `shared/ai/finish-reason.ts`, moved unchanged from the current gateway helper. Keep the existing server module as a compatibility re-export so all existing server imports and semantics remain intact. The browser imports shared code, never the server module. No vocabulary duplication, dependency or provider changes.
3. A recognized cutoff or explicit `truncated === true` produces an error card with a fixed actionable shorten/split/redraft explanation. Its prose is not exposed as a ready editable/acceptable draft; it contributes nothing to ready/drafted counts, and has no Accept control. Guard the acceptance handler too. Retain completed siblings in original document order and their own IDs.
4. A usable non-cutoff card retains its finish metadata through existing edits. Acceptance sends `finish_reason` and `truncated` along with the existing edited content, framework, original machine text and turn record. Editing prose cannot erase the finish status or replace the original machine text. Acceptance is shown as saved only after the existing successful response.
5. Unknown, absent or unrecognized reasons remain unconfirmed, without a new server rejection policy or completeness certification. Existing ready means ready for review. The server wire remains snake_case; this increment does not add alias support or treat client-reported metadata as trusted attestation.
6. Preserve the existing service, server acceptance transaction, attribution, content snapshot/undo, lifecycle locks, figure/source checks and source receipts. No server-route policy change, new surface, autonomous retry, cancellation work, schema, migration, model, provider or filing-scope expansion.

## Team and proof

Root controls contract, integration, Git and release. Production owner edits only BatchDraft.tsx, the canonical shared helper and server re-export. Component-test owner owns only a new actual-component termination test file. Independent boundary owner owns separate proof/review artifacts and controls using the existing actual accept handler. Fourth worker may review shared/server compatibility read-only. No overlapping source ownership or worker Git mutations.

Before production edits, demonstrate meaningful failures from the existing component: known/explicit truncation incorrectly ready, missing successful acceptance metadata, edit/identity preservation and mixed-sibling recovery. Positive complete and unknown/absent controls must remain honest. Freeze the test assertions after lint and valid test typing; preserve baseline snapshots, exact commands and hashes. No import/config failure counts as fail-first.

Qualify the unchanged assertions on final code. Independently prove the current actual route rejects reported cutoff before writes and the component sends its required snake_case fields; prove classifier compatibility through existing tests. Run focused UI/server/source/provenance controls, whole canonical TypeScript, suitable browser bundle boundaries and normal hooks, without bypass or baseline growth. Bind proof to stable source bytes; retain diagnostic runs with explicit scope.

## Claim limits

This is a UI-to-accept metadata correction. The accept route intentionally permits legacy/manual unknown status, and turn records do not attest per-section termination. It does not prevent a caller omitting/forging metadata, certify completed scientific prose, qualify a provider or agency, or close D2. Existing cancellation and stronger trusted-write-boundary candidates remain separate.

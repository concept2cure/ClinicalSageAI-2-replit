# O01: await and report AnA model-provenance audit outcomes

The eight generation surfaces in `server/routes/ana-intelligence.ts` shared one
fire-and-forget `auditService.logAction` call. A generated answer looked identical
whether its model-provenance row was recorded or lost. Batch drafting sent the
HTTP response before beginning any of these writes.

The shared provenance function now awaits the canonical `recordAuditRow` writer
and returns its `AuditRowOutcome`. Draft, review, gap analysis, image analysis,
quick completion and the agent endpoint carry that result at `meta.auditTrail`.
Streaming awaits it before the `done` frame and puts `meta.auditTrail` in that
frame; it does not attempt to change headers after streaming has begun.

Batch drafting awaits a provenance attempt for every actual draft and combines
the outcomes with `combineAuditRowOutcomes` before answering. One lost row stays
visible even if another succeeds. A tamper-proof-only result retains
`chained: false`. Failed sections remain in their original slots, successful
drafts retain their turn-record receipt, and a batch with no actual drafts does
not invent an AI-generation audit or an aggregate outcome. Governed acceptance
is unchanged.

An unavailable audit does not discard generated content or misrepresent completed
agent tools as rolled back. The canonical writer handles store refusals and
rejections. An unexpected failure to load the lazy audit module also returns a
stable missing-audit outcome, with a bounded surface/action/code log and no raw
error on the wire. The audit module remains dynamically imported to preserve the
router's existing load boundary.

Identity still comes exclusively from the authenticated request. Audit details
retain the served model, SHA-256 of generated content and available token counts;
they contain no source text, generated prose, images, instructions or prompts.
This work does not alter model approval, Part 11 signatures or turn-record policy.

## Verification

The initial mounted API run reproduced **25 failing tests and 2 passing tests**
before the implementation. Failures included the absent outcome and responses
that completed before a delayed audit result. The final scoped run passed
**41 tests in 6 files**, including **31 new tests**:

- `server/routes/__tests__/ana-intelligence-audit-outcomes.test.ts` (28): all
  six JSON generation endpoints, the streaming endpoint and batch drafting;
  actual success/refusal/rejection conversion through the real canonical helper;
  delayed JSON, streaming and batch completion; recovery; tamper-proof-only
  persistence; identity/hash-only details; retained turn receipts and failed
  slots; no generation audit when drafting fails or every batch slot fails.
- `server/routes/__tests__/ana-intelligence-audit-loader-failure.test.ts` (3):
  JSON, batch and SSE completion after an unexpected lazy-module load failure.
- Existing provenance, identity and gateway-error suites (10) remained green.

The provider service and audit storage boundary are controlled fixtures in these
tests; the canonical `recordAuditRow` conversion is real in the 28 outcome tests.
This proves API behavior, not native database durability or live-provider
qualification. No live AI, agency or customer transaction was performed.

Scoped ESLint reported **zero errors**, with three pre-existing warnings in the
route (unused framework, console call and file length). Both new test files have
zero lint warnings. The scoped diff whitespace check passed. Root integration
owns the complete typecheck, build and release checks.

Local execution logs:

- `/workspace/audit/ana-provenance-audit-outcomes-red.log`
- `/workspace/audit/ana-provenance-audit-outcomes-final.log`
- `/workspace/audit/ana-provenance-audit-outcomes-lint-final.log`

## UI connection and remaining limits

`client/src/concept2cure/v2/surfaces/BatchDraft.tsx` calls `/api/claude/batch`
through the canonical `apiRequest` transport. Its existing audit-outcome scanner
recognizes a missing audit at `meta.auditTrail` and emits the shared warning
event. This note records that source connection; it does not claim a new mounted
browser warning test or a stream consumer qualification.

A source search found no current client callers for the other seven generation
routes. Their HTTP/SSE contracts are repaired, but those routes do not acquire
new product surfaces through this change. Audit availability, governed document
acceptance and model qualification remain separate concerns.

# W3 / D4 — Intelligent Awareness in submission conversation runtime

This session audits IA beyond personality text: both submission-chat builders,
both runtime handlers, conversation persistence, retrieval limitations, private
thread access, and apply/signature protections. No new provider, production
dependency, tool, module or surface is introduced.

## Problems reproduced and changes

| Problem | Resulting behavior |
| --- | --- |
| A buffered answer-only reply on a rewrite turn was automatically promoted into a stored proposal. A clarification could become proposed document text. | Only an explicit nonempty rewrite object becomes a buffered proposal; a streaming proposal still requires an explicit rewrite block. Questions, missing-data explanations and unstructured answer fallbacks remain answers. |
| Later rewrite instructions required proposed content despite unknown essentials or conflicting evidence. | Both output contracts allow a clarification-only reply, retaining intent and existing JSON/tag formats with no proposal. |
| Buffered conversation history retained the explanation but lost the proposed draft. | Both the chat history and provenance conversation retain the explanation plus explicit draft, matching streaming behavior. |
| Long turns were clipped from the front only, dropping late corrections or questions. | A shared bounded excerpt keeps both ends and explicitly marks/counts the omitted middle. Both prompts and native gateway turns use it; omitted context is not claimed complete. |
| Empty or failed retrieval could be presented as dossier silence and induce invented gap citations. | The prompt distinguishes unavailable retrieval, limited passages, and actually shortened passages. An empty result proves neither completeness nor evidence absence; a gap citation must identify a real supporting passage. |
| Submission chat read/appended a supplied thread ID without the main AnA ownership resolution. | Both handlers first require authenticated caller scope and call canonical getOrCreateThread. All history, memory, proposals, writes and response IDs use the resolved ID. A colleague's thread is refused; an unknown/foreign-organization ID gets a new caller-owned thread under the canonical contract. |
| A failed history read was silently treated as an empty conversation. | Both paths stop before model generation or proposal persistence and return HISTORY_UNAVAILABLE. The buffered route returns a static 503; streaming emits a static retryable error. Ownership/auth errors preserve safe 403/401 responses. |

Explicit proposals remain supported through
server/services/ana/submission-chat-handler.ts and
server/services/ana/submission-chat-stream-handler.ts. The replacement for the
unsafe prose-to-proposal shortcut is the existing explicit rewrite object/block,
proved by server/services/ana/__tests__/submission-chat-ia.test.ts. Artifact apply,
reason-for-change, signature and proposal-binding protections remain separate.
An explicit proposal is not proof of scientific correctness or approval readiness.

## Verification

- Initial runtime regressions: 10 failed / 2 passed before the first fixes
  (red-tests.txt). Further coverage/contract concerns are exercised in
  red-coverage-tests.txt; private context failures and history failure behavior
  have their own failing runs.
- Final run: 185 passing tests across 12 suites. New tests drive the actual
  handlers with controlled provider output, including two-turn clarification,
  questions with no proposal, explicit proposal controls, split stream markers,
  long corrections, failed retrieval, source conflicts, inaccessible threads
  and missing history. These are runtime regressions, not live model evaluation.
- Canonical ownership contracts run against in-process Postgres using real
  migrations and helpers, including foreign organization and colleague IDs.
  Existing signature, proposal, containment, IA/personality/register, tool
  carry-over and follow-up reasoning suites pass.
- All 26 repository guards pass. Explicit lint has zero errors and 29 existing
  source warnings; parent comparisons show unchanged counts on all three
  production files. Publication import/lint checks are recorded separately.

## Limits and remaining evidence

The current-head CI query returned no runs during this inspection; the broader
collection returned older commits, so none was attributed to this head. The
previous broad Test job's log retrieval returned Transport closed. No diagnosis
or green result is invented from those missing results. Prior broad CI/security
failures remain open; prior CI observations are retained in the earlier
2026-10-06-ana-ia-orchestration evidence, not presented as this change's validation.

Full TypeScript for this commit stays in GitHub CI under the authorized local
compiler-memory exception. Live IA adherence, scientific/regulatory source
coverage, provider quality/latency and D4 deployment/launch evidence remain
pending. This changes deterministic handling and prompt instructions; it does
not claim a model now has complete knowledge or always exercises good judgment.

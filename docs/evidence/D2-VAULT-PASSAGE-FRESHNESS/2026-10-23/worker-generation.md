# Generation fence tests — D2 / W2

## What already exists

`server/services/advancedRAGPipeline.ts` already revalidates sources before corrective grading, before generator dispatch, after generator dispatch, around faithfulness checking and before answer return. Existing disposition tests exercise withdrawal at these boundaries. The generation tests extend those seams to current extraction/chunk identity; no generator or guard is duplicated.

## Owned files and intended evidence

This worker owns only `server/services/__tests__/rag-vault-freshness-generation.test.ts` and this document. The suite has 11 cases: eight rejection cases, two unchanged derived-text controls and one current context-reference control. Eight semantic assertion failures and three passing controls are expected on unchanged production rather than import/runtime failures.

The actual `queryWithGeneration`, repeated candidate fences, corrective sufficiency helper, faithfulness helper and canonical generation request execute. The SQL rows, retrieval result and gateway replies are synthetic. Every candidate retains the same original-file hash across re-extraction. Separate cases establish no generator call for an obsolete retrieval snapshot, same-ID chunk replacement, a changed extraction while corrective grading awaits, an obsolete available context reference without expandedContent, and unknown-basis compressed/expanded evidence. Mutation during generator or faithfulness awaits must withhold the complete answer and all sources, including a two-source case.

The suite intentionally proves point-in-time checks, not cancellation of requests already dispatched, live provider delivery, native RLS, persisted SQL semantics, launch qualification or agency acceptance. Root runs lint/tests, records baseline failures, freezes hashes and owns production/Git. This worker ran no tests, compiler, lint or Git mutations.

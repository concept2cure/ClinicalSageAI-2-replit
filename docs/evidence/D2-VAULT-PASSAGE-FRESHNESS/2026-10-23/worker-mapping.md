# Mapping and strict-row test authorship — D2 / W2

## What already exists

The existing `AdvancedRAGPipeline.searchVaultSimilar`, `vaultLexicalArm` and `revalidateCandidates` methods already select and decode Vault rows. This worker extends their test coverage in one new file, `server/services/__tests__/rag-vault-freshness-mapping.test.ts`, under the independently approved contract. Production remains owned by the root agent.

## Scope and seams

The tests invoke the actual dense and lexical mapping methods and actual candidate revalidation method on a prototype pipeline. A controlled query function supplies SQL rows; embedding is a deterministic stub. SQL request assertions additionally check that the production statements request SHA-256 extraction identity and coordinates under their existing tenant/program/supersession fences. This file does not execute PostgreSQL, native RLS, providers or access admission. Real SQL execution is assigned separately.

Coverage includes dense/lexical snapshot pinning, explicit NULL basis, strict malformed/missing freshness metadata refusal, first admission of plain legacy text, refusal of unknown derived basis, and unchanged NULL extraction/offset, shifted-backfill coordinate and unavailable-neighbor hit-only controls. Exact source-span verification remains the existing context verifier's responsibility; these tests do not invent offsets or claim substring membership is span proof.

No production or existing regression files were edited by this worker. No test, compiler, Git commit or push was run; root owns fail-first execution, lint, freezing, qualification and publication. This is an authorship handoff, not a passing-result claim.

# Repo Scout Agent Map (Read-only)

## Existing governed surfaces to reuse
- Artifact governance and immutable reporting seams already exist under `server/routes/intelligent-reports*`, `server/middleware/documentLoopGuards.ts`, and workflow routes mounted in `server/index.ts`.
- Existing orchestration mount exists at `/api/orchestration` (Phase 3) and can be extended rather than duplicated.
- Existing provenance/audit seams exist via `server/lib/tamper-proof-audit.ts`, audit services, and decision-lineage routes.

## Impacted-file inventory
- Server mounts: `server/index.ts`
- New conversation-os route surface: `server/routes/conversation-os.ts`
- New specialty services: `server/services/conversation-os/*`
- Validation tests: `server/services/__tests__/conversation-os.test.ts`

## Dependency map
- Tool Gate service → event log in conversation kernel store
- Retrieval service → chunk ingestion and scoped retrieval
- Scout service → retrieval + tool-gate authorization
- Orchestration service → retrieval + quality loop
- Artifact proposal service → tool gate for mutating accept action

## Top 10 integration risks
1. In-memory state resets on process restart (needs DB persistence in Phase 2).
2. Route name collision risk with future conversation APIs.
3. No tenant-bound enforcement yet in new routes.
4. Minimal evaluator contract may under-score nuanced drafts.
5. Existing approval pipeline is not yet hard-linked to proposal accept endpoint.
6. Retrieval scoring is keyword-based only.
7. No async queue isolation for heavy plan/execute requests.
8. Tool manifest defaults may need per-workspace policy inheritance.
9. Scout promotion currently stores only flag, not plan step injection.
10. Cross-client workflow assertions require richer scenario fixtures.

## Reuse vs build decisions
- **Reuse**: existing Express mount pattern in `server/index.ts` and established governance philosophy.
- **Build (additive)**: lightweight conversation OS kernel modules for tool gating, retrieval, scout, plan/execute, and quality loop.

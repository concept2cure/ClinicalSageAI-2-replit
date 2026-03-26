# Master Plan — Concept2Cure Conversation OS Layer

## Ordered work graph
1. Scout discovery (read-only map)
2. Planner contracts and merge ordering
3. Parallel implementation tracks (artifact proposal, retrieval, tool gate, scout, orchestration, quality loop)
4. Integrator pass
5. Evaluator + validation matrix

## Merge order used
1. Shared types + kernel store
2. Retrieval service
3. Tool gate service
4. Scout service
5. Orchestration + quality loop
6. Artifact proposal accept/reject + version tracking
7. Route integration + tests + docs

## Serialization constraints
- Shared type definitions must land before services.
- Route wiring must happen after services compile.
- Evaluator matrix produced only after tests run.

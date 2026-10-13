# AnA project and source admission — 2026-10-13

This increment follows verified merged push
`a64d422ac14c5eb177734c18f4224e0517bc50b4`. It addresses the reproduced
submission-planner read bypass: an organization member denied by canonical
private-project sharing could previously receive private Vault standing and
document titles through AnA.

## Implemented boundary

`server/services/ana/project-scope-admission.ts` resolves an explicit numeric
project or program UUID, verifies tenant ownership and a unique program anchor,
then reads the actor's current organization membership and role. The actor and
organization must both be active. Permission uses the existing canonical
project-sharing helper, including owners, current members, organization
management and live review assignments. Prompt roles and stale token claims
grant no access. Missing, conflicting or unreadable explicit scope cannot
become an organization-wide conversation.

Both canonical chat entrances admit the project before threads, context,
model work or the streaming intelligence-answer fast path. Streaming access
verification has a three-second deadline; timeout refuses the turn. The
submission planner independently repeats current access verification before
reading Vault facts, including when called directly through its registered
handler. Static IND reference pages, static plan-step guidance and no-project
plans remain independent of project-permission queries.

The routes also call the lead-owned exact-source/upload admission helper before
selected attachments can be read. Uploaded metadata and byte readers receive
the pinned actor. Actual HTTP tests prove that an accessible public project A
does not authorize a selected private source or upload from project B. An
upload's original creator does not override its recorded private parent.

## Local verification

The complete focused command passed **134 tests across nine files**:

| Tests | Files | Cases |
| --- | ---: | ---: |
| Actual SQL project admission | 1 | 28 |
| Actual registered submission planner with SQL | 1 | 11 |
| Actual HTTP streaming and JSON entrances with SQL permission fixtures | 2 | 18 |
| Existing catalog, plan, scope propagation, latency and tool carry-over regressions | 5 | 77 |

Evidence:

- [focused-tests.txt](focused-tests.txt): final nine-file pass.
- [planner-red.txt](planner-red.txt): before the fix, six permission-refusal cases failed while three static/allowed controls passed.
- [stream-red.txt](stream-red.txt): before route admission, seven refusal cases failed while the no-project control passed.
- [focused-lint.txt](focused-lint.txt): zero errors; 41 existing large-route warnings. The new helper and new test files are clean.

The final `npx vitest run` included:

- `server/services/ana/__tests__/project-scope-admission.pglite.test.ts`
- `server/services/ana/__tests__/submission-plan-private-access.pglite.test.ts`
- `server/routes/ana-ri/__tests__/stream-project-private-access.pglite.test.ts`
- `server/routes/chat/__tests__/send-message-private-project.test.ts`
- `server/services/ana/__tests__/regulatory-knowledge-tools.test.ts`
- `server/services/ana/__tests__/ind-pyramid-knowledge-tool.test.ts`
- `server/routes/ana-ri/__tests__/stream-project-anchor.test.ts`
- `server/routes/ana-ri/__tests__/stream-context-latency.test.ts`
- `server/routes/ana-ri/__tests__/stream-tool-carry-over.test.ts`

The SQL cases use PGlite. HTTP requests run the actual handlers with existing
test seams for authentication, model/control services and downstream context
assembly; permission checks use actual SQL. No external model request was made.
This evidence is local regression verification, not production qualification.
The broader project/Vault HTTP parent-read boundary remains a separate lead-owned
increment; this document claims only the tested AnA boundary.

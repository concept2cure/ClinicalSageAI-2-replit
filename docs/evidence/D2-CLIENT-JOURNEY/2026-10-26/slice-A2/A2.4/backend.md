# A2.4 — retire the separate AnA project writer

## What already exists

`server/services/ana-ri/command-executor.ts` separately created PM-spine projects,
registered and dispatched `create_project`, and exported the implementation via
`ana-ri/index.ts`. It did not create the canonical regulatory program, outline
and accepted anchor. `command-rbac.ts` and the AnA launch inventory admitted the
command. The Projects wizard and `POST /api/c2c/projects` already supply that
complete creation path, including explicit workspace and filing checks.

The existing action registry/bus can reach the wizard. First-contact guidance in
`ana/client-journey.ts`, `ana/agentic-workflow-tools.ts` and
`ana-ri/onboarding-tour.ts` instead suggested the `project_setup` interview.
That interview is retained for configuring an existing project. Its existing
flow aliases and the discovery-phase biotech program spine remain unchanged;
those are existing-project configuration shortcuts, not a second creator.

The parent inventory records fresh creation/caller searches and deleted history.
The code and tests here extend those existing boundaries rather than introduce
another writer or client workflow.

## Result

- Removed `createProject`, its command union member, registry/handler entries,
  barrel export, RBAC metadata and launch-inventory entry.
- First-project journey/tour/tool guidance now names `navigate_to` (`projects`)
  and `act_on_screen` (`projects.new-project`). The person reviews the wizard
  and presses Create project; no server command substitutes for that step.
- A missing command handler now returns an explicit `COMMAND_NOT_REGISTERED`
  failure. Names parsed from command blocks are untrusted strings and reach that
  refusal, so an old block is not silently stripped or converted into a proposal.
  Only own properties of the handler registry are eligible. Registered commands
  retain their identity, tenant-policy, Part 11, RBAC and propose-only ordering.
- The actual governed-action route rejects a stale creation confirmation before
  dispatch or confirmation/execution audit writes. Existing mutations remain
  propose-only; central role and governance-outage tests now use the surviving
  `update_project` command and retain every prior scenario.
- Regenerated the capability manifest for the new journey guidance. Its renderer
  remains a result card: a precise generator override prevents the heuristic from
  mistaking navigation-tool names in guidance for the handler's return type.
  Its existing scope and governance metadata are preserved.

No schema, dependency, route admission or commercial entitlement changed. The
reachable replacement is `Projects.tsx`'s `projects.new-project` action via
`shared/navigation/surface-actions.ts`; the parent evidence records client and
native-browser reachability before publication.

## Verification

| Check | Result | Artifact |
| --- | --- | --- |
| New retirement, HTTP refusal and first-project guidance cases against previous behavior | 7 failed, 79 passed | `backend-red.txt.gz` |
| First affected command/role/governance/partition/journey/HTTP run | 6 suites, 156 passed | `backend-first-green.txt.gz` |
| Final affected command, authorization, partition, chat bridge, proposal, journey, launch and GDPR regressions | 18 suites, 262 passed | `backend-related.txt.gz` |
| Launch-scope gate | Passed | `backend-launch.txt.gz` |
| Affected source/test lint | No errors; 23 existing warnings, plus an ignored generator notice | `backend-lint.txt.gz` |

The green runs overlap and are not additive. The PGlite schema fixture derives
real projects/client-workspaces/regulatory-programs DDL from the Drizzle schema.
The red confirmed-dispatch case actually created one standalone project while
regulatory programs stayed unchanged. After the fix, confirmed and unconfirmed
stale commands and old reply blocks leave both row counts unchanged, with an
explicit refusal and no proposal. This dispatch uses the same `humanConfirmed`
context as governed-action; a separate real Express HTTP test proves that route
refuses the retired command before invoking its mocked executor or audit service.
These are SQL/dispatch and route-boundary checks, not native RLS proof.

The final run includes:

```
ana-ri/__tests__/project-tools-use-the-real-projects-schema.test.ts
ana-ri/__tests__/command-rbac.test.ts
ana-ri/__tests__/ana-governance-fail-closed.test.ts
ana-ri/__tests__/propose-only-partition.test.ts
ana-ri/__tests__/command-registry-consistency.test.ts
ana-ri/__tests__/confirm-tier.test.ts
ana-ri/__tests__/chat-doors-propose-only.test.ts
ana-ri/__tests__/ana-action-block-proposal.test.ts
ana-ri/__tests__/action-prompts-propose-only.test.ts
ana-ri/__tests__/proposal-provenance.test.ts
ana/__tests__/client-journey.test.ts
ana/__tests__/platform-command-bridge.test.ts
ana/__tests__/ana-launch-scope-execution.test.ts
ana/__tests__/ana-launch-scope.test.ts
ana/__tests__/cmc-launch-scope-flip.test.ts
server/routes/ana-ri/__tests__/governedActionConfirmTier.test.ts
server/routes/ana-ri/__tests__/post-processing-action-block-proposal.test.ts
server/__tests__/routes/ana-ri-gdpr-commands.test.ts
```

Paths beginning `ana` above are under `server/services`. The repository ignores
the generator in its ESLint configuration; the lint result does not claim that
ignored script was checked. No warning/type/SQL-interpolation allowance grew.

# Recorded project context — backend qualification

The [frozen contract](contract.md) reaches the existing profile reader from the current UUID Projects router. Implementation files are `server/routes/c2c/project-recorded-context.ts`, its import/mount in `projects.ts`, and the bounded extension to `server/services/intelligence/project-intelligence-service.ts`. No profile writer, memory store, role policy, migration, provider operation or autonomous action was added.

## Observed checks

| Observation | Result | Retained output |
| --- | --- | --- |
| Original route/reader fail-first | 18 failed, 3 passed / 21 | [backend-fail-first.txt](backend-fail-first.txt) |
| Legacy instruction-field fail-first | 1 failed, 25 skipped by explicit name filter | [backend-instructions-fail-first.txt](backend-instructions-fail-first.txt) |
| Final recorded-context HTTP/SQL successor | 26 passed / 26, exit 0 | [backend-context.txt](backend-context.txt) |
| Retained intelligence/context before formatter correction | 44 passed / 44 in 5 files, exit 0 | [backend-retained-context.txt](backend-retained-context.txt) |
| Existing formatter fail-first | 7 new failures, 26 existing passes in the actual context suite | [formatter-fail-first.txt](formatter-fail-first.txt) |
| Final retained intelligence/context after formatter correction | 51 passed / 51 in the same 5 files, exit 0 | [backend-formatter-retained.txt](backend-formatter-retained.txt) |
| Settings/profile/device/setup/access/intake after initial context mount | 159 passed / 159 in 8 files, exit 0 | [backend-retained-settings.txt](backend-retained-settings.txt) |
| Settings/context/retained callers after incoming CSR integration | 185 passed / 185 in 9 files, exit 0 | [backend-csr-integrated.txt](backend-csr-integrated.txt) |
| Scoped lint | Exit 0; zero errors, one unchanged existing warning | [backend-lint.txt](backend-lint.txt) |
| Same existing service at catch-up base | Exit 0; identical `enrichProjectIntelligence` complexity-19 warning | [backend-service-lint-baseline.txt](backend-service-lint-baseline.txt) |

The original 21-case fail-first ran before the UUID route or reader extension. Four later null/read-only/legacy-parent boundaries and one legacy-response-shape case produced the final 26-case suite. The instruction-specific fail-first checks own-property absence and failed while the additional column was unconditionally projected. These phases are not additional unique-test totals.

The 159-case regression was observed after mounting the context route, before the subsequent default-safe instruction projection correction. The final 26-case and 44-case runs followed that correction. The settings component is 37 cases; the same seven retained caller files now contain 122 cases, including the current branch's added client-aware-card projection case. This is a repetition of [settings recovery](../../D2-PM-SETTINGS/2026-10-30/README.md), not an additional 159 unique cases.

The later formatter correction replaces the 44-case retained observation with the 51-case successor over the same five paths; do not add both counts. Its changed `context-enrichment-program-project.test.ts` contains the original 26 cases plus seven meaningful populated/malformed/slice/instruction cases. The old formatter passed the original 26 and failed all seven additions, proving the previously empty note fixtures had missed the defect.

The final incoming CSR integration changed one bound backend dependency, `server/services/csr/project-scope.ts` (`13be18d3d..84853e7bc`). The nine-file successor reran settings37 + recorded-context26 + the retained122 as one 185-case cohort; it recertifies those same cases and is not added to the earlier 26/159 observations. Vitest completed in 34.34 seconds with no failures. No runtime or test source was edited during this review.

Bounded dependency review found no PM admission change: current Projects admission passes raw request/owned-transaction `{query}` executors to `readCsrProjectActor`, retaining the same literal active-user, current-membership and active-organization queries, exactly-one-membership refusal, trimmed current role, and `FOR SHARE OF ou,u,o` reservations. PM does not opt into read-only pending-deletion tenants. The incoming Drizzle branch now uses the existing `queryableFromDrizzle` adapter; the separate CSR build/job `forWrite` changes are not invoked by PM's current-program actor helper. No project role, sharing, workspace, audit or unknown-outcome policy was replaced by the integration.

## Qualified behavior

The actual Express Projects router, current actor/program/sharing services, canonical anchor/provenance helpers, request Drizzle client and existing profile reader execute against PGlite SQL. Reads pin the admitted numeric anchor and organization, verify workspace ownership/claims, and repeat current actor/program/anchor/workspace verification after loading the profile. Mid-read role, membership and workspace changes refuse the response. Private/revoked/foreign/unanchored records, missing request context, store failures, duplicate profiles and malformed stored JSON supply no successful profile body. Nullable legacy workspace and inactive owned workspace retain the existing policies.

GET performs only reads: saved profile snapshots and row transaction identities remain unchanged, no profile is created for an authoritative null result, and separately saved authored instructions remain untouched. The response exposes only the frozen profile fields; null confidence stays null. Non-null malformed list containers or members are refused; historical nullable lists remain empty lists. The memory-count query retains the existing report-state exclusion and now binds profile, project and organization.

The existing summary reader's optional request executor preserves its global default for existing callers. Its fourth argument explicitly opts into profile instructions: default two-/three-argument summaries omit the own `customInstructions` property, preserving the legacy profile/dashboard response shape. Only the currently admitted UUID adapter requests the column, and it requires string or explicit null; omission is unavailable, never inferred absence. Profile instructions remain separate from authored project settings, ProjectSkills and per-user relational notes. No instruction source is merged or substituted.

The retained 44 cases cover recorded memory confidence, actual AnA UUID-to-project resolution, memory confidence wording and the existing readiness projection. Some context tests isolate the profile service with their established seams; the new HTTP/SQL suite separately executes the changed reader. Independent read-only review found no blocker in request executor/provenance, current admission, duplicate refusal, persisted-shape validation or absence of writes.

The unchanged older numeric intelligence adapters retain their existing policy and response shape. They are not used to reach these cards, and this work does not qualify or redesign those legacy endpoints.

## Existing AnA formatter correction

Product review identified the same saved risks being formatted from unrelated `severity`, `description` and `factor` properties, and decisions receiving an invented `pending` status. The existing `enrichWithProjectSummary` now renders the declared risk/likelihood/impact/mitigation and decision/rationale/date/source fields. It retains question context/priority and insight source/date/recorded confidence, including zero and nullable absence. A single shared `hasProjectRecordedNotes` guard refuses malformed shapes through the existing `project-profile` unavailable-source mechanism; another healthy source still renders. Notes are identified as recorded profile context, not verified evidence or approvals.

This changes only the representation of an existing source. UUID resolution, organization scoping, profile reader arguments, the five-risk/three-other-note slice limits, deadlines, source budget, missing-profile handling and authored-instruction precedence remain intact. Profile custom instructions are not injected. No provider call was made. [formatter-lint.txt](formatter-lint.txt) reports zero errors, five existing large-module warnings outside the corrected function, and zero warnings in the changed test. [formatter-lint-baseline.txt](formatter-lint-baseline.txt) retains the corresponding pre-change module observation. Root owns final compiler/build and source binding after this correction.

## Commands and limits

Commands ran from `/workspace/ClinicalSageAI-2-replit` with Node 22 selected through `PATH=/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/.bin:$PATH` and `NODE_OPTIONS=--max-old-space-size=4096`:

```sh
npx vitest run --config vitest.config.ts server/routes/c2c/__tests__/project-recorded-context.pglite.test.ts
npx vitest run --config vitest.config.ts server/routes/c2c/__tests__/project-recorded-context.pglite.test.ts -t 'omits saved instructions'
npx vitest run --config vitest.config.ts server/services/intelligence/__tests__/project-memory-confidence-not-defaulted.test.ts server/services/ana-ri/__tests__/context-enrichment-program-project.test.ts server/services/ana-ri/__tests__/context-enrichment-program-uuid.test.ts server/services/ana-ri/__tests__/context-enrichment-memory-confidence-recorded-or-unscored.pglite.test.ts server/routes/__tests__/project-home-readiness-is-not-completeness.test.ts
npx vitest run --config vitest.config.ts server/routes/c2c/__tests__/project-settings.pglite.test.ts server/services/c2c/__tests__/programme-profile-write.test.ts server/services/c2c/__tests__/project-setup-projection.test.ts server/routes/__tests__/510k-device-profile-estar-fields.test.ts server/routes/__tests__/rim-date-validation.test.ts server/routes/c2c/__tests__/project-route-access-requestdb.test.ts server/routes/c2c/__tests__/project-access-guard-unavailable.test.ts server/routes/c2c/__tests__/projects-create-anchor.pglite.test.ts
npx eslint server/routes/c2c/project-recorded-context.ts server/services/intelligence/project-intelligence-service.ts server/routes/c2c/__tests__/project-recorded-context.pglite.test.ts
git show 47ce1d3d95eff4a6b3614146cc79b670d7b20645:server/services/intelligence/project-intelligence-service.ts | npx eslint --stdin --stdin-filename server/services/intelligence/project-intelligence-service.ts
```

The fixture derives profile/memory column names and SQL types from the existing canonical Drizzle schema because these push-surface tables have no creator migration. It omits the unused vector column and does not reproduce the full constraint graph; existing program/actor/anchor/sharing tables use retained DDL/migrations. One compatibility case temporarily relaxes the fixture's workspace NOT NULL constraint and restores it afterward. The suite asserts no unexplained schema gaps. Authentication and request ALS are synthetic; PGlite is single-connection. These results do not qualify deployed authentication, native concurrency/RLS, vector retrieval, cryptographic auditing, model acceptance or live customer behavior. Root owns final UI/native settings/build/whole-program TypeScript/source bindings and normal direct publication. This worker made no Git mutation, dependency/schema-source change, provider call or whole-program check.

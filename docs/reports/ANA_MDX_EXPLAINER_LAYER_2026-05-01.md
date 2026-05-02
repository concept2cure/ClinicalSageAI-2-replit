# AnA → MDX explanatory + onboarding + proactive layer

**Branch:** `concept2cure-v2`. **Author:** Claude Code. **Date:** 2026-05-01.

Companion to `docs/reports/ANA_MDX_TOOL_LAYER_2026-05-01.md` (the
governed-mutation tool layer). This pass closes the user-asked gap: AnA
should be able to explain the MDX module end-to-end, onboard a new
tenant, take requested actions, stay context-aware, and surface
regulatory issues proactively.

## Pre-build duplication audit

Before writing anything I confirmed the following did NOT exist in the
codebase, and the following DID and were extended rather than replaced:

| Existing surface                                          | Decision                                          |
|-----------------------------------------------------------|---------------------------------------------------|
| `server/services/intelligence/proactive-commitment-engine.ts` (739 LOC) | **Extended (peer)** — generic ProjectCommitment-shaped engine. New `mdx-proactive-signals.ts` reads MDX-specific tables and emits the same envelope. |
| `server/services/ana-guidance-executor.ts`                | **Reused** — already routes high-confidence guidance to the command dispatcher; my MDX command handlers plug in via dispatch. Nothing to add. |
| `server/services/ana-ri/chat-context-builder.ts`          | **Extended** — adds an MDX block to the assembled system prompt when `module_context.workstream === 'mdx'`. |
| `server/routes/ctd-onboarding.ts`                         | **Reused as pattern** — CTD/IND-pathway onboarding. MDX uses a thinner pure-function evaluator (no parallel state machine, no new DB table). |
| `client/src/concept2cure/components/onboarding`           | UI lives there; this PR is server-side only. |
| `server/src/services/reg/playbook.ts`                     | RPI scoring + recommendation cards — not regulation reference. No overlap with `MDX_REGULATIONS`. |
| `server/services/knowledge-graph.ts` etc.                 | Clinical / academic graphs — not MDX-surface reference. No overlap. |

## Architecture

```
chat request body (module_context.workstream === 'mdx')
     │
     ▼
chat-context-builder.ts
     │
     ├─ assemble base system prompt (existing flow)
     ├─ call buildMdxContextBlock(pool, ctx)  ◄── NEW INTEGRATION POINT
     │       │
     │       ├─ getSurface(activeNav)          ──► mdx-knowledge-pack.ts
     │       ├─ getMdxOnboardingMilestone()    ──► mdx-onboarding-milestone.ts
     │       └─ buildMdxProactiveSnapshot()    ──► mdx-proactive-signals.ts
     │
     └─ append MDX block to system prompt
              │
              ▼
       LLM generates response with full MDX awareness
```

When the user issues a chat in any MDX surface, the AnA system prompt
now carries:

- **Active surface block** — purpose, when-to-use, common questions,
  affordances. AnA grounds answers to where the user actually is.
- **Onboarding milestone** — `no_program | no_predicates | predicates_set
  | authoring | presub_in_flight | preflight_ready | transmitted`,
  computed from live state. AnA frames advice at the right step, not
  generic onboarding copy.
- **Proactive alerts** — Q-Sub deadlines, blocker commitments, stale
  sections, no-response correspondence, evidence-sufficiency low near
  target, program target submission approaching. Sorted by severity.
- **Relevant workflows** for the active surface (W1-W5).
- **Relevant tools** for the active surface, plus when to propose each.
- **Governed-mutation contract reminder** — two-phase invocation, never
  fabricate a reason, never propose ESG transmit proactively.

## Files shipped

| File                                                          | Purpose                                                                                |
|---------------------------------------------------------------|----------------------------------------------------------------------------------------|
| `server/services/ana-ri/mdx-knowledge-pack.ts`                | Surfaces (7) + Workflows (5) + Regulations (7) + Tools (15) reference data. Pure data, no DB, no LLM. |
| `server/services/ana-ri/mdx-proactive-signals.ts`             | Reads MDX tables and emits 6 alert kinds. Same envelope shape as `ProactiveCheckResult`. Tenant-scoped. Read-only. Fail-soft per query. |
| `server/services/ana-ri/mdx-onboarding-milestone.ts`          | Pure-function evaluator over live state. 7 milestone ids ranked by signal counts. No new tables. |
| `server/services/ana-ri/mdx-context-resolver.ts`              | Composes the four streams into a Markdown block. Gracefully degrades when downstream throws. |
| `server/services/ana-ri/chat-context-builder.ts` (modified)   | Appends the MDX block to the system prompt when `workstream === 'mdx'`. |

## Behavioral changes for AnA

When the user is on `pre-sub` and has 3 open blocker commitments, AnA's
prompt now contains:

```
### Active surface: Pre-Sub manager
Purpose: Manages the conversation with FDA before filing — Pre-Subs, SIRs, ...
When to use: Open this whenever you have an in-flight FDA conversation ...
Top affordances: List of every Q-Sub with stage + days-in; ...
Questions users commonly ask here: What did FDA say in our last Pre-Sub? / ...

### Onboarding milestone: Pre-Sub conversation with FDA is in flight.
Next step: When FDA responds, capture each commitment. After updating the
relevant eSTAR section, mark the commitment as rolled-in.

### Proactive alerts (3)
- ! **q_sub.commitment_blocker_open** — Open blocker commitment cm-1142-3 on
  OR-801 (Q251142): "Amend SAP to pre-specify hypo-MARD subgroup". ...
- ! **q_sub.commitment_blocker_open** — Open blocker commitment cm-844-1 on
  OR-801 (Q250844): "Add lot-traceability statement and supplier audit ...
- · **estar.section_stale** — eSTAR §11 (Performance) hasn't been edited in
  18 days; current status "drafting", 65% complete.

### Relevant workflows
- **W3 Pre-Sub cycle** — File a Pre-Sub, receive FDA feedback, capture ...

### Tools you can propose here
- `q_sub.create` — Create a new Pre-Submission, ...
  Propose when: When the user has a question for FDA about predicate strategy ...
- `q_sub.commitment.set_rolled_in` — Toggle the rolled-in flag ...
  Propose when: When the user has just updated an eSTAR section that ...

### Governed-mutation contract (always follow)
Every state-mutating tool requires a two-phase invocation: ...
```

If the user just says "What's the status here?" AnA can:

1. Read the milestone ("you're in W3 Pre-Sub cycle, stage `feedback`").
2. Surface the open blockers without being asked.
3. Suggest the right next tool (`q_sub.commitment.set_rolled_in`) when
   the user mentions they've updated §11.
4. Refuse to invoke ESG transmit unless the user explicitly says
   `confirm: yes-transmit` with a 30+ char reason.

## Tests

| File                                                                | Coverage                                                                 |
|---------------------------------------------------------------------|--------------------------------------------------------------------------|
| `__tests__/mdx-context-resolver.test.ts`                            | Active-surface render, unknown nav, alert sorting + truncation, includeProactive=false short-circuit, fail-soft when downstreams throw. |
| `__tests__/mdx-onboarding-milestone.test.ts`                        | Each milestone id reached by the right signal counts; fail-soft on per-query DB errors. |

## Multi-turn confirmation (added)

**Problem closed.** Without this, a user has to re-state every action
parameter in the same turn that contains `confirm: 'yes'` + `reason`.
That's awkward in chat ("yes, do it because X" should suffice).

**Solution.** A small in-memory store keyed by `(organizationId, threadId)`
holds the most recently proposed action's params for 10 minutes:

```
Turn 1 — user: "Mark commitment cm-1142-3 as rolled in"
         AnA emits: { command: 'q_sub.commitment.set_rolled_in',
                       params: { commitmentId: 'cm-1142-3', rolledIn: true } }
         Gate sees no confirm; stashes params; returns
           confirmation_required (data.pendingActionToken: 'pa-abc123').

Turn 2 — user: "yes — SAP was amended per FDA Pre-Sub Q251142 §11.4"
         AnA emits: { command: 'q_sub.commitment.set_rolled_in',
                       params: { confirm: 'yes', reason: 'SAP was amended ...' } }
         Gate looks up the pending action by (org, thread), merges the
         stashed { commitmentId, rolledIn } in, then runs the rest of
         the validation. Mutation executes.
```

**Tenant safety.** The store is keyed by `(organizationId, threadId)`.
A pending action stashed under tenant A cannot be retrieved by tenant B
even if thread ids collide.

**Files:**
- `server/services/ana-ri/mdx-pending-actions.ts` (TTL store, fail-safe LRU bound).
- `server/services/ana-ri/mdx-tool-policy.ts` (merge-then-validate at the top of the gate).
- `CommandContext.threadId` added so the gate has the key.

## Anti-fabrication soft signal (added)

The gate now flags whether the reason cites a concrete artifact and
exposes the boolean as `gate.reasonReferencedArtifact`. Handlers stamp
the audit row with this so an auditor can filter for low-quality
justifications. **Soft signal, not a refusal** — too aggressive a
refusal frustrates legitimate flows.

Pattern bank: section numbers (§6.1), Q-numbers (Q251142), K-numbers
(K212284), commitment codes (cm-1142-3), ISO / ASTM / CFR standards,
ISO dates, "Mar 14, 2025" dates. See `ARTIFACT_REFERENCE_PATTERNS` in
`mdx-tool-policy.ts`.

The system-prompt block reminds AnA: *the reason must be the user's
explanation, never fabricated; cite a concrete artifact when the user
mentions one*. Pulls AnA toward audit-strong reasons without breaking
chat flow when the user is being terse.

## Open follow-ups (none gating)

1. **Native UI rendering of the resolver payload.** The resolver returns
   both a Markdown block AND a structured `payload`. Today only the
   Markdown is consumed (by AnA's prompt). The Anya rail UI could render
   the alerts as inline cards using `payload.alerts`. Owned by the
   Claude Code stream.
2. **Workflow-specific drilldowns in the prompt.** Today the prompt
   lists relevant workflows by id; on a follow-up the prompt could
   inline the steps when the user asks "how do I run W3?". Marginal
   gain; defer.
3. **Back-fill `reasonReferencedArtifact` into all 14 governed handlers.**
   `q_sub.create` is the canonical example shipped in this PR; the
   remaining handlers each need ~3 LOC to forward the flag. ~30 LOC total.
4. **Redis-backed pending-action store.** In-memory works for BETA
   single-process; GA needs Redis so confirmations survive worker
   restarts.
5. **`mdx-proactive-signals.ts` correspondence query** assumes a
   `correspondences` table with `response_status` and `urgency`. Some
   tenants may have a slightly different schema; the query is wrapped
   in fail-soft try/catch. If the gap surfaces in production, we extract
   to a service-side helper.

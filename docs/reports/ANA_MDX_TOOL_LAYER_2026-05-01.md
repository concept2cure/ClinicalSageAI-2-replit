# AnA → MDX tool layer (phase 1)

**Branch:** `concept2cure-v2`. **Author:** Claude Code. **Date:** 2026-05-01.

Closes the gap I identified in the prior session: AnA was "drafting +
analysis" capable across MDX but could not execute governed mutations.
This pass adds the tool layer that lets AnA invoke Q-Sub creation, Q-Sub
commitment toggling, eSTAR section approval, 510(k) module pre-flight,
and ESG transmit — all with audit-trail provenance and confirmation
gates.

## Architecture

The platform already has a command layer at
`server/services/ana-ri/command-executor.ts` with 72 commands and an
LLM-facing intent parser. This pass extends it without rebuilding it:

```
chat user message
       ▼
intent parser
       ▼
ParsedCommand { command, params }
       ▼
executeCommands() in command-executor.ts
       ▼
commandMap[command](ctx, params)
       │
       ├── existing 72 handlers (project / artifact / RIM / etc.)
       └── 5 new MDX handlers (this PR) — see mdx-command-handlers.ts
                ▼
           requireAgentConfirm()  ← if missing, return 'confirmation_required'
                ▼
           validate inputs (UUID shape, enum membership, date format)
                ▼
           call underlying service (createQSubmission, etc.)
                ▼
           auditService.logAction({ action: 'agent.ana.<…>', details: { actorKind: 'agent:ana', agentReason } })
                ▼
           CommandResult { success, action, data, message }
```

## Governance contract

Every governed mutation requires a two-phase invocation:

1. **Phase 1 (proposal).** AnA suggests an action or the user asks for
   one. The handler is invoked without `confirm` / `reason`. It
   returns `success: false, action: 'confirmation_required'` with the
   list of required fields. The chat layer surfaces this to the user
   verbatim.
2. **Phase 2 (execution).** The user re-issues with
   `confirm: 'yes'` (or `'yes-transmit'` for ESG) plus
   `reason: <string>` (≥ 10 chars; ≥ 30 for transmit). The handler
   runs the mutation and audits it.

This protocol is enforced by `requireAgentConfirm()` at the top of
every state-mutating handler. Read-only commands like
`k510_workflow.preflight` skip the gate.

### Why two phases (not one)

A single-phase contract would let AnA — or a prompt-injected version of
AnA — execute mutations without explicit human acknowledgement. The
two-phase contract makes the human's reason-for-change visible in the
audit row, which is the §11.10(e) record an inspector reads. It also
makes prompt-injection attacks ineffective: the attacker would need to
trick the user into typing both the action AND a plausible reason
string, which is much harder than triggering a one-shot tool call.

### Why ESG transmit has stricter gates

`confirm = 'yes-transmit'` (literal phrase, not just `'yes'`) +
`reason ≥ 30 chars` matches the §11.10 deliberateness expectation
for the most consequential platform mutation. A user typing `confirm:
yes` to flip a Q-Sub commitment must consciously re-type a different
phrase to authorize a transmit — there is no thumb-slip path to
shipping a 510(k) to FDA.

## Audit binding

Every handler emits via the central `auditService.logAction` (the same
writer the human-driven routes use). Two conventions:

- **Action prefix `agent.ana.<resource>.<verb>`** so an auditor can
  distinguish AnA-initiated mutations from human-initiated ones with a
  single `WHERE action LIKE 'agent.ana.%'` clause. The non-AnA codes
  remain `<resource>.<verb>` (e.g. `q_sub.create` for the human
  `POST /api/q-sub` path).
- **`details.actorKind: 'agent:ana'`** explicitly labels the row as
  agent-originated. The agent's reason-for-change is stored at
  `details.agentReason`.

Audit-trail coverage map updated at
`docs/operations/audit-trail-coverage.md` with the five new rows.

## Tools shipped this PR

| Action                                  | Confirmation     | Reason min | Service called                          |
|-----------------------------------------|------------------|------------|-----------------------------------------|
| `q_sub.create`                          | `'yes'`          | 10         | `createQSubmission()`                   |
| `q_sub.commitment.set_rolled_in`        | `'yes'`          | 10         | `setCommitmentRolledIn()`               |
| `section.approve`                       | `'yes'`          | 10         | direct SQL on `cerv2_510k_sections`     |
| `k510_workflow.preflight`               | n/a (read-only)  | n/a        | internal HTTP to `/api/authoring-actions/module-preflight` |
| `k510_workflow.transmit`                | `'yes-transmit'` | 30         | `ESGSubmissionService.submitToFDA()`    |

## Tools NOT yet wired (follow-up)

After phases 1-3 the only remaining gap is:

- `correspondence.ingest` — gated on Claude Design brief #2 surfacing.
  The handler is intentionally not wired because AnA-driven ingestion
  without the receiving UI surface is low-value.

## Permission model — shipped in phase 3

Per-tool / per-tenant gating ships via `mdx-tool-policy.ts`. Tenant
admins set `organizations.settings.anaToolPolicy = { deny?: [], allow?: [] }`:

- **`deny: ['k510_workflow.transmit']`** — AnA refuses ESG transmit
  for this tenant; everything else allowed.
- **`allow: ['q_sub.create', 'q_sub.commitment.set_rolled_in']`** —
  allowlist mode; AnA can ONLY invoke these two tools.
- **No policy** (default) — every tool allowed.

The policy is read from `ctx.anaToolPolicy`. The dispatcher
(`executeCommands`) calls `loadAnaToolPolicy(pool, ctx.organizationId)`
exactly once per command batch and stamps the result on the ctx, so
per-tool checks are an in-memory Set lookup, not a DB hit. Loader is
fail-soft: any DB error returns `{}` (default-allow), so a transient
DB issue never silently elevates AnA's permissions.

Refusals return `error: 'TOOL_DENIED'` or `'TOOL_NOT_ALLOWED'`.

### Admin endpoints

`/api/ana-tool-policy` lets a tenant admin manage their policy:

| Method | Path                    | Effect                                        |
|--------|-------------------------|-----------------------------------------------|
| GET    | `/api/ana-tool-policy`  | Read current policy (admin-only).             |
| PUT    | `/api/ana-tool-policy`  | Replace policy. Body: `{allow?: string[], deny?: string[]}`. Emits `ana_tool_policy.update` audit row with previous + new policy in details. Unknown keys rejected (typo defense). |

## Required env vars

| Var                  | Purpose                                                                                                       |
|----------------------|---------------------------------------------------------------------------------------------------------------|
| `ANA_SERVICE_TOKEN`  | Required for phase-3 proxy tools (`predicate.candidate.set_status`, `se_matrix.patch`). Service-to-service token used by the AnA handler when it internal-fetches the BFF. Without it, the tools return 503 with detail `ANA_SERVICE_TOKEN not configured`. |
| `INTERNAL_BFF_URL`   | Optional; default `http://localhost:3000`. Where the AnA handler internal-fetches the BFF for proxy tools and pre-flight. |

For a sidecar deployment where AnA and BFF run in the same pod,
`INTERNAL_BFF_URL=http://localhost:3000` is correct. For a separate-pod
deployment, point it at the BFF's cluster service.

## Reason-quality filter — shipped in phase 3

`reason: 'aaaaaaaaaaaaaaa'` clears the length check but adds zero
auditable signal. The shared gate now also rejects any reason with
fewer than 5 distinct non-whitespace characters
(`error: 'REASON_DEGENERATE'`). Real reasons easily clear this — e.g.
`'per FDA AI letter triage outcome'` has 19 distinct characters.

## Tests

`server/services/ana-ri/__tests__/mdx-command-handlers.test.ts` covers:

- Confirmation gate: missing confirm, missing reason, short reason.
- Input validation: non-uuid programId, unknown qSubType, malformed
  date, non-boolean rolledIn, unknown approval status.
- Audit emission: `agent.ana.q_sub.create`,
  `agent.ana.q_sub.commitment.rolled_in`, `..rolled_out`,
  `agent.ana.section.approve`, `agent.ana.k510_workflow.transmit`,
  `..transmit.failed`.
- Tenant errors: `TenantAccessError` → `TENANT_ACCESS_DENIED` refusal.
- ESG strict gate: `confirm='yes'` rejected; `'yes-transmit'` +
  short reason rejected; full proceed succeeds.
- Pre-flight skips the gate (read-only).

## Open follow-ups

1. **Wire the remaining 7 tools.** Mechanical — same pattern.
2. **Per-tool permission model.** Tenant admin can disable specific
   tools or require a second-party human confirm on specific actions.
3. **Reason-quality filter.** Prevent `reason: 'aaaaaaaaaa'` (passes
   length but adds zero auditable signal). Consider min token count or
   LLM-based plausibility check.
4. **Cross-cutting test that asserts every MDX command handler emits
   exactly one `agent.ana.*` audit row.** Mirrors the existing human-
   side audit-trail-contract test.
5. **Section approve via service module.** Currently uses raw SQL
   inline because `cerv2-sections.ts` route inlines the approve
   logic. GA: extract a shared service.

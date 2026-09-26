# P0-12 — model output ran state-changing AnA commands; the GDPR erasure among them (DP-08, DP-09, High)

**Row:** D5/D6. **Findings:** `docs/security/SECURITY_AUDIT_2026-09-24.md` DP-08 and DP-09. **Plan item:** P0-12.
**This folder covers part 1** (the erasure command). The rest of the item, and why it waits, is under "Not done here".

## What was wrong

`erase_personal_data` (`server/services/ana-ri/command-executor.ts` ~1649–1771) destroys a data subject's personal data
and overwrites `concept2cure_artifacts.content`. In `COMMAND_AUTHORIZATION` (`server/services/ana-ri/command-rbac.ts`)
it was an ordinary `handlerAuthorized` write: `authorizeCommand` passed it on a provable identity and the handler asked
only whether the session was a privacy admin. Nothing asked whether a *person* had chosen this: a model response that
contained the command block ran it through `processCommandsInResponse` with no confirmation, no reason for change and no
re-authentication. It sat in neither Part 11 tier (`server/services/ana-ri/part11-governance.ts`), so the propose-only
partition — the one unconditional gate in front of the handler (`command-executor.ts` ~5310, `ctx.humanConfirmed`) —
did not cover it, and `classifyToolCall` (`server/services/ana/governed-tool-gate.ts`) reported the tool call as
`UNGOVERNED`.

## What is true now

`erase_personal_data` is a Part 11 e-signature tier command: it is in `PART11_GOVERNED_COMMANDS` and
`PART11_ESIGN_COMMANDS`, and its authorization entry carries `minRole: 'manager'`, `requiresReasonForChange` and
`requiresSignature` (the anti-drift guards in `command-rbac.test.ts` couple the three). Because the partition is derived,
it is now in `PROPOSE_ONLY_COMMANDS`, so:

- a model response or tool call containing it is answered with `HUMAN_CONFIRMATION_REQUIRED` / `NEEDS_APPROVAL`
  (tier `esignature`) and nothing runs;
- it runs only through `POST /api/ana-ri/governed-action`, after a person has given a reason for change and been
  re-verified server-side (`reverifySigner`), with the sign-off recorded to the audit trail before execution;
- the handler's own privacy-admin (manager+) check is unchanged and still runs after the confirmation.

No application code outside the two policy files changed; the route, the executor gate and the client sign-off flow
are the existing ones and are generic over the partition.

| | File | Result |
|---|---|---|
| red | `red/erase-before-escalation.txt` | three new cases on the unchanged sources: `isProposeOnlyCommand('erase_personal_data')` is false, `requiresEsignature` is false, `classifyToolCall` says `UNGOVERNED`; 3 failed / 37 passed |
| green | `green/erase-after-escalation.txt` | 135 / 135 across the three files and every suite that imports `part11-governance` or pins the GDPR commands (`command-rbac`, `ana-ri-gdpr-commands`, `ana-governance-fail-closed`, `onboarding-proposals`, `governedActionApprovalTenantPinned`, `mdx-agent-audit-contract`), including the anti-drift guards |

## Part 2 (2026-09-26): every state-changing command is a proposal, in one of three tiers

The DP-08 body. `PROPOSE_ONLY_COMMANDS` (`server/services/ana-ri/command-rbac.ts`) is now every `effect: 'write'`
entry, 53 commands instead of 16. A third tier, `confirm` (`governedTierOf` in `part11-governance.ts`: e-signature set →
`'esignature'`, governed set → `'reason'`, every other write → `'confirm'`), is an explicit human yes with no reason and
no credentials, so AnA keeps drafting the task or the edit and a person clicks once; what goes is the model executing it
unaided. `buildHumanConfirmationRequiredResult` and the streamed `approval_required` frame (`routes/ana-ri/stream.ts`)
carry `data.tier` and ask for a reason only when one is required; `classifyToolCall` returns the tier; `POST
/api/ana-ri/governed-action` (`routes/ana-ri/utility.ts`) accepts any proposed command, requires `confirm: true` for the
confirm tier (no reason, no re-authentication, no sign-off stamped), and keeps the reason and e-signature tiers exactly as
they were. The executor's Part 11 gate, its RBAC gate and the `humanConfirmed` single-writer guard are unchanged.

| | File | Result |
|---|---|---|
| red | `red/every-write-before-fix.txt` | HEAD `8d74e73f`: 36 writes run from model output unaided; no tier exists; 7 failed |
| green | `green/every-write-after-fix.txt` | 198 / 198 across the new suite, the partition, tool-gate, RBAC, fail-closed and Part 11 gate suites, the two task PGlite suites (given the confirmed context where they model the execution after a person's yes, with the §11.50 handler gate still firing after it), the chat-path parity, resilience and single-brain suites |
| green | `green/gates-every-write.txt` | `check:security-patterns`, `ci:sign-ceremony`, `ci:discarded-audit-write` unchanged |

Test: `server/services/ana-ri/__tests__/confirm-tier.test.ts`. One inherited failure, `tests/routes/ana-ri-health.test.ts`
"allows /stream in deterministic mode", fails identically with the committed versions of the five files (the merge of
trunk at `8d74e73f`), and is not this change's.

**The client half** (the next commit): `useGovernedAction.ts` reads `data.tier` from both envelopes (deriving it from
the signature flag for an older server) and now also surfaces `HUMAN_CONFIRMATION_REQUIRED` results, which no client
code read before, so an end-of-turn proposal never rendered; `GovernedActionSignoff.tsx` renders the confirm tier as one
step, the command and a compact key: value summary of its params, no reason field, no credentials, and posts
`{ command, params, confirm: true }` (with the run and tool ids when AnA is holding a turn). The reason and e-signature
tiers render as before. `client/red.txt` (four cases fail on the committed components: the proposal is not surfaced, the
confirm tier shows a reason field, confirming posts a reason) and `client/green.txt` (the four sign-off suites pass).

**Follow-ups to part 2** (the AnA run-control lane, 2026-09-26). Each shown failing first against the sources above
(`red/decline-approve-class-before-fix.txt`: 5 of 42 red) and green after (`green/decline-approve-class-after-fix.txt`,
42 / 42):

- **Declining.** Cancel or Escape on a live prompt closed the dialog and told the server nothing, so AnA held the turn
  until the ten-minute pause ceiling — with every write a proposal, most turns. `decision: 'decline'` on a held run is
  audited (`ana.governed_action.declined`), recorded against the run and releases it at once; nothing executes. The
  dialog sends it for a live prompt only; a prompt from a finished turn has nothing waiting.
  Tests: `governedActionConfirmTier.test.ts`, `governed-action-signoff.test.tsx` "declining".
- **The approve class keeps a reason.** `governedTierOf` returned `confirm` for `section.approve`,
  `post_market.document.approve` and `post_market.document.supersede` — in neither Part 11 set, otherwise gated only by
  the model-written `params.confirm` — so an approval ran on one click with nothing recorded about why. The tool gate
  had always shown them as the reason tier; they are the reason tier again. Tests: `confirm-tier.test.ts`,
  `governedActionConfirmTier.test.ts`.
- **`governedActionApprovalTenantPinned.test.ts` was red on trunk** after part 2 (3 of 4): its fixture was a made-up
  `lock_section` behind mocks of `requiresPart11Signoff`, which the route no longer consults. The fixture is a real
  reason-tier command (`update_milestone`); the tenant-binding assertions are unchanged.
- The stream's `approval_required` frame is built by `buildHumanConfirmationRequiredResult`, so its tier and wording
  are the builder's rather than a hand copy that had already drifted from it.

Still open, beyond DP-09 below: the five direct-mutator tools (`save_document_to_vault` and siblings are not commands,
so the partition does not reach them), and sign-off prompts on the non-SSE chat paths (`chat/send-message`,
`ana-intelligence` return the proposal as a tool result those clients do not render as a prompt).

## Not done here

- **Every state-changing command propose-only (the DP-08 body of P0-12)** — done in part 2 above (server and client). The original note follows for the record. `PROPOSE_ONLY_COMMANDS` still admits the
  ordinary writes the model runs unaided (`update_artifact`, `update_project`, `export_document`, `create_task`, …; 53
  `effect: 'write'` entries in total). Widening the partition is one line in `command-rbac.ts`, but a widened partition
  is only usable if a proposal can then be executed, and today `POST /governed-action`
  (`server/routes/ana-ri/utility.ts:428`, `requiresPart11Signoff`) refuses any command outside the two Part 11 tiers,
  so a plain write would become impossible rather than confirmed. The change therefore needs, in one commit: a third
  tier in the route (`confirm`: an explicit human yes, no reason or re-authentication, still stamped `humanConfirmed`
  and audited), `classifyToolCall` returning that tier, the client sign-off surface rendering a confirm-only step
  (`useGovernedAction.ts`, `SignoffList.tsx`), and the executor's `buildHumanConfirmationRequiredResult` carrying the
  tier. Three of those files are inside other lanes' 24-hour windows today (`utility.ts` until 19:52 UTC,
  `command-executor.ts` until 21:18 UTC, `post-processing.ts` until 18:10 UTC on 2026-09-25); the design above is the
  hand-off.
- **The erasure handler's swallowed-error bug (DP-09).** `command-executor.ts` ~1694–1737 runs `.catch(() => ({ rows: [] }))`
  inside `BEGIN … COMMIT`, so a failed statement aborts the transaction, `COMMIT` rolls it back silently and the handler
  reports `success: true`; it also overwrites artifact content with no legal-hold or retention check and writes no
  chained audit row. `server/services/global-compliance.ts:571-596` documents the same bug as fixed there. The fix
  is to route the command onto that governed GDPR path; `command-executor.ts` is inside another lane's window until
  21:18 UTC. With this commit the bug is reachable only by a re-authenticated privacy admin who typed a reason, which is
  the containment available today, not the fix.

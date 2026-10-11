# W3 / D4 — AnA conversation continuity and useful recovery

The founder requested continued improvements to AnA's responses and experience,
then clarified the goal: AnA should feel like the assistant in this conversation.
This pass addresses concrete continuity and response-delivery failures supporting
that goal. It does not claim parity with another assistant or change model policy.

## Reproduced defects and corrections

- A slow older conversation load could replace a newer selected conversation,
  including its thread ID. A failed switch could silently retain the old history.
  History requests now have ownership and cancellation; sending is blocked while
  the selected history is loading or failed. Retry and New conversation provide
  explicit recovery, and attempted sends retain the person's draft.
- A command-only reply legitimately cleaned to an empty string, but a truthiness
  fallback restored raw command JSON. Preserving the cleaned result lets the
  existing confirmation/refusal explanation reach the displayed answer,
  persistence, and verification. Existing command permissions and approval gates
  remain authoritative.
- The shell rail now displays history loading/failure and preserves its draft and
  attachments while sending is blocked. The regression fails before this change
  and passes afterward; adjacent attachment, action, and context tests also pass.

Red/green evidence and scoped details are filed under `client/`, `server/`, and
`rail/`. The final focused and adjacent runs cover 119 passing tests (53 chat/history,
37 rail, 8 additional shell destination, and 21 server tests). Repository gates
passed, including zero added lint warnings; results are recorded alongside this file. Full local TypeScript
still exceeds this environment's memory, under the previously approved exception;
the unchanged GitHub TypeScript gate verifies publication.

## Prior publication verification

The preceding commit d669c6f0033bcb9dfef47a34a9ba28d4ae8d9e70 passed the full
TypeScript/ESLint workflow and Tier 5 Browser Smoke:

- https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37400265708
- https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37400265580

Broader CI is not fully green: the dependency-risk audit failed on the unchanged
lockfile. This pass adds no dependency and does not suppress those findings.

## Limits

These are deterministic code-path reproductions with controlled I/O. No live
tenant/provider benchmark or end-to-end production demonstration is claimed.
The launch row D4 remains open pending its full required evidence.

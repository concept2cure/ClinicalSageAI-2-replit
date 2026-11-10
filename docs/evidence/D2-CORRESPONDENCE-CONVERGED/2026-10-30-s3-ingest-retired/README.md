# P-39 step 3, S3: AnA's `correspondence.ingest` is retired; a person records the letter in the inbox

Row: D2 (W1). Design: `docs/design/CORRESPONDENCE_CONVERGENCE_2026-10-29.md`, sections "S3 is blocked" (2026-10-29)
and "S3 decided" (2026-10-30). Decided under the founder's delegation.

## What already exists

| Piece | Path | State |
|---|---|---|
| The command | `correspondenceIngest`, `server/services/ana-ri/mdx-command-handlers-phase3.ts` | It proxied over HTTP to `/api/regulatory-correspondence/correspondence/intake` with an `X-Service-Token` that no server code verifies. So it failed in every deployment: 401 without a session, 503 when the token is unset. It also wrote the family P-39 step 3 retires. |
| Recording a letter | Communication → Log agency communication (`POST /api/concept2cure/projects/:id/agency-communications`, `communication-center.ts`) | Governed, with a reason and an audit entry, and admitted by the project. In launch scope. |
| The letter's questions | G3, `GET …/question-proposals` (`letter-question-proposals.ts`) | Proposed from the letter's text without a model; a person records each. |
| Past audit rows | `mdx-explain-audit-row.ts` | Still explains `agent.ana.correspondence.ingest` rows. Kept. |

## Why it is retired, not ported

- **Porting needs an AnA-wide change.** The inbox create runs under request-bound project admission (actor, role and
  client workspace, from `requireProjectAdmission(req, …)`). `CommandContext` carries none of them
  (`server/services/ana-ri/command-executor.ts`). Reproducing admission outside a request is a change to every AnA
  command, owned by the AnA and security lanes.
- **Nothing is lost.** The command never worked in a deployment, so no deployed user has the capability. The person's
  path is governed and already reachable.

## What changed

- **Deleted:** `correspondenceIngest`, its metadata entry and its handler-map entry (`mdx-command-handlers-phase3.ts`).
  Its RBAC entry (`command-rbac.ts`), its launch-inventory entry (`ana-launch-scope.inventory.json`) and its
  knowledge-pack mentions (`mdx-knowledge-pack.ts`) go with it.
- **Kept:** `proxyToBff`, which `predicate.candidate.set_status` and `se_matrix.patch` still use. Their finding
  stands, in the device lane.
- **Pin:** `mdx-agent-audit-contract.test.ts` now checks that `correspondence.ingest` is neither a handler nor
  offered metadata.

## Proof

- `green.txt`: the audit-contract suite and the launch-scope inventory suite pass (29 tests).
- `mutation-command-restored.txt`: with `correspondence.ingest` re-registered in the handler map, the pin fails. The
  file was then restored.
- Gates: the ESLint ratchet is net −1, and `ci:launch-scope-api` reports none refused.

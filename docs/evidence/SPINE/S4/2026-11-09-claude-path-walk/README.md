# S4 · AnA's Claude path, walked in the running app (2026-11-09, with one walk repeated 2026-11-12)

Owner: `session_01KZK3jgtmQBgNepqLjXjS3k` (P-105). Launch row D2, workstream W1. Filed on 2026-11-12; the walks of
`01` to `07` were run on 2026-11-09 before the founder's demo, `08` and `09` on 2026-11-12 on trunk `a9b5af1873`.

## What this is, and what it is not

A person's turn with AnA, driven in a real browser against the real server and a real PostgreSQL with RLS on. One
piece is substituted: **the provider.** This container has no Anthropic key, so `ANTHROPIC_BASE_URL` pointed at a
local stand-in that answers as the Messages API does (`mock-anthropic.cjs.txt` for text, `mock-anthropic-tools.cjs.txt`
for a model that calls a tool). The stand-in records what the app sent it, with the key header masked.

- **No call reached Anthropic.** These walks do not show that any real key works, or what Claude answers.
- They show the app's half: what a turn sends, which model it asks for, what the gateway allows, what a tool does
  when a model calls it, and what the person then sees.
- Every reply that begins `MOCK` is the stand-in's text, not a model's.

## What already exists (the path walked)

- `server/routes/ana-ri/stream.ts`: the turn. `server/services/kernel-router.ts`: which model a turn asks for.
- `server/services/ai-gateway/gateway.ts` with `sensitive-placement-policy.ts` and `model-call-scope.ts`: the tier
  wall every call passes.
- `server/services/ana/AnaToolExecutor.ts` `preHandlerRefusal`: the gate before a tool runs (launch scope, rule 0 for
  a sub-agent, the approved-model gate on a governed write, the person's confirmation).
- `server/services/ana/governed-write-tools.ts` `GOVERNED_DRAFT_REQUEST`: the wording that sends a turn to the
  approved drafting model.
- `server/services/ana/sub-agent.ts`: `run_agent`.
- `client/src/concept2cure/v2/surfaces/ConversationThread.tsx` and `client/src/concept2cure/v2/editor/**`: what the
  person sees.

## What the app sent (recorded by the stand-in)

| Turn | Model asked for | Reasoning | Tools offered |
|---|---|---|---|
| A question (`01`) | `claude-sonnet-5`, streamed | `thinking: {type:'adaptive', display:'summarized'}`, effort `medium` | 50 |
| A drafting request (`02`) | `claude-opus-5-5`, streamed | adaptive, `display:'updates'` under beta `thinking-display-updates-2026-08-18`, effort `high` | 50 |

The gateway's decision on both: `tierMax 1`, `ALLOW_INPUT_TIER`, provider `anthropic`, lane `B_frontier`.

## What was seen

| File | What the person did | What the screen showed |
|---|---|---|
| `01` | Asked a question | The answer, streamed |
| `02` | Asked for a draft | The answer, on the approved drafting model |
| `03` | Asked what the FDA reviewer checks | The tool ran; AnA answered from its result. Also run this way: `update_plan`, `global_search`, `list_demo_scripts`, `list_app_screens`, `navigate_to` (`walk-ana-tools.log.txt`) |
| `04` | Asked what the project's files say | `project_knowledge_search` failed: it needs an OpenAI key for embeddings, and none was set |
| `05` | "Start a 510(k) summary document", **before** the fix | The turn went to `claude-sonnet-5`. AnA asked the person to confirm, and after Confirm the write was refused: that model is not approved for governed drafting |
| `06` | The same, **after** the fix | The turn went to `claude-opus-5-5` and the model gate passed. The tool then refused the stand-in's input, which had no sections. So this shows the gate passing, not a save |
| `07` | Asked for a research agent | `run_agent` completed on `claude-opus-5-5`. The child's own attempt to start an agent was refused (`SUB_AGENT_READ_ONLY`). `start_product_demo` also ran (`walk-ana-demo-agent.log.txt`) |
| `08` | 2026-11-12: "Draft a 510(k) summary document", with sections | AnA asked the person to confirm |
| `09` | Confirmed | The draft was saved (`saved: true`) and opened in the editor |

In `walk-ana-draft-gate.log.txt`, the second entry is a governed write asked for on a turn that was not a drafting
request. It was refused; the log cuts the error at `MODEL_N`.

## What the walks found, and what changed that day

| Found | Change (all on trunk) |
|---|---|
| Every AnA turn was refused: a conversation started at Tier 3, which no outside provider may receive | The conversation starts at Tier 1 (`78e07c9ac2`, `d8febe0207`; founder decision 2026-11-09) |
| One email address or phone number refused the whole conversation, although the PII policy only redacts or flags them | The tier wall judges the copy that is sent, after the PII pass (`c5926d7d8b`; founder decision 2026-11-09) |
| Reading a confidential document ended the turn with no explanation | The read is refused at the read, and says why (`45dbe6a695`, `63ed463af6`) |
| "Start" or "Create" a document went to the model that may not draft (`05`) | Both reach the approved drafting model (`367bdf0d21`) |

Found by `09` on 2026-11-12 and fixed the same day: the saved draft read "model not recorded". See
`../2026-11-12-draft-model-recorded/`.

What the same day's code sweep confirmed and what is still open is in `FINDINGS.md`.

## Not established

- On 2026-11-12 the second question of the walk (not a drafting request) was also served by `claude-opus-5-5`. On
  2026-11-09 a question went to `claude-sonnet-5`. The cause was not looked for.
- Latency and cost: the stand-in answers at once, so nothing here measures either.

## Reading the logs

Each entry's first line ends in a label: `reply`, `error-text`, `asks-to-confirm` or `timeout`. It is only which of
the script's waits resolved first. The `error-text` pattern (`could not`, `refused`, `failed` and the like) also
matches words elsewhere on the screen, so it is on nearly every entry and is not a verdict. The text after "screen
after the question" is what was on the screen, cut at a fixed length.

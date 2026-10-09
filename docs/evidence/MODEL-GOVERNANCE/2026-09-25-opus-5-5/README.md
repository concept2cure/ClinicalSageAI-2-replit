# AnA's flagship moves to Claude Opus 5.5 — and a declined request stops reading as an empty answer

**Row:** D4 (model governance: an approved-models entry with a pinned version,
rationale and eval reference). **Decision:** the founder, 2026-09-25 — "what is
best for our product and our clients … especially Opus 5.5 as it speaks more
naturally."

## What changed

| | Before | After |
|---|---|---|
| Flagship slot (`claude-opus-4`, the alias drafting and the unified client pin) | `claude-opus-5`, $5 / $25 per MTok | `claude-opus-5-5`, $4 / $20 per MTok, effort declared `medium` |
| Rung below it | Opus 4.8 | **Opus 5** (new entry `claude-opus-5`, the reviewed primary until today), then Opus 4.8 |
| High-risk approved set | 4 Opus entries | 5 (Opus 5 added as the one validated fallback) |
| A classifier decline (`stop_reason: "refusal"`) | returned as a normal response with empty content | raised as `GatewayModelDeclinedError`; re-run on the next rung; never counted against provider health |
| `docs/LAUNCH_DEFINITION_OF_DONE.md` launch primary | Opus 5 | Opus 5.5, fallback Opus 5 |

Model cards regenerated (`npm run ai:model-cards`): 16 entries.

## Why this model, for this product

From Anthropic's migration guidance for Opus 5.5 (the bundled Claude API
reference, "Migrating to Claude Opus 5.5 → Capability improvements"):

- **Knowledge work:** "much less likely than Claude Opus 5 to state a figure or
  cite a source the inputs don't support"; more detail-oriented on large inputs
  "without more false-positive flags". These are the failure modes a regulatory
  record cannot absorb.
- **Writing:** "clearer prose … says plainly what it did, what it found, and
  what it needs from you, with less jargon and fewer stock phrases" — the voice
  the founder asked for (see the companion prompt change, below).
- **Cost:** 20% lower per token than Opus 5, 60% lower on cache reads; at
  `medium` it "exceeds Claude Opus 5 at `high`" on knowledge-work evaluations.

These are the vendor's measurements, not ours. PQ for this version is **pending**
and the lockfile says so (`pq: { status: 'pending' }`); the accuracy claim rests
on the vendor's evaluation until `server/eval/pq/` executes against it.

## Why nothing else in the request builder had to change

Opus 5.5's breaking changes against Opus 5, checked one by one:

| Change on Opus 5.5 | This codebase |
|---|---|
| Thinking cannot be disabled (`disabled`, `budget_tokens` → 400) | The gateway never sends either to an `adaptive` entry (`applyAnthropicSamplingParams`). |
| Forced `tool_choice` `any` / `tool` → 400 | No caller uses either; every call site sends `auto` or `none` (grep of `toolChoice` in `server/`). |
| Thinking blocks bound to the model and the conversation | AnA's loop replays no thinking blocks — tool turns travel as prose — so there is nothing for the binding check to reject. |
| Effort default is `medium` (Opus 5: `high`) | Declared on the entry (`defaultApiEffort: 'medium'`) so the record states what ran; a person's Fast / Balanced / Thorough choice still wins. |
| Biology and `reasoning_extraction` classifiers join cyber | New: decline handling, below. |

## The decline defect, which predates this change

Opus 5 already runs a cyber classifier. A decline is HTTP 200 with
`stop_reason: "refusal"` and no text; the gateway copied `stop_reason` into
`finishReason` and returned the empty content as an answer. Opus 5.5's biology
classifier makes this matter here: nonclinical toxicology is routine IND work.

Now: raised, not retried on the same model (its classifier would decline again),
not recorded against provider health, and re-run on the next approved rung —
Opus 5, which has no biology classifier. Terminal in two cases:
`reasoning_extraction` (Anthropic: not retried on a fallback) and a decline that
arrives after text was already streamed to the person (a second model would
print a second answer under the first). When every rung declines, the error
says "declined by the safety classifier on …" rather than reporting an outage.

Anthropic also offers a server-side fallback (`fallbacks: "default"`). It was
not used: it may route to a model outside the approved-models lockfile, which is
the thing the high-risk gate exists to prevent. The client-side ladder stays
inside it.

## Verified failing first

- `red.txt` — the two new test files against the previous sources: 11 of 16
  fail (the flagship, the ladder, the lockfile pins, the declared effort, and
  every decline case; on the old code `reasoning_extraction` walked the whole
  ladder in 8.3 s instead of stopping).
- Fault injection on the finished code: removing the two raise sites and the
  route handling turns 5 of the 7 decline tests red; restored, 7 of 7.
- `high-risk-model-approval.test.ts` pinned "exactly the four Opus entries";
  adding Opus 5 to the approved set failed it, as a governance act should. It
  now pins five, and its outage cases fail all three first-party Opus rungs, so
  they still prove drafting refuses rather than falling to Sonnet or GPT-4o.
- `green.txt` — 41 / 41 across the three files; 416 / 416 across
  `server/services/ai-gateway` and `server/services/ai-governance`.

## Not verified here — owed

- **A live call.** This environment has no Anthropic key, so no request has been
  sent to `claude-opus-5-5`. If the account cannot reach it yet, the call fails
  with a 404, which the gateway does not count against provider health, and the
  request is served by Opus 5 — degraded to the previous behaviour, not broken.
  First staging turn: confirm `resolvedModel` begins `claude-opus-5-5`.
- **The biology classifier's false-positive rate on this product's content.**
  Unknown until real nonclinical questions run. Every decline is logged with
  its category; count them in the first week.
- **Progress notes between tool calls.** On Opus 5.5, notes longer than a
  sentence come back as `thinking` blocks, empty unless
  `thinking.display: "updates"` (a beta) is requested. Not enabled here: an
  unverified beta parameter that 400s would fail every flagship call. The
  prompt now asks for one-line notes, which stay text. Enable and verify with a
  key.
- **PQ** for Opus 5.5 and Opus 5 (both `pending`).
- **Private cloud.** The Bedrock and Vertex entries are unchanged (Opus 4.7).
  Opus 5.5 is available on both; moving them is a placement decision for each
  tenant's residency approval, not part of this change.

## Companion change: the prompt was audited for the new model

`79ec77a15` — "AnA's prompt stopped overruling her own voice in five places".
Anthropic's guidance for moving a prompt to a newer model is to remove
instructions written for older ones before adding anything. The audit found
five places where the assembled prompt contradicted AnA's own chat register (a
bold "**Note:**" marker on every flag, a model-computed confidence percentage
with a stock sentence, "lead with what's missing" before answering, scripted
closing offers, a four-line bold receipt after every action), and added the
one rule current models need: a line before multi-step work, a line when
something changes, and a closing account. Eight cases, red first.

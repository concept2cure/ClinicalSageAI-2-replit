# Model governance for high-risk drafting — 2026-09-22

**Row moved:** D4, the owed item "a PQ-passed provider for the model step",
through the DoD rule that makes it mean anything: *"Only models with a passed PQ
… are approved for high-risk regulatory drafting."*

**State after this session: D4 is not green, and neither is its PQ item.** No PQ
has executed — there is no product provider key in this environment and the eval
harnesses have no live mode. What changed is that the rule the PQ serves is now
**enforced**. Before this, a passed PQ would have gated nothing, because the
gateway did not consult approval at all.

## The defect

`server/services/ai-governance/approved-models.ts` said, in prose, which models
are not approved for high-risk regulatory drafting: Sonnet "on its own", Haiku,
GPT, Kimi, `local`. `ApprovedModel` had no field for it, and **nothing read the
prose.** The gateway selects a model in five places, and each could route
`document_drafting` or `regulatory_review` to a model the registry said was not
approved for it:

| Route | What it did |
|---|---|
| Fallback ladder | Treated residency and ZDR as hard constraints ("never fall back across them") and approval as nothing. Opus fails → drafting walks to Sonnet; review walks on to **GPT-4o**. |
| `cost_optimized` | Primary = cheapest capable model = **Sonnet 5**. `server/services/cmc/module3-narrative-builder.ts` drafts **CMC Module 3 narrative** with exactly this strategy, on the default configuration. |
| `round_robin` | Spread the task across every capable model. |
| Relaxed path (all providers unhealthy) | Returned the first capable model in list order — **GPT-4o**, for review. |
| Explicit request | Honoured any named model. |

The capability lists already kept Haiku, GPT-4o-mini, Moonshot and `local` off
these two tasks. The exposed models were **Sonnet 5, Sonnet 4.6 and Sonnet on
Bedrock** (drafting and review) and **GPT-4o and GPT-4o on Azure** (review).

The default healthy path was already right — `task_based`, Anthropic first, and
the first Anthropic entry is Opus 5. The defect lived in the degraded and
configured paths, which is where a governance control earns its keep.

## What was built

**The registry carries the decision as data.** Each of the 15 entries gains
`approvedForHighRisk`, `highRiskBasis` — the sentence that decides it, quoted
from the entry or from the DoD — and `pq: { status, reference }`. The values
were **transcribed, not re-decided**. Four are approved:

| Entry | Basis |
|---|---|
| `claude-opus-4` (Opus 5) | "primary for high-risk authoring and review tasks" |
| `claude-opus-4-legacy` (Opus 4.8) | the "top intra-provider fallback" kept so a tenant "keeps the reviewed behaviour rather than falling to Sonnet" — the DoD's "one validated fallback" |
| `claude-opus-4-bedrock` | "primary high-risk authoring/review path for BAA + zero-retention customers" |
| `claude-opus-4-vertex` | **an inference, recorded as one** — see below |

An id the registry does not know is not approved: a model added to the gateway
without a governance entry fails closed.

**The gateway enforces it at every selection point** — primary under every
strategy, the relaxed path, the fallback ladder, and explicit requests. A high-risk
task that cannot be served by an approved model raises `ModelNotApprovedError`:

- a `GatewayPolicyError`, so it is terminal on every path that already treats
  policy refusals as terminal — never retried, never walked down the ladder,
  never counted against a provider's health;
- **never returned as null.** The caller turns a null selection into demo-mode
  content outside production and into "no AI provider is configured" inside it.
  A governance refusal is neither, and was designed not to become either;
- an explicit request for an unapproved model is **refused**, not rerouted and
  not honoured — rerouting would hide the violation in the caller;
- **audited** through the gateway's audit writer, naming the models withheld;
- mapped to a message an author can act on, instead of "blocked by AI gateway
  policy".

Tasks that are not high-risk are unaffected, and the tests pin that too.

**The dashboard shows the PQ.** `ga-readiness-report.mjs` gains an *AI
governance* row, a blocker: *0 of 4 approved models have a passed PQ*. It turns
green only when Opus 5 **and** at least one other approved model pass — the DoD's
"Opus 5 (primary) and one validated fallback" — and stays red, saying why, if
the registry cannot be read.

## Verified by making it fail

- `after/high-risk-model-approval.test.txt` — 16 cases: 5 on the registry, 8 on
  enforcement, 3 controls that must not change.
- `after/mutations.txt` — each enforcement point removed on its own, every one
  caught. **M0 is the defect itself:** restoring trunk's selection behaviour
  fails 7 of 16.
- `after/readiness-row.txt` — the dashboard row in four states, including green.
- 307 existing gateway and governance tests pass; full `tsc` exits 0; the ESLint
  warning ratchet reports no file changed its count.

## What this changes in behaviour, stated plainly

- **Module 3 narrative drafting now uses Opus**, not Sonnet 5. It costs more
  per call. That is the rule working, and it is the only live caller found that
  selects a cheaper model for a high-risk task.
- **When both Opus 5 and Opus 4.8 are down, drafting and review refuse** instead
  of degrading to Sonnet or GPT-4o. Before, an author received a draft from an
  unapproved model with nothing to say so.
- **A deployment with only an OpenAI key can no longer draft or review.** The
  DoD caps GPT below high-risk until its PQ executes.

## Decisions this leaves for the system owner

1. **Vertex Opus.** Its entry never says high-risk in words. It is approved here
   by analogy with the Bedrock Opus entry, because it is the only residency path
   for GCP customers and refusing it would leave them no drafting model. The
   `highRiskBasis` says this is an inference. Confirm or reverse it.
2. **Whether `pq.status: 'pending'` should block.** The DoD says only
   **PQ-passed** models are approved. Enforcing that today would switch off AI
   drafting everywhere, because no PQ has run. This change enforces **approval**
   and **reports** PQ; it does not make pending PQ a hard block. That is a
   product decision, not a refactor, and it should be made once a PQ can run.
3. **A stale claim in the registry.** The Bedrock and Vertex Opus entries say
   "same model weights as claude-opus-4 (first-party)". They are pinned to Opus
   4.7; first-party `claude-opus-4` is pinned to Opus 5. The PQ has to cover each
   pinned version separately. Not corrected here, because deciding what the
   entries should say is the governance review this field exists to force.

## What is still owed for the PQ itself

- A product provider key (`ANTHROPIC_API_KEY`). This environment has none; the
  credentials present belong to the session harness and were not used.
- A live mode in `server/eval/rag/run-eval.ts` and
  `server/eval/doc-quality/run-eval.ts` — both score captured candidate outputs
  only (`server/eval/doc-quality/README.md`, "how to make the numbers real").
- A gold bank beyond the seed: `gold-tasks.json` is `0.1.0-seed`.
- The run, and `pq: { status: 'passed', reference }` recorded against each entry
  it covers.

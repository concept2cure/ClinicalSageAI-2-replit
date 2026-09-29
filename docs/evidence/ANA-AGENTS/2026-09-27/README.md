# AnA runs multiple agents; Manual/Auto is a real run policy (row 74)

Founder-directed on 2026-09-27. This lane moves no D-row, and it is recorded
on the work-order board as the founder's explicit exception to RULE 2.

| Slice | What it fixes | Commit | Evidence | Status |
|---|---|---|---|---|
| S0 | Two calls of one tool in one step swapped their results in the transcript | `97465528b` | `S0-tool-result-pairing/` | landed |
| SG | A mid-call Stop counted as a provider failure and could mark Anthropic unhealthy for every tenant | `b4efbe63c` | `SG-abort-not-a-provider-failure/` | landed |
| S1 | A turn the round limit cut short read as finished | `85cb5654b` | `S1-stopped-reason/` | landed. Shown end to end with a stand-in model (`E2E-stand-in/`, scenario 1); a live-model capture still needs a model key |
| S2 | Home's engine pill was never sent; any enabled model could be pinned without an approved-models entry, and a refused pin was dropped silently | `b4cd68746` | `S2-honest-controls/` | landed. Shown end to end with a stand-in model (`E2E-stand-in/`, scenario 6) |
| S3 | The primitives S4 and S5 stand on (loop `stopWhen`/`roundCap`/`'replan'`, executor options, the pause wait moved into one shared `createRunHold`, `holdForPerson`/`endHeldRun`, the model-call refusal scope, wrapper rule 0), all off for callers that do not opt in; and two honesty fixes: a failed read no longer makes `check_dossier_consistency` answer "no issues", and `project_knowledge_search` has a model-free mode | `eeedc6231` | `S3-primitives/` | landed. No user-visible surface |
| S4 | There was no Manual/Auto. Now `run_policy` is read by the stream's budget, stop directive, hold and checkpoint, and never by the approval gate. Manual holds before each further step and runs it only on a person's answer. A hold nobody answers ends the turn, and a hold that cannot be made fails closed. Every unrun held step is on the record and in the dossier. Auto runs to 20 rounds / 15 min of work / 40 min in all, and never approves. A separate "Between steps" control, and the run-control strip on the conversation screen. A 45-point review was worked through, red first | `eb62b566c` | `S4-manual-auto/` | landed. Shown end to end with a stand-in model (`E2E-stand-in/`, scenarios 2-5); a live-model capture still needs a model key |
| H1 | AnA's default (cost-tier) model could be one with no approved-models entry | `03dea50b7` | `H1-default-model-governed/` | landed |
| H2 | `check_dossier_consistency` said "clean" when nothing was compared | `eea56da2c` | `H2-dossier-check-not-applicable/` | landed |
| ADR | The lane's product decisions, made under the founder's delegation | `39b3027cc` | `docs/adr/0014-ana-autonomy-sub-agents-and-model-governance.md` | accepted |
| H3 | ADR-0014 §3–§5 in the gateway: every served model is its own approved entry; high-risk drafting in production needs a passed PQ; no tenant-less calls in production | `e2258d07a` | `H3-gateway-governance/` | landed |
| H4 | Numerical integrity and document reconciliation said "clean" with nothing compared | `ba0d373b4` | `H4-nothing-checked-is-not-clean/` | landed |
| D4 | The PQ could have passed without its rag component running; the rag blocker was misdescribed | `e41504ec7` | `docs/evidence/D4/2026-09-28-pq-rag-*` | landed; five items handed to `…01VB8JEG` |
| E2E | S1, S2, S4 on the real server, database and UI with a scripted stand-in model | `0b5937f97` | `E2E-stand-in/` | 6 scenarios shown; findings F1–F4 recorded (F1, a declined action fed back as a failure, is next) |
| S5–S7 | Sub-agents, client agent rows, evidence and board | — | — | not started; S5 brief ready |

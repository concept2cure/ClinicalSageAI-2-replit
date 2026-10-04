# The map of AnA's reasoning layer, and what became of each finding

On 2026-10-04 a read-only workflow mapped the live AnA turn (`POST /api/ana-ri/stream`).
It covered five slices:

- the turn pipeline (TP);
- the model's reasoning configuration (MC);
- grounding (GRD);
- figures and verdicts (FV);
- transparency and the record (RT).

Each slice's findings went to an independent verifier told to refute them.
Every finding below survived that check and was reachable at `25740b97c`, except
where marked. A severity is the verifier's corrected one.

**Outcome** is one of:

- **fixed** — fixed in this change (README);
- **next** — a later round of this lane (board row "AnA's reasoning is checked by an engine…");
- **handed on** — a work order to the lane that holds the file (`docs/work-orders/README.md`).

## Fixed here

| ID | Sev | Finding | Outcome |
|---|---|---|---|
| TP-RL-1, MC-RL-1 (part), GRD-1, FV-FIG-2, RT-1 | high | The strip counted AnA's own labels as grounding and as sources, with a green check. | The strip leads with the engine's check. The labels are reported as hers, with no check mark. |
| TP-RL-2, GRD-3, FV-FIG-1 | high | The deterministic check could not see a figure. It was a no-op with no tool result, and went unrun when no tool ran. | Figure pass added. The basis is `no_sources` (claims not checked, never found). |
| RT-missed, TP-missed, GRD-5 | high | A label check that ran and failed was shown as "not assessed" (the client dropped `attempted`). | `attempted` is carried, and a failed check shows what failed. |
| RT-missed, GRD-missed | high | `[MISSING]` counted as grounding and as a source. `missing_support_count` could never be non-zero. | A declared gap is missing support, not grounding. |
| FV-VERD-5, MC-missed | high | The §14 linter only logged. "Ready to file", "fully compliant" and "approvable" were detected by nothing. | A separate verdict set, kept apart from the retrieval-atom prohibitions. Verdicts are named on the strip and in the record. |
| FV-REC-6, RT-2, GRD-6 | medium | The record held no verification and no engine version. | A `verification` section, schema `/2`, and `ANSWER_CHECK_VERSION`. |
| FV-CORP-7, GRD-4 (part) | medium | The corpus was untagged, and it credited:<br>• failed steps;<br>• governed writes;<br>• text a model wrote inside a tool call. | Entries are tagged and filtered. Each tool call's generations are captured at run time (generation-capture.ts). |
| FV-FIG-4 (part) | medium | Engines echo the model's inputs, so a figure grounds itself. | A figure only echoed from the call's input is not credited. |
| FV-missed | medium | Identifiers were matched as substrings, so a truncated or altered id grounded. | Whole-token matching. |
| TP-missed, GRD-4 (part) | high | The search tools echo the query on a hit, a zero-hit and an outage. An id the model searched for and did not find read as found. `generate_citation` echoes a CFR section it marks `not_verified`. | An identifier, regulation or quote the model asked for is found only where the result returns it in a record, or in a result that declares itself verified. |
| GRD-missed (part) | medium | Project data AnA was given (intelligence, RIM, decisions) was outside the corpus, so a figure taken from it could not be checked. | A `context` source. Her persona, instructions and memory are not sources. |
| GRD-missed (part), RT | medium | The conversation surface rendered no strip. It showed prompt overlays as "Grounded in ✓". | Strip added. The overlays are "Context used", with no check mark. |

## Next rounds of this lane

| ID | Sev | Finding |
|---|---|---|
| GRD-2, FV-FIG-3 | high | A governed draft (`draft_authoring_document` and the vault writes) is approved with no check of its figures. The approval dialog cuts strings to 80 characters and shows arrays as "N items". Proposal: run `checkAnswer` over the draft against the turn's sources at approval time, and show the not-found figures in the dialog. |
| MC-RL-3 | high | The risk tier comes from the lens alone, with no turn state (section, artifact status, contradictions). It should come from deterministic signals. |
| MC-RL-6, RT-missed | medium-high | Follow-up model calls send no `thinking`. The reasoning shown and recorded is the first call's, not the call that read the evidence and wrote the answer. |
| MC-RL-5 | medium | The high-risk thinking floor never reaches an adaptive model. |
| FV-missed | medium | Working memory writes each answer back as "Key Facts", unchecked. Proposal: pass the check to the write-back and exclude what was not found. |
| TP-RL-4 | medium | A zero-hit, an outage or `needs_parameters` is reported to the loop as a success, so no adaptation note is written. |
| TP-RL-8 | medium | Tool results are staged for the model without the input that produced them. |
| MC-RL-8, RT-3, TP-missed | medium | The record misses four things:<br>• the gateway `requestId`;<br>• the effort and thinking config actually sent;<br>• the tools offered;<br>• the closing call's `toolChoice`. |
| RT-missed | medium | The record's model input is taken before the gateway's PII redaction, so it does not show what was dispatched. |
| RT-6 | medium | The per-section AI draft door (`/api/authoring/sections/:id/ai/draft`) writes no turn record. |
| GRD-missed | medium | Citation coverage misses EU MDR/IVDR articles, ISO/IEC standards, MDCG documents, EMA references and author-year references. |
| GRD-missed | medium | "Insert into section as tracked suggestion" carries no check with the inserted text. |
| GRD-8, GRD-missed | medium | The label check excuses an overclaim next to any `[KNOWN]`, and counts `[INFERRED]` as labelled. It no longer leads the strip. |
| TP-RL-3 | high | Tool selection scores 786 tools down to 50 on the current message, and stringifies object context to `[object Object]`. |
| TP-RL-6, TP-RL-7, MC-RL-7, RT-4, RT-5, RT-7, GRD-7, FV-missed | low | Lower-severity items:<br>• the closing call is not told it is closing;<br>• a round is extended on novelty alone;<br>• role inference;<br>• summarised reasoning labelled as reasoning;<br>• a reload loses the record link;<br>• a disconnect is recorded as a person's stop;<br>• model citations are dropped. |

## Handed on

| ID | Sev | Finding | To |
|---|---|---|---|
| FV-missed | high | `run_shadow_review` asks a model for refusal and CRL likelihood figures (Rule 2). The model-assigned severities feed the dispatch gate. | The submission-readiness lane: report only the deterministic aggregate, labelled as derived from model severities. |
| FV-missed | medium-high | `plan_submission` returns a model-written clock and module map beside the reasoning engine's. | The submission-planning lane: the deterministic structure is the plan. |
| MC-RL-2 | high | The drafting prompt asks for "requirements from your training", "SUBMISSION-READY prose — not placeholders" and "no hedging". | The prompts lane (`…017d4r3C`, persona and orchestrator). |
| MC-missed | medium | The `createArtifact` quality gate penalises honest gap markers ("TBD", "[insert … here]"). | The prompts lane, with the drafting door. |
| MC-RL-4, MC-missed | high | An `ana-action` block becomes `create_artifact` through the governed-action route with no approved-model check. When no run id is sent, the route takes its model provenance from the request body. | The governed-action lane (D5). |
| TP-RL-5 | high | `prefetchRouteIntelligenceContext` skips the whole project half for a v2 program UUID (`Number(uuid)` is NaN): no feedback, RIM or decisions. The CONTEXT SNAPSHOT is built only on the send-message door. | The AnA intelligence lane (`…017d4r3C`, context composition). |
| TP-missed | medium | Tool output reaches the model as unframed user-role prose. Instruction-shaped text in an abstract or a web page is not marked as data. | The security lane (prompt injection). |

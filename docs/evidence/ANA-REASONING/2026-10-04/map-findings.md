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

## Round 2: the refute-reviews of round 1, and what became of each

Two reviewers were told to refute round 1 before it was pushed. Their reports
are `r2/review-fail-open.md` (F1–F10) and `r2/review-honest-state.md`
(HS-1–HS-11). Every finding was reproduced by the reviewer's own probe. The
README's round-2 section says what changed.

| ID | Sev | Finding | Outcome |
|---|---|---|---|
| F4, HS-2 | high | A fabricated figure was found through any equal number: dates, pages, p-values. | **fixed**: a figure is found only with its own measure or unit. |
| F1, HS-3 | high | The person's question confirmed the claims it asked about. | **fixed**: never a source; reported as "only in your message". |
| F2, F3, F6 | high | Echoes at depth confirmed the request. These included a nested `input`, a not-found list, a URL, a verified citation's echoed identifier, and search_document returning the model's own text. | **fixed**: an echo is never read, at any depth; URLs are dropped. |
| F5, HS-1 | high/medium | Instruction overlays and the intelligence prefix (custom instructions, AnA's promoted answers) were "project context". | **fixed**: the context source holds the data blocks only. |
| HS-5 | medium | A figure the model searched for was penalised even when the returned abstract held it. A figure that was her own input read as "not found". | **fixed**: found in a returned passage; "AnA's own input, not a result" otherwise. |
| HS-4 | med-high | An attached PDF's figures read "not found". | **fixed**: "not checked — may be in <file>". |
| F7 | medium | ICH codes were found inside other words, NCT ids by prefix, and BLA numbers by an equal enrolment. | **fixed** |
| F8 | medium | Common figure forms were never read. Signs and float noise broke true matches. | **fixed** |
| F9, HS-6 | medium | 16 of 17 verdict sentences were missed. Declined and conditional ones were named. | **fixed**: 15 of 17. The remaining two are under **next** below. |
| HS-7 | medium | Prose "or N" was read as an odds ratio. | **fixed**: capitals only, in the answer and in a source. |
| F10 | low | Quadratic white space; a deep result crashed the turn. | **fixed** |
| HS-8 | medium | The conversation surface drew the strip under the document canvas. | **fixed**: directly under the answer. |
| HS-9 | low | "Checked against" showed with zero claims. | **fixed** |
| HS-10 | low | No client reads `trust_summary`. | **next**: its words are neutral meanwhile. |
| HS-11 | low | Messages stored before round 1 render no strip. | **next** |

Found by the reviewers' probes re-run on round 2, and fixed before landing:

- the p6 turn took 5.6 s (round 1: 232 ms); now 0.24 s;
- an engine restating AnA's input in another form made it "found";
- a citation `generate_citation` verified read "not found";
- "21 CFR Parts 50 and 56" and "HR for death was 0.49" were not read;
- six verdict forms were missed and three non-verdicts named.

Found by round 2's own mutants, and fixed:

- an interval paired across two records;
- `ci95: [lo, hi]` not read;
- a nine-digit NCT silently skipped.

**Next**, from round 2:

| ID | Sev | Finding |
|---|---|---|
| R2-PCT | medium | A percentage is found where a source states it, whatever it measures there: 15 of 99 fabricated "ORR N%" against five abstracts. Matching the measure's name needs a vocabulary that does not warn on correct answers phrased differently from their source. |
| R2-RECALL | medium | With a project open, a recalled regulation or clock reads "not found" with a warning (9 of 12 correct answers in probe-noise). Proposal: when AnA states a regulation, she looks it up, so the lookup finds it. That is a drafting-behaviour change, for the prompts lane. |
| R2-VERD | low | "Approval is expected in Q3" and "No deficiencies remain; you can submit now" are not named. |
| R2-WORDS | low | Figures in words ("thirty-one percent") and bare proportions ("survival was 0.81") are not read. |

## Next rounds of this lane

| ID | Sev | Finding |
|---|---|---|
| GRD-2, FV-FIG-3 | high | A governed draft (`draft_authoring_document` and the vault writes) is approved with no check of its figures. The approval dialog cuts strings to 80 characters and shows arrays as "N items". **Fixed in round 3** (`../2026-10-05/`): the draft's prose is checked against the turn's sources when it is held and at the end of a turn. The dialog shows the check in the strip's rows, and lists by their items' names. The sign-off audit row names what the approver was shown. |
| MC-RL-3 | high | The risk tier comes from the lens alone, with no turn state (section, artifact status, contradictions). It should come from deterministic signals. **Fixed in round 7** (`../2026-10-05/r7/`), narrowed by its review: an open section at or under a harmonised CTD Module 2 overview or summary (2.3 to 2.7) or the integrated analyses (5.3.5.3) raises the turn to high-stakes. It only ever raises, and the plan says why. Module 1 (regional), a sealed record's status and section titles are deferred, with reasons. Contradictions wait for a project id the route can match. |
| MC-RL-6, RT-missed | medium-high | Follow-up model calls send no `thinking`. The reasoning shown and recorded is the first call's, not the call that read the evidence and wrote the answer. **Fixed in round 4** (`../2026-10-05/r4/`): every follow-up round carries the turn's thinking config, except in a demonstration, whose follow-up rounds carry its talking points. |
| MC-RL-5 | medium | The high-risk thinking floor never reaches an adaptive model. **Fixed in round 4** (`../2026-10-05/r4/`): a high-stakes turn runs at least at `'high'` API effort, with or without a kernel pin (Fast exempt). |
| FV-missed | medium | Working memory writes each answer back as "Key Facts", unchecked. Proposal: pass the check to the write-back and exclude what was not found. **Fixed in round 8** (`../2026-10-05/r8/`): the write-back settles every field the summary renders or the consolidation job promotes. An item stands only when ONE checked answer found every claim in it, no answer reported a claim in it not found, and it states no verdict. **Corrected:** the write-back fires once a conversation reaches 20 messages, not on each answer, and the facts are the summarizer's sentences. Values only the person stated, and figures from an attached PDF, are withheld too, a cost stated in the README. |
| TP-RL-4 | medium | A zero-hit, an outage or `needs_parameters` is reported to the loop as a success, so no adaptation note is written. **Fixed in round 5** (`../2026-10-05/r5/`): the round's note names each step that returned nothing usable, in the tool's own words — a declared status, an outage envelope, a count of 0, an empty result list, or a project search's own "No matching passages were found". A result that returned any record is never one. The work panel does not yet show it. |
| TP-RL-8 | medium | Tool results are staged for the model without the input that produced them. |
| MC-RL-8, RT-3, TP-missed | medium | The record misses four things:<br>• the gateway `requestId`;<br>• the effort and thinking config actually sent;<br>• the tools offered;<br>• the closing call's `toolChoice`. |
| RT-missed | medium | The record's model input is taken before the gateway's PII redaction, so it does not show what was dispatched. |
| RT-6 | medium | The per-section AI draft door (`/api/authoring/sections/:id/ai/draft`) writes no turn record. |
| GRD-missed | medium | Citation coverage misses EU MDR/IVDR articles, ISO/IEC standards, MDCG documents, EMA references and author-year references. |
| GRD-missed | medium | "Insert into section as tracked suggestion" carries no check with the inserted text. |
| GRD-8, GRD-missed | medium | The label check excuses an overclaim next to any `[KNOWN]`, and counts `[INFERRED]` as labelled. It no longer leads the strip. |
| TP-RL-3 | high | Tool selection scores 786 tools down to 50 on the current message, and stringifies object context to `[object Object]`. **Fixed in round 6** (`../2026-10-05/r6/`): a follow-up is offered the tools earlier turns ran successfully. At most 4 are carried, out of the relevance slots, each once and only from the governed set. On today's trunk, 33 of 48 probed follow-ups lost the previous turn's tool; round 6 loses none. **Corrected:** on the live door the object context was dropped, not stringified. "[object Object]" and a `hints` TypeError were on two doors no client calls; the selector now reads each field only as its declared string. Folding the open section's title into selection is its own change, next. |
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

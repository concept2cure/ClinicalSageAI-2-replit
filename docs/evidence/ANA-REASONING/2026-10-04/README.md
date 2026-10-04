# AnA's reasoning is checked by an engine, and the check is what the reviewer sees and the record keeps

Founder-directed 2026-10-04: *"Enhance the reasoning layer of ANA."* Supports
launch rows D4 (validation package) and D5 (the turn record). Board row:
"AnA's reasoning is checked by an engine…" (`docs/work-orders/README.md`).

## What was wrong

A read-only map of the live turn (`POST /api/ana-ri/stream`) was split into five
slices. Each slice was checked by an independent verifier told to refute it.
`map-findings.md` lists every confirmed finding and what became of it. The
same defect was found four times:

- **The strip counted the model's own labels.** The strip under every answer
  read "3 of 3 claims grounded · 2 sources" with a green check. It was built
  from AnA's own `[KNOWN]` / `[INFERRED]` labels:
  - a claim counted as grounded when any label sat within 500 characters,
    including `[MISSING]`;
  - "sources" was the number of labels.

  In the probe, every figure was invented and tagged `[KNOWN]`. It read as
  grounded.
- **The one deterministic check could not see a figure.** That check
  (`answer-grounding.ts`) compared identifiers, regulations and quotes with the
  tool results. An invented efficacy rate, p-value, dose, enrolment or shelf
  life passed every check.
- **The check said nothing in three cases:**
  - when no tool ran;
  - when an identifier was a substring of a longer one ("PMID 3456789" inside
    "PMID 23456789");
  - when a tool echoed the model's own request. The search tools echo the
    query on a hit, a zero-hit and an outage alike.

  It also credited three things that are not evidence:
  - a failed step's error text;
  - the content a governed write stored;
  - text a model wrote inside a tool call, such as batch drafting.
- **The check was shown nowhere.** It ran after the answer streamed. It went
  to a `post_done` field no client reads, and it was not in the sealed turn
  record.
- **Failures were hidden or not surfaced:**
  - A label check that ran and failed (any overclaim, any contradiction) read
    "Grounding not assessed", because the client dropped `attempted`.
  - The §14 verdict linter ("will be approved") only logged. Nothing flagged
    "the submission is ready to file" or "fully compliant".
- **Context was shown as verification.** The conversation surface showed every
  prompt-context layer as "Grounded in ✓". These included instruction overlays
  such as `claim-grounding`.

Rule 2 says numbers and verdicts come from engines, and the model narrates. So
this change makes the engine's check the one AnA reports.

## What changed

| Where | What |
|---|---|
| `server/services/ana/answer-grounding.ts` | `checkAnswer` checks identifiers, regulations, quotes and **figures**, and names **verdicts**.<br>**Figures:** a percentage (also as its proportion), a p-value, a hazard, odds or risk ratio, both bounds of a confidence interval, an n, a count of patients, a dose, a duration. "95% CI" is not a figure.<br>**Sources:** each source is named (`tool:<name>`, `web`, `context`, `person`, an attachment). A figure is not credited by a result that only echoes a number the model passed in. Nothing is credited by text a model wrote inside the call.<br>**Identifiers:** matched whole. An identifier, regulation or quote the model asked for counts only where the result returns it in a record, never in the echo of the request. A result that declares it verified what it returns counts throughout.<br>**Basis:** with no source consulted, the claims are *not checked* (`basis: 'no_sources'`), never found.<br>The engine is versioned (`ANSWER_CHECK_VERSION`). |
| `server/services/ai-gateway/generation-capture.ts`, `gateway.ts` | **What a model wrote inside a tool call is known at run time.** The stream opens a capture around each tool handler. `gateway.route()` notes every generation that succeeds inside it, including demo responses and the tool calls it chose.<br>A result whose generations are unknown, or too many to keep, is not a source. That covers a call settled in the governed-action route.<br>No list of "model-written tools" is kept that could drift. |
| `server/routes/ana-ri/stream.ts` | The check's sources:<br>• each tool result as the model read it, with the call's status, input and generations;<br>• the web steps;<br>• the person's message;<br>• the project data the platform read for AnA (intelligence, RIM, decisions, profile, deadlines, contradictions, authoring context, enrichment).<br>Not sources: her persona, her instructions, or her memory of earlier turns. An attached PDF is named as unreadable. |
| `server/routes/ana-ri/post-processing.ts`, `server/services/ana/turn-verification.ts` | One verification per answer: the engine's check and AnA's labels. It goes, unchanged, to five places:<br>• the strip;<br>• `post_done`;<br>• the stored message (`metadata.verification`);<br>• the sealed record;<br>• the RIM summary.<br>The record holds it before it is filed. |
| `server/services/ana/turn-record.ts` | A `verification` section. Schema `ana-turn-record/2`. Nothing reads the schema string, and the column has no CHECK. |
| `server/services/clinical-regulatory-evidence/governance.ts` | A verdict set apart from the §14 prohibitions: ready to file, compliant, meets all requirements, approvable, the agency will accept.<br>It is separate because the prohibitions also refuse retrieval atoms, and source text recording a finding is evidence. A declined verdict ("is not ready to file") is not named. |
| `server/services/ana-ri/evidence-validation.ts`, `response-contract.ts` | `[MISSING]` is a declared gap, not grounding:<br>• it is counted as missing support (which could never be non-zero before);<br>• it is not counted as a source;<br>• label counts are reported.<br>The one-line summary leads with the check. Clean labels read as "AnA's labels", not "Verified". |
| `client/…/ana/anaAnswerCheck.ts`, `useAnaChat{,.types}.ts` | One reader for the live strip and for a reopened conversation. It carries `attempted`. A malformed check is no check. |
| `client/…/v2/AnaGrounding.tsx` | The engine's check leads:<br>• not found, quoted by kind;<br>• what it checked against;<br>• sources it could not read;<br>• verdicts, "verdicts come from engines".<br>A check mark is earned only when every specific claim was found. AnA's labels follow as hers, with no check mark. A failed label check shows what failed. |
| `client/…/v2/surfaces/ConversationThread.tsx` | The conversation surface shows the same strip. "Grounded in ✓" is now "Context used", with no check mark. |
| `server/services/evidence/grounding-eval.ts` | Figure cases added: an enrolment, a p-value and a shelf life fabricated, and an ORR with its CI and a hazard ratio grounded.<br>A fixture defect was found while doing this: the "grounded NCT id" case asserted grounding with no 1066 in its evidence. It is corrected. |

## Proof

- **Red first.** Each `red-*.txt` file is a new suite run against the code
  before its fix:
  - `red-answer-check.txt`: the engine;
  - `red-capture.txt`: the capture;
  - `red-missing-label.txt`: the labels;
  - `red-post-processing.txt`: the wiring;
  - `red-stream-sources.txt`: the stream, against an export of the
    pre-change tree;
  - `red-strip.txt`: the strip, against the old component;
  - `red-regulation-echo.txt`: regulations.

  The identifier echo rule's red is its mutants: with the rule removed, 9
  tests fail (`mutants/M23…`). `eval-red-old-engine.txt` is the offline eval
  against the old engine: recall 0.727, with all three fabricated figures
  missed.
- **Green.** `green.txt`: the 13 suites of this change, 131 tests.
- **Related suites.** `related.txt`: every suite of the touched modules on the
  merged tree, 5,226 tests. One file fails: `mdx-esg-transmit-gateway.test.ts`.
  It fails on a missing `CONNECTOR_ENCRYPTION_KEY` in this container, and
  fails identically on an export of the unmodified trunk.
- **Mutants.** `mutants/summary.txt`: 28 of 28 killed. Each mutant reverts
  the essence of one rule.
  - M06 first survived. It targeted the old crediting path, which regulations
    still used, and no test covered a regulation a model wrote. The regulation
    echo rule moved regulations to the same path, and a test now pins the
    model-written case. M06 was then killed.
- **Lint.** `lint.txt`: no touched file gains an ESLint warning, and
  `answer-grounding.ts` loses one. New files have none.
- **Types.** `tsc.txt`: the whole-tree typecheck at the commit.

## Not done here, for the next rounds

These are in `map-findings.md`, each with its owner or round:

- the reasoning of follow-up model calls, which send no `thinking`, so only
  the first call's reasoning is shown or recorded;
- working memory writing unchecked answers back as "Key Facts";
- the governed-write approval dialog, which shows a 3-section draft as
  "sections: 3 items" and checks none of its figures;
- `run_shadow_review` asking a model for refusal and CRL likelihood figures;
- `plan_submission`'s model-written clock;
- citation coverage for EU MDR, ISO and MDCG references;
- a tool result's outcome (zero-hit, outage, needs-parameters) reported as a
  success to the loop.

"Found" means the claim is in this turn's sources, not that the sentence
around it is right. The strip says exactly that.

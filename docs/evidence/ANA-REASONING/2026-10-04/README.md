# AnA's reasoning is checked by an engine, and the check is what the reviewer sees and the record keeps

Founder-directed 2026-10-04: *"Enhance the reasoning layer of ANA."* Supports
launch rows D4 (validation package) and D5 (the turn record). Board row:
"AnA's reasoning is checked by an engine…" (`docs/work-orders/README.md`).

> **Round 2 (at the end of this file) supersedes four statements of round 1
> below.** No row of the strip earns a check mark now (round 1: "a check mark
> is earned only when every specific claim was found"). The person's message is
> never a source. Neither the intelligence prefix nor the enrichment overlays
> are project data (round 1 listed both). A claim a PDF AnA read may hold is
> "not checked", not "not found". Two reviewers refuted round 1 before it was
> pushed; round 2 is their findings answered.

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

## Round 2: the first engine refuted, and answered before it shipped

Round 1 (`a3775bcef`) was not pushed until it had been attacked. Two
independent reviewers were told to refute it, each through one lens:

- fail-open and correctness, findings F1–F10 (`r2/review-fail-open.md`);
- honest state, findings HS-1–HS-11 (`r2/review-honest-state.md`).

They ran 24 probes against the engine and, where a tool was named, its real
handler with the network stubbed. Round 1 reassured falsely in the ways that
matter most to a reviewer:

- **A fabricated figure was "found" through any equal number in a source.**
  Five real PubMed abstracts hold 144 distinct numbers. Against them, "the ORR
  was N%" was found for 57 of 99 values of N, through dates, page numbers and
  p-values. A PubMed outage envelope "found" 22% through its percent-encoded
  URL.
- **The person's own question confirmed what it asked about.** "Was the ORR
  45% or 60%?" found "45%".
- **Instruction text counted as project data.** The claim-grounding overlay's
  example text ("a 30-day IND wait") found a recalled 30-day IND wait.
- **One check mark was earned by all three.**

### What round 2 changed

| Finding | Sev | Now |
|---|---|---|
| F4, HS-2 | high | **A figure is found only where its number stands with its own measure or unit.** A percentage needs %, or its proportion under a rate's name. A p-value needs p. A ratio needs its own name (HR, OR, RR, IRR in capitals). An interval needs both bounds close together beside CI, in one record. A count needs what it counts. A dose or a duration needs the same unit. Dates and URLs are not numbers (`answer-check-figures.ts`). |
| F1, HS-3 | high | **The person's message is never a source.** A claim found only there is reported as "only in your message". |
| F5, HS-1 | high | **The `context` source holds the project data blocks only.** It excludes the instruction overlays (the enrichment block). It excludes the intelligence prefix, which holds custom and project instructions and AnA's own answers promoted to memory after seven days. |
| F2, F3, F6 | high | **An echo of the model's request never confirms it, at any depth.** None of these are read: a field holding the request, a URL or a not-found list; a record that says it was not found; a string the model sent (except a single identifier inside a record that returns something of its own); the top-level envelope, unless the result declares it verified what it returns. URLs are dropped from every reading (`answer-check-sources.ts`). |
| HS-5 | medium | **A figure in a passage the source returns is found, even when the model searched for it.** A figure that is only AnA's own input is reported as hers: "AnA's own input to <tool>, not a result". That covers an assumed power, a hazard ratio she chose, or a value echoed back or restated in another form (0.47 sent, "47%" returned). |
| HS-4 | med-high | **A source AnA read that the check cannot read leaves claims unchecked.** When it is a PDF's bytes, claims found nowhere else are "not checked — may be in <file>", not "not found". |
| F7 | medium | **Identifiers and regulations match only as themselves.** An ICH code needs a boundary on both sides ("E3" is not in "PHASE3"). A trial id is read with every digit, so a nine-digit NCT is flagged as itself. PMID, NDA, BLA and ANDA numbers need their label in the source. |
| F8 | medium | **The answer's figures are read in the forms clinical writers use.** "47 percent", "hazard ratio, 0.31", "HR for death was 0.49", "p-value = 0.0003", "212 pts", "31.2 mo", "48 h", "100 μg", "95% CI [0.41, 0.77]", "HR (95% CI) 0.62 (0.50–0.77)". "38–56%" is checked at both ends. Signs are kept, and proportions compare without float noise. "21 CFR Parts 50 and 56" is read as two parts. |
| F9, HS-6 | medium | **Verdicts cover more forms:** contractions, "Part 11 compliant", "GMP-compliant", "in compliance with", "complies with", "meets/satisfies all applicable requirements", "ready for FDA submission", "will likely / should be approved", "FDA will clear". A verdict that is declined, doubted, conditional before or after, asked, or a workflow step ("approved by two signers") is not named (`isAssertedVerdict`). |
| HS-7 | medium | **"or" in prose is not an odds ratio,** in the answer or in a source. |
| F10 | low | **Cost is bounded.** White space in every answer pattern is bounded, so time is linear. Walks stop at depth 64. Numbers are indexed by value, so a figure looks only at equal numbers. |
| HS-2, HS-8, HS-9 | high/med/low | **The strip:** no row earns a check mark, because found is not verified. The strip sits directly under the answer, never under the document canvas, whose draft it does not check. "Checked against" shows only when there were claims. |

Not done in round 2:

- **HS-10:** no client reads `trust_summary`. Its words are now neutral, because `section-validation.ts` also uses it for a person's own draft.
- **HS-11:** a message stored before round 1 renders no strip.

### The reviewers' probes, run again before landing

The 24 probes were re-run, unchanged, against the round-2 engine
(`r2/probes-after.txt`). They confirmed the fixes above, and found what round 2
still did wrong. Each item was failed first (`r2/red-r2-probes.txt`, 8 tests), then fixed:

- **Speed.** The p6 turn (200 identifiers and 200 figures against 25 sources of
  60k characters) went from 232 ms in round 1 to 5.6 s in round 2. Every figure
  scanned every number. Numbers are now indexed by value: 0.27 s.
- **Restated input.** An engine that restated AnA's proportion as a percentage
  (`{rate: 0.47}` in, `"assumed_rate": "47%"` out) made her input "found".
- **A citation the tool verified read "not found".** `generate_citation`
  returns the PMID only in the echoed identifier and the PubMed URL, so the
  labelled "PMID 27718847" was never confirmed.
- **Text the check did not read:** "21 CFR Parts 50 and 56" and "The HR for
  death was 0.49".
- **Verdicts:** six forms missed, and three non-verdicts named ("Is the section
  fully compliant?", "no guarantee the agency will accept", "compliant only
  when audit trails are on").

### Every rule made to fail

`r2/mutants/` holds one file per mutant, and `r2/mutants/summary.txt` the list.
Each mutant reverts one rule. The first run (`r2/first-run/`) killed 61 of 77.
The 16 survivors were rules no test pinned. They included each figure kind's
own measure (p, HR, n, count, dose), the interval's proximity, CI words and
record, the not-found record, the substantive-record rule, dates, prose "or"
in a source, "in compliance with", and the strip's no-sources person row.

Pinning them found three defects, each failed first (`r2/red-r2-pins.txt`):

- an interval's bounds were paired across two records of one list;
- an interval returned as `ci95: [0.5, 0.77]` was not found;
- a nine-digit NCT was silently skipped.

The final run: **86 of 86 killed** (`r2/mutants/summary.txt`). Round 1's 28
mutants, run again on the round-2 tree (`r2/mutants-r1-on-r2/`): **the 12 that
still apply, all killed**. The other 16 targeted code round 2 rewrote; each
one's successor in the round-2 set is named there (M05 → R04, M06 → R78,
M08 → R03, M09 → R79, M10 → R80, M11 → R38/R39, M13 → R81, M18 → R48,
M21 → R82, M22 → R05, M23 → R15, M24 → R10, M25 → R12, M26 → R83,
M27 → R11, M28 → R84).

### What the check still cannot tell, by decision

- **A percentage is found where a source states that percentage, whatever it
  measures there.** Against the five abstracts, a fabricated "ORR N%" is found
  for 15 of 99 values of N, down from 57. Each of the 15 is a percentage those
  abstracts state. Requiring the measure's name (ORR as against an AE rate)
  would warn on correct answers phrased differently from their source, which is
  the noise HS-7 reported. So the strip says "found in this turn's sources" and
  no more.
- **With a project open, a regulation or clock AnA recalls rather than reads is
  "not found in this turn's sources", with a warning.** probe-noise finds this
  in 9 of 12 correct answers. It is the honest state: nothing this turn holds
  it. In a regulated submission, a recalled citation is one a reviewer
  verifies. The regulation lookup tools would make it found.
- **Not read:**
  - two verdict forms: "Approval is expected in Q3" and "No deficiencies
    remain; you can submit now";
  - figures written in words ("thirty-one percent");
  - a bare proportion ("one-year survival was 0.81").

### Proof for round 2

- **Red first.**
  - `r2/red-r2-engine.txt`: the 37 cases of the reviewers' inputs against the
    round-1 engine, 35 red.
  - `r2/red-r2-probes.txt`: the re-run probes, 8 red.
  - `r2/red-r2-pins.txt`: the pinned rules, 3 red.
- **Green.** `r2/green.txt`: round 2's 16 suites, 213 tests, on the merged
  tree.
- **Related suites.** `r2/related.txt`: every suite of the touched modules on
  the final tree, 5,732 tests passing. One file fails: the ESG transport suite.
  It needs a `CONNECTOR_ENCRYPTION_KEY` this container does not set, and fails
  the same way, 15 of 15, on an export of trunk `4053be7be`.
- **Mutants:** as above.
- **Lint and types.** `r2/lint.txt`: no touched file gains a warning, and the
  new files have none. `r2/tsc.txt`: the whole-tree typecheck.

# S10: completing G3, the letter's questions (re-plan steps 5, 6, 7, 9, 10, 11, 15, 16, 17)

Design only. Written read-only against trunk **`609ef94c7`** on `concept2cure-v2`, 2026-11-01, by session
`session_011e42DEAR2U6W51Mjvgfgbt` (RIM). Nothing in the repository was edited, staged or checked out. Every scratch file
named below is under `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/`
(written `scratchpad/` below).

**Revision 2, 2026-11-02** (same session, same trunk). Twenty-seven critique findings that stood after their skeptics
were folded in; each is applied, applied with a change, or rejected in part with the run that shows why (§5,
"Revision 2"). A completeness critic then read the design against the plan, the harvest, the fixtures and the
oracle's clauses, ran what it doubted, and folded in what was missing (§5, "Completeness critic"). Every number in this
revision was re-measured on a revised prototype
(`scratchpad/s10/r2/proto/`), through a revised oracle, and against a reader list written by hand from the realistic
letters (§2). The r1 numbers are kept only where a sentence says "r1".

**What this completes.** One existing capability: G3, the model-free splitter of an agency letter's numbered questions
(`shared/agency/letter-questions.ts`, `7f5a68c14`), the proposals it feeds
(`server/services/agency-responses/letter-question-proposals.ts`), and the list a person reads inside the letter's
questions (`client/src/concept2cure/v2/surfaces/LetterQuestionProposals.tsx`, mounted at `AgencyResponses.tsx:653`).
Nothing here is a new capability, screen, route, mount, table or AnA tool.

**THE CONTRACT** (the coordinator's terms, binding on every sub-slice):
- A proposed question's words are the agency's exact words: one verbatim slice, `text === letter.slice(start, end)`.
- The splitter never trims, rewrites or invents a question's words.
- When it cannot cut cleanly it says so. The question is **not offered**: no Record button, the reason names the line
  and the rule, and the person records it by hand with the existing "Record question" button (`AgencyResponses.tsx:640`).
- Red first: each oracle violation class gets a failing fixture test, then green.
- No letter corpus is committed. Fixtures are short synthetic letters in public FDA/EMA template wording, inlined in
  the test files as stored text.

**Inputs read:** the re-plan (`scratchpad/designs/rim-replan-2026-11-01.md` §1.6, §2, §3 steps 5–18 and 37, §6);
the slice-3 harvest (H1–H14, the `map:slice3-harvest` result in the workflow journal); `scratchpad/s10/code-map.md`,
`scratchpad/s10/fixtures.md`, `scratchpad/s10/reuse-map.md`; the oracle and its saved trunk run
(`scratchpad/redteam/oracle-g3.mts`, `g3-work/g3-results.json`, `byclause.json`, `g3-report.txt`).

---

## 0. Summary

Measured on revision 2's prototype through revision 2's oracle (all 1,261 red-team inputs, cumulative; §2). "Reader"
is the hand-made reader list over the 49 realistic letters: questions offered with the reader's words / offered with
other words / not offered, of the 147 one verbatim slice can hold.

| Order | Re-plan step | Sub-slice | Package | Completes | Oracle: violations (contract-relevant) | Realistic: offered; reader |
|---|---|---|---|---|---|---|
| — | — | trunk | — | — | 3,292 (3,031) | 187; 86 / 61 / 0 |
| 1 | 5 | A control character never reaches the package | S10 | `response-logic.ts`, `letter-questions.ts`, `response-package-docx.ts` | 2,386 (2,125); P5 C0 472 → 0 | 183; 86 / 61 / 0 |
| 2 | 6 | A repeated or withdrawn number is said, not offered | S10 | `letter-question-proposals.ts` | 1,497 (1,312); P3-duplicate 375 → 0 | 132; 70 / 42 / 35 |
| 3 | 7 | Proposals read only what the person may read | F1 | `authoring-assembly-sources.ts`, `letter-question-proposals.ts` | unchanged (a source-level rule) | unchanged |
| 4 | 9 | The letter's source is checked before it is read | S10 | `letter-question-proposals.ts`, `LetterQuestionProposals.tsx` | unchanged | unchanged |
| 5 | 10 | One reading of a letter's source reference | S10 | `letter-questions.ts`, `communication-center.ts` | unchanged | unchanged |
| 6 | 11 | The proposals say what they read, and what they did not; limits | S10 | `LetterQuestionProposals.tsx` | 1,398 (1,213) | 132; 70 / 42 / 35 |
| 7 | 15 | The order rule, conservative | S10 | `letter-questions.ts` | 703 (529); P6-merged → 0 | 117; 74 / 31 / 42 |
| 8 | 16 | Headings, closings, sign-off and responses; repeated numbers told apart | S10 | `letter-questions.ts`, `letter-question-proposals.ts` | 444 (248); P1-foreign heading, response, lead-in and closing, P6-signature, P6-inner → 0 | 138; 116 / 12 / 19 |
| 9 | 17 | Page furniture flagged, from the receipt's page spans | S10 | `letter-question-proposals.ts`, `letter-questions.ts` | **165 (9)**; P2-furniture 747 → 0 | **132; 132 / 0 / 15** |
| later | 18 | AnA's IR draft carries the cautions and the whole list | F1 (held by `011Fyq…`) | `AnaToolExecutor.ts` | — | — |
| later | 37 | Where the words came from (optional) | S10 | `agency-responses.ts` | — | — |

**After sub-slice 9:**
- **On the 49 realistic letters, no offered question has other words than the reader's** (trunk: 61), none is offered
  that the reader list does not hold (trunk: 22), and 132 of the 147 cuttable questions are offered (r1: 103). Every
  one of the 70 questions the r1 budget counted clean is still offered. Each of the 15 not offered is named with its
  reason in §2; each is the contract's price or a gap named in §6. Every form family is at or above trunk's usable
  floor (§2).
- **The trunk-diff gate** lists 18 changed slices on the realistic letters that its independent table does not
  explain; each was read: a running page header after a page mark, CMC subheadings, a CRL heading pair at a page top,
  and CRL sections after the last question (§2). Its trunk-independent wrapped-number check flags 2, both the minutes'
  in-response items after a question cut at its response boundary.
- **The 9 contract-relevant oracle findings left** (all inputs): 7 P3-coverage on the `nbsp-all-spaces` variants (the
  oracle's own closing patterns hold literal spaces, so it does not see "If you have any questions," written with
  no-break spaces; the splitter reads it correctly), and 2 Word auto-numbering findings on `r1-numbering/n16` (the
  stored text of a Word letter holds no number Word adds by itself; the copy of sub-slice 6 says so for every Word
  letter). The other 156 are the precision audit's false positives: 123 "P5 DEL/C1 only" and 33 "P5 tab only" (the
  package stays well-formed with them, and TAB is the agency's own character, §3.1). They rise from r1's 71 because
  more questions are offered.
- **Inputs failing: 742 → 82.**

These numbers come from a scratch prototype of every rule in this design, run through an adapted copy of the oracle
that reproduces trunk's result exactly with its revision-2 changes switched off (§2). The prototype is a measuring
instrument, not code to port. The r1 design measured 78 violations (7 contract-relevant) and 103 offered under the
r1 oracle; under the revision-2 oracle the r1 prototype has 11 contract-relevant violations, and the reader list shows
its 44 unoffered cuttable questions, which the r1 budget could not see.

---

## 1. What already exists (RULE 3)

**The searches** are recorded in `scratchpad/s10/code-map.md` §8 and `scratchpad/s10/reuse-map.md` §0, and were not
repeated here:
- every name a splitter, proposal, letter source or furniture reader could have;
- `git log --all --diff-filter=D` over the same names (none was ever deleted);
- the control-character classes;
- the label maps.

The one splitter is G3. Each sub-slice below has its own "What already exists" paragraph with the anchors it changes.

**Trunk, by file** (`path:line` at `609ef94c7`):

| File | Lines | What it does today | What it does not do |
|---|---|---|---|
| `shared/agency/letter-questions.ts` | 84 | `OPENER` (:31), `CLOSING` (:34), `linesOf` (:38-49), `splitLetterQuestions` (:51-84): one forward pass. An opener opens. A `CLOSING` line ends a question mid-words. Two blank lines end a question. Any other line extends it. Trailing whitespace is trimmed by recomputing `end`. | No order, duplicate, heading, response, sign-off, furniture, character or length rule. No "not offered". |
| `server/services/agency-responses/letter-question-proposals.ts` | 155 | `SOURCE_REF` (:51), `sameQuestionRef` (:54-57), `readLetterSources` (:66-99, project-scope JOIN, states `read`/`no-text`/`not-found`), `readLetterQuestionProposals` (:101-115), the commitment proposals (:117-155) on the same read. | No disposition, currency, coverage, read-scope, receipt or page-span read. A malformed ref is dropped silently (:75). Every proposal sharing a number is marked recorded (:110). |
| `server/routes/c2c/agency-responses.ts` | 765 | `questionBody` zod (:134-141, ref ≤ 40, text ≤ 20,000); GET `.../questions` sorts with an inline copy of `compareQuestionRefs` (:378); GET `.../question-proposals` (:391-403) drops withdrawn questions before matching (:397-398); POST `.../questions` (:451); PUT response (:500); commitments (:425, :595); POST `.../response-package` (:727-764). | No character rule on any field that reaches the package. |
| `server/services/agency-responses/response-logic.ts` | 490 | `compareQuestionRefs` (:187); `PackageResult` (:348-350, codes `NO_QUESTIONS`, `RESPONSES_NOT_APPROVED`); `assembleResponsePackage` (:388-458). | No character refusal. |
| `server/services/agency-responses/response-package-docx.ts` | 56 | One `Paragraph`/`TextRun` per line of every model string. The only file the docx gate admits (`scripts/ci/check-docx-runtime-canonicality.mjs:56`). | Writes C0 characters raw, so `word/document.xml` is not well-formed (probe `scratchpad/s10/probe-docx-fields.out.txt`). |
| `server/routes/c2c/communication-center.ts` | 1,249 | `refuseForeignLetterSources` (:701-734) on `pool`, its only caller `checkCommunicationLinks` (:780-790); the POST's insert on `pool` (:866); `communicationType: z.string().min(2)` (:805). | One of three `cre_source` parsers. |
| `client/src/concept2cure/v2/surfaces/LetterQuestionProposals.tsx` | 87 | One note per unread source (:51-57, with a source id on screen at :55); "No numbered questions…" (:58-60); "In the letter: N numbered questions, found in its text without AI." (:63-66); rows clipped at 220 characters with a `title` tooltip (:68-81). | No "not offered", no reason, no OCR caution, no "Check again", no limit. |
| `client/src/concept2cure/v2/surfaces/AgencyInbox.tsx` | 533 | `letterSourceRef` (:115), `letterSourceIds` (:136-140) returning digit strings. | The third `cre_source` parser. |

**Every caller of the splitter and of the proposals** (completeness critic, 2026-11-02; searched
`splitLetterQuestions|readLetterQuestionProposals|readLetterCommitmentProposals|readLetterSources|question-proposals|draft_fda_ir_response|letterSourceIds|C2C_SOURCE_PINS`
over `server/`, `shared/`, `client/src/`, `tests/`; each is covered where it names):
- **The panel.** GET `.../question-proposals` (`agency-responses.ts:391-403`) is read only by `LetterQuestionProposals.tsx:39`,
  mounted at `AgencyResponses.tsx:653`. Sub-slices 1–9.
- **AnA.** `draft_fda_ir_response` (`AnaToolExecutor.ts:16077-16114`) calls `splitLetterQuestions(irText)` with no
  options. Its input is `ir_text`, the text the model passes ("The full text of the Information Request letter (pasted
  as plain text)", `legacy-import-tool-defs.ts:712-727`), not the letter's stored text, so its words are a verbatim slice of what the
  model sent, and the Word rule and page model never apply to it. §4 (step 18) and §6.
- **MCP: none.** `server/mcp/tools/*` reach AnA handlers only through `callAnaHandler` by name (`reference.ts:25`, `:52`,
  `:60`, `:95`; `validation.ts:157`; `intelligence.ts:33`, `:72`), none of them `draft_fda_ir_response`, and no MCP file
  imports `letter-questions` or `letter-question-proposals`. `c2c_draft_agency_response` (`drafting.ts:70`) drafts from a
  deficiency its caller pastes and splits nothing. Nothing in this design changes an MCP tool.
- **AgencyInbox.** It calls no splitter. `letterSourceIds` (`AgencyInbox.tsx:136-140`) feeds three callers:
  `letterSourceOptions` (:152), the card's "letter in the data room" (:398), and `draftResponseWithAna` (:174-178,
  also called from `CommunicationCenter.tsx:561`), which pins the ids for AnA's next turn (`window.C2C_SOURCE_PINS`,
  read once at `useAnaChat.ts:1828-1842`). That pin is how AnA reads the letter before it calls
  `draft_fda_ir_response`. Sub-slice 5 changes `letterSourceIds` and covers all three (§3.5).
- **GET `.../commitment-proposals`** (`agency-responses.ts:408-418`): no client caller (§6). It shares `readLetterSources`,
  so sub-slices 3, 4 and 9 change it.

**Reused as they stand** (imported, never changed, unless a row says otherwise):
- `getSource` (`server/services/clinical-regulatory-evidence/evidence-spine.service.ts:501`);
- `sourceHasGroundingText` (:122), `sourceReadView` (:130) and `readExtractionCoverage` (:43), all in
  `shared/data-room-processing-status.ts`;
- `readCaptureExtractionEvidence` (`server/services/clinical-regulatory-evidence/capture-extraction-evidence.ts:61`);
- `pageForOffset` (`server/services/ocr/page-offsets.ts:85`), only to name a page;
- `getCurrentReadableSourceScope` (`source-read-access.ts:85`) and `requireSourceReadScopeStillCurrent` (:117);
- `requireCurrentProgramAccess` (`server/services/c2c/current-program-access.ts:129`);
- the admission sequence inline in `server/services/authoring/authoring-assembly-sources.ts:134-152` (exported by
  sub-slice 3, F1);
- `compareQuestionRefs` (`response-logic.ts:187`);
- `RESPONSE_STATE_LABEL` (`client/src/concept2cure/v2/surfaces/agencyQuestionState.ts:14`);
- the existing `.cc-q-*` classes and D0's `btn ghost small`.

**Harvested from slice 3** (`2bea758ba`, in the object store only), as ideas moved into the existing
`shared/agency/letter-questions.ts`, never as its files:
- from `server/services/agency-responses/question-labels.ts`: `endsSentence` :190, `runsOn` :211, `headingShaped`
  :251, `vocabularyHeading` :282, `strongHeading` :289, `SIGNATURES`/`isSignature` :346, `CLOSERS`/`isCloser` :341
  and `RESPONSE_BOUNDARY` :354;
- from `letter-pages.ts`: its `FURNITURE_PATTERNS` (:138-160) and its rule that an application number is furniture
  only with a second sign.

**Found and deliberately not reused:** `XML_ILLEGAL_CHARS` (`server/services/submission-gateways/ectd-packager/paths.ts:19`).
- It is a server file, and the splitter is in `shared/`.
- It strips, and THE CONTRACT forbids stripping.
- Its class adds DEL and C1. The precision audit found those leave the package well-formed, and refusing them would
  stop 131 more otherwise-clean questions (`reuse-map.md` §I.4).
- It is a `/g` regex, so `.test()` carries state.
- It omits lone surrogates, which the DOCX writer silently rewrites as U+FFFD.

The two classes serve different acts (strip for eCTD XML; refuse for the agency's words), so this is not duplication.

---

## 2. How this design was measured

**The prototype.** `scratchpad/s10/proto/letter-questions.proto.ts` and `proposals.proto.ts` implement every rule
below. `opts.steps` switches each sub-slice's rules on or off, so each one's cost is measured on its own.
- With every step off it equals trunk's `splitLetterQuestions` on all 1,232 stored texts of the saved run (refs,
  words, start and end): `scratchpad/s10/proto/selfcheck.mts`, "0 differ".
- It keeps trunk's pinned test letters' refs, words and offsets: `scratchpad/s10/proto/pins.mts`.

**The adapted oracle.** `scratchpad/s10/proto/oracle-g3-adapted.mts` is a copy of `redteam/oracle-g3.mts` with four
changes, each taken from the slice-3 oracle `redteam/oracle.mts` (lines 379-380, 665-718) or required by the product
behaviour this design adds:
1. A proposal maps to `offered = notOffered == null`, not `offered: true`.
2. A finding about a question that is not offered is a NOTE. This is the slice-3 oracle's level rule: the harm is said.
3. Set findings (P6-inner, P3-duplicate) are violations when **any** proposal they name is offered (`outAny`).
4. A line the screen shows (a heading or lead-in shown above the next question, or an unnumbered section the letter
   names) is not a dropped line for P3-coverage.

It calls the pure proposal function with the receipt's page spans instead of a stub SQL client (sub-slice 1 makes the
proposal step pure, §3.2).

**Revision 2's oracle** (`scratchpad/s10/r2/proto/oracle-g3-adapted.mts`) adds five changes, each closing a place where
the adapted oracle leaned on the splitter's own claim (critique items 1–4 and 8). `ORACLE_R1=1` switches all five off.
5. A letter note's unnumbered-section lines count as shown only when no numbered line follows them before the sign-off,
   by the oracle's own opener and sign-off reading (item 2).
6. P3-duplicate checks the harm it names, by behaviour: a violation when two offered holders of one number are prefilled
   with the same reference, or when recording one offered holder's prefilled reference and words marks another
   proposal "Recorded" (the service is re-run with that one question recorded). On trunk every holder is offered and
   prefilled with the bare number, so it is red exactly where it was (item 8).
7. A quoted message's header block ("-----Original Message-----", or "From:" with "Sent:"/"Date:" and "Subject:" in
   the next three lines) ends the letter's own words, whatever its sign-off phrase (item 3).
8. The last question's tail check stops at the closing phrases as they read inside a question's words
   (`IN_WORDS_CLOSING`), not at `CLOSING`, which held the request-shaped phrases (item 1).
9. The P6-inner set finding of the "question N followed by 1…m then N+1" form names the inner list's proposals, not the
   outer question too: the harm it names is the inner list offered (an offered outer question whose words end at its
   response boundary is not that harm).

Trunk under the revision-2 oracle: 3,292 violations, 742 inputs failing (P6-signature "quoted
e-mail" 6 → 9, P3-coverage 101 → 102); with `ORACLE_R1=1` it reproduces the saved trunk run exactly, 3,288
and 741 (`scratchpad/s10/r2/out/trunk-oracleR1.summary.txt`). The r1 design's own prototype, run through the
revision-2 oracle, has 11 contract-relevant violations where the r1 oracle saw 7
(`r1design-under-r2oracle.summary.txt`): it now sees `d6`'s dropped requests, `e8c`'s quoted e-mail question and
`rf03`'s section with questions after it. It still does not see `f02`'s or `f06`'s heading word loss; the reader list and
the trunk-diff gate do (below), which is why neither oracle is the evidence on its own.

**The adapted oracle was shown failing on trunk first.** With every rule off it reproduces the saved trunk run
exactly: 3,288 violations, 741 failing, every clause equal (`STEPS=` run, `scratchpad/s10/proto/out/steps-none.json`).
So the adaptation does not loosen anything on trunk's output.

**How to re-run** (from the repository root, read-only; revision 2):

    P=/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad
    LOG_LEVEL=silent PROTO=$P/s10/r2/proto RT=$P/redteam STEPS=5,6,11,15,16,17 npx tsx $P/s10/r2/proto/run-proto.mts out.json
    python3 -I $P/s10/r2/proto/summarize.py out.json $P/s10/audit/baseline-rows.json "label"
    python3 -I $P/s10/r2/reader/family.py $P/s10/r2/out/r2-trunk.json out.json      # the reader list, by family
    python3 -I $P/s10/r2/reader/extra.py out.json                                  # offers on no reader-list line
    python3 -I $P/s10/r2/trunk-diff.py $P/s10/proto/out/all-none.json out.json --realistic   # the gate
    $P/s10/r2/run-matrix.sh; $P/s10/r2/ablation.sh <run names>                     # every step, switch and variant

`DUP_ALL=1` is no longer the recommended mode (§3.8). The self-check still holds: with every step off the revision-2
prototype equals trunk on all 1,232 stored texts ("0 differ"), and it keeps trunk's pinned letters' refs, words and
offsets (`s10/r2/proto/selfcheck.mts`, `pins.mts`). The self-check takes a saved run with stored texts as its argument:
`npx tsx $P/s10/r2/proto/selfcheck.mts $P/s10/r2/out/r2-trunk.json` (re-run by the completeness critic, 2026-11-02:
"1232 stored texts, 0 differ"; `pins.mts`: all four pinned letters "same refs/words/offsets: true").

**The per-step table** (cumulative, revision 2 prototype through the revision 2 oracle;
`scratchpad/s10/r2/out/tables.md`; the r1 table is `scratchpad/s10/proto/out/tables.md`):

| Clause | trunk | +5 | +6 | +11 | +15 | +16 | +17 |
|---|---|---|---|---|---|---|---|
| P2-furniture | 747 | 360 | 246 | 246 | 247 | 237 | 0 |
| P1-foreign: heading | 540 | 507 | 312 | 263 | 84 | 0 | 0 |
| P5 C0 that breaks the DOCX | 472 | 0 | 0 | 0 | 0 | 0 | 0 |
| P6-merged: other numbering | 408 | 408 | 406 | 356 | 0 | 0 | 0 |
| P3-duplicate | 375 | 369 | 0 | 0 | 0 | 0 | 0 |
| P5 DEL/C1 only (audit: package well-formed) | 198 | 198 | 141 | 141 | 133 | 149 | 123 |
| P6-signature: after sign-off | 111 | 111 | 39 | 39 | 39 | 0 | 0 |
| P3-coverage | 102 | 101 | 100 | 100 | 76 | 7 | 7 |
| P1-foreign: response | 67 | 67 | 43 | 43 | 31 | 0 | 0 |
| P4-guess | 66 | 66 | 64 | 64 | 9 | 0 | 0 |
| P5 tab only (audit: not a violation) | 63 | 63 | 44 | 44 | 41 | 47 | 33 |
| P6-signature: signature | 35 | 34 | 31 | 31 | 12 | 0 | 0 |
| P6-inner | 28 | 28 | 14 | 14 | 2 | 0 | 0 |
| P6-merged: merged question | 24 | 20 | 20 | 20 | 0 | 0 | 0 |
| P1-foreign: lead-in | 17 | 16 | 16 | 16 | 18 | 0 | 0 |
| P1-foreign: closing | 10 | 9 | 7 | 7 | 1 | 0 | 0 |
| P6-signature: quoted e-mail | 9 | 9 | 3 | 3 | 3 | 0 | 0 |
| P3-heading | 9 | 9 | 2 | 2 | 1 | 0 | 0 |
| P1-foreign: section | 8 | 8 | 6 | 6 | 3 | 2 | 0 |
| P3-coverage: Word-numbered paragraph dropped | 2 | 2 | 2 | 2 | 2 | 1 | 1 |
| P6-merged: Word-numbered paragraph | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| **All violations** | 3,292 | 2,386 | 1,497 | 1,398 | 703 | 444 | 165 |
| **Contract-relevant** (all but TAB and DEL/C1) | 3,031 | 2,125 | 1,312 | 1,213 | 529 | 248 | 9 |
| **Inputs failing** | 742 | 644 | 523 | 522 | 416 | 251 | 82 |
| **Realistic letters: offered** | 187 | 183 | 132 | 132 | 117 | 138 | 132 |

How to read the table:
- Sub-slices 3, 4 and 5 (steps 7, 9, 10) are source-level. The oracle reads one fully read, current source, so they
  change nothing here. Their proof is their own PGlite tests.
- A clause can rise for one step and fall later. P2-furniture rises by one at +15 and P1-foreign lead-in by two, as
  order rules stop refusing questions whose other faults later steps fix; the audit's DEL/C1 and TAB false positives
  rise at +16 because more questions are offered. Offered on the realistic letters rises to 138 at +16 and falls to 132
  at +17, as furniture inside words is flagged.
- **The oracle's recall gaps** (`fixtures.md` §2) have no oracle red. They get direct assertions instead: gaps, a list
  starting above 1, out-of-order numbers, a wrapped number, numbered section headings, and checks after a cover
  letter's sign-off.

**The usefulness baseline.** The manual read in `scratchpad/s10/audit/baseline-rows.json` marks 70 of trunk's 187
proposals on the 49 realistic letters clean. That baseline is the budget: **no sub-slice may stop offering any of the
70.** Each sub-slice's evidence re-runs `summarize.py` and quotes "of the 70 clean today, still offered N".

That budget cannot see over-refusal: a row counted as clean only when trunk's oracle attributed no violation to it and
its number was unique, so it excluded by construction every question sharing a number, every question after a sign-off
and every minutes question trunk glued to its response (critique 9). Revision 2 adds three measures, run in every
sub-slice's evidence:
- **The reader list** (`scratchpad/s10/r2/reader/reader-list.txt`): the 177 questions a reader would record from the 49
  letters, written by hand from their text, never from the oracle or the splitter, each with the words it starts and
  ends with, its form family, and whether one verbatim slice can hold exactly those words (147 can). `reader/family.py`
  reports, per family, questions offered with the reader's words, offered with other words (a contract failure), and
  not offered.
  - **The floor:** no sub-slice leaves a family below trunk's usable offers (offered with the reader's words and a
    number no other proposal of the letter holds; 70 in all), and no question is offered with other words.
  - **The over-refusal list:** every cuttable question a sub-slice does not offer is named in its evidence with its
    reason, and read. A sub-slice that adds a name must say why the contract requires it.
- **The trunk-diff gate** (`scratchpad/s10/r2/trunk-diff.py`): every offered question whose slice differs from trunk's
  for the same label, each dropped or added line classified by a table written from the agency templates (furniture,
  sign-off or quoted message, response, closing, heading after a finished sentence, lead-in, trunk's own closing cut);
  every row the table does not explain is read by hand and filed.
- **The wrapped-number check** (same script): an offered question whose next numbered line starts with a lower-case
  word. It compares with nothing, so it sees a cut trunk also gets wrong.

**The reader list, by family** (questions offered with the reader's words / offered with other words / not offered,
of the cuttable ones; `scratchpad/s10/r2/reader/family.py`):

| Family | Listed | Cuttable | Floor | trunk | after sub-slice 2 | after 7 | after 8 | after 9 (revision 2) | r1 design, all steps |
|---|---|---|---|---|---|---|---|---|---|
| IR | 95 | 82 | 59 | 62 / 20 / 0 | 59 / 19 / 4 | 60 / 18 / 4 | 75 / 5 / 2 | **80 / 0 / 2** | 76 / 0 / 6 |
| CRL | 22 | 19 | 7 | 10 / 9 / 0 | 7 / 8 / 4 | 8 / 8 / 3 | 14 / 4 / 1 | **19 / 0 / 0** | 15 / 0 / 4 |
| Clinical hold | 5 | 4 | 0 | 2 / 2 / 0 | 0 / 1 / 3 | 1 / 0 / 3 | 3 / 0 / 1 | **3 / 0 / 1** | 1 / 0 / 3 |
| Advice | 5 | 5 | 2 | 2 / 3 / 0 | 2 / 3 / 0 | 2 / 3 / 0 | 4 / 0 / 1 | **4 / 0 / 1** | 4 / 0 / 1 |
| Minutes, preliminary comments | 12 | 12 | 0 | 0 / 12 / 0 | 0 / 6 / 6 | 0 / 0 / 12 | 6 / 2 / 4 | **8 / 0 / 4** | 0 / 0 / 12 |
| EMA LoQ | 23 | 22 | 0 | 8 / 14 / 0 | 0 / 4 / 18 | 1 / 1 / 20 | 11 / 1 / 10 | **15 / 0 / 7** | 4 / 0 / 18 |
| CDRH AI | 12 | 3 | 2 | 2 / 1 / 0 | 2 / 1 / 0 | 2 / 1 / 0 | 3 / 0 / 0 | **3 / 0 / 0** | 3 / 0 / 0 |
| PMDA | 3 | 0 | 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | **0 / 0 / 0** | 0 / 0 / 0 |
| **All** | **177** | **147** | **70** | 86 / 61 / 0 | 70 / 42 / 35 | 74 / 31 / 42 | 116 / 12 / 19 | **132 / 0 / 15** | 103 / 0 / 44 |

How to read it:
- Every column meets every family's floor. "Other words" falls at every step, 61 → 42 → 31 → 12 → 0, and offers on no
  reader-list line fall 22 → 9 → 1 → 0 → 0 (`reader/extra.py`: trunk offers enclosure items, inner-list items, numbered
  headings and the minutes' action items). Sub-slices 1, 3–6 change neither (their columns equal the one before).
- Sub-slices before 9 still offer some questions with other words (trunk-shaped failures the later sub-slices fix: page
  furniture until sub-slice 9, headings and responses until 8). The rule each sub-slice's evidence holds to is that the
  column never rises and that every changed slice is a gate row read by hand.
- The 15 cuttable questions revision 2 does not offer, each with its reason, are the over-refusal list:
  - EMA LoQ (7): `control-in-heading.docx` question 1 (`repeated-number`: its heading "Majorobjections" holds a control
    character, so it is no strong heading and the path is empty); `ema-loq.pdf` "Provide the in-use stability data."
    (`page-furniture`: its words run on into "Assessment report" on the next page, which no rule knows as furniture),
    and the clinical "1." after it (`inner-list`: the unclear headings stayed in the words before it, §6);
    `ema-reference-at-foot.txt` question 2 (`page-furniture`: the running "Assessment report", weak since critique 4);
    `ema-restart-after-list.docx` question 2 (`heading-unclear`: "Other concerns" after the list line "Dissolution")
    and the two questions after it (`inner-list`);
  - IR (2): `fda-restart-after-lots.docx` question 1 (`heading-unclear`: "Clinical" after "Lot 21-002") and the
    "1." after it (`inner-list`);
  - hold (1): `rf03` "Provide the Investigator's Brochure…" (`closing-inside`: the hold template's closing paragraph);
  - minutes (4): `rf06` Questions 1–4 (`after-sign-off`: enclosed after the cover letter's sign-off, §6);
  - advice (1): `rf07` question 5 (`closing-inside`: "…If you have any questions," mid-line).

  Each is the contract's price (the splitter cannot tell) or a known gap named in §6.

---

## 3. The sub-slices, in the plan's order

Each sub-slice is one reviewed commit. Every one also does what the re-plan's §3 preamble lists:
- read `COORDINATION.md` after a fetch, and send the coordinator the package, step and file list;
- save the red run before the change, and show each mutation red on its own assertion;
- file evidence under `docs/evidence/D2-WEAVE-GAP/2026-11-0x/question-extraction-<slug>/README.md` (G3's own evidence
  is `docs/evidence/D2-WEAVE-GAP/2026-10-29/question-extraction/`), with a "What already exists" section;
- run the gates: `node scripts/ci/check-one-design-plan.mjs --range origin/concept2cure-v2..HEAD`,
  `npm run ci:one-product`, `npm run audit:repo-health:ceiling`, and the touched suites;
- open the screen in the running app and use it (RULE 4) before calling a screen change done.

Every file list was checked against the ledger with the gate's own `globToRegExp`: all inside, every `Completes:`
path exists at HEAD, and the only new files are tests and evidence. Revision 2 adds `AgencyResponses.tsx` (the Record
prefill) and the pure proposal test to sub-slice 8, and the pure test to sub-slice 9; re-checked
(`scratchpad/s10/r2/check/check-s10-r2.mjs`, output `check-s10-r2.out.txt`, "ALL INSIDE"; re-run by the completeness
critic on 2026-11-02 at `609ef94c7`, still "ALL INSIDE"). The completeness critic's additions are test cases in
existing or new test files (`communication-center.test.ts`, `authoringAgencyResponseWriteback.pglite.integration.test.ts`,
`communicationDraftCarriesLetter.test.tsx`, the proposal suites), all under the ledger's `alwaysAllowed`, and no source
file outside each sub-slice's list.

### 3.0 The shape every sub-slice shares (introduced by sub-slice 1, extended by the others)

**In `shared/agency/letter-questions.ts`** (one file, about 450 lines when all steps land; the 1,500-line ceiling is
far off; no new file):

    export const QUESTION_TEXT_MAX = 20000;   // the POST's limit, now one definition (the route imports it)
    export const QUESTION_REF_MAX = 40;
    export type NotOfferedRule =
      | 'character' | 'too-long' | 'ref-too-long'                                   // sub-slices 1, 6
      | 'repeated-number' | 'withdrawn'                                             // sub-slice 2 (set by the service)
      | 'gap' | 'starts-above-one' | 'restart' | 'inner-list' | 'outer-numbering'
      | 'merged-number' | 'starts-mid-sentence' | 'ends-mid-sentence'               // sub-slice 7
      | 'after-sign-off' | 'in-response' | 'heading-only' | 'heading-unclear'
      | 'ends-with-colon' | 'closing-inside' | 'unplaced-lines'                     // sub-slice 8
      | 'page-furniture';                                                           // sub-slice 9
    export interface NotOffered {
      rule: NotOfferedRule;
      line: number;          // 1-based line of the stored text; for tests and AnA, never shown
      at: number;            // offset of that line's start; the service turns it into a page (below)
      quote: string;         // that line as a reader sees it, cut on a word boundary at 80 characters, "…" where cut
      detail?: string;       // e.g. the missing number, the character and the words around it, the other line
    }
    export interface ShownLine { kind: 'heading' | 'lead-in'; line: number; start: number; end: number } // letter.slice(start, end) is the raw line, trimmed
    export interface LetterQuestion {
      ref: string; text: string; start: number; end: number;           // unchanged: text === letter.slice(start, end)
      notOffered?: NotOffered;                                          // absent: offered
      above?: ShownLine[];                                              // shown above it, not in its words (sub-slice 8)
      path?: string[];                                                  // the headings it sits under, verbatim (sub-slice 8)
    }
    export interface LetterNote {
      kind: 'sign-off' | 'quoted-message' | 'unnumbered-section' | 'responses' | 'page-edges-unknown';
      quote: string; line: number; at: number; count?: number;          // count: the questions an agency response follows
    }
    export interface ReadOptions { pageSpans?: ReadonlyArray<{ page: number; start: number; end: number }> | null; method?: string | null }
    export function readLetterQuestions(letter: string, opts?: ReadOptions): { questions: LetterQuestion[]; notes: LetterNote[] };
    export function splitLetterQuestions(letter: string, opts?: ReadOptions): LetterQuestion[]; // = readLetterQuestions(...).questions
    export function forbiddenCharacter(s: string): { index: number; codePoint: number } | null;

**Who names a page** (revision 2, critique 18). The splitter returns lines and offsets only. It uses `pageSpans` for one
thing: deciding that a line lies between two pages (containment; `pageForOffset` gives such a line to the next page,
`reuse-map.md` §E). `ReadOptions.pageSpans` is typed structurally because `shared/` imports no server code, so it
cannot name `PageSpan` (`page-offsets.ts:34`). The service fills the page that a sentence says, after the split:
- for PDF, `pageForOffset(spans, at)` (`page-offsets.ts:85`), the one lookup;
- for plain text, one plus the number of form feeds before `at` (the splitter's own page model, where a form feed at a
  line's start puts that line on the next page);
- for Word, and for PDF with no valid receipt, no page, and the sentence leaves "{ on page N}" out.

No page is named before sub-slice 9, which brings both the receipt read and the page model (§3.9). Until then every
"{ on page N}" in sub-slices 1–8's sentences is left out (completeness critic: the receipt is read only from sub-slice 9).

One assertion pins it: for a reason on a PDF fixture, the page in the payload equals `pageForOffset(spans, at)` for
the flagged line.

**Quotes** (revision 2, critique 24). Every quote is the line as a reader sees it, cut on a word boundary at 80
characters, with "…" where it is cut. A `character` reason's detail names the character and the visible words on each
side of it, about 30 characters each: 'between "selected apparatus, media and" and "rotation speed."' (measured on
`P5-control-other/form-feed-page-break.txt`, `scratchpad/s10/r2/checks.mts`). A quote never stands in for the agency's
words: those are `text`, and the lines above a question are `letter.slice(start, end)` (critique 19).

**The one reason.** A question carries at most one reason, the first that applies in this order: character,
after-sign-off, in-response, page-furniture, merged-number, starts-mid-sentence, ends-mid-sentence, closing-inside,
heading-only, heading-unclear, ends-with-colon, unplaced-lines, too-long, ref-too-long, then the order rules, then the
service's repeated-number and withdrawn.

**Compatibility.**
- `splitLetterQuestions(letter)` keeps its signature and its array. No question is ever removed from the array, so
  AnA's caller (`AnaToolExecutor.ts:16088`, an S4 file held by `011Fyq…`) keeps working unchanged, and the pin at
  `server/services/ana/__tests__/new-tool-handlers.test.ts:182-196` stays green.
- Until sub-slice "later 18" lands, AnA lists questions the panel does not offer, without the reason (§4).

**Reading lines.** Every structural test reads a line as a reader sees it:
- control and invisible format characters are removed (soft hyphen, zero-width characters, bidi marks, BOM);
- Unicode spaces (no-break, narrow no-break, figure, ideographic) read as a space.

This is reading, not rewriting: the words are always the raw slice. It is what lets "Kind regards," be a
sign-off, and "Sinc­erely," too.

**Linear time.** Every rule runs in time linear in the letter, with precomputed next-opener, previous-line and
heading-count indexes. The prototype measured why this must be a rule and a test:
- a pairwise duplicate count stalled the full run;
- a per-line backward scan timed out on the 50,000-line input;
- the inner-list walk took 33 s on `redteam/probes/big-crafted.txt` (24,000 questions) until it advanced past each run.

Each fix brought the time to 0.1–0.2 s (`scratchpad/s10/proto/time-one.mts`). Sub-slice 7 adds the timing test.
Revision 2's splitter, re-timed on `big-crafted.txt`: 0.17–0.40 s per step and 0.50 s with every step on
(`scratchpad/s10/critic-completeness/time-one-r2.out.txt`).

**The proposal step must be linear too** (completeness critic, measured): revision 2's told-apart pass (§3.8, "Repeated
numbers told apart") scans every other holder for every holder and every tail length, so it is quadratic in the holders
of one number. A synthetic letter of k sections, each a distinct heading over "1. … 2. …", takes 0.2 s at k = 500,
2.5 s at 2,000, 26.7 s at 6,000 and 87 s at 12,000 (`scratchpad/s10/critic-completeness/time-qualify.out.txt`); the
splitter alone takes 0.18 s at 6,000, and the same step with `R2_OFF=qualify` 0.2 s
(`time-qualify-split.out.txt`). GET `.../question-proposals` runs it on every read. Sub-slice 8 therefore counts tails
with a `Map` (one pass per tail length over the holders, keyed by the visible tail) and carries its own timing test.

**In `letter-question-proposals.ts`.** `readLetterQuestionProposals(client, scope, recorded)` becomes
`readLetterSources` (the reads) followed by a new exported pure function in the same file:

    proposeLetterQuestions(sources: Array<{ sourceId; title; text; pageSpans?; method? }>, recorded: Array<{ id; questionRef; questionText; withdrawnAt }>)

The pure function holds the split, repeated numbers, recorded and withdrawn matching, the page a sentence names, and
the listing limit. Unit tests reach it with no database, and the oracle calls it directly. The payload grows these
fields:
- `sources[].state`: the shared union of sub-slices 3–5, plus `ocr`, `coverage`, `retained` and `word` (true when
  `provenance.extractionMethod === 'docx'`, the method `extractDocumentText.ts:32` names and `:218` sets for a Word
  file; the panel's Word caution of sub-slice 6 reads it, and nothing else in the payload says a letter is Word);
- `proposals[].notOffered` (with `page`, filled as above), `proposals[].above` (each with its verbatim `text`),
  `proposals[].recordedRef`, and `proposals[].recordRef` (the reference the Record form is prefilled with: the
  agency's number, or the suggested reference of sub-slice 8);
- `notes[]` (with `page`);
- `total`.

The route passes every recorded question with its words, withdrawn included (sub-slice 2), so "Recorded" can match by
words as well as by number.

**In `LetterQuestionProposals.tsx`.** One sentence per `NotOfferedRule` and per source state, written as a
`Record<NotOfferedRule, …>` so the typecheck refuses a rule without words. No enum, rule name, line number or id
reaches the screen.

### 3.1 Sub-slice 1 (re-plan step 5, F1-4a): no control character reaches the response package (H1)

**What already exists.**
- No character rule anywhere in the path (`code-map.md` §2.4-2.7).
- `questionBody` (`agency-responses.ts:134-141`), `responseBody` (:143-149), `commitmentBody` (:156-162) and
  `communicationType` (`communication-center.ts:805`) accept any character.
- `renderResponsePackageDocx` (`response-package-docx.ts:30-56`) writes every model string raw. The probe in
  `scratchpad/s10/probe-docx-fields.out.txt` put U+0007 in each field in turn, and each made `word/document.xml`
  ill-formed.
- `agencyResponseDigest` (`response-logic.ts:62`) binds a recorded question's text, so a recorded row can only be
  refused, never cleaned.
- `PackageResult` (:348-350) has no code for it.
- There is no DOCX unit test.

**The rule.**
- `forbiddenCharacter` (in `shared/agency/letter-questions.ts`) finds the first character that is:
  - a C0 control other than TAB, LF and CR;
  - U+FFFE or U+FFFF;
  - a lone surrogate (high without its low, or low alone).
- TAB, LF, CR, DEL, NEL, the C1 controls and valid surrogate pairs are allowed: the agency's own characters, legal in
  XML 1.0.
- The splitter marks a question holding one `character`, naming the line and the character. Nothing is removed.
- Every write that feeds the package refuses it, with a sentence:
  - `questionBody` (ref, text, discipline, section);
  - `responseBody.responseText`, and the saved editor's text through `responseFromSavedEditor`;
  - `commitmentBody` (description, basis);
  - `communicationType` in `communication-center.ts`.
- Where the response check sits (completeness critic): in the PUT route, on the text it is about to save,
  `editor ? editor.responseText : input.responseText` (`agency-responses.ts:510-512`), so the typed text and the saved
  editor's text pass one check before `saveResponseTx`; `editor-response.ts` (`responseFromSavedEditor`, :90) is not
  changed.
- `assembleResponsePackage` refuses rows recorded before the rule with `{ ok: false, code: 'FORBIDDEN_CHARACTER' }`,
  naming the question's number and the field. It checks every model string: the title (`communicationType`,
  `eventId`), the header, and each section's ref, discipline, question, response and signature line, plus each
  commitment line. It covers both formats, and the route already answers `!built.ok` with 409.
- `renderResponsePackageDocx` asserts the same, as a last line, so a future model field cannot slip through.

**Files** (all S10):
- `shared/agency/letter-questions.ts` (`forbiddenCharacter`, `QUESTION_*_MAX`, the `NotOffered` shape);
- `server/services/agency-responses/response-logic.ts`;
- `server/services/agency-responses/response-package-docx.ts`;
- `server/routes/c2c/agency-responses.ts` (refines; zod limits from the shared constants);
- `server/routes/c2c/communication-center.ts` (one refine at :805);
- `server/services/agency-responses/letter-question-proposals.ts` (passes `notOffered` through);
- `client/src/concept2cure/v2/surfaces/LetterQuestionProposals.tsx` (the reason).

**Red tests** (fixtures from `scratchpad/s10/fixtures/` by clause, inlined as their stored text from
`scratchpad/s10/results.json` field `text`; no binary is committed):
- `shared/agency/__tests__/letter-questions.test.ts`, "P5-control: other control":
  - `P5-control-other/form-feed-page-break.txt` (FF);
  - `ligature-as-etx.txt` (U+0003, a ligature an extractor mis-read);
  - `word-manual-line-break-vt.txt` (VT).

  In each, question 2 is not offered with rule `character`, its line named. Questions 1 and 3 are offered, verbatim.
  Red on trunk (no field). The form-feed fixture's detail contains "media and" and "rotation speed" (the words on each
  side of the FF at column 92), and a quote taken from an 81-character line ends with "…" (critique 24).
- The same file, **green guards** ("P5-control: tab only", the audit's false positives): `P5-control-tab/tab-in-word-paragraph.docx`,
  `tab-indented-subitems.txt` and `tab-separated-lot-table.txt` stay offered, verbatim, with their TABs.
- `server/services/agency-responses/__tests__/response-logic.test.ts`:
  - `forbiddenCharacter` returns a character for NUL, BEL, VT, FF, U+001B, U+FFFE, U+FFFF, a lone U+D800 and a lone
    U+DC00;
  - it returns null for TAB, LF, CR, DEL, NEL, U+0092, U+2028 and an emoji (a valid pair);
  - `assembleResponsePackage` refuses, naming the field, for one row per field: questionRef, discipline, questionText,
    responseText, signer name, commitment description, commitment basis, communicationType and eventId.
- New `server/services/agency-responses/__tests__/response-package-docx.test.ts`, modelled on
  `scratchpad/s10/tools/docx-write.mts`:
  - a model with U+000B in `responseText` must throw. On trunk it writes, and `word/document.xml` fails to parse with
    `@xmldom/xmldom` (already a dependency), so the test is red;
  - a model with TAB, DEL and an emoji parses well-formed.
- `tests/db/agency-response-signed-approval.dbtest.ts` (real PostgreSQL; the builder runs it, this session does not):
  POST `.../questions` with a VT refuses, and so does PUT `.../response` with a BEL.
- **Added by the completeness critic** (each write the rule names had no red test; re-plan step 5 names the proposals
  suite):
  - `letter-question-proposals.pglite.test.ts`: a linked source whose stored text holds a VT in question 2 gives
    proposal 2 `notOffered.rule === 'character'`, proposals 1 and 3 offered (red: no field today);
  - `agencyResponsesLetterProposals.test.tsx`: a `character` row shows its sentence with the words around the
    character, and no Record button (sub-slice 1 is the first to put a not-offered row on screen);
  - `server/routes/c2c/__tests__/communication-center.test.ts` (existing stub app; its POST
    `.../agency-communications` cases are at :273-317): a VT in `communicationType` is refused 400 before any insert;
  - `server/routes/__tests__/authoringAgencyResponseWriteback.pglite.integration.test.ts` (existing; registers the real
    routes on PGlite and records saved editor text, :288): PUT `.../response` with `editorSource` whose saved section
    text holds a VT is refused, and no revision is written;
  - the dbtest: POST `.../commitments` with a BEL in `description`, and again in `regulatoryBasis`, is refused; POST
    `.../questions` with a VT in `discipline` is refused;
  - green guard, `scratchpad/s10/attempts/P6-order/cr-only-and-nel-lines.txt` (not placed before): NEL and U+2028
    inside the words stay offered, verbatim (revision-2 fixture run, `r2/out/fx-r2.json`: both offered; the oracle's
    one finding there is the audit's DEL/C1 class).

**Mutations** (each must turn its own test red):
1. Admit FF: the form-feed fixture goes red.
2. Drop the lone-surrogate branch: the U+D800 case goes red.
3. Drop U+FFFE and U+FFFF: those cases go red.
4. Refuse TAB: the three tab guards go red.
5. Check only `questionText` in the assembler: the responseText, commitment and communicationType cases go red.
6. Remove the DOCX writer's assert: the new DOCX test goes red.
7. Remove the POST refine: the dbtest goes red.
8. Quote the line's first 80 characters instead of the window around the character: the form-feed detail test goes red.
9. Drop `notOffered` in the service's mapping: the PGlite character case goes red.
10. Remove the `communicationType` refine: the stub-app case goes red.
11. Check `input.responseText` only, not the editor's text: the editor case goes red.
12. Remove the commitment refine (description or basis): its dbtest case goes red.
13. Admit NEL or U+2028 as forbidden: the `cr-only-and-nel-lines.txt` guard goes red.

**Oracle expectation.** "P5 C0 that breaks the DOCX" goes from 472 to 0 as violations; they become NOTEs on questions
not offered. All violations 3,292 → 2,386 under the revision-2 oracle. "P5 DEL/C1 only" (198) and "P5 tab only" (63)
stay. They are the precision audit's false positives, and the evidence runs the oracle with `--allow-tab` and lists the
DEL/C1 findings as admitted.

**Usefulness budget.** On realistic letters, offered goes from 187 to 183. The 4 not offered all hold a C0 character.
Clean: 70 → 70. Reader list: 86 / 61 / 0, as trunk (the 4 are questions no verbatim slice can hold cleanly).

**Words** (revision 2: the place of the character is named, critique 24; every remedy is one trunk has, critique 17).
- Row: "Its words hold an unprintable character (a page-break character) {between "…" and "…"}{ on page N}, which the
  response package cannot carry. Record it with Record question, typing the words as the letter shows them; do not
  copy them from the full words above, which hold the character."
- Names by character: FF "a page-break character", VT "a line-break character", others "an unprintable character".
- POST and PUT refusals name the field and the words just before the character: "The question's words hold an
  unprintable character after "{about 30 visible characters}", which the response package cannot carry. Type the words
  as the letter shows them. Nothing was recorded." The response's: "…The response holds an unprintable character
  after "…". Nothing was saved."
- Package refusal, one sentence per field, each naming a remedy that exists on trunk, or saying there is none:
  - question number, discipline or words: "Question {ref}'s {field} holds an unprintable character after "…", so the
    package was not assembled. A recorded question's words cannot be changed; withdraw it (Withdraw,
    `agency-responses.ts:525`) and record it again under a reference not already used on this letter.";
  - response: "Question {ref}'s response holds an unprintable character after "…". Edit the response; its approval is
    then signed again.";
  - commitment description or basis: "Commitment {n} of question {ref} holds an unprintable character after "…", which
    the package cannot carry. A commitment's description cannot be corrected here yet. Withdrawing question {ref}
    takes it and its commitments out of the package." (No route edits a commitment's description or basis:
    `agency-responses.ts:425` and `:595` only create, `ha-service.ts:353` only sets fulfilment, and the fulfilment
    guard of `migrations/20261019_commitment_fulfilment_evidence.sql` freezes both once a fulfilment is recorded. The
    correction is re-plan step 36, P-88, still pending.);
  - letter type (`communicationType`): "This letter's type holds an unprintable character, so the package was not
    assembled. A letter's type cannot be changed here yet." (`communication-center.ts` has one PATCH, `/advance`,
    `:938`.);
  - signer name on an approval: "The approval of question {ref} names its signer with an unprintable character. A
    signature record cannot be changed." (`electronic_signatures.signer_name` is fixed when the signature is made.);
  - `eventId` is server-generated (`ace_${Date.now()}_${hex}`, `communication-center.ts` near `:840`) and cannot hold
    one. The assembler still checks it, as a last line, and its refusal names no remedy.
- The refusal stays (fail closed). The package-blocking rows with no remedy are named in §6.

**Trailers.**

    Plan: S10
    Completes: server/services/agency-responses/response-logic.ts
    Completes: server/services/agency-responses/response-package-docx.ts
    Completes: shared/agency/letter-questions.ts

The re-plan labelled this step F1-4a. Every file is S10's, and S10's assignment to RIM is the precondition anyway
(re-plan §6). F1 stays the fallback if the coordinator prefers it.

**Coordinate with:** the coordinator (record RIM on S10) and `011Dpx…` (G3's author).

### 3.2 Sub-slice 2 (re-plan step 6, F1-4b): a repeated or withdrawn number is said, not offered (H5 minimum, H2)

**What already exists.**
- `readLetterQuestionProposals` (`letter-question-proposals.ts:101-115`) marks recorded by `sameQuestionRef` (:110),
  so every proposal sharing a number takes the first recorded id.
- The route removes withdrawn questions before matching (`agency-responses.ts:397-398`), so a withdrawn number shows
  Record.
- `insertQuestionTx` (`response-service.ts:436-454`) and the UNIQUE `(communication_event_id, question_ref)`
  (`migrations/20261018b_agency_response_questions.sql:137-138`) refuse any repeat of an exact ref, withdrawn or not.
- The panel says "Each is recorded." as soon as every row has an id (`LetterQuestionProposals.tsx:65`).

**The rule.**
- Split the proposal step into the pure `proposeLetterQuestions` (§3.0), counting by one normalised key
  (`sameQuestionRef`'s) in a `Map`. The prototype's pairwise count was quadratic.
- **A number held by two or more proposals of the letter, across all its sources, is not offered on any holder**
  (`repeated-number`). The holders named are the other lines. This counts every holder, including ones not offered for
  another reason, which is the plan's rule. The measured alternative is in §5, item 1.
- A proposal counts as recorded only when its number is unique. It then shows "Recorded", or "Recorded as {recordedRef}"
  when the recorded ref is written differently ("Q3").
- The route passes every question, withdrawn included, with `withdrawnAt` and its words. A unique number that matches
  only a withdrawn question is not offered (`withdrawn`).
- **"Recorded" is matched by the recorded words, or by a number no other proposal of the letter holds** (revision 2,
  critique 20). A live recorded question marks a proposal recorded when its words equal the proposal's slice (the
  Record form prefills the slice, and `zod .trim()` is the identity on it), or when its normalised reference equals
  the proposal's and no other proposal of the letter, on any source, before or after the sign-off, holds that key.
  A repeated number is never matched by number alone.
- A not-offered row that is recorded this way says so: "Recorded as {recordedRef}." and its reason in the past tense
  ("It was not offered here because its words held a page footer."), with no Record instruction. Only an unrecorded
  not-offered row keeps "Record it with Record question…". (Without this, a person who obeys the reason with "Q2" or
  "2." records the question twice: `insertQuestionTx`'s duplicate check is the exact `question_ref = $3`,
  `response-service.ts:438-445`.)
- "Each is recorded." becomes "Each question in the letter's text is recorded." It is said only when every row,
  offered or not, is recorded. While some offered rows are recorded and others are not, nothing is said about the
  whole.
- **Sub-slice 8 extends the count** (critique 8): from then on, holders outside the letter's own numbering are not
  counted, and holders told apart by their headings are offered with a suggested reference (§3.8, "Repeated numbers
  told apart"). This commit lands the plan's rule as written.

**Files** (S10):
- `server/services/agency-responses/letter-question-proposals.ts`;
- `server/routes/c2c/agency-responses.ts` (drop the filter at :397-398 and pass `withdrawnAt`);
- `client/src/concept2cure/v2/surfaces/LetterQuestionProposals.tsx`.

**Red tests.**
- New `server/services/agency-responses/__tests__/letter-question-proposals.test.ts` (pure, no database), "P3-duplicate":
  - `P3-duplicate/crl-restart-per-discipline.pdf`, `ema-loq-restart-per-section.docx` and
    `ir-second-list-after-lead-in.txt`: every holder of a shared number is not offered, and a recorded "1" marks none
    of them "Recorded";
  - the enclosure case (`P6-signature-after-sign-off/ir-enclosure-list-restart.pdf`): the real "1" and the enclosure
    "1" are both counted.
  - Sub-slice 8 changes these expectations on purpose, and its evidence says so (as sub-slice 4 does for the pin at
    `:74-81`): `crl-restart-per-discipline.pdf` and `ema-loq-restart-per-section.docx` are then offered, each holder
    with its own suggested reference; `ir-second-list-after-lead-in.txt` question 1, and the real questions of
    `ir-enclosure-list-restart.pdf`, `minutes-attachments.docx` and `original-message-chain.txt`, are offered because
    their other holders are inner-list items or after the sign-off (measured, `scratchpad/s10/r2/out/fx-r2.json`).
    Mutations 1 and 4 belong to this commit's rule; sub-slice 8's mutations 21 and 22 cover the change.
  - recording: a not-offered unique "2" recorded by hand as "2" is marked recorded (`recordedQuestionId` set, reason
    kept for the past-tense sentence); a bare "1" recorded with other words marks no holder of a repeated "1"; a
    recorded question whose words equal a holder's slice marks that holder only (measured on the prototype,
    `scratchpad/s10/r2/checks.mts`);
  - **timing, in this commit** (critique 16): 24,000 proposals over 12,000 shared numbers are counted and matched in
    under 1 s. The count lives here, in the pure function, so only a test of the pure function can see it.
- `letter-question-proposals.pglite.test.ts`:
  - a withdrawn "3" makes proposal 3 not offered, with the date;
  - the existing pin at :69-72 (recorded "Q2" marks proposal "2" recorded) stays green, because 2 is unique.
- `client/src/concept2cure/v2/__tests__/agencyResponsesLetterProposals.test.tsx`:
  - a not-offered row has no Record button and shows its reason;
  - a not-offered row recorded by hand shows "Recorded as 2" and no "Record it with Record question";
  - "Each question in the letter's text is recorded." does not appear while any row is unrecorded.

**Mutations.**
1. Match recorded by number without the uniqueness check: the CRL test goes red.
2. Restore the withdrawn filter: the route-level checks below go red. (Completeness critic: the filter is in the route,
   `agency-responses.ts:397-398`, and the PGlite suite calls `readLetterQuestionProposals` directly with the rows it is
   given, so the service test cannot see the route's filter come back. Two checks catch it: a source-level assertion,
   as sub-slice 5 has for the inline sort, that the question-proposals handler passes `readQuestions(...)` to the
   service with no `approval.state` filter; and, for the builder, a dbtest case that seeds one `cre_evidence_sources`
   row linked as `cre_source:<id>`, withdraws question 3, and reads GET `.../question-proposals`: proposal 3 is
   `withdrawn`. No dbtest links a source to a letter today, so the case brings its own row.)
3. Let the reason win over "Recorded" again: the recorded-by-hand client test goes red.
4. Count only proposals before the sign-off: the enclosure test goes red.
5. Use the pairwise count: this commit's timing test goes red. (The prototype's pairwise count did not finish the
   service call on `big-crafted.txt` in 300 s, `scratchpad/s10/verify-refute-timing/`; the Map count takes 0.2 s.)
6. Match a repeated number by number alone: the bare-"1" test goes red.

**Oracle expectation.** P3-duplicate goes from 369 to 0 (2,386 → 1,497 in all). It stays 0 through every later
sub-slice: under the revision-2 oracle it is a violation only when two offered holders are prefilled alike or recording
one marks another recorded (§2, oracle change 6), which sub-slice 8's suggested references never do.

**Usefulness budget.** Offered goes from 183 to 132 (51 stop, each sharing a number). Clean: 70 → 70. None of the 70
shares a number, since the baseline required a unique one, so this budget cannot see the cost; the reader list can:
70 / 42 / 35, the 35 not offered all repeated numbers (EMA LoQ 18, minutes 6, CRL 4, IR 4, hold 3). Every family stays
at its usable floor, which counts only numbers no other proposal holds. Sub-slice 8 gives most of them back (§3.8).

**Words** (revision 2, critique 22: no example the server has not computed, and the others named by count and place).
- Row: "Number {ref} is also used on {k} other line{s} of this letter, first "{quote of the nearest other holder}"{ on
  page N}{, and in {other file's title}}. Record this one with Record question under a reference not already used on
  this letter, such as one naming its section." The example reference is never a guessed heading: from sub-slice 8 on,
  a holder that its headings tell apart is offered with a computed reference instead (§3.8), so a row that still says
  this has no heading that tells it apart.
- A holder in another linked file is named by that file's title ("and in {title}"). A letter linked as two copies of
  the same file therefore says, on each row, that the number is also in the other copy (measured: `fda-ir.pdf` linked
  twice offers none of its questions, every row naming the other copy; `scratchpad/s10/r2/checks.mts`). That is the
  honest outcome; it is listed in §6.
- Row: "Question {recordedRef} was withdrawn from this letter on {date}, so it is not offered again. If the agency still
  needs a response, record it with Record question under a reference not already used on this letter."
- The date is formatted as the panel already formats dates (`AgencyResponses.tsx`), with no time and no id.
- Recorded by hand, not offered: "Recorded as {recordedRef}. It was not offered here because {the reason, past tense}."

**Trailers.**

    Plan: S10
    Completes: server/services/agency-responses/letter-question-proposals.ts

**Coordinate with:** the coordinator and `011Dpx…`.

### 3.3 Sub-slice 3 (re-plan step 7, F1-4c): proposals read only what the person may read (H13)

**What already exists.**
- `readLetterSources` (`letter-question-proposals.ts:66-99`) reads `extracted_text` under a project-scope JOIN only.
- The admission sequence that does it right is inline and unexported in `authoring-assembly-sources.ts` `read()`
  (:134-152): program access, then source read scope, then the read, then the re-check, then program access again.
- Its exported `readSelectedAuthoringSources` (:154) cannot be reused as it stands. It returns an 8,000-character
  window and at most five sources (`shared/authoring/assembly-sources.ts:2-3`).

**The rule.**
- Export the access wrapper only, unchanged in order, and have `read()` call it, so authoring's behaviour is identical:

      readAdmittedDataRoomSources(q, actor, sourceIds, readThem) // name: the coordinator's choice
      // requireCurrentProgramAccess -> getCurrentReadableSourceScope -> readThem() -> requireSourceReadScopeStillCurrent -> requireCurrentProgramAccess

- `readLetterSources` calls it once per linked source, on the request's client:
  - one inaccessible attachment never hides a readable one;
  - the verified scope is keyed on the executor object, so the scope call and the re-check must share the client.
- The program uuid comes from `p.regulatory_program_id::text` in the identity JOIN that already exists.
- `ProgramReadAccessError` and `SourceReadAccessError` are caught and kept apart **by status and code** (revision 2,
  critiques 15 and 21), as the authoring caller already keeps them apart (`authoring-assembly-sources.ts:158-159`).
  Never a 500, and never one sentence for four outcomes:
  - 403 (`SOURCE_ACCESS_DENIED`, `PROJECT_SCOPE_UNVERIFIED`, `PROJECT_ACTOR_*`, `PROJECT_PERMISSION_DENIED`): source
    state `no-access`;
  - 409 `SOURCE_PARENT_UNRESOLVED` (`source-read-access.ts:12`): source state `unverified-place`, a data-room fact no
    owner can grant;
  - 404 `SOURCE_NOT_FOUND` (`:98`, the row deleted between the identity JOIN and the scope call): the existing
    `not-found`;
  - 503 `SOURCE_ACCESS_UNAVAILABLE`, `SOURCE_READ_ACCESS_CHANGED`, `PROJECT_ACCESS_UNAVAILABLE`,
    `PROJECT_ACCESS_CHANGED` (`:113`, `:121`; `current-program-access.ts:100`, `:106`): source state `unchecked`,
    with Check again;
  - a `ProgramReadAccessError` is about the letter's project, not one file, so it is said once for the letter, not once
    per linked file: 409 `PROJECT_ANCHOR_UNRESOLVED` (`current-program-access.ts:137`) and 404 `PROJECT_NOT_FOUND`
    (`:132`) each get one letter-level sentence; a 403 or 503 from the program check is the letter-level form of the
    states above.
- Commitment proposals share the read, so they are covered in the same commit.

**Files.**
- `server/services/authoring/authoring-assembly-sources.ts`: in no S package, hence **F1**.
- `server/services/agency-responses/letter-question-proposals.ts`.
- `shared/agency/letter-questions.ts` (the state union).
- `LetterQuestionProposals.tsx`.
- Tests: both proposal PGlite suites.

F1 is `**`, so this one commit carries all of them. It is one change: the export has no other caller.

**Red tests.**
- `letter-question-proposals.pglite.test.ts`: a person without read scope on the letter's source gets its words today.
  - The cheapest real case is the workspace mismatch (`reuse-map.md` §G): the source's `client_workspace_id` differs
    from the program's anchor, so `SourceReadAccessError` 409.
  - Build it on the existing `server/routes/__tests__/_authoring-current-read-fixture.ts` and `_authoring-canvas-fixture.ts`
    (`AUTHORING_ACCESS_DDL`), never a new DDL copy.
  - Expected after: state `no-access`, no words, no proposals from that source.
  - That case is a 409 `SOURCE_PARENT_UNRESOLVED`, so its state is `unverified-place`, not `no-access`. The
    `no-access` case is a person outside the program (403 `SOURCE_ACCESS_DENIED`), on the same fixture.
- A second case: two linked sources, one inaccessible. The readable one is still proposed.
- One case per class (critiques 15, 21): 403 → `no-access`; 409 parent → `unverified-place`; 503 → `unchecked`, through a
  stub client whose re-check query fails; a program-level 503 → one letter-level sentence, not one per source.
- `letter-commitment-proposals.pglite.test.ts`: the same mismatch gives no commitment proposals.
- **Authoring's behaviour is unchanged:** `server/routes/__tests__/authoring-assembly.pglite.test.ts` stays green before
  and after, with its output saved in the evidence.

**Mutations.**
1. Skip `getCurrentReadableSourceScope`: the mismatch test goes red.
2. Pass the pool instead of the request client: the scope binding throws, and the test goes red.
3. Make one wrapper call for all sources: the two-source test goes red.
4. Drop the closing `requireCurrentProgramAccess` in the wrapper: the new case below goes red. (Completeness critic,
   searched: no authoring test reaches that check. `authoring-assembly.pglite.test.ts` names a program only in its
   fixtures and in a foreign-program preview at :413, and its one post-read re-check case, :293, revokes the source's
   parent, which `requireSourceReadScopeStillCurrent` catches first. So the F1 commit adds the case:
   in `letter-question-proposals.pglite.test.ts`, modelled on :293, the person's program access is revoked after the
   words are read and before the closing check, and no words are returned and the state is the letter-level one;
   and the same case in authoring's suite, so authoring keeps the guard it has today.)
5. Collapse 503 into `no-access`: the 503 case goes red.

**Oracle expectation.** Unchanged counts: the stub reads one admitted source. The oracle calls the pure function, so no
stub change is needed (§2).

**Usefulness budget.** Clean 70 → 70: the corpus is read with full access. Offered is unchanged.

**Words** (no title is shown in the first three, because the person may not read that source's metadata).
- `no-access` (403): "One file linked to this letter is not readable with your access, so its questions are not
  listed. Ask the project's owner for access to the file, or record the questions with Record question from your copy
  of the letter."
- `unverified-place` (409): "One file linked to this letter has no verified place in this project's data room, so it
  was not read. Record the questions with Record question from your copy of the letter."
- `unchecked` (503): "Access to one file linked to this letter could not be checked just now, so its questions are not
  listed." (Check again)
- Letter level, once: 409 `PROJECT_ANCHOR_UNRESOLVED`: "This project needs one verified tracking record before its
  files can be read, so the letter's questions are not listed. Record them with Record question."; a program-level
  503: "Access to this project could not be checked just now, so the letter's questions are not listed." (Check again)

**Trailers.**

    Plan: F1
    Completes: server/services/authoring/authoring-assembly-sources.ts
    Completes: server/services/agency-responses/letter-question-proposals.ts

**Coordinate with:** the coordinator and `011Dpx…`. Nobody has committed to `authoring-assembly-sources.ts` since
2026-10-18.

### 3.4 Sub-slice 4 (re-plan step 9, S10-1): the letter's source is checked before it is read (H3)

**What already exists.**
- `readLetterSources` sets `read`, `no-text` or `not-found` from `extracted_text` alone (:92-97).
- `getSource` (`evidence-spine.service.ts:501`) gives `isCurrent`, `dataEligible`, `disposition`, `textAvailable`,
  `processing`, `extractionStatus`, `checksum`, `provenance` and `sourceType`.
- `sourceReadView` (`shared/data-room-processing-status.ts:130`) already has every label the step needs (the mapping
  table in `reuse-map.md` §C).
- `readExtractionCoverage` (:43) reads a partial OCR read. Absence means "not recorded", not "complete".
- `sourceHasGroundingText` (:122) is the gate.

**The rule.** Inside the admitted read (sub-slice 3), for each linked source:
1. The identity query adds `source_type = 'client_document'`, not `is_current`, so supersession can be said.
2. `getSource(scope.orgId, id, client)` runs on the request's client, never the pool. The pool escapes the tenant
   context.
3. The source state is one of the following, from `sourceReadView` and the facts it reads:
   - `withdrawn` (`disposition = 'remove_data'`);
   - `replaced` (`supersede`);
   - `superseded` (`isCurrent = false`);
   - `excluded` (`dataEligible = false`);
   - `not-read` (not processed yet);
   - `reading` (processing claimed);
   - `unreadable` (failed, needs retry, blocked, unconfirmed), carrying `sourceReadView`'s label and detail;
   - `partial` (coverage `limitedBy != null`).

   `no-text` thus splits into its three cases. `withdrawn`, `replaced`, `superseded`, `excluded`, `not-read`,
   `reading`, `unreadable` and `partial` read no words.
4. Words are read only when `sourceHasGroundingText` is true and coverage is not partial.
5. `keep_data` (original gone, text kept) is read, with `retained: true` for a caution.
6. An OCR read (`provenance.extractionMethod` includes `ocr`) is read with `ocr: true` for sub-slice 6's caution.

7. The same `provenance.extractionMethod` is passed to the split as `ReadOptions.method`, and the source's entry
   carries `word: method === 'docx'` (completeness critic). Sub-slice 7's Word rule (`starts-mid-sentence` "Not in a
   Word letter", §3.7) and sub-slice 6's Word caution read nothing else: without this, the method would reach the split
   only with sub-slice 9's receipt read, and the Word rule would be dead in the service from sub-slice 7 to 9 (the
   prototype reads it from `opts.method`, `letter-questions.proto.ts:541`). AnA's caller passes no method (§1).

`getSource` puts `extractionMethod` under `provenance`, so the caller passes
`{ ...doc, extractionMethod: provenance.extractionMethod }` to `sourceReadView`, as `project-vault.ts:1854` does.

**Files** (S10):
- `server/services/agency-responses/letter-question-proposals.ts`;
- `shared/agency/letter-questions.ts` (the state union: one definition for server and client, replacing the two copies
  at `letter-question-proposals.ts:33` and `LetterQuestionProposals.tsx:21`);
- `LetterQuestionProposals.tsx`, including "Check again": a local counter added to `useLiveData`'s deps, with no edit
  to the D0-locked `dataConnect.tsx`.

**Check again shows that it runs, and says what it found** (revision 2, critique 26). A refetch on the same path keeps
the old data with `loading: true` (`dataConnect.tsx:410-412`), and the panel renders its loading state only when it has
no data (`LetterQuestionProposals.tsx:40`), so a counter alone changes nothing on screen. While `read.loading &&
read.data`:
- one `role="status"` line says "Checking the data room again…";
- the list carries `aria-busy="true"`;
- Record and Check again are disabled while the read runs (they are focusable again when it settles; no reason row
  loses its words).

When the read settles, the same status line says what was found: "Still not read." or "Read: {n} numbered lines."
The fetch-error note (`:42`) is rewritten too: every failure there is a server or network fault (`liveGetOrNull`,
`dataConnect.tsx:268-279`: an HTTP status, a deadline, a shape mismatch, `READ_CONTEXT_CHANGED`), never the letter's.
It says "The questions in the letter's text could not be loaded just now. Nothing is listed rather than a partial
list." with Check again, and "Record them with Record question" in place of "by hand". It names no path or status.

**Red tests.**
- Both proposal PGlite suites, one case per state. The reduced fixtures at `letter-question-proposals.pglite.test.ts:39-40`
  cannot run `getSource`, so they grow onto `server/services/document-data-disposition/__tests__/disposition-fixture.ts`
  (`createDispositionHarness`) for the disposition and eligibility tables. No new DDL copy.
- The pin at :74-81 (NULL text is `no-text`) is changed on purpose to `not-read`, and the evidence says so.
- `agencyResponsesLetterProposals.test.tsx`: each state's sentence, no id on screen (the `Source {id}` at `:55` goes),
  and "Check again" refetches. Also (critiques 26, 27):
  - a refetch in flight shows the status line, with Record and Check again disabled; when it settles with the same
    `not-read` payload the status says "Still not read." (a deferred second GET, as in
    `scratchpad/s10/probe-checkagain/probe.test.tsx`, which shows the DOM unchanged today);
  - the error state offers Check again and names no path;
  - one sentence per `sourceReadView` label; a `partial` source with null `pagesRead`/`pageCount` says "only part of";
    no "Upload" in the needs-retry case.

**Mutations** (one per state):
1. Drop the disposition check: the withdrawn-data case goes red.
2. Drop `isCurrent`: the superseded case goes red.
3. Drop coverage: the partial-OCR case goes red.
4. Collapse the three not-read cases: the split test goes red.
5. Treat `keep_data` as excluded: the retained case goes red.
6. Call `getSource` with the default pool: a test with a client that records its queries goes red.
7. Never set `ocr` (or `word`): the PGlite cases below go red (completeness critic: the flags had a client test in
   sub-slice 6 and no server test, so dropping them on the server was caught by nothing).
8. Render the loading state only when there is no data (today's `:40`): the in-flight Check again test goes red.
9. Do not pass `method` to the split: sub-slice 7's Word-letter fixtures, run through the service, go red (once
   sub-slice 7 lands; until then the PGlite case asserts the method reaches the split options).

Added red tests (completeness critic): in `letter-question-proposals.pglite.test.ts`, a `pdf-ocr` source gives
`ocr: true`, a `docx` source gives `word: true` and a `pdf-text` source neither (red: no such fields today).

**Oracle expectation.** Unchanged counts (one current, eligible, fully read source).

**Usefulness budget.** Clean 70 → 70; offered unchanged.

**Words** (letter level, one per source; the title, or "a file linked to this letter" when there is none; never an
id):
- `not-found`: "One file linked to this letter is not in this project's data room, so it was not read. Link the
  letter's file from this project's data room, or record the questions with Record question from your copy of the
  letter." (revision 2, critique 27: every state names a next step)
- `withdrawn`: "The data from {title} was withdrawn from the data room, so its questions are not listed. Record them with
  Record question from your copy of the letter."
- `replaced`: "{title} was replaced by newer data in the data room, so its questions are not listed. Link the current
  file to this letter, or record them with Record question."
- `superseded`: "{title} is superseded by a newer version, so its questions are not listed. Link the current version to
  this letter, or record them with Record question."
- `excluded`: "{title} is excluded from active data use, so its questions are not listed. Record them with Record
  question."
- `not-read`: "The data room has not read the text of {title} yet." (Check again)
- `reading`: "The data room is reading {title} now." (Check again)
- `unreadable` (revision 2, critique 27: one remedy per label, never two that disagree):
  - "Text not readable" (`shared/data-room-processing-status.ts:172`): "The data room could not read the text of
    {title}. Upload a readable copy to the data room, or record the questions with Record question.";
  - "Processing needs retry" and "Processing blocked" (`:159`, `:162`, `:165`, `:178`): "The data room has not saved
    readable text for {title} ({label, lower case})." Then `sourceReadView`'s own detail as the next step ("…another
    processing attempt is needed." / "The original source must be checked before another processing attempt."), then
    "Or record the questions with Record question." No "Upload" here: nothing says the file is unreadable;
  - "Processing status unconfirmed" (validation of the stage metadata failed, state `unknown`): "The data room has not
    confirmed the processing state of {title}, so its questions are not listed." (Check again). Not "could not read":
    the state is unverified, not failed. ("Text availability unconfirmed" cannot reach this path, because `getSource`
    reads `s.*` and `textAvailable` is always a boolean, `evidence-spine.service.ts:809`; the sentence exists anyway,
    as the same unconfirmed form.)
- `partial`: "The data room's OCR read {pagesRead} of {pageCount} pages of {title}, so questions on the other pages
  would be missing. Its questions are not listed; record them with Record question from the original." When either
  count is null (`readExtractionCoverage` accepts null counts on a budget limit), "read only part of {title}" in place
  of the counts. With `ocr_failed`: "The data room read only the text layer of {title}; its scanned pages were not
  read, so questions on them would be missing. Its questions are not listed; record them with Record question from the
  original." (a clause of its own, not `useChatUpload.ts:65`'s "text layer only; scanned pages not read · N words",
  which is a label fragment).
- `retained` (a caution above the list): "The original file of {title} is no longer in the data room; its text was
  kept. Check each question against your copy of the letter."

**Trailers.**

    Plan: S10
    Completes: server/services/agency-responses/letter-question-proposals.ts
    Completes: client/src/concept2cure/v2/surfaces/LetterQuestionProposals.tsx

**Coordinate with:** the coordinator and `011Dpx…`.

### 3.5 Sub-slice 5 (re-plan step 10, S10-2): one reading of a letter's source reference (H9)

**What already exists.** Three parsers disagree (`code-map.md` §2.11 table):
- `communication-center.ts:701` accepts unbounded digits, then range-checks. It refuses a malformed ref.
- `letter-question-proposals.ts:51` (`\d{1,10}`) drops a malformed ref silently.
- `AgencyInbox.tsx:136-140` keeps digit strings, so `cre_source:007` is `'007'` and does not match source 7.

Also:
- `refuseForeignLetterSources` runs on `pool` (:718), and so does the POST's insert (:866), as two separate statements
  on any pool connection.
- GET `.../questions` sorts with an inline copy of `compareQuestionRefs` (`agency-responses.ts:378`).

**The rule.**
- `parseLetterSourceRef(ref)` and `letterSourceRef(id)` live in `shared/agency/letter-questions.ts`.
  - `parseLetterSourceRef` returns `{ sourceId }`, `'not-a-source'` (no `cre_source:` prefix) or `'malformed'`.
  - It accepts digits only, 1 to 10 of them, with a value from 1 to 2,147,483,647.
  - It returns the **number**, so `007` reads as 7 everywhere and old rows are not made malformed.
- A malformed ref is said: source state `malformed`.
- `refuseForeignLetterSources` moves beside `readLetterSources`, into `letter-question-proposals.ts`, takes a
  `Queryable`, and `checkCommunicationLinks` passes `requestPgClient(req)`.
  - The insert at :866 stays on the pool. Check and insert were never one transaction (two pool statements today), so
    nothing becomes less atomic.
  - Moving the insert too is §5, item 7.
- `AgencyInbox.tsx` imports the shared parser and builder, compares numbers and re-exports `letterSourceRef`.
  `CommunicationCenter.tsx:451` and `ProjectRespond.tsx:67` keep their import, unchanged.
- **`letterSourceIds`' three callers** (completeness critic, §1): it keeps returning strings, now the canonical decimal
  `String(sourceId)` of each well-formed ref, and drops a malformed one. So `letterSourceOptions` (:152) matches
  `String(s.id)`, the card's "letter in the data room" (:398) counts only readable refs, and `draftResponseWithAna`
  (:174-178) pins `'7'` for `cre_source:007` (today `'007'`; `ProjectHome.tsx:465` already filters pins by
  `Number(id)`). A letter whose only ref is malformed pins nothing, so the AnA prompt takes its existing
  "No document of the letter is linked" branch (:184).
- **One project-scope rule** (harvest H9's title, completeness critic): the write refusal's query
  (`communication-center.ts:719-731`) and the read's identity JOIN (`letter-question-proposals.ts:80-86`) are the same
  SQL today, in two files. When `refuseForeignLetterSources` moves into `letter-question-proposals.ts`, both use one
  function there (this organisation's live source in the program the project anchors), so zero duplication holds.
- GET `.../questions` calls `compareQuestionRefs`, removing the inline copy.

This covers the letter path only. The other `cre_source` parsers and builders (`code-map.md` §6, step 10) are outside
S10 and are named in the evidence as known.

**Files** (S10):
- `shared/agency/letter-questions.ts`;
- `server/services/agency-responses/letter-question-proposals.ts`;
- `server/routes/c2c/communication-center.ts` (about −30 lines; 251 lines of headroom);
- `server/routes/c2c/agency-responses.ts`;
- `client/src/concept2cure/v2/surfaces/AgencyInbox.tsx` (behaviour only, no markup).

**Red tests.**
- `shared/agency/__tests__/letter-questions.test.ts`: `007` → 7; 11 digits → malformed; `abc`, `0` and `cre_source:`
  → malformed; `vault:3` → not a source.
- The PGlite suite: a stored `cre_source:abc` is said (state `malformed`), not dropped. Red: dropped today.
- New `client/src/concept2cure/v2/__tests__/agencyInboxLetterSource.test.ts`: a letter linked as `cre_source:007`
  matches source 7 in the options. Red: `'007'` does not match today.
- `communication-center.test.ts` (existing): the refusal runs on the client it is given (a recording stub client).
- The inline sort: a source-level assertion that `agency-responses.ts` imports `compareQuestionRefs` and holds no
  `localeCompare(…numeric` copy. Behaviour is byte-equivalent (`reuse-map.md` §F), so a behaviour test cannot be red.
- Added by the completeness critic:
  - `client/src/concept2cure/v2/__tests__/communicationDraftCarriesLetter.test.tsx` (existing; `:58` expects
    `['77']` for `cre_source:77`) stays green, and gains: `cre_source:007` pins `['7']` (red: `['007']` today) and a
    letter linked only as `cre_source:abc` pins nothing and asks with the "No document of the letter is linked" words;
  - one project-scope query: a source-level assertion that `communication-center.ts` holds no
    `JOIN projects p ON p.regulatory_program_id = s.client_program_id` and calls the shared function.

**Mutations.**
1. Allow unbounded digits: the 11-digit test goes red.
2. Drop a malformed ref silently: the PGlite test goes red.
3. Compare digit strings in the client: the 007 test goes red.
4. Restore the inline sort: the source assertion goes red.
5. Run the refusal on `pool`: the stub-client test goes red.
6. Keep the raw digit string in `letterSourceIds`: the `007` pin case goes red.
7. Leave the project-scope query copied in `communication-center.ts`: the one-query assertion goes red.

**Oracle expectation.** Unchanged.

**Usefulness budget.** Clean 70 → 70.

**Words.** "One link on this letter is not a data-room file reference, so it was not read. Link the letter's file from
this project's data room, or record the questions with Record question from your copy of the letter." (revision 2,
critique 27: the next step.) The write refusal keeps today's sentence without the raw ref: "A linked document is not a
data-room source reference. Nothing was recorded."

**Trailers.**

    Plan: S10
    Completes: shared/agency/letter-questions.ts
    Completes: server/routes/c2c/communication-center.ts

**Coordinate with:**
- the coordinator: `AgencyInbox.tsx` is in L7's lane for D6-2, and whichever lands second rebases;
- `011Dpx…`;
- D3-4, which lifts `useAgencyInbox` (`BUILD_ORDER.md:388`).

### 3.6 Sub-slice 6 (re-plan step 11, S10-3): the proposals say what they read, and what they did not; limits (H10, H11)

**What already exists.**
- `LetterQuestionProposals.tsx:30` (`clip`) and `:71` (`<span title={p.text}>` at 220 characters): a tooltip keyboard
  and screen-reader users cannot reach.
- `:58-66` names no numbering forms.
- The button is `cc-btn sm` (`:75`), which D6-2 deletes.
- No limits:
  - a question over 20,000 characters, or a ref over 40 characters (`OPENER`'s parts are unbounded,
    `letter-questions.ts:31`), is offered and then refused by the POST's VALIDATION (`agency-responses.ts:135-136`);
  - there is no cap on the number listed.
- The only CSS rule that lays out the words is `.cc-q-proposal > span[title]` (`commcenter-v2.css:155`, locked).
  `.cc-q-hist` (`:163-166`) is the existing disclosure.

**The rule** (revision 2, critiques 14 and 25: the class that keeps line breaks is the one a recorded question already
uses, and the row's layout is not S10's to change).
- Each row shows the number, then the full words in a `<details className="cc-q-hist">` whose body is
  `<blockquote className="cc-q-text">{p.text}</blockquote>`: the class that shows a recorded question's verbatim words
  at `AgencyResponses.tsx:248` (`commcenter-v2.css:146`, `white-space:pre-wrap`, 12.5 px, `--text-200`). A proposal
  then reads like the recorded question it becomes, with the agency's own line breaks (sub-items a., b., lots, tables).
  `.cc-q-hist` alone (`:163`) sets only a margin, 11.5 px and `--text-300`, and no `white-space`; nothing above the
  panel sets one either, so without the blockquote the breaks collapse.
  - The `<summary>` is the first line of the words, clipped at 120 characters with the existing `clip` (which ends in
    "…", `LetterQuestionProposals.tsx:30`).
  - **Precondition, not an option** (was open question 8): before this sub-slice lands, the stylesheet's holder (D0,
    then the L7/D6-2 holder of `commcenter-v2.css`, `BUILD_ORDER.md:366`) adds the one flex rule for the row,
    `.cc-q-proposal > .cc-q-hist{flex:1;min-width:0;overflow-wrap:anywhere}`, in its own commit. S10 edits no
    stylesheet (D0-locked, `COORDINATION.md` "Locked now").
  - The `span[title]` bridge is dropped: a `<details>` (flow content) inside a `<span>` (phrasing content only) is
    invalid nesting. Until the precondition holds, sub-slice 6 does not land.
- Then "Recorded" (`cc-q-note`), or the Record button, or the reason note in its place.
- **The Record button keeps `cc-btn sm`** in S10's commit. Changing it to D0's `btn ghost small` is row styling on a
  D6 screen (`BUILD_ORDER.md:294`, :454: S10 is "behaviour only, on D6's layout"), so it goes to D6-2 with the file
  and line named (`LetterQuestionProposals.tsx:75`, a remaining `.cc-btn` use that D6-2 must convert before it deletes
  `.cc-btn*`, `D6.md:320`), unless the coordinator records consent in `COORDINATION.md` for S10 to make it. The
  re-plan's step 11 named `btn ghost small`; this resolves that against the build order.
- A row with a caution (OCR, retained) gives its Record button `aria-describedby` that caution.
- A row that is not offered has no button, rather than a disabled one: a disabled button is not focusable, so its
  description is unreachable.
- Limits:
  - `too-long` over `QUESTION_TEXT_MAX`;
  - `ref-too-long` over `QUESTION_REF_MAX`;
  - the service lists at most 200 and returns `total`. The oracle compares the first 200.

**Files** (S10):
- `LetterQuestionProposals.tsx`;
- `server/services/agency-responses/letter-question-proposals.ts` (the cap);
- `shared/agency/letter-questions.ts` (the two limits in the splitter);
- `server/routes/c2c/agency-responses.ts` (zod reads the shared constants).

**Red tests.**
- `agencyResponsesLetterProposals.test.tsx`:
  - the full words are reachable by keyboard: the disclosure opens, and its body is a `blockquote.cc-q-text` holding
    `p.text` exactly, newlines included (a DOM text check cannot see line breaks collapse, so the class is asserted);
  - no `details` sits inside a `span`;
  - the forms sentence is present, and every form it names as read is asserted against `OPENER` ("1.", "2)", "3:",
    "1.2.", "Question 4:", "Q4."), and every form it names as not read is asserted not to open ("1.2 Provide",
    "Comment 1: Provide", "Observation 1 Provide", "(1)", "a.");
  - with no offered row (a reduced `rf06`), the header says the none-can sentence and not "then record it with a
    reason";
  - the OCR caution is present when `ocr: true`;
  - the Word caution is present when the source is Word;
  - a not-offered row has no button;
  - a 201-proposal payload says the limit sentence.
- `letter-questions.test.ts`:
  - a `1.2.3.4.5.6.7.8.9.10.11.12.13.14.15.16.17.18.19.20.` opener is offered on trunk, then refused by the POST;
    after, it is `ref-too-long`;
  - a generated 20,001-character question is `too-long`.
- Added by the completeness critic:
  - the cap is the service's, so its red test is pure: in `letter-question-proposals.test.ts`, 201 proposals give 200
    listed and `total: 201` (the client test above only renders a payload, so it cannot see the cap go);
  - `OPENER` is not exported (`letter-questions.ts:31`), so "asserted against `OPENER`" means through
    `splitLetterQuestions` on a one-line letter per example: each form named as read yields one question, each named
    as not read yields none. No new export;
  - the Word caution's fixture, `P3-coverage-word-numbered/typed-list-then-autonum.docx` (in `fixtures.md` §1 and
    placed in no sub-slice before): its stored text holds two typed questions and two paragraphs Word numbers itself.
    After every sub-slice it is the one contract-relevant finding left on the 64 S10 fixture inputs (P3-coverage
    "Word-numbered paragraph dropped"; `r2/out/fx-r2.summary.txt`, re-read by the critic), so its test asserts the
    honest outcome, not a green oracle: questions 1 and 2 offered verbatim, and with `word: true` the panel shows the
    Word caution. It is red only on the caution (no caution today).

**Mutations.**
1. Restore the clip and title: the disclosure test goes red.
2. Remove the cap: the pure 201 test goes red.
3. Offer a ref over 40: red.
4. Drop the OCR caution: red.
5. Render a disabled button on a not-offered row: red.
6. Put the body in the `details` without the blockquote: the class assertion goes red.
7. Name "1.2" as a read form: the forms-against-`OPENER` test goes red.
8. Show the Word caution from the file's title or extension instead of `word`: the `typed-list-then-autonum` case,
   given a title without ".docx", goes red.

**In the running app** (RULE 4): open a letter whose question has lettered sub-items (`fda-ir.pdf`'s question 2, "a.
… b. …") and see the disclosure keep its line breaks; file the screenshot in the evidence.

**Oracle expectation.** 1,497 → 1,398. The 20,000-character rule not-offers the giant questions of the timing letters:
P1-foreign heading 312 → 263, P6-merged other numbering 406 → 356.

**Usefulness budget.** Clean 70 → 70; offered 132 → 132; reader unchanged (70 / 42 / 35). No realistic question is over
a limit.

**Words** (revision 2, critique 23: the header counts lines, not questions; it never contradicts itself at k = 0; the
forms sentence names only what `OPENER` reads, in words a screen reader speaks).
- Above the list:
  - "The letter's text has {n, formatted} numbered lines, found without AI." (`n` counts every row, offered or not:
    enclosure items, inner-list items and headings are numbered lines, not questions.)
  - When some can be recorded: "{k} read as questions and can be recorded from here; each of the others says why not."
    `k` counts offered rows not yet recorded.
  - Then: "Check each against the letter, then record it with a reason."
  - When none can (k = 0, measured on 3 of the 49 realistic letters after every sub-slice, among them `rf06`): "None
    can be recorded from here; each line says why. Record the letter's questions with Record question." No "then
    record it with a reason".
- Forms, always shown under the list: "Questions are found when a line starts with a number followed by a full stop, a
  closing bracket or a colon, such as 1. or 2) or 3:, a part number such as 1.2., or Question 4: and Q4. Requests
  numbered (1), a. or i., numbered with a word such as Comment 1, Query 1 or Observation 1, numbered 1.2 with no full
  stop, and requests with no number, are not found; record those with Record question."
- Word: "This letter is a Word document. Numbers that Word adds by itself are not kept in its text, so questions
  numbered that way are not found."
- OCR: "This letter's text was read by OCR. Check each question's words against the letter before you record it."
- Limit: "The letter's text has {total, formatted} numbered lines; the first 200 are listed. Record the rest with Record
  question."
- `too-long`: "Its words are longer than a question can be recorded with (20,000 characters). Record it with Record question,
  dividing it where the letter does."
- `ref-too-long`: "Its number is longer than a question number can be recorded with (40 characters). Record it with Record
  question under a shorter reference."
- None found: "No numbered questions were found in the letter's text." followed by the forms sentence.

**Trailers.**

    Plan: S10
    Completes: client/src/concept2cure/v2/surfaces/LetterQuestionProposals.tsx

**Coordinate with:** the coordinator and the D0 and D6-2 holders of `commcenter-v2.css`: the flex rule is a
precondition (§8, question 8), and the button class is D6-2's unless consent is recorded (§8, question 10).

### 3.7 Sub-slice 7 (re-plan step 15, S10-4): the order rule, conservative (H4)

**What already exists.**
- R1 (`letter-questions.ts:62-67`): any opener opens anywhere.
- `OPENER` (:31) needs `[ \t]+` after the delimiter, so `3. Clarify` is merged into the question before it
  (P6-merged "merged question").
- No order rule.
- `compareQuestionRefs` is an order of refs, not a continuity check. Shared code cannot import it, and it is not
  needed.
- Pins:
  - `letter-questions.test.ts:51-56` (`Question 1:` then `1.2)`) keeps its refs and words. The prototype adds a `gap`
    reason to question 1 (1.1 is missing), which the pin does not assert. The evidence says so.
  - `new-tool-handlers.test.ts:182-196` stays green: no question is removed.

**The rule** (each reason names the opener's line, or the line it is about). It runs over the questions before the
sign-off, in order, with each number read as its parts.
- **gap.** The next number skips (2 then 4, or 2.1 then 2.3, or 1 then 1.2): the question before the gap is not
  offered, with the missing number named.
- **starts-above-one.** The first number is above 1: the first question is not offered.
- **restart.** The number goes back with no heading between (the heading is the `above` of sub-slice 8): the question
  before is not offered (its list continues), and the restarted run is `inner-list` until its own form resumes the
  outer number. A keyword "Question 1" is resumed only by "Question 2", never by a plain "2.".
- **What counts as a heading between runs** (revision 2, critique 10, on FDA's minutes template):
  - (a) a question that is `heading-only` ("2.1. Chemistry, Manufacturing, and Controls" over "Question 1:") is a
    heading between the runs around it, and is never itself a member of a run, so it never starts a restart that no
    keyword question can resume;
  - (c) an agency response boundary between two openers closes the run like a heading, and the numbered items inside
    a response (`in-response`, sub-slice 8) are not run members at all, so a "1. … 2. …" list inside "FDA Response to
    Question 1:" never makes the sponsor's Question 1 a `restart`;
  - (d) a run's form includes its delimiter: "2)" never resumes a "1." run, so in "1. … address the following: /
    1) … / 2) … / 2. …" the inner "2)" is inner-list and the outer "2." resumes.
  - Until sub-slice 8 lands, (a) and (c) have nothing to read (no `heading-only`, no response boundary), so this
    sub-slice lands (d) and the run-membership hook; (a) and (c) switch on with sub-slice 8's statuses. The prototype
    measures them together.
  - Rejected: (b) "keyword openers form their own sequence, checked only against keyword openers". Measured with the
    switch `R2_KWSEQ=1`: §5 revision-2 item 10.
- **outer-numbering.** Within the three lines with words above a run's first opener, in no question, stands a label
  the opener does not read: "Comment 1", "Query 1:", "Question 1:Does", "Question 1—", "Question 3a", or an outer list
  item "a. … the following:" / "(a) …:" / "i. …:". The run is not offered.
- **merged-number.** A line inside the words opens with the question's next number as a reader sees it ("3 . Clarify",
  a bare "3.", "3. …"), or with an unread keyword label ("Deficiency 2:", "OBSERVATION 2", "Question 2:Does",
  "Query 2:"). The question is not offered. The line is never split off.
- **starts-mid-sentence** (revision 2, critique 12: only with a sign that a wrap happened). The words begin in lower
  case (a wrapped "2. of your amendment") **and** there is a wrap signal:
  - the previous question's last line has no sentence end (and does not end "; and" or "; or", a list item's end);
  - or the previous question holds an inline enumerator that this number continues (": 1. specificity", "provide
    1) …");
  - or, for the first question, the line before its opener has no sentence end.

  Exempt: a first word with a capital after its first letter (pH, hERG, eCTD, cGMP, mRNA, mAb: their own case, not a
  wrap); and a run of lower-case items after a lead-in ending ":", whose items end ";", "; and", "; or" or ".".
  **Not in a Word letter**: there the stored text holds no number Word adds by itself, so a ":" lead-in may be a
  numbered question G3 cannot see and the typed lower-case items its inner list
  (`P6-merged-word-numbered/autonum-outer-typed-inner.docx`, `autonum-typed-paren-items.docx`, whose item 2's words run
  into the next auto-numbered paragraph); in a Word letter every lower-case start is `starts-mid-sentence`, as in r1
  (found by measurement on the S10 fixtures). Then the question is not offered, and the question before it is `ends-mid-sentence` ("continues on the next numbered line"),
  under the same signal, never without it.
- **ends-mid-sentence.** The last line runs on (`runsOn`: a comma, a hyphen, or "the", "with", "including"…): not
  offered. A line ending "; and" or "; or" does not run on: it ends a list item.
- A response block (sub-slice 8) ends at an unread keyword label, so "Question 3a:" after "FDA Response:" is a line in
  no question, never silently swallowed.
- `OPENER` reads a no-break, figure or narrow no-break space after the delimiter as the space it is. The offsets stay
  exact: the slice starts after that space.

**Files.**
- `shared/agency/letter-questions.ts`;
- `shared/agency/__tests__/letter-questions.test.ts`;
- `LetterQuestionProposals.tsx` (the sentences).

**Red tests** (`letter-questions.test.ts`; stored text inlined):
- **Direct assertions on the oracle's misses** (`fixtures.md` §5.3: no oracle red exists for these), from
  `scratchpad/s10/attempts/`:
  - `oracle-miss/H4-gap-1-2-4.txt`: 2 is `gap`, with 3 named;
  - `oracle-miss/H4-list-starts-at-3.txt`: 3 is `starts-above-one`;
  - `oracle-miss/H4-wrapped-number-after-unfinished.txt`: 2 is `starts-mid-sentence`, and 1 is `ends-mid-sentence`;
  - `oracle-miss/P6-inner-paren-two-subitems.txt`;
  - `oracle-miss/keyword-dash-delimiter.txt` ("Question 2 - Does…" merged);
  - `P6-order/numbers-out-of-order.txt` (1, 3, 2).
- "P6-inner": `P6-inner/ir-paren-subitems.txt`, `labeling-comment-outer.pdf` and `question-outer-plain-inner.docx`:
  every inner item is not offered.
- "P6-merged: merged question":
  - `P6-merged-merged-question/ir-hanging-number.pdf` and `ir-spaced-delimiter.pdf`: 2 is `merged-number`;
  - `ir-nbsp-after-number.docx`: 3 is offered on its own, verbatim, starting after the no-break space.
- "P6-merged: other numbering": `P6-merged-other-numbering/ai-deficiency-keyword.txt`, `form-483-observations.txt` and
  `minutes-question-no-space.pdf`.
- "P6-merged: Word-numbered paragraph": `P6-merged-word-numbered/autonum-outer-typed-inner.docx` and
  `autonum-typed-paren-items.docx` (stored text): the typed inner items begin in lower case and are not offered.
- "P4-guess": `P4-guess/blank-lines-page-gap.txt` (ends mid-sentence).
- The realistic outer cases from `redteam/r1-numbering/`, reduced to short synthetic letters: `n01` (a. with 1. 2.),
  `n02` (Query 1), `n05` (Question 3a after an FDA Response), `n18` ((a)), `n19` (i.).
- Revision 2 (critiques 10 and 12), short synthetic letters in public FDA wording (`scratchpad/s10/r2/probes/`):
  - outer "1." with inner "1) 2)" then outer "2.": the outer "2." is not `inner-list`;
  - the critic's lower-case list after "Submit the following in your response:" ("1. a description …; 2. the batch
    analyses …; and 3. …"): all three offered;
  - "2. pH of the reconstituted solution …", "3. cGMP status …", "2. hERG assay …", "3. eCTD sequence …": offered, and
    the clean question before each stays offered;
  - kept red: `t08`, `w11` (inline enumerations), `h09` (a wrapped number after "approximately") and
    `H4-wrapped-number-after-unfinished.txt`.
  - (a) and (c) are asserted in sub-slice 8 (they need its statuses): a reduced `rf08` with Questions 1–4 offered and
    2.1 and 2.2 `heading-only`; a keyword-only minutes letter whose response holds "1. … 2. …", Question 1 offered.
- **Timing:** a synthetic 48,000-line letter of 24,000 restarted questions (`redteam/probes/big-crafted.txt` in shape,
  generated in the test) splits in under 2 s. The prototype took 33 s when the inner-list walk did not advance past each
  run, and 0.17 s when it did.
- **Verbatim, over every fixture of this file:** each question's `text === letter.slice(start, end)`; the slice starts
  right after its label and its following spaces; it ends at a line's end.
  - Completeness critic: the same property also holds the oracle's P1-exact, P1-segments and P6-order clauses, which
    are 0 on trunk and unreachable for G3 (`fixtures.md` §2) and so can have no red test: label lines strictly increase,
    and each question's `end` is at or before the next question's `start`. Its own fixture is
    `scratchpad/s10/attempts/P6-order/repeated-line-across-questions.txt` (placed in no sub-slice before): both
    questions offered, each its own slice although they share a line's words (revision-2 fixture run).
- **Expected outcomes the list above left unstated** (completeness critic; the revision-2 prototype with steps
  5, 6, 11 and 15 on, `scratchpad/s10/critic-completeness/attempts-at-step15.out.txt`):
  `P6-order/numbers-out-of-order.txt` (1, 3, 2): 1 `gap` (2 named), 3 `restart`, 2 `inner-list` (3); none offered, the
  conservative price of an out-of-order list. `oracle-miss/P6-inner-paren-two-subitems.txt`: 1 and 3 offered; 2
  ("Address the following for the container closure system:") `restart`, and its "1)" "2)" `inner-list` (2); with
  sub-slice 8, question 2's reason becomes `ends-with-colon`, which comes first in the one-reason order (§3.0;
  `r2/out/fx-r2.json`). `oracle-miss/keyword-dash-delimiter.txt`: question 1 `merged-number`. `H4-gap-1-2-4.txt`: 2
  `gap` (3), 1 and 4 offered. `H4-list-starts-at-3.txt`: 3 `starts-above-one`, 4 offered.
  `H4-wrapped-number-after-unfinished.txt`: 1 `ends-mid-sentence`, 2 `starts-mid-sentence`, 3 offered.

**Mutations** (each removes one rule and fails its own fixture):
1. Remove gap: H4-gap goes red.
2. Remove starts-above-one: H4-list-starts-at-3 goes red.
3. Remove restart or inner-list: the P6-inner fixtures go red.
4. Let a plain "2." resume a keyword question: `redteam/fixtures/outer-single-question.txt` (reduced) goes red.
5. Remove outer-numbering: labeling-comment-outer and n01 go red.
6. Remove merged-number: the hanging and spaced fixtures go red.
7. Remove the paired ends-mid-sentence: H4-wrapped's question 1 goes red.
8. Restore `[ \t]+` in `OPENER`: ir-nbsp-after-number goes red.
9. Make the inner-list walk quadratic: the timing test goes red.
10. Drop the delimiter from the run's form: the outer/inner "2)" letter goes red.
11. Refuse every lower-case start (no wrap signal): the pH/hERG and lower-case-list letters go red.
12. Drop the wrap signal's "no sentence end" branch: H4-wrapped goes red.
13. Drop the Word-letter branch of `starts-mid-sentence` (completeness critic): `P6-merged-word-numbered/autonum-*.docx`
    go red, their typed lower-case items offered (the revision's own regression, §5 "Found by the revision's own
    measurement"; it had a fixture and no mutation). Run once through the service as well, so a lost `method`
    (sub-slice 4, rule 7) is seen.
14. Let a question's slice run past the next opener's start: the order half of the verbatim property goes red.

**Oracle expectation** (cumulative): 1,398 → 703 (contract-relevant 1,213 → 529).
- P6-merged other numbering 356 → 0, merged question 20 → 0, P6-inner 14 → 2 (the two left close at sub-slice 8, whose
  `in-response` items and `heading-only` questions (a) and (c) need).
- P4-guess 64 → 9, P6-signature signature 31 → 12, P1-foreign heading 263 → 84.

**Usefulness budget.** Offered 132 → 117. Clean 70 → 70. Reader 70 / 42 / 35 → 74 / 31 / 42. Twelve cuttable
questions are newly not offered (and five newly offered): restarts whose heading only sub-slice 8 shows
(`ema-loq.docx`, `ema-loq.pdf` and `ema-aspect-per-page.pdf` question 2, `fda-crl.pdf` question 3, `rf03` question 3),
the minutes' questions under a numbered heading (`rf06` question 3, `rf08` and `rf10` questions 3 and 4), and two whose
last line runs on (`regards-wrapped.pdf` question 4, `rf06` question 4). Ten of the twelve are offered with the reader's words at sub-slice 8; the two
in `rf06` stay after its cover letter's sign-off. The floor holds at every family.

**Words** (one sentence each, then "Check the letter, then record it with Record question."):
- gap: "The next number found after {ref} is {next}; {missing} was not found, and may be inside this question's words."
- starts-above-one: "The letter's numbering starts at {ref}{ on page N}; no question 1 was found before it, so this line may not
  open a question."
- restart: "The numbering goes back to {next} after this question with no heading between, so those lines may be parts of
  this question."
- inner-list: "This line may be part of the list inside question {outer}, not a question of its own. If it is a question
  of its own, record it with Record question under a reference not already used on this letter."
- outer-numbering: "This line sits under "{quote}", which numbers the letter's items another way, so it may be a part of that
  item."
- merged-number: "Its words include "{quote}"{ on page N}, which looks like the start of another numbered question."
- starts-mid-sentence: "Its words begin mid-sentence ("{quote}"), so this line may be the wrapped end of the sentence before it."
- ends-mid-sentence: "Its words stop mid-sentence at "{quote}"; the rest may be on the next lines." With the paired reason:
  "Its sentence may continue on the next numbered line."

**Trailers.**

    Plan: S10
    Completes: shared/agency/letter-questions.ts

**Coordinate with:** the coordinator and `011Dpx…`.

### 3.8 Sub-slice 8 (re-plan step 16, S10-5): headings, closings, sign-off and responses; repeated numbers told apart (H6, H5)

**What already exists.**
- `CLOSING` (`letter-questions.ts:34`) ends a question at any line starting "regards", "we request that you", "please
  submit/provide your response" or "if you have any questions".
  - This is W4: "We request that you submit the qualification report…" inside question 2 is cut off, and the words are
    dropped.
  - A wrapped "With / regards to the impurity profile" is cut too.
- R2 (:69) drops everything after a closing line.
- R5 (:76-77) glues headings, "FDA Response:" and signature lines into the words.
- An opener after the sign-off opens (enclosure lists, quoted e-mails).
- `letter-commitments.ts:67-72` `isHeading` (80% capitals) is trunk's only heading test. It is a different rule,
  section headings of commitments with digits in them ("…UNDER 505(o)"), so it stays.
- `letter-commitments.ts:110-123` is a byte-identical copy of `linesOf`.

**The rule** (revision 2 rewrote the closings, the trailing heading, the response block and the lead-in, and added the
e-mail boundary and the repeated numbers told apart; each change names its critique item, §5 revision 2).
- **Sign-off.** A whole line, read as a reader sees it, is a sign-off when it is one of the following, with an optional
  comma or period after it and capitalised as a sign-off is:
  - Sincerely (yours), Yours sincerely/faithfully/truly, Very truly yours;
  - Respectfully (yours/submitted);
  - (With) Kind/Best/Warm/Warmest regards, Regards, Best wishes, Cordially;
  - "Thank you," "Thanks," or "Many thanks," (an RPM e-mail's sign-off), only when the line before ends a sentence and
    the line after is name-shaped ("John Doe, PharmD"; critique 3);
  - the electronic-signature lines.

  The line before it must not run on into it, and the line after it must not continue in lower case. **Nothing after
  it is offered.** Questions after it are still returned, not offered (`after-sign-off`), so the person sees them, and
  the letter carries a `sign-off` note.
  - Harvest H6 also said "the next number after the sign-off refuses the split". That is narrowed, not built
    (completeness critic): a number after the sign-off that continues the letter's numbering is `after-sign-off`,
    listed with its reason, and the questions before the sign-off stay offered. Measured on the two inputs where the
    oracle notes "continues the numbering" (`r1-closings/e3-signature-block-then-attachment-continues.txt`: 1–3 offered,
    4 `after-sign-off` under "ADDITIONAL COMMENTS"; `r1-numbering/h07-continued-after-signoff.txt`: 1–2 offered, 3
    `after-sign-off` under "ADDENDUM"; `r2/out/r2-all.json`). Refusing the whole split would hide nothing more and cost
    the clean questions before it.
- **A quoted message ends the letter's own words** (critique 3), whatever its sign-off phrase: a "-----Original
  Message-----" or "----- Forwarded message" line, or a "From:" line followed within three lines by "Sent:" or "Date:"
  and by "Subject:". It is the sign-off boundary when it comes before any sign-off. Every opener after it is
  `after-sign-off`, and the letter carries a `quoted-message` note naming that line. When it is the boundary, the last
  question's words may end with an unpunctuated signature block ("John Smith / Regulatory Project Manager") that no
  sign-off phrase introduced: lines with no sentence end after the question's last finished sentence then make the
  question `closing-inside`, naming the first of them. Nothing is cut there (a name block and a lot list look alike), so
  the question is not offered rather than trimmed.
- **Response.** A line opening "FDA/Agency/EMA/CHMP/PMDA/CDRH/CBER/CDER/Sponsor/Applicant (Preliminary)
  Response/Discussion/Reply/Answer/Feedback (to Question N):" ends the question. The lines after it are the response
  block, in no question and not a dropped line. The block's lines end (critique 5) at:
  - a strong heading: the heading and the lines under it are then an `unnumbered-section` note, said, and the question
    the response follows stays offered (its cut was at the response boundary, not at the heading);
  - a closing with no numbered line after it before the sign-off;
  - an unread label (sub-slice 7);
  - the next opener.
- **The response's own numbering** (critiques 5 and 10). A numbered line inside an open response block is the
  response's item, not a question of the letter: `in-response`, naming the question the response follows. The block's
  numbering stays open across headings inside it ("FDA Response: Yes, with the following comments. / Clinical
  pharmacology / 1. Collect …"). It closes at:
  - an opener that continues the answered question's numbering (same form, a higher number) and does not continue
    the response's own run ("Question 3" after "Question 2 … FDA Response … 1. … 2. …");
  - a numbered heading ("2.2. Nonclinical", heading case, no end punctuation, an opener next);
  - a closing.

  The letter carries one `responses` note, with the number of questions an agency response follows.
- **Headings.**
  - A capitals or section-word heading (`strongHeading`), or a Title Case discipline heading directly before the next
    opener (below), ends the question **only when the line before it ends a sentence and is not a list line**
    (critique 2). A list line is an application, DMF, lot or batch number with its identifier ("DMF 045678", "Lot
    21-001"), a list item, or any line under a lead ending ":" in the same question's words.
  - Otherwise a trailing heading stays in the words and the question is `heading-unclear`: "EXAMPLE API SPA" after
    "DMF 045678" (`r1-furniture/f02`), "Container closure system" after "DMF 045678" (`f06`), "STORE BELOW 25 C" after
    "…which currently reads" (critic probe `c4b`), and `x01-dmf-list-then-heading`'s "DRUG PRODUCT" after "DMF 041234",
    which has the same shape as f02 and is therefore no longer offered. That is the contract's price: the splitter
    cannot tell the holder's name from a heading.
  - A run of headings ("PRODUCT QUALITY / DRUG PRODUCT") is judged by the line before the run.
  - The heading lines that leave the words are `above` of the next question, shown above it, verbatim
    (`letter.slice(start, end)`, critique 19). The heading block right above the first question (after the letter's
    body, before the first opener) is its `above` too.
  - A heading-shaped line that is not strong, at the end of the words after a finished sentence, is `heading-unclear`,
    unless the line before ends in ":" or is itself a list line, or the line is itself a list line ("Lot 2201" after
    "…for the drug substance lot below.").
  - **Title Case discipline headings** (critique 13): a Title Case line (every word of four letters or more
    capitalised) directly before the next opener, with no digit and no tab in it (a table row such as "B5678<TAB>Site
    2<TAB>Clinical" is not a heading: `P5-control-tab/tab-separated-lot-table.txt`, a green guard of sub-slice 1, found
    by measurement), whose last word is a section noun (Comments, Requests, Issues, Deficiencies, Questions, Concerns,
    Objections, Observations) or which holds a discipline term (Clinical, CMC, Nonclinical, Pharmacology, Toxicology,
    Statistical, Regulatory, Labeling, …), is a strong heading: "Clinical
    Comments", "CMC Comments", "Nonclinical Pharmacology/Toxicology". The `heading-unclear` test also reads the opener
    line as the line before, so a one-line question before such a line is judged as the rule says (the r1 prototype
    skipped it).
- **Unnumbered sections** (critique 2). Lines under a heading are an `unnumbered-section` note, and the question before
  stays offered, only when **no numbered line follows them before the closing or sign-off** (CRL "SAFETY UPDATE",
  "PRESCRIBING INFORMATION"), or when the heading ended an agency response block. Lines under a heading that cut a
  question and are followed by another numbered question are in no question: the question before is `unplaced-lines`,
  and that heading is not shown above the next question (it may be the question's own table header: critic probe
  `c5`, "IMPURITY RRT LIMIT").
- **Lead-in** (critique 7). The last sentence of a question's words that ends in ":" right before the next opener leaves
  the words and is `above` of the next question **only when it opens with context** ("Regarding the dissolution method,
  address the following:", "With respect to…", "For…", "The following…"). When it opens with a request (Provide,
  Revise, Submit, Clarify, Justify, Include, Confirm, Explain, Address, Describe, … or "We request", "We recommend") it
  is the question's own request: nothing moves, and the question is `ends-with-colon` (critic probe `c6`). When the
  sentence starts on the opener line, nothing moves and the question is `ends-with-colon`, **one-line questions
  included** (critic probe `c6b`: "1. Revise the drug substance specification to include the following:" right before
  "2."; the r1 prototype offered it).
  - A lead-in in no question (after a heading, a gap or a response) may wrap over up to four lines, none ending a
    sentence before its last, which ends ":" right before the next opener (the hold letter's "The following comments
    are not clinical hold issues; however, we recommend that you address / them in your complete response:", `rf03`).
- **Closings and request-shaped lines** (critique 1). Two classes, never one list:
  - **closings**, which end the last question: "If/Should you have any questions"; "Please do not hesitate"; "Please
    contact" followed by me, us, the undersigned, the (Regulatory) Project Manager, the RPM or a person's name; "Please
    submit/provide your response(s)…"; "Submit your response(s)"; "Your response is due"; "The deficiencies identified
    above"; "If the requested information is not received"; "Please identify your (complete) response" (the clinical
    hold template's closing, found by the reader list, below);
  - **request-shaped lines**, which never cut: "We request that you submit/respond…", "We request a/your response…",
    "Your response should/must…", "Please contact <anyone else>" ("Please contact the DMF holder…"). They are the
    question's words wherever they stand.
  - A closing that another question follows before the sign-off is part of the words, and does not cut.
  - The first closing after the last question ends it. Only that closing's own sentence (continuation lines up to a
    sentence end), and further closings, are exempt. **Any later line with words before the sign-off makes the last
    question `closing-inside`**, naming the closing and the line after it (critic probe `c3`: "Please submit your
    response within 30 days." then "In addition, submit updated carton labeling…").
  - "If/Should you have any questions" anywhere inside a last question's words is `closing-inside` (`rf07` Q5; `d3`,
    where it is quoted text at a line's start, with more of the question after it).
- **Heading-only** (critique 13). Words that are one heading-shaped line with no end punctuation **in a heading's case**
  (all capitals, or Title Case), or followed directly by a deeper or keyword opener ("2.1. Chemistry, Manufacturing, and
  Controls" over "Question 1:"), are not offered. A sentence-case unpunctuated item ("1. Updated stability data for lot
  21-001") stays offered. (The skeptic's caveat, that `unmarked-header.pdf` Q2 relied on `heading-only` as its only
  guard, is closed by the heading rule above: "CONFIDENTIAL" after "…and the stopping" no longer cuts the question, so
  its words run on across the page break and it is `page-furniture`; measured.)
- **Unplaced lines.** Between the first opener and the sign-off, a line with words that is in no question and is not
  any of the following makes the question before it not offered:
  - blank;
  - page furniture;
  - a heading shown above, or one whose section note is said;
  - a lead-in shown above;
  - a response block;
  - the closing's own sentence, or another closing, after the last question;
  - an unnumbered section (as defined above).

  This covers the double-blank cut and a hanging "3." after it.
- **Repeated numbers told apart** (critique 8; in `letter-question-proposals.ts`, extending sub-slice 2):
  - **Who counts.** A number repeated in the letter's own numbering is one held by two or more proposals that are not
    `after-sign-off`, `in-response`, `inner-list` or `outer-numbering`. Those four are outside the letter's own
    numbering by a boundary the splitter found; they never make another proposal `repeated-number`. They still count
    for "Recorded" (sub-slice 2: a number is matched only when no proposal of any kind holds it twice), so leaving them
    out of this count opens no wrong match.
  - **Told apart.** Each question has a heading path: the headings above its run, by level (an agency's top headings,
    "Quality aspects", "CLINICAL"; its sections, "Drug substance", "FACILITY INSPECTIONS", numbered headings such as
    "2.1"; its concern headings, "Major objections", "Other concerns"), each replacing the ones at its level and below.
    A holder of a repeated number whose path differs from every other holder's is offered, verbatim, with a suggested
    reference: the shortest tail of its path that no other holder shares, then its number: "Drug substance, Other
    concerns 1", "Drug product, Other concerns 1", "CLINICAL 2", "NON-HOLD COMMENTS 2". The heading words are the
    agency's, verbatim; the reference is a prefill the person confirms in the Record form.
  - A suggestion is kept only when it fits `QUESTION_REF_MAX` and is unique, by `sameQuestionRef`'s key, among the
    letter's suggestions, its proposals' numbers and its recorded references. Otherwise the holder stays
    `repeated-number`. Holders whose paths are equal stay `repeated-number`. Holders in different linked files are not
    told apart by the file alone: a letter linked as two copies of one file would otherwise offer each question twice.
  - The Record button prefills `recordRef` (the suggestion) instead of the number (`AgencyResponses.tsx:654`, an S10
    file, behaviour only). "Recorded" for such a holder is matched on the suggested reference or on the words, never on
    the bare number.
  - **The suggestion is built from each heading's reading form** (completeness critic, measured). It is the server's
    prefill, not the agency's words, so THE CONTRACT does not bind it, and a reference whose characters the person
    cannot see in the field must not be suggested. Revision 2 built it from the raw heading: 46 suggestions on the
    `r1-characters` variants held a TAB ("A.\tQuality aspects 1", `c02-tab-in-section-heading.docx`), a C1 or DEL
    character ("Part A \u0096 Quality aspects 1", `c06-mojibake-c1-in-section-heading-ref.txt`; the `del-eol` and
    `nel-plus-lf` variants), a no-break space, or an invisible format character (soft hyphen, ZWSP, RLM). Each heading's
    tail is therefore read as §3.0 "Reading lines" reads a line (format characters removed, TAB and Unicode spaces as
    one space), before the uniqueness and length checks. Measured on all 1,261 inputs
    (`scratchpad/s10/critic-completeness/visref.json` against `r2/out/r2-all.json`): those 46 suggestions change and
    nothing else does (165 violations, 9 contract-relevant, 132 offered on the realistic letters, 2,660 offered in all,
    as before).
  - **Linear** (completeness critic, §3.0): for each tail length, one pass over a number's holders counts tails in a
    `Map`, and a holder takes the shortest tail whose count is 1. The prototype's per-holder scan of every other holder
    took 87 s for 12,000 holders of "1" under distinct headings.
  - **The 40-character limit stays** (harvest H5's "raise the POST's ref limit from 40 to 200" is dropped, measured):
    with the limit at 200, one holder on all 1,261 inputs is offered that is not offered at 40
    (`r1-wrapping/w14-ema-roman-tab-headings.docx` question 1, line 23, whose tail "III. CLINICAL ASPECTS, Major
    objections 1" is 41 characters), and every other result is equal (`scratchpad/s10/critic-completeness/ref200.json`).
    One question does not pay for widening a validated field.
  - This departs from re-plan step 6's wording ("Proposals that share a number are not offered") and follows its
    advice ("record each under a distinct reference, such as its section name"): the coordinator decides (§8, question
    1). Without it, 17 of the 147 cuttable questions on the realistic letters are refused for the shared reference
    alone (`R2_OFF=qualify`: 32 not offered against 15, §2).
- Blank lines are judged on the visible line, so a line of only DEL or zero-width characters is blank.
- `linesOf` is exported and `letter-commitments.ts` imports it in place of its copy (zero duplication). Its own
  `CLOSING`, `isHeading` and behaviour are unchanged, and `shared/agency/__tests__/letter-commitments.test.ts` stays
  green.

**Files.**
- `shared/agency/letter-questions.ts`;
- `shared/agency/letter-commitments.ts` (the import only);
- `server/services/agency-responses/letter-question-proposals.ts` (passes `notes`, `above` and `path`; the count of
  the letter's own numbering; the suggested reference; `recordRef`);
- `LetterQuestionProposals.tsx`;
- `client/src/concept2cure/v2/surfaces/AgencyResponses.tsx` (`:654`, the Record prefill reads `recordRef`; behaviour
  only, no markup);
- the tests.

**Red tests** (`letter-questions.test.ts`; each fixture's stored text inlined):
- "P1-foreign: heading": `P1-foreign-heading/crl-caps-discipline.pdf`, `ema-loq-other-concerns.docx` and
  `ir-discipline-headings.pdf`. The heading leaves the words and is `above` of the next question, and the question is
  offered.
- "P1-foreign: section": `P1-foreign-section/crl-safety-update.pdf`, `hold-non-hold-comments.pdf` and
  `ir-administrative-comments.docx`. The question ends at the heading, and the letter carries an `unnumbered-section`
  note.
- "P1-foreign: lead-in": `P1-foreign-lead-in/ir-lead-in-paragraph.txt`, `ir-lead-in-wrapped.pdf` and
  `ir-nonclinical-lead-in.docx`.
- "P1-foreign: response": `P1-foreign-response/cdrh-presub-feedback.txt` ("FDA Feedback:"),
  `preind-preliminary-responses.pdf` and `typec-minutes-discussion.docx`.
- "P1-foreign: closing": `P1-foreign-closing/ir-information-not-received.txt`, `ir-please-contact-rpm.pdf` and
  `ir-should-you-have-questions.docx`.
- "P6-signature: signature": `P6-signature-signature/cdrh-kind-regards.pdf`, `ema-yours-sincerely.docx` and
  `rpm-email-best-regards.txt`. Also "Kind regards," and "Kind regards ," (`redteam/r1-characters/c05`
  shapes), and "Warm regards," / "Cordially" / "Sincerely." (`redteam/r1-closings/c2`, `c7`, `c3`).
- "P6-signature: after sign-off": `P6-signature-after-sign-off/ir-enclosure-list-restart.pdf`, `minutes-attachments.docx`
  and `unnumbered-requests-numbered-enclosures.txt`.
- "P6-signature: quoted e-mail": `P6-signature-quoted-email/original-message-chain.txt` and `rpm-reply-quoting-sponsor.txt`.
- "P3-coverage":
  - `P3-coverage/we-request-inside-question.txt`: question 2 now holds its "We request that you submit…" lines and is
    offered, which is W4;
  - `double-blank-before-subitems.txt` and `hanging-last-number-after-gap.txt`: `unplaced-lines`.
- "P3-coverage: Word-numbered paragraph dropped": `P3-coverage-word-numbered/autonum-requests-typed-enclosures.docx`.
  The enclosures after the sign-off are not offered. The Word-numbered requests stay unseen (§0); the Word caution of
  sub-slice 6 says so.
- "P4-guess": `P4-guess/we-request-wrapped.pdf` and `with-regards-wrapped.pdf`. Neither is cut any more; both are
  offered whole.
- **Direct assertions** for the misses after a sign-off (`fixtures.md` §5.4-5.5):
  - a cover letter's "Sincerely," with enclosed minutes after it: every question there is `after-sign-off`, and the
    note names the sign-off;
  - "2.1. Chemistry, Manufacturing, and Controls" alone: `heading-only`;
  - a last question holding "…If you have any questions, call…" mid-line: `closing-inside`.
- **Green guards** ("P3-heading", the audit's intended outcome): `P3-heading/ema-empty-paragraph-before-heading.docx`
  and `ir-double-blank-before-heading.txt`. The question before the heading stays offered, without it.
- **Revision 2 red fixtures** (each a short synthetic letter in public FDA/EMA wording, reduced from the red-team or
  critic letter named; each red on the r1 rule, green on the r2 rule, measured on the prototype,
  `scratchpad/s10/r2/probes/` and `scratchpad/s10/r2/out/r2-all.json`):
  - closings (critique 1): `d6` (the last question offered with "Please contact the DMF holder…" and "In addition,
    provide…" in its words); `c1` ("Your response should include…" kept); `c2` ("We request that you submit…" and
    "Include the photostability study results." kept); `c3` (`closing-inside`, naming "In addition, submit…"); `d3`
    (`closing-inside`: "If you have any questions about Examplitinib…" is quoted text with the request after it);
  - trailing headings (critique 2): `f02` and `f06` (`heading-unclear`, nothing moved above question 2); `c4b`
    (`heading-unclear` on "STORE BELOW 25 C"); `c5` (question 1 `unplaced-lines`, and question 2 shows no "Under
    IMPURITY RRT LIMIT"); `x01` (`heading-unclear`); the CRL "SAFETY UPDATE" / `rf04` "PRESCRIBING INFORMATION"
    sections (no numbered line after them) keep their note and the question before stays offered;
  - e-mail (critique 3): `e8c` (the quoted message's question 3 is `after-sign-off`, and "Thank you," is the sign-off);
    `c8` (question 2 ends at "…for the assay.", the sign-off note names "Thank you,"); `c8` without its "Thank you,"
    line (the `quoted-message` note names "From:", and question 2, whose words would end with the signature "John Smith
    / Regulatory Project Manager", is `closing-inside`: found by measurement, below);
  - responses (critique 5): `c7` ("ADDITIONAL CLINICAL COMMENTS" and its two requests in an `unnumbered-section` note;
    questions 1 and 2 offered); `n29` (the items under "Clinical pharmacology" are `in-response (1)`; the `responses`
    note counts 3);
  - lead-ins (critique 7): `c6` (question 1 `ends-with-colon`, "Revise the specification…" not moved) and `c6b`
    (one-line `ends-with-colon`);
  - minutes (critique 10): a reduced `rf08` (Questions 1–4 offered, 2.1 and 2.2 `heading-only`, the response's
    "1. the stability protocol…; 2. …" `in-response (2)`); a keyword-only minutes letter whose response holds a
    numbered list (Question 1 offered);
  - Title Case and heading-only (critique 13): "1. Updated stability data for lot 21-001 / 2. … / 3. …" all offered;
    a one-line question before "Clinical Comments" offered without it, the heading shown above the next question;
  - repeated numbers (critique 8): `ema-loq.docx` (5 of 5 offered, with "Drug substance, Major objections 1",
    "Drug substance, Other concerns 1", "Drug product, Other concerns 1", "Clinical aspects, Major objections 1" and
    the unique "2"); the synthetic hold letter `scratchpad/s10/r2/letters/hold.txt` (4 of 4, "CLINICAL HOLD
    DEFICIENCIES 1"… "NON-HOLD COMMENTS 2"; not `rf03`, where the same headings give "CLINICAL HOLD DEFICIENCIES 2" and
    "NON-HOLD COMMENTS 1" only, its deficiency 1 being `page-furniture` and its non-hold comment 2 `closing-inside`,
    `r2/out/r2-all.json`); `fda-crl.pdf`'s
    "CLINICAL 1", "PRODUCT QUALITY 1", "FACILITIES INSPECTIONS 1"; `enclosures-after-sign-off.txt` questions 1 and 2
    offered (their other holders are after the sign-off); recording "Drug substance, Other concerns 1" marks that
    holder only, and a bare "1" marks none;
  - the hold letter (`rf03`, reduced): the wrapped lead-in "The following comments are not clinical hold issues; …
    them in your complete response:" is `above` of "1. Include a schedule…", and the last question, which runs into
    "Please identify your response…", is `closing-inside` (found by the reader list, §2).
- **Pins kept:** the IND letter (`letter-questions.test.ts:42-49`) keeps its refs, words and offsets, all offered
  (prototype, `pins.mts`).
- **Added by the completeness critic** (the told-apart rule had no test of its limits, its speed or its prefill):
  - `letter-question-proposals.test.ts` (pure): `c02-tab-in-section-heading.docx` (reduced) suggests "A. Quality
    aspects 1" with a space, and a soft-hyphen heading suggests the reference without U+00AD;
  - the same file: `w14-ema-roman-tab-headings.docx` question 1 (reduced) stays `repeated-number`, its 41-character
    tail over the limit; a suggestion equal to another proposal's number, or to a recorded reference, is not made and
    the holder stays `repeated-number`;
  - timing, in this commit: 12,000 holders of "1" under 12,000 distinct headings are proposed in under 1 s (the
    prototype: 87 s; with the told-apart pass off, 0.2 s at 6,000);
  - `agencyResponsesLetterProposals.test.tsx`: Record on a told-apart holder opens the Record form with its `recordRef`
    ("Drug substance, Other concerns 1") in the number field, not "1".

**Mutations.**
1. Use a sign-off without the visible-space reading: the no-break-space sign-off goes red.
2. Drop "Warm regards" from the list: red.
3. Read openers after the sign-off as offered: the enclosure fixture goes red.
4. Let a closer that another question follows cut the question: we-request-inside-question goes red.
5. Do not end at a response boundary: the response fixtures go red.
6. Glue a trailing strong heading after a list line: the reduced `x01` case goes red.
7. Do not move the lead-in: the lead-in fixtures go red.
8. Drop unplaced-lines: the double-blank fixture goes red.
9. Drop heading-only: the 2.1 case goes red.
10. Break the `linesOf` import: the commitments suite goes red.
11. Remove the verbatim property: the property test goes red.
12. Let a request-shaped line cut the last question (the r1 closer list): `d6`, `c1` and `c2` go red (`R2_OFF=closers`).
13. Exempt every line after the closing up to the sign-off: `c3` goes red.
14. Restore "whatever the line before" for a trailing heading: `f02`, `f06` and `c4b` go red (`R2_OFF=heading`).
15. Let an unnumbered section stand when a numbered line follows it: `c5` goes red.
16. Drop the quoted-message boundary: `e8c` goes red; drop "Thank you,": `c8` goes red (`R2_OFF=email`).
17. Let the response block swallow headings again: `c7` goes red; open the response's numbered items as questions:
    `n29` and the reduced `rf08` go red (`R2_OFF=response`).
18. Move a lead-in that opens with a request: `c6` goes red; drop the one-line branch: `c6b` goes red
    (`R2_OFF=leadin`).
19. Let a heading-only question be a run member: the reduced `rf08` goes red (`R2_OFF=order`).
20. Make `heading-only` ignore case: the sentence-case list goes red (`R2_OFF=titlecase`).
21. Never qualify a repeated number: `ema-loq.docx` and the hold letter go red (`R2_OFF=qualify`); qualify by source
    alone: the two-copies test goes red.
22. Count holders after the sign-off: `enclosures-after-sign-off.txt` goes red (`DUP_ALL=1`).
23. Each line shown above a question equals `letter.slice(start, end)`: replace it with the reading form, and the
    property test goes red (critique 19).
24. Build the suggestion from the raw heading: the TAB and soft-hyphen cases go red (completeness critic).
25. Drop the 40-character check on a suggestion: the `w14` case goes red.
26. Drop the check against the letter's numbers and recorded references: the collision case goes red.
27. Scan every other holder per holder: this commit's timing test goes red.
28. Prefill `p.ref` instead of `recordRef`: the Record-form client case goes red.
29. Allow a digit or a TAB in a Title Case heading: the green guard `P5-control-tab/tab-separated-lot-table.txt` goes red
    (the revision's own regression, §5; it had a guard and no mutation).

**Oracle expectation** (cumulative): 703 → 444 (contract-relevant 529 → 248).
- To 0: P1-foreign heading, response, lead-in and closing; P6-signature after sign-off, signature and quoted e-mail;
  P6-inner; P3-heading; P4-guess.
- P3-coverage 76 → 7: the `nbsp-all-spaces` blind spot of the oracle (§0).
- P1-foreign section 3 → 2, and those are page-furniture cases sub-slice 9 closes.

**Usefulness budget.** Offered 117 → 138. Clean 70 → 70. Reader 74 / 31 / 42 → 116 / 12 / 19: the told-apart repeated
numbers, the minutes' questions and the clean cuts before headings and responses come back; the 12 still offered with
other words all hold page furniture, which sub-slice 9 flags.

**Words.**
- Above a question (from `above`), quiet text: "Under {heading}" / "After: "{lead-in}"". The agency's words, verbatim
  lines: each is rendered as `letter.slice(start, end)` (React escapes it), never the reading form, so a heading that
  holds a control or soft-hyphen character shows it as the letter has it (critique 19; measured: 925 lines shown above
  questions over 1,232 stored texts, all verbatim, `scratchpad/s10/r2/checks.mts`).
- A told-apart repeated number (offered): its row reads as any offered row; the Record form opens with the suggested
  reference ("Drug substance, Other concerns 1") in the number field for the person to confirm or change, and the
  row says once: "Its number, 1, is used under other headings too; the reference names its headings."
- `in-response`: "It is numbered inside the agency's response to question {n} ("{boundary quote}"), so it is part of
  that response, not a question of the letter. If the response asks for something, record it with Record question."
- Letter notes:
  - "Nothing after "{sign-off}"{ on page N} is offered as a question; enclosures, attachments and quoted messages are
    listed there. If the letter encloses minutes or comments after it, record their questions with Record question."
  - "The section "{heading}" has no numbered questions. If it asks for something, record it with Record question."
  - `quoted-message`: "Nothing after "{From: … line}"{ on page N} is offered as a question; it is an earlier message
    quoted below this one. If it asks for something this letter still needs, record it with Record question."
  - `responses` (critique 5), once per source: "The agency's responses in this letter (after "FDA Response:" and the
    like, under {count} questions) are not offered as questions. If a response asks for something, record it with
    Record question."
- Row reasons (each then "Check the letter, then record it with Record question." unless it says otherwise):
  - after-sign-off: "It comes after the letter's sign-off ("{sign-off}")." Then "If it is a question of the letter,
    record it with Record question."
  - heading-only: "It reads as a section heading ("{quote}"), not a question. If it asks for something, record it with
    Record question."
  - heading-unclear: ""{quote}" at the end of its words may be a heading of what follows, or part of the question."
  - ends-with-colon: "Its words end with "{quote}", which introduces a list, and the numbered lines after it may be that
    list."
  - closing-inside: "Its words run into the letter's closing ("{quote}"). Record it with Record question, ending where
    the question ends." With a later line (critique 1): "…closing ("{quote}"), and "{the later line}" comes after the
    closing, before the sign-off; it may be part of this question."
  - unplaced-lines: "The lines after it, from "{quote}"{ on page N}, are in no numbered question and may be the rest of
    this question."

**Trailers.**

    Plan: S10
    Completes: shared/agency/letter-questions.ts
    Completes: shared/agency/letter-commitments.ts

**Coordinate with:** the coordinator and `011Dpx…` (the commitments splitter's import).

### 3.9 Sub-slice 9 (re-plan step 17, S10-6): page furniture flagged, from the receipt's page spans (H7, H8)

**What already exists.**
- `readLetterSources`' SELECT (:81-87) reads no `checksum` or `provenance`. Sub-slice 4 brings them, through `getSource`.
- `readCaptureExtractionEvidence` (`capture-extraction-evidence.ts:61`) returns `pageSpans` only when the receipt binds
  this exact text, method and the caller's checksum. The only writer is the bound processor's UPDATE, guarded by
  `checksum` (`data-room-processing.ts:247`).
- Spans exist for pdf-text and pdf-ocr only; Word and plain text have none. Rows captured before `7efdd69d4`
  (2026-10-20) have no receipt.
- `pageForOffset` (`page-offsets.ts:85`) names a page. It attributes an offset between pages to the next page, so it
  never decides "between pages" (`reuse-map.md` §E).
- Slice 3's furniture removal is not ported (re-plan §2).

**The rule.**
- The service calls `readCaptureExtractionEvidence(provenance.extractionEvidence, checksum.toLowerCase(), text,
  provenance.extractionMethod)`. It is bound to the row's checksum, never to the receipt's own claim. It passes
  `{ pageSpans, method }` to the splitter as plain data: `shared/` imports no server code.
- The page model:
  - receipt spans for PDF;
  - form feeds for plain text, a form feed at a line's start putting that line on the next page (the r1 prototype put
    it on the page before, which made "Major objections" at an EMA page's top a footer of the page above; found by
    measurement on the `pdftotext-ff` variants);
  - none for Word.
- With PDF and no valid receipt, the letter carries a `page-edges-unknown` note, and furniture is found by its wording
  only.
- Edge bands are the first and last three lines with words of each page, a one-page letter included (revision 2: its
  own top and foot; without this, an EMA "Official address …" footer in a stored text with no page break stayed in the
  last question's words once that question was no longer refused for its shared number, `ema-loq.pdf.crcrlf.txt`).
- **Strong furniture:**
  - a line in no page span (between two pages);
  - pdf-parse's joiner `-- n of m --`;
  - a page number or "Reference ID: n" anywhere (in the middle of a page it marks an unmarked page break);
  - in an edge band:
    - the agency's letterhead or address line, never a lower-case line and never one the line above runs on into
      (`r1-furniture/f05`: "…at its / official address as stated…" is the sentence);
    - an EMA document reference;
- **Weak furniture** (flags its question wherever it stands; never moves a cut by itself):
  - an application number ("IND 123456", "PIND 160123", "DMF 045678") in an edge band, only when it lies between the
    page's edge and a strong line, never inward of one (`redteam/fixtures/dmf-at-page-foot.pdf`: a DMF list above the
    Reference ID is the question's words). "PIND" joins the pattern (critique 11: `rf08`'s "PIND 160123" header);
  - **a running header or footer found by repetition** (revision 2, critique 4): the same line, digits aside, at the same
    edge of two pages anchored by a strong line, or of three pages. Repetition alone cannot tell "Lot 2201" at one
    page's foot from "Lot 3301" at the next page's foot: both are the agency's words in critic probe `c9b` and in
    `scratchpad/s10/skeptic-runfoot/rf1-lot-reference-id.txt`. A vocabulary heading ("Major objections") is never a
    running line.
- **Inside the words** (any furniture line before the question's last line of words): the question is not offered
  (`page-furniture`), naming the line and its page. **Nothing is removed from inside a question.**
- **After the last line of words:** when the first furniture line after the question's last line of words (and before
  the next opener) is strong, and that last line does not run on into it, every furniture line after it, strong or
  weak, is outside the cut. The question ends at its last line of words, one verbatim slice, exactly as it ends before
  a heading.
  - So the next page's "IND 123456 / Page 2" header, weak because it repeats on no third page, no longer pulls a
    finished question's cut over the footer and joiner of the page before (critique 11: the two-page IR's question 2,
    `dmf-at-page-foot.pdf` question 2 ending "DMF 045678", `regards-wrapped.pdf` question 3, `rf08` question 2).
  - When the first furniture line after the words is weak, nothing moves: it stays in the words and flags
    (`c9b`: "Lot 3301" at a page foot is `page-furniture`, never cut away).
  - The plan's literal reading (flag every furniture line, move no cut) is measured in §5, item 2.

**Files.**
- `server/services/agency-responses/letter-question-proposals.ts` (the receipt read);
- `shared/agency/letter-questions.ts` (the page model and patterns);
- `LetterQuestionProposals.tsx` (the reason, the note);
- the tests.

**Red tests.**
- `letter-questions.test.ts`, "P2-furniture", with each fixture's stored text and its receipt's spans inlined as
  literals:
  - `P2-furniture/crl-page-number-footer.pdf`, `ema-loq-official-address-footer.pdf` and
    `ir-reference-id-across-page.pdf`;
  - in each, question 2 runs across the page break and is `page-furniture` naming "Page 1 of 2" / "An agency of the
    European Union" / "Reference ID: 1234567" and page 1;
  - questions 1 and 3 are offered.

  The spans come from `extractCapture` through `scratchpad/s10/tools/run.mts`: a handful of numbers per fixture, not a
  corpus.
- The trailing case (`redteam/fixtures/fda-crl.pdf`'s CLINICAL 2, reduced): a page footer, joiner and next page's
  header after the last line of words is outside the cut. The question is offered, verbatim, and ends at "…by dose.".
- Revision 2 (critiques 4 and 11), spans inlined:
  - critic probe `c9b` and `rf1-lot-reference-id.txt` (reduced): every question whose last line is a lot line at a page
    foot is `page-furniture` naming the lot line, never offered without it;
  - the two-page IR with an "IND 123456 / Page 2" header (`scratchpad/s10/critic-overrefusal/probe2.mts`): question 2
    offered, ending "…development report.";
  - `rf08` (reduced): question 2 offered, ending "…clinical study?", with "PIND 160123" outside the cut.
- `letter-questions.test.ts`, the negatives:
  - `dmf-at-page-foot` (reduced): "DMF 045678" stays in the words, and the question is offered ending "DMF 045678"
    (on r1 it was refused `page-furniture`, because the next page's header pulled its cut across the page break);
  - `f05` (reduced): "official address as stated on its manufacturing authorisation." is words;
  - `lot-list` and `table-at-page-foot` (reduced, from `redteam/fixtures/`): stay offered whole.
- `letter-question-proposals.pglite.test.ts`:
  - a row whose receipt was made for other text, or another checksum, gives no spans: furniture by wording only, and
    the `page-edges-unknown` note;
  - a matching receipt gives spans, and the between-pages line is flagged;
  - the page a reason names equals `pageForOffset(spans, at)` for the flagged line (critique 18).
- Added by the completeness critic (two rules this sub-slice states had no test):
  - plain text: a stored text with a form feed at a line's start puts that line on the next page, so an EMA "Major
    objections" heading at the top of page 2 is not furniture of page 1, and a reason on a line after the first form
    feed names page 2 (the r1 prototype's page-before model, found on the `pdftotext-ff` variants, §5 "Found by the
    revision's own measurement");
  - the page a reason names for a line between two receipt spans is the next page, as `pageForOffset` gives it.
- **Timing, many pages** (critique 16): a generated letter of 2,000 form-feed pages, each with a running header and a
  "Page n of m" footer, splits in under 2 s. `big-crafted.txt` has no form feed and no spans, so it is one page, and the
  band and running-header code (`pages.size >= 2`) never runs on it; a quadratic count there could only be seen on a
  letter like this one.

**Mutations.**
1. Let weak furniture move a cut: dmf-at-page-foot goes red.
2. Remove the lower-case and run-on guard on letterhead: f05 goes red.
3. Trust the receipt's own checksum: the pglite mismatch goes red.
4. Remove furniture inside the words instead of flagging it: the P2 fixtures go red, since the words are no longer one
   slice.
5. Cut after a line that runs on into the furniture: a reduced "…as shown in / Page 2" case goes red.
6. Make the running-header count quadratic: the many-page timing test goes red.
7. Let a running footer move a cut (make it strong again): `c9b` goes red (`R2_OFF=runfoot`).
8. Keep weak furniture after a strong trailing line in the words: the two-page IR and `dmf-at-page-foot` go red;
   drop "PIND": `rf08` question 2 goes red (`R2_OFF=pagefoot`).
9. Put a form feed's line on the page before: the plain-text page case goes red.
10. Name a page by containment instead of `pageForOffset`: the between-spans page case goes red.

**Oracle expectation** (cumulative): 444 → **165** (contract-relevant 248 → **9**).
- P2-furniture 237 → 0, P1-foreign section 2 → 0.
- Remaining as §0: 123 DEL/C1, 33 TAB, 7 no-break-space closings, 2 Word auto-numbering.

The evidence reports independent base letters beside raw counts (`fixtures.md` §3). Of the 1,261 inputs, 1,059 are
character variants.

**Usefulness budget.** Offered 138 → 132 (119 under the flag-only reading, `NO_TRAILING_CUT=1`). Clean 70 → 70. Reader
116 / 12 / 19 → **132 / 0 / 15** (flag-only: 119 / 0 / 28). No offer is on no reader-list line.

**Words.**
- page-furniture: "Its words hold "{quote}"{ on page N}, which looks like a page header or footer, not the agency's
  words. Record it with Record question, without that line."
- page-edges-unknown note: "This letter's page breaks were not recorded when it was read, so page headers and footers are found
  by their wording only. Check each question's words against the letter."

**Trailers.**

    Plan: S10
    Completes: server/services/agency-responses/letter-question-proposals.ts
    Completes: shared/agency/letter-questions.ts

**Evidence:**
- re-run the adapted oracle over `redteam/`, writing under `scratchpad/s10/`, never `redteam/g3-work/`;
- file the drop as D2 evidence, with the per-clause table, the residual list, and the usefulness line;
- name the oracle copy's path and its proof that with every rule off it reproduces trunk's 3,288 and 741.
- **Point the oracle at the code, not the prototype** (completeness critic). The adapted oracle loads the splitter and
  `proposeLetterQuestions` from `PROTO` (`scratchpad/s10/r2/proto/oracle-g3-adapted.mts:128-131`) and reads
  prototype-only fields (`path`, `listShows`, the sections, sign-off and response counts). Every number in this design
  is the prototype's. Each sub-slice's evidence therefore runs the adapted oracle against the repository's own
  `shared/agency/letter-questions.ts` and the exported `proposeLetterQuestions`, through a small adapter from the
  §3.0 payload (`notOffered`, `above`, `notes`) to the oracle's inputs, written beside the oracle copy under
  `scratchpad/`, never in the repository. Its proof has two halves: on trunk's code (`609ef94c7`) with `ORACLE_R1=1`
  it gives 3,288 and 741; on the landed code, the offered set on all 1,261 inputs equals the prototype's run for the
  same steps (`r2/out/s-*.json`), and every difference is read and filed. "With every rule off" exists only in the
  prototype; the landed code has no switches.
- The re-plan's step 17 names `run-g3-all.mts` itself. That unadapted oracle treats every proposal as offered, so on
  the landed code it counts each question the panel does not offer as a violation. Its count is filed too, labelled as
  that, and is not the drop this design claims.

---

## 4. Later, not in this design's commits

**Re-plan step 18 (F1-6): AnA's IR draft carries the cautions and the whole list (H12).**
- Package and file: F1, `server/services/ana/AnaToolExecutor.ts` (an S4 path), held by `session_011Fyq…` for
  `generate_document`. The file is taken only when that session releases it.
- The change, in `draft_fda_ir_response` (:16077-16114) only:
  - each question carries its reason in words (the same sentences, server-side);
  - "nothing found" says why: a sign-off note, no numbered lines, or the forms read;
  - the silent `questions.slice(0, 50)` (:16092) goes, or is said beside `questions_extracted`.
- `legacy-import-tool-defs.ts:712-727` describes the tool as extracting "heuristically". The words are corrected; the
  tool name does not change.
- **Until it lands:** AnA lists questions the panel does not offer, with no reason. That is a known gap, named in every
  sub-slice's evidence. The draft is read-only (`tool-authorization.register.json:3358-3366`, class `read`).
- **The words AnA splits are not the stored letter's** (completeness critic, §1). The tool's only input is `ir_text`,
  "pasted as plain text" (`legacy-import-tool-defs.ts:712-727`): when a person uses "Draft response with AnA"
  (`AgencyInbox.tsx:174`), the letter reaches AnA as a pinned source, and the model then passes some text of it to the
  tool. Each question is a verbatim slice of that text, which the model may have re-typed (form feeds, soft hyphens and
  spacing are what a copy loses first), not of `cre_evidence_sources.extracted_text`. The splitter also gets no
  `method` there, so the Word rule and the page model never apply. Step 18 must at least say so in the result (the
  questions are "as found in the text supplied", not "the agency's exact words"), and the scaffold's "FDA Question
  (verbatim)" heading must not claim more. Reading the letter's stored text by its pinned source, through the admitted
  read of sub-slices 3–4, would close it, but it adds an input to an S4 tool held by `011Fyq…`: that is step 18's
  holder's and the coordinator's call (§8, question 12), not this design's.

**Re-plan step 37 (S10-7, optional): where the words came from (H14).**
- An optional `fromLetter { sourceId, start, end }` on POST `.../questions`.
- The server re-reads the admitted slice (sub-slices 3–4) and requires `text.slice(start, end) === questionText`.
  `zod .trim()` is the identity on a G3 slice. Words the person edited drop `fromLetter`, with a sentence.
- `recordSourceSpan` (`span-lineage.service.ts:229`) runs with `usage: 'quoted'` on the transaction's client, never
  the pool, so the data room's withdrawal impact (`document-data-disposition/impact.ts:102`) counts the question.
- `AgencyResponses.tsx:398` carries the origin in `adding`. No route, table or mount is added.

---

## 5. Critique and resolution

Items 1–14 are the r1 design's own alternatives, each considered and rejected or deferred with the measured reason
where one exists; where revision 2 changed a resolution, the item says so. The critique of 2026-11-02 and how each of
its findings was folded in follow, under "Revision 2".

1. **Counting only "eligible" holders of a repeated number** (leaving out holders after the sign-off or inside a list).
   - Measured: 105 offered, against 103 with every holder counted. The extra two are `redteam/fixtures/enclosures-after-sign-off.txt`
     questions 1 and 2.
   - It leaves 83 oracle P3-duplicate findings. Each has one offered holder and the others not offered (70 after a
     sign-off, 13 inside a list).
   - Under "a not-offered row never shows Recorded" those findings name no harm. But the plan says "proposals that share
     a number are not offered", and counting every holder is simpler to state and to test.
   - **Resolved in r1: count every holder (the plan).**
   - **Revised in revision 2** (critique items 8, 20 and 22): "Recorded" is now matched by words, or by a number no
     proposal of any kind holds twice (§3.2). With that rule, a holder after the sign-off, inside an agency response,
     inside a list or under another numbering can never make a wrong "Recorded", which was the only harm the plan's
     wording guarded. So sub-slice 8 counts the letter's own numbering only, and tells holders apart by their headings
     (§3.8). Sub-slice 2 still lands the plan's rule as written, and the coordinator decides the extension (§8,
     question 1). The revision-2 oracle's P3-duplicate checks that harm directly (oracle change 6, §2).
2. **Removing page furniture from inside a question** (slice 3's segments). Rejected. Removal is where slice 3's 69
   unfixed breaks were, and a question of several segments is no longer one verbatim slice.
   **Flag-only** (move no cut at all) was measured: 95 offered against 103, with the same oracle result. **Resolved:
   strong furniture after the last line of words is outside the cut, exactly as a heading is; nothing inside is
   removed** (open question 2). Revision 2: weak furniture after that strong line is outside it too, and a running
   line found by repetition is weak (critique items 4 and 11). Measured again: 132 offered against 119 flag-only, both
   with no question offered with other words on the reader list.
3. **The plan's literal "a line that falls in no question makes the one before it not offered"**, applied to a section
   under its own heading (CRL "SAFETY UPDATE", "PRESCRIBING INFORMATION"). Rejected: the cut ended cleanly at the
   heading, and these sections are common in real letters. **Resolved: an `unnumbered-section` note names the section,
   and the question before stays offered.** Every other line in no question makes the question before it not offered,
   as the plan says (open question 3). Revision 2 narrows the note (critique item 2): only a section that no numbered
   line follows before the sign-off, or one under a heading that ended an agency response. A hold letter's "NON-HOLD
   COMMENTS" with numbered comments under it is no longer a section: its heading is shown above them.
4. **Rewriting words** to drop a control character, a soft hyphen or a page footer, or to normalise spaces. Rejected by
   THE CONTRACT. Structural reading uses the visible form; the words are always the raw slice. A recorded question
   with a character is refused, never cleaned, because the signature digest binds it (`response-logic.ts:62`).
5. **Widening `forbiddenCharacter` to DEL and C1, or reusing `XML_ILLEGAL_CHARS`**, to turn the oracle's P5 green.
   Rejected: the precision audit and the DOCX probe show the package stays well-formed with them. That would be a rule
   designed to satisfy an oracle false positive, and it stops 131 more otherwise-clean questions (`reuse-map.md` §I.4).
   **TAB** is allowed for the same reason (63 findings; its fixtures are green guards).
6. **Designing a rule for the oracle's no-break-space closings** (the 5 residual P3-coverage). Rejected: the splitter
   already reads them correctly. The oracle's patterns are the defect, and the evidence lists them as such.
7. **New files:**
   - a `question-splitter.ts`, `letter-pages.ts`, `data-room-source-reader.ts` or `pdf-page-joiner.ts` (slice 3's);
   - a `forbidden-character.ts`;
   - a separate proposals route or panel (`AgencyQuestionProposals.tsx`).

   Rejected by RULE 4 and RULE 6, and the gate refuses a new route file. Each piece goes into the existing file that
   owns the behaviour. The 450-line splitter stays one file, and the pure `proposeLetterQuestions` is an export of the
   existing service file.
8. **Changing `splitLetterQuestions`' return to `{ questions, notes }`.** Rejected: AnA's caller is an S4 file held by
   another session. **Resolved: a second export, `readLetterQuestions`, returns both; the old one returns the array.**
9. **A disabled Record button on a not-offered row, described by its reason** (one reading of the plan's "its button
   described by it"). Rejected: a disabled button is not focusable, so its description is unreachable by keyboard.
   **Resolved: no button; the reason is in the row in reading order, and a caution describes the Record button of an
   offered row.**
10. **Offering a repeated number with an empty reference field** ("record it under your own reference", words
    pre-filled). The words are clean, so the contract allows it, and it saves retyping. Deferred in r1. **Superseded in
    revision 2** by the computed suggested reference for holders their headings tell apart (critique item 8, §3.8): the
    form is prefilled with a reference the server checked for uniqueness, not left empty, and holders no heading tells
    apart stay `repeated-number`.
11. **Reading alpha, PMDA, "(1)" or "a." numberings as questions.** Rejected: new grammar, not a G3 defect (re-plan §2).
    Sub-slice 6's sentence names them as not found.
12. **Opening a question at a leading zero-width or BOM character** (35 of 35 variants propose nothing). Deferred: the
    oracle counts it honest (a NOTE). It is a usefulness item, not a violation.
13. **Letting the oracle confirm itself.** The splitter's grammar and the oracle's share origins: both take their
    closing and response patterns from slice 3. Revision 2's critique showed the r1 mitigations were not enough: every
    word loss of critique items 1 to 3 passed the adapted oracle, and the 70-row budget had been chosen by the same
    oracle (items 6 and 9). Mitigated now in five ways:
    - the red tests are direct assertions on hand-made fixtures, including the sub-slice 8 and 9 blind spots `d3`, `d6`,
      `f02`, `f06`, `e8c`, `c5`, `c9b` (§3.8, §3.9);
    - the oracle's recall gaps get their own tests (sub-slice 7);
    - the trunk-diff gate classifies every changed slice by an independent table, and a second check that compares with
      nothing flags an offered question followed by a lower-case numbered line (§2);
    - the reader list, written by hand from the letters, measures each family's questions offered with the reader's
      words, and sets a floor no sub-slice may break (§2);
    - the oracle's own closing, sign-off, section and duplicate checks were made independent of the splitter's claims
      where they leaned on them (oracle changes 5 to 9, §2).
14. **Moving the inbox insert onto the request's client in sub-slice 5.** Deferred: the check and the insert were never
    one transaction, so moving the check alone makes nothing less atomic. The insert's connection is a separate
    question (open question 7).


### Revision 2 (2026-11-02): the critique's findings, each applied or rejected

Twenty-seven findings stood after their skeptics. Each was applied, or applied with a change, or rejected in part, with
the code or run that shows why. "Measured" means the revision-2 prototype (`scratchpad/s10/r2/proto/`, switches
`R2_OFF=<name>`, §2) through the revision-2 oracle, and the reader list (§2). Paths below are under
`scratchpad/s10/r2/` unless they say otherwise.

**Verbatim lens (the contract).**
1. *The cut at the first closer after the last question drops agency requests* (critical). **Applied.** Closings and
   request-shaped lines are two classes (§3.8): "We request that you…", "Your response should/must…" and "Please contact
   <anyone but the agency's contact>" never cut. Only the closing's own sentence is exempt; any later line with words
   before the sign-off makes the last question `closing-inside`. Changed from the finding: "Please submit/provide your
   response(s)" is a closing with any continuation, not only "to/as…", so `c3` ("…within 30 days." then "In addition,
   submit…") is `closing-inside`, not offered with the closing in its words; both readings keep the contract, this one
   says why. The adapted oracle's tail check now stops at `IN_WORDS_CLOSING`, not `CLOSING` (oracle change 8, §2).
   Measured: `d6` offered with both request lines (r1: offered without them); `c1`, `c2` offered whole; `c3`, `d3`
   `closing-inside`; `R2_OFF=closers` turns `d6` back. The reader list then found one more closing the template uses,
   the clinical hold letter's "Please identify your response…" (`rf03` question 2 of the non-hold comments was offered
   with the letter's closing paragraph in its words); it is in the closing class, and that question is
   `closing-inside`.
2. *A strong heading ends the words "whatever the line before"* (critical). **Applied.** A trailing heading leaves the
   words only after a finished sentence that is not a list line (§3.8); otherwise `heading-unclear`. A heading that cut
   a question and has words under it, then another numbered question, makes the question before `unplaced-lines` and
   is not shown above the next one. Measured: `f02`, `f06`, `c4b` `heading-unclear`; `c5` question 1 `unplaced-lines`
   with no "Under IMPURITY RRT LIMIT" above question 2; `x01` now costs its question 1, as the finding said it would.
   Changed from the finding: its oracle rule "count section lines as shown only when the question before is not
   offered" would make every CRL "SAFETY UPDATE" section a dropped line while the question before stays offered,
   deciding open question 3 against §5 item 3 by construction. The revision-2 oracle instead counts a section's lines as
   shown only when no numbered line follows them before the sign-off, by its own opener and sign-off reading (oracle
   change 5). That still fails every `c5` shape. The section exception after an agency response (the question was cut
   at the response boundary, not at the heading) is the one place a section stands with questions after it; `c7`.
3. *No e-mail sign-off or quoted-message boundary* (major). **Applied.** "Thank you,"/"Thanks," as a sign-off between
   a finished sentence and a name; a quoted-message header block as the sign-off boundary (§3.8). The revision-2 oracle
   reads the same header block as the end of the letter's own words (oracle change 7), so its P6-signature check is no
   longer blind to it: trunk's P6-signature "quoted e-mail" rises from 6 to 9 under it (§2). Measured: `e8c` question 3
   `after-sign-off`; `c8` question 2 ends at "…for the assay.". Measurement found one more case, `c8` with its "Thank
   you," removed: the header ends the words, but the unpunctuated signature block before it stayed in question 2's
   words. Such a question is now `closing-inside` (§3.8), never trimmed.
4. *A running header found by repetition moves a cut* (major). **Applied** (the finding's first fix, not its
   alternative): repetition-only furniture is weak, flags its question and never moves a cut by itself (§3.9).
   Measured: `c9b` questions 2 and 3, `rf1-lot-reference-id.txt` questions 2 and 4, all `page-furniture` naming the
   lot line; `R2_OFF=runfoot` turns them back into offered questions without their lots. Cost: `ema-reference-at-foot.txt`
   question 2, whose last line is followed by the running "Assessment report" and then the strong EMA reference, is now
   `page-furniture`, where r1 offered it with the reader's words (`R2_OFF=runfoot` measures the cost: 133 against 132
   offered, no question with other words either way). `summarize.py` no longer leaves P3-heading out of its contract
   count: each is read (none is left after every sub-slice).
5. *A response block swallows everything up to the next opener* (major). **Applied**, with the skeptic's caveat
   handled: the block's lines end at a strong heading or a closing, so the section under the heading is said; but the
   response's own numbering stays open across that heading, so `n29`'s "1. Collect … 2. Include …" under "Clinical
   pharmacology" are `in-response`, never a headed list of questions (§3.8). A `responses` note says, once per source,
   that the agency's responses are not offered. Measured: `c7` section note with both requests; `n29` items
   `in-response (1)`, `responses` count 3; `t01`'s "1. Justify… 2. Provide…" `in-response (2)`.
6. *The evidence cannot see an offered question that lost words* (major). **Applied.** The trunk-diff gate
   (`trunk-diff.py`, §2) lists every offered question whose slice differs from trunk's and classifies each dropped or
   added line by a table written from the agency templates, not imported from the splitter; every row the table does
   not explain is read by hand and filed. Shown failing first: on the r1 design's saved run it lists `d6`'s two request
   lines, `f02`'s "EXAMPLE API SPA", `f06`'s "Container closure system" and `x01`'s "DRUG PRODUCT" as unexplained. On
   revision 2 every unexplained row is a running page header after a page mark, a CMC subheading, a CRL heading pair
   at a page top, or a CRL section after the last question, each read and correct. "Still offered with the same words"
   is the reader list's "offered with the reader's words" column (item 9). The gate compares with trunk, so it cannot
   see a cut trunk also gets wrong: it was blind to a revision-2 bug that offered `t08`'s and `w11`'s question 1 cut at
   an inline enumerator ("…deficiencies: 1. specificity / was not demonstrated …;" then "2. the accuracy…"), which
   trunk cut the same way. Reading the kept-red fixtures `t08`, `w11` and `h09` caught it, and the bug is fixed. A
   second check that compares with nothing now looks for exactly that shape (an offered question whose next numbered
   line starts with a lower-case word), and runs in every sub-slice's evidence beside the gate. §5 item 13's
   mitigation names both and the reader list.
7. *Lead-in rule: the opener-line case is not built, and a request is moved off its question* (minor). **Applied.**
   The one-line case is `ends-with-colon`; a lead-in that opens with a request stays the question's own words and the
   question is `ends-with-colon`; a lead-in that opens with context moves (§3.8). Measured: `c6`, `c6b`
   `ends-with-colon`; `fixtures/lead-in-between.docx` ("Regarding the dissolution method, address the following:")
   still moves, its three questions offered.

**Usefulness lens.**
8. *repeated-number refuses every question of letters that restart numbering per section* (critical). **Applied,
   recommended to the coordinator** (it departs from re-plan step 6's wording, §8 question 1): holders told apart by
   their heading paths are offered, verbatim, with a computed suggested reference (§3.8). Rejected in part: "or comes
   from a different source". A letter linked as two copies of one file holds every number twice with equal words, and
   offering both would record each question twice (`checks.mts`, "one letter linked as two copies"); holders in
   different files stay `repeated-number`, and the sentence names the other file. Measured: `ema-loq.docx` 5 of 5,
   `ema-aspect-per-page.pdf` 5 of 5, the synthetic hold letter `r2/letters/hold.txt` 4 of 4 (`rf03`: 3 of 5, §3.8), `fda-crl.pdf` 5 of 6 (its PRODUCT QUALITY 2 crosses a
   page break). `R2_OFF=qualify` (the plan's literal rule) refuses 17 of the 147 cuttable questions on the
   realistic letters for their shared number alone.
9. *The usefulness budget cannot detect over-refusal* (major). **Applied.** A reader list, written by hand from the 49
   realistic letters' text (`reader/reader-list.txt`: 177 questions, 147 of them one clean verbatim slice can hold),
   and a per-family measure against it (`reader/family.py`) join the 70-row budget in §2 and in every sub-slice's
   evidence. Two measures come from it (§2). The floor: no form family (IR, CRL, hold, advice, minutes and preliminary
   comments, EMA LoQ, CDRH AI) offers fewer questions with the reader's words than trunk offers usably (with the
   reader's words and a number no other proposal holds: an offered repeated number cannot be recorded twice on trunk),
   and none is offered with other words. That floor totals 70, the same 70 as the r1 budget, and both designs meet it;
   so the floor is a regression guard, not the over-refusal measure. The over-refusal measure is the "not offered"
   column, with every cuttable question that is not offered named in the evidence with its reason and read: the r1
   design left 44 of the 147 unoffered (EMA LoQ 18 of 22, minutes 12 of 12, hold 3 of 4), invisible to the r1 budget;
   revision 2 leaves 15, named in §2. Shown failing first: trunk offers 61 of the 147 with other words,
   and the r1 run's "other words" column is 0 only because it refuses so much.
10. *The order rules turn FDA's minutes template into one long inner list* (major). **Applied: (a), (c), (d); (b)
    rejected.** (a) a `heading-only` question is a heading between runs and no run member; (c) a response boundary
    closes a run, and `in-response` items are no run members; (d) the run's form includes its delimiter (§3.7).
    Measured: `rf08` and `rf10` 4 of 4 sponsor questions offered (r1: 0 of 10 rows); the outer/inner "2)" probe offers
    the outer "2.". (b), "keyword openers form their own sequence, checked only against keyword openers", is rejected:
    under it the plain inner list of `fixtures/outer-single-question.txt` ("Question 1: Provide the following…" then
    "1. … 2. … 3. …") is checked only against itself, complete and in order, and its items are offered as the letter's
    questions. Measured with `R2_KWSEQ=1`: that letter's items 2 and 3 ("Updated stability data for the 24-month time
    point.", "The process validation protocol.") are offered as questions, two offers on no reader-list line where
    revision 2 has none (`reader/extra.py` over `out/var-kwseq.json`). (a) and (c) already give the minutes their four
    questions without it.
11. *Weak furniture defeats the trailing cut on two-page letters* (major). **Applied** (§3.9): furniture after a
    strong trailing line is outside the cut, and "PIND" is an application number. Measured: the two-page IR question 2
    offered ending "…report."; `dmf-at-page-foot.pdf` question 2 offered ending "DMF 045678"; `regards-wrapped.pdf`
    question 3 and `rf08`/`rf10` question 2 offered.
12. *starts-mid-sentence refuses lower-case starts that are not wrapped lines* (major). **Applied** (§3.7): only with a
    wrap signal; pH, hERG, eCTD, cGMP, mRNA exempt; a lower-case list after a ":" lead-in exempt; "; and" ends a list
    item. Changed from the finding: not in a Word letter, where the lead-in may be an auto-numbered question G3 cannot
    see (below, "Found by the revision's own measurement"). Measured on the critic's probes
    (`probes/over-probe*.out.txt`): the lower-case list 3 of 3, the pH/cGMP letter 4 of 4, the hERG/eCTD letter 4 of 4;
    `t08`, `w11`, `w12`, `h09` and H4-wrapped stay refused.
13. *heading-only and heading-unclear refuse sentence-case request items and the question before a Title Case
    heading* (minor). **Applied** (§3.8): `heading-only` needs a heading's case or a deeper/keyword opener after it; a
    Title Case discipline heading directly before an opener, with no digit or tab in it, is strong; the `before` of
    `heading-unclear` reads the opener line. The skeptic's caveat (`unmarked-header.pdf` Q2, whose only guard was `heading-only`) is closed by item
    2's heading rule, measured: the question is `page-furniture`, its words running across the page break. Measured:
    the unpunctuated list 3 of 3; "CMC Comments"/"Clinical Comments" letters 5 of 5 and 4 of 4.

**Rules lens.**
14. *Sub-slice 6 says the existing disclosure keeps line breaks; it does not* (major). **Applied** (§3.6): the body is
    `<blockquote className="cc-q-text">`; the flex rule `.cc-q-proposal > .cc-q-hist{…}` is a precondition the
    stylesheet's holder lands first (open question 8 becomes a precondition); the `span[title]` bridge and its invalid
    nesting go; the button keeps `cc-btn sm` and its change is sent to D6-2 by file and line, or made with the
    coordinator's recorded consent; the client test asserts the class, and the running-app check opens a question
    with lettered sub-items.
15. *Sub-slice 3 reports a failed access check as "not readable with your access"* (major). **Applied** (§3.3): kept
    apart by status and code, as `authoring-assembly-sources.ts:158-159` does; one red case per class and a mutation.
16. *Two mutations are said to go red on a test that cannot catch them* (major). **Applied.** Sub-slice 2 carries its
    own pure timing test (§3.2, mutation 5); sub-slice 9 carries a 2,000-page timing letter (§3.9, mutation 6). Shown:
    the skeptic's quadratic running-header count was entered 0 times on `big-crafted.txt` and 7 times on a two-page
    letter (`scratchpad/s10/verify-refute-timing/`).
17. *The package refusal tells people to correct things nothing in trunk can correct* (minor). **Applied** (§3.1):
    one sentence per field, each naming a remedy trunk has or saying there is none yet; withdrawing the question is
    named for a commitment; the rows with no remedy are in §6. The `eventId` part of the finding overstated (it is
    server-generated and cannot hold a forbidden character); the check stays as a last line.
18. *Who names a question's page is undefined* (minor). **Applied** (§3.0): the splitter returns `at`; the service
    calls `pageForOffset` for PDF, counts form feeds for plain text, names none for Word; one assertion pins it. The
    prototype's own `PageSpan` and containment lookup are a measuring instrument; the containment test is the
    intended "between pages" check (`reuse-map.md` §E), not a second `pageForOffset`.
19. *The "above" lines are shown as verbatim but are the reading form* (minor). **Applied** (§3.0, §3.8): each line
    shown above carries `start`/`end`, and renders `letter.slice(start, end)`; the verbatim property test covers them.
    Measured: 925 lines above questions over 1,232 stored texts, all equal to their slice (`checks.mts`).

**Honest-copy lens.**
20. *A not-offered question recorded by hand still tells the person to record it* (major). **Applied** (§3.2):
    "Recorded" by words, or by a number no other proposal holds; such a row says "Recorded as {ref}" and its reason in
    the past tense; red test and mutation. Measured: a page-furniture "2" recorded by hand is matched; a bare "1"
    matches no holder of a repeated "1" (`checks.mts`).
21. *A failed or changed access check is shown as "not readable with your access"* (major). **Applied** with item 15:
    the 409 sentence says the file's place in the data room is not verified and names no owner; the 503 sentence says
    access could not be checked just now, with Check again; a program-level error is said once.
22. *The repeated-number reason suggests references the POST refuses* (major). **Applied.** The example is never
    guessed: holders a heading tells apart get a computed reference, unique among the letter's suggestions, numbers
    and recorded references and within 40 characters (item 8); a row that still says `repeated-number` has no such
    heading, and says "a reference naming its section". Holders are named by count and place, and by file title; "Record
    this one", never "Record each". The enclosure case no longer arises: holders after the sign-off are outside the
    count, so `enclosures-after-sign-off.txt` questions 1 and 2 are offered.
23. *The sentences around the list call every numbered line a question* (major). **Applied** (§3.6): "numbered lines",
    `k` counts offered unrecorded rows, a none-can sentence at k = 0, one noun and a formatted number in the limit
    sentence, and a forms sentence in words that names only what `OPENER` reads (re-run: "1.2 Provide" does not open,
    "1.2. Provide" and "Q4. Provide" do; "Comment 1:" and "OBSERVATION 1" do not), each example asserted against
    `OPENER`.
24. *The character reason's quote does not show where the character is* (major). **Applied** (§3.0, §3.1): a window
    around the character named in words, "…" wherever a quote is cut, and the POST, PUT and package refusals name the
    words before the character. Measured on the three sub-slice-1 fixtures (`checks.mts`): FF 'between "selected
    apparatus, media and" and "rotation speed."'; ETX 'between "Revise the drug product speci" and "cation to include a
    test for"'; VT 'between "study, provide the following:" and "the lot number, the date of"'.
25. *The full words lose their line breaks* (minor). **Applied** with item 14. The 120-character summary uses the
    existing `clip`, which ends in "…".
26. *Check again shows nothing while it runs, and the error note is left as it was* (minor). **Applied** (§3.4): a
    status line while the read runs, the list `aria-busy`, Record and Check again disabled, a settled status that says
    what was found, and a rewritten error note with Check again.
27. *Source-state sentences give wrong, missing or ungrammatical next steps* (minor). **Applied** (§3.4, §3.5): one
    remedy per `sourceReadView` label, "not confirmed" for the unconfirmed state, a null-count form of `partial`, an
    `ocr_failed` clause, and a next step for `not-found` and `malformed`. As the skeptic found, "Text availability
    unconfirmed" and "read null of null pages" cannot happen with today's writers; their sentences are hardening.

**Found by the revision's own measurement** (not in the critique; each fixed and measured):
- `rf03`'s wrapped no-question lead-in ("…we recommend that you address / them in your complete response:") made the
  hold letter's third deficiency `unplaced-lines` once item 2's section rule landed: a lead-in in no question may now
  wrap over up to four lines (§3.8).
- A form feed at a line's start put that line on the page before in the prototype's page model; and a one-page stored
  text had no page edges, so an EMA "Official address…" footer stayed in a question's words once item 8 stopped
  refusing that question for its number (§3.9).
- Reading the kept-red fixtures `t08` and `w11` found the revision's own inline-enumerator bug (item 6), which neither
  the oracle nor the gate could see; the trunk-independent wrapped-number check was added for that shape.
- The S10 fixture run (`out/fx-r2.json`) found two more of the revision's own regressions, both fixed before these
  numbers were taken: item 13's Title Case heading read a tab-separated table row ("B5678 / Site 2 / Clinical") as a
  heading, turning the green guard `P5-control-tab/tab-separated-lot-table.txt` red (a Title Case heading now has no
  digit and no tab); and item 12's lower-case exemption offered the typed inner items of Word auto-numbered questions
  (`P6-merged-word-numbered/*`), whose numbers the stored text does not hold (in a Word letter every lower-case start
  is refused, as in r1).

### Completeness critic (2026-11-02): what was missing, and where it now is

Read against the re-plan's S10 steps, the harvest H1–H14, `fixtures.md` and the oracle's clauses; every claim below was
run (`scratchpad/s10/critic-completeness/`, §7) or read in the code at `609ef94c7`.
- **Callers** (§1): the panel, AnA and AgencyInbox are named with their anchors; MCP was searched and reaches nothing.
  AgencyInbox's `letterSourceIds` callers, including the AnA pin, are now in sub-slice 5. AnA's `ir_text` is not the
  stored letter (§4, §6, §8 question 12).
- **Oracle clauses with no red test:** P1-exact, P1-segments and P6-order are unreachable on trunk; the verbatim
  property now holds them (order and no overlap), with `repeated-line-across-questions.txt` as its fixture (§3.7).
- **Fixtures placed in no sub-slice:** `typed-list-then-autonum.docx` (§3.6), `cr-only-and-nel-lines.txt` (§3.1),
  `repeated-line-across-questions.txt` (§3.7); `numbers-out-of-order.txt` and the oracle-miss letters now carry their
  measured expectations (§3.7).
- **Harvest items neither placed nor dropped:** H5's "raise the ref limit to 200" is dropped, measured (one question,
  §3.8); H6's "the next number after the sign-off refuses the split" is narrowed, measured (§3.8); H9's "one
  project-scope rule" is placed (§3.5).
- **Mutations no named test could catch:** sub-slice 2's mutation 2 (the route's filter, now a source assertion and a
  dbtest), sub-slice 6's mutation 2 (the cap, now a pure test), sub-slice 3's mutation 4 (no authoring test reaches the
  closing program check, now a case of its own).
- **Rules with no red test or no mutation:** sub-slice 1's write refines, editor path and pass-through (§3.1);
  sub-slice 4's `ocr`, Check again and `method` (§3.4); sub-slice 7's Word branch (§3.7); sub-slice 8's suggestion
  limits, prefill, Title Case guard and speed (§3.8); sub-slice 9's plain-text page model and page naming (§3.9).
- **A rule with no data:** the Word caution and the Word branch of `starts-mid-sentence` read a method nothing passed
  before sub-slice 9; sub-slice 4 now passes it and a `word` flag (§3.0, §3.4).
- **A defect the oracle could not see:** the told-apart pass was quadratic (87 s at 12,000 holders, §3.0) and its
  suggestions carried TABs, C1 and invisible characters into the Record form (46, §3.8); both fixed in the rule,
  measured with every other result unchanged.
- **Evidence that would have measured the prototype:** the adapted oracle loads `PROTO`; each sub-slice's evidence now
  points it at the repository's code through an adapter, with a two-part proof (§3.9).
- **Claims re-run and holding:** the per-step table and §0 (saved summaries), the reader list (132 / 0 / 15, no offer on
  no reader-list line), the trunk-diff gate (18 unexplained, 2 wrapped-number flags), the self-check (1,232, 0
  differ), the pins, `checks.mts` (925 lines above, all verbatim), the k = 0 count (3 letters), the ledger check
  ("ALL INSIDE"; the files added here are tests, always allowed). One wording was wrong and is corrected: "the hold
  letter (4 of 4)" is the synthetic `r2/letters/hold.txt`, not `rf03` (§3.8).

---

## 6. Known gaps after these sub-slices

- AnA's `draft_fda_ir_response` shows no reasons until step 18 (§4).
- **AnA's questions are slices of the text the model passed, not of the stored letter** (§1, §4; completeness
  critic). THE CONTRACT holds on the panel's path only. No MCP tool reaches the splitter (§1), so there is no third path.
- **The S10 fixture `P3-coverage-word-numbered/typed-list-then-autonum.docx` stays red on the oracle** (Word
  auto-numbering is not in the stored text): its test asserts the honest outcome and the Word caution (§3.6).
- **The proposal step's speed rests on its tests** (§3.0): the revision-2 prototype's told-apart pass was quadratic
  (87 s at 12,000 holders) and no oracle input was large enough in that shape to show it; sub-slice 8's timing test is
  the only check.
- Word auto-numbering is not in the stored text (2 oracle findings). The Word caution says so.
- Meeting minutes enclosed after a cover letter's sign-off are not offered. The sign-off note says how to record them.
  Whether the agency's numbered comments inside a response should ever be offered is a product question (open question 4).
- `shared/agency/letter-commitments.ts` has no character, furniture or sign-off rule of its own. No re-plan step names
  one. Sub-slice 1's write refines refuse a forbidden character when a commitment is recorded.
- The other `cre_source` parsers and builders outside the letter path (`code-map.md` §6, step 10).
- GET `.../commitment-proposals` has no client caller. Sub-slices 3, 4 and 9 change what it returns, shown only by its
  PGlite suite.
- **Package-blocking rows with no remedy on trunk** (critique 17): a commitment description or basis, a letter type or a
  signer name recorded before sub-slice 1 with a forbidden character blocks the response package, and the refusal says
  it cannot be corrected here yet. The commitment's correction is re-plan step 36 (P-88); a letter type has no edit
  route; a signature record is fixed by design.
- **A letter linked as two copies of one file** offers none of its questions: every number is held twice with equal
  words, and each row names the other copy (§3.2). Telling copies apart by their checksum is not designed here.
- **A last question that runs into a closing paragraph the closing list does not know** keeps that paragraph in its
  words and is offered. The reader list found one such template phrase ("Please identify your response…", the clinical
  hold letter) and it is now a closing; others may exist. The trunk-diff gate and the reader list are the checks that
  can see this class; the oracle's `IN_WORDS_CLOSING` cannot.
- **An unclear trailing heading is not a heading between runs** for the order rules, so the run after it can be
  refused as an inner list (`ema-restart-after-list.docx` questions 3 and 4, `fda-restart-after-lots.docx` question 2;
  `ema-loq.pdf` question 5). That is conservative: the heading may be a table cell of the question before.
- **Preliminary comments or minutes enclosed after a cover letter's sign-off** (`rf06`) are not offered: 4 of the 12
  minutes questions on the reader list. The sign-off note says how to record them.
- **The 15 cuttable questions revision 2 does not offer** on the realistic letters are listed by name in §2, each with
  its reason.

---

## 7. Scratch artefacts (not for the repository)

- **The prototype:** `scratchpad/s10/proto/letter-questions.proto.ts`, `proposals.proto.ts`, and the reference copy of
  slice 3's grammar `slice3-question-labels.ref.ts`.
- **The adapted oracle and its runner:** `scratchpad/s10/proto/oracle-g3-adapted.mts`, `run-proto.mts`, `summarize.py`.
  The fixture root `rt-s10/` links `s10/fixtures` and `s10/attempts`.
- **The checks:**
  - `scratchpad/s10/proto/selfcheck.mts` (with every step off it equals trunk);
  - `pins.mts` (trunk's pinned letters);
  - `time-one.mts` (timing).
- **Results:** `scratchpad/s10/proto/out/`:
  - `all-<steps>.json` and `.summary.txt` per configuration;
  - `fx-none.json` and `fx-5-6-11-15-16-17.json` (the S10 fixtures);
  - `all-dup0.json` (eligible holders);
  - `all-notrail.json` (flag-only furniture);
  - `tables.md`.
- **The ledger check:** `scratchpad/s10/check/check-s10.mjs`, output `check-s10.out.txt`.
- **Revision 2** (`scratchpad/s10/r2/`):
  - `proto/letter-questions.proto.ts`, `proto/proposals.proto.ts` (switches `R2_OFF`, `R2_KWSEQ`, `DUP_ALL`,
    `DUP_INNER`, `NO_TRAILING_CUT`), `proto/oracle-g3-adapted.mts` (oracle changes 5–9; `ORACLE_R1=1` turns them off),
    `proto/summarize.py`, `proto/selfcheck.mts`, `proto/pins.mts`;
  - `run-matrix.sh` and its outputs in `out/` (`r2-all`, `s-*` cumulative, `off-*` one change off each, `var-*` the
    rejected variants, `trunk-oracleR1`, `r2-trunk`, `r1design-under-r2oracle`, `fx-*`);
  - `trunk-diff.py` (the trunk-diff gate and the trunk-independent wrapped-number check);
  - `reader/reader-list.txt` (the hand-made reader list) and `reader/family.py` (the per-family measure);
  - `checks.mts` (verbatim words and lines above, the character's place, recording behaviour), `letters/` (probe
    letters), `probes/` (the critics' probes re-pointed at revision 2, with their outputs).
- **The completeness critic** (`scratchpad/s10/critic-completeness/`, 2026-11-02; read-only on the repository):
  - `proto-ref200/` and `ref200.json` (the told-apart reference limit at 200 instead of 40), `proto-visref/` and
    `visref.json` (suggestions from the headings' reading form), `diff-offered.py` (every proposal compared with
    `r2/out/r2-all.json`);
  - `time-qualify.mts` / `.out.txt` and `time-qualify-split.mts` / `.out.txt` (the told-apart pass's cost),
    `time-one-r2.out.txt` (the splitter's);
  - `one.mts` (one stored text through the prototype's proposal step, `STEPS=` to choose them) and
    `attempts-at-step15.out.txt`;
  - `repeated-by-family.py` (repeated-number refusals by input family, on `r2/out/r2-all.json`).

---

## 8. Open questions for the coordinator

1. Repeated numbers (revision 2, critique 8): from sub-slice 8, count only the letter's own numbering (not holders
   after the sign-off, inside an agency response, inside a list or under another numbering), and offer the holders
   their headings tell apart with a computed suggested reference (recommended: 132 offered on the realistic
   letters, every family at or above trunk's floor)? Or keep re-plan step 6's literal rule, every holder not offered
   (115 offered with `R2_OFF=qualify`; 125 with every holder counted, `DUP_ALL=1`)? The
   recommended rule follows the step's own advice ("record each under a distinct reference, such as its section name")
   and departs from its first sentence, so it is the coordinator's call.
2. Furniture: may strong furniture after a question's last line of words fall outside the cut, with weak furniture
   after it (recommended: 132 offered), or must every furniture line flag its question (119
   offered, `NO_TRAILING_CUT=1`)? Both keep every offered question's words the reader's.
3. An unnumbered section under its own heading: a letter note with the question before still offered, when no
   numbered line follows the section before the sign-off or the heading ended an agency response (recommended), or the
   plan's literal rule, which not-offers the question before every time?
4. Product: should the agency's numbered comments inside an FDA response ever be offered as questions? Revision 2
   marks them `in-response`, says so in a `responses` note, and does not offer them. The precision audit marks 14 such
   findings debatable.
5. Steps 5 and 6: `Plan: S10` (recommended; every file is S10's) or `Plan: F1` (the re-plan's label)? Either way the
   coordinator must first record a holder for S10 (re-plan §6).
6. The character rule: C0 except TAB, LF and CR, plus U+FFFE, U+FFFF and lone surrogates (recommended), applied to every
   field that reaches the package?
7. Sub-slice 5: may the inbox POST's insert at `communication-center.ts:866` stay on the pool while the check moves to
   the request's client?
8. The CSS, now a **precondition** of sub-slice 6 (critique 14): will the stylesheet's holder (D0, then the L7/D6-2
   holder of `commcenter-v2.css`) add `.cc-q-proposal > .cc-q-hist{flex:1;min-width:0;overflow-wrap:anywhere}` in its
   own commit before sub-slice 6? Sub-slice 6 does not land without it, and no longer bridges through `span[title]`.
9. The name of the access wrapper exported from `authoring-assembly-sources.ts` (sub-slice 3, F1).
10. The Record button's class (critique 14): does the coordinator record consent in `COORDINATION.md` for S10 to change
    `LetterQuestionProposals.tsx:75` from `cc-btn sm` to `btn ghost small` (re-plan step 11's wording), or does D6-2 take
    that line with its `.cc-btn*` deletion (`BUILD_ORDER.md:294`, "behaviour only, on D6's layout")? The design keeps
    `cc-btn sm` until one of the two is recorded.
11. The reader list (`scratchpad/s10/r2/reader/reader-list.txt`, 177 questions) is one reader's judgement, written by
    this session. Should a second person read it before it becomes the per-family floor in the evidence? Its `cut`
    column (which questions a verbatim slice can hold) decides what the floor counts.
12. AnA (completeness critic, §4): `draft_fda_ir_response` splits the text the model passes, so its "verbatim"
    questions are verbatim to that text only. Should step 18 only say so in the tool's result and scaffold (an S4
    file, held by `011Fyq…`), or also let the tool read the letter's stored text by its pinned source through the
    admitted read (an added input on an existing tool, the same file)? This design does neither.

## 9. Coordinator answers, 2026-11-02 02:41 (binding; they override §8 and anything above)

1. **Repeated numbers are told apart by headings.** Approved. The letter's own numbering is counted, and holders their
   headings tell apart are offered with a suggested reference.
2. **Furniture after a question's last line falls outside the cut.** Approved. One verbatim slice; nothing is trimmed
   from inside.
3. **An unnumbered section under its own heading becomes a letter note.** Approved. The question before it stays
   offered.
4. **The agency's numbered comments inside an FDA response in meeting minutes are not offered**, and the note says so.
   Build it that way. The coordinator puts it to the founder for confirmation.
5. **Steps 5 and 6 carry `Plan: S10`**, if `ci:one-design-plan` admits every file under S10. A file it refuses goes
   in an F1 commit.
6. **The character rule is approved as written**, for every field that reaches the response package.
7. **Not accepted as stated.** The coordinator's point: under RLS a write on the pool is outside the request's tenant
   scope, so the foreign-source check and the insert at `communication-center.ts:866` should both run on the
   request's client, in one transaction. Investigate before step 10. If the insert cannot move (a pool-only trigger, a
   cross-tenant table), write the reason here and send it to the coordinator first. Otherwise move both.
8. **The coordinator adds** `.cc-q-proposal > .cc-q-hist{flex:1;min-width:0;overflow-wrap:anywhere}` to
   `commcenter-v2.css` in its own commit and sends the sha. Step 11 rebases on it.
9. **The exported access wrapper is named `readAdmittedSource`.** Approved.
10. **D6-2 takes the Record button's class** with its `.cc-btn*` deletion. S10 keeps `cc-btn sm`.
11. **The coordinator's session takes the blind second reading** of the 177 questions, with two independent readers
    and an adjudicator. Each disagreement is listed. Send the question text, its source letter and the offsets only,
    without this session's judgements. The readings come back as evidence.
12. **`draft_fda_ir_response` reads the letter's stored text** by its pinned source, through the admitted read
    (`readAdmittedSource`). This is an added input on the existing tool, in `AnaToolExecutor.ts`, whose
    `draft_fda_ir_response` handler 011Fyq has released to RIM. The tool's result says which text it split. Step 18
    grows accordingly.

**Item 7, resolved (orchestrator, 2026-11-02).** `server/db/runtime.ts`'s shared pool applies verified async tenant
scope to its queries when RLS enforcement is on, and fails closed when scope is missing (`server/db.ts:8-16`). So the
insert at `communication-center.ts:866` is not unscoped today. But the foreign-source check and the insert are two
statements on two connections, so a source can be changed or withdrawn between them. Step 10 therefore moves both onto
`requestPgClient(req)`, in one transaction. It checks first for a pool-only trigger or a cross-tenant table on
`concept2cure_agency_communications`. If it finds one, it stops and tells the coordinator before building.

**Item 4 confirmed by the founder as P-98 (2026-11-02, recorded in 95855de20).** The numbered comments inside an FDA
response in meeting minutes are not offered, and the letter shows a note saying so. Cite P-98 in the commit that builds
it (sub-slice 8).

## 10. The blind second reading, filed (coordinator, 2026-11-02; binding inputs for the build)

The reading is filed as `3bc851c5b`, on origin through `750a43978`, in `docs/evidence/S10/2026-11-02-blind-reading/`. That
folder holds README.md, readings.json, missing.json, disagreements.json and raw/. Two independent readers answered for
each letter group, and an adjudicator settled the 10 disagreements. The inputs' sha256 values were verified.

- **Totals.** 177 questions:
  - (A): 165 yes, 0 no, 12 unsure;
  - (B): 148 yes, 29 no;
  - 11 missing.
- **The floor.** This reading replaces this session's single reading as the per-family floor in the evidence (§8 item
  11). Every sub-slice's usefulness and fidelity numbers are re-measured against `readings.json`, not against
  `scratchpad/s10/r2/reader/reader-list.txt`.

What the build must do with it, each case red first, with `Plan: S10` and `Completes: shared/agency/letter-questions.ts`
unless the sub-slice names another existing S10 path:

1. **17 spans hold page furniture or a control character inside the question:** n2, n5, n21, n44, n56, n62, n66, n71,
   n73, n85, n105, n106, n109, n122, n142, n148 and n171. The line numbers are in readings.json. What is inside them:
   - letterhead footers;
   - Reference ID lines;
   - page markers;
   - running headers such as "K201234", "NDA 212345", "IND 123456", and n109's unmarked "CONFIDENTIAL";
   - form feeds.

   Each becomes a fixture. After sub-slices 1 and 9, each such question is either not offered with its line named, or
   (when the furniture falls after the last line of words) cut cleanly. Never offered with the furniture inside.
   n109's "CONFIDENTIAL" must be read as a running header: add it to the furniture model's anchored running headers.
2. **Meeting minutes and comments: L45, L47, L49.**
   - The readers found 12 spans that are the sponsor's own reprinted questions: n157 to n160, n166 to n169 and n174 to
     n177. The agency's words are in the responses that follow.
   - By P-98 the agency's numbered comments inside a response are not offered.
   - The coordinator's reading: offer neither. Minutes record advice, not questions the sponsor answers.
   - The build checks what sub-slice 8 does on these three letters and states it. If it offers the sponsor's reprinted
     questions, change it to offer none, with one note in words saying the letter is meeting minutes or comments, that
     FDA's responses are advice, and that commitments in them are recorded as commitments (P-81). That is a red-first
     case per letter.
3. **Two CRL requests are missing:** L43 line 59 and L44 line 59, "When you respond to the above deficiencies, include
   a safety update…", at [2765, 3049].
   - The approved rule (§9 item 3) makes an unnumbered section a letter note. The reading shows a reader would record
     this request.
   - So the note for an unnumbered request section must name the request in words. It says it was not offered because
     it is unnumbered, and that it is recorded by hand.
   - A test asserts the note carries the request's first words and its line.
4. **n76 (L22) is cut off at "for the".** Line 16, "Drug Product", is a heading inside the words. The adjudicator
   answered (B) yes, but the person should see the cut. Sub-slice 8's heading rule must flag it: the question is not
   offered with the heading named, or offered with a visible note. It is never silently cut. Red first.

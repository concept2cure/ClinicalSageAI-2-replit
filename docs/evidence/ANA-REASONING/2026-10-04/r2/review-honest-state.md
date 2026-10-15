Reviewer report, honest-state lens (HS-1–HS-11), on round 1 (a3775bcef) before it was pushed. Verbatim, local paths redacted.

HS-2 is the most serious problem: the check mark is often earned by fabricated figures. I found three high-severity ways the strip reassures falsely (HS-1 to HS-3), plus several false alarms on common, correct answers. All probes are under `<scratchpad>/refute-check/honest-state/`. I made no repository changes.

**HS-2 (high): the check mark is earned by numbers that merely occur somewhere, or by figures the check never reads.**
- Input A: one `search_pubmed` result holding 5 real abstracts (14 KB, 144 distinct numbers). `probe-bag` output: fabricated "The ORR was N%" found 57/99; "Median OS was N months" 28/40; HR 7/50.
- Input A, rendered (R2): "…450 patients across 24 sites; the ORR was 12%" against a record with "March 12, 2019" and "24 months" shows ✓ "All 4 specific claims found in this turn's sources". "24 sites" and "12%" were invented.
- Input B (`probe-recall`): "…the hazard ratio for death was 0.35", "61 percent", "HR, 0.35" are not read as figures. The strip shows ✓ "All 2 specific claims found".
- Cause: `answer-grounding.ts:507` counts a figure as found if its number appears anywhere in a source. Extraction gaps are in `:199-216`. The check mark is awarded at `AnaGrounding.tsx:145-151`.
- Fix: credit a figure only when its number appears next to its measure or unit in the same sentence or record. Never award a check mark for a figure match alone.

**HS-1 (high): instruction overlays count as "project context" and earn the check mark.**
- Input: no project, no tool. Q: "How long is the IND wait period and the 510(k) review clock?" A: "An IND goes into effect 30 days after FDA receives it. A traditional 510(k) has a 90-day FDA review clock."
- Expected: "No source consulted this turn — 2 specific claims not checked".
- Actual (R3): ✓ "All 2 specific claims found in this turn's sources · Checked against: your message, project context". The "context" is the claim-grounding instruction text ("…a 90-day review, a 30-day IND wait").
- The conversation surface (T2) shows "Context used: claim-grounding, scope-guard" under that check mark.
- Same with "21 CFR 314.110": the agency-tactics overlay text ("Basis: 21 CFR 314.110 / 601.3") counts it as found. Without the overlay it is not checked (`probe-crl`).
- Overlays fire on 9 of 20 project-less questions (`probe-enrich-rate`). That switches the basis to "sources", so recalled claims read "not found" instead of "not checked".
- This contradicts the README line "Not sources: … her instructions".
- Cause: `stream.ts:972` puts `enrichment.block` into the context source (`:975`). `AnaGrounding.tsx:83` labels it "project context".
- Fix: build the context source only from data blocks and exclude instruction overlays.

**HS-3 (high): the person's own question earns the check mark.**
- Input: "Was the ORR in KEYNOTE-024 45% or 60%?"; the search returns zero hits; AnA answers "45%".
- Actual (R1): ✓ "The one specific claim was found in this turn's sources · Checked against: your message, search pubmed".
- Cause: `stream.ts:961` makes the message a source that counts as found (`answer-grounding.ts:509`).
- Fix: show claims found only in the person's message as "from your message, not checked", never with a check mark.

**HS-4 (medium-high): figures from an attached PDF AnA read are reported "not found".**
- Actual (R4): ⚠ "3 of 3 specific claims not found in this turn's sources … Not readable by this check: protocol-v3.pdf". The PDF is one of this turn's sources; the honest state is "not checked".
- Every answer that summarises an attached PDF will warn. The test at `tests/services/answer-check.test.ts:227-232` locks this behaviour in.
- Cause: `answer-grounding.ts:472` and `:488-493`.
- Fix: when an unreadable source exists, report claims not found elsewhere as not checked, naming that source.

**HS-5 (medium): figures that are in the tool's records are reported "not found".**
- Input: AnA searches "…hazard ratio 0.49"; the returned abstract says "hazard ratio for death, 0.49"; the answer says "HR 0.49". `notFound` contains "HR 0.49" (`probe-verify-search`).
- R6: the sample-size result contains 0.7 and 0.8, yet the strip lists “hazard ratio of 0.7” and “80%” as not found. So looking a figure up to verify it is penalised.
- Cause: `answer-grounding.ts:504-509` excludes every number the model passed in from the whole result. Identifiers use the returned-records rule; figures do not.
- Fix: apply the returned-records rule to figures, and label a figure that only echoes the model's input as "AnA's input, not a result".

**HS-6 (medium): declined, conditional and workflow sentences are named as verdicts.**
- 11 of 14 sentences in `probe-verdicts`, for example:
  - "fails to meet all requirements" is named "meet all requirements";
  - "It is unlikely that FDA will accept" is named "FDA will accept";
  - "Before it is ready to file" is named "is ready to file";
  - "The SOP will be approved by two signers" is named "will be approved".
- R5 shows ⚠ "States 3 verdicts — verdicts come from engines; check which one gave them". This contradicts the README ("A declined verdict … is not named"), and the copy assumes an engine gave the verdict.
- Cause: `governance.ts:138`, `:146`, `:150`, `:85`.
- Fix: guard against negation and conditionals, and reword to "no engine on this turn gave this".

**HS-7 (medium): the strip warns on almost every correct answer.**
- With a project open, 11 of 12 correct answers show a warning (`probe-noise`). Three of those are pure extraction errors.
- Lower-case "or N" is read as an odds ratio: "Phase 2 or 3" gives ⚠ “or 3” — figure (R7); "21 CFR 312 or 21 CFR 314" gives "or 21".
- Cause: the `'gi'` flag at `answer-grounding.ts:203`.
- Fix: match HR/OR/RR only as upper-case tokens.

**HS-8 (medium, UNVERIFIED, from reading the code only):** `ConversationThread.tsx` draws the strip (`:337`) after the DocumentCanvas (`:306`). On a drafting turn a check mark would sit directly under a draft whose figures are never checked. The rail draws it under the answer (`Shell.tsx:1067`, before `:1094`). Fix: render the strip directly under the answer text.

**Low:**
- **HS-9:** "Checked against: your message, project context" appears even with zero claims and no project (R8). Cause: `AnaGrounding.tsx:166`.
- **HS-10:** no client reads `trust_summary` (only `post-processing.ts:587` writes it). `/validate-draft` (`section-validation.ts:33`) now calls a user's own draft "AnA's labels".
- **HS-11:** messages stored before this change render nothing (R9 rendered ""), which looks the same as a strip that failed to arrive.

**Claims that held:**
- AnA's labels never earn a check mark.
- `attempted` is carried through, so a failed label check is not shown as "not assessed".
- The live strip and a reopened conversation use one reader on the same stored object; the chat store returns `metadata` (`threads.ts:261`).
- The conversation surface hides the strip while streaming (T1: 0 strips) and renders it once after (T2: 1).
- "Grounded in ✓" is gone.
- Every row carries both a glyph and words.
- ICH citations returned by the lookup tool are found (`probe-ich`).
- A turn that truly consulted nothing says "not checked" (P5).
- A turn with zero claims gets no check mark.
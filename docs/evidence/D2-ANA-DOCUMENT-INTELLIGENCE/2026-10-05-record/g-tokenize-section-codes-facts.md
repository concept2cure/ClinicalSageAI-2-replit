# g-tokenize-section-codes — facts relied on

**Regulatory facts: none encoded.** This step changes how the tool selector
tokenizes a turn and scores tools. It adds no requirement, rule or regulator
statement, and it adds no jurisdiction vocabulary to any tool description. That
vocabulary lands with its content in g-module1-by-jurisdiction.

The routing prompts name an EU MAA and a PMDA submission. They treat Module 2
sections (2.6.x, 2.7.3) as the same sections across regions. That premise is
**recall, not regulator text**: Modules 2–5 follow the ICH M4 common technical
document, and Module 1 is regional. No regulator page was checked for this step,
and the code does not depend on it.

The fix round adds two more premises, both **recall, not regulator text**, and
no regulator page was checked for them:
- CTD Module 3 numbers its sections with single-letter segments: 3.2.S for the
  drug substance, 3.2.P for the drug product, and also 3.2.A and 3.2.R. That is
  why the tokenizer takes `3.2.S.4.1` and `3.2.P.8` whole.
- 21 CFR 3.2(e) is the FDA definition of a combination product. The tool
  descriptions cite it. A truncated `3.2` token matched it.

The code encodes neither premise as a requirement. It only refuses to read
`3.2` out of a longer code.

## Code facts (checked in this checkout, 2026-10-05)

| Fact | Where |
|---|---|
| At HEAD `tokenize` kept only `[a-z0-9]{3,}` runs and was not exported, so `"see 2.7.3 and II.6.1"` yielded only `see` | `server/services/ana/tool-selection.ts` (HEAD `df30b4bb`) |
| At HEAD `scoreTool` matched every term by substring: +3 for a name match, +1 for a match anywhere in the text | same |
| `'us'` is in `STOPWORDS`. Region acronyms are not emitted, because two-letter substrings match "queue", "status" and "focus" | same, `STOPWORDS` |
| `get_document_section_requirements` has been in `ALWAYS_ON_TOOLS` since g-always-on-record-tools (`df30b4bb`). So the finding's two routing reds (the EU MAA 2.7.3 prompt and the PMDA 2.5 prompt) already **pass** at HEAD and cannot be the red here. They are kept as guards. The red routing cases are three non-always-on tools whose descriptions carry the code: `draft_clinical_summary_m2_7` (2.7.3), `draft_nonclinical_summaries_m2_6` (2.6.2/2.6.4) and `get_csr_template` (5.3.5.3) | `g-tokenize-section-codes-red.txt` |
| Selector callers: `chat/send-message.ts`, `ana-ri/stream.ts`, `ana-realtime.ts`, `deep-investigation.ts`, and `routes/ana-tool-policy.ts` (dynamic import of `tool-selection.js`). Their tests re-run: chat-path-parity, ana-realtime ×3, turn-record-loop, agent-activity, deep-investigation, `server/__tests__/routes/ana-tool-policy.test.ts` and `server/services/ana-ri/__tests__/command-rbac.test.ts` (from fix round 2; round 1 and earlier ran the first 7 only) | `g-tokenize-section-codes-green.importers.txt` |

## Measured

- **Pre-change simulation** over 789 `ALL_ANA_TOOLS`, cap 50. For "write the 2.7.3 for our EU MAA", `draft_clinical_summary_m2_7` ranked:
  - 34th of 35 free slots with code tokens at +1, which is marginal, and outside the cap in the production composition;
  - 4th with code tokens at +2, the chosen weight;
  - 2nd of 29 slots in the production composition.
- **Red** (`g-tokenize-section-codes-red.txt`): 14 failed, 8 passed (22 total).
  - The tokenize, boundary and weight cases fail, because `tokenize` is not exported at HEAD.
  - The 3 code-only routing cases fail in both the full-catalog and the production compositions.
  - The guards pass: the 2 always-on prompts, the IVDR performance-evaluation guard, the pool-membership check and the annex-key negative.
- **Green** (`g-tokenize-section-codes-green.txt`): 140 of 140 pass across 5 files:
  - the new test;
  - tool-selection-routing, with its 29 original CASES plus the cases added since and the production-composition NATURAL cases, all unchanged;
  - tool-selection, including the maxTools 30 tight-cap cases;
  - self-drive-regressions;
  - turn-plan-and-context.
- **Importers** (`g-tokenize-section-codes-green.importers.txt`): 75 of 75 pass across 7 files: ana-realtime ×3, turn-record-loop, agent-activity, deep-investigation and chat-path-parity.
- **Typecheck:** `tsc --noEmit -p .` through the lock reports no errors in either changed file.
- **Lint:** eslint reports no warnings on either file, at HEAD or in the working copy.

## Fix round 1 (review: CTD Module 3 codes were truncated)

- **Defect** (found by the reviewer's probe, reproduced in this checkout): the
  dotted alternative of `CODE_TOKEN` was `\d+(?:\.\d+)+`, and its lookahead
  refused only a following `[a-z0-9]` or `.<digit>`.
  - So in "3.2.S.4.1", "3.2.P.5.1" and "3.2.P.8" it stopped at `3.2` and
    emitted `3.2`.
  - `containsCode` accepted that `3.2` before `(` in "21 CFR 3.2(e)". That
    pulled `determine_primary_mode_of_action`, `classify_combination_product`
    and `select_combination_submission_pathway` into "draft 3.2.P.5.1" and into
    "what goes in 3.2.S.4.1 specification for the drug substance" (full
    catalog, cap 50).
- **Fix:**
  - The dotted alternative now takes single-letter segments whole:
    `\d+(?:\.\d+)+(?:\.[a-z](?:\.\d+)*)*`. That gives `3.2.s.4.1`,
    `3.2.p.5.1` and `3.2.p.8`.
  - Both the `CODE_TOKEN` lookahead and the `containsCode` after-check now
    refuse a following `.<letter or digit>`. So where the whole code cannot be
    taken (for example "3.2.Sx"), no fragment is emitted.
- **Red** (`g-tokenize-section-codes-red.fix1.txt`, working copy before the
  fix): 5 failed, 22 passed (27 total). The failures:
  - the Module 3 whole-code tokenize case;
  - the no-fragment case;
  - the synthetic "21 CFR 3.2(e)" scoring case;
  - the 2 real-catalog cases that check no combination-product tool is offered
    for a Module 3 turn.
- **Green** (`g-tokenize-section-codes-green.txt`, refreshed): 145 of 145 pass
  across the same 5 selector files, the 27 of the new test included.
- **Importers** (`g-tokenize-section-codes-green.importers.txt`, refreshed):
  75 of 75 pass across the same 7 files.
- **Typecheck and lint, re-run:** tsc through the lock reports no errors in
  either file. eslint reports no warnings on either file.
- **Known limit, now documented on `tokenize`:** a plain decimal or version in a
  turn is also a code token, at +2.
  - Measured on 2026-10-05 against `ALL_ANA_TOOLS`: no description carries
    `0.05`.
  - `1.2` scores only on `review_trial_schema`, through "ICH M11 §1.2".
  - `312.32` is a wanted match: it is a CFR section number.


## Fix round 2 (review: single-number annex keys, importer evidence, commit subject)

- **Defect:** `CODE_TOKEN` takes a single-number annex key ("annex II.6 of the
  MDR" gives `ii.6`), but `isCodeToken` required a digit-dot-digit. So `ii.6`
  was scored as a word term: +1 on a plain substring match, which hits inside
  "iii.6.1" and "ii.61". This was latent, since no description in
  `ALL_ANA_TOOLS` carries an annex key today.
- **Fix:** `isCodeToken` now tests `/\d\.\d|^[ivx]+\.\d/`. That covers every
  `CODE_TOKEN` shape: section codes and eSTAR CH tokens always carry a
  digit-dot-digit, and an annex key starts with a roman numeral and a dot. Word
  runs never contain a dot, so no word term is caught.
- **Red** (`g-tokenize-section-codes-red.fix2.txt`, working copy before the
  fix): 1 failed, 27 passed (28 total). The failure is the new case: "II.6"
  reached a tool described by "III.6.1".
- **Green** (`g-tokenize-section-codes-green.txt`, refreshed): 146 of 146 pass
  across the same 5 selector files, the 28 of the new test included.
- **Importers** (`g-tokenize-section-codes-green.importers.txt`, refreshed):
  133 of 133 pass across 9 files. These are the 7 earlier files, plus
  `server/__tests__/routes/ana-tool-policy.test.ts` for `routes/ana-tool-policy.ts`
  and `server/services/ana-ri/__tests__/command-rbac.test.ts`.
- **Typecheck and lint, re-run:** tsc through the lock reports no errors in
  either file. eslint reports no warnings on either file.
- **Routing effect of annex keys and CH tokens:** none yet. They are emitted,
  but no tool description in `ALL_ANA_TOOLS` carries one (reviewer's probe,
  2026-10-05). So naming "II.6.1" or "CH3.05.06" in a turn routes nothing today.
- **Not changed:** an eCTD "m" prefix ("m2.7.3") still yields no code token,
  because the lookbehind refuses a preceding letter. This is unchanged from HEAD
  and is left to a later step.

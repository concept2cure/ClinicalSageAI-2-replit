# g-generation-prompt-parent-codes — facts relied on

Step: the IND drafting prompt (`buildSectionGenerationPrompt`,
`server/services/ind/ctd/index.ts`) briefs a parent code as the parent, not its
first child. Finding 75, step 1 (verified-all.json index 75).

## Regulatory facts

This change asserts **no new regulator fact**. Every section code and title the
prompt prints is read from the platform's canonical overlay,
`CTD_AUTHORING_GUIDANCE` (`server/services/ind/ctd/authoring-guidance.ts`), which
the authoring-depth and citation-accuracy suites already hold. No title is
invented for a parent container: a parent prompt names the container by its
code only ("authoring CTD section 4.2.3 as a whole"), the same choice
`requirements-resolver.ts` makes ("4.2.3 — the sections it contains").

| Fact the prompt depends on | Basis |
|---|---|
| ICH M4 organises Module 2.6, 2.7, 3.2.S, 3.2.P, 4.2.1-4.2.3 and 5.3 as containers of numbered sub-sections | Recall (ICH M4 / M4Q / M4S / M4E structure), as already encoded in the overlay; not re-checked against ICH text in this step |
| The sub-section titles listed (e.g. 4.2.3.1 Single-Dose Toxicity … 4.2.3.7 Other Toxicity Studies) | The overlay's own `title` field; this step adds none |
| ICH M4E has a heading 5.3.5 ("Reports of Efficacy and Safety Studies") between 5.3.4 and 5.3.5.1 | Recall, not checked against ICH text. The overlay has no 5.3.5 entry, so the prompt lists 5.3.5 **by code only** and invents no title |
| The ICH M4 heading titles of 2.6.1, 3.2.S.1, 3.2.S.2, 3.2.S.3, 3.2.S.4, 3.2.S.7, 4.2.2.1 and 5.3.5.3 do not carry the overlay's qualifiers (" — Overview", "(Drug Substance)", "(Nonclinical Written and Tabulated Summaries)", "(Pharmacokinetics)", "(Integrated Summary of Safety and Integrated Summary of Efficacy)") | Recall, not checked against ICH text. The prompt strips only the overlay's own trailing qualifier; it adds no words |
| Some IND sub-sections are legitimately not applicable at a phase (e.g. 4.2.3.4 Carcinogenicity before Phase 3) | Recall (ICH M3(R2) timing), used only as the reviewer's example. The prompt does not encode it: "Not applicable" is allowed only where the material provided says so, with the reason it gives |

## Platform facts (checked by probe and test, 2026-10-05)

- At HEAD 35f036ef, 8 of the 19 `IND_SECTIONS` resolved through
  `getCtdAuthoringGuidance` to their first descendant: 2.6→2.6.1, 2.7→2.7.1,
  3.2.S→3.2.S.1, 3.2.P→3.2.P.1, 4.2.1→4.2.1.1, 4.2.2→4.2.2.1,
  4.2.3→4.2.3.1 "Single-Dose Toxicity", 5.3→5.3.1 (red output, test
  "every one of the 19 IND sections is titled with its own code").
- A code deeper than any entry (2.7.3.1) was titled with the ancestor's code
  (2.7.3), so the prompt never said which section was open.
- Callers of the prompt: `server/services/ind/ind-section-registry.ts`
  `getGenerationPrompt` → `server/routes/ind-generation.ts` POST
  /generate-section and `server/routes/knowledge-base.ts` auto-draft loop. Both
  are fixed by the one change; neither file was edited.
- `getCtdAuthoringGuidance` is unchanged and still serves its other callers
  (GET /guidance/:code).

## Note on the test

After the red run, the test's code-extraction regex was tightened from `(\S+)`
to a dotted-code pattern, because the new ancestor wording puts a comma after
the code ("2.7.3.1, within 2.7.3 …"). Against HEAD the tightened regex extracts
the same codes ("4.2.3.1", "2.7.3"), so the red result is unchanged.

## Fix round 1 (review 2026-10-05)

- **Blocking — 5.3 heading tree.** The overlay has no 5.3.5 entry, so the 5.3
  listing ran "5.3.4 …" then "  - 5.3.5.1 …" to "5.3.5.4", nesting the
  efficacy/safety reports under 5.3.4 with no 5.3.5 heading. A probe over the 8
  IND parents found 5.3 the only one with orphaned children. `parentHeadingLines`
  now emits every unregistered intermediate level by code only ("- 5.3.5") right
  before its first descendant, indented by true depth. Test: "every listed
  heading sits under the requested code or another listed heading" over all 8
  parents (red: 5.3.5.1–5.3.5.4 orphaned) and "5.3 lists 5.3.5 … before 5.3.5.1".
- **Minor — platform qualifiers in headings.** `headingTitle` strips a trailing
  " — Overview" and a trailing bracketed note with no nested bracket; a bracket
  inside a title ("Manufacturer(s)", "Human Pharmacokinetic (PK) Studies") is
  kept. Applied only to the parent listing, not to the overlay.
- **Minor — not applicable vs unknown.** The parent prompt now lets a heading
  say "Not applicable" with the reason, only where the material provided says
  the section does not apply ("do not decide that yourself"); a placeholder
  stays for what the material does not support.

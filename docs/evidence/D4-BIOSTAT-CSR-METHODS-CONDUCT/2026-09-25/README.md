# BS12 (D4): the CSR §9.7 methods section does not assert conduct it cannot know

**Row:** D4. **Lineage plan:** LX-16. The statistics engine's
`statistical_methods_section` is a CSR section (ICH E3 §9.7). It is reachable through
AnA's `generate_statistical_document`, and a CSR is filed to the agency.

## The defect

The section is generated from **planning inputs and the engine's computation alone**,
yet it asserted in the past tense, as fact:

- "Analyses followed the pre-specified SAP."
- "Efficacy was analyzed on the ITT population; the PP population was supportive."
- "Missing data were handled by X, with tipping-point sensitivity analyses" (or "per
  the pre-specified SAP approach with sensitivity analyses").
- "…secondary endpoints were tested within a pre-specified hierarchy."
- "No interim efficacy analyses were conducted."

Nothing established any of it. Rule 2 applies: governed content comes from what is
known, and nothing is fabricated.

## The fix

The section states the plan and the engine's figures (design, method, α, planned N
and its power, the formula, the planned missing-data method and the planned
interims). Every statement about **conduct** is marked
`[DATA TO BE INSERTED: …]`, naming what the sponsor must supply. That is the
placeholder the CSR completeness check (`csr-builder` `hasUnresolvedPlaceholders`)
detects, so a section with open items cannot read as complete.

## Evidence

- `01-red-before-fix.txt`: 6 red. Each claim is present as fact, and there is no
  placeholder.
- `02-green-after-fix.txt`: 7/7. The claims are absent, the placeholders are detected,
  and the planned N and the planned MMRM are still stated.
- 79 related suites (biostatistics, document generator and CSR builder), 1598 tests,
  pass. `tsc` is clean on the generator.

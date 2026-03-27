# AnA Document Stack — Life Sciences Regulatory & Medical Writing Tuning

## Scope of tuning in this increment
- Added Concept2Cure-specific medical writing checks focused on regulated tone and evidence clarity.
- Added starter Vale rule pack files for anti-promotional and evidence-language guidance.
- Added quality lint service composition for:
  - Concept2Cure rule checks
  - Vale CLI checks
  - LanguageTool grammar/style checks

## Regulatory writing heuristics now included
1. Flag promotional/superlative claims inappropriate for submissions.
2. Flag ambiguous evidence phrases that reduce reviewer trust.
3. Flag uppercase abbreviations lacking first-use expansion hints.
4. Aggregate findings into advisory quality report payloads.
5. Add class-specific checks (510(k) predicate mention, clinical endpoint/population cues).
6. Flag percentage claims lacking CI/statistical uncertainty context.

## Next tuning priorities
- Section-aware rules for CER/PMCF/510(k)/eSTAR artifact classes.
- Statistical phrasing checks (confidence intervals, endpoint claims).
- Risk language consistency checks (benefit-risk framing).


## Plug-in completion progress
- Citation normalization now routes through explicit adapters (GROBID + Citation.js + scispaCy).
- Quality linting now routes through explicit adapters (Vale + LanguageTool + Concept2Cure heuristics).
- Reviewer diff scaffolding now routes through redlines + diff2html service composition.

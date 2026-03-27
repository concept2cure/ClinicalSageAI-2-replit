# OSS Stack Scoring Rubric

## Scoring model
Each task is scored 0-5 by objective criteria; weighted category score is used for beta/GA gates.

## Categories and weights
- Parsing quality: 25%
- Retrieval + citation integrity: 25%
- Policy enforcement correctness: 20%
- Workflow reliability: 15%
- Observability completeness: 10%
- Pilot safety controls (Byaldi/E2B): 5%

## Minimum thresholds
- Beta: weighted score >= 3.8 and no category below 3.0.
- GA: weighted score >= 4.3 and no category below 3.8.

## Hard fail conditions (auto-block)
- Any governed export bypass.
- Any uncitable evidence result in regulated flow.
- Any unbounded long-running execution path.
- Any sandbox-to-core direct write path.

## Human testing overlay
- At least 10 supervised domain-user sessions for beta.
- At least 25 supervised domain-user sessions for GA.
- Critical UX/governance defects must be zero-open for GA.

# W3 / D4 — Intelligent Awareness in evidence judgment

Anna's existing evidence tools now preserve scientific uncertainty rather than
settling disagreements from dates, numbers or coverage labels alone. This moves
D4 runtime evidence; D4 and the commercial launch remain open.

Canonical base: `41dd55b3f5a3635c75e3c8ce70c25a66bde6f560`. No new tool, surface,
model, dependency, integration, migration or governed write path.

## Reproduced defects and resulting behavior

- Opposite dated assertions formerly said the later assertion "supersedes" the
  earlier one. Valid dates now establish chronology only. Both source references
  remain, with an unresolved conflict and instructions to verify population,
  methods, scope and source authority. Invalid calendar dates cannot establish
  chronology.
- Numbers with incompatible units, a unit on only one side, or no metric label
  were compared directly. Such comparisons now stop with named limitations.
  Unit symbols preserve case; no unit alias or conversion is inferred. Legacy
  numerical comparisons with both units absent remain preliminary, explicitly
  subject to verification. Same-unit mismatches carry original unit provenance.
- Opposite polarity for different endpoints could become a contradiction
  (efficacy benefit versus a safety signal). Different or one-missing metrics
  are no longer treated as matching endpoints. Matching fields still do not
  establish common populations, methods or timepoints; the report states this.
- Population substring matching accepted "not pediatric" as pediatric coverage.
  Only exact normalized labels establish metadata coverage; broader labels
  require applicability verification.
- Future years could satisfy recency, and an empty query could return complete.
  Recency uses a finite non-negative window and positive integer reference year,
  bounded on both sides. `assessed: false` / `complete: false` mark empty criteria
  and invalid requested recency. Partial valid dimensions may still report gaps.
- Coverage descriptions now name what the supplied metadata does not confirm,
  without claiming that underlying evidence does not exist. Independently
  satisfied dimensions do not establish joint scientific applicability.

## Reachable implementation

The canonical implementations remain `evidence-contradiction-detector.ts` and
`evidence-gap-detector.ts` under `server/services/ana/`. Existing registrations in
`AnaToolExecutor.ts` continue to call them and serialize all notes and findings.
`AnaToolDefinitions.ts` now tells the model to use observed source fields, read
limitations, retrieve available context and ask only consequential questions.
It does not require an interview before every useful answer.

The removed date-based supersession and population-substring rules are replaced
on those same registered paths. The detector suites cover their replacements;
`evidence-judgment-tools.test.ts` exercises the actual registered handlers. The
stream context suite passes the real deterministic report through a controlled
HTTP stream tool call and confirms the next gateway request retains the limits.
That gateway response is scripted, not a demonstration of model wisdom.

## Validation

- Before fixes: contradiction suite **9 failing / 20 passing**; gap suite
  **6 failing / 12 passing**. A further case-sensitive unit regression failed
  **1 / 30** before its fix. Logs retain these reproductions.
- Final regression run: **407 passing tests / 39 suites**, spanning all AnA RI
  route tests, shared/submission IA, conversation bounds, caller/thread access,
  coded error containment, both detectors and registered evidence tools.
- All **26 repository guards passed**; publication import and lint ratchets are
  recorded separately. Targeted ESLint: zero errors, no new warning counts.
- `git diff --check` passed. Full local TypeScript remains deferred to GitHub
  under the previously authorized workspace-memory exception.

## Remaining limits

The structured reports are preliminary aids, not scientific or regulatory
sufficiency decisions. They cannot read source text, convert units, establish
study comparability, adjudicate source authority or prove joint applicability.
Different descriptions of equivalent populations or endpoints may require
source review; automatic semantic equivalence is not claimed.

`published-parent-ci.json` records exact prior head `8212d3c`: security contracts
and secret scan passed; Lint/TypeScript remained pending during inspection.
Security Scan failed at the lockfile dependency-risk gate and Trivy filesystem
scan. This scoped change does not resolve those failures or establish a green
release. Exact new-head CI must be reviewed after publication.

No live provider assessment was performed. `acceptance-review.md` records the
pending scientific/regulatory judgment review across product categories and the
five requested markets. Test fixtures are not evidence of regulatory accuracy.

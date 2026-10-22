# D2 — second citation review: paused, not verified

The founder paused this on 2026-10-22 because the session's usage was running out. **Nothing here has been applied, and nothing has been verified.**

- **What ran.** `audit-workflow-pass2.js.txt` covered 22 file groups across the question flows, war-game auditors, the CER sub-node files, the core interview helpers and `shared/regulatory/pathway-cautions.ts`. Each group had two finders, one on citations and one on substance, and the finders were told to re-check the first pass's recall-based corrections.
- **Where it stopped.** All 44 finders finished. The adversarial verification stage, two skeptics per finding, was stopped part way.
- **What is here.** `unverified-candidates.json` holds 249 deduplicated candidate findings: file, line, quote, error, correction, severity and confidence. They are **candidates only**. In the first pass, 322 of 325 survived verification, but each one still has to be verified before anything is changed.

## To resume

1. Run the verification stage alone over `unverified-candidates.json`: the same two lenses as the script, `regulation` and `code`, both of which must confirm.
2. Fix the confirmed findings the way pass 1 did: a fixture plus `tests/regulatory/ana-knowledge-audit.test.ts`-style red test, then one fixer per file group.

# BS4 (D4): AnA's statistics commands stop sizing trials on numbers nobody gave

**Row:** D4. AnA is the always-on shell surface. `generate_sap` and
`compute_sample_size` are its platform commands, and their figures reach the SAP
draft and the chat.
**Lineage plan:** LX-16 (`docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md`).
**Found by:** the lineage verification (`wf_dbeffd2b-a8b`, BS4). A sub-claim was
corrected by the verifier, and the dropoutRate and σ = δ halves were added by it.

## The defects

1. **Silent pre-fills.** Both commands built the engine input themselves and filled
   effect size 0.5, study, objective and endpoint type, alpha, power and 15%
   attrition before the normalizer ran. The normalizer's "Effect size is required"
   refusal could never fire, and its `prefilled` disclosure was always empty.
2. **σ = δ.** Neither command passed a variance. With none, the engine used
   SD = effect size, so the standardized effect was exactly 1 for every continuous
   design: about 16 per group, whatever effect was asked for. The design adapter
   had been telling users the opposite ("the engine will treat the effect size as
   standardised"). "Generate a SAP for our Phase 2 oncology trial" produced N = 38.
3. **dropoutRate ignored.** The `compute_sample_size` catalog advertises
   `dropoutRate`, and the handler never read it, so 15% was applied silently.
4. **A refusal reported as success.** `generate_sap` reported "SAP generated" even
   when the workflow had refused the input. The refusal came back dressed as a
   judgment.

## The fix

- One input builder, `commandStatisticalInput`, is used by both commands. It passes
  what the user gave and leaves the rest absent. It reads `dropoutRate` and
  `variance` (or `sd`). The duplicated construction is gone.
- Both commands refuse with the normalizer's own messages. `generate_sap` does so
  before anything is drafted.
- In the engine, one helper, `continuousSigma`, gives SD = 1 when no variance is
  given. The effect size is then a standardized difference, as the adapter already
  said. It replaces the σ = δ fallback at all four sites: sizing, power, crossover
  and scenarios. `buildAssumptions` discloses it as `variance: 1, source: 'default'`.
- The catalog entries name the inputs each command actually needs.

## Evidence

- `01-red-before-fix.txt`: 7 red.
  - d = 0.5 and d = 0.3 both size at 16 per group.
  - No variance disclosure is recorded.
  - A missing effect size is accepted.
  - dropoutRate 0.25 is ignored (38 instead of 44).
  - A variance of 4 is ignored.
  - "SAP generated" with no effect size.
- `02-green-after-fix.txt`: 7/7.
  - d = 0.5 → 63 per group; d = 0.3 → 175. The textbook z-approximation.
  - The refusals name "Effect size is required".
- 67 biostatistics-related suites are green, and so are 81 files / 1231 tests across
  ana-ri, biostatistics-bridge, study-design and ana-biostats. `tsc` is clean on the
  changed files.

## Changed behaviour a user will notice

Asking AnA for a SAP or a sample size without an effect size, a study type or an
endpoint type now returns what is missing, where before it returned a number. The
number was fabricated.

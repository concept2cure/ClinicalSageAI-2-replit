# D5: a CSR can state a Bayesian primary result (2026-10-29)

Session `…01E8btkB`, CSR path review for the LMN-201 / RePreve prospect
(NCT05330182). RePreve's primary analysis is Bayesian: Part B randomized 23
patients 1:1, with global cure in 10/12 against 4/11. The CSR source contract
had nowhere to put a posterior probability or a credible interval, and the
figure guard did not see one.

## What already exists

Searched `bayes`, `posterior`, `credible`, `CrI`, `pValue` and `ci.lower` in
`server/`, `shared/` and `client/src/`. `git log --all --diff-filter=D` on
`*ayes*` found nothing.

| Exists | Path | What it does | What it did not do |
|---|---|---|---|
| The CSR source contract | `shared/csr-source-input.ts` (`concept2cure.csr-source.v1`), documented by `shared/csr-source-contract.ts` from the same zod | Records each efficacy result as recorded: value, display, CI, p-value, comparator. Strict, so an unknown key refuses the file | No credible interval or posterior. A Bayesian source was refused outright |
| The §11.4 table | `server/services/csr-tabulation-builders.ts` `buildEfficacyTable` | Fixed code builds the table from the source. `saved-clinical-tables.ts` rebuilds it on every read, so scientific-review receipts hash these cells | Headers `Endpoint, Arm, Result, CI, p-value, vs Comparator` only |
| The figure guard | `server/services/csr/unsupplied-statistics.ts` | Refuses a model draft of a statistical section that states a p-value, a bracketed CI, an effect estimate, a count, a percentage or an alpha that nobody supplied | Blind to a posterior probability, a bare n/N ("10/12") and an unbracketed interval ("CrI 1.1 to 69.5") |
| A Bayesian engine | `server/services/stats/bayesian-device.ts` | Beta-binomial design and operating characteristics for single-arm device trials | Not a CSR input. The CSR records the sponsor's analysis; it does not compute one |

Nothing was rebuilt. The contract, the table and the guard each gained what the
study needs.

## What changed

- **Contract.** An efficacy result may record `credibleInterval {lower, upper,
  level}` and `posteriorProbability {value 0–1, hypothesis}`, for example
  `OR > 1`. Reversed credible bounds are refused, as reversed CI bounds already
  were. The published contract carries both the fields and the rule.
- **Table.**
  - The table gains `Credible interval`, `Posterior probability` and
    `Posterior hypothesis` columns, only when a result carries them. A table
    built from a source without them is byte-identical, so every existing
    scientific-review receipt still verifies.
  - A posterior is shown to three places, as p-values are, but never rounded
    up to certainty or down to impossibility (`>0.999`, `<0.001`).
  - Nothing is computed; a cell the source left empty says `—`.
- **Guard.** Three patterns: a posterior or probability followed by a decimal,
  a bare n/N (not a date, and not a phase the study information supplied), and
  an interval written without brackets. A false match only sends the section
  to its template, which is the safe direction.

What it does not do: compute or verify a posterior, choose a prior, or judge
the analysis. Those stay the SAP's and the reviewer's.

## Evidence: seen failing first

| Check | Red | Green |
|---|---|---|
| `server/services/csr/__tests__/csr-bayesian-result.test.ts` (new; the synthetic LMN-201 demo source plus a synthetic posterior, none of it the sponsor's) | `red.txt`: the source is refused, and nothing displays a posterior | `green.txt`: 4/4 |
| `unsupplied-statistics.test.ts`, 2 cases added | `red.txt`: a draft stating "10/12", "posterior probability … 0.993" and "CrI 1.1 to 69.5" passed the guard | `green.txt`: 11/11, including the case that a supplied "Phase 2/3", a date and a placeholder still pass |
| Byte-identity holds | `green.txt`: with the columns made unconditional, the byte-identity case fails | — |
| Every test of the changed modules | — | `affected-suites.txt`: 17 files, 212/212. The gate suite: 40/40. The cortex CSR suites: 95/95 |

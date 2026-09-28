# LX-16 (D4): a binary design reports the power it computed

**Row:** D4. **Lineage plan:** LX-16.

## The defects

1. **The target echoed as "achieved".** `computeBinary` returned `power: input.powerTarget`.
   A binary design always "achieved" exactly what was asked, and its scenarios all
   showed that same power.
2. **Four identical scenarios.** A binary design given as control and treatment
   rates is sized from the rates, not from `effectSize`. The effect scenarios
   scaled only `effectSize`, so all four were the same trial. The test for (1)
   exposed this.

## The fix

- `binaryPower` inverts `computeBinary`'s formulas, with the same rates, variance
  terms and critical value: superiority on |p2 − p1|, non-inferiority on
  |(p2 − p1) − Δ_NI|. The design reports that computed figure.
- A rate-given scenario scales the rate difference itself.

## Evidence

- `01-red-before-fix.txt`: superiority reports 0.8 exactly (the target), and every
  scenario has one power. The non-inferiority case passed at HEAD only because the
  echoed target equals the right answer, so it is kept as a guard, not as proof.
- `02-green-after-fix.txt`: 3/3. Superiority sized for 80% computes 0.80x, and the
  scenarios differ.
- 67 biostatistics suites, 1437 tests, are green. `tsc` is clean on the engine.

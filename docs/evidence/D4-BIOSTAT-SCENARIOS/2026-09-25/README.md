# LX-16 (D4): every scenario is sized through the design's own path

**Row:** D4. The engine's scenario table accompanies every computation into the SAP
drafts and the judgment. **Lineage plan:** LX-16.

## The defect

`generateScenarios` carried a third copy of the sizing formulas. It sized
superiority only, at 1:1 allocation, and halved a figure that was already per
group. So every design's "Base case" disagreed with the design printed beside it:

| Design | Design N per group | "Base case" per group |
|---|---|---|
| continuous superiority | 63 | 32 |
| binary superiority, 2:1 | 123 | 82 |
| time to event | 486 (adjusted total) | 485 |
| continuous non-inferiority, δ = 0 | 393 (adjusted total) | Infinity |
| continuous equivalence, δ = 0 | 252 (adjusted total) | Infinity |

## The fix

Each scenario is `compute()` of the design with its effect size scaled, so the
Base case **is** the design. A non-inferiority, equivalence or unequal-allocation
design is scenario-tested as what it is. Scenario power is the computed power, not
the target. The nested calls are guarded to one level, since a scenario has no
scenarios of its own. The duplicated formulas are deleted.

## Evidence

- `01-red-before-fix.txt`: 6 red (the table above).
- `02-green-after-fix.txt`: 6/6. For five designs, Base case N and power equal the
  design, and no scenario carries a non-finite N.
- 67 biostatistics-related suites, 1434 tests, are green. `tsc` is clean on the
  engine.

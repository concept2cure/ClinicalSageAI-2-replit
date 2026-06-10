# fcoi-completeness-review — CHANGELOG

## v1.0 (2026-06-10)
- Initial prompt. Reviews a clinical investigator financial disclosure (21 CFR
  Part 54) for completeness, bounded by a deterministic rule gate whose findings
  are passed in as authoritative. Checks the four 54.2 interest categories,
  3454/3455 consistency (54.4(a)), disclosure-period coverage (54.4), and
  adequacy of steps to minimize bias (54.4(a)(3)(ii)). Strict-JSON output:
  `{ findings, riskLevel, recommendations }`. No fabricated citations.

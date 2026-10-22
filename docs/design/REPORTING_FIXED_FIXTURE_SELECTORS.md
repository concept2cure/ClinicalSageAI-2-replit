# Reporting fixture selectors use fixed patterns

W1 / D2, `concept2cure-v2`, 2026-10-14. Bounded test-only correction for hosted Semgrep job 115757525000 on the published `baff` revision. The original selected decoded log excerpt is retained separately in evidence.

The hosted `detect-non-literal-regexp` rule blocked two `new RegExp` selectors in `insightsBundleExport.test.tsx` at original lines 237 and 289. Both `content` inputs are finite `as const` fixtures containing only `reports` or `manifest`; they are not supplied by the user or server. The required correction uses one explicit map with `/Export reports PDF/` and `/Export manifest PDF/`. No constructor builds a pattern from the parameter.

The two existing interactions index that map. Patterns remain unanchored, preserving the original visible-label matching behavior. The actual buttons retain those names while busy state is announced separately as `Preparing PDF…`; the fixed patterns also tolerate additional accessible-label text. Every case, assertion, request and fixture transition remains unchanged. No production source, scanner rule, ignore, suppression or baseline changes.

Scoped lint and source review are permitted during preparation. The existing 21-case bundle suite, 30-case library suite and 4-case individual-export suite will run once the control tower grants a heavy runner slot. Preparation is not a test or hosted-scanner pass. Root owns compiler, publication and the subsequent hosted Semgrep result.

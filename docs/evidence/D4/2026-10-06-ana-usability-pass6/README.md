# W3 / D4 — Bounded history recovery and specific stream failures

Saved conversation reads previously had no deadline across fetch headers or JSON.
A stalled read kept the selected conversation loading indefinitely. One 15-second
wall-clock deadline now covers both phases, aborts the network read, and settles
the caller even if a late response ignores cancellation. Timeout restores the
existing Retry/New conversation recovery; sends remain blocked until explicit
retry or reset. Superseded requests cannot restore old history. The deadline and
abort listener are disposed after success, failure, reset, switch, or unmount.

Structured stream error frames previously lost their code/status when converted
to an Error. Recovery now keeps those fields and explains thread ownership,
sign-in, provider configuration, and usage limits using existing refusal text.
No automatic retry, model, execution authority, or regulatory gate changes.

The previous published batch's GitHub compiler run found TS2769 in the host test:
queryByRole does not accept `exact`. Removing that unsupported option preserves
its exact string name matching. The actual interruption host tests still pass.
Run: https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37402352555
The preceding browser smoke passed; full typecheck on this correction awaits CI.

Evidence: history-timeout-red.txt reproduces two unbounded waits; final-green.txt
records 158 passing tests across 19 suites. final-focused-green.txt records the
focused recovery checks. lint-summary.json records zero errors and unchanged 36
existing hook warnings, with zero warnings in new/updated tests. All 26 repository
guards in repository-gates.json passed. The founder's approved local full-compiler
memory exception remains applicable; the unchanged GitHub compiler gate validates
publication. D4 remains open pending live deployment/provider and launch evidence.
Existing dependency-audit findings remain unresolved and are not suppressed.

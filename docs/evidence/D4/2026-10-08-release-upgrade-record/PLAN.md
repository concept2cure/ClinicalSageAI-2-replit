# W3 / D4 — bind upgrade evidence to the live replay check

The completed migration job at exact `6a54db1` succeeded, including the replay
check that no constraint or index is rebuilt. Release assembly failed closed
because its exact lookup still expected the old step name. Realign that one
binding to the live workflow; preserve the workflow command and reviewed policy.

Production scope: `scripts/release-evidence/assemble-input.mjs` only. Regression
scope: `tests/release-evidence/assemble-input.test.mjs` only. Tests must load the
actual CI workflow instead of deriving all fixture step names from the assembler.
Show the new workflow-based contract failing before editing the assembler.
Require a unique upgrade step record; ambiguous records must never choose the
first success. Preserve honest emission of failed, skipped or unknown conclusions
and downstream refusal. No policy, manifest schema, approval, security disposition,
scientific baseline, migration or runtime database changes.

Evidence will record the actual CI failure, successful live step, local RED and
GREEN, neighboring release-evidence contracts and scope identity. The full remote
release rerun remains independent; this repair does not approve a release or mark
D4 / D1–D10 green.

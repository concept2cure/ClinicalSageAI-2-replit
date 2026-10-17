# Independent selected-source identity controls

This review moves the source-integrity portion of launch D2 within existing Vault and Authoring. It does not close D2 or qualify scientific conclusions, agency acceptance, runtime database authorization, provider delivery, or model use.

## Observed baseline failure

The approved application baseline `990a687c6` remained unchanged when the contract-only checkpoint `dbb3de5355e074a79c2e3fe6606ceaf5f4041d31` was tested. On 16 October 2026 at 21:29:46 UTC, the actual current parser and verifier produced **six intended failing assertions and three passing controls**. All seven before/after file hashes matched. See `independent-baseline-fail-first.txt` and `independent-baseline-source-bindings.json`.

The parser stripped complete V2 version/digest fields and accepted the old unversioned shape for a new write. The verifier accepted a same-length extraction correction both inside and outside the recorded span, and accepted incorrect extraction and excerpt digests. Positive controls established that an unchanged current source could actually traverse the controlled seam, a genuinely historical opening-only source remained usable, and withdrawn data refused. Those passing controls distinguish the decisive result from an unrelated authority failure.

An earlier fixture setup had an incorrect relative module path. Its four failures and five passes are preserved in `independent-fixture-path-error.txt` and its bindings. That run is **not** the fail-first result and its error-path passes do not establish source-integrity protection. Correcting the fixture path, without any production edit, produced the decisive six failures above.

## Held-out test design

`independent-source-identity.test.mts` calls the actual parser, direct verifier, stored-source verifier, source producer, prompt formatter and audit formatter. Catalog reads and actor/program scope functions are explicit controlled seams. SHA-256 expectations use Node's independent `createHash` directly on original strings and `String.slice` coordinates; the tests do not import the production identity factory.

The expanded controls cover complete, missing, malformed and unknown identities; new-write versus stored-only compatibility; V2 group downgrade and partial markers; same-length extraction changes inside and outside a span; late Japanese and astral UTF-16 offsets; ill-formed UTF-16 encoding collisions; retained data and unavailable originals; current version, program and disposition refusals; source/input immutability across an await; final metadata, actor and program return checkpoints; text-free audit identity; and unassessed scientific semantics for US, European, Japanese, Canadian and Australian life-sciences examples.

The baseline probe source is preserved as `baseline-independent-source-identity.test.mts.txt`, byte-verified against the original recorded `2dc961dd…` SHA-256. The original application reference module is preserved as `baseline-draft-source-references.ts.txt`, byte-verified against `9972d440…`. An opt-in Vite pre-load counterfactual substitutes those exact application-module and test-fixture snapshots without changing any working application file. All other application modules stay current. This is a single-module regression counterfactual, not a recreation of the full historical application. The counterfactual runner's nonzero exit is expected only when the six original unsafe behaviors return while three positive controls still pass.

These jurisdiction/product examples establish that the same extraction identity and honest caveats survive representative source text. They are not filing rule, scientific validity, regulatory coverage or acceptance evaluations. Wrong-tenant/private-parent rejection in this suite is limited to the catalog seam's denial and correct call arguments; genuine database policy and reservation races belong to the lifecycle owner's separate evidence.

The final qualification run is pending the lead's application source freeze. Its command is Node 22 followed by `docs/evidence/D2-DRAFT-SOURCE-IDENTITY/2026-10-16/run-independent-source-identity.mjs final`. The runner writes a verbose transcript plus exact before/after bindings and fails if bound files change during execution. Historical baseline transcripts and hashes remain unchanged.

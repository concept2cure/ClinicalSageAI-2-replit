# Complete the existing IVD eSTAR mapper

Package F1, W1/D2; P-114 item 5. Scope is `server/services/pathway-engines/estar/estar-mapper.ts` and focused `ivd-mapper` tests. Root owns integration, compiler, build and publication.

## What already exists

`estar-mapper.ts` already defines separate IVD analytical-performance slots and a shared `whenApplicable` mechanism. `estar-outline-requirements.ts` and `estar-filing-readiness.ts` project this single mapper into outline labels and filing content readiness. The previous IVD registry inherited the non-IVD generic bench/animal requirement in addition to its required analytical evidence.

The actual vendored IVD eSTAR v7.1 contains BOTH BenchTesting and AnimalTesting. Independent raw XML ancestry inspection in `../retained-binder/raw-form-inspection.json` proves the USA selection HIDES BenchTesting and SHOWS AnimalTesting; the Canadian selection does the reverse. Merely inspecting field names or an unanchored visibility statement is insufficient. Thus the existing IVD `performance-testing` slot now describes conditional animal testing and matches animal evidence only. Analytical evidence remains independently required. E5 is retained as an optional legacy platform heading, not a universal FDA requirement.

The form supports a non-contact biocompatibility answer, but the current mapper has NO recorded answer to establish it. Its `checkApplicability` list does not block ready/canFileNow. The existing BIO review requirement therefore remains unchanged: accountable evidence OR a substantive human non-contact rationale is required; absence of an assessment does not permit ready. No new contact flag or inferred answer is introduced.

The root design records the contract and search scope. Inspected live mapper/readiness/outline owners, existing tests, actual form inspection and available deleted-path history. The checkout's shallow history limits deletion-search coverage.

## Corrected verification

The initial candidate and its 107-pass receipt are **superseded**, not current qualification. They incorrectly assumed both generic performance branches absent and relaxed BIO to a nonblocking applicability item. `supersession.json`, archived candidate source/test/README and all original reports retain that failed reasoning.

Before correcting that candidate, the corrected-contract suite produced **6 passed / 7 failed**, with stable source pins. This authentic RED includes the unsafe ready result without an E1 review and the missing animal applicability slot.

The corrected whole cohort is **109/109 passed across five unique files**, zero failed/pending, with all **14 pins stable**. It covers 13 new cases plus existing mapper, filing-readiness, outline-requirements and shipped-outline contracts. Counts overlap earlier reports and are not additive. Forced ESLint on the final runtime owner and test reports zero errors and zero warnings; original runtime warnings were also zero.

Final runtime SHA-256: `eba0867149a4add098792f8a5062aff233b396e5ffb6f3ff9ab55b64f8aa3aff`.

The final new-test rerun after splitting the describe grouping passes 13/13; reversing only that grouping boundary restores the exact qualified test bytes. All other 13 pins stay unchanged. This removes the new test’s length warning without changing assertions. `qualification-summary.json` selects the final whole-test rerun for that file and the corrected cohort for the other four files.

The separate official-template release gate remains closed when a template is unavailable/unpopulated. Non-IVD and De Novo registries retain their existing requirements. Animal-study applicability uses the existing reported human-assessment convention; it is not an agency acceptance verdict.

Root owns compiler, build, integrated migration/selector tests and publication. This packet does not establish human acceptance, FDA acceptance, deployment qualification or transmission.

# Current affected-test acceptance

The current file set verifies **3,073 cases across 250 files**. This is a per-file acceptance index, not a claim of one entirely green broad run.

The broad run passed 3,068 cases and failed five expectations in two files. Those expectations still described the old warning wording and the former absence of a tamper-only header warning. Production code was unchanged for their correction. Both files were rerun: all 51 cases passed, with every original test name and case count retained. The accepted set takes each of the other 248 passing files from the broad run and these two current passing files from the follow-up; it does not double-count cases.

Raw results are retained: [broad run](wave3-integrated-affected-tests.json), [follow-up](wave3-audit-expectation-followup.json). The [acceptance index](wave3-affected-acceptance.json) identifies the source result and count for every file and fingerprints both raw evidence files.

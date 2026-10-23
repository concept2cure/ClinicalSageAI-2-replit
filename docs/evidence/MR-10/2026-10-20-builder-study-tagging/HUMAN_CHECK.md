# Human check — existing Builder study tagging

**Status: unexecuted by a human.** Use synthetic qualification records in a
test environment with an authorized regulatory author. Automated checks do not
establish agency acceptance or suitability for patient care.

1. Open an existing project, its FDA IND submission and an editable sequence.
   Place a synthetic approved clinical study report into 5.3.5.1 through the
   existing Vault or Authoring action. Open Submission Center → Builder.
2. Confirm the row identifies the original source document. With no study
   metadata, compile must still report FDA-TRC-1789; do not bypass that finding.
3. Choose **Edit study tagging**. Record a test study id such as `STUDY-101`,
   the file-tag reviewed by your regulatory team, and the actual reason. No
   tag is inferred; the in-repository document-tag recall is not verified.
4. Save. Check the exact recorded values, source identity/pin and existing
   sequence history. If the sequence was validated, it must return to assembling
   and require validation again. An unconfirmed audit must show a warning.
5. Compile again. Inspect the existing Compile workspace and package: the
   study-specific STF should reference the report. Remaining DTD/conformance
   findings remain applicable and must not be treated as resolved by tagging.
6. In another authorized session change the same leaf; attempt the stale edit
   in the first session. Confirm refusal, explicitly reread, inspect the current
   values/identity, and decide whether to save the retained entered values.
7. Simulate a lost save receipt in the test environment. Confirm no automatic
   second PUT, retained input/reason and a required current-leaf reread. A later
   no-op or closing reconciliation must refresh sequence status and history
   while preserving the warning about the earlier unconfirmed write/audit.
8. Switch sequence/project or actor while a response is delayed. Confirm the
   old response cannot populate the current workspace. Frozen/dispatched
   sequences display stored metadata and offer no edit.

Record tester, environment, code/build identity, record IDs, actual/expected
results and deviations in the existing validation process. Do not add real
patient, sponsor or agency records to this fixture evidence directory.

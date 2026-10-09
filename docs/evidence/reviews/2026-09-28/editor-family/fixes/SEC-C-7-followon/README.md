# SEC-C-7 follow-on (b): the reviewer's name is shown read-only from the chosen account

**Finding.** SEC-C-7 (`6b442012`) made the server list a review under the
chosen account's own name and refuse any other name. The request drawer still
offered a free "Reviewer name" field, filled in only at submit and only when
blank. A person could therefore submit a form showing a name the review would
never be listed under.

**Fix.**
- `C2CFormField.derive(values)`: a derived field renders as
  `<input readOnly aria-readonly="true">`.
- `effectiveValues()` feeds both the required check and `onSubmit`.
- `reviewRequestField` derives the name from the chosen member.

**Evidence.**
- `red.txt`: 5 of 9 fail on the old code.
- `green.txt`: 9 of 9 pass.
- `mutant-1..4.txt`: each fails the tests:
  - not readOnly;
  - submit sends the typed values;
  - the required check reads the typed values;
  - the name is not derived.
- `lint.txt`: no new warnings.

**Adversarial review:** sound, no blocking issue.
- The reviewer ran all 80 test files that import C2CForm or a surface that
  renders it: 750 of 752 pass. The two failures are the `cmcSuiteWrites`
  timeouts, which fail identically without this change. They are handed on
  as work-orders item 10.
- Handed on: the read-only field has no read-only look.
  `journey-v2.css:490` styles `.de-input` with no `[readonly]` rule. That
  stylesheet is held by `…01PwLFr8`.

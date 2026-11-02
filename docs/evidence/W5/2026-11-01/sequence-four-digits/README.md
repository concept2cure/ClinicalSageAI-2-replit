# A package's sequence is the four-digit eCTD sequence (F1, 2026-11-01)

**Residual.** F(1)a in `../../2026-09-22/README.md`, "Not done", under the AnA package tool. It was
re-checked open at HEAD `5f30fdda0d`. AnA's `package_ectd_for_region` passes the model's sequence to
the packager unchanged. The packager's first-sequence rules compare against the literal `'0000'`.
A probe at HEAD gave three results:
- `'0'` with a delete returned `ok:true` and packaged a withdrawal of a document never on file, as
  `123456-0-fda.zip` with `<sequence-number>0</sequence-number>`;
- `'0'` with a replace was refused for the wrong reason;
- an omitted sequence packaged as `123456-undefined-fda.zip`.

**What already exists (RULE 3).** `packageEctdSubmission` in
`server/services/submission-gateways/regional-packager.ts` is the one sink every packaging path
reaches:
- Submission Center;
- the package spine;
- the qualification harness;
- the CSR assembly;
- AnA.

Its only check on the sequence was `isPlainName`, applied when the archive is written, after every
leaf had been read.

**Fix.** `refuseUnlessFourDigitSequence` runs as the packager's first statement. It refuses with
`PACKAGE-SEQUENCE-NOT-FOUR-DIGITS` any sequence that is not four digits, before any leaf is read. No
padding: the refusal names `0000`, so the caller retries with the right value. The archive-time
check keeps the application id. The package is F1; the file is unheld.

**Not done here.** Two parts of this residual are in `server/services/ana/AnaToolExecutor.ts`, which
the filing-types session holds:
- (b) an upper-case `'DELETE'` is not mapped through `toOperation`;
- (c) a declared `modified_file` is not checked against the filed manifest.

The full proposal is in `../README.md`.

| Run | File | Result |
|---|---|---|
| Red, before the fix | `red-first.txt` | 7 red (`'0'`, `'1'`, `'00001'`, `'0x01'`, `' 0000'`, `''`, undefined); the four-digit guard passes |
| Green | `green-sink.txt` | 12/12 |
| Every packager and caller suite (`suites-run.txt`) | `green-packager-and-caller-suites.txt` | 121 files: 1,450 pass, 3 fail; the 3 failures are identical at HEAD (`pre-existing-failures-at-head-5f30fdda0d.txt`) |
| Lint | `eslint.txt` | 0 errors. The warning count is unchanged; the function's complexity goes from 60 to 59 |

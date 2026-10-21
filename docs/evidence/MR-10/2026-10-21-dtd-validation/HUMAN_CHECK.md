# Human check — not yet executed

These steps are a witnessing checklist, not evidence that a person completed
them. Use an isolated qualification environment and synthetic documents. Do not
transmit a package to an agency as part of this check.

1. Open a program's existing eCTD sequence containing an approved study report
   with its study identifier and reviewed STF tag. Compile through eCTD Compile.
2. Inspect Package DTD validation. Confirm that index.xml, the regional XML and
   every generated STF appear separately, with execution, validity and errors.
   If the agency schemas are absent, confirm the result remains unverified.
3. Inspect checksum findings and the package SHA-256. Reload compile history and
   confirm that the same recorded proof remains tied to that package hash.
4. Open an older compilation without stored validation evidence. Confirm that
   its completed status and recorded leaf manifest do not establish a DTD pass.
5. In the isolated environment only, use explicitly synthetic test schemas and
   a matching checksums.txt. Exercise a valid package, invalid STF, missing DTD,
   missing validator and one-byte schema change. Confirm the specific finding
   and that none of the negative cases is reported as passed.
6. With the existing DTD requirement enabled for production qualification,
   confirm that missing, invalid or incomplete proof refuses packaging or
   transmission through the existing gates. Record the environment and flags.
7. Start a compile, switch programs and return. Confirm that the old response
   does not appear as the current program's result. Repeat across a session
   change.

Record the deployed commit, environment, operator, time, package hash and
observed results before marking this checklist witnessed. Actual agency
schemas, sourced grammar compatibility, agency acceptance and the remaining
MR-10 stages are separate open prerequisites.

# W3 / D4 — exact history-scan finding dispositions

Base: `6a54db14cc6a41727c5f46103afbab2ac9609047`, only `concept2cure-v2`.
The pinned full-history CI secret scan fails. Its redacted, nonverbose log
provides a count but no filenames or fingerprints. This workstream diagnoses
that existing failure without weakening credential rules or reclassifying live
history credentials.

Before editing, preserve the failed exact-source CI verdict. Read the pinned
v8.28.0 default rules and unchanged repository extensions, trace newly added
canonical history content, and independently verify every prospective checksum
finding against the source bytes it represents. The local Python rule trace is
a diagnostic, not an exact gitleaks execution or full-history qualification.
If verified matches are checksums, record only their original commit, path,
rule and line fingerprints with the checksum reason. Preserve every prior
disposition, live credential status, scanner pin/config/command and production
blob. Any finding that cannot be verified stays open.

Run the existing secret-scan contract, unchanged working-tree scanner and scope
checks, normal commit checks and applicable pre-push checks. Publish a bounded,
reviewable correction and read its exact-source full-history remote verdict.
Do not call the full-history gate green based on local rule tracing. No full
local compiler on the 8-GiB host.

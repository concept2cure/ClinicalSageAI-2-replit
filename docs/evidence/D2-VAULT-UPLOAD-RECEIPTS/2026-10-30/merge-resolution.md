# Canonical overlap resolution

The unpushed local candidate f76b0d4a1 overlapped canonical 1ce6adc681c984f1669715d37fda774f11203059. All seven content conflicts were resolved by comparing both implementations and converging on the already canonical parser, explicit fixture helper and repaired/unchanged flags. The private parser and duplicate singular hook suite were removed. Exact compared source is retained in overlap-source-diff.txt.

The only production difference from 1ce6 is the independently reviewed stored-title mapping/copy in useVaultUpload.ts and corrected repaired-record comment. Parser, staging, transport, shared fake, server, native test and CSR source remain canonical. Two existing missing-ID controls now omit only identity; actual Vault additionally proves no refresh. The plural owner retains all canonical controls and consolidates unique raw-JSON, compatibility, batch and check-in proof. Five actual Vault and three actual device caller controls are retained.

The converged red run reproduces four title errors with 78 passes in three suites. The first green state passes 311 tests in 27 suites and a complete production build. Explicit lint found one new max-lines-per-function warning in a test describe wrapper; an approved wrapper-only split retains every assertion, fixture, body and all74cases. That first green input hash is historical; final qualification pins the split suite. No lint baseline or suppression changes.

While closing this merge, origin advanced disjointly to 0ad3a15ce with project-initiation access to existing study/protocol services. That incoming work must be retained and its affected tests/build included before normal direct publication. No force push, alternate branch or PR is used.

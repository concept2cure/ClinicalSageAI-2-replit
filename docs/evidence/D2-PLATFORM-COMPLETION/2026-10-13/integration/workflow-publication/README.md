# Reconciled workflow publication checks

The canonical branch remains `concept2cure-v2`. Local merge `fa5597ffb` retained
Claude's incoming shared conversation interface, saved analytics context and
source-intake improvements alongside the governed workflow bridge. This folder
records checks for the subsequent formatting and readability correction.

The final frontend and server build passed with Node 22. The source digests
identify the exact working-tree code used by that build; the base HEAD is not
presented as containing those then-uncommitted changes. The retained build log
includes the existing frontend chunk-size notice.

Staging caught and removed one terminal blank line in the new formatting
helper. The final server build and unchanged 16-case native file were then
rerun successfully against those exact source bytes. `final-source-digests.json`
records them; the earlier build and native checkpoints are retained separately.

The [formatting evidence](../../workflow-bridge/formatting-lineage/README.md)
separately records 83 parser/reader tests, 118 SQL/governance/import tests and
16 actual restricted-runtime PostgreSQL/API tests, with zero skips and no new
lint warnings. It preserves the original failing evidence and final source
hashes. These scoped counts do not establish numeric full-suite coverage.

Browser evidence is collected against the restarted final source, using only
synthetic retained CSR content and a QA figure in the existing interface. The
old provenance-defect fixture remains retained. The two-rule CSS repair uses
the current theme tokens and changes heading inheritance and table-header
background only.

The independently reproduced [Project/Vault access failures](../../project-vault-parent-access/native-baseline-review.md)
and [protocol finalization failures](../../protocol-finalization/README.md)
are the next implementation work. They are baseline findings, not fixes
included in this increment. CRE quote/paraphrase reanchoring also remains
explicitly outside the machine/template formatting repair. Production signing,
model qualification, scientific review and agency package/transport acceptance
are not established by these local checks.

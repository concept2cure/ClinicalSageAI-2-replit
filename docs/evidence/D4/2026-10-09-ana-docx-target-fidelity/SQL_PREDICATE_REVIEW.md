# One static disposition predicate — SQL ratchet review

The full pre-push gate initially refused the new docx-fidelity.ts file's single
template interpolation. prepush-sql-red.txt/json preserves that natural failure.

The expression is artifactDataEligibleSql('a'), the existing canonical document
disposition/recorded-lineage predicate. Its only argument is the fixed source-code
alias literal 'a', checked by the canonical alias allowlist. The expression takes
no tool input, context, saved content, identifier string or other runtime value.
Tenant, project, external artifact ID and selected version use bind parameters
$1 through $4. There is no data interpolation into SQL text.

scripts/ci/check-sql-interpolation.mjs deliberately counts every raw SQL template
expression, including safe generated fragments, and requires review before a new
count is accepted. This delivery adds exactly one explicitly reviewed baseline
entry for this static canonical predicate. This is an explicit reviewed static-
fragment exception: the gate describes fixed-identifier growth, while its footer
says the baseline only shrinks. A complete static predicate is broader than a
literal identifier; this delivery does not claim the footer permits it silently. No other baseline count changes, no
gate implementation or hook is altered, and no typecheck/lint baseline grows.
The reason is included in the commit message. An independent read-only reviewer
examined the generator and parameter binding and supported this narrow allowance. A second expression in the new
file still fails the ratchet. Existing artifact readers already use this same
predicate in counted SQL templates.

The query remains visible to the checker. It was not moved into a variable or
concatenation to exploit the scanner's documented blind spots. Duplicating the
predicate would break the one disposition projection contract. Binding a SQL
predicate as a value cannot substitute its SQL structure. This narrow review
retains canonical policy and parameter binding while making the accepted
source-generated expression explicit and auditable.

The unchanged SQL gate implementation and its RED/quiet selftest are rerun after
this reviewed entry; the final full pre-push hook is also rerun before publication.

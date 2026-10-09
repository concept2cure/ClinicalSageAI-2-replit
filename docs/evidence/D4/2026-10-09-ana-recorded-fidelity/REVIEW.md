# Recorded fidelity review — W3 / D4

Read-only scoped review found no blocker in the receipt consumer, canonical
bounded reader, HTTP forwarding or pre-write seal refusal. Production source
changes were owned by the control-tower session; the test session owned two
test files and fail-first/focused evidence. No parallel source edits, branch,
registry, writer, tool or dependency was introduced.

The consumer authenticates the immutable full result, not sentToModel. A model
summary may differ without invalidating the full recorded result; its hash may
not substitute for the selected result. Only successful unheld platform steps
and the supported fidelity-only report schema qualify for historical integrity
consumption. Forged positive source/seal flags are refused.

Record, audit-detail and text byte checks mask oversized fields in SQL before
transport. Aggregate blob accounting and text selection share one materialized
statement; this does not claim a transaction-wide snapshot for the other reads.
Every reference entry counts toward the reference budget; identical blob hashes
count once toward aggregate bytes. Limits omitted retain default read/export
compatibility. Current target content and incoming content remain unbounded by
these historical-read budgets.

Current target reuse checks tenant/project membership, the unique UUID program
anchor, exact artifact/version identity, current head/version bytes and hashes,
and canonical disposition eligibility. Historical copying fidelity does not
authorize a changed, withdrawn, removed or foreign target.

The seal branch releases its read connection and throws
SOURCE_QUALIFICATION_UNASSESSED before BEGIN and any governed write. It verifies
the matching audit payload, not audit-chain links/HMAC or scientific source
qualification. Some malformed historical shapes return generic verification
unavailable rather than a more specific integrity code; all fail closed.

Open: the absent-receipt legacy caller ok-only path remains unchanged and is not
authenticated. Actual version-bound scientific review, audit-chain qualification,
complete IND coverage and full remote CI are not supplied by this delivery.

Natural red: 32 failed / 29 passed across 61 selected tests before production
changes. Failures included ignored receipts reaching legacy writes in the
minimal database fixture (missing lineage columns), and malformed HTTP receipt
handling. This is not a claim that every red assertion independently isolated a
scientific approval bypass. Focused green: 192 passing tests across five files;
the real recorder/writer and PGlite are used, with an explicitly captured verifier
report fixture, not a new OCR/extraction run.

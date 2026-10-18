# Stored workflow copies: review and release

This closes a governed-authoring release gap in the W1 / D2 workflow bridge.
The existing source importer, editor, assignments, signing ceremony and export
renderer remain canonical. No import inherits a source signature or approval.

`workflow-import-governance.ts` reads the immutable CREATE receipt, then calls
`verifySavedWorkflowImport` to recheck current actor access to source and target
and the exact retained structured-record fingerprint. Mutable displayed
provenance cannot replace that receipt or relabel known generated content.
Current source facts, not a client model name or annotation, determine original
authorship. Every controlled freeze, AUTHOR/APPROVER signature, final workflow
approval, export, Vault filing and coauthor filing copy uses this decision.

The current full-document review requires all of the following:

- A different reviewer from the copy's creator, with a current approved assigned
  `authoring_reviews` row, an actual request and a recorded review time.
- The reviewer explicitly checks adoption in the existing REVIEWER signing
  ceremony. `adoptWorkflowSource:true` cannot be used with another meaning.
- The same transaction stores the real electronic signature and server-computed
  adoption receipt in the existing signature-linked authoring and chained audit
  records. No separate adoption table or alternate signing path exists.
- The current canonical section-content digest, full visible document snapshot
  digest, source fingerprint, assignment identity, reviewer identity and
  recomputable signature digest still match. The full snapshot includes document
  and section titles, section identity/order and relevant document metadata.
  Reopened reviews and changed text or titles require a new review and signature.

Unknown/template original authorship remains disclosed after human adoption;
adoption is the current reviewer's assertion, not proof of original human
creation or model qualification. Positively generated source content with no
retained qualified generation evidence remains on release hold even after a
reviewer signs. A model name alone supplies no qualification. A REVIEWER act may
stand while that hold remains, but it cannot approve/freeze/file the copy through
a final workflow step.

The hold concerns present content. Canonical live clause lineage must both cover
the current text and have matching span hashes. The gate checks retained machine
clauses across every current section, so moving prose into another section does
not make it human text. It uses the exact canonical workflow conversion and text
comparison, with a conservative additional retention comparison that ignores
prose separator punctuation/reflow while retaining scientific operators,
numeric decimal/group separators and ranges. This is a literal retention guard,
not certification that rewritten scientific claims are independently supported.
A genuine governed human replacement removes the positive machine-content hold;
the new full document still needs a fresh assigned review and explicit adoption.
Historical origin remains in the receipt and revision ledger.

The existing internal `workingCopy` renderer option remains distinct. It allows
an uncontrolled review download after exact current source/access and all lineage
checks, while carrying `DRAFT — uncontrolled copy`, `NOT FINAL`, qualification
not established, source identity/fingerprint and any remaining machine release
hold. It emits no signature manifestation and creates no controlled export
baseline. Client options or a notice string cannot select this trusted mode.
Vault filing and coauthor placement remain controlled boundaries.

Signing transactions lock the parent document before reading sections, hashes,
review adoption and unresolved-work census. Structured source composition uses a
coherent REPEATABLE READ snapshot; current source changes invalidate subsequent
controlled operations. Canonical section writers reserve the parent, recheck its
sealed status and change its MVCC version before taking child locks/writing.
This covers create, PATCH, revert, AI accept, template application and reorder;
new-document genesis is inside the document's initial uncommitted transaction.
There is no standalone section-deletion capability. Reorder rechecks the full
current section permutation under that reservation. A waiting signer that sees a
concurrent parent version change returns named 409
`DOCUMENT_CHANGED_DURING_GOVERNANCE`; it does not silently consume credentials
again or seal a prior section set.

Verification includes actual native runtime-role/RLS HTTP signing and FIFO lock
races, plus PGlite SQL joins and canonical lineage. Evidence lives in
`docs/evidence/D2-PLATFORM-COMPLETION/2026-10-13/workflow-bridge/`. A real red case
showed that punctuation-only edits could clear a positive machine hold; its
regression now remains held. This evidence qualifies these implementation
controls locally. It does not certify production signing secrets, models,
scientific claims, licensed regulatory validators or agency gateways.

# QMS remediation contract — F01 / F02, 2026-10-14

Workstream W3/W4; launch rows D2/D5. Scope: controlled-document content and current-version training. No parallel editor or document content store.

## Canonical content

- A controlled document remains an organization-level register entry. Its editing copy is an explicitly selected, organization-owned program's canonical `authoring_documents` record, linked by `qms_documents.authoring_document_id`.
- QMS creation uses the existing Authoring transaction, section revisions, audit trail and ownership grant. Canonical fresh membership, the unique program/project anchor, and project sharing are checked on that enlisted connection; creator OWNER/AUTHOR grants must persist before commit. The selected QMS template seeds real `authoring_sections`; section text is edited and saved by the existing `DocumentWorkbench`, with its reason, permissions and revision trail.
- New/template/Open controls execute create/open against the actual bound document. The Quality client embeds the canonical workbench; there is no second text editor.
- QMS review/approval require a same-tenant binding with authored text. Approval captures the canonical document and sections under lock, checks the verified signer's current project and canonical object approval permission, binds that content to the existing Part 11 signature digest, and stores an immutable version snapshot. A registry-only entry cannot become effective.
- Draft is the only editable QMS content state. In-review/effective/retired content is read-only; canonical mutation guards and database enforcement preserve this across HTTP, AnA and direct writers. Revision creates a new canonical editing copy, retaining the prior signed record and its immutable snapshot.
- Legacy drafts may be bound explicitly to an owned program before authoring. Older registry-only controlled records require an explicit authored major revision: their exact prior registry row is retained as an immutable `legacy-registry` record, sections remain empty and no authored document or signature is fabricated. The new revision uses a blank real template and requires saved text before review. Existing signed records are never silently assigned invented content or rewritten.

## Integration contract

- QMS owns the binding/lifecycle helper and migration. Authoring owns narrow integration of `qmsAuthoringWriteRefusal(db, tenantId, docId)` in its existing mutation gate. The helper returns `null` or `{status, code, error}`; a controlled version returns 409 `QMS_DOCUMENT_CONTROLLED` and unavailable governance returns 503.
- Root integrates the additive migration into `C2C_MIGRATION_FILES` before the tenant sweeps and routes AnA QMS creation/revision through the same QMS service.
- F02 exports one reusable training-compliance query. Its numerator uses a nonexpired acknowledgment of the effective document's exact version by a current organization member; its denominator uses the same current distinct member roster. Historical acknowledgments remain untouched.

## Verification

Regressions must fail before implementation and pass after: template creation reaches saved canonical sections; open/edit uses the existing workbench; blank/unbound/foreign content cannot approve; approval snapshot and old editing copies remain immutable through revision; old-version training does not satisfy the current revision. Scoped unit/component and PGlite tests cover contracts and persistence. Production agency delivery is outside this workstream.

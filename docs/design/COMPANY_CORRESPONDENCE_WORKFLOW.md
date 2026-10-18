# Filing correspondence and exact legal-version handoffs

Company correspondence now starts in Submission Center from an admitted sequence.
Both the Word download and Authoring draft accept that sequence ID, derive its
program, submission, application, market and recipient agency on the server, and
recheck them before delivery or inside the canonical Authoring create transaction.
Missing applicant/application facts remain visibly missing; a brand name never
substitutes for the applicant of record.

The draft action uses `createDocumentFromDraft`, including its atomic genesis
revision, provenance and audit writes. It creates an unbound M1 working document;
it does not write a filing section or approve content. The existing editor,
review/signature workflow, controlled export and file-to-Vault service remain the
path to a reviewed filing artifact. The Vault handoff receipt carries the same
filing, company revision and optional variant reference alongside the exact Vault
version and delivered artifact hash.

The correspondence origin is server-only. Public Authoring provenance parsing
drops caller assertions of `companyCorrespondence`. The origin references an
immutable company presentation revision rather than copying legal inventory or
logo bytes into audit metadata. A named published variant must be explicitly
selected and match the actual filing context. An explicit selection applies only
to that output, independently of the automatic organization preference. Variants
with unknown required language or subsidiary facts are not selectable.

Historical Authoring exports resolve the retained revision and variant, verify
its presentation hash and use the existing DOCX factory's page furniture around
the rich Authoring body. Citations, tracked changes, reference lists and mandatory
signature statements keep their canonical behavior. Branded PDFs convert this
same DOCX through the existing strict LibreOffice backend; a missing converter
fails rather than producing an unbranded plain-text rendition. Working copies
retain their uncontrolled-copy banner and do not manifest signatures.

Admin's unsaved proof endpoint validates the same identity and raster letterhead
input, requires current brand-management rights and renders with the existing
Word renderer. The artifact visibly says it is an unsaved preview. Its download
audit records a preview hash without claiming a saved profile revision, and it
does not activate or save settings.

Communication Center and its shared project inbox can append exact company
legal-version references to existing agency events and submission handoffs.
Each append admits the source project, checks its registered Vault version and
hash, and commits the immutable snapshot with its chained audit record in one
transaction. Existing references cannot be rewritten through this action, and
generic handoff metadata refuses reserved legal-reference fields. Repeating the
same version/outcome is idempotent. An acknowledged, questioned or rejected
agency notice is a recorded outcome; it never mutates Vault approval or revokes
legal authority. Revocation remains the separate legal-lifecycle action.

Submission Center also shows the company/filing identity comparison and reviewed
role differences, plus the canonical company legal-readiness widget. These are
separate from draft creation and agency acceptance.

Verification includes real canonical Authoring/PGlite creation and filing audit
tests, rollback tests for communication links, parsed actual Word artifacts and
the actual five-page LibreOffice PDF proof in
`docs/evidence/COMPANY-DOCUMENTS/gap-closure/correspondence/verification.json`.
Reproduce that synthetic artifact with `npx tsx scripts/verify-company-correspondence.ts`
under Node 22 with a configured `LIBREOFFICE_BIN`. The proof checks historical
text, page geometry, embedded image streams and mandatory signature wording after
an unrelated current-brand change. After structural converter normalization the
final fixture also produced identical repeated PDF bytes; each delivered file's
own hash is still recorded, without claiming cross-deployment byte identity.
This evidence does not claim cryptographic signatures, real agency
acceptance, live transmission or PDF/UA accessibility certification.

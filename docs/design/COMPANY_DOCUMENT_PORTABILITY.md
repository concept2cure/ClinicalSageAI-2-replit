# Company document customer return and disposal

Company identity, letterhead, embedded logo and legal registry metadata are
customer data. Both existing tenant exporters carry a `companyDocuments`
envelope alongside their existing organization header and resource payload.
Only `organizations.settings.companyDocuments` and known canonical company
tables are selected; adjacent settings, API keys and connector credentials never
enter this envelope. Both exporters include retained presentation revisions,
delegated grants, filing identity reviews, named designs and the canonical legal
registry. Named designs also return their referenced canonical template rows,
scoped to the same organization, so the actual style and logo are portable.
Unrelated templates remain outside the curated company envelope.

The envelope contains `schemaVersion: 1`, `organizationId`, `present`,
`profilePresent`, `data`, `tables` and `sha256`. Its SHA-256 covers every field
except the hash itself. Keys and canonical table rows are sorted deterministically;
array order within a metadata record is preserved. `present` means a profile key
or any company row exists. An absent section is explicit (`profilePresent: false`,
`data: null`); a stored null is distinct (`profilePresent: true`). The exact stored subsection is
returned without inventing defaults or discarding new governed metadata.
Legal original file bytes continue through the existing Vault storage and
export mechanisms; this metadata envelope does not rewrite or embed them.

The full-export payload digest includes the envelope. Its coverage report
contains only the envelope version, presence and hash. The existing receipt
writer persists the version and hash in nullable columns added by
`20261018_company_document_export_receipts.sql`. An invalid descriptor or any
existing table-read/truncation gap cannot receive a usable receipt. A receipt
write failure remains visible while the customer can still receive their export.
No private preimage is copied into export or purge audit details.

Complete tenant data return requires a current active owner/admin membership,
an active user and an active or pending-deletion organization. The role is
read from the database before resource reads and again before delivery or
recording a full-export receipt. The routes use one checked-out repeatable-read
transaction and a shared organization row lock for the complete snapshot. Every
canonical company writer takes that organization lock before changing metadata.
Export and purge set the time zone to UTC only inside their transaction, keeping
database timestamp microseconds and identical envelope hashes across session zones.
Token role claims cannot grant this authority.
The existing audit-attestation permission is unchanged. This explicit
tenant-wide data-return authority differs from ordinary project-filtered
company-library reads.

An eligible purge retains all existing retention and legal-hold checks. On
its transaction connection, under the organization row lock, it re-reads the
current company envelope and holds the selected export receipt. Present company
data requires a matching version-1 envelope hash; a legacy receipt is acceptable
only when both the profile and company rows are absent. A changed or unbound section or company row refuses
before any child deletion. The status update removes only `companyDocuments`
from settings, and its affected row is confirmed for present company data.
Presentation snapshots, grants, filing identity reviews and the legal registry
use the canonical child-table purge. Named designs and only their referenced
tenant-owned template rows are disposed in one statement, preserving foreign-key
guards and unrelated templates. The same chained audit row records safe metadata disposition
(`erased` or `absent`, envelope version and hash). A failure rolls back metadata,
child deletion and status together. Other organization settings and other tenants
are preserved; held source files retain their existing Vault protections.

Verification uses real PGlite catalog queries, both actual organization
projections, receipt migrations and transactional purge/audit paths. It covers
the old export omission, legacy/stale receipt refusal, explicit null, safe audit
contents, hold refusal, rollback, tenant isolation, current authority and the
pending-deletion export window. Removing each export, receipt or erasure control
independently makes its focused regression fail without modifying source files.

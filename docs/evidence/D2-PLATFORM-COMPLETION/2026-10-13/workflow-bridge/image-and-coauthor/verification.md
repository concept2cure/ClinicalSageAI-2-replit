# W1 / D2 figure associations and coauthor source access

The final focused runs passed 183 tests in 12 source, figure, export and
spreadsheet files, and 83 tests in five coauthor snapshot files. These are
separate runs with distinct test files; broader workflow evidence may include
the same cases and should not be added to these totals.

The figure service's 21 PGlite cases execute the real document/program and
project/object permission decisions, canonical upload/source capture and audit
inserts. They check revocation before transaction writes, final audit failure
rollback and compensation, source-selection and renderer admission, retained
original-uploader insertion/chain proof, missing/tampered proof, historical
private source parents, and repair through the existing upload service. Disk
I/O is an explicit seam. These cases do not qualify production RLS, signing
secrets, live storage or concurrent native PostgreSQL behavior.

The coauthor boundary now calls `verifySavedDraftSourceReferences` on the
placement transaction, after locking the parent and before assembling saved
prose. It passes the current authenticated `actor.userId`, rather than the
source creator or a client role. The same helper continues to enforce exact
source identity, hash, disposition and current project access.

The retained red run reproduced four unauthorized successful HTTP 201 filing
copies: an unrelated private-project member, a revoked member, removed
organization membership, and a changed original source version. The corrected
cases return 409 `SOURCE_REFERENCES_UNAVAILABLE` before body assembly and leave
no copy or alias. A current assigned member still succeeds. A sixth case proves
that retaking an existing copy after revocation neither returns its document nor
changes its stored text or audit trail.

Three legacy coauthor fixtures now apply the real immutable authoring audit
migration required by the workflow genesis read. The real-freeze fixture also
supplies the existing users table for its signer-name lookup; its absence had
aborted the signing transaction. No production check was relaxed.

Scoped ESLint passed with zero errors and three existing warnings: the JPEG
header parser's complexity and the pre-existing long coauthor test file and
describe block. This change adds zero warnings and changes no baseline.

Logs: `source-and-image-final.txt`, `coauthor-final.txt`,
`coauthor-private-source-red.txt`, `scoped-lint.txt`, and
`coauthor-lint-before.txt`.

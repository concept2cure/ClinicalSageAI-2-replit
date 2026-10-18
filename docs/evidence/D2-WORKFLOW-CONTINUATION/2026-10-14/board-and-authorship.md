# Authoring authorship and Review board evidence

Local checks against the approved human-review binding contract. PGlite runs
the canonical Authoring migrations; external identity/project tables carry the
current-member and sharing columns read by the existing admission services.
These checks do not claim production validation or regulatory qualification.

The unchanged board leaked a same-tenant private title, section excerpt and
reviewer comment to an actor denied full-document access. The new board test
captured 17 failures and 2 passes (9 content-standing cases were excluded from
that initial ACL-only run). `board-access-red.txt` records that actual baseline.
`board-access-green.txt` records all 30 PostgreSQL cases plus the 8 existing
single-store/read-only source guards passing after repair.

The board now obtains identity-only admission through the canonical current
member, project sharing and full-document ACL services before selecting private
labels, prose, counts, verdict reasons or threads. A section-only grant never
substitutes for full-document access. The unfiltered board explicitly retains
organization-wide documents with full-document ACL; a program-filtered board
does not include those records. Current database email drives ownership flags,
and membership, sharing, ACL or email changes during assembly refuse the result.
An unavailable selected document never silently substitutes another thread.

The saved-content cases exercise second-section prose, document title, section
title, version and order changes, preserving the earlier snapshot and decision
reason while projecting stale standing. Legacy approval without binding remains
unbound open work. A current nonempty approval is current peer-review completion;
an assigned stale/unbound verdict remains reachable as personal review work.
A departed reviewer's verified unchanged verdict remains a historical fact.
The board does not sign or change the existing final signature workflow.

`sod-authoring-red.txt` records 33 failures and 7 passes before adding the
Authoring target to the canonical authorship resolver. After repair,
`sod-authoring-green.txt` records 40 passes and `sod-existing-targets-green.txt`
records all 32 existing target tests passing. Protected actors are the recorded
document creator and every tenant/parent-matched immutable revision actor, even
after departure. Permission grants and machine contributor metadata are not
authorship. Missing or malformed attribution does not imply independence;
database failure does not become an empty allowlist. The revision ledger has
engine immutability controls; these checks do not assert an equivalent database
immutability trigger on the document's `created_by` column.

An independent HTTP audit then reproduced a remaining title-only editor able
to approve their own saved heading, because metadata writes do not create prose
revisions. The amended resolver also retains actors from the existing immutable
audit trail: section CREATE, section-metadata RENAME with actual title/code
`from`/`to` changes, and REORDER_SECTIONS. It does not join current sections, so
removed-section history remains protected. Comments, grants, reviews,
signatures, track-mode changes, wrong-source records and valid noops are excluded.
Missing or malformed relevant heading facts refuse independence.

`sod-authoring-structure-red.txt` records 21 failures and 14 passing exclusion
controls before that extension. `sod-authoring-structure-malformed-red.txt`
records all 16 malformed-heading controls failing before the extension.
`sod-authoring-structure-green.txt` records all 94 Authoring cases (40 original,
54 added) and all 32 other-target cases passing after it. These cases use the
actual canonical audit-trail migration and its engine UPDATE, DELETE and
TRUNCATE refusal guards. No new author store or content writer was introduced.

The additive canonical read-scope change also passed all 45 existing Source
Tracer/citation tests (`board-read-scope-existing-consumers.txt`). Targeted ESLint
on the owned production source and direct PostgreSQL test passed with zero
errors or warnings. The legacy board-route journey is separately modernized to
real integer identities, current membership, project admission, legitimate
document grants and the native bound-review wire contract; its evidence is
recorded separately so old UUID fixture behavior is not mistaken for production
authority.

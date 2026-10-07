# W2 / D4 — current-version project evidence retrieval

The preceding source-integrity commit
`c120d9dcf88a4289009f02eb6b7dd9380a71373f` passed full GitHub TypeScript and
ESLint in Validate & Audit run 37573443636. Its focused local regression was
381 tests across 19 files; broader release jobs are tracked separately.

## Defect and canonical correction

The assistant's shared Vault search already requests current versions only
from text search. Its semantic catalog arm still admitted correctly hashed,
cataloged predecessors. That could reintroduce old comprehension and figures
after the text arm excluded the source as superseded. Catalog hash equality
alone cannot detect this: each row-per-version correctly retains its own hash.

Both semantic count and hit queries now use `NOT supersededSql('d')` from the
existing Vault version-family implementation. A successor must match program,
organization and document code and must be live; an invalid legacy pointer
must not hide another family's source. Current uncataloged/unembedded
successors remain counted as unsearchable, not replaced by old searchable
predecessors. Existing source-hash, tenant, project and disposition guards stay
in place. Provider or database errors do not become empty-corpus claims.

No new schema, dependency, model, integration, authoring store or tool. Named
version reads, Vault version history and explicit historical source references
are unchanged; a historical source reference is still unassessed, not promoted
to current scientific evidence. Approval, audit and signature gates remain.

## Verification boundary

The query-contract regression was seen failing before the production fix on
the missing canonical version predicate. The actual SQL regression also ran
red first: five failures and seven controls passing. A separate in-memory PostgreSQL
regression executes the actual family, tenant, project, hash and disposition
filtering SQL. Installed PGlite has no pgvector extension: only vector scoring
is replaced deterministically in that test. It does not validate embeddings,
ranking, retrieval quality or scientific qualification.

After correction, all 12 database cases passed, including actual named
historical reads for the owning organization and refusal for another. The
combined regression passed **415 tests in 24 files**: catalog/version retrieval,
no-key assistant search, source-grounded drafting, durable source references,
project scopes, region/template preparation and governed authoring. Server
build, canvas-path gate, changed-file ESLint and whitespace checks passed.
Ultra read-only review found no concrete blocker and verified the scoring seam
does not alter eligibility predicates or parameter mappings.

Full application TypeScript is checked on GitHub after direct publication;
the prior source commit's green result is not substituted for this revision.
This change does not establish agency filing readiness or close the full D4
launch row.

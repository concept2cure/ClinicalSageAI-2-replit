# Stable Vault source paging

W1 / D2, existing editor source access on `concept2cure-v2`. The canonical
`server/services/vault/vault-search.ts` query now ends its ordering with `d.id`
after rank and creation time. Both project and organization-wide search still
use that same query; its filtering and ranking are unchanged.

## Failing reproduction

`server/services/vault/__tests__/vault-search-paging.pglite.integration.test.ts`
executes the real query against PGlite with the canonical
`20260906_vault_documents_fulltext.sql` search-vector function/index and
`20261006_document_data_dispositions.sql` eligibility store. It reuses the
existing Vault fixture schema rather than replacing query predicates.

The fixture inserts matching documents in reverse ID order. Their search
vectors, ranks and creation timestamps are identical. It reads offset zero,
then physically clusters the table by reverse ID before reading offset 25.
Before the production fix, those pages contained only **31 unique sources out
of 32 matching current documents**. One repeated source displaced another.
Both new cases failed in `/workspace/scratch/vault-paging-order-before.log`.

## Passing checks

With the unique final sort key, the same physical reorder yields every current
source exactly once, in the same order across repeated reads. The suite also
checks project scope, organization-wide scope, a foreign tenant, deleted
documents, current-version exclusion and explicit historical-version inclusion
in the real counts and pages.

The new semantic suite and the existing canonical search/route tenant tests
pass **11 tests in three files**, recorded in
`/workspace/scratch/vault-paging-order-final.log`. Changed production/test files
pass ESLint with zero warnings; `git diff --check` is clean. No migration,
dependency, provider call or alternate source/editor implementation was added.

This proves real full-text ordering and the query's scope predicates on
in-process PostgreSQL. It does not establish production-role RLS or provide a
snapshot across concurrent changes to document eligibility; the existing UI
handles incomplete or changing search reads separately.

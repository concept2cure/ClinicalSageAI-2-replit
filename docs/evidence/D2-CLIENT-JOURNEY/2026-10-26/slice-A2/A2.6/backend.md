# Existing dossier read enrichment

## What already exists

`server/services/c2c/dossier-read.ts` already reads every governed section
through `DOSSIER_SECTIONS_SQL`, with `d.org_id = $2`, and marks each using
the existing readiness trigger's counted-section rule. It groups home
filings, added-market regional sections and filing-document classes. This
change extends those same groups and does not introduce a second reader.
`shared/regulatory/section-code.ts` already owns regulatory ordering.

## Change

Each `DossierRow` now returns required `sections: { key, label, status }[]`
containing exactly the sections its existing counts include. Empty headings
stay excluded; a heading in review remains counted. Stored keys and statuses
are preserved. Labels come from the stored section, with the key as the
fallback for a null or blank label. Bodies are not exposed.

Module rows and their sections use `compareSectionCode`. CTD keys are
normalized only while comparing section order so a counted `M1` precedes
`1.1`; response keys retain their original spelling. CTD quality sections
follow S, P, A, R, and numeric sections use numeric order.

No query, readiness calculation, schema, dependency, route, organisation
guard or current-access gate was added or changed. Added-market rows retain
only their regional sections; home rows and document-class grouping remain
unchanged.

## Red then green

Command, under Node 22:

```sh
npm exec --yes --package=node@22 -- node node_modules/vitest/vitest.mjs run \
  server/routes/c2c/__tests__/projects-dossier.test.ts \
  server/services/c2c/__tests__/dossier-read.pglite.test.ts
```

- Red: **4 failed, 15 passed**, before implementation. Missing `sections`
  failed the route contract, governed section/status/order assertion,
  added-market section assertion and CSR section assertion.
- Green: **19 passed** in 2 suites, 9.46 seconds. PGlite executes real SQL
  against the existing migrations and rule packs; it is not native RLS proof.
- The route proves the same single dossier query is used and receives the
  exact project and organisation parameters. Existing denied-project 404,
  unavailable-store and failed-read 500 checks pass.
- Real SQL proves section/status provenance, active versus empty headings,
  ICH and numeric order, home/market separation, non-CTD grouping and empty
  rows for another organisation.

Compressed raw output: `backend-red.log.gz`, `backend-green.log.gz`.

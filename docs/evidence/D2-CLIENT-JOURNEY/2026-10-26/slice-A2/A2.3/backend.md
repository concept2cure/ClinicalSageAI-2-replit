# A2.3 portfolio server completion

## What already exists

`server/services/c2c/project-portfolio.ts` owns the shared GET/201 card projection
and exact accepted-anchor joins. `server/routes/c2c/projects.ts` bounds pages,
measures readiness only for returned programs and rechecks current access before
answering. The current-access service freezes accepted program/project/client
relationships. This change extends those paths; it adds no schema or parallel
portfolio store.

## Resulting contract

- Both GET and creation's 201 card gain the shared classifier's `pathway`.
- `ws` accepts `MDX`, `Biotech`, `Pharma`; `pathway` accepts the closed shared
  vocabulary. Omitted or `all` removes the restriction. Empty, unknown, duplicate
  array values and wrong casing receive 400. Values stay bound in SQL.
- Client, workstream and pathway restrictions precede `LIMIT/OFFSET`.
- `meta.count` remains the number of returned rows. `meta.counts.total` and
  `filingWithin60Days` cover every admitted row matching all selected filters.
  Filing soon means a target on or after today's database date and strictly
  before day 60, matching the existing UI definition.
- `byWorkstream` covers the selected Client, independently of workstream/pathway;
  `byPathway` covers Client+workstream, independently of pathway. This leaves
  other filter choices visible. Counts include Other and unknown workstreams;
  unknown filing types remain accessible in the unfiltered portfolio.
- Aggregate SQL uses the same exact frozen anchor/client relationships as cards,
  with organization/deletion/archive restrictions. Minimal Client choices remain
  independent of selected filters. Current access is revalidated after counts
  and Client choices and before any response.
- Readiness measurement remains bounded to the returned page. No tenant-wide
  dossier calculation or report-os score is substituted.
- A count failure fails the response, including a missing-relation error after
  the page read succeeded. It cannot become an empty portfolio or a page-length
  total. The older unprovisioned-store response remains only before page success.

## Verification

The new PGlite HTTP cases first failed 17/17 against the previous route; the 15
existing Client cases passed. The initial fix passed all 32. Additional checks
cover foreign-organization data and missing-relation count failure. The affected
six-suite regression passed 137/137, including actual POST/GET card key parity,
readiness, close-out and parent privacy. The final broader Projects/parent-access regression passed 365/365
across 21 suites, including the final 34-case Client/pathway fixture.

The PGlite fixture executes real SQL and real current-access/anchor code. Dossier
figures are isolated in the Client/pathway fixture; existing readiness tests cover
the dossier enrichment separately. This is not proof of native runtime-role RLS.
The older parent-privacy fixture lacked `client_workspaces`, which A2.2's actual
join requires; its minimal fixture now includes the real dependency.

ESLint reports no errors and only the three existing large-route warnings. The
new helper and affected tests add no warning or SQL-interpolation allowance.

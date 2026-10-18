# Normal pre-push SQL gate correction

The normal direct push stopped at `ci:sql-interpolation`. Its complete original
output is retained in `normal-pre-push-red.json`, with unmodified UTF-8 bytes
and SHA-256. The six reported interpolations selected fixed lock clauses, but
still violated the repository's rule against interpolation in SQL text.

The three affected files now choose complete static query literals for locked
and unlocked variants. Bind parameters, tenant/project predicates, active-source
filters, ordering and row-lock targets remain the same. No SQL concatenation,
baseline change, guard suppression or hook bypass was introduced.

- `authoring-assembly-source.ts`: global template header `FOR SHARE OF t` and
  organization template header `FOR SHARE`.
- `authoring-assembly.ts`: target parent `FOR UPDATE OF d` and saved sections
  `FOR UPDATE`.
- `authoring-template-sections.ts`: global outline `FOR SHARE OF ts, t` and
  organization outline `FOR SHARE`.

Production/test source froze at **2026-10-17 23:26:44 UTC**. Test source and UI
did not change. The SQL gate passed, scoped lint reported zero errors/warnings
in three files, and the final combined replay passed **127 cases in ten files**.
The checks are recorded in `verification.json`. The same 26-source map
used by the earlier backend integration proof is recorded before and after
this replay in `source-pins.json`. The earlier backend pins remain historical.

The replay covers all assembly cases plus incoming canonical creation-outcome,
workflow materialization, import/adoption governance and production cold-import
checks. PGlite remains a single-connection SQL/transaction test; no live provider,
human review, deployment or native concurrent PostgreSQL proof is implied.
The root workstream owns final compiler/build and normal direct publication.

# Review of measured SQL composition

The final SQL interpolation guard remains conservative: it counts SQL syntax fragments as if they were values. No request value is admitted into SQL text by the changes below. The baseline adjustments are limited to reviewed, code-defined syntax; they do not approve new string interpolation of user input. Existing injection budgets elsewhere are unchanged.

| File | Measured count | Reviewed origin |
| --- | ---: | --- |
| `notification-service.ts` | 18 | Three private constant fragments: the audience joins, the live membership/preference predicate, and the per-person read expression. Tenant, user, notification, category, severity, unread flag and limit are bind parameters. The former variable-length filter/placeholder construction was removed. |
| `retrieval-source-link.ts` | 5 | Canonical disposition/recorded-lineage and supersession predicates called with literal aliases `cre_evidence_sources`, `d`, and `s`. The canonical helper validates SQL aliases and chooses fixed columns/choices; program, tenant, source and document identities are bind parameters. Existing source disposition semantics were preserved. |
| `register-link-recovery.ts` | 4 | Table and tenant-column identifiers come exclusively from the fixed `REGISTER_LINK_DEFINITIONS`. Its outer object and every entry are runtime-frozen. `hasOwnProperty` refuses unknown/prototype names; record, tenant and program values are bound. No request can supply a table or column name. |

These bounded syntax exceptions use the guard's documented allowlist review mechanism. Whole-file budgets still reject an additional measured interpolation. The actual PostgreSQL-compatible tests cover foreign-tenant sources/notifications, revoked and withdrawn source eligibility, current recipient audiences, category/severity injection strings, bound limits, unknown register names and persisted link recovery. See `sql-safe-fragments-focused.txt` for the final run.

Other changes removed interpolation instead of adding exceptions: GraphRAG health chooses complete literal statements; Protocol list filters and optional insert/locking paths now use fixed predicates/literal statement branches. The protocol-service budget decreased from 1 to 0 and the QMS route budget from 11 to 8. No SQL was moved into an unscanned variable to evade the guard.

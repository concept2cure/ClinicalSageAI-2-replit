# The runtime role deletes a review comment past its guard, from a trigger of its own (row D5)

**Found by:** `…01DiJJAk`, 2026-10-01, while building the Vault relationships table, which avoids the same
pattern. **Not fixed here:** the file is inside its lane's window (`…01T2wooC`, `5d91058ae`). It is handed
on through `docs/work-orders/README.md`.

## The finding

`migrations/20261001_review_comments_record.sql` makes a review comment undeletable on its own. Its
guard, `c2c_review_comment_record_guard`, refuses a DELETE unless `pg_trigger_depth() > 1`. That
exception is there to admit the cascade from the comment's thread, artifact or project.

Trigger depth is not something only a cascade can raise. The runtime role `app_service` can create a
temporary table, a `pg_temp` function, and a trigger on that table. A statement issued from inside that
trigger runs the comment's guard at depth 2, so the guard admits it.

## The proof

`probe-sql.txt` was run as the owner on the DB-test database, inside one transaction that it rolls back,
so nothing is left behind. It creates one organisation, project, artifact, thread and comment, then
switches to `app_service`. `output.txt` shows the result:

| Step | Result |
|---|---|
| The comment exists | 1 |
| A direct DELETE as `app_service` | refused: `IMMUTABILITY_VIOLATION` |
| The same DELETE issued from a temporary trigger `app_service` created | admitted; 0 comments remain |

The attacker needs SQL execution as the runtime role, through an injection or a compromised task. That
is exactly the case a database-level record guard exists for.

## The fix, for the owning lane

A foreign key's ON DELETE CASCADE runs its DELETE as the owner of the referencing table (PostgreSQL's
RI triggers switch to the table owner). So the guard can admit the cascade by checking
`current_user = <the table's owner>` instead of the trigger depth. A session cannot set that.
`migrations/20261001_vault_document_relationships.sql` does this. Its DB test shows the tenant purge's
cascade still removing rows while a runtime-role DELETE is refused.

Independently, `REVOKE TEMPORARY ON DATABASE … FROM PUBLIC` (with the runtime role then granted only
what it needs) would remove this way of raising trigger depth for every guard. That belongs to the
P0-8 grants lane.

No other migration or server file uses `pg_trigger_depth()` as an exception.

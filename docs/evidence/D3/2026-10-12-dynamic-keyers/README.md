# unkeyed-request-tables 105 → 101: a blind spot closed instead of annotated

**Row** D3 (tenant isolation). **Date** 2026-10-12.
**Follows** `docs/evidence/D3/2026-10-12-unkeyed-table-classification/`, which
classified all 105 entries, and
`docs/evidence/D3/2026-10-12-citation-chains-tenant-key/`.

## What the baseline was saying

Four entries read, in substance, "this table is NOT unkeyed; the gate just
can't see the column":

```
knowledge_graph_nodes        "exempt — NOT UNKEYED. Carries organization_id live and is policied
                              … Listed here because the gate reads the CREATE and not the later
                              ALTER that adds the column."
knowledge_graph_edges        (same, with the live verification)
lumen_knowledge_graph_edges  (same)
citation_chains              (added earlier today, same shape)
```

The fact was right. The cause was imprecise, and the imprecision mattered: the
gate **does** read a later static `ALTER … ADD COLUMN`, and has a self-test case
for exactly that ("keyed by a later ALTER, second of several ADD COLUMNs"). What
it cannot read is a **dynamic** `EXECUTE format(…)` inside a PL/pgSQL block —
which is what `db/migrations/20260813_knowledge_graph_tenant_keys.sql` uses,
looping a literal four-name array.

And the gate already has the mechanism for that case: `DYNAMIC_KEYERS`, with one
entry in it (the `stab_%` sweep). So the right answer was never a standing note.
A baseline that overstates the debt by four hides the next real entry — the same
parity rule the gate's own stale-entry check enforces.

## What changed

Two entries added to `DYNAMIC_KEYERS`, both matching on a literal **name set**
rather than a pattern, which is stricter than the existing `/^stab_/` entry: a
new table cannot drift into an exemption by being named like an old one.

```
db/migrations/20260813_knowledge_graph_tenant_keys.sql
  → organization_id on knowledge_graph_nodes, knowledge_graph_edges,
    lumen_knowledge_graph_edges, citation_chains

migrations/20260724_lumen_council_provisioning.sql
  → organization_id on lumen.{council_sessions, agent_executions, data_verifications}
```

The second removes no baseline entry — no per-request path reads those three
today. It is there so a future reader does not get a false one.

Surveyed first, so this is the complete set rather than the ones I happened to
notice: of the five non-archived migrations that add a column through
`EXECUTE format(… ADD COLUMN …)`, one was already modelled
(`20260728_stability_tenant_isolation.sql`), one is a duplicate of it
(`20260728_stability_backing_tables.sql`, same `stab_*` set), one adds only
timestamps (`20260828_align_written_columns_with_migrations.sql`), and these two
were unmodelled.

## The exemption is now self-policing

An exemption rests on a file this gate never executes. Delete, archive or
rewrite that file and the exemption becomes a silent hole: tables excused
forever by a sweep that no longer exists.

The list's header has claimed since it was introduced that "the self-test
asserts the file still contains it". **It did not.** The self-test has four
cases and none of them touches `DYNAMIC_KEYERS`. A standing claim with no check
behind it is exactly how four tables could have sat in that baseline forever.

So each entry now carries the exact `verify` string its file must contain, and
a loop checks all of them **on every run of the real gate** — stronger than a
self-test assertion, which only runs when someone invokes it. The header
sentence was corrected by writing the check, not by rewording the claim.

## Verify by making the check fail

All three arms, each restored afterwards:

### The cited ADD COLUMN is renamed

```
$ sed -i "s/ADD COLUMN organization_id INTEGER/ADD COLUMN org_identifier INTEGER/" \
    db/migrations/20260813_knowledge_graph_tenant_keys.sql
$ npm run ci:unkeyed-request-tables

[ci:unkeyed-request-tables] a dynamic-keyer exemption is no longer true:
      db/migrations/20260813_knowledge_graph_tenant_keys.sql
      the file no longer contains "ADD COLUMN organization_id INTEGER"
  … Either restore the sweep, or remove the DYNAMIC_KEYERS entry and let the
  affected tables be reported again (and classified in the baseline).
exit=1
```

### The cited file does not exist

```
[ci:unkeyed-request-tables] a dynamic-keyer exemption is no longer true:
      db/migrations/_legacy/20260724_lumen_council_provisioning.sql
      the file does not exist
exit=1
```

### The cited file is archived

Pointed at a file that really is in `_legacy/`, citing a string it really
contains, so only the archived arm can fire:

```
[ci:unkeyed-request-tables] a dynamic-keyer exemption is no longer true:
      db/migrations/_legacy/003_gcc_prose_versioning.sql
      the file is archived, so no applier runs it
exit=1
```

### And the first attempt at all this proved nothing

Worth recording because it is the second time today. The probe was run before
the verification loop was actually in the file — an earlier patch had aborted on
an assertion, so the `verify` fields existed and nothing read them. The gate
passed the renamed-column probe with `exit=0`. A check that has only been seen
to pass has not been tested; a check that has only been seen to *not fail* has
not been written.

## Where it leaves the gate

```
[ci:unkeyed-request-tables] 1082 tables created; 594 read by a per-request path;
                            101 of those carry NO tenant column; 101 baselined, 0 still unreviewed
                            ✅ no new tables read without a tenant key.
ci:unkeyed-request-tables:unreviewed  ✅  0 unreviewed
ci:unkeyed-request-tables:strict      ❌  101 (was 105)
ci:unkeyed-request-tables:selftest    ✅  4/4
```

`:strict` is one of the eight zero-baseline nightly gates and still fails, as it
is meant to until each of the 101 is keyed or retired. The number it fails with
is now the true one.

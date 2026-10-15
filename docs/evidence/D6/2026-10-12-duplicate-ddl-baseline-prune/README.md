# duplicate-table-ddl: 15 → 13, and the regeneration that would have eaten the reasons

**Row** D6 (gate governance). **Date** 2026-10-12.

## Two things, one cause

`npm run ci:duplicate-table-ddl` was reporting a mismatch and nobody had read
it as one:

```
scanned 646 non-archived .sql files; 1389 distinct tables;
13 defined more than once; 15 baselined
```

Thirteen real collisions, fifteen baselined. Two entries were stale, so the
gate carried two tables' worth of slack a new collision could have hidden in.

The stale pair is `risk_controls` and `risk_items`. They stopped colliding
because their rival file, `migrations/20260609_design_risk.sql`, no longer
exists: commit `153481465` — *"Delete /api/design-risk: 20 endpoints over ten
tables that exist on no database"* — removed the surface and its migration
together. That is the C-29 product decision their `$reasons` entries were
blocked on, taken by deletion rather than reconciliation.
`migrations/20260507_mdx_beta_surfaces.sql` is now the single non-archived
creator of both.

## The destructive regeneration, found by running it

The obvious fix is `--write-baseline`. Running it produced this:

```
 scripts/ci/duplicate-table-ddl-baseline.json | 30 ++--------------------------
 1 file changed, 2 insertions(+), 28 deletions(-)
```

Twenty-eight deletions to prune two entries. The write path built a fresh
`{ $comment, generatedAt, total, entries }` object and wrote it, so every
OTHER `$`-prefixed key was destroyed:

- the whole **15-entry `$reasons` map** — the live-diff classification of each
  collision: which two shapes, which applier runs which, whether it is a defect,
  and the breakages it causes (the `compliance_tracking` entry alone records
  two confirmed live 42703 failures);
- **`$note_on_the_2026_09_10_jump`** — the record that the count went
  34 → 60 → 27 because the GUARD was fixed, not because definitions were added.
  Without it, a reader comparing this file to an older copy draws exactly the
  wrong conclusion.

And nothing would have reported the loss. Enforcement reads only `.entries`, so
the file would have stayed green, two entries smaller and entirely
unexplained — the precise state its own `$comment` forbids: *"an entry without
a reason is the thing that field exists to prevent."*

That commit was not made. The baseline was reverted and the write path fixed
first.

## The fix

`--write-baseline` now MERGES. It owns `$comment`, `generatedAt`, `total` and
`entries`; every other `$`-prefixed key is carried across untouched. A
`$reasons` map is pruned to the surviving collisions and the dropped names are
printed. It refuses to write when a surviving collision has no reason, and
refuses to overwrite a baseline it cannot parse.

Same command, after the fix:

```
[ci:duplicate-table-ddl] baseline written: 13 collisions
[ci:duplicate-table-ddl] annotations carried over: $note_on_the_2026_09_10_jump, $reasons
[ci:duplicate-table-ddl] $reasons pruned for 2 table(s) that no longer collide: risk_controls, risk_items

 scripts/ci/duplicate-table-ddl-baseline.json | 14 ++------------
 1 file changed, 2 insertions(+), 12 deletions(-)
```

2/12 instead of 2/28, and the twelve are exactly the two stale entries, their
two now-obsolete reasons (both described a file that is gone), and
`total`/`generatedAt`.

## Verify by making the check fail

### Probe 1 — a surviving collision with no reason

`$reasons['vault.documents']` deleted while the collision still exists, which
is the shape a NEW collision reached via this flag would have:

```
[ci:duplicate-table-ddl] refusing to write: 1 collision(s) would be baselined with no entry in $reasons —
  vault.documents

  This file's own $comment: "an entry without a reason is the thing that
  field exists to prevent." Classify each one in $reasons first (what the two
  shapes are, which applier runs which, and whether it is a defect), then
  re-run. Do not reach for this flag to silence a NEW collision.
exit=1
```

And the baseline was not touched — `generatedAt` unchanged, both notes still
present.

### Probe 2 — an unparseable baseline

```
$ printf '{ "total": 13, "entries": {  ' > scripts/ci/duplicate-table-ddl-baseline.json
$ node scripts/ci/check-duplicate-table-ddl.mjs --write-baseline
[ci:duplicate-table-ddl] existing baseline unreadable at … — refusing to overwrite it.
  Fix the JSON, or move it aside deliberately.
exit=1
```

The truncated file was left exactly as it was rather than replaced with a
reason-less regeneration.

### Restored

```
total 13 · entries 13 · reasons 13 · notes 2
[ci:duplicate-table-ddl] ✅ no new duplicate table definitions.
```

## Effect on the nightly gate

`ci:duplicate-table-ddl:strict` — one of the eight zero-baseline nightly
gates — moves 15 → 13. It still fails, as it is meant to until each remaining
collision is reconciled per ADR-0006, but the number it fails with is now the
real one. Twelve of the thirteen are classified as parked, blocked or
not-a-defect in `$reasons`; the classification is why the prune was two
entries and not a round number.

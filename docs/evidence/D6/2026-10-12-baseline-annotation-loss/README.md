# Three gates' `--write-baseline` destroyed their own baseline's reasons

**Row** D6 (gate governance). **Date** 2026-10-12.

## How this was found

Pruning two stale entries from `duplicate-table-ddl-baseline.json` with the
gate's own `--write-baseline` produced **2 insertions and 28 deletions**. The
26 extra deletions were the file's whole `$reasons` map and its
`$note_on_the_2026_09_10_jump`. The write path built a fresh
`{ $comment, generatedAt, total, entries }` object literal and wrote it, so
every other `$`-prefixed key was dropped.

Nothing would have reported it. Every one of these gates enforces against
`.entries` alone, so the file stays green — smaller, and stripped of the
classification its own `$comment` demands.

## The survey

Eleven baseline files in `scripts/ci` carry a key beyond `$comment`. Each
write path was tested empirically — copy the baseline aside, run
`--write-baseline`, compare the `$`-key set, restore — rather than read for the
pattern:

| baseline | annotations | write path |
|---|---|---|
| `duplicate-table-ddl-baseline.json` | `$reasons`, 2 × `$note_…` | **DESTROYED** → fixed |
| `unkeyed-request-tables-baseline.json` | `$reviewed_2026_10_12` | **DESTROYED** → fixed |
| `unbacked-tables-baseline.json` | `$note_on_the_2026_09_10_entries` | **DESTROYED** → fixed |
| `discarded-audit-write-baseline.json` | `$note` | preserves |
| `upload-guards-baseline.json` | `$note` | preserves |
| `sign-ceremony-baseline.json` | `$note` (also nested) | preserves — carries `prior.$note` explicitly |
| `client-reachability-baseline.json` | `$entry`, `$generated` | no npm write script |
| `component-class-coverage-baseline.json` | `$generated` | timestamp only |
| `eslint-warning-baseline.json` | `$generated` | timestamp only |
| `phantom-tokens-baseline.json` | `$generated` | timestamp only |
| `writerless-stores-baseline.json` | `$generated` | timestamp only |

Three of the seven with substantive annotations destroyed them. The four that
survive are not a different design — `check-sign-ceremony.mjs` is the only one
that threads `prior.$note` through on purpose; the others happen not to be
regenerated in a way that loses it.

## The fix, in all three

The write path reads the WHOLE prior file, owns `$comment`, `generatedAt`,
`total` and `entries`, and carries every other `$`-prefixed key across
untouched. Each prints what it carried. `duplicate-table-ddl` additionally
prunes `$reasons` to the surviving collisions, says which it dropped, and
refuses to write when a surviving collision has no reason at all — the state
that file's `$comment` exists to prevent.

`duplicate-table-ddl` and `unbacked-tables` also now refuse to overwrite a
baseline they cannot parse, rather than replacing it with an unexplained
regeneration.

## What the three regenerations actually changed

| gate | was | now | why |
|---|---|---|---|
| `duplicate-table-ddl` | 15 | 13 | `risk_controls`, `risk_items` — their rival migration was deleted with the `/api/design-risk` surface (`153481465`) |
| `unkeyed-request-tables` | 105 | 101 | the four knowledge-graph tables are keyed by a dynamic sweep, now modelled (see `docs/evidence/D3/2026-10-12-dynamic-keyers/`) |
| `unbacked-tables` | 22 | 20 | `concept2cure_projects` and `correspondences` — both fixed earlier today; the baseline had not been regenerated since |

Each diff is now the entries that genuinely left, plus `total` and
`generatedAt`, and nothing else. The `duplicate-table-ddl` prune went from
2/28 to 2/12.

## Verify by making the check fail

`duplicate-table-ddl`, probe 1 — `$reasons['vault.documents']` deleted while
the collision stands:

```
[ci:duplicate-table-ddl] refusing to write: 1 collision(s) would be baselined with no entry in $reasons —
  vault.documents
  … Do not reach for this flag to silence a NEW collision.
exit=1
```

Baseline untouched: `generatedAt` unchanged, both notes still present.

Probe 2 — a truncated baseline:

```
[ci:duplicate-table-ddl] existing baseline unreadable at … — refusing to overwrite it.
exit=1
```

The truncated file was left as it was.

And the positive direction, which is the whole point — all three now say what
they kept:

```
[ci:duplicate-table-ddl]  annotations carried over: $note_on_the_2026_09_10_jump, $reasons
[ci:unkeyed-request-tables] annotations carried over: $reviewed_2026_10_12
[ci:unbacked-tables]        annotations carried over: $note_on_the_2026_09_10_entries
```

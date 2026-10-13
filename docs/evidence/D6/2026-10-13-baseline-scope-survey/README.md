# Which gates are baselined by FILE, and what that covers

**Row** D6 (gate governance). **Date** 2026-10-13.
**Follows** `docs/evidence/D6/2026-10-13-empty-state-occurrence-scope/`, where a
file-scoped baseline turned out to be covering an ~800-line file on the strength
of one reasoned false positive.

## Why survey

That was found by inspection, which is luck. Having found one, the question is
whether the same hole exists elsewhere — so every baselined gate was checked for
how it decides a finding is NEW, rather than checked one at a time.

## The survey

Nineteen gates in `scripts/ci` compute a "fresh"/"offending"/"unbaselined" set
against a baseline. Three key on the FILE alone; the rest key on a per-finding
identifier (`key(h)`, a table name, a column, a fingerprint):

| gate | keys on | baseline today | verdict |
|---|---|---|---|
| `check-empty-state-honesty` | ~~file~~ → occurrence | 1 file, 1 occurrence | **was a hole — fixed** |
| `check-commonjs-require` | file | 9 files, 9 occurrences | file scope is the right granularity |
| `check-dead-audit-catch` | file | **0** | covers nothing today |
| `check-internals-in-copy` | file | **0** | covers nothing today |
| 15 others | per-finding key | — | not affected |

**`check-commonjs-require` is not a defect.** Its baseline holds exactly one
occurrence per file, and the remediation unit is the file — converting a module
off `require()` is a per-file change, so a second `require()` in an
already-listed file is the same piece of work, not a new one.

**`check-dead-audit-catch` and `check-internals-in-copy` have empty baselines**,
so their file scope permits nothing at present. The property is worth knowing
rather than pre-emptively changing: the day either gains an entry, that file
stops being watched for further occurrences of the same defect, and whoever adds
the entry should pin it the way `empty-state-honesty` now is. Recorded here
rather than fixed, because changing a gate that is covering nothing is
speculative work.

So the survey found one real hole, and it was already the one being fixed. The
others are sound for reasons specific to each, which is the useful output: file
scope is not wrong in general, only wrong where a file can hold several
independent instances of the defect.

## What the survey did turn up: three stale entries

`ci:commonjs-require` had been asking for this in its own output, unread:

```
check-commonjs-require: no new occurrences. 9 baselined across 9 file(s).
  3 baselined file(s) now clean — run --write-baseline to shrink it.
```

Twelve files listed, nine still offending. The three clean ones:

```
server/routes/analytics-routes.ts
server/routes/document-lifecycle.ts
server/routes/manufacturing-routes.ts
```

Checked before pruning, because a gate reporting a file clean and the file
being clean are different claims. `analytics-routes.ts` still contains the text
`require(` — at line 867, **inside a comment**, in prose about pdfkit. The
detector strips comments, correctly, so the file is genuinely clean. (Worth
noting by contrast: `ci:unbacked-tables` scans raw source text, which is how a
comment quoting dead SQL counted as a live table reference earlier this week.)
The other two carry no `require(` at all.

Pruned: 12 → 9. The diff is exactly those three lines; this baseline carries no
annotations, so nothing else could be lost.

## Verify by making the check fail

A `require()` added back to one of the just-pruned files:

```
$ # const probeCrypto = require('crypto');  →  server/routes/manufacturing-routes.ts
$ npm run ci:commonjs-require
   `require` is undefined in BOTH runtimes, so this line throws ReferenceError
   the first time its branch executes — a 500 at click time, invisible until then.
   Vitest supplies a working `require`, so a passing unit test proves nothing here.
   …
exit=1
```

Before the prune that file was baselined, so the same line would have passed.
Restored: 9 baselined, exit 0.

# One reasoned false positive was buying immunity for an 800-line file

**Row** D6 (gate governance / honest state). **Date** 2026-10-13.

## The hole

`ci:empty-state-honesty` refuses copy that says "we found nothing" in a state
that means "we have not looked" — clearance text selected **by** a collection
being empty. It has exactly one baselined file:

```
check-empty-state-honesty: no new occurrences. 1 baselined across 1 file(s).
```

That entry is a genuine, reasoned false positive in
`client/src/concept2cure/v2/surfaces/Nonclinical.tsx`: the detector sees
`r.findings.length === 0 ? "No findings"` and cannot see that the conditional
chain guards it with a failed-read branch first.

But enforcement was:

```js
const fresh = hits.filter((h) => !allowed.has(h.file));
```

**File** scope. So that one examined line bought permanent immunity for every
clearance-on-empty line in a file of roughly 800 lines. A second, genuinely bad
occurrence anywhere in it would pass.

## Verify by making the check fail

A second occurrence inserted into the same file — clearance chosen by an empty
collection, with no failed-read branch ahead of it:

```tsx
) : r.warnings.length === 0 ? (
  <span className="nc-send-f ok">PROBE no outstanding issues for this study</span>
```

### Against the baseline that shipped until today (file scope) — **passes**

```
check-empty-state-honesty: no new occurrences. 2 baselined across 1 file(s).
exit=0
```

That line is the finding in one sentence: the gate reported **"2 baselined"**
where one of the two was a brand-new defect it had never been shown.

### Against the occurrence-scoped baseline — **fails**

```
❌ Clearance copy selected by an EMPTY collection.

   client/src/concept2cure/v2/surfaces/Nonclinical.tsx:752  [NEW occurrence in an already-baselined file]
     when `(collection)` is empty → "( PROBE no outstanding issues for this study )"
exit=1
```

The `[NEW occurrence in an already-baselined file]` marker is on the refusal
deliberately: without it, a reader looking at a baselined file's name in the
output would reasonably assume the gate was repeating something already
reviewed.

Restored: 1 baselined, exit 0.

## The fix

The baseline gains an `occurrences` map keyed by file:

```json
"occurrences": {
  "client/src/concept2cure/v2/surfaces/Nonclinical.tsx": [
    "(collection)|( No findings{r.risk ? ` · risk $ ` : ''} )"
  ]
}
```

Keyed on the collection expression plus the claim text — **not the line**.
Line numbers move whenever anything above them is edited, so a line key would
report every occurrence in a file whose top changed as new. Digit runs in the
claim are masked for the same reason the ESLint ratchet masks them: a claim that
renders a count is the same claim one more study later.

An older baseline with no `occurrences` map still passes, at file scope — but
it now **warns**, every run:

```
check-empty-state-honesty: the baseline has no `occurrences` map, so it is being
  enforced at FILE scope — a new clearance-on-empty line in an already-baselined
  file will pass. Run --write-baseline to pin it to the exact occurrences.
```

A silent downgrade to the weaker mode is the thing this gate exists to refuse,
so the weaker mode announces itself.

`--write-baseline` already carried its `reasons` map forward correctly — this
gate was written with that lesson, unlike the three fixed yesterday
(`docs/evidence/D6/2026-10-12-baseline-annotation-loss/`). It now writes
`occurrences` alongside.

## A correction to the entry's own reason

Re-reading the guard to confirm the exemption still holds turned up an error in
the note. It said the chain *"tests `r.error` FIRST"*. It does not — the guard
is `!r.ok` (`Nonclinical.tsx:737`); `r.error` is what that branch **renders**,
through `redactInternals`.

That is not pedantry, because the note is the entire justification for the
exemption: if the guard really were on `r.error`, a row that came back `ok:
false` with no error string would fall through to the zero branch and render
"No findings" for a failed check. It is guarded on `!r.ok`, so it cannot. The
exemption is sound; the stated reason for it was not, and a wrong reason in a
baseline is worse than a missing one — it tells the next reader the line was
checked against a condition nobody checked.

Both corrections are in the entry, dated.

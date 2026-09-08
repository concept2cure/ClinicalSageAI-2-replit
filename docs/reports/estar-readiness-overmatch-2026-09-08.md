# A financial-disclosure section was satisfying the performance-testing slot

Date: 2026-09-08. Branch `concept2cure-v2`. Found by an adversarial scout of the eSTAR
attachment work (workflow `estar-slice5-scout`), in code it was not sent to review.

## The defect

`mapToEstar` scores a device dossier against 23 eSTAR slots and reports which required ones
are missing. It matches an authored section to a slot by document-type token OR by
**case-insensitive title substring**.

The `performance-testing` slot matched `ti('performance testing', 'bench test', 'clinical data')`.

Both shipped rule packs title their financial-disclosure node:

> **Financial certification or disclosure (21 CFR Part 54), where clinical data are relied on**

That clause contains `clinical data`. Reproduced on the shipped 510(k) outline, scoring node
A8 **alone**, fully authored and approved:

```
PRESENT: performance-testing            | Performance testing (bench / animal / clinical) | sources ["A8"]
PRESENT: clinical-financial-disclosure  | Financial certification or disclosure (FDA 3454 / 3455) | sources ["A8"]
missingRequired includes performance-testing: false
```

A sponsor who had authored the financial-disclosure section and **no bench, animal or clinical
testing section at all** was told performance testing was present, and it dropped out of
`missingRequired` entirely. The same node in the De Novo pack (A5) carries the identical title
and had the identical effect.

That is a governed readiness verdict asserting a required section is satisfied when nothing
addresses it. It reaches operators through `POST /api/510k/estar/filing-readiness`, the
device/IVD cockpit, the pathway dispatcher and `assembleDeviceSubmission`.

The direction is what makes it serious, and the file already says so in its own words, about a
different slot:

> over-asking for a biocompatibility section costs a reader a moment and under-asking costs …

A false **present** is the one way this mapper may not be wrong.

## The fix

`clinical data` still names a performance section — a section legitimately titled "Clinical
data" should match. What must not match is a title that is *about* financial disclosure and
merely mentions the phrase. So the matcher gained a narrow, stated exclusion rather than losing
the phrase:

```ts
any(dt('performance_testing', 'bench_testing', 'clinical_testing'),
    ti('performance testing', 'bench test'),
    all(ti('clinical data'), not(ti('financial', '21 cfr part 54'))))
```

Nothing on either shipped outline depended on the loose phrase: the three 510(k) performance
nodes are titled "Bench performance testing", "Animal performance testing" and "Clinical
performance testing", and the De Novo pair "Performance testing" and "Bench performance
testing" — all matched by `ti('performance testing')` already.

## The guard

Two tests in `tests/schema-contract/estar-mapper-matches-shipped-outlines.contract.test.ts`,
both seen failing first:

1. **The named regression.** The financial-disclosure node of each pack lights
   `clinical-financial-disclosure` and does not light `performance-testing`. It asserts the
   node's title still contains "clinical data", so the test cannot pass by the pack quietly
   being retitled.
2. **The whole node→slot map, measured.** All 36 k510 nodes and all 32 De Novo nodes, with the
   exact slot list each produces — empty arrays included, because eleven k510 nodes match no
   slot at all and that is a real answer. A matcher edit now shows its blast radius in a diff
   rather than moving a readiness percentage nobody traced.

The second is the durable one. This defect existed because a title-substring matcher's reach
was never written down anywhere it could be checked.

## Verification

| check | result |
|---|---|
| the contract file | 7 passed (4 new, all 4 seen failing first) |
| estar engine + mapper consumers + official-eSTAR route + 510k routes + device golden journey + cockpit | 21 files / 323 passed |
| `npx tsc --noEmit` | clean |

## One thing the same scout reported that is NOT a defect

It flagged that `sectionHasContentSql` counts an `{xml}` body as content while `sectionPlainText`
returns `''` for it, so such a section reports has-content and is dropped from packages. The
divergence is real, and it is deliberate and already written down at
`server/services/c2c/section-content.ts:135-137`:

> `xml` is deliberately absent: contentToBody cannot render it either, so it stays out of both.
> That leaves an `{xml}` section reporting has_content with no lineage — an honest gap, recorded
> here rather than papered over with a serialisation nothing can display.

The scout also recorded that it measured no live rows in that shape. Nothing was changed.

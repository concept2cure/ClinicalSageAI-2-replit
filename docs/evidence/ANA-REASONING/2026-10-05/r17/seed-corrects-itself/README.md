# A seeded regulatory template can now be corrected

Step 1 of task #38, and the **prerequisite** for fixing the 510(k)
template/outline code collision
(`../../r16/template-outline-code-collision/`). Finding:
`../template-seeder-is-a-one-shot/`.

## What was wrong

`seedTemplatesIfMissing` guarded on a row count:

```sql
SELECT count(*)::int AS n FROM intelligence.document_templates
 WHERE template_code = ANY($1) AND version = '1.0'
```
```ts
if (n >= codes.length) return { ran: false as const, present: n };
```

It counted **template rows** and never inspected a section code, a title or an
ordering. So once the twenty rows existed the seeder short-circuited on every
subsequent boot, forever, and a corrected `section_code` in source was never
applied. The only way to apply one was an authenticated user hitting
`POST /api/regulatory-intelligence/templates/seed`, which is not a deploy path.

That is why correcting the 510(k) codes alone would have been **worse than
doing nothing**: new databases right, every existing estate silently wrong, and
indistinguishable — with `filingAgreesWithEditing` (shipped earlier today)
unable to report a word of it, because after a mis-keyed write the editing and
filing copies *agree*.

## The change

`seedSetDrift(executor, codes)` asks whether the store still matches source,
symmetrically — a row source has and the store lacks, and a row the store kept
that source dropped. The count now only decides whether anything is there at
all; drift decides a re-seed.

**What is compared, and why only this:** `(section_code, section_title,
ordering)` per template, at version `'1.0'` as the seeder reads and writes it.
The code is what binds a section to the filing outline, the title is what the
author reads, the ordering is the document's shape. Guidance prose, word counts
and phrase lists are deliberately **not** compared — editing one of those must
not force a `DELETE`+`INSERT` across twenty templates on every boot.

Parameterised through `unnest`, not an interpolated `VALUES` list: this runs at
boot against a shared store, and `ci:sql-interpolation` is right to care.

**It cannot fail the boot it runs in.** An unreadable store answers
`{ rows: 0 }` with a stated reason rather than throwing. The seed's own failure
mode is already a non-blocking warning; a probe that turned that into a crash
would be a worse bargain than the defect it closes.

## Red before green

Twelve cases. The probe's six drift shapes (code, title, ordering, a missing
row, an extra row, an absent template) plus three no-drift controls, the
absent-store case, and **two that drive the real `seedTemplatesIfMissing`** —
because the guard *is* the defect, so stubbing the decision would leave the fix
untested.

Mutating the probe to always report no drift — the old row-count behaviour —
kills **7 of 12**. And with the old guard restored verbatim, the wiring case
reads:

```
× re-seeds when a stored section code no longer matches source, and corrects it
  → a full store with a wrong code must still re-seed: expected false to be true
✓ leaves a matching store alone — no re-seed, no churn   (control, passes either way)
```

That control is the one that matters most: a drift probe that fired on a healthy
estate would rewrite twenty templates on every boot forever.

## A harness bug of mine that read exactly like a product bug

The absent-store case drops `template_sections` and re-creates it. I first
re-created it from a **second, shorter copy** of the DDL, so every wiring case
that ran afterwards failed with:

```
column "required" of relation "template_sections" does not exist
```

which looks precisely like the seeder writing a column the schema lacks. I
chased it through two wrong hypotheses — a `CREATE TABLE` the fixture already
had, and PGlite's statement splitting — before reading my own restore line.
There is now one `INTELLIGENCE_DDL` constant, used by both, with that history
written at it.

## Still owed before the codes change

2. A founder-visible decision about documents already created — their sections
   keep the old codes, and this change does not touch them.
3. The re-code itself, label-mapped by RA judgment.
4. A role gate on `POST /templates/seed`, and the guidance-snapshot hole.

# What counts as an unanswered agency letter — the decision, and the engine

The open question from the 2026-10-12 absent-as-clean sweep was *"what counts
as an unanswered agency correspondence."* Taken as SME. The answer is that the
question had the wrong shape, and the shape is the finding.

## The dead signal, and what restoring it naively would have cost

`mdx-proactive-signals.ts` declared a `correspondence.no_response` alert and
produced it from:

```sql
FROM correspondences c
WHERE c.organization_id = $1
  AND COALESCE(c.response_status, 'open') = 'open'
  AND c.received_at < NOW() - INTERVAL '14 days'
```

`correspondences` exists nowhere in this repository, inside a swallowing
`catch`, so the alert had never once fired. The real store is
**`c2c_correspondence`** (`db/migrations/20260331_regulatory_correspondence_os.sql`),
and it carries **every column that query selected** — `subject`, `received_at`,
`due_date`, `urgency`, `project_id`, `submission_id`, `organization_id`. The
only mismatches were the table name and `response_status` for `status`. It was
a typo, not a missing capability.

Which makes the real decision the one the typo hid: **the rule was wrong too.**
Fourteen days is not a deadline in any regime this platform files in:

| letter | the actual clock | authority |
|---|---|---|
| Refuse to file | **30 days** to request an informal conference | 21 CFR 314.101(a)(3) |
| Complete response letter | **1 year** to resubmit, withdraw or request a hearing | 21 CFR 314.110(c); 601.3 (BLA) |
| PMA deficiency / AI request | **180 days** or the PMA is considered withdrawn | 21 CFR 814.37(c)(1) |
| 510(k) Additional Information hold | **180 calendar days** or the 510(k) is withdrawn | MDUFA AI hold (CDRH interactive review) |
| Drug information request / discipline review question | **the date FDA wrote in it**, and no codified window | — |
| Clinical hold | **no sponsor deadline at all**; the study stays stopped | 21 CFR 312.42 (312.42(e) binds FDA, not the sponsor) |

A 14-day rule is therefore wrong in both directions at once: it shouts about a
complete response letter with eleven months to run, and says nothing about a
510(k) three days from withdrawal. Restoring the signal on that constant would
have been worse than leaving it dead, because it would have looked like it
worked.

## The decision

A letter is **awaiting our response** when all of these hold, and the clock on
it is decided in this order:

1. It is **inbound** — a letter we sent is not one we owe an answer to.
2. The letter itself records that a response is **required** (`response_required`).
3. It is not already `responded` or `closed`.
4. Its class is an **agency letter class** that asks for something. An
   acknowledgement, an approval and meeting minutes ask for nothing; a cover
   letter, a response letter and a triage memo are ours, not theirs.
5. **The date the agency stated governs, over everything.** If the letter
   carries a `due_date`, that is the deadline — whatever any table in this
   platform says. This is the single most important rule here: regulatory
   affairs runs on the date in the letter.
6. Only when no date was stated does the **governed window** apply, by letter
   class *and application family*, each entry carrying its citation and what
   lapsing costs. The family comes from `submission-type-bridge`, the canonical
   resolver, so `510(k)`, `PMA`, `NDA` and `IND` are not re-enumerated here.
7. Where a response is owed and **neither** a stated date nor a codified window
   exists, that is reported **as that** — "arrived N days ago, no response date
   on record, nothing here is overdue" — and never as an invented overdue.
   This is the honest-state rule applied to a deadline.

**Severity is computed, not asserted.** A date we know of that has passed is
`critical`; one approaching is `warn`; one far off raises nothing at all. An
undated letter is `warn` when the agency has stopped something (a clinical
hold stops the trial, a refuse-to-file stops the review, a device AI hold stops
the clearance) and `info` when the review continues around it — which is why
`ResponseWindow` carries a `blocking` flag. Severity follows the regulation,
not the wording of the letter or the parser's `urgency` guess.

## Where it lives, and what it reuses

- **`shared/regulatory/agency-interaction.ts`** — the governed window table and
  `responseWindowFor(letterClass, family)`. This module already models "the
  dialogue" (`DeficiencyType`, `requiresResponse`, commitments) and is pure, so
  the windows belong beside them. Each entry states its `basis` —
  `statutory` (a CFR deadline), `guidance` (a user-fee convention),
  `stated_only` (no fixed window exists) or `none` — so a reader can see how
  far each number can be trusted. **No entry carries a day count without a
  citation**, and a test asserts it.
- **`server/services/regulatory-correspondence/response-clock.ts`** — the pure
  verdict, in the correspondence OS that owns the entity.
- **One deadline rule for the platform.** `deadlineBucketFor` now lives in
  `agency-interaction.ts` and the Regulatory Deadline Radar
  (`server/services/ana/deadline-radar.ts`) computes `bucketObligations`
  through it, so "overdue" cannot come to mean two things on one screen. The
  radar's own tests pass unchanged, which is how we know that refactor was
  behaviour-preserving.
- **Nothing was duplicated.** The only other `overdue` in the correspondence OS
  is over work-item `due_at` (`operating-layer.ts:226`) — a different entity,
  the tasks derived from issues, not the letter.

## A new letter class cannot ship without a decided clock

`CORRESPONDENCE_TYPES` is now a runtime list beside the `CorrespondenceType`
union, with two compile-time assertions making **tsc** the enforcer in both
directions: a type added to the union but not the list, or listed but not in
the union, fails the typecheck. The clock's completeness test iterates that
list, so the 24 members are each either an agency letter class with a decided
window or explicitly one of the twelve sponsor-authored / internal classes.

## Measurements

`measured.txt`: the clock 22/22 and the producer 7/7; 101 files / 1,546 tests
across every suite touching the changed modules; `tsc --noEmit` exit 0;
`ci:unbacked-tables:strict` holds at 20 (the new reads are of real tables) and
`ci:sql-interpolation` unchanged — the clock is not SQL's job, so no value is
interpolated into the statement.

**Three mutations, each caught by the test written for it:**

| mutation | caught by |
|---|---|
| the table beats the agency's stated date | the two stated-date cases, and the producer's "names the agency's own date" |
| an undated letter is given a blocking severity regardless | the two undated cases, and the producer's "reported as having none, not as overdue" |
| the 14-day rule returns (`upcoming` alerts again) | "raises nothing for a complete response letter eleven months out" |

## Deliberately not done

The CMC Module 3 board computes its own overdue-Information-Request count from
`reg_questions` — the **legacy RPI store**, a different table, already
distinguishing unprovisioned from unreadable
(`cmc-module3-board.routes.ts:70-81`). Pointing that at this engine means
migrating a store, not sharing a rule, and is its own change.

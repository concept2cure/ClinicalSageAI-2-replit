# The gate that could not fire, and the parser that failed a compliant dossier

Two defects in the same shape: **a second column, and a second parser, for a
fact the platform already had one of.** Both were found by probing running code
against the data a real register holds, not by reading it.

---

## 1. A batch signed REJECTED was invisible to the only gate that could stop it

`cmc_batch_records` carries **two columns for one fact**:

| Column | Written by | Read by |
|---|---|---|
| `release_status` | `POST /api/cmc/batch-records/:id/release`, under the signature | the edit-lock and the already-dispositioned refusal (`signed-record.ts` `batchWriteRefusal`, `batchReleaseRefusal`) |
| `disposition` | **nothing** — not the create's INSERT column list, not the ordinary PUT's field map, not the governed release | the contradiction sweep (`contradiction-registers.ts`), and nothing else |

The sweep read the empty one. And `batch_rejected` is the **only**
critical-severity CMC contradiction (`cmc-impact-contradiction-engine.ts`),
while the final-export gate keeps only critical findings
(`final-export-gate.ts`, `contradiction-lifecycle.ts`) — so the one
contradiction that can block an export **could never fire**.

On this deployment, before any of today's work:

```
 total | with_disposition | with_release_status
-------+------------------+---------------------
    86 |                0 |                  23
```

Twenty-three signed release decisions, and the sweep saw none of them.

### Demonstrated dead, then alive

The same act through the product's own routes — a batch, one reviewed QC result
that FAILS, then `POST .../release` with `decision: "rejected"` — then the sweep,
then the gate (`probe-disposition.sh`, `disposition-before-after.txt`):

```
BEFORE   signed release, decision=rejected   200
         contradiction sweep                 200  0 finding(s), 0 critical: none
         export readiness                    200  {"openCriticalContradictions": 0}

AFTER    signed release, decision=rejected   200
         contradiction sweep                 200  1 finding(s), 1 critical: batch_rejected
         export readiness                    200  {"openCriticalContradictions": 1}
```

### The fix is one column, not two writes

The sweep reads `release_status`, aliased to the name the engine expects. Writing
`disposition` as well would have kept two columns for one fact, which is what
caused this. `disposition` is now read by nothing; it is left in place because
removing a column is a migration under RULE 1, not part of a correctness fix, and
the sweep's own comment records why it is not read so the next reader does not
point back at it.

Two tests pin it, both failing when the sweep goes back to the phantom:

```
× hands the engine the signed release decision, not the column nothing writes
  → expected null to be 'rejected'
× does not invent a disposition from the column nothing writes
  → expected 'rejected' to be 'released'
```

The second is the mirror case, and it is the reason not to "just read both": a
row whose `disposition` says rejected and whose signed `release_status` says
released would raise a critical contradiction against a batch that was signed
**released**.

---

## 2. A complete 24-month study read as 0 months, and failed

`studyCoverage` — added this morning for the Q1E verdict — asked "how far does
the recorded data reach" using `monthsIn`, **the parser written for the claim's
free text** ("24 months at 25C/60%RH"). The canonical parser of a pull point's
time is `parseMonthTime` in `recorded-stability.ts`, which `numericSeries` uses
and therefore the Q1E estimator, the poolability assessment, the trending engine
and the composed §3.2.P.8.

They disagree on the register's own labels:

| | `monthsIn` (the claim's parser) | `parseMonthTime` (canonical) |
|---|---|---|
| `Month 24` | **null** | 24 |
| `0` | **null** — a shelf life of zero months is not a period | 0 — a pull point at t=0 is the release result |
| `2 years` | 24 | null — it deliberately does not convert units |

So a **complete 24-month study** whose pull points are labelled
`Month 0 / 6 / 12 / 24` read as **0 months recorded**, and an NDA got two
`fail`s stating "0 months of long-term data" — a figure its own data
contradicts (`probe-timepoints.ts`, `timepoints-before-after.txt`):

```
BEFORE  studyCoverage  {"recorded":0,"planned":24}      numericSeries: 4 points, furthest 24
        Q1E_EXTRAPOLATION_WITHOUT_ACCELERATED  fail
        Q1E_EXTRAPOLATION_BEYOND_LIMIT         fail   "...at most 0 months"

AFTER   studyCoverage  {"recorded":24,"planned":24}     numericSeries: 4 points, furthest 24
        Q1E_CLAIM_WITHIN_DATA                  pass
```

That is the defect `ich-compliance-q2.ts` was rewritten to remove — a rule that
fails a compliant dossier — reintroduced by a parser choice, in a module whose
own header says it exists to prevent fabricated figures.

**One parser per field** now: `parseMonthTime` (exported for this) reads a pull
point's time and a planned schedule's entries; `monthsIn` keeps the claim and
the planned duration, which are prose and need a unit. Five tests pin it,
including one asserting the two readers **agree** about how far the same points
reach — because one feeds the verdict and the other feeds the estimator and the
composed section, and they must not diverge. With the claim's parser put back on
the time field:

```
× reads a complete study labelled "Month N" as the months it covers
  → expected { recorded: +0, planned: 24 } to deeply equal { recorded: 24, planned: 24 }
× agrees with numericSeries about how far the same points reach
  → expected +0 to be 24
```

---

## How both were found

Neither came out of reading the code. The disposition one came from a register
survey that asked, of every column a gate reads, *who writes this* — and found
one that nothing did. The parser one came from an adversarial review of the Q1E
rule **after** it was written, tested green and pushed: the review drove the
real `register row → write-through → loader → rule` chain with the register's
own label forms, and the rule disagreed with the platform's own reader.

The pattern is the same in both: the platform already had a canonical answer —
one column for the signed disposition, one parser for a pull point's time — and
a second one was introduced beside it. The repo's zero-duplication rule is not
tidiness here. Each duplicate was a wrong regulatory verdict.

# The Q1E evaluation the engine computed and never reported

**URS-CMC-024. OQ-CMC-36.**

The platform already computed a real ICH Q1E evaluation. `shelf-life-poolability.ts`
runs the ANCOVA combinability test at α = 0.25 and estimates the supported
shelf life from the recorded data; `control-strategy-generator.ts` cites
`ICH Q1A(R2), ICH Q1E` as the basis of its stability element; the Module 3
stability card tells the user it covers *"ICH Q1A(R2) / Q1E"*.

Nothing reported a Q1E **verdict**. `ICH_GUIDELINES_CHECKED` listed ten
guidelines and Q1E was not one of them, so the compliance read returned no Q1E
row at all. A §3.2.P.8 shelf-life claim that ran past what the data on file
supports — or that extrapolated with no accelerated study behind it — raised no
finding anywhere, while the composed dossier printed the claim as the
applicant's own statement. The surface claimed the coverage; the engine had the
arithmetic; the report said nothing.

That matters because `shelf_life` is §3.2.P.8's **sole** required field
(`module3Composer.ts:200-204`), and the code itself calls it *"a regulatory
decision a person makes on the close-out form"*.

## Q1E is a registration guideline, so the stage decides what it means

The repo's own CMC regulatory record scopes Q1E to `marketing` and
`post_approval` (`knowledge/cmc-regulatory-record.json`, id `ich-q1e`): its
subject is how to propose a re-test period or shelf life in a registration
application, and its Appendix A decision trees cap extrapolation beyond the
period covered by long-term data. A clinical-trial application answers a
different question — 21 CFR 312.23(a)(7)(ii) asks for stability data supporting
the **duration of the proposed study**, not a registered shelf life.

So the rule judges at the programme's stage, the same way `ich-compliance-q2.ts`
does, and for the same reason: a rule that judges a phase-1 IND by a
marketing-application standard puts a FAIL on a compliant dossier.

| Programme | Claim beyond the data is |
|---|---|
| marketing application | `fail` past the Q1E ceiling — min(2 × coverage, coverage + 12) |
| clinical-trial application | `warning`, citing 21 CFR 312.23(a)(7)(ii) |
| no application type recorded | `warning`, saying to record the type to be judged at the right standard |

## Four programmes, on a live server

Each differs from the first in exactly one way, so a verdict is never confounded
with some other difference (`live-verdicts.txt`, `probe-q1e.sh`):

```
a claim within the data (24 months, 24 covered):      Q1E = pass
  Q1E_CLAIM_WITHIN_DATA     The claim of 24 months is within the 24 months the long-term
                            data covers, with 1 accelerated study/studies on file.
                            cite: ICH Q1E (2003-02)

a claim beyond the data (36 months, 12 covered):      Q1E = warning
  Q1E_CLAIM_BEYOND_DATA     The claim of 36 months runs 24 month(s) past the 12 months
                            the long-term data covers. …clinical-trial application…
                            cite: 21 CFR 312.23(a)(7)(ii)

beyond the data with no accelerated study:            Q1E = warning
  Q1E_EXTRAPOLATION_WITHOUT_ACCELERATED               Q1E admits extrapolation only
                            where accelerated data show no significant change.
  Q1E_CLAIM_BEYOND_DATA

a claim that cannot be read:                          Q1E = not_evaluated
  Q1E_CLAIM_NOT_READABLE    …its period cannot be read: "to be determined". State it as
                            a number of months or years. This is not a pass.
```

OQ-CMC-36 drives the same four cases through the product's own route and
asserts each verdict, each rule id and that the warning messages carry the
figures (`OQ-CMC-36.q1e-verdicts.json`, `oq-008-run.md` — **17 pass · 0 fail**).

## Verified by making the check fail

Every number the verdict turns on is parsed out of free register text, and the
register's own storage condition reads `25C/60%RH`. A parser that took the first
integer it saw would report a **25-month claim the register never made** — and a
genuine 24-month claim would then look like an extrapolation beyond 25 months of
data that does not exist. So `monthsIn` requires a unit, or a string that is
nothing but a number.

Putting the naive parser back (`red-naive-parser.txt`) fails three tests on
exactly that case:

```
× monthsIn > refuses a storage condition, a percentage and a temperature
  → expected 25 to be null
× monthsIn > does not read the temperature out of a condition that also names a period
  → expected 25 to be 24
× statedClaim > reports the unreadable claims rather than ignoring them
  → expected 25 to be null

Tests  3 failed | 19 passed (22)
```

`ci:validation-traceability` was also shown refusing OQ-CMC-36 before the runner
step existed.

## Where it fails closed

Four distinct "could not evaluate" outcomes, none of them a pass:

| Rule | When |
|---|---|
| `Q1E_NOT_EVALUATED` | the stability read itself failed — the existing `blockedInputs` path |
| `Q1E_NO_STABILITY` | no study recorded; the absence is Q1A(R2)'s finding, not reported twice here |
| `Q1E_CLAIM_NOT_READABLE` | a claim is recorded but states no period the rule can read, quoted verbatim |
| `Q1E_COVERAGE_NOT_READABLE` | a claim is readable but no long-term study states a period, each study listed |

`Q1E_NO_CLAIM` is a `warning` rather than a non-evaluation: that §3.2.P.8 has
no shelf life to state is a gap in the dossier, not a failure of the check.

## One defect this found in the evidence itself

`String(s.studyName ?? 'unnamed study')` does not catch the empty string, and
the register's study title is nullable — so an evidence line read
`claim: 24 months at 25C/60%RH (24 months, )` and named nothing. It now reads
`a study with no recorded title`, with a test for it.

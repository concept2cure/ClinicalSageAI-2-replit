# Clinical claims engine: the label register goes green (2026-10-12)

**Row:** D2 (AnA document intelligence). **Workstream:** the clinical figure claim engine.

Hardening round 2 appended 85 adversarial cases (`r2-*`) to
`server/services/truth-engine/__tests__/fixtures/clinical-claims-corpus.json`, written from
document shapes rather than from engine output. 73 of them were closed in the round itself. The
12 that remained were one lens — `label` — and they were the lens that matters most: **does the
product label agree with the clinical study report?** A mismatch between USPI section 6.1 or SmPC
section 4.8 and the CSR safety tables is the classic source of an FDA information request and an
EMA major objection.

The engine is now **467 tests green over all 431 cases**, with nothing held out and nothing owed
on the corpus.

- Red, the 12 cases as found: `clinical-claims-r2-label-red.txt`
- Green, the whole corpus after: `clinical-claims-r2-label-green.txt`

## What was wrong, and what each case proved

Five root causes, each a shape real documents use and the engine did not read.

### 1. The unit is declared somewhere other than the column header

`r2-lbl-01`, `r2-lbl-02`, `r2-lbl-03`.

A USPI Table 1 routinely declares its unit in the **table title** — "Adverse Reactions (%)
Reported in >=5% of Patients …" — or, in text extracted from a PDF, in a **units row** of bare
`%` cells under the header. The engine read column headers only, so a label's whole percents were
framed as counts and set against the CSR's patient counts. That gave a **false consistent**
(label 14% vs CSR "14 (4.6)": "count 14 vs 14, agree") and **five false conflicts** in `lbl-03`
alone. A false conflict is the defect this engine exists to prevent; a false consistent on an AE
rate that is wrong by 13 percentage points is worse.

The label's own figures were implausible as counts and the title said so: a count of 5 out of
N=305 is 1.6%, which would not meet the ">=5%" threshold the table's title states.

Fixed in `tables.ts`: `isUnitsRow` makes a row of unit tokens a header row rather than data, and
`titlePctUnit` lets the title declare that the value cells are percentages. `n (%)` in a title is
a count with its percentage and is excluded.

### 2. The SmPC 4.8 register was excluded from comparison by role

`r2-lbl-04`, `r2-lbl-05`, `r2-lbl-07`.

Convention C5 keeps adverse reactions and adverse events apart. The exemption that lets a USPI
figure compare with a CSR figure was written as `role !== 'uspi'`, so **every SmPC 4.8 figure in
an EU dossier was dropped as `event_basis_differs`** while the identical USPI sentence compared
correctly. In `lbl-05` the two column Ns did compare and agree, so the pair's verdict read
`no_conflict_among_compared` over a headline AE rate that was off by 6 percentage points — a
report that reads reassuring and is wrong.

Fixed in `compare.ts` as `isTrialIncidenceRegister`, and scoped rather than waved through:

- **A USPI figure of any shape** is the trial figure. FDA's labeling guidance for section 6
  (*Adverse Reactions Section of Labeling for Human Prescription Drug and Biological Products*,
  January 2006) directs the sponsor to present the clinical-trial incidence tables regardless of
  causality, the discontinuation summary included. The corpus already blessed this: `lu-34`
  compares a USPI "adverse reactions leading to discontinuation" rate with "all TEAEs regardless
  of causality".
- **An SmPC figure where it is a per-preferred-term frequency.** EMA's SmPC guideline requires the
  adverse reactions tabulated in 4.8 to carry the crude incidence rate observed in the trials, so
  a 4.8 term frequency *is* that term's trial incidence.
- **Not an aggregate SmPC statement.** "Adverse reactions led to permanent discontinuation in 4.4%
  of patients" counts only causally related events; the CSR's "TEAE leading to discontinuation"
  counts all of them. `euc-11` holds that pair apart, and still does.

The narrow reading is what keeps `euc-11` green while `lbl-04/05/07` go green: a first attempt
that exempted the whole SmPC role turned `euc-11` red, which is how the distinction was found.

### 3. The list sentence, and the list the CSR elides

`r2-lbl-06`, `r2-lbl-07`.

"The most common adverse reactions (incidence >=5%) in dapralutide-treated patients were nausea
(12%) and diarrhea (9%)" is the single most common sentence in USPI section 6.1 and in the
HIGHLIGHTS adverse-reactions bullet. The engine read only the two-arm "with A … compared with B …
were" shape, so **no figure stated in the one-arm form was ever compared**: all of them came back
`arm_unidentified`, although the arm is written in the same clause immediately before the list.

On the CSR side, "Nausea was reported in 55 subjects (18.0%) on dapralutide 1.5 mg, diarrhoea in
27 subjects (8.9%) and vomiting in 23 subjects (7.5%)" elides the verb, so the second and third
figures fell inside the first anchor's stretch and **took the first anchor's preferred term**: the
report named diarrhoea's and vomiting's figures as nausea's.

Fixed in `forms-safety.ts`: `oneArmMostCommonList` reads the label's one-arm list (and consumes
the bracketed inclusion threshold with the category words, so "(incidence >=5%)" is never read as
a rate), and `elidedTermGroups` splits an elided list so each continuation carries its own term.
The continuation guard is structural, not a vocabulary list: a phrase holding a function word or a
word about who or how many is a connective, not a preferred term. Without it, "… 65 years of age
and older and in 15% of those younger than 65 years" offers "older and" as a term and `lu-21`
loses both of its subgroup figures — which is exactly what happened on the first attempt.

### 4. The exposure sentence 21 CFR 201.57(c)(7) actually uses

`r2-lbl-08`, `r2-lbl-09`, `r2-lbl-10`.

Three phrasings, three different failures, one 612-vs-621 digit transposition that a reviewer
would catch in seconds:

- "**including 621 patients exposed to** dapralutide 1.5 mg once weekly" — the participle, with no
  "were": `figure_not_read`, so the transposition was invisible and the pair's verdict rested on
  the 1,219 total alone.
- "**621 patients were exposed to** dapralutide 1.5 mg **and 607 patients were exposed to**
  placebo" — framed as the total twice, so the per-arm guard that exists to prevent false
  conflicts (`lu-25`) blocked the genuine per-arm conflict instead.
- "**541 dapralutide-treated patients were exposed for at least 24 weeks**" — the active voice of a
  sentence the engine already read in the passive ("Of the dapralutide-treated patients, 541 were
  exposed …", `lu-05`). A rule that fires on one of two interchangeable phrasings of the same
  sentence is not a gate.

Fixed in `forms-disposition.ts` (the arm named straight after "exposed to", with "A or placebo"
still the total per `fs-05`; and the participial form) and `forms-misc.ts` (an arm adjective before
the noun; the arm read from "<drug>-treated patients" anywhere in the sentence).

Two consequences had to be handled honestly rather than papered over:

- Widening the duration form made it swallow "**more than** 500" as an exact 500, so `lu-06`'s
  lower bound started comparing as a value. `APPROX_OR_BOUND` in `number.ts` now exposes the same
  words `readNumber` strips, as a prefix a form captures with its figure — one source for both.
- With the form firing, the figure was reported `study_unidentified` rather than for what it is.
  Convention C9 says an approximation or a bound is not a value **whatever it measures**, so in
  `frame.ts` that reason now leads when a slot is also missing. A bound whose frame is complete
  still reaches comparison, where `agreeAsWritten` declines it with both quotes cited.

### 5. "All Grades" / "Any Grade", "Grades 3 or 4" / "Grade 3-4"

`r2-lbl-11`.

Four spellings, two measures. The engine equated none of them, so **no oncology label AE table
compared with its CSR at all**: every cell pair was dropped as `measure_differs` and the verdict
was `nothing_compared` over a 31%-vs-44.2% conflict. Those are the standard spellings across USPI
Table 1 and CTCAE-based CSR tables. Fixed in `tables.ts`.

## Two conventions were amended, both narrowed by a case that held

**C3 (ITT ≡ FAS).** It required *both* texts to define their set as all randomised. `r2-lbl-12`
pairs a USPI section 14 table headed "Intent-to-Treat Population" against a 2.7.3 reading "the
full analysis set (all randomised patients, N=612)". One text's definition now settles it for both
labels, because "intention-to-treat population", unqualified, is the set of all randomised
subjects and ICH E9 §5.2.1 names that set the full analysis set. A set either text qualifies is a
different `PopulationSet` already (`mitt`, `treated`, `pp`, `efficacy_evaluable`), none of which is
ITT-like, so this never equates a modified ITT with a full analysis set. Where **neither** text
defines its set — `euc-31`, a bare SmPC "ITT" against a bare CSR "FAS" — nothing settles it and
the frames stay different; the SAP cross-reference that would settle it is not in evidence.

**C5 (event basis).** As above: the exemption is now about the register, not the role.

## Verify by making the check fail

Every rule added was reverted on the green tree and the corpus re-run. Each one is load-bearing:

| Rule | Reverted | Corpus |
|---|---|---|
| `isUnitsRow` (a unit row is a header row) | `\|\| false` | 1 failed |
| `titlePctUnit` (the title declares the unit) | `countPct(false)` | 2 failed |
| `RESPONDER_ACHIEVED` ("Patients achieving …" is a responder row) | removed from the branch | 1 failed |
| grade spellings (`Any Grade`, `Grade 3-4`) | previous patterns | 1 failed |
| `isTrialIncidenceRegister` (the SmPC 4.8 term register) | USPI only | 3 failed |
| C3 settled by one side's definition | `&&` instead of `\|\|` | 1 failed |
| `oneArmMostCommonList` | removed from the chain | 2 failed |
| `elidedTermGroups` | no groups | 1 failed |
| `CONNECTIVE_PHRASE` (continuation guard) | removed | 1 failed |
| the arm after "exposed to" | `/dose$/` only | 2 failed |
| the participial "N patients exposed to A" | removed | 1 failed |
| an arm adjective before the noun in the duration form | `(?:patients\s+)?` | 1 failed |
| `APPROX_OR_BOUND` captured with the figure | digits only | 1 failed |
| the sentence's study carried to its later clauses | disabled | 1 failed |
| C9 reason precedence | disabled | 1 failed |

One rule was written and then **removed because the corpus could not make it fail**: a row stub
declaring its own unit as a trailing ", %". The responder branch already reads such a row as a
percentage, so the rule changed no outcome, and a rule that has only ever been seen to pass has
not been tested. The shape it was meant for — an incidence row stub `Nausea, % | 12 | 5` under
headers that declare no unit — is a real USPI shape the engine does **not** read today. It is owed
a corpus case, and it is recorded here rather than guarded by unproven code.

## Also owed

Nothing on the corpus. Round 2's four breaker lenses proposed 323 candidate shapes and 86 broke
the engine; all 86 are now cases and all are green. The probe shapes named in the cases' own notes
but not themselves cases (E6, D4, G7, G10, E3b, X7, E2a) are not separately asserted.

## Typecheck

`npx tsc --noEmit` over the whole tree: 0 errors.

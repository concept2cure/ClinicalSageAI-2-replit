# AnA's questions — the batch index

The founder's directive of 2026-10-12: *"Ana's ability to ask questions using
an actionable selection process of positions the human can take with an other
where the human can insert alternatives. And make this consistent and subject
matter intelligent across all medical device and diagnostics scenarios and all
Biotech scenarios."*

Twenty-eight slices, each with its own evidence, the gates it added and the
mutations that were run red against them. This index exists because the
directory had none: a session arriving here found twenty-seven folders and no
order, which is how the second half of a batch gets rebuilt by someone who did
not know the first half existed.

**Read `2026-10-12-review/` first.** It is the ledger: five lenses, 47 findings,
every one struck through with the slice that closed it or stated as open with
the reason. Nothing else here is a reliable summary of what is done.

## The directive, and the nine slices that answered it

| Slice | What it settled |
|---|---|
| `2026-10-12` | The shape: a question offers POSITIONS, each saying what taking it commits the programme to and the authority behind it, and always an answer in the person's own words |
| `2026-10-12-pathways` | One governed catalogue of pathway positions — the registry's own filings, annotated — replacing four lists that disagreed |
| `2026-10-12-availability` | A position the programme's own answers contradict is MARKED, never hidden. The domain decides which positions exist; the programme's facts decide which carry a caution |
| `2026-10-12-agency` | The agency question is positions, and the region it names marks the routes |
| `2026-10-12-region` | The route question is drawn for the regulator the project named, not for FDA whatever it said |
| `2026-10-12-medicines` | The medicines route question on the same catalogue, narrowed by the governed modality frame |
| `2026-10-12-predicate` | What the 510(k) device is compared to, asked before its name — and the split predicate FDA does not accept |
| `2026-10-12-ivdr-class` | The IVDR class, asked by no question anywhere until now |
| `2026-10-12-annex-viii` | A class is a VERDICT, so the Annex VIII rules state it and a mismatch with the sponsor's declaration is reported |

## The review, and the repairs it drove

| Slice | What it repaired |
|---|---|
| `2026-10-12-review` | **The ledger.** Four defects of mine among them: an infinite loop, a single-node check, a gate that killed two questions, nine wrong citations |
| `2026-10-12-dead-branches` | 30 of 63 branches could never be taken |
| `2026-10-12-same-question-gate` | A question can gate a field on an answer it asks itself — and the sweep that holds no required field is unanswerable in any flow |
| `2026-10-12-citations` | Nine citations corrected; the rule that a citation precise enough to be wrong is worse than one broad enough to be right |
| `2026-10-12-enforcement` | A question that offers positions enforces them; one that offers none does not take a position |
| `2026-10-12-offered-values` | Every value a question OFFERS is a value the engine READS, or a declared non-fact with a reason |
| `2026-10-12-combination-and-gate` | A combination product is not offered four routes in silence |
| `2026-10-12-investigational` | The filing a programme is actually making: four investigational positions the catalogue did not hold, and the one it held offered to almost nobody |
| `2026-10-12-no-us-filing` | A European programme is not made to assert an FDA class |
| `2026-10-12-two-answer-gate` | A gate two answers decide (`anyOf` / `allOf` in the one shared evaluator), and an authority that stopped claiming to be checked |
| `2026-10-13-one-agency-list` | One agency list — six agencies a stability programme could not name |
| `2026-10-12-one-vocabulary` | One vocabulary per class across 21 files, with `ci:class-vocabulary` to keep it |

## The interview reaching a record

| Slice | |
|---|---|
| `2026-10-12-class-not-invented` | `POST /api/device-projects` defaulted a missing risk class to `'II'` — a verdict invented in a request default |
| `2026-10-12-programme-write` | The one governed write for a programme's profile columns, extracted from the device-profile route so the interview could not grow a second |
| `2026-10-12-project-setup-commits` | **Task #15.** The interview commits, the launch-scope gate admits it, and every answer no column takes is reported with the reason |
| `2026-10-12-eu-classes` | Found by that projection's own report: no column held the MDR or IVDR class |

## Findings asserted at people who were never asked

| Slice | |
|---|---|
| `2026-10-13-never-asked` | Eleven cross-node rules fired on the trigger alone, because `isBlank(undefined)` is true and no flow asked the mitigating question. Two of them severity CRITICAL |
| `2026-10-13-checks-made-live` | Four of those were vocabulary mismatches: the interviews DO ask, in their own words. Four critical checks now read the sponsor's answer |
| `2026-10-13-audit-repairs` | **An audit of the two above found eight more**, including a rule the first repair killed outright and a gate that was hiding three dead rules, two of them critical |

## What is open

In `2026-10-12-review/` under *"What the review found that is NOT fixed here"*,
and in the task list:

- **six questions the interview does not ask**, each keeping a written check
  silent (`2026-10-13-checks-made-live/`, "The six that remain");
- **the MDR class columns are written and not yet read** — the post-market and
  CER surfaces take a class from their own stores
  (`2026-10-12-eu-classes/`, "What is written and not yet read");
- **the predicate of record needs a trade name** the question does not ask
  (`2026-10-12-project-setup-commits/`, `NOT_PROJECTED.predicate_device`);
- **the programme write can commit with no audit row** and report success, and
  the extraction moved that discard where `ci:discarded-audit-write` cannot see
  it (`2026-10-13-audit-repairs/`, "What this slice does NOT fix"). The more
  serious of the audit's two halves, and the next thing.

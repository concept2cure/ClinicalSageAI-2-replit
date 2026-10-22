# Eight repairs from an audit of yesterday's repairs

**Row:** D4
**Why:** the container restart lost a background adversarial review before it
reported, so it was re-run over the eleven commits pushed since — two lenses,
one on the new governed write path, one on the cross-node detector. Both came
back with real defects. **This slice is the detector half.** Every finding
below was reproduced here before anything was changed.

The headline is the uncomfortable one: **my own repair of yesterday killed a
rule outright**, and **the gate I wrote to prove the repair could not hide a
dead rule was hiding three of them.**

## 1. The repair killed a rule — and a `pending` state needs the node it is in

`runCrossNodeAnalysis` ran five lines before `completedNodes` was extended
(`engine.ts:167` vs the analysis call). Yesterday's `pending` state decides
whether a mitigating question has been PUT to the person from that list. So a
rule whose trigger and mitigation live in the **same node** read `pending` at
the moment the answer arrived, and fired one question later.

`rems_evaluation` is the **last node of `bla_submission`** (`defaultNext:
null`) and holds both `rems_required` and `rems_elements`. There was no later
question, so the finding never arrived at all: a sponsor who said a REMS was
required and named no elements was told **nothing**. Before yesterday
`isBlank(undefined)` fired it. BLA has no node-level equivalent.

One line — the cross-node state now carries the node just answered. And a test
that drives the **real engine**, because every other test in that file composes
a state by hand and the ordering bug was invisible to all of them.

## 2. The gate did not check `appliesTo`

My reachability gate asked *"is some trigger asked SOMEWHERE and some
mitigation asked SOMEWHERE"* — a union over every registered flow, with
`appliesTo` never consulted. A rule whose trigger lives only in flow A, whose
mitigation lives only in flow B, and which applies to neither, passed.

Three rules were green that way, **two of them severity critical**:

| Rule | Read | The applicable flows ask |
|---|---|---|
| `xn_accelerated_approval_no_confirmatory` (critical) | `regulatory_pathway`, `approval_pathway` | neither. `regulatory_pathway` exists only in `protocol_development`, which the rule does not apply to. The BLA asks **`accelerated_approval_basis`** |
| `xn_pediatric_without_safety_monitoring` (critical) | `target_population`, `study_population` | `protocol_development` asks **`includes_vulnerable_populations`** (a multi_select offering `pediatric`); the IND's `study_population` offers only healthy_volunteers / patients / both |
| `xn_biologic_no_immunogenicity` | `product_type`, `molecule_type` | the BLA asks neither |

The gate now intersects **per flow**, and `NOT_ASKED_YET` is keyed on
`rule/flow`. It went red on exactly those three before anything was repaired.

## 3. A reason that can be checked, not measured

The ledger's reasons were free prose held to a 40-character minimum, and two of
the seven were **factually false** — one named a field asked only in a flow the
rule does not apply to; the other named two **node** ids as though they were
fields. Forty characters of anything passes a length check.

The form is now fixed — `asks none of: a, b, c` — and the gate **verifies that
the flow really asks none of them**. A reason that becomes false fails.

## 4. A declared gap for a pair that can in fact fire

The reason is consulted only where a rule cannot fire, so a false entry for a
**reachable** pair sits unread, and a reader takes it for a known gap. Two of
my own first entries were exactly that. A second gate now refuses them, and it
caught both.

## 5. A correct 510(k) answer produced an unanswerable critical

`clinical_data_required` is a yes_no: *"Clinical Data Required to Address
Differences"*. **No** is the normal and usually correct 510(k) answer —
performance and bench testing establish substantial equivalence. Yesterday's
`isRefusal` treats `false` as a refusal, so the mitigation read `blank` and a
**critical** fired. Worse: answering no also fails the branch to
`clinical_evidence`, which holds `clinical_study_type` — **the only other
mitigating field.** Nothing the sponsor could do would silence it.

A rule now declares `negativeIsAnswer` for the fields where a negative answer
is an answer. The PMA side is the other kind and keeps firing:
`clinical_study_conducted: false` says no study was run, which **is** the
finding, unless the justification beside it is given.

The citation was wrong too: a 510(k) was being told about its route and cited
`21 CFR 814.20(b)(6)`, a PMA regulation. It now cites the statute that decides
the route, and says the thing that matters — a Class III device is a PMA route
unless it is a preamendments type.

## 6. A multi_select trigger read as empty

`strVal` returns `''` for an array, so every trigger reading a multi_select
read as empty. That is why the paediatric rule could not fire even once its
field was found. `mentions()` reads a string answer or an array.

## 7. A question hidden by its own gate read as blank

`reached` tested the node alone. `immunogenicity_assessment_planned` is gated
on `is_biologic`, asked in an earlier node. A programme whose product type
matches the trigger but which answered `is_biologic: false` — inconsistent, and
nothing refuses it — **never saw the question**, and completing its node made
the field read `blank`: a critical finding asserting the absence of something
never drawn, which is the exact defect yesterday's slice existed to end.
`reached` now also evaluates the field's own gate, through the same shared
evaluator.

`askedAt` also takes the **first** node that asks a field, not the last:
`risk_management` asks `hazard_identification_methods` in three nodes, and only
the last one counted.

## 8. Two hazards in the composite predicates

- **A hybrid `{field, operator, value, anyOf: […]}` compiles.** A union of an
  interface and an all-optional one defeats excess-property checking. At
  runtime it read as a field predicate and **discarded the group in silence**,
  hiding its leaves from the engine's own-node test. Half a gate is worse than
  either half, so it now throws.
- **A MIXED group would be decided three ways.** The engine sends a field whose
  gate names any field in its own node; the card's state holds only that node's
  inputs, so an earlier-node leaf evaluates against `undefined`; the validator
  has its real value. That is the unanswerable question `same-question-gate`
  was written to end, reopened. No mixed gate exists — and a sweep over every
  flow now keeps it that way.
- The both-keys semantics (`anyOf` **and** `allOf` means both must hold) had no
  test: rewriting it to OR left four suites green. It has one now.

## What the split was for

`issue-detector.ts` crossed the 500-line limit, so the asked/blank/pending/
unasked machinery moved to `cross-node-context.ts` — the part that decides what
the interview established, which is the part carrying the invariants. The rules
and the runner stayed. `fieldsAskedBy` and the types are re-exported, so every
caller and gate is unchanged.

## Verified by making each check fail

| Mutation | Refused by |
|---|---|
| the submitted node left out of the cross-node state (**the rule I killed**) | `reports a same-node finding when the answer is given` — the engine-level test. **It survived the first time**, because every other test in the file builds its own state; that is why the test exists |
| the gate back to a union over all flows | `is reachable IN EACH FLOW IT APPLIES TO` |
| a hidden field's gate ignored | `is not a question they declined when its own gate hid it either` |
| `negativeIsAnswer` ignored | `leaves a 510(k) that needs no clinical data alone` |
| the paediatric trigger blind to a multi_select | `reads the paediatric population protocol_development actually asks about` |
| the BLA accelerated basis unread | `reads the accelerated-approval basis the BLA interview asks for` |
| the 510(k) citation back to the PMA regulation | `cites the route a 510(k) is being told about` |

```
$ npx vitest run server/services/ana/intelligence-questions/__tests__ \
      shared/regulatory/__tests__ tests/ana-intelligence
Test Files  46 passed (46)
     Tests  712 passed (712)

$ npx vitest run server/routes/__tests__          # the whole route suite
Test Files  434 passed | 1 skipped (435)
     Tests  4218 passed | 7 skipped (4225)

$ TYPECHECK_HEAP_MB=20480 npm run ci:typecheck:no-regression
errors found: 0 — OK, matches baseline
$ node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD
6 lintable file(s) changed -- no file changed its warning count
```

## What this slice does NOT fix, from the same audit

- **The write-path half** — a programme change can commit with **no audit row**
  and every layer reports success, because the write discards the outcome
  `auditService.logAction` returns; and my extraction moved that discard where
  `ci:discarded-audit-write` cannot see it, vacating the route's baseline slot.
  That is the next commit, not this one, and it is the more serious of the two.
- `isRefusal` not looking inside an array (`'none'` refuses from a select and
  mitigates from a multi_select). Latent: no mitigating field is a multi_select
  with a `none` option today.
- `ind_submission`'s `study_population` cannot say paediatric, so the rule is
  live in `protocol_development` only. Recorded in the rule's own comment and
  as task #19 — the gate measures field ids, not offered values.
- `BranchRule.when` and `IssueCheck.condition` are still single-field, so
  `visibleWhen` and `branches` have different expressive power.

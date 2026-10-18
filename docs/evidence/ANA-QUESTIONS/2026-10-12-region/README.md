# The route question is asked for the regulator the project named

Fourth slice of the founder's directive of 2026-10-12, and the one the previous
one named as next.

## The defect

`project-setup` built its device route list at flow-definition time:

```ts
const devicePathways = pathwayOptions({ domain: domainFor(ctx?.clientType ?? 'medtech'), region: 'US' });
```

A flow file is constructed before any answer exists, so the region could only
ever be a constant. Once the agency question became governed and the catalogue
learned to mark a position the answers contradict, the consequence was visible:
a European device programme was shown **the four FDA routes with every one
marked inapplicable**. Correct, and the wrong question.

Two further defects sat behind it:

1. **A device or diagnostics project was never asked its regulator at all.**
   The device branch left from `product_details`, before `regulatory_targets`,
   so it skipped the agency question. The platform never learned which
   regulator a device programme was for — which is what keys the Module 1
   backbone, the validation profile and the gateway, and now the routes.
2. **Two questions asked the same thing.** A device project that *had* reached
   `regulatory_targets` would have been asked `submission_type` — the medicines
   list, with `510k` and `pma` among ten labels in a second vocabulary — and
   then `device_submission_pathway` from the catalogue.

## What this adds

A field can now declare the governed catalogue its positions come from, and the
**engine** resolves it as the question is drawn:

```ts
optionsFrom: 'device_pathway_positions'
```

`server/services/ana/intelligence-questions/governed-options.ts` resolves it:
the domain from the programme (a diagnostics product gets the IVD routes —
`US_510K_IVD`, not `US_510K`), the region from the agency the project named.

Two rules it keeps, and a third that follows from them:

- **It never draws an empty select.** Japan's filings are in the registry, but
  what taking one commits a sponsor to is not written. For PMDA the question
  carries no positions, says so **by name** — *"AnA holds no routes to market
  for PMDA … she will not offer another regulator's routes in their place"* —
  and takes the answer in the person's own words.
- **It says whose routes these are**, in every case, including when no agency
  has been named yet and the list therefore falls back to FDA's: *"No primary
  agency has been named yet, so these are FDA's routes."* A person must not
  have to infer which regulator a list belongs to.
- **The escape hatch is guaranteed, not merely preserved.** This catalogue
  holds the US and the EU only, so a required route question for a Japanese
  programme would otherwise have no answer that satisfies it — a deadlock
  rather than a closed list. Both branches of that guarantee are tested, and
  both mutations of it are red.

### One resolution, for the draw and for the validator

A field that draws from a catalogue carries **no static options**. A validator
reading the raw flow definition would therefore see a field with no list and
accept any string: a question that offers positions but enforces none. So
`engine.ts` resolves the node **once**, in one function, and both readers use
it — `buildQuestionEvent` for what the person is shown, and `advanceFlow`
before `validateAnswers`.

The resolution is deliberately asymmetric, and this is the subtle part:

| Reader | Facts used | Why |
|---|---|---|
| the drawn question | the answers already given | it is what the person can have known |
| the validator | the same | a person is judged against the list they were actually shown |
| the caution record | those **plus** the answer being submitted | the trail is judged against everything known |

So an agency arriving in the same answer as the route does not retroactively
refuse the route — and the contradiction is still on the record. Both halves of
that are one test, and the mutation that drops the asymmetry is red.

### The flow, corrected

    product_details → regulatory_targets → [device?] → device_classification
                                         → medtech_regulatory → [multi-country?]
                                                              → team_assignment

Every project is asked its regulator. `submission_type` is now hidden for a
device or diagnostics product, because `device_submission_pathway` is that
programme's route question and asking both asked the same thing twice in two
vocabularies. `createProjectSetupFlow` takes no context any more: both things
it used context for are resolved from the answers, which is the only place
that knows them.

> **Correction (2026-10-12, from the review in `../2026-10-12-review/`).**
> This section claimed "a multi-country device project now reaches the timeline
> question it used to skip". **It did not.** The only branch to
> `multi_country_setup` was declared on `submission_route`, which a device
> project skips — so a device programme that had just said its filing was
> multi-country was still never asked about it. The branch the claim described
> is now on `medtech_regulatory`, with a test and a mutation for each path.
> The claim was false when it was written.

### On the client

A question with no positions and an escape hatch now draws the own-words box
**alone** — no radio to select first — and still records the answer as
`OTHER_POSITION` plus the person's words, so the record distinguishes their
wording from a position AnA offered. Before this it would have fallen through
to a bare text input, and the answer would have been stored as if it were a
governed value.

## What this means for the region caution rule

The rule added in the previous slice — a position whose region is not among the
agencies named is `inapplicable` — is no longer what protects the route
question: the question now offers the right regulator's routes, so there is
nothing to mark. It stays as the catalogue's own guard, and it is still
reachable in two ways that matter: an answer stored before the list was
region-aware, and any caller that resolves positions for a region the project
did not name. Its tests now live where it is reachable — at the catalogue
(`pathway-availability.test.ts`) and on the record
(`cautioned-positions.test.ts`) — and the engine test says plainly that the
drawn question needs no marks.

## Verification

- `pathway-question-uses-the-catalogue.test.ts` rewritten to drive the **real
  engine**, because what a person is offered is the drawn question and not what
  the flow file holds (22 tests): FDA's routes for an FDA project; the MDR
  conformity routes for an EMA one, with no FDA route present; the IVD routes
  for a diagnostics programme in either region, read from the answer *or* the
  client's segment; no positions and the reason by name for PMDA; the
  assumption stated when no agency has been named; the flavours still gone and
  513(g) still there; the escape-hatch guarantee in both branches; the question
  order, including that a device project is asked its regulator first; and the
  validator judging against the list the person was shown.
- `cautioned-positions.test.ts` (19): the primary region is its own fact, read
  from the primary agency alone; a route to an unnamed regulator is not offered
  at all; and the record still catches an answer that names one.
- `anaQuestionCard.test.tsx` (13): the no-positions question draws the reason
  and the own-words box, no empty list, and records the answer as the person's
  own words.
- `mutations.txt`: **11 mutations, all red** — the list ignoring the regulator
  and always being FDA's; an empty select for a regulator the catalogue holds
  nothing for; the validator reading the unresolved question (the hole); the
  list judged against the answer being submitted rather than the one shown; the
  escape hatch dropped in each branch; the primary region read from the
  additional agencies too; a diagnostics programme offered the plain device
  routes; the question not saying whose routes these are; a device project not
  asked its regulator; and the card drawing a bare text box where the catalogue
  holds nothing.
  One of them first survived: *the escape hatch dropped where the catalogue
  holds nothing* changed nothing, because the flow that asks the question
  declares `allowOther` itself. The guarantee is the resolver's, so it is now
  tested through the resolver with a field that declares none — and both
  branches are red.
- `green.txt`: the question engine, both governed catalogues, the wider
  `tests/ana-intelligence` tier and the card — **31 files, 599 tests**.
- `ci:typecheck:no-regression` (0 errors) and the design gates pass; the
  per-change lint ratchet reports no file gained a warning. The typecheck gate
  caught what the tests could not: the union member was declared
  `'pathway_positions'` and written `'device_pathway_positions'` in both the
  flow and the resolver, so every test passed — the two strings matched each
  other — while the declared type matched neither. Vitest does not typecheck,
  which is why the gate is a gate.

## What is still open

- **`submission_type` is still a hand-written list of ten** for medicines, in
  its own vocabulary, and `APPLICATION_TYPES` in `types/submission-constants.ts`
  is a second one with nine bare labels. The mechanism to retire both now
  exists: a `medicine_pathway_positions` source, resolved by modality and
  region. That is the next slice, and it makes the medicines question as
  regulator-aware as the device one.
- **The remaining question kinds**: predicate strategy (which carries the
  explicit *no predicate* the marking rules still lack), device and IVD
  classification, designation — for which `shared/regulatory/special-designations.ts`
  already holds a governed taxonomy with each programme's basis, eligibility
  and incentives — paediatric plan, and comparability.

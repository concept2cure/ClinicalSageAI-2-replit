# Model-governance decisions — the adoption path, and what the PQ must measure

**Status: decided, 2026-10-13.** The founder delegated these decisions on
2026-10-13:

> "Become the founder, the subject matter expert for life science document
> creation, and the product manager for this entire platform, and make those
> decisions, and make the decisions that are best for the clients, the human
> users, and their needs in all use cases."

They were made under that delegation in session `…01TTTQ1hpdMr1yAMVYH4nYdE`,
which had raised them as open questions at the close of the AnA reasoning
lane's round 15. Where a later document or a session's rule disagrees with this
record, this record wins until the founder says otherwise.

Nothing here widens the launch catalog. Both decisions are about an existing
gate (CLAUDE.md RULE 2: "only PQ-passed models serve high-risk regulatory
drafting") and they bear on launch row D4.

---

## P-30 — there is no per-save adoption path, and there will not be one

**Decided: no.** A reviewer of round 15 proposed that a save carrying an
unadmitted model's text could proceed on an explicit, audited flag —
`adoptUnqualifiedMachineText: true` — meaning "I adopt these words as my own,
having been told the model is not approved." It is not built and it should not
be.

**Why.** RULE 2 says a model is selectable "only as an approved-models entry
with a pinned version, rationale and eval reference". Admitting a model's text
as governed content is therefore a *registry* act, with evidence attached. A
request-body flag would be a second admission channel: weaker than the
registry, carrying no evidence, and held by the party with the incentive to use
it. This platform has already been bitten by exactly that shape — round 15's
Door 2 found `provenance.model` accepted from the caller and validated only as
a string, and closed it with one invariant: *the model comes from the turn
record or not at all — no privileged second channel, because that is how the
defect got in.* A per-save adoption flag is that channel, reintroduced with a
better name.

**What the person can already do, which is the honest path.** Save the words as
their own assertion. The save door records them as that, discloses the claim
and its reason on the Part 11 row, and tells the author in the confirmation.
That is a true record of what happened: a qualified human took responsibility
for the text. What they cannot do is have the record say an unqualified model
authored filed content — which is the whole point.

**The consequence, stated plainly.** In production no approved model has a
passed PQ, so today AnA's prose cannot be *credited to AnA* in a governed
record at all; the save door refuses it with
`MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE`. That is the correct client outcome. A
sponsor cannot tell an inspector "our AI drafted this section and we hold no
qualification evidence for the model." The unblocking act is to run a
performance qualification worth passing — which is P-31, not a flag.

---

## P-31 — PQ-DRAFT-001 is not approved as written, and two of its gates were
## fail-open

`server/eval/pq/pq-protocol.json` is `status: draft`, `approvedBy: None`. It is
waiting for exactly the act this delegation covers. I am **not** approving it,
and the reasons are specific. Two of them were defects in the gate rather than
in the protocol's numbers, and both are fixed in this change; the third is
authoring work that is now named and owed.

**The window matters.** `run-pq.ts` writes `protocolSha256: sha256(protocolText)`
into every PQ record and `verify-pq-record.ts` refuses a record whose hash
differs from the current protocol. So amending the protocol after a model has
passed invalidates that pass. Zero models have passed. **The time to correct
the criteria is now, and it closes the moment the first model does.**

### 1. A mean is not a qualification. Fixed.

`minFaithfulness: 0.7` was applied as an arithmetic mean over the counted items
(`pq-verdict.ts` `ragCriterion`: `values.reduce((a, v) => a + v, 0) / values.length`).
The judge is instructed that 0 means the answer is "unsupported or
contradicted" (`eval/rag/rag-metrics.ts` `judgeFaithfulness`). At the
protocol's own sample floor of 30 items, **nine answers could score 0.0 and the
mean would still clear 0.70** — thirty per cent of the bank could be
fabrication and the model would qualify to draft high-risk regulatory content.

That was also internally inconsistent: the generation component already uses
the right shape for a harm that is per-item — `maxForbiddenHits: 0`, an
absolute zero rather than an average.

**Decision:** the rag component gains `minItemFaithfulness: 0.5`, applied
beside the mean, not instead of it. Both apply. The value sits where the
judge's own wording changes meaning: below 0.5 the judge holds the answer more
unsupported than supported, and none of those is tolerated; partial support
above it is a quality question, which is what the mean measures. The individual
fabrication at *run* time is caught by the deterministic answer-grounding
engine, which is what RULE 2 means by "numbers and verdicts come from
deterministic engines; the model narrates" — this protocol's job is to catch a
model that is *systematically* unfaithful.

A protocol declaring no per-item floor now cannot qualify the component, on the
same fail-closed footing as one declaring no sample floor.

### 2. An extraction criterion that could not be applied was skipped in
### silence. Fixed.

`extractionFindings` read `ext.criteria.minF1` and applied it only
`if (typeof minF1 === 'number')`. So a protocol whose extraction minimum was
**missing**, **misspelt** (`minFI` reads as the real key) or a **string** had no
extraction criterion at all, contributed nothing to `missed`, and the PQ
**PASSed on it** — demonstrated at F1 = 0.1 before the fix. A `NaN` minimum was
worse: it is a number, and nothing ever compares below `NaN`, which is a hazard
the file already names of the rag mean.

The rag component has reported every criterion it cannot apply since the
2026-09-28 fail-closed work. Extraction never got the same treatment.
**Decision:** it does now, through one shared module
(`server/eval/pq/pq-criteria.ts`) rather than a second copy of the rule — a
third, looser copy for the next component is how extraction came to have none.

### 3. The protocol needs an extraction sample floor, and the bank cannot meet
### one yet. Owed, not faked.

Generation requires `minTasksPerDocType: 10` and the bank sits **exactly** at
it (10 generation tasks each for 510k, cer, ind — no headroom; retire one and
it drops below). Extraction has **no count criterion at all**, so its 4 tasks
per document type satisfy the protocol by having nothing to satisfy.
`pq-verdict.ts` states the consequence of an absent floor in its own words:
"without one here, one scored item out of a 30-50 item gold set would qualify
the component."

The floor that matches generation is 10 per document type: **18 extraction
tasks are owed.** They are not added here and no criterion is declared for
them, deliberately:

- an extraction task needs real source text and real expected fields.
  `gold-tasks.json` says of itself that tasks added to reach a floor carry no
  captured candidate "because no output had been captured for them and
  inventing one would fabricate the evidence the bank exists to provide."
  Inventing ground truth would be the same act, one layer worse.
- declaring a floor the bank cannot meet would turn `gold-bank-floor.test.ts`
  red without making any model better qualified, and
- the protocol is `draft`, so it can qualify nothing in the meantime either
  way: "a PQ against acceptance criteria nobody has approved is not a PQ."

### 4. The bank does not cover what the platform sells. Owed.

The bank covers `510k`, `cer`, `ind`. CMC / Module 3 joined the launch catalog
under P-28 with a small-molecule US-IND boundary, and Authoring's Module 2.5–2.7
overviews and summaries are classified inherently high-stakes by this
platform's own router (AnA reasoning round 7). **A model qualified on
510k/cer/ind evidence would be admitted to draft Module 3 and Module 2 content
it was never evaluated on.** Document types for those are owed before approval.

### What approval of PQ-DRAFT-001 now requires

1. the per-item faithfulness floor — **done in this change**;
2. extraction criteria that cannot be silently skipped — **done in this
   change**;
3. an extraction sample floor of 10 per document type, and the 18 authored
   tasks that let the bank meet it;
4. gold-bank coverage for CMC / Module 3 and Module 2.5–2.7;
5. generation headroom above its floor, so retiring one task does not drop the
   bank below it;
6. a product provider key, and the RAG attribution items D4 already lists.

Items 3–6 are authoring and operations work, not judgement calls. When they
land, the approval is a signature, and this record is the reasoning behind it.

### The strongest argument against this decision

That it makes a blocked gate more blocked. AnA cannot be credited as an author
in production today, and P-31 adds two conditions and names two more before
that can change — so a client who wants AI-drafted regulatory content waits
longer. The answer is that the alternative is worse in the one place it counts:
a protocol that can qualify a model's extraction on four examples, and its
faithfulness on an average that tolerates thirty per cent fabrication, would
hand that client a qualification claim their own QA would reject and an
inspector could dismantle. A gate that says "not yet, and here is exactly
what is missing" is worth more to them than a certificate that does not hold.

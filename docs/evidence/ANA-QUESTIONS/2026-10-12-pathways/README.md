# One governed list of pathway positions, and three defects found reaching it

The second half of the founder's directive of 2026-10-12: *"make this
consistent and subject matter intelligent across all medical device and
diagnostics scenarios and all Biotech scenarios."*

The first half gave a question a shape — positions with what they commit you
to, and one the person can write themselves. This gives the pathway question
its content, from the platform's own governed sources rather than a list typed
into a flow.

## What was there: the same question, four answers

| Where | What it held |
|---|---|
| `global-document-registry.ts` `GLOBAL_REGISTRY` | the authoritative id space: 234 filings with region, agency, segment, format and validation profile. It knows `US_505B2` is not `US_NDA`, and `US_DE_NOVO_IVD` is not `US_510K`. It does not say what choosing one commits you to. |
| `modality.ts` `MODALITY_FRAME[*].pathways` | which statutory pathways apply to a modality, default first, with the fee programme. Drugs and biologics only, named in its own words (`NDA 505(b)(2)`). |
| `types/submission-constants.ts` `APPLICATION_TYPES` | nine bare labels, drug and device mixed, no domain awareness. |
| `flows/project-setup.ts` | two more hand-written lists: `submission_type` (ten) and `device_submission_pathway` (seven). |

So the person answering AnA's interview saw a list matching neither the
registry the platform files against nor the frame it reasons with. And
`device_submission_pathway` was wrong in its own right: it offered the three
510(k) *flavours* (Traditional, Special, Abbreviated) as if they were distinct
pathways — a question the 510(k) flow asks itself — while omitting exemption
and the 513(g) that clears nothing, and saying nothing about consequence or
authority.

## What this adds

`shared/regulatory/pathway-positions.ts` is **not a fifth list**. The positions
*are* registry entries; this module holds, per registry id, what taking that
position commits the programme to and the authority that makes it a position.

- **Both directions of coverage are gated.** A filing the registry gains in a
  route-to-market family cannot reach a person as a bare label, and an
  annotation for an id the registry does not hold is an orphan. Writing that
  gate immediately found 15 routes I had missed — including the EU MDR class
  routes, the IVDR class routes, and the EU MAA, CMA, biosimilar MAA and
  generic DCP, all of which the registry already held and my first draft had
  hand-written worse.
- **The modality frame decides what a drug programme may take**, in its own
  order (default first). A bridge maps its pathway names onto registry ids,
  and a test holds that every one resolves — the first check in the codebase
  that those two governed modules agree with each other.
- **A position that is not a route to market says so**: 513(g), the Q-Sub, the
  IDE, the CLIA waiver, the IVDR Article 48(6) consultation and the EU
  reference-laboratory consultation each carry `marketingRoute: false`, and the
  option a person reads is labelled "— not a route to market".
- **Coverage:** US and EU across pharma/biotech, medical devices and
  diagnostics. Japan, Health Canada and the rest are in the registry but
  nobody has written what those positions commit a sponsor to, so the resolver
  returns nothing for them and the caller must say so. The LDT position says
  plainly that FDA's enforcement stance moved in 2024 and is contested, rather
  than asserting a citation that may be wrong by the time it is read.

`project-setup`'s `device_submission_pathway` now draws the catalogue, keyed to
the client's own segment, and gained the escape hatch it never had. The
predicate question is gated on the 510(k) position rather than on two of its
three flavours — every 510(k) names a predicate.

## Two further defects, found by the typechecker and the gate

Neither was in the directive; both sit squarely inside it.

**1. The device and IVD interviews were unreachable.**
`getFlowDefinition` withholds a flow whose `clientTypes` exclude the client.
The segment came from
`ctx.projectType === 'medtech' ? 'medtech' : … : 'pharma'` — but `projectType`
carries the **submission** type (`IND`, `NDA`, `510k`), never a segment. So it
never matched, every interview ran as `'pharma'`, and the 510(k), PMA and CER
flows were withheld from exactly the clients they are written for.

It now derives the segment properly, and where the value says nothing it
returns **null**, which means *no restriction*. That is the honest reading of
not knowing: a wrong segment silently removes whole interviews, and a person
who came to start a 510(k) would be told no such flow exists. Moved out of the
executor into `intelligence-questions/client-segment.ts` so it can be tested
without loading a 21,000-line module — the first version of that test timed
out at 10s on the import, and could also have passed vacuously.

**2. Diagnostics had no segment at all.** `clientTypes` was
`'pharma' | 'biotech' | 'medtech'`. An IVD programme was therefore read as
pharma. `'ivd'` is now its own value, and the 510(k) and PMA flows declare it,
because a diagnostics programme files those (`US_510K_IVD`, `US_PMA_IVD` in the
registry). A diagnostics client is offered the IVD positions — including the
companion-diagnostic routes — not the plain device ones.

## Verification

- `pathway-positions.test.ts` (18): both directions of coverage; every frame
  pathway resolves; the distinctions a programme turns on (505(b)(1) against
  505(b)(2), 351(a) against 351(k), 510(k) against De Novo); non-routes say so;
  every pair the module claims holds something, and one it does not holds
  nothing.
- `pathway-question-uses-the-catalogue.test.ts` (11): the flow asks the
  catalogue and not its own list; a diagnostics client gets different positions
  from a device client; the flavours are gone and 513(g) is present; the escape
  hatch survives; the reachability and segment fixes.
- `mutations.txt`: **11 mutations, all red** — an annotation outliving its
  filing, a route left unannotated, a frame pathway losing its filing, the
  frame no longer deciding, a position without its authority, a non-route
  presented as a route, the label dropping the warning, the flow writing its
  own list again, the flow ignoring the client's segment, the predicate asked
  on the wrong answer, and the escape hatch removed.
- The whole question engine: 8 files, 112 tests. `npx tsc --noEmit`: 0 errors.

## What is still to do

- The remaining question kinds: predicate strategy, device and IVD
  classification, designation (orphan, fast track, breakthrough, RMAT, PRIME,
  Breakthrough Device), paediatric plan (PSP/PIP), comparability. Each is the
  same shape as this one.
- `APPLICATION_TYPES` in `types/submission-constants.ts` is still a fifth list
  with nine bare labels. It is used by surfaces outside the interview, so
  migrating it is its own change with its own callers to check.
- **Withholding a position that cannot apply** — offering De Novo against a
  clear predicate, or a 351(k) with no reference product — is a product
  decision the founder has not yet made, and is deliberately not implemented:
  the catalogue offers what the registry and frame allow, and the person
  chooses.

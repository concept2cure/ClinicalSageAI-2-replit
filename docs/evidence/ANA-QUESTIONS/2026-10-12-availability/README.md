# A position the programme's own answers contradict is marked, not hidden

The open question left by the pathway catalogue
(`../2026-10-12-pathways/README.md`), decided here as subject-matter expert
under the founder's standing delegation and their instruction of 2026-10-12:
*"Become the sme and study what is the best choice for our highly specialized
platform and do that."*

## The question

The catalogue offered every position the filing registry and the modality frame
allow, flat. So a sponsor who had just said *Class III* was offered a 510(k)
with nothing said about it, and a sponsor who had named a predicate was offered
a De Novo the same way. Both are wrong options rather than neutral ones.

Three designs were available.

| | What it does | Why not |
|---|---|---|
| **Offer it flat** | the status quo | Invites a filing on a basis the sponsor cannot support, and the interview — which feeds document authoring and a Part 11 record — shows no sign anything was odd. "Nothing checked is never clean" is this repository's rule; so is "an error is never rendered as an empty result". |
| **Withhold it** | drop the contradicted option | The question then lies by omission. A sponsor may have reasons the interview has not been told (a reclassification in progress, an NSE already received, a product-code dispute), and an absent option cannot be argued with. This engine has already been bitten by hidden options: a wrong client segment silently removed the whole 510(k), PMA and CER interviews from the clients they were written for, and nobody saw it for months. |
| **Mark it** | offer it, say what contradicts it, record the choice | **Chosen.** |

Marking is what a regulated platform owes in both directions: the sponsor keeps
the decision, which is theirs and not the software's, and the record carries
what they were told and what they chose anyway. It is the same shape as the
escape hatch landed earlier in the day — AnA says what she knows, the person
decides, and the record says which is which.

## What it does

`PositionAvailability` in `shared/types/intelligence-questions.ts` is the
decision in three values, and the reasoning is written there, not here:

- `available` — nothing in the answers speaks against it. **This is what an
  unknown fact means.** Not knowing is not a contradiction, so an interview
  that has not reached the question marks nothing at all.
- `needs_basis` — still open, but only with a justification the answers do not
  yet contain.
- `inapplicable` — the answers contradict it outright.

A marked option carries a `PositionCaution`: the availability, the reason
*naming the answer that creates the contradiction*, and the authority that
makes the contradiction one. Nothing in it is written by a model.

**The line between hiding and marking.** The catalogue draws it explicitly: the
**domain** decides which positions exist — a monoclonal antibody is licensed
under section 351 and the modality frame does not offer it an NDA, because that
is which statute governs the product — and the programme's own **facts** decide
which of those carry a caution. A caution is a mark on an offered position,
never its removal.

### The rules, and why only these

`CAUTION_RULES` in `shared/regulatory/pathway-positions.ts`:

| Fact the person stated | Marks | As |
|---|---|---|
| A predicate is named | De Novo (device and IVD) | `needs_basis` — a De Novo has two entry conditions, no legally marketed device to compare to or an NSE determination on a 510(k) already filed; the submission must say which applies (FD&C Act 513(f)(2); 21 CFR 860 Subpart D) |
| Class III | De Novo | `needs_basis` — a De Novo classifies into Class I or II with special controls |
| Class III | 510(k), IVD 510(k), companion-dx 510(k) | `needs_basis` — and the caution names the basis that would allow it: a preamendments type for which FDA has not called for PMAs (FD&C Act 515(a); 21 CFR 814.1(c)) |
| Class I | the same three | `needs_basis` — most Class I devices are exempt from premarket notification by their own classification regulation |
| Class I or II | PMA, IVD PMA, companion-dx PMA | `needs_basis` — premarket approval is the Class III route |
| An MDR class, against a different class's route | EU MDR Class I / IIa / IIb / III | `inapplicable` — the conformity route follows from the classification rules, not from a choice (MDR Art 51, Art 52, Annex VIII) |

**What is deliberately not here.** A rule nothing can reach is worse than no
rule, because it reads as a check that passes. So the fact model holds only
what the 17 flows can actually state today, and the loudest case is therefore
absent: *"there is no predicate"*, which would make a 510(k) `inapplicable`
outright rather than merely unsupported. No flow asks it — an empty predicate
box is an unanswered question, not a statement — and the predicate-strategy
question is where it will come from. A test holds that every rule can fire, so
this cannot be forgotten quietly.

The same reasoning rules out the reference-product rules (351(k) with no
reference product, ANDA with no RLD): the fact exists only as "named", and
"named" contradicts nothing.

### Where it reaches the person

`server/services/ana/intelligence-questions/programme-facts.ts` holds the other
half — which answer states which fact — and the two moments that matter:

- **As the question is drawn** (`withCautions`, from `buildQuestionEvent`): the
  options the answers so far speak against are marked. Nothing is added,
  removed or reordered, and a caution the rules no longer justify does not
  survive a redraw.
- **As the answer comes back** (`cautionedChoiceNotices`, from `advanceFlow`):
  taking a marked position is recorded on the interview's issue trail —
  `warning` for `needs_basis`, `critical` for `inapplicable` — carrying the
  reason, the authority as its reference, and the facts that triggered it. The
  record says the choice was the person's ("You have taken 510(k) anyway"), not
  that it was refused.

The facts are read from everything the interview holds **including the answer
being submitted**, so a question that asks for the classification and the route
together still leaves the record even where the caution could not have been
drawn in time.

`AnaQuestionCard.tsx` draws the caution on the row and leaves the row
selectable; once it is chosen it says AnA keeps the position open and records
the basis it was taken on. The submit button is not disabled: a caution is not
a refusal.

## The flow change this needed

`project-setup` asked for the device classification and the submission pathway
in **one question**. The classification is therefore unknown while the route is
being chosen, so the caution could only ever have arrived after the fact. The
classification is now its own question, asked first:

    product_details → device_classification → medtech_regulatory

which is also the order the regulation works in — the class decides which
routes are open — and is how the 510(k) flow has always been structured.
Nothing reads project-setup's answers by node id (checked across server,
shared and client), the flattened answer map is unchanged, and no node was
removed, so a persisted session resuming at `medtech_regulatory` still
resolves.

## Verification

- `shared/regulatory/__tests__/pathway-availability.test.ts` (15): an absent
  fact marks nothing; each rule fires on the fact it is about and not on its
  neighbours (a PMA is not marked for Class III, a 510(k) is not marked for
  Class II, an EU route is not marked by a US class); every rule can fire and
  every position a rule names is one the catalogue offers — the same
  two-directional check the catalogue runs against the filing registry; and
  marking removes nothing, proved by comparing the options with the facts
  against the options without them.
- `server/services/ana/intelligence-questions/__tests__/cautioned-positions.test.ts`
  (12): which answer states which fact, including that `class_iii` is not read
  as `class_ii`, that *Not yet classified* and a blank box state nothing, and
  that every fact field is **still a field some flow asks** — a rename would
  leave the rules in place firing on nothing, which reads exactly like a check
  that passes; that the drawn question carries the mark and still carries every
  position; that taking a marked position leaves a record with its authority;
  and that the record survives the fact arriving with the choice.
- `client/.../anaQuestionCard.test.tsx` (+3, 9 total): the cautioned row is
  present, says what contradicts it and on whose authority, can be taken, and
  says so only once taken.
- `mutations.txt`: **16 mutations, all red** — hiding an inapplicable position
  instead of marking it (both in the catalogue and in the drawn question), a
  caution without its authority, an absent fact read as a contradiction, a rule
  that fires with no fact behind it, *Not yet classified* read as a class, a
  prefix match that confuses Class III with Class II, a cautioned choice
  leaving no trace, the record dropping its authority, the De Novo rule
  inverted, the EU rule closing the route the class IS for, the question drawn
  without the facts, the facts ignoring the answer that arrives with the
  choice, the route asked before the classification again, the card dropping
  the caution, and the card refusing a cautioned position instead of recording
  it.
  One of the sixteen first showed as a survivor: *an absent fact is read as a
  contradiction* had been pointed at the catalogue's test file, which does not
  exercise the server-side fact reader. Re-run against the test that covers it,
  it is red on three cases. The mapping error was mine, not a gap.
- `green.txt`: the whole question engine and the governed catalogue, **24
  files, 337 tests**; the 11 v2 client suites that mount the card or the
  thread, **87 tests**. A run over every v2 client suite is not quoted: it was
  still going after 20 minutes on this box and was stopped, and an unfinished
  run is not a green one.
- `ci:typecheck:no-regression` (baseline 0), `ci:undefined-css-classes`,
  `ci:surface-text-ramp`, `ci:eslint-ratchet` (6123 warnings against a
  baseline of 6411; this change adds none).

## What is still open

- **The predicate-strategy question** is the next slice, and it carries the
  fact this mechanism is missing: an explicit *no predicate*, which makes a
  510(k) `inapplicable` rather than unsupported, and an NSE determination,
  which is the other entry condition for a De Novo.
- **The EU routes are not asked anywhere yet.** The MDR class rules are
  governed and tested, but `project-setup` asks only the US pathway, so they
  reach nobody until an EU route question exists. They are written now so that
  the question, when it lands, cannot invent its own answer.
- **Designation, paediatric plan and comparability** have no questions at all,
  and the facts they would state (an orphan designation, a PIP, a reference
  product) would mark positions these rules do not yet cover.

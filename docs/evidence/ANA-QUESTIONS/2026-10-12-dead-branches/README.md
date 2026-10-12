# 30 of 63 branches in AnA's interviews could never be taken

Found while putting the medicines route question on the governed catalogue: the
branch that sends a device project to its device questions did not fire. The
cause is one argument, and it is not specific to that flow.

## The defect

```ts
const nextNodeId = resolveNextNode(currentNode, answers, definition);
```

`answers` is the answers to **the question just submitted**. So a branch whose
predicate reads an earlier node's field was evaluated against a record where
that field is absent — and could never match.

`visibleWhen` and the validator have always read the flattened view of every
answer the interview holds; the engine's own comment beside the validator says
why (*"validate answers against the SAME answer set the renderer used"*).
Branching alone did not.

**Measured across every registered flow: 63 branch predicates, 30 of which
read a field from an earlier node.** All 30 were dead, and with them the
questions they guard:

| Flow | Field the branch reads | Questions never reached |
|---|---|---|
| `device_510k` | `is_sterile`, `contains_software`, `is_electronic`, `is_implant` | sterilisation, software classification, EMC testing, implant-specific — from five different nodes |
| `device_pma` | `contains_software` | software documentation |
| `bla_submission` | `product_class` | cell-therapy characterisation, vaccine lot release |
| `protocol_development` | `therapeutic_area` | oncology endpoints |
| `csr_report` | `therapeutic_area` | oncology efficacy, vaccine efficacy |
| `nda_submission` | `accelerated_pathway` | safety database |
| `risk_management` | `product_category` | SaMD hazards, pharma hazards |
| `stability_study` | `is_biologic` | biologics stability |
| `cer_report` | `is_novel_device` | novel-device assessment |
| `ind_submission` | `ind_application_type`, `ind_type_selection` | amendment change summary, IND review |
| `briefing_book` | `meeting_type` | product overview |
| `project_setup` | `organization_type`, `product_type` | the device questions (which is how this was found) |

Every one of those is the subject-matter intelligence these interviews exist
for: a sterile device never asked how it is sterilised, a vaccine BLA never
asked for lot release, a software device never asked to classify its software.
Written, reviewed, and unreachable.

## The fix, and what it changes

```ts
const nextNodeId = resolveNextNode(currentNode, { ...shownFlat, ...answers }, definition);
```

The flattened view, with this question's answers taking precedence — the same
precedence the validator and `visibleWhen` use, because the newer answer is the
newer statement of the same fact.

**Declared behaviour change.** Thirty branch predicates that have never matched
now match, across eleven flows. That is what their authors wrote them to do and
what the flows' own guidance text promises, but it changes the path an interview
takes: a programme that answered "yes, it contains software" will now be asked
the software questions. No node is removed, every branch target is a real node
(the flow-registry probe gates that), and the 33 predicates that read their own
node's field are unaffected.

## Verification

- `branch-reads-every-answer.test.ts` (4) holds the **engine's** behaviour on a
  two-node flow of its own, reproducing the defect's exact shape — the
  predicate names a field answered in the first node, the branch is declared on
  the second: the branch is taken; it is not taken when the earlier answer does
  not match; a predicate on the branching question's own field still works; and
  this question's answer wins where both hold the same field.
- `dead-branches-are-alive.test.ts` (5) holds the **consequence in the real
  interviews**: a 510(k) for a sterile device reaches the sterilisation
  questions, one containing software reaches the software classification, an
  electrically powered one reaches EMC testing (the flow's own branch order
  decides between them), a device with none of those still goes on to
  labelling, and a vaccine BLA reaches lot release.
- `mutations.txt`: **3 mutations, all red** — the defect restored (red on both
  the engine test and the real-flow test, 4 cases there), and the precedence
  reversed so an earlier answer would override this question's.
- Green after the change: 19 files / 422 tests across the question engine, the
  wider `tests/ana-intelligence` tier and the interview tools; 44 files / 1086
  tests across `server/services/cmc`, which holds the interview-commit
  projection that reads these answers.

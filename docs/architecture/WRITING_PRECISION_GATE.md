# Writing Precision Gate

The deterministic quality gate behind AnA's long-form scientific writing. AnA
was already a strong *section drafter* with deep standards knowledge and strong
prompt-level voice discipline, and it had several deterministic writing checkers
— but they were never composed into one pass or wired into a draft→critique→
revise loop. This is that composition: the machine-checkable half of
"greatest-in-class precision writing."

## The loop

```
draft ──▶ critique_draft ──▶ (verdict: revise?) ──▶ model revises against brief
  ▲                                                            │
  └──────────────── verify_revision ◀─────────────────────────┘
```

- **`critique_draft`** runs every checker over a draft and returns a 0–100
  precision score, a `pass`/`revise` verdict, per-finding detail, and an ordered
  **revision brief** (most severe first).
- The model revises against the brief.
- **`verify_revision`** re-runs the gate on before/after and confirms the score
  rose, findings were resolved, and no regressions were introduced — the
  deterministic loop-closer.

Both tools are pure/deterministic (no DB, no org context).

## Dimensions (`server/services/ana/writing-precision-gate.ts`)

Each dimension is a small helper that appends findings; the gate composes them
and folds severities into the score (`critical` −30, `high` −18, `medium` −8,
`low` −3; any critical/high forces `revise`).

| Dimension | Checker | What it catches | Severity |
|---|---|---|---|
| grounding | `grounding-core.assessGrounding` | a quantitative claim with no nearby citation | critical |
| consistency | `terminology-consistency.checkTerminologyConsistency` | same value stated two ways; one acronym expanded two ways; US/UK spelling & interchangeable-term drift | high / medium |
| readability | `medical-writing-qc.assessReadability` | reading grade over the audience target | high (patient) / medium |
| abbreviations | `medical-writing-qc.buildAbbreviationList` | acronym not defined at first use | medium |
| claims | `claim-precision.checkOverclaims` | unqualified superlatives, absolute safety, causal overreach, un-hedged efficacy | high / medium |
| structure | `medical-writing-review.reviewMedicalWriting` | required section missing for the document type | high |

New deterministic modules added here: `terminology-consistency.ts` (in-document
value / abbreviation / preferred-term consistency) and `claim-precision.ts`
(over-claim / spin). The rest reuse existing checkers.

## Why it's a moat

Every AnA draft — regulatory *and* commercial — can pass through one
deterministic gate that a blank-page competitor tool has no basis to replicate:
the grounding check is anchored to the same citation markers the Living Record
Spine uses, the value-consistency check reuses the same numeric extractor as the
dossier reconciler, and the whole gate is machine-checkable rather than a prompt
suggestion. Precision becomes a verifiable property, not an aspiration.

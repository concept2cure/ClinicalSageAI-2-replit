# Writing Precision Gate

> Ported 2026-09-30 from abandoned PR #1003 (dc25698fb, 41fe41860) onto
> `concept2cure-v2`. Two deliberate differences from the PR are recorded under
> *Port notes* below.

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

- **`critique_document`** critiques a whole multi-section document: it runs the
  gate per section for located findings AND checks consistency across the full
  concatenation, so a value stated one way in §1 and another in §3 — invisible
  to any single-section pass — is caught. This is the cross-section coherence
  long documents lacked.

All three tools are pure/deterministic (no DB, no org context).

## Dimensions (`server/services/ana/writing-precision-gate.ts`)

Each dimension is a small helper that appends findings; the gate composes them
and folds severities into the score (`critical` −30, `high` −18, `medium` −8,
`low` −3; any critical/high forces `revise`).

| Dimension | Checker | What it catches | Severity |
|---|---|---|---|
| grounding | `grounding-core.assessGrounding` | a quantitative claim with no nearby citation | critical |
| consistency | `terminology-consistency.checkTerminologyConsistency` | a document-level quantity (randomized / enrolled / sample size, MRSD, shelf life) stated two ways; one acronym expanded two ways; US/UK spelling & interchangeable-term drift | high / medium |
| readability | `medical-writing-qc.assessReadability` | reading grade over the audience target | high (patient) / medium |
| abbreviations | `medical-writing-qc.buildAbbreviationList` | acronym not defined at first use | medium |
| claims | `promotional-screening.screenPromotionalLanguage` (existing), in the `submission` register by default, plus `clinical-regulatory-evidence/governance.detectUnsupportedClaims` (composed, submission register only) | superiority, absolutes, unqualified safety, causal overreach, unsupported comparatives, promotional tone; in the submission register, a hit inside a `SUBMISSION_TERMS_OF_ART` entry (ICH E3 §5.3 consent statement, Breakthrough Therapy designation, test-of-cure endpoints, best supportive care, PK elimination, biopsy-proven, …) is dropped and listed in `claimExemptions` with its basis; a predicted approval or "the study was successful" is a `regulatory_outcome` finding; an approval match is dropped only when every named approver is on a deny-list of protocol-governance bodies ("approved by the sponsor / the IRB / the Safety Review Committee", "the Medical Monitor will approve") and nothing after the last one may name another agent, so a date ("by the end of 2027"), any regulator ("by MHLW", "the Food and Drug Administration will approve") or a later agent ("by the IRB, then by FDA", "by the sponsor (FDA)") stays flagged; "resolved completely" is exempt only as an intransitive AE outcome ("resolved completely without sequelae", "completely resolved by Day 10"), never with an object ("completely resolved the disease") | high / medium / low |
| structure | `medical-writing-review.reviewMedicalWriting` | required section missing for the document type | high |

The claims **register** is a tool input (`register: 'submission' | 'promotional'`)
on `critique_draft`, `verify_revision` and `critique_document`, defaulting to
`submission`, and is echoed in every result. `screen_promotional_language` keeps
the `promotional` register (every lexicon hit). Each terms-of-art entry carries an
`E3Basis` (`regulator-text` with URL, `recall`, or `platform-convention`); the
facts are in `docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04-depth/b3-writing-gate-register-facts.md`.
A term of art is matched by its own syntax, not by a sentence-wide span: "All
patients provided written informed consent" is exempt, "All patients responded to
treatment and completed the study" is not; "eliminated by renal excretion" is
exempt, "eliminated tumour recurrence in patients with renal impairment" is not.
The over-claim guards in `writing-gate-regulatory-register.test.ts` lock both
sides.

One new deterministic module: `terminology-consistency.ts` (in-document value /
abbreviation / preferred-term consistency). Everything else reuses an existing
checker.

`critique_document` also reports a required section missing from the document
as a whole (structure) among its document-level findings.

## Port notes

1. **No `claim-precision.ts`.** The PR added a second over-claim lexicon beside
   `promotional-screening.ts`, covering the same categories. Zero duplication:
   the claims dimension composes the existing screener.
2. **In-document value consistency is narrowed.** The PR grouped every fact the
   cross-artifact extractor returns by bare label, which is right *across*
   documents and wrong *inside* one: p-values, CIs, n per arm, doses per cohort
   and visit weeks are legitimately multi-valued. On an ordinary results
   paragraph ("N=186 randomized; n=93 per arm; week 12 (p=0.003), week 24
   (p=0.041); N=184 completed") it returned three HIGH findings and forced
   `revise`. The port only compares quantities a document states once — see
   `checkValueConsistency` — and the test file pins that paragraph to zero
   findings. Acronym conflicts ignore an expansion that merely carries a
   leading qualifier ("Median Progression-Free Survival (PFS)").

## Why it's a moat

Every AnA draft — regulatory *and* commercial — can pass through one
deterministic gate that a blank-page competitor tool has no basis to replicate:
the grounding check is anchored to the same citation markers the Living Record
Spine uses, the value-consistency check reuses the same numeric extractor as the
dossier reconciler, and the whole gate is machine-checkable rather than a prompt
suggestion. Precision becomes a verifiable property, not an aspiration.

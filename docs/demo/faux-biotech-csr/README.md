# Faux Biotech Therapeutics — synthetic CSR demonstration dossier

**DATA-ONLY DEMO SCENARIO — NO APPLICATION CODE CHANGES**

**Provisioning status:** Not created in the hosted application. GitHub stores a scenario definition; it does not provision a Concept2Cure tenant or create live application records. The complete generated dataset is delivered separately as `Faux_Biotech_CSR_Full_Lifecycle_Demo_Data.zip` in the ChatGPT handoff. This README is not evidence that it was imported.

## Fictional client and study

- Organization: **Faux Biotech Therapeutics [DEMO / FICTIONAL]**
- Proposed organization slug: `faux-biotech-therapeutics-demo`
- Industry: Biotech & Pharma
- Proposed workspace: Clinical Development / CSR Demonstration
- Primary project: **FBT-201 — Clinical Study Report**
- Study protocol: **FBT-201-2026**
- Investigational biologic: **FBT-201**, fictional
- Phase: **2**
- Indication: moderate-to-severe plaque psoriasis
- Study design: randomized 1:1, double-blind, parallel-group, placebo-controlled
- Data cut: 2026-09-30
- Required badge: **Synthetic / for demonstration only — not clinical evidence**

## Related fictional projects

1. **FBT-102 — Nonclinical to IND** (planning; demonstration shell only)
2. **FBT-201 — Phase 2 CSR** (active; supplied synthetic evidence package)
3. **FBT-202 — Phase 3 Protocol Planning** (planning; demonstration shell only)

Do not report these as application records until an actual authenticated import creates and verifies them.

## Dataset inventory (complete external handoff archive)

- `01_ADSL_synthetic.csv`: 160 artificial randomized IDs, 80 per arm
- `02_ADEFF_synthetic.csv`: baseline and Week 12 PASI data, 320 rows
- `03_ADAE_synthetic.csv`: 79 illustrative AE rows (one per affected subject)
- `04_ADLB_synthetic.csv`: 320 illustrative ALT observations
- `05_TLF_11_4_primary_efficacy.csv`: primary endpoint table
- `06_TLF_12_2_safety.csv`: safety summary
- `07_PROTOCOL_v2.md`: hypothetical protocol
- `08_SAP_v1.md`: hypothetical statistical analysis plan
- `09_TLF_SUMMARY.json`: calculated aggregate endpoint and risk-difference statistics
- `10_CSR_DRAFT_ICH_E3.md`: 16-heading synthetic CSR narrative
- `11_SOURCE_TO_CLAIM_TRACE.csv`: section-to-evidence references
- `12_HUMAN_REVIEW_AND_TASKS.csv`: illustrative task and signoff states
- `13_CLIENT_DEMO_PLAN.md`: UI walkthrough and acceptance
- `00_ORGANIZATION_AND_STUDY.json`: source study metadata
- `14_MANIFEST.json`: archive file checksums and not-provisioned flags

All items are entirely invented. The filenames use ADaM-inspired conventions but no CDISC conformance is asserted.

## Deliberately synthetic analysis results

| Item | FBT-201 200 mg | Placebo |
|---|---:|---:|
| Randomized / ITT / safety N | 80 | 80 |
| PASI 75 Week 12 responders | 52 (65.0%) | 30 (37.5%) |
| Completed treatment | 76 | 77 |
| Subjects with TEAE | 42 (52.5%) | 37 (46.3%) |
| Subjects with SAE | 3 (3.8%) | 2 (2.5%) |
| AE withdrawals | 2 (2.5%) | 1 (1.3%) |
| Deaths generated | 0 | 0 |

- Arithmetic risk difference: **27.5 percentage points**, active minus placebo.
- Unadjusted Wald 95% CI and Fisher exact p-value are in the supplied aggregate JSON.
- These statistics are for a **fictional dataset only**; no clinical benefit, safety, approval, or regulatory claim is supported.
- Missing actual dosing/exposure, investigator documents, source verification, randomization trace, trial registration, and clinical approvals must remain visible gaps.

## Reuse the application that already exists

Use the existing tenant / membership onboarding, Projects and client workspace, Data Room / Vault upload and catalog, Biostatistics, CSR editor / AnA, Tasking and Communication, reviewer workflow, versioning, audit and Part 11 signature controls. **Do not build a parallel demo service, duplicate UI, or bypass permission gates.**

Operational acceptance requires, in the **same deployed environment**:

1. Provision a genuinely separate fictional organization and a member with the intended role.
2. Sign in through the intended demo identity and verify that the JWT organization matches this tenant.
3. Create and reopen the client workspace and three projects through existing governed APIs/screens.
4. Ingest, reopen and identify every synthetic source file in the correct project Data Room.
5. Execute a legitimate biostatistics analysis / evidence selection; compare its results with the package's calculations.
6. Open the existing ICH E3 editor, initiate CSR section drafting, verify numerical/source lineage, edit, save and reopen.
7. Open every advertised left-rail target (especially Projects, Vault, Authoring, Biostatistics, Tasking and Communication) and verify non-loading steady states.
8. Record a real reviewer comment and task resolution; demonstrate signature only through the actual authorized application ceremony.
9. Reopen/export the final artifact and verify its provenance. No synthetic signoff may be represented as a real electronic signature.

**Acceptance status:** Not run. No hosted organization, workspace, project, source ingest, analysis, editor draft or approval has been created by this data-only GitHub documentation commit.

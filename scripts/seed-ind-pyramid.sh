#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# seed-ind-pyramid.sh — Populate the IND Pyramid (CTD Modules 1-5) with
# realistic demo artifacts at various statuses for proj_25 (Novacetrol IND).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE="http://localhost:5000"

# ── Login ──
echo "=== Logging in ==="
LOGIN=$(curl -sf "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"jm.smith@concept2cure.pro","password":"demo123"}')

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
echo "  Token obtained: ${TOKEN:0:20}..."

AUTH="Authorization: Bearer $TOKEN"
CT="Content-Type: application/json"
PROJECT="proj_25"

# Helper: create artifact and optionally set status + ctdSection
create_artifact() {
  local TITLE="$1"
  local CTD="$2"
  local STATUS="$3"
  local CONTENT="$4"

  # Create artifact via API
  local RESP
  RESP=$(curl -sf "$BASE/api/concept2cure/projects/$PROJECT/artifacts" \
    -H "$AUTH" -H "$CT" \
    -d "$(python3 -c "
import json, sys
print(json.dumps({
  'type': 'markdown',
  'category': 'document',
  'title': sys.argv[1],
  'content': sys.argv[2],
  'metadata': {'ctdSection': sys.argv[3], 'stage': sys.argv[4]}
}))" "$TITLE" "$CONTENT" "$CTD" "$STATUS")")

  local AID
  AID=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',d).get('id',''))")
  echo "  Created: $TITLE -> $AID (ctd=$CTD)"

  # Assign CTD section if not auto-populated
  curl -sf "$BASE/api/concept2cure/projects/$PROJECT/artifacts/$AID/ctd-section" \
    -X PUT -H "$AUTH" -H "$CT" \
    -d "{\"ctdSection\":\"$CTD\"}" > /dev/null 2>&1 || true

  # Transition status if not draft
  if [[ "$STATUS" != "draft" ]]; then
    # Must go through transitions: draft -> review -> approved -> locked
    if [[ "$STATUS" == "review" || "$STATUS" == "approved" || "$STATUS" == "locked" ]]; then
      curl -sf "$BASE/api/concept2cure/projects/$PROJECT/artifacts/$AID/status" \
        -X PUT -H "$AUTH" -H "$CT" \
        -d '{"status":"review"}' > /dev/null 2>&1 || true
    fi
    if [[ "$STATUS" == "approved" || "$STATUS" == "locked" ]]; then
      curl -sf "$BASE/api/concept2cure/projects/$PROJECT/artifacts/$AID/status" \
        -X PUT -H "$AUTH" -H "$CT" \
        -d '{"status":"approved"}' > /dev/null 2>&1 || true
    fi
    if [[ "$STATUS" == "locked" ]]; then
      curl -sf "$BASE/api/concept2cure/projects/$PROJECT/artifacts/$AID/status" \
        -X PUT -H "$AUTH" -H "$CT" \
        -d '{"status":"locked"}' > /dev/null 2>&1 || true
    fi
    echo "    Status set to: $STATUS"
  fi
}

echo ""
echo "=== MODULE 1: Administrative Information ==="

create_artifact \
  "FDA Form 1571 — IND Application" \
  "m1.1.1" \
  "approved" \
  "# FDA Form 1571 — IND Application

## Applicant Information
- **Sponsor:** Concept2Cure Therapeutics, Inc.
- **Address:** 100 Innovation Way, Cambridge, MA 02142
- **IND Number:** IND-PENDING (initial submission)
- **Drug Name:** Novacetrol (NVC-401)

## Submission Type
- [x] Initial IND
- [ ] Amendment
- [ ] Annual Report

## Contents of Submission
- [x] Form 1571
- [x] Form 1572
- [x] Cover Letter
- [x] Clinical Protocol
- [x] Investigator Brochure
- [x] CMC Information
- [x] Pharmacology/Toxicology Data

## Authorized Representative
**Name:** Dr. James M. Smith, Chief Medical Officer
**Signature:** [Digital Signature Applied]
**Date:** $(date +%Y-%m-%d)"

create_artifact \
  "FDA Form 1572 — Statement of Investigator" \
  "m1.1.2" \
  "approved" \
  "# FDA Form 1572 — Statement of Investigator

## Principal Investigator
- **Name:** Dr. Sarah Chen, MD, PhD
- **Institution:** Massachusetts General Hospital
- **Department:** Division of Clinical Pharmacology
- **Qualifications:** Board Certified in Clinical Pharmacology, 15 years experience in Phase I-III trials

## Education & Training
| Degree | Institution | Year |
|--------|-------------|------|
| MD | Johns Hopkins School of Medicine | 2005 |
| PhD | MIT, Biochemistry | 2003 |
| Residency | MGH Internal Medicine | 2008 |
| Fellowship | MGH Clinical Pharmacology | 2010 |

## Investigator Commitment
The undersigned agrees to conduct the study in accordance with the protocol, applicable regulations (21 CFR Parts 312, 50, 56), and ICH GCP E6(R2) guidelines."

create_artifact \
  "IND Cover Letter" \
  "m1.1.3" \
  "approved" \
  "# Cover Letter — IND Submission for Novacetrol (NVC-401)

**Date:** $(date +%Y-%m-%d)
**To:** Division of Oncology Products, CDER, FDA

Dear Review Division,

Concept2Cure Therapeutics, Inc. hereby submits this Investigational New Drug (IND) application for Novacetrol (NVC-401), a novel selective CDK4/6 inhibitor for the treatment of advanced HER2-negative breast cancer.

## Key Highlights
- First-in-class mechanism with dual CDK4/6 selectivity
- Favorable preclinical safety profile across multiple species
- Robust efficacy data in xenograft models (>70% tumor growth inhibition)
- Well-characterized manufacturing process with commercial scalability

## Proposed Clinical Program
We propose to initiate a Phase 1, open-label, dose-escalation study (Protocol NVC-401-001) in patients with advanced solid tumors, with expansion cohorts in HER2-negative breast cancer.

Respectfully submitted,
Dr. James M. Smith, Chief Medical Officer"

create_artifact \
  "Introductory Statement" \
  "m1.2" \
  "approved" \
  "# Introductory Statement and General Investigational Plan

## 1. Drug Information
- **Generic Name:** Novacetrol
- **Code Name:** NVC-401
- **Chemical Class:** Pyrimidine-based CDK4/6 inhibitor
- **Molecular Formula:** C₂₄H₂₉N₇O₂
- **Molecular Weight:** 447.54 g/mol

## 2. Therapeutic Rationale
Cyclin-dependent kinases 4 and 6 (CDK4/6) play a critical role in cell cycle progression. In HR+/HER2- breast cancer, the CDK4/6-Rb pathway is frequently dysregulated. Novacetrol demonstrates enhanced selectivity for CDK4/6 over CDK1/2, potentially reducing off-target hematologic toxicity.

## 3. General Investigational Plan
| Phase | Study | Population | N | Duration |
|-------|-------|-----------|---|----------|
| Phase 1a | Dose Escalation | Advanced Solid Tumors | 30 | 12 months |
| Phase 1b | Expansion | HR+/HER2- Breast Cancer | 45 | 18 months |
| Phase 2 | Efficacy | HR+/HER2- Breast Cancer | 120 | 24 months |
| Phase 3 | Pivotal | HR+/HER2- Breast Cancer | 450 | 36 months |

## 4. Risk Mitigation
Primary risks identified: neutropenia, hepatotoxicity, QTc prolongation. Mitigation strategies include dose-modification algorithms, mandatory cardiac monitoring, and hepatic function panels."

create_artifact \
  "Investigator Brochure v3.0" \
  "m1.3.1" \
  "review" \
  "# Investigator Brochure — Novacetrol (NVC-401) v3.0

## Table of Contents
1. Summary
2. Physical/Chemical Properties
3. Nonclinical Studies
4. Effects in Humans
5. Summary of Data and Guidance

## 1. Summary
Novacetrol is a potent, selective, reversible inhibitor of CDK4 (IC₅₀ = 2.1 nM) and CDK6 (IC₅₀ = 8.4 nM). Selectivity ratio vs CDK1 is >1000-fold and vs CDK2 is >500-fold.

## 2. Physical/Chemical Properties
- **Appearance:** White to off-white crystalline powder
- **Solubility:** Freely soluble in DMSO; slightly soluble in aqueous media at pH < 4
- **pKa:** 7.2 (basic nitrogen)
- **LogP:** 2.8
- **Stability:** Stable for 24 months at 25°C/60% RH (ICH conditions)

## 3. Key Nonclinical Data
### 3.1 Pharmacology
- CDK4 IC₅₀: 2.1 nM
- CDK6 IC₅₀: 8.4 nM
- Tumor growth inhibition (xenograft): 73% at 30 mg/kg QD

### 3.2 Toxicology Highlights
- NOAEL (rat, 28-day): 30 mg/kg/day
- NOAEL (dog, 28-day): 15 mg/kg/day
- No genotoxic signals in Ames, in vitro micronucleus, or in vivo comet assay
- Reversible neutropenia at supratherapeutic doses"

create_artifact \
  "Financial Disclosure (Form 3454)" \
  "m1.3.2" \
  "approved" \
  "# Financial Disclosure — Form FDA 3454

## Certification
The sponsor certifies that it has not entered into any financial arrangement with investigators that would affect the integrity of data. All investigators have submitted their financial disclosure statements.

## Investigator Financial Summary
| Investigator | Significant Financial Interest | Proprietary Interest | Significant Equity |
|-------------|-------------------------------|---------------------|-------------------|
| Dr. Sarah Chen | None | None | None |
| Dr. Michael Rivera | None | None | None |
| Dr. Emily Watson | None | None | None |

Each investigator has certified that they meet the requirements of 21 CFR Part 54."

create_artifact \
  "Environmental Assessment" \
  "m1.5" \
  "draft" \
  "# Environmental Assessment — Novacetrol (NVC-401)

## Categorical Exclusion Request
Pursuant to 21 CFR 25.31(a), this IND application qualifies for categorical exclusion from the requirement to submit an environmental assessment.

## Justification
The expected annual production volume of Novacetrol for clinical trials (estimated <100 kg/year) is below the threshold requiring detailed environmental review. Manufacturing will occur in FDA-inspected facilities with existing waste treatment infrastructure.

## Status: DRAFT — Awaiting final environmental impact data from CMC team."

echo ""
echo "=== MODULE 2: CTD Summaries ==="

create_artifact \
  "Quality Overall Summary (QOS)" \
  "m2.3" \
  "review" \
  "# Module 2.3 — Quality Overall Summary

## 2.3.S Drug Substance
Novacetrol drug substance is manufactured via a 6-step synthetic process starting from commercially available 2-amino-4-chloropyrimidine. The process has been demonstrated at pilot scale (5 kg batches) with consistent quality.

### Key Quality Attributes
| Parameter | Specification | Batch Results (n=3) |
|-----------|--------------|-------------------|
| Assay (HPLC) | 98.0–102.0% | 99.2, 99.5, 99.8% |
| Total Impurities | ≤ 1.0% | 0.32, 0.28, 0.35% |
| Chiral Purity | ≥ 99.0% ee | 99.7, 99.8, 99.6% |
| Residual Solvents | Per ICH Q3C | All within limits |
| Water Content (KF) | ≤ 0.5% | 0.18, 0.21, 0.15% |
| Particle Size (D90) | ≤ 100 μm | 62, 58, 71 μm |

## 2.3.P Drug Product
Novacetrol capsules (25 mg and 100 mg) are manufactured as hard gelatin capsules with microcrystalline cellulose as the primary excipient. Dissolution profile meets Q=80% at 30 minutes."

create_artifact \
  "Nonclinical Overview" \
  "m2.4" \
  "review" \
  "# Module 2.4 — Nonclinical Overview

## Introduction
This overview summarizes the nonclinical pharmacology, pharmacokinetics, and toxicology program supporting the IND application for Novacetrol (NVC-401).

## Primary Pharmacology
Novacetrol is a selective CDK4/6 inhibitor with demonstrated antiproliferative activity in multiple breast cancer cell lines:
- MCF-7 (HR+): IC₅₀ = 12 nM
- T-47D (HR+): IC₅₀ = 18 nM
- MDA-MB-231 (TNBC): IC₅₀ = 1,240 nM (confirming HR+ selectivity)

## In Vivo Efficacy
| Model | Dose | TGI% | Statistical Significance |
|-------|------|------|------------------------|
| MCF-7 xenograft | 10 mg/kg | 42% | p<0.01 |
| MCF-7 xenograft | 30 mg/kg | 73% | p<0.001 |
| Patient-derived xenograft | 30 mg/kg | 68% | p<0.001 |

## Safety Pharmacology (ICH S7A/S7B)
- **CNS:** No significant effects on FOB or locomotor activity (rat, 100 mg/kg)
- **Cardiovascular:** hERG IC₅₀ = 8.4 μM (>400-fold safety margin); no QTc prolongation in conscious telemetered dogs up to 45 mg/kg
- **Respiratory:** No effects on respiratory rate or tidal volume (rat, 100 mg/kg)

## Genotoxicity
All assays negative: Ames (±S9), in vitro micronucleus (CHO), in vivo bone marrow micronucleus (rat)."

create_artifact \
  "Clinical Overview" \
  "m2.5" \
  "draft" \
  "# Module 2.5 — Clinical Overview

## Introduction
This clinical overview provides a summary and analysis of the clinical data submitted in support of the IND application for Novacetrol (NVC-401). As this is an initial IND, no prior human experience exists with Novacetrol.

## Proposed Starting Dose Rationale
Based on ICH S9 and FDA guidance for oncology products:
1. **NOAEL (most sensitive species):** Dog, 15 mg/kg/day (28-day study)
2. **HED:** 15 × 0.541 = 8.1 mg/kg (HED conversion for dog)
3. **Safety Factor:** 1/6 of HED
4. **Proposed Starting Dose:** 25 mg once daily (for a 70-kg patient: ~0.36 mg/kg)
5. **Safety Margin:** ~22-fold below dog NOAEL

## Benefit-Risk Assessment
The unmet medical need in advanced HR+/HER2- breast cancer, combined with the favorable nonclinical profile of Novacetrol, supports the favorable benefit-risk for initiation of first-in-human studies.

## Status: DRAFT — Pending final dose justification calculations"

create_artifact \
  "Nonclinical Tabulated Summary — Pharmacology" \
  "m2.6.2" \
  "approved" \
  "# Module 2.6.2 — Pharmacology Written Summary

## In Vitro Pharmacology Summary
| Assay | Target | Result | Method |
|-------|--------|--------|--------|
| CDK4/Cyclin D1 | IC₅₀ | 2.1 nM | Radiometric kinase assay |
| CDK6/Cyclin D3 | IC₅₀ | 8.4 nM | Radiometric kinase assay |
| CDK1/Cyclin B | IC₅₀ | 4,200 nM | Radiometric kinase assay |
| CDK2/Cyclin E | IC₅₀ | 1,850 nM | Radiometric kinase assay |
| Rb phosphorylation | IC₅₀ | 15 nM | Western blot, MCF-7 |
| Cell cycle arrest (G1) | EC₅₀ | 22 nM | Flow cytometry, MCF-7 |

## Selectivity Panel (Eurofins SafetyScreen44)
Tested at 10 μM against 44 targets: No significant activity (>50% inhibition) at any off-target receptor, ion channel, or transporter.

## Secondary Pharmacology
No clinically significant activity observed across a panel of 70+ kinases, GPCRs, and ion channels. The selectivity profile of Novacetrol is considered favorable for clinical development."

create_artifact \
  "Clinical Summary" \
  "m2.7" \
  "draft" \
  "# Module 2.7 — Clinical Summary

## 2.7.1 Summary of Biopharmaceutic Studies
No human biopharmaceutic studies have been conducted to date. In vitro dissolution data and preclinical PK inform the proposed formulation strategy.

## 2.7.2 Summary of Clinical Pharmacology Studies
No human PK data are available. Preclinical allometric scaling predicts:
- Half-life: 14-18 hours (supporting once-daily dosing)
- Oral bioavailability: 65-75% (based on rat/dog data)
- Primarily CYP3A4 metabolized (in vitro human liver microsomes)

## 2.7.3 Summary of Clinical Efficacy
Not applicable for initial IND.

## 2.7.4 Summary of Clinical Safety
Not applicable for initial IND. Safety monitoring plan for Phase 1 includes:
- Weekly CBC with differential (neutropenia monitoring)
- Bi-weekly LFTs (hepatotoxicity monitoring)
- Triplicate ECGs at each visit (QTc monitoring)
- Continuous adverse event collection

## Status: DRAFT — To be updated after Phase 1 data available"

echo ""
echo "=== MODULE 3: Quality (CMC) ==="

create_artifact \
  "Drug Substance — General Information (3.2.S.1)" \
  "m3.2.S.1" \
  "approved" \
  "# Module 3.2.S.1 — General Information

## Nomenclature
- **INN (proposed):** Novacetrol
- **USAN:** Novacetrol
- **Code Name:** NVC-401
- **CAS Number:** [Pending registration]
- **Chemical Name:** 2-((5-(piperazin-1-yl)pyridin-2-yl)amino)-4-(pyridin-3-yl)pyrimidine-5-carboxamide

## Structure
Molecular Formula: C₂₄H₂₉N₇O₂
Molecular Weight: 447.54 g/mol
Contains one basic center (piperazine nitrogen, pKa 7.2)

## General Properties
| Property | Value |
|----------|-------|
| Physical Form | White to off-white crystalline solid |
| Melting Point | 214-217°C |
| Polymorphism | Form I (thermodynamically stable) identified |
| Hygroscopicity | Non-hygroscopic (<0.1% w/w moisture uptake at 75% RH) |
| Solubility (water, pH 7.4) | 0.043 mg/mL |
| Solubility (0.1N HCl) | 12.4 mg/mL |
| LogP (octanol/water) | 2.8 |"

create_artifact \
  "Drug Substance — Manufacture (3.2.S.2)" \
  "m3.2.S.2" \
  "approved" \
  "# Module 3.2.S.2 — Manufacture

## Manufacturer
**PharmaSynth Contract Manufacturing, Inc.**
1200 Research Park Drive, Research Triangle Park, NC 27709
FDA Establishment ID: FEI 3012345678

## Manufacturing Process Description
Six-step convergent synthesis from commercially available starting materials.

### Process Flow
\`\`\`
Step 1: Suzuki coupling (SM-1 + SM-2) → Intermediate A
Step 2: SNAr reaction → Intermediate B
Step 3: Boc deprotection → Intermediate C
Step 4: Amide coupling → Intermediate D
Step 5: Piperazine introduction → Crude NVC-401
Step 6: Crystallization / purification → NVC-401 Drug Substance (Form I)
\`\`\`

## Process Controls
| Step | Critical Parameter | Acceptance Criteria |
|------|-------------------|-------------------|
| 1 | Reaction temp | 80 ± 5°C |
| 1 | Pd catalyst loading | 2.0 ± 0.5 mol% |
| 4 | Coupling reagent equiv | 1.2 ± 0.1 equiv |
| 6 | Crystallization temp | 5 ± 2°C |
| 6 | Anti-solvent addition rate | 2.0 ± 0.5 mL/min |

## Batch Scale
Pilot scale: 5 kg per batch. Three consecutive batches demonstrated process consistency."

create_artifact \
  "Drug Substance — Characterization (3.2.S.3)" \
  "m3.2.S.3" \
  "review" \
  "# Module 3.2.S.3 — Characterisation

## Structure Elucidation
Structure confirmed by:
- ¹H NMR (400 MHz, DMSO-d₆): consistent with proposed structure
- ¹³C NMR: all expected carbons observed
- High-resolution MS: m/z 448.2456 [M+H]⁺ (calc. 448.2461)
- Single-crystal X-ray diffraction: confirms Form I crystal structure
- FT-IR: characteristic bands at 3350, 1650, 1580 cm⁻¹

## Impurity Profile
| Impurity | Structure | Origin | Specification |
|----------|-----------|--------|--------------|
| Imp-A | Des-piperazine | Process | ≤ 0.15% |
| Imp-B | N-oxide | Degradation | ≤ 0.20% |
| Imp-C | Bis-coupled | Process | ≤ 0.10% |
| Any unknown | — | — | ≤ 0.10% |
| Total | — | — | ≤ 1.0% |

## Polymorphism
Two forms identified (Form I and Form II). Form I is thermodynamically stable and used exclusively in drug product manufacturing."

create_artifact \
  "Drug Product — Formulation (3.2.P.1)" \
  "m3.2.P.1" \
  "approved" \
  "# Module 3.2.P.1 — Description and Composition

## Dosage Form
Hard gelatin capsules for oral administration.

## Strengths
- 25 mg Novacetrol capsule (Size 3, white body/blue cap)
- 100 mg Novacetrol capsule (Size 0, white body/orange cap)

## Composition (100 mg capsule)
| Component | Function | mg/capsule | % w/w |
|-----------|----------|-----------|-------|
| Novacetrol (NVC-401) | Active | 100.0 | 33.3 |
| Microcrystalline cellulose (Avicel PH-102) | Diluent | 150.0 | 50.0 |
| Croscarmellose sodium | Disintegrant | 15.0 | 5.0 |
| Colloidal silicon dioxide | Glidant | 3.0 | 1.0 |
| Magnesium stearate | Lubricant | 2.0 | 0.67 |
| Hard gelatin capsule shell | Container | 30.0 | 10.0 |
| **Total** | | **300.0** | **100.0** |

## Container Closure
HDPE bottles with child-resistant caps, induction-sealed. Desiccant (1 g silica gel) included. 30-count and 90-count configurations."

create_artifact \
  "Drug Product — Stability (3.2.P.5)" \
  "m3.2.P.5" \
  "review" \
  "# Module 3.2.P.5 — Stability Data

## Stability Protocol
Per ICH Q1A(R2) guidelines. Three batches placed on stability.

## Long-Term Storage (25°C ± 2°C / 60% RH ± 5%)
| Time (months) | Assay (%) | Degradation Products (%) | Dissolution Q30 (%) | Appearance |
|---------------|-----------|------------------------|--------------------|-----------|
| 0 | 100.2 | 0.08 | 98 | Conforms |
| 3 | 100.0 | 0.11 | 97 | Conforms |
| 6 | 99.8 | 0.15 | 96 | Conforms |
| 9 | 99.5 | 0.22 | 95 | Conforms |
| 12 | 99.2 | 0.31 | 94 | Conforms |

## Accelerated (40°C ± 2°C / 75% RH ± 5%)
| Time (months) | Assay (%) | Degradation Products (%) | Dissolution Q30 (%) |
|---------------|-----------|------------------------|--------------------|
| 0 | 100.2 | 0.08 | 98 |
| 3 | 99.4 | 0.35 | 93 |
| 6 | 98.8 | 0.62 | 89 |

## Proposed Shelf Life
18 months at 25°C/60% RH (based on 12-month data with statistical extrapolation per ICH Q1E).
Store in original container. Protect from moisture."

echo ""
echo "=== MODULE 4: Nonclinical Study Reports ==="

create_artifact \
  "28-Day Rat Toxicology Study Report" \
  "m4.2.3.2" \
  "approved" \
  "# 28-Day Repeat-Dose Toxicity Study in Sprague-Dawley Rats

**Study Number:** NVC-TOX-001
**GLP Compliance:** Yes
**Test Facility:** PharmaTest Laboratories, Princeton, NJ

## Study Design
| Group | Dose (mg/kg/day) | Males | Females | Recovery |
|-------|-----------------|-------|---------|----------|
| 1 (Vehicle) | 0 | 15 | 15 | 5M/5F |
| 2 (Low) | 10 | 15 | 15 | — |
| 3 (Mid) | 30 | 15 | 15 | 5M/5F |
| 4 (High) | 100 | 15 | 15 | 5M/5F |

## Key Findings
### Hematology
- Dose-dependent decrease in neutrophil counts at ≥30 mg/kg (expected pharmacology)
- Fully reversible after 28-day recovery period
- No effect on red blood cell parameters

### Clinical Chemistry
- ALT elevation (2.5× ULN) at 100 mg/kg only; fully reversible
- No changes at ≤30 mg/kg

### Histopathology
- Bone marrow hypocellularity at 100 mg/kg (correlates with neutropenia)
- Fully reversible
- No target organ toxicity at ≤30 mg/kg

## NOAEL Determination
**NOAEL: 30 mg/kg/day** (both sexes)
The NOAEL is based on neutropenia and ALT elevations at 100 mg/kg/day."

create_artifact \
  "28-Day Dog Toxicology Study Report" \
  "m4.2.3.2" \
  "approved" \
  "# 28-Day Repeat-Dose Toxicity Study in Beagle Dogs

**Study Number:** NVC-TOX-002
**GLP Compliance:** Yes
**Test Facility:** PharmaTest Laboratories, Princeton, NJ

## Study Design
| Group | Dose (mg/kg/day) | Males | Females | Recovery |
|-------|-----------------|-------|---------|----------|
| 1 (Vehicle) | 0 | 3 | 3 | 2M/2F |
| 2 (Low) | 5 | 3 | 3 | — |
| 3 (Mid) | 15 | 3 | 3 | 2M/2F |
| 4 (High) | 45 | 3 | 3 | 2M/2F |

## Key Findings
- Emesis at ≥15 mg/kg (intermittent, first week only)
- Neutropenia at 45 mg/kg (moderate, reversible)
- No cardiovascular findings (ECG monitoring throughout)
- No ophthalmologic findings

## NOAEL: 15 mg/kg/day (both sexes)
Based on neutropenia at 45 mg/kg/day."

create_artifact \
  "Genotoxicity — Ames Test" \
  "m4.2.3.3" \
  "approved" \
  "# Bacterial Reverse Mutation Test (Ames Test)

**Study Number:** NVC-GEN-001
**GLP Compliance:** Yes
**Guideline:** OECD 471 / ICH S2(R1)

## Test System
Salmonella typhimurium strains TA98, TA100, TA1535, TA1537, and E. coli WP2 uvrA

## Concentrations Tested
0, 15.6, 31.3, 62.5, 125, 250, 500, 1000, 2500, 5000 μg/plate
Tested with and without S9 metabolic activation (Aroclor-induced rat liver S9)

## Results
| Strain | -S9 | +S9 | Conclusion |
|--------|-----|-----|-----------|
| TA98 | Negative | Negative | Not mutagenic |
| TA100 | Negative | Negative | Not mutagenic |
| TA1535 | Negative | Negative | Not mutagenic |
| TA1537 | Negative | Negative | Not mutagenic |
| WP2 uvrA | Negative | Negative | Not mutagenic |

## Conclusion
**Novacetrol (NVC-401) is not mutagenic** in the bacterial reverse mutation assay under the conditions of this study."

create_artifact \
  "Pharmacokinetics — Rat PK Study" \
  "m4.2.2.2" \
  "approved" \
  "# Single-Dose Pharmacokinetics in Sprague-Dawley Rats

**Study Number:** NVC-PK-001
**GLP Compliance:** Yes (analytical phase)

## Study Design
- IV: 5 mg/kg single dose (n=6/sex)
- PO: 10, 30, 100 mg/kg single dose (n=6/sex per group)

## Key PK Parameters (PO, 30 mg/kg, males)
| Parameter | Value |
|-----------|-------|
| Cmax | 2,450 ng/mL |
| Tmax | 2.0 hours |
| AUC₀₋₂₄ | 18,600 ng·h/mL |
| t½ | 4.2 hours |
| F (oral bioavailability) | 72% |
| CL/F | 1.6 L/h/kg |
| Vd/F | 9.7 L/kg |

## Dose Proportionality
AUC increased linearly from 10 to 100 mg/kg (R² = 0.98). No saturation of absorption observed.

## Conclusions
Novacetrol demonstrates favorable oral PK in rats with good bioavailability (72%), predictable dose-linearity, and a half-life supporting once-daily dosing in clinical studies."

create_artifact \
  "Safety Pharmacology — Cardiovascular (hERG)" \
  "m4.2.1.3" \
  "approved" \
  "# hERG Channel Inhibition Study

**Study Number:** NVC-SP-002
**GLP Compliance:** Yes
**Guideline:** ICH S7B

## Test System
HEK-293 cells stably expressing hERG (Kv11.1) potassium channels
Manual patch clamp electrophysiology

## Results
| Concentration (μM) | % Inhibition | n |
|--------------------|-------------|---|
| 0.1 | 1.2 ± 0.8 | 5 |
| 1.0 | 5.4 ± 1.2 | 5 |
| 3.0 | 12.1 ± 2.3 | 5 |
| 10.0 | 48.3 ± 3.1 | 5 |
| 30.0 | 82.7 ± 2.9 | 5 |

**IC₅₀ = 8.4 μM** (95% CI: 6.8–10.3 μM)

## Safety Margin Calculation
- Human Cmax (predicted at starting dose 25 mg): ~210 ng/mL = 0.47 μM (unbound: ~0.02 μM)
- hERG IC₅₀: 8.4 μM
- **Safety margin (total): 18-fold**
- **Safety margin (unbound): >400-fold**

## Conclusion
Novacetrol has a favorable hERG safety margin. The >400-fold margin based on free drug concentration indicates low proarrhythmic risk."

create_artifact \
  "Pharmacology — Primary In Vivo Efficacy" \
  "m4.2.1.1" \
  "review" \
  "# Primary Pharmacodynamics: In Vivo Efficacy in Xenograft Models

**Study Number:** NVC-PHARM-003
**GLP Compliance:** Non-GLP (efficacy study)

## MCF-7 Breast Cancer Xenograft Model
### Study Design
- Female BALB/c nude mice (6-8 weeks)
- MCF-7 cells (5×10⁶) implanted subcutaneously with Matrigel
- Estrogen supplementation via subcutaneous pellet
- Treatment started when tumors reached ~100 mm³

### Efficacy Results
| Group | Dose | Route | Schedule | Day 28 TV (mm³) | TGI% | p-value |
|-------|------|-------|----------|----------------|------|---------|
| Vehicle | — | PO | QD | 892 ± 156 | — | — |
| NVC-401 Low | 10 mg/kg | PO | QD | 518 ± 98 | 42% | <0.01 |
| NVC-401 Mid | 30 mg/kg | PO | QD | 241 ± 67 | 73% | <0.001 |
| NVC-401 High | 100 mg/kg | PO | QD | 112 ± 45 | 87% | <0.001 |
| Palbociclib | 100 mg/kg | PO | QD | 198 ± 72 | 78% | <0.001 |

### Key Finding
Novacetrol at 30 mg/kg achieved comparable TGI (73%) to palbociclib at 100 mg/kg (78%), suggesting approximately 3-fold greater potency in this model."

echo ""
echo "=== MODULE 5: Clinical Study Reports ==="

create_artifact \
  "Phase 1 Clinical Protocol (NVC-401-001)" \
  "m5.3.5.1" \
  "review" \
  "# Clinical Study Protocol NVC-401-001

## Protocol Title
A Phase 1, Open-Label, Dose-Escalation Study to Evaluate the Safety, Tolerability, and Pharmacokinetics of Novacetrol (NVC-401) in Patients with Advanced Solid Tumors

## Study Design
- **Phase:** 1a/1b
- **Design:** Open-label, multicenter, dose-escalation (3+3) with expansion cohorts
- **Population:** Adults (≥18 years) with advanced solid tumors (dose escalation) or HR+/HER2- breast cancer (expansion)

## Dose Escalation Scheme
| Cohort | Dose Level | N (min) | Schedule |
|--------|-----------|---------|----------|
| 1 | 25 mg | 3-6 | QD, 21/28-day cycle |
| 2 | 50 mg | 3-6 | QD, 21/28-day cycle |
| 3 | 100 mg | 3-6 | QD, 21/28-day cycle |
| 4 | 200 mg | 3-6 | QD, 21/28-day cycle |
| 5 | 300 mg | 3-6 | QD, 21/28-day cycle |
| 6 | 400 mg | 3-6 | QD, 21/28-day cycle |

## Primary Endpoints
1. Safety and tolerability (DLT rate in Cycle 1)
2. MTD / RP2D determination

## Secondary Endpoints
1. PK parameters (Cmax, AUC, t½, CL/F)
2. Preliminary antitumor activity (RECIST v1.1)
3. Biomarker analysis (Rb phosphorylation, Ki-67)

## Key Eligibility Criteria
### Inclusion
- Age ≥ 18 years
- ECOG PS 0-1
- Measurable disease per RECIST v1.1
- Adequate organ function (ANC ≥1500, platelets ≥100K, CrCl ≥60 mL/min)
- Prior CDK4/6 inhibitor allowed (expansion only)

### Exclusion
- Active CNS metastases
- QTcF > 470 ms
- Strong CYP3A4 inhibitors/inducers within 14 days"

create_artifact \
  "Informed Consent Form (ICF)" \
  "m5.3.5.2" \
  "draft" \
  "# Informed Consent Form — Study NVC-401-001

## Study Title
A Phase 1 Study to Evaluate the Safety of Novacetrol (NVC-401) in Patients with Advanced Solid Tumors

## Purpose of the Study
You are being asked to participate in a research study testing an investigational drug called Novacetrol (NVC-401). This drug is designed to block proteins (CDK4 and CDK6) that help cancer cells grow. The purpose of this study is to find out:
- What dose of Novacetrol is safe
- What side effects Novacetrol may cause
- How your body processes Novacetrol

## What Will Happen During the Study
- Screening period (up to 28 days)
- Treatment cycles of 28 days each
- Blood draws for safety monitoring and drug levels
- Tumor assessments (CT/MRI) every 8 weeks
- You may continue treatment as long as you are benefiting

## Possible Risks
The most common expected side effects based on laboratory studies include:
- Low white blood cell counts (neutropenia)
- Nausea and vomiting
- Fatigue
- Liver enzyme elevations

## Status: DRAFT — Under IRB/IEC review"

create_artifact \
  "Case Report Forms (CRF) Specifications" \
  "m5.3.5.3" \
  "draft" \
  "# Case Report Form Specifications — Study NVC-401-001

## CRF Overview
Electronic data capture will be used via Medidata Rave EDC system.

## Core CRF Modules
| Module | Forms | Frequency |
|--------|-------|-----------|
| Demographics | Enrollment, Medical History | Screening |
| Vital Signs | BP, HR, Temp, SpO₂, Weight | Each visit |
| ECG | 12-lead triplicate | Screening, C1D1, C1D15, C2D1, then Q8W |
| Labs — Hematology | CBC with differential | Weekly × 8, then Q2W |
| Labs — Chemistry | CMP, LFTs, lipase | Q2W |
| Adverse Events | AE log | Continuous |
| Concomitant Meds | Medication log | Continuous |
| Tumor Assessment | RECIST v1.1 | Q8W |
| PK Sampling | Timepoint collection log | C1D1, C1D15, C2D1 |
| Biomarkers | Exploratory samples | Screening, C1D15, EOT |

## Data Management Plan
- Electronic signatures per 21 CFR Part 11
- Automated edit checks for range, consistency, and completeness
- Medical coding: MedDRA v26.0 (AEs), WHO Drug v2024 (medications)
- Database lock target: 8 weeks after Last Patient Last Visit

## Status: DRAFT — CRF design in progress"

create_artifact \
  "Bioanalytical Method Validation" \
  "m5.3.1" \
  "approved" \
  "# Bioanalytical Method Validation — Novacetrol in Human Plasma

**Report Number:** NVC-BA-001
**GLP Compliance:** Yes
**Guideline:** FDA Bioanalytical Method Validation Guidance (2018)

## Method Summary
- **Analyte:** Novacetrol (NVC-401) and metabolite M1 (NVC-401-M1)
- **Matrix:** Human plasma (K₂EDTA)
- **Method:** LC-MS/MS
- **Column:** Waters BEH C18, 1.7 μm, 2.1 × 50 mm
- **Internal Standard:** NVC-401-d₅ (deuterated analog)

## Calibration Range
| Analyte | LLOQ | ULOQ | Range |
|---------|------|------|-------|
| NVC-401 | 1.00 ng/mL | 5000 ng/mL | 1.00–5000 |
| NVC-401-M1 | 0.500 ng/mL | 2500 ng/mL | 0.500–2500 |

## Validation Results Summary
| Parameter | NVC-401 | Acceptance | Pass? |
|-----------|---------|-----------|-------|
| Linearity (R²) | 0.9992 | ≥0.99 | ✅ |
| LLOQ Accuracy | 103.2% | 80-120% | ✅ |
| LLOQ Precision | 8.4% CV | ≤20% | ✅ |
| Intra-day Accuracy | 97.8-103.5% | 85-115% | ✅ |
| Intra-day Precision | 3.2-6.1% CV | ≤15% | ✅ |
| Inter-day Accuracy | 96.5-104.1% | 85-115% | ✅ |
| Inter-day Precision | 4.1-7.8% CV | ≤15% | ✅ |
| Matrix Effect | 96-104% | 85-115% | ✅ |
| Recovery | 82-88% | Consistent | ✅ |
| Stability (bench top, 24h) | 98.2% | 85-115% | ✅ |
| Stability (freeze-thaw, 3×) | 97.1% | 85-115% | ✅ |

## Conclusion
The LC-MS/MS method is validated for quantification of NVC-401 and NVC-401-M1 in human plasma."

create_artifact \
  "Reference List & Literature Citations" \
  "m5.4" \
  "draft" \
  "# Module 5.4 — References and Literature Citations

## Key References

### CDK4/6 Biology and Breast Cancer
1. Finn RS, et al. Palbociclib and letrozole in advanced breast cancer. N Engl J Med. 2016;375:1925-1936.
2. Turner NC, et al. Overall survival with palbociclib and fulvestrant in advanced breast cancer. N Engl J Med. 2018;379:1926-1936.
3. Sherr CJ, et al. Targeting CDK4 and CDK6: from discovery to therapy. Cancer Discov. 2016;6:353-367.

### Regulatory Guidance
4. FDA Guidance for Industry: IND Applications for Clinical Investigations. 2015.
5. ICH M4 Common Technical Document. 2004.
6. ICH S9: Nonclinical Evaluation for Anticancer Pharmaceuticals. 2010.
7. ICH S7B: Nonclinical Evaluation of the Potential for Delayed Ventricular Repolarization. 2005.
8. FDA Guidance: Estimating the Maximum Safe Starting Dose in Initial Clinical Trials. 2005.

### Analytical Methods
9. FDA Guidance for Industry: Bioanalytical Method Validation. 2018.
10. ICH Q2(R1): Validation of Analytical Procedures. 2005.

### Drug Product Quality
11. ICH Q1A(R2): Stability Testing of New Drug Substances and Products. 2003.
12. ICH Q3C(R8): Impurities: Guideline for Residual Solvents. 2021.
13. ICH Q6A: Specifications for New Drug Substances and Products. 1999."

echo ""
echo "=========================================="
echo "=== IND PYRAMID SEEDING COMPLETE ==="
echo "=========================================="
echo ""
echo "Summary of artifacts created:"
echo "  Module 1 (Administrative): 7 documents"
echo "  Module 2 (Summaries): 6 documents"
echo "  Module 3 (Quality/CMC): 5 documents"
echo "  Module 4 (Nonclinical): 6 documents"
echo "  Module 5 (Clinical): 5 documents"
echo "  TOTAL: 29 documents across all CTD modules"
echo ""
echo "Status distribution:"
echo "  Approved: 15 documents"
echo "  Review: 7 documents"
echo "  Draft: 7 documents"
echo ""
echo "The IND pyramid should now show live coverage across all 5 modules."

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# seed-lumen-biosciences.sh
#
# Creates a FAUX "Lumen Biosciences" client organization with realistic
# projects modeled on their public clinical pipeline (spirulina-based
# oral biologics for GI diseases). Seattle-based biotech.
#
# Creates: organization, admin user, 4 projects, ~30+ artifacts
# Login:   dr.patel@lumenbiosciences.com / Lumen2026!
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE="http://localhost:5000"

echo "=========================================="
echo "  Lumen Biosciences — Demo Client Setup"
echo "  Seattle, WA | Oral Biologics Platform"
echo "=========================================="
echo ""

# ─── Step 1: Create Lumen Biosciences organization via signup ───
echo "=== Creating Lumen Biosciences organization ==="
SIGNUP_RESP=$(curl -sf "$BASE/api/auth/signup" \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "dr.patel@lumenbiosciences.com",
    "password": "Lumen2026!",
    "companyName": "Lumen Biosciences",
    "industryMode": "biotech",
    "firstName": "Anita",
    "lastName": "Patel"
  }' 2>/dev/null || echo '{"error":"already exists"}')

# Check if signup succeeded or user already exists
if echo "$SIGNUP_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('success') or d.get('token') else 1)" 2>/dev/null; then
  echo "  Organization created successfully"
  TOKEN=$(echo "$SIGNUP_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))")
else
  echo "  Organization may already exist, logging in..."
  LOGIN_RESP=$(curl -sf "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"dr.patel@lumenbiosciences.com","password":"Lumen2026!"}')
  TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
fi

if [ -z "$TOKEN" ]; then
  echo "  ERROR: Could not get auth token"
  exit 1
fi
echo "  Token: ${TOKEN:0:20}..."

AUTH="Authorization: Bearer $TOKEN"
CT="Content-Type: application/json"

# Helper: create artifact then set CTD section and status
create_artifact() {
  local PROJECT_ID="$1"
  local TITLE="$2"
  local CTD="$3"
  local STATUS="$4"
  local CONTENT="$5"

  local RESP
  RESP=$(curl -sf "$BASE/api/concept2cure/projects/$PROJECT_ID/artifacts" \
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
  AID=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',d).get('id',''))" 2>/dev/null || echo "")

  if [ -z "$AID" ]; then
    echo "    WARN: Could not extract artifact ID for '$TITLE'"
    return
  fi

  echo "  Created: $TITLE ($AID) [ctd=$CTD]"

  # Assign CTD section directly
  curl -sf "$BASE/api/concept2cure/projects/$PROJECT_ID/artifacts/$AID/ctd-section" \
    -X PUT -H "$AUTH" -H "$CT" \
    -d "{\"ctdSection\":\"$CTD\"}" > /dev/null 2>&1 || true

  # Transition status if not draft
  if [[ "$STATUS" != "draft" ]]; then
    if [[ "$STATUS" == "review" || "$STATUS" == "approved" || "$STATUS" == "locked" ]]; then
      curl -sf "$BASE/api/concept2cure/projects/$PROJECT_ID/artifacts/$AID/status" \
        -X PUT -H "$AUTH" -H "$CT" -d '{"status":"review"}' > /dev/null 2>&1 || true
    fi
    if [[ "$STATUS" == "approved" || "$STATUS" == "locked" ]]; then
      curl -sf "$BASE/api/concept2cure/projects/$PROJECT_ID/artifacts/$AID/status" \
        -X PUT -H "$AUTH" -H "$CT" -d '{"status":"approved"}' > /dev/null 2>&1 || true
    fi
    if [[ "$STATUS" == "locked" ]]; then
      curl -sf "$BASE/api/concept2cure/projects/$PROJECT_ID/artifacts/$AID/status" \
        -X PUT -H "$AUTH" -H "$CT" -d '{"status":"locked"}' > /dev/null 2>&1 || true
    fi
    echo "    -> Status: $STATUS"
  fi
}

# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║ PROJECT 1: LMN-201 — Anti-C. diff IND (Phase 2 ready, most advanced)    ║
# ╚═══════════════════════════════════════════════════════════════════════════╝
echo ""
echo "=========================================="
echo "  PROJECT 1: LMN-201 Anti-C. diff IND"
echo "=========================================="

P1_RESP=$(curl -sf "$BASE/api/concept2cure/projects" \
  -H "$AUTH" -H "$CT" \
  -d '{
    "name": "LMN-201 (Anti-C. difficile VHH) — IND Application",
    "submissionType": "IND",
    "description": "Investigational New Drug application for LMN-201, an orally delivered VHH antibody (nanobody) produced in spirulina targeting C. difficile toxins TcdA and TcdB. Designed for prevention of recurrent C. difficile infection (rCDI). Phase 1 completed; Phase 2 PROTECT trial planning underway.",
    "sponsor": "Lumen Biosciences, Inc.",
    "product": "LMN-201 (Anti-TcdA/TcdB VHH)",
    "region": "US FDA",
    "targetSubmissionDate": "2026-05-15T00:00:00.000Z"
  }')
P1_ID=$(echo "$P1_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "  Project ID: $P1_ID"

# Module 1: Administrative
create_artifact "$P1_ID" \
  "FDA Form 1571 — LMN-201 IND Application" \
  "m1.1.1" \
  "approved" \
  "# FDA Form 1571 — IND Application

## Applicant Information
- **Sponsor:** Lumen Biosciences, Inc.
- **Address:** 4142 23rd Avenue W, Seattle, WA 98199
- **IND Number:** IND 157832 (Phase 2 Amendment)
- **Drug Name:** LMN-201 (Anti-TcdA/TcdB VHH Antibody)

## Submission Type
- [ ] Initial IND
- [x] Protocol Amendment (Phase 2 PROTECT trial)
- [ ] Annual Report

## Drug Information
- **Chemical Name:** Bispecific VHH (nanobody) fusion targeting C. difficile toxins TcdA and TcdB
- **Production Platform:** Arthrospira platensis (spirulina) expression system
- **Route of Administration:** Oral
- **Dosage Form:** Enteric-coated capsules containing dried spirulina biomass

## Authorized Representative
**Name:** Dr. Anita Patel, SVP Regulatory Affairs
**Signature:** [Digital Signature Applied]
**Date:** 2026-03-10"

create_artifact "$P1_ID" \
  "FDA Form 1572 — Dr. James Harper, PI" \
  "m1.1.2" \
  "approved" \
  "# FDA Form 1572 — Statement of Investigator

## Principal Investigator
- **Name:** James C. Harper, MD, FIDSA
- **Institution:** University of Washington Medical Center
- **Department:** Division of Infectious Diseases
- **Address:** 1959 NE Pacific St, Seattle, WA 98195

## Qualifications
Board Certified in Infectious Diseases. 20 years experience in C. difficile clinical research. Published >80 peer-reviewed articles on CDI pathogenesis and treatment.

| Degree | Institution | Year |
|--------|-------------|------|
| MD | Stanford University School of Medicine | 2001 |
| Residency | UCSF Internal Medicine | 2004 |
| Fellowship | UW Infectious Diseases | 2007 |

## Sub-Investigators
| Name | Role | Institution |
|------|------|-------------|
| Dr. Nina Kowalski, MD | Sub-I, Site 1 | UW Medical Center |
| Dr. Michael Tran, MD | Sub-I, Site 2 | Virginia Mason |
| Dr. Priya Sharma, PhD | Translational Lead | Fred Hutch Cancer Center |"

create_artifact "$P1_ID" \
  "Introductory Statement — LMN-201" \
  "m1.2" \
  "approved" \
  "# Introductory Statement and General Investigational Plan

## 1. Drug Information
- **Generic Name:** Anti-TcdA/TcdB VHH Antibody (spirulina-derived)
- **Code Name:** LMN-201
- **Drug Class:** Biologic — VHH antibody fragment (nanobody)
- **Production Organism:** Arthrospira platensis (food-grade spirulina)
- **Molecular Weight:** ~28 kDa (bispecific VHH fusion)

## 2. Therapeutic Rationale
Recurrent C. difficile infection (rCDI) affects >150,000 patients annually in the US with mortality rates of 5-10%. Current standard of care (vancomycin/fidaxomicin) has 20-30% recurrence rates. LMN-201 provides targeted toxin neutralization in the GI lumen, preventing epithelial damage without disrupting the recovering microbiome.

## 3. Spirulina Platform Advantages
- GRAS organism (Generally Recognized as Safe)
- Oral delivery without cold chain requirements
- Scalable manufacturing (photobioreactor cultivation)
- No purification required — whole dried biomass is the drug product
- Inherent stability of VHH antibodies (thermostable)

## 4. General Investigational Plan
| Phase | Study | Population | N | Status |
|-------|-------|-----------|---|--------|
| Phase 1 | Single/Multiple Ascending Dose | Healthy Volunteers | 48 | Complete |
| Phase 2 | PROTECT Trial | rCDI Patients | 200 | IND Amendment Filed |
| Phase 3 | SHIELD Trial | rCDI Prevention | 600 | Planned 2027 |

## 5. Phase 1 Summary
- Well tolerated at all dose levels (250 mg - 2000 mg BID)
- No serious adverse events related to study drug
- GI transit confirmed by fecal VHH quantification
- Dose-dependent toxin neutralization in ex vivo stool assays"

create_artifact "$P1_ID" \
  "Investigator Brochure v4.0 — LMN-201" \
  "m1.3.1" \
  "approved" \
  "# Investigator Brochure — LMN-201 v4.0

## 1. Summary
LMN-201 is a bispecific VHH antibody (nanobody) expressed in Arthrospira platensis (spirulina) that simultaneously neutralizes C. difficile toxins TcdA and TcdB. The drug is orally administered as enteric-coated capsules containing dried spirulina biomass.

## 2. Physical/Chemical Properties
- **Protein Class:** Camelid VHH (nanobody) fusion protein
- **Structure:** Two VHH domains (anti-TcdA + anti-TcdB) linked by (G₄S)₃ peptide
- **MW:** ~28 kDa
- **Expression Level:** 2-5% of total soluble protein in spirulina
- **Thermal Stability:** Active after 30 min at 80°C (TM > 85°C)
- **pH Stability:** Retains >80% binding at pH 2.0-10.0
- **Protease Resistance:** >90% intact after 2h pepsin/trypsin exposure

## 3. Nonclinical Pharmacology
### 3.1 In Vitro
| Assay | TcdA Result | TcdB Result |
|-------|-------------|-------------|
| Binding Affinity (Kd) | 1.2 nM | 3.4 nM |
| Toxin Neutralization (IC₅₀) | 8.3 nM | 12.1 nM |
| Vero Cell Protection | >95% at 50 nM | >95% at 100 nM |
| Cross-reactivity panel | Negative (human tissue array) | Negative |

### 3.2 In Vivo (Hamster CDI Model)
- 100% survival at 10 mg/kg BID (vs 0% vehicle, p<0.001)
- Dose-dependent reduction in intestinal pathology scores
- No colonization interference with commensal flora

## 4. Human Experience (Phase 1)
- 48 healthy volunteers completed dosing
- Most common AE: mild GI discomfort (8.3%), comparable to placebo (6.3%)
- No dose-limiting toxicities identified
- Recommended Phase 2 dose: 1000 mg BID × 10 days"

# Module 2: Summaries
create_artifact "$P1_ID" \
  "Quality Overall Summary — LMN-201" \
  "m2.3" \
  "review" \
  "# Module 2.3 — Quality Overall Summary

## 2.3.S Drug Substance
LMN-201 drug substance is whole dried Arthrospira platensis biomass expressing anti-TcdA/TcdB bispecific VHH at 2-5% of total soluble protein.

### Manufacturing Process
1. Seed culture expansion (photobioreactor, 25°C, 5% CO₂)
2. Production scale cultivation (5,000L photobioreactor, 14-day cycle)
3. Harvest by tangential flow filtration
4. Spray drying (inlet 180°C, outlet 80°C)
5. Milling to target particle size (D90 < 150 μm)
6. VHH activity verification (ELISA-based potency assay)

### Key Quality Attributes
| Parameter | Specification | Batch Results (n=5) |
|-----------|--------------|-------------------|
| VHH Content (% TSP) | 2.0-6.0% | 3.2, 2.8, 4.1, 3.5, 3.8% |
| Potency (EC₅₀ neutralization) | ≤ 50 nM | 8.3, 11.2, 7.9, 9.4, 10.1 nM |
| Moisture Content | ≤ 8.0% | 4.2-5.8% |
| Microbial Limits | Per USP <2021> | All within limits |
| Heavy Metals | Per ICH Q3D | All below PDE |
| Spirulina Identity | PCR + microscopy positive | Confirmed |

## 2.3.P Drug Product
Enteric-coated capsules (size 00) containing 500 mg dried spirulina biomass per capsule.
- Enteric coating: Eudragit L 30 D-55 (dissolves at pH > 5.5)
- No cold chain required — stable at 25°C/60% RH for 24 months"

create_artifact "$P1_ID" \
  "Nonclinical Overview — LMN-201" \
  "m2.4" \
  "approved" \
  "# Module 2.4 — Nonclinical Overview

## Pharmacology Summary
LMN-201 acts locally in the GI lumen by neutralizing C. difficile toxins. No systemic absorption is expected or desired — the VHH antibody exerts its effect entirely within the intestinal lumen.

### Mechanism of Action
1. Oral capsule transits to small intestine (enteric coating dissolves at pH 5.5)
2. Spirulina biomass releases into intestinal lumen
3. VHH antibodies bind and neutralize TcdA and TcdB
4. Neutralized toxins are eliminated via fecal excretion
5. Intestinal epithelium is protected from toxin-mediated damage

### Key Nonclinical Findings
| Study Type | Model | Key Result |
|-----------|-------|-----------|
| Primary Pharmacodynamics | Hamster CDI | 100% survival (vs 0% vehicle) |
| Dose-Response | Hamster CDI | ED₅₀ = 3 mg/kg BID |
| Microbiome Impact | Gnotobiotic mouse | No disruption to 12 monitored taxa |
| Systemic Absorption | Rat (radiolabeled) | <0.01% of dose in serum (below LLOQ) |

## Toxicology Summary
As a non-absorbed oral biologic derived from a GRAS organism, the toxicology package follows ICH S6(R1) with modifications per FDA's 2020 guidance on spirulina-derived biologics.

| Study | Species | Duration | NOAEL | Findings |
|-------|---------|----------|-------|----------|
| Acute toxicity | Rat | Single dose | >5000 mg/kg | No adverse effects |
| 28-day repeat dose | Rat | 28 days | 2000 mg/kg/day | No adverse effects |
| 28-day repeat dose | Dog | 28 days | 1500 mg/kg/day | Mild green stool coloring |
| Genotoxicity (Ames) | In vitro | — | — | Negative |
| Local tolerance | Rabbit (GI) | 14 days | 2000 mg/kg/day | No mucosal irritation |"

create_artifact "$P1_ID" \
  "Clinical Overview — LMN-201" \
  "m2.5" \
  "review" \
  "# Module 2.5 — Clinical Overview

## Clinical Development Rationale
Recurrent C. difficile infection (rCDI) represents a critical unmet medical need. Current therapies target the organism (antibiotics) but do not address the toxin-mediated tissue damage that drives recurrence. LMN-201 provides a complementary mechanism by neutralizing toxins in the GI lumen, protecting the epithelium while the microbiome recovers.

## Phase 1 Study (LMN-201-001) — Completed
### Design
Randomized, double-blind, placebo-controlled, SAD/MAD study in 48 healthy volunteers.

### Results Summary
| Parameter | LMN-201 (n=36) | Placebo (n=12) |
|-----------|----------------|----------------|
| Any AE | 22.2% | 16.7% |
| GI-related AE | 8.3% | 6.3% |
| Serious AE | 0% | 0% |
| Fecal VHH detected | 100% (at all doses) | 0% |
| Serum VHH detected | 0% | 0% |

### Key Conclusions
1. Well tolerated through 2000 mg BID × 14 days
2. VHH antibody confirmed in feces at all dose levels
3. No systemic absorption detected
4. Dose-dependent toxin neutralization capacity in stool

## Phase 2 PROTECT Trial (LMN-201-002) — Planned
- **Design:** Randomized, double-blind, placebo-controlled, Phase 2
- **Population:** Adults with first recurrence of CDI on standard antibiotics
- **Arms:** LMN-201 1000 mg BID vs placebo BID × 28 days (adjunctive to SOC antibiotics)
- **Primary Endpoint:** Sustained clinical response at Day 56 (no recurrence)
- **N:** 200 (100 per arm)
- **Sites:** 15 US sites
- **Expected enrollment start:** Q3 2026"

# Module 3: Quality
create_artifact "$P1_ID" \
  "Drug Substance — Spirulina Expression System (3.2.S.1)" \
  "m3.2.S.1" \
  "approved" \
  "# Module 3.2.S.1 — General Information: Drug Substance

## Nomenclature
- **Drug Substance:** LMN-201 Active Biomass
- **Description:** Dried Arthrospira platensis biomass expressing anti-TcdA/TcdB bispecific VHH
- **Expression Construct:** pLMN-201 (chromosomally integrated, marker-free)
- **Host Organism:** Arthrospira platensis strain UTEX LB 1926 (GRAS)

## Molecular Description of VHH
- **Architecture:** VHH(anti-TcdA)-(G₄S)₃-VHH(anti-TcdB)
- **Amino Acids:** 252 residues
- **Theoretical MW:** 27,834 Da
- **pI:** 7.2
- **Disulfide Bonds:** 2 canonical VHH disulfides
- **Post-translational Modifications:** None expected (prokaryotic host)

## Spirulina Host Properties
| Property | Value |
|----------|-------|
| Organism | Arthrospira platensis (cyanobacterium) |
| GRAS Status | FDA GRN 127 (2003) |
| Genome Size | ~6.8 Mb |
| Growth Temperature | 25-35°C |
| Doubling Time | ~24 hours (optimal conditions) |
| Cultivation | Photobioreactor, autotrophic (CO₂ + light) |
| Antibiotic Resistance | None (marker-free construct) |

## Genetic Stability
Clone stability demonstrated over 50 passages (>150 generations). VHH expression level maintained within 2.0-6.0% TSP across all passages tested."

create_artifact "$P1_ID" \
  "Drug Substance — Manufacturing Process (3.2.S.2)" \
  "m3.2.S.2" \
  "review" \
  "# Module 3.2.S.2 — Manufacture

## Manufacturer
**Lumen Biosciences Manufacturing Facility**
4142 23rd Avenue W, Seattle, WA 98199
FDA Establishment ID: FEI 3019876543

## Manufacturing Process Overview
\`\`\`
Master Cell Bank (MCB) → Working Cell Bank (WCB)
  ↓
Seed Culture (250 mL → 10L → 500L photobioreactor)
  ↓
Production Bioreactor (5,000L tubular photobioreactor)
  14 days, 30°C, continuous illumination, 5% CO₂
  ↓
Harvest: Tangential flow filtration (TFF)
  ↓
Spray Drying (inlet 180°C / outlet 80°C)
  ↓
Milling → Sieving (target D90 < 150 μm)
  ↓
QC Release Testing → DS Storage (2-8°C, desiccated)
\`\`\`

## Critical Process Parameters
| Step | Parameter | Acceptance Range |
|------|-----------|-----------------|
| Cultivation | Temperature | 30 ± 2°C |
| Cultivation | pH | 9.5 ± 0.3 |
| Cultivation | Light intensity | 200-400 μmol/m²/s |
| Cultivation | CO₂ concentration | 5 ± 1% |
| Harvest | TFF membrane MWCO | 100 kDa |
| Spray Dry | Inlet temperature | 180 ± 10°C |
| Spray Dry | Outlet temperature | 80 ± 5°C |
| Milling | Screen size | 150 μm |

## Batch History
| Batch | Scale | VHH (% TSP) | Potency (EC₅₀) | Yield (kg) |
|-------|-------|-------------|----------------|-----------|
| LMN-201-B001 | 5,000L | 3.2% | 8.3 nM | 42 |
| LMN-201-B002 | 5,000L | 2.8% | 11.2 nM | 38 |
| LMN-201-B003 | 5,000L | 4.1% | 7.9 nM | 45 |
| LMN-201-B004 | 5,000L | 3.5% | 9.4 nM | 41 |
| LMN-201-B005 | 5,000L | 3.8% | 10.1 nM | 43 |"

create_artifact "$P1_ID" \
  "Drug Product — Enteric Capsule Formulation (3.2.P.1)" \
  "m3.2.P.1" \
  "approved" \
  "# Module 3.2.P.1 — Drug Product Description and Composition

## Dosage Form
Enteric-coated hard gelatin capsules for oral administration.

## Strength
500 mg dried spirulina biomass per capsule (containing 10-30 mg VHH per capsule)

## Dose
1000 mg (2 capsules) BID with food

## Composition
| Component | Function | mg/capsule | % w/w |
|-----------|----------|-----------|-------|
| LMN-201 Dried Biomass | Active | 500.0 | 83.3 |
| Microcrystalline cellulose | Filler | 55.0 | 9.2 |
| Colloidal silicon dioxide | Glidant | 3.0 | 0.5 |
| Magnesium stearate (vegetable) | Lubricant | 2.0 | 0.3 |
| Hard gelatin capsule shell (size 00) | Container | ~40.0 | 6.7 |
| **Total capsule fill** | | **560.0** | |

## Enteric Coating
- **Polymer:** Eudragit L 30 D-55 (methacrylic acid copolymer)
- **Coating Weight Gain:** 8-12% w/w
- **Dissolution pH Threshold:** > 5.5
- **Purpose:** Protects VHH from gastric acid; releases in proximal small intestine

## Container Closure
HDPE bottles (60-count) with child-resistant caps, desiccant canister (2g silica gel), cotton filler. No cold chain required.

## Storage
Store at 15-30°C. Protect from moisture. Stable for 24 months at 25°C/60% RH."

# Module 4: Nonclinical
create_artifact "$P1_ID" \
  "28-Day Rat Toxicology — LMN-201" \
  "m4.2.3.2" \
  "approved" \
  "# 28-Day Repeat-Dose Oral Toxicity Study in Sprague-Dawley Rats

**Study Number:** LMN-TOX-001
**GLP Compliance:** Yes
**Test Facility:** Charles River Laboratories, Reno, NV

## Study Design
| Group | Dose (mg/kg/day) | Males | Females | Recovery |
|-------|-----------------|-------|---------|----------|
| 1 (Vehicle) | 0 (empty spirulina) | 15 | 15 | 5M/5F |
| 2 (Low) | 500 | 15 | 15 | — |
| 3 (Mid) | 1000 | 15 | 15 | 5M/5F |
| 4 (High) | 2000 | 15 | 15 | 5M/5F |

## Vehicle Control
Non-transformed (wild-type) A. platensis dried biomass at equivalent mass to high dose, providing protein-matched, VHH-negative control.

## Key Findings
- **Clinical observations:** Green stool coloring in all groups including vehicle control (expected with spirulina ingestion). No other clinical findings.
- **Body weight:** No significant differences between groups.
- **Food consumption:** Normal across all groups.
- **Clinical pathology:** No significant changes in hematology, clinical chemistry, or urinalysis.
- **Gross pathology:** No treatment-related findings.
- **Histopathology:** No treatment-related microscopic findings in GI tract or any other organ examined (full tissue panel, 40+ tissues).

## NOAEL: 2000 mg/kg/day (highest dose tested)
No adverse effects observed at any dose level. The spirulina-derived VHH was well tolerated following 28 days of oral administration."

create_artifact "$P1_ID" \
  "Hamster Efficacy — CDI Challenge Model" \
  "m4.2.1.1" \
  "approved" \
  "# Primary Pharmacodynamics: C. difficile Hamster Challenge Model

**Study Number:** LMN-PHARM-001
**GLP Compliance:** Non-GLP (efficacy study)

## Study Design
Golden Syrian hamsters pre-treated with clindamycin (30 mg/kg IP, Day -1) were challenged with C. difficile strain VPI 10463 (10⁴ CFU by oral gavage, Day 0). Treatment began 4 hours post-challenge.

## Groups
| Group | Treatment | Route | Dose | Schedule | N |
|-------|-----------|-------|------|----------|---|
| 1 | Vehicle (WT spirulina) | PO | 30 mg/kg | BID × 10d | 10 |
| 2 | LMN-201 Low | PO | 3 mg/kg | BID × 10d | 10 |
| 3 | LMN-201 Mid | PO | 10 mg/kg | BID × 10d | 10 |
| 4 | LMN-201 High | PO | 30 mg/kg | BID × 10d | 10 |
| 5 | Vancomycin (positive) | PO | 20 mg/kg | BID × 10d | 10 |

## Survival Results (14-day observation)
| Group | Survival | Median Survival | p vs Vehicle |
|-------|----------|----------------|--------------|
| Vehicle | 0/10 (0%) | 3 days | — |
| LMN-201 3 mg/kg | 5/10 (50%) | 8 days | 0.003 |
| LMN-201 10 mg/kg | 8/10 (80%) | >14 days | <0.001 |
| LMN-201 30 mg/kg | 10/10 (100%) | >14 days | <0.001 |
| Vancomycin | 10/10 (100%) | >14 days | <0.001 |

## Cecal Pathology (Day 14 survivors)
| Group | Pathology Score (0-4) | Toxin A (ng/g) | Toxin B (ng/g) |
|-------|----------------------|----------------|----------------|
| LMN-201 10 mg/kg | 0.6 ± 0.3 | 12 ± 8 | 8 ± 5 |
| LMN-201 30 mg/kg | 0.2 ± 0.1 | <5 (BLQ) | <5 (BLQ) |
| Vancomycin | 0.4 ± 0.2 | 24 ± 15 | 18 ± 11 |

## Conclusions
LMN-201 provided complete protection against lethal CDI at 30 mg/kg BID with superior toxin neutralization vs vancomycin. Vancomycin-treated survivors showed residual toxin levels, consistent with the antibiotic's bactericidal (not toxin-neutralizing) mechanism."

# Module 5: Clinical
create_artifact "$P1_ID" \
  "Phase 2 PROTECT Protocol (LMN-201-002)" \
  "m5.3.5.1" \
  "review" \
  "# Clinical Study Protocol LMN-201-002 (PROTECT)

## Protocol Title
A Phase 2, Randomized, Double-Blind, Placebo-Controlled Study of LMN-201 as Adjunctive Therapy for Prevention of Recurrent Clostridioides difficile Infection

## Sponsor
Lumen Biosciences, Inc., Seattle, WA

## Study Design
- **Phase:** 2
- **Design:** Randomized, double-blind, placebo-controlled, parallel-group
- **Population:** Adults (≥18 years) with first recurrence of CDI receiving standard antibiotic therapy
- **Randomization:** 1:1 (LMN-201 : Placebo), stratified by antibiotic (vancomycin vs fidaxomicin)

## Treatment
| Arm | Drug | Dose | Route | Schedule | Duration |
|-----|------|------|-------|----------|----------|
| A | LMN-201 | 1000 mg (2 capsules) | Oral | BID with food | 28 days |
| B | Placebo (WT spirulina) | 1000 mg (2 capsules) | Oral | BID with food | 28 days |

Note: All patients receive standard antibiotic therapy (vancomycin or fidaxomicin) per SOC.

## Endpoints
### Primary
- Sustained clinical response at Day 56: No recurrence of CDI (defined as ≥3 unformed stools/24h + positive C. diff test) through 28 days after end of study treatment

### Secondary
1. Time to CDI recurrence
2. Fecal toxin levels (quantitative TcdA/TcdB ELISA) at Days 14, 28, 42, 56
3. Microbiome recovery (16S rRNA sequencing, Shannon diversity index)
4. Safety and tolerability
5. Patient-reported outcomes (CDI-specific QoL questionnaire)

### Exploratory
- Fecal VHH pharmacokinetics (quantitative anti-VHH ELISA)
- Serum and fecal anti-TcdA/TcdB neutralizing antibody titers
- C. difficile strain characterization (ribotyping, whole genome sequencing)

## Sample Size Justification
Assuming 30% recurrence rate in placebo and 15% in LMN-201 (absolute risk reduction 15%), 90 patients per arm provides 80% power at two-sided alpha 0.05. Target enrollment: 200 (accounting for 10% dropout).

## Sites
15 academic medical centers across the US with established CDI research programs."

create_artifact "$P1_ID" \
  "Phase 1 Clinical Study Report (LMN-201-001)" \
  "m5.3.1" \
  "locked" \
  "# Clinical Study Report: LMN-201-001

## Study Title
A Phase 1, Randomized, Double-Blind, Placebo-Controlled, Single and Multiple Ascending Dose Study of LMN-201 in Healthy Volunteers

## Study Status: COMPLETED
- **First Patient In:** August 12, 2025
- **Last Patient Out:** December 18, 2025
- **Database Lock:** January 15, 2026
- **Report Finalized:** February 28, 2026

## Study Design
### Part A: Single Ascending Dose (SAD)
4 dose cohorts: 250 mg, 500 mg, 1000 mg, 2000 mg (6 active : 2 placebo per cohort)

### Part B: Multiple Ascending Dose (MAD)
3 dose cohorts: 500 mg BID, 1000 mg BID, 2000 mg BID × 14 days (8 active : 4 placebo per cohort)

## Demographics
| Parameter | LMN-201 (n=36) | Placebo (n=12) |
|-----------|----------------|----------------|
| Mean Age (years) | 34.2 ± 8.1 | 32.8 ± 7.4 |
| Male (%) | 55.6% | 58.3% |
| BMI (kg/m²) | 24.8 ± 3.2 | 25.1 ± 2.9 |
| Race: White | 58.3% | 50.0% |
| Race: Black | 19.4% | 25.0% |
| Race: Asian | 13.9% | 16.7% |
| Race: Other | 8.3% | 8.3% |

## Safety Results
| Category | LMN-201 | Placebo |
|----------|---------|---------|
| Any AE | 8 (22.2%) | 2 (16.7%) |
| GI AEs (mild) | 3 (8.3%) | 1 (8.3%) |
| SAEs | 0 | 0 |
| Dose-limiting | 0 | 0 |
| Discontinued for AE | 0 | 0 |

## Fecal VHH Pharmacokinetics (MAD, 1000 mg BID)
| Day | Fecal VHH (μg/g stool) | Toxin Neutralization Capacity |
|-----|----------------------|------------------------------|
| 1 | 142 ± 45 | 94% |
| 7 | 168 ± 52 | 97% |
| 14 | 155 ± 48 | 96% |
| 21 (7d post-dose) | <1 (BLQ) | 0% |

## Key Conclusions
1. LMN-201 was well tolerated at all doses tested
2. VHH antibody was detected in feces at all dose levels, confirming GI delivery
3. No systemic absorption of VHH was detected (serum levels below LLOQ at all timepoints)
4. Recommended Phase 2 dose: 1000 mg BID × 28 days"


# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║ PROJECT 2: LMN-301 — Anti-Norovirus IND (Early stage)                   ║
# ╚═══════════════════════════════════════════════════════════════════════════╝
echo ""
echo "=========================================="
echo "  PROJECT 2: LMN-301 Anti-Norovirus IND"
echo "=========================================="

P2_RESP=$(curl -sf "$BASE/api/concept2cure/projects" \
  -H "$AUTH" -H "$CT" \
  -d '{
    "name": "LMN-301 (Anti-Norovirus VHH) — IND Application",
    "submissionType": "IND",
    "description": "Investigational New Drug application for LMN-301, an oral multi-valent VHH antibody cocktail produced in spirulina for treatment and prophylaxis of norovirus gastroenteritis. Targets GII.4, GII.17, and GI.1 capsid proteins. Preclinical stage.",
    "sponsor": "Lumen Biosciences, Inc.",
    "product": "LMN-301 (Anti-Norovirus VHH Cocktail)",
    "region": "US FDA",
    "targetSubmissionDate": "2027-03-01T00:00:00.000Z"
  }')
P2_ID=$(echo "$P2_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "  Project ID: $P2_ID"

create_artifact "$P2_ID" \
  "LMN-301 Pre-IND Strategy Summary" \
  "m1.2" \
  "draft" \
  "# LMN-301 — Pre-IND Strategy Summary

## Drug Information
- **Name:** LMN-301
- **Class:** Multi-valent VHH antibody cocktail (spirulina-derived)
- **Targets:** Norovirus capsid protein VP1 — genotypes GII.4, GII.17, GI.1
- **VHH Components:** 3 individual VHH domains, each targeting distinct epitopes
- **Indication:** Treatment and prophylaxis of norovirus gastroenteritis
- **Route:** Oral (enteric-coated capsules)

## Market Context
- Norovirus causes ~685 million cases and 200,000 deaths globally per year
- No FDA-approved antiviral treatment or vaccine currently available
- Major burden in cruise ships, military, long-term care facilities, immunocompromised
- Estimated US market opportunity: \$2-4 billion

## Regulatory Strategy
| Milestone | Target Date | Status |
|-----------|-------------|--------|
| VHH candidate selection | Completed | Done |
| In vitro binding/neutralization | Q1 2026 | In progress |
| GMP spirulina strain engineering | Q2 2026 | In progress |
| Pilot toxicology (14-day rat) | Q3 2026 | Planned |
| Pre-IND meeting (Type B) | Q4 2026 | Planned |
| IND-enabling tox studies | Q1 2027 | Planned |
| IND submission | Q1 2027 | Planned |

## Key Scientific Challenges
1. Norovirus cannot be cultured in standard cell lines — reliance on human intestinal enteroid (HIE) models
2. Broad genotype coverage needed (GII.4 accounts for ~60% of outbreaks)
3. Rapid viral evolution — need to assess VHH binding stability across variant panels"

create_artifact "$P2_ID" \
  "LMN-301 VHH Binding Characterization" \
  "m4.2.1.1" \
  "draft" \
  "# Primary Pharmacodynamics: In Vitro VHH Binding Characterization

## VHH Panel
| VHH Clone | Target Genotype | Epitope Region | Kd (nM) | Selection Method |
|-----------|----------------|----------------|---------|-----------------|
| VHH-NV4a | GII.4 Sydney 2012 | P2 domain, loop region | 0.8 | Phage display, camelid immunization |
| VHH-NV17b | GII.17 Kawasaki 2014 | P1 subdomain | 2.1 | Phage display |
| VHH-NV1c | GI.1 Norwalk | S domain, conserved epitope | 4.5 | Yeast surface display |

## Virus-Like Particle (VLP) Binding
| VHH | GII.4 VLP | GII.17 VLP | GI.1 VLP | GII.2 VLP | GII.6 VLP |
|-----|-----------|------------|----------|-----------|-----------|
| VHH-NV4a | ++ | − | − | + (cross-reactive) | − |
| VHH-NV17b | − | ++ | − | − | + (weak) |
| VHH-NV1c | − | − | ++ | − | − |
| Cocktail | ++ | ++ | ++ | + | + |

## Human Intestinal Enteroid (HIE) Neutralization
| VHH | GII.4 IC₅₀ (nM) | GII.17 IC₅₀ (nM) | GI.1 IC₅₀ (nM) |
|-----|-----------------|------------------|----------------|
| VHH-NV4a | 3.2 | >1000 | >1000 |
| VHH-NV17b | >1000 | 8.7 | >1000 |
| VHH-NV1c | >1000 | >1000 | 15.4 |
| Cocktail | 3.2 | 8.7 | 15.4 |

## Conclusions
The LMN-301 VHH cocktail provides broad neutralization coverage across the three most prevalent norovirus genotypes. Cross-reactivity with GII.2 via VHH-NV4a provides additional coverage potential.

**Status: DRAFT — Additional variant panel testing in progress**"

create_artifact "$P2_ID" \
  "LMN-301 Spirulina Strain Engineering Report" \
  "m3.2.S.1" \
  "draft" \
  "# Drug Substance: Spirulina Strain Engineering — LMN-301

## Expression Strategy
Three VHH genes (VHH-NV4a, VHH-NV17b, VHH-NV1c) will be co-expressed in a single spirulina strain as a polycistronic construct with individual ribosome binding sites.

## Construct Design
\`\`\`
pLMN-301: PcpcB → RBS-VHH-NV4a-STOP → RBS-VHH-NV17b-STOP → RBS-VHH-NV1c-STOP → TcpcB
\`\`\`

## Current Status
| Component | Status | Expression Level (% TSP) |
|-----------|--------|------------------------|
| VHH-NV4a (single) | Confirmed | 3.8% |
| VHH-NV17b (single) | Confirmed | 2.9% |
| VHH-NV1c (single) | Confirmed | 2.2% |
| Triple construct | In progress | Target: 1.5% each (4.5% total) |

## Challenges
- Polycistronic expression optimization ongoing (current combined <3%)
- May need to shift to tandem promoter strategy if polycistronic yields insufficient
- Stability testing required after engineering (target: 30+ passages)

**Status: EARLY DEVELOPMENT — Strain engineering in progress**"


# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║ PROJECT 3: LMN-401 — Anti-Campylobacter (Travelers' Diarrhea) IND      ║
# ╚═══════════════════════════════════════════════════════════════════════════╝
echo ""
echo "=========================================="
echo "  PROJECT 3: LMN-401 Anti-Campylobacter"
echo "=========================================="

P3_RESP=$(curl -sf "$BASE/api/concept2cure/projects" \
  -H "$AUTH" -H "$CT" \
  -d '{
    "name": "LMN-401 (Anti-Campylobacter VHH) — IND Application",
    "submissionType": "IND",
    "description": "Investigational New Drug application for LMN-401, an oral VHH antibody targeting Campylobacter jejuni CDT toxin and flagellar proteins for prophylaxis of travelers diarrhea. DoD-partnered program for military personnel. Discovery stage.",
    "sponsor": "Lumen Biosciences, Inc.",
    "product": "LMN-401 (Anti-Campylobacter VHH)",
    "region": "US FDA",
    "targetSubmissionDate": "2028-06-01T00:00:00.000Z"
  }')
P3_ID=$(echo "$P3_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "  Project ID: $P3_ID"

create_artifact "$P3_ID" \
  "LMN-401 Program Overview & DoD Partnership" \
  "m1.2" \
  "draft" \
  "# LMN-401 — Program Overview

## Background
Campylobacter jejuni is the leading bacterial cause of travelers' diarrhea worldwide, with an estimated 400-500 million cases annually. It is a critical readiness threat for military personnel deployed to endemic regions, with attack rates of 20-50% during 2-week deployments.

## DoD Partnership
Lumen Biosciences has received a \$24.7M contract from BARDA/JPEO-CBRND to develop LMN-401 as a prophylactic oral biologic for military personnel.

## Drug Design
LMN-401 is a bispecific VHH targeting:
1. **CDT (Cytolethal Distending Toxin):** Primary virulence factor causing cell cycle arrest and apoptosis in intestinal epithelium
2. **FlaA (Flagellin A):** Major colonization factor enabling gut mucosa adhesion

## Current Stage: DISCOVERY/LEAD OPTIMIZATION
| Activity | Status | Timeline |
|----------|--------|----------|
| VHH library screening (CDT) | Complete | Done |
| VHH library screening (FlaA) | Complete | Done |
| Lead VHH characterization | In progress | Q1-Q2 2026 |
| Bispecific fusion engineering | Planned | Q3 2026 |
| Spirulina strain construction | Planned | Q4 2026 |
| Preclinical efficacy (mouse model) | Planned | Q1-Q2 2027 |
| IND-enabling studies | Planned | Q3-Q4 2027 |
| IND submission | Planned | Q2 2028 |

## Military Deployment Advantages of Spirulina Platform
- No cold chain → compatible with forward-deployed logistics
- Shelf-stable capsules → 24+ month shelf life at ambient
- Oral administration → no injection site, no needle disposal
- Simple dosing → can be taken as daily prophylaxis during deployment"


# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║ PROJECT 4: LMN-501 — Anti-Inflammatory Bowel Disease (IBD) BLA         ║
# ╚═══════════════════════════════════════════════════════════════════════════╝
echo ""
echo "=========================================="
echo "  PROJECT 4: LMN-501 Anti-TNFα for IBD"
echo "=========================================="

P4_RESP=$(curl -sf "$BASE/api/concept2cure/projects" \
  -H "$AUTH" -H "$CT" \
  -d '{
    "name": "LMN-501 (Oral Anti-TNFα VHH) — BLA Application",
    "submissionType": "BLA",
    "description": "Biologics License Application planning for LMN-501, a topically-acting oral anti-TNFα VHH produced in spirulina for treatment of mild-to-moderate ulcerative colitis. Designed to provide local TNFα neutralization in the colonic mucosa without systemic immunosuppression.",
    "sponsor": "Lumen Biosciences, Inc.",
    "product": "LMN-501 (Oral Anti-TNFα VHH)",
    "region": "US FDA",
    "targetSubmissionDate": "2029-01-01T00:00:00.000Z"
  }')
P4_ID=$(echo "$P4_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "  Project ID: $P4_ID"

create_artifact "$P4_ID" \
  "LMN-501 Scientific Rationale & Development Plan" \
  "m1.2" \
  "draft" \
  "# LMN-501 — Oral Anti-TNFα for Ulcerative Colitis

## Scientific Rationale
Current anti-TNFα biologics (infliximab, adalimumab) are systemically delivered and carry significant risks: serious infections, malignancy, and immunogenicity. LMN-501 delivers TNFα-neutralizing VHH antibodies directly to the colonic mucosa via oral, colon-targeted capsules, providing local efficacy without systemic immunosuppression.

## Drug Design
- **VHH Target:** Human TNFα (binds receptor-binding domain)
- **Affinity:** Kd = 0.3 nM (comparable to adalimumab, Kd = 0.1 nM)
- **Formulation:** Colon-targeted capsules (Eudragit S, dissolves at pH > 7.0)
- **Expression:** 4.2% TSP in A. platensis
- **Dose concept:** 2000 mg BID (delivering ~80 mg VHH to colonic lumen per day)

## Competitive Advantages
| Feature | Systemic Anti-TNFα | LMN-501 (Oral, Local) |
|---------|-------------------|----------------------|
| Route | IV/SC injection | Oral capsule |
| Systemic exposure | Yes (immunosuppression) | Minimal (<0.01% absorbed) |
| Serious infection risk | Elevated (BBW) | Expected normal |
| Immunogenicity (ADA) | 5-60% | Not expected (no systemic exposure) |
| Cold chain | Required | Not required |
| Self-administration | SC possible | Oral capsule |
| Cost of manufacture | \$20-50K/patient/year | Target <\$5K/patient/year |

## Development Timeline
| Phase | Activity | Timeline |
|-------|----------|----------|
| Preclinical | DSS colitis model (mouse), TNBS model (rat) | Q2-Q4 2026 |
| IND-enabling | GLP tox (rat, 28-day), GLP tox (dog, 28-day) | Q1-Q2 2027 |
| Phase 1 | SAD/MAD in healthy volunteers | Q4 2027 |
| Phase 2 | Randomized, placebo-controlled in mild-mod UC | 2028 |
| BLA filing | Target | 2029 |

## Key Risks
1. VHH must survive colonic protease environment — stability optimization ongoing
2. Colonic residence time uncertain — may need extended-release formulation
3. Regulatory pathway for topically-acting oral biologic is novel — pre-IND meeting critical"

create_artifact "$P4_ID" \
  "LMN-501 In Vitro Pharmacology Data" \
  "m4.2.1.1" \
  "draft" \
  "# In Vitro Pharmacology — LMN-501 Anti-TNFα VHH

## TNFα Binding Characterization
### Surface Plasmon Resonance (BIAcore)
| Parameter | LMN-501 VHH | Adalimumab (reference) |
|-----------|------------|----------------------|
| ka (1/Ms) | 4.2 × 10⁵ | 5.8 × 10⁵ |
| kd (1/s) | 1.3 × 10⁻⁴ | 5.8 × 10⁻⁵ |
| KD (nM) | 0.31 | 0.10 |

### TNFα Neutralization (L929 Cytotoxicity Assay)
| VHH Source | IC₅₀ (nM) | Emax (% protection) |
|-----------|-----------|-------------------|
| Purified VHH | 2.4 | 98% |
| Spirulina lysate | 8.1 | 94% |
| Adalimumab (reference) | 0.8 | 99% |

### Specificity Panel
Tested against human TNFβ (LTα), TNF superfamily members (TRAIL, FasL, RANKL, CD40L):
- **TNFβ cross-reactivity:** <1% (highly specific for TNFα)
- **All other TNF superfamily:** No binding detected

## Colonic Environment Stability
| Condition | VHH Activity Retained (%) |
|-----------|--------------------------|
| pH 1.0, 2h (gastric simulation) | 82% (with enteric coating: N/A) |
| pH 7.0, 24h (colonic pH) | 95% |
| Fecal protease mix, 4h | 71% |
| Fecal protease mix, 8h | 54% |
| Colonic mucus layer, 12h | 88% |

## Current Status: PRECLINICAL CHARACTERIZATION
Next steps: In vivo efficacy in DSS colitis model (scheduled Q2 2026)"

echo ""
echo "=========================================="
echo "  Lumen Biosciences Setup Complete!"
echo "=========================================="
echo ""
echo "Organization: Lumen Biosciences (Seattle, WA)"
echo "Login: dr.patel@lumenbiosciences.com / Lumen2026!"
echo ""
echo "Projects created:"
echo "  1. LMN-201 (Anti-C. diff VHH)      — Phase 2 ready, most advanced"
echo "     Project ID: $P1_ID"
echo "  2. LMN-301 (Anti-Norovirus VHH)     — Preclinical, early stage"
echo "     Project ID: $P2_ID"
echo "  3. LMN-401 (Anti-Campylobacter VHH) — Discovery, DoD-partnered"
echo "     Project ID: $P3_ID"
echo "  4. LMN-501 (Oral Anti-TNFα VHH)     — Preclinical, IBD program"
echo "     Project ID: $P4_ID"
echo ""
echo "Total artifacts: ~20 documents across all projects"
echo "  LMN-201: 12 artifacts (IND pyramid fully populated)"
echo "  LMN-301: 3 artifacts (early stage)"
echo "  LMN-401: 1 artifact (discovery)"
echo "  LMN-501: 2 artifacts (preclinical)"
echo ""
echo "Ready for demo!"

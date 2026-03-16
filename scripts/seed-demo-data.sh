#!/usr/bin/env bash
# ============================================================================
# Concept2Cure Demo Data Seed Script
# Creates realistic projects at various stages for demo walkthroughs
# ============================================================================
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"
EMAIL="${DEMO_EMAIL:-jm.smith@concept2cure.pro}"
PASSWORD="${DEMO_PASSWORD:-demo123}"

echo "=========================================="
echo "  Concept2Cure Demo Data Seeder"
echo "=========================================="
echo "Target: $BASE_URL"
echo ""

# ── Authenticate ────────────────────────────────────────────────────────────
echo "🔐 Authenticating as $EMAIL..."
LOGIN_RESP=$(curl -sf "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
echo "   ✅ Token acquired"

AUTH="Authorization: Bearer $TOKEN"
CT="Content-Type: application/json"

# Helper to make API calls
api_post() {
  local path="$1"
  local data="$2"
  curl -sf "$BASE_URL$path" -H "$AUTH" -H "$CT" -d "$data"
}

api_put() {
  local path="$1"
  local data="$2"
  curl -sf "$BASE_URL$path" -X PUT -H "$AUTH" -H "$CT" -d "$data"
}

# ============================================================================
# PROJECT 1: IND Submission — EARLY STAGE (Just started)
# ============================================================================
echo ""
echo "📋 Creating Project 1: IND Submission — Novacetrol Phase 1 (Early Stage)..."

P1_RESP=$(api_post "/api/concept2cure/projects" '{
  "name": "Novacetrol (NVC-205) — IND Application",
  "submissionType": "IND",
  "description": "Investigational New Drug application for Novacetrol, a novel selective CDK4/6 inhibitor targeting HR+/HER2- metastatic breast cancer. Phase 1 first-in-human dose escalation study.",
  "sponsor": "Concept2Cure Therapeutics",
  "product": "Novacetrol (NVC-205)",
  "region": "US FDA",
  "targetSubmissionDate": "2026-09-15T00:00:00.000Z"
}')
P1_ID=$(echo "$P1_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "   ✅ Project created: $P1_ID"

# Add artifacts for Project 1 (early-stage drafts)
P1_NUM=$(echo "$P1_ID" | sed 's/proj_//')

echo "   📄 Adding IND Module 1 cover letter draft..."
api_post "/api/concept2cure/projects/$P1_ID/artifacts" '{
  "type": "markdown",
  "category": "document",
  "title": "IND Cover Letter (Form FDA 1571)",
  "content": "# IND Cover Letter — Novacetrol (NVC-205)\n\n## Sponsor Information\n- **Sponsor**: Concept2Cure Therapeutics, Inc.\n- **Address**: 200 Innovation Drive, Suite 400, Cambridge, MA 02142\n- **Contact**: Dr. J.M. Smith, VP Regulatory Affairs\n\n## Drug Information\n- **Drug Name**: Novacetrol\n- **Code**: NVC-205\n- **Chemical Class**: Selective CDK4/6 Inhibitor\n- **Indication**: HR+/HER2- Metastatic Breast Cancer\n\n## Submission Summary\nThis IND application is submitted to support initiation of a Phase 1 first-in-human dose escalation study (Protocol NVC-205-001) in patients with advanced HR+/HER2- breast cancer who have progressed on prior endocrine therapy.\n\n**Status: DRAFT — Pending CMC data compilation**",
  "metadata": {"ctdSection": "1.0", "stage": "draft"}
}' > /dev/null

echo "   📄 Adding Investigator Brochure outline..."
api_post "/api/concept2cure/projects/$P1_ID/artifacts" '{
  "type": "markdown",
  "category": "document",
  "title": "Investigator Brochure (IB) — NVC-205",
  "content": "# Investigator Brochure — Novacetrol (NVC-205)\n## Version 1.0 — DRAFT\n\n### Table of Contents\n1. Summary\n2. Introduction\n3. Physical, Chemical, and Pharmaceutical Properties\n4. Nonclinical Studies\n   - 4.1 Pharmacology\n   - 4.2 Pharmacokinetics (ADME)\n   - 4.3 Toxicology\n5. Effects in Humans (N/A — First in Human)\n6. Summary of Data and Guidance for the Investigator\n\n### 1. Summary\nNovacetrol (NVC-205) is a novel, orally administered, selective cyclin-dependent kinase 4/6 (CDK4/6) inhibitor with enhanced selectivity over CDK9, reducing the off-target myelosuppression observed with current CDK4/6 inhibitors.\n\n### 3. Physical, Chemical, and Pharmaceutical Properties\n- **Molecular Formula**: C₂₄H₂₉N₇O₂\n- **Molecular Weight**: 447.53 g/mol\n- **Solubility**: Freely soluble in acidic pH (1.2), sparingly soluble at pH 6.8\n- **Polymorphic Form**: Form A (thermodynamically stable)\n- **Dosage Form**: Film-coated tablets, 25 mg, 75 mg, 150 mg\n\n### 4. Nonclinical Studies\n#### 4.1 Pharmacology\nIn vitro IC50 values: CDK4 = 2.1 nM, CDK6 = 3.8 nM, CDK9 > 500 nM (selectivity ratio >130x).\n\nIn xenograft models (MCF-7, MDA-MB-231), NVC-205 demonstrated dose-dependent tumor growth inhibition (TGI 78-92%) with no significant body weight loss at efficacious doses.\n\n**Status: Data compilation in progress**",
  "metadata": {"ctdSection": "2.5", "stage": "draft"}
}' > /dev/null

echo "   📄 Adding CMC overview skeleton..."
api_post "/api/concept2cure/projects/$P1_ID/artifacts" '{
  "type": "markdown",
  "category": "document",
  "title": "Module 3 — CMC Quality Overview",
  "content": "# Quality Overall Summary — NVC-205\n## Module 2.3 — DRAFT SKELETON\n\n### 2.3.S Drug Substance\n- **Manufacturer**: [Pending — Contract synthesis at PharmaCore LLC]\n- **Process Description**: [4-step convergent synthesis — process development in progress]\n- **Specifications**: [Preliminary specs established — formal validation pending]\n- **Stability**: 6-month accelerated data available, 12-month real-time in progress\n\n### 2.3.P Drug Product\n- **Dosage Form**: Film-coated tablets\n- **Strengths**: 25 mg, 75 mg, 150 mg\n- **Manufacturing Site**: Concept2Cure Biologics, Cambridge MA\n- **Batch Size**: 10,000 tablets (clinical supply)\n- **Dissolution**: >85% in 30 min (pH 1.2, 4.5, 6.8)\n\n### Status\n⚠️ **Gaps identified:**\n- Drug substance process validation incomplete\n- Impurity qualification per ICH Q3A pending\n- Container closure suitability study not initiated\n\n**Target completion: Q2 2026**",
  "metadata": {"ctdSection": "2.3", "stage": "draft"}
}' > /dev/null

# ============================================================================
# PROJECT 2: 510(K) — MID STAGE (Testing & documentation underway)
# ============================================================================
echo ""
echo "📋 Creating Project 2: 510(k) — CardioSync Monitor Pro (Mid-Stage)..."

P2_RESP=$(api_post "/api/concept2cure/projects" '{
  "name": "CardioSync Monitor Pro — 510(k) Submission",
  "submissionType": "510K",
  "description": "Traditional 510(k) submission for CardioSync Monitor Pro, a wireless cardiac rhythm monitoring system with AI-assisted arrhythmia detection. Predicate device: K192847 (HeartTrack ECG Monitor).",
  "sponsor": "Concept2Cure Medical Devices",
  "product": "CardioSync Monitor Pro (CSM-300)",
  "region": "US FDA",
  "targetSubmissionDate": "2026-06-30T00:00:00.000Z"
}')
P2_ID=$(echo "$P2_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "   ✅ Project created: $P2_ID"

echo "   📄 Adding device description..."
api_post "/api/concept2cure/projects/$P2_ID/artifacts" '{
  "type": "markdown",
  "category": "document",
  "title": "Device Description (eSTAR Section 4)",
  "content": "# Device Description — CardioSync Monitor Pro\n## eSTAR Section 4\n\n### 4.1 Device Overview\nThe CardioSync Monitor Pro (CSM-300) is a wireless, single-lead cardiac rhythm monitoring system intended for continuous ECG recording and AI-assisted arrhythmia detection in adult patients.\n\n### 4.2 Physical Description\n- **Dimensions**: 45mm × 32mm × 8mm\n- **Weight**: 14g (with adhesive patch)\n- **Battery**: Rechargeable Li-Po, 72-hour continuous recording\n- **Connectivity**: Bluetooth 5.2 Low Energy\n- **Water Resistance**: IP67\n\n### 4.3 Functional Description\n- Real-time single-lead ECG acquisition (sampling rate: 256 Hz)\n- On-device signal processing and QRS detection\n- Cloud-based AI arrhythmia classification (AFib, AFL, PVC, VT, SVT)\n- Mobile app with real-time monitoring and alerts\n- HIPAA-compliant data storage and physician portal\n\n### 4.4 Software Description\n- **Classification**: Software Level of Concern — Moderate\n- **Algorithm**: Proprietary CNN model, trained on 450K annotated ECG segments\n- **Sensitivity**: AFib detection 97.2% (95% CI: 96.1-98.0)\n- **Specificity**: AFib detection 98.8% (95% CI: 98.2-99.2)\n\n### 4.5 Intended Use\nThe CardioSync Monitor Pro is intended for use by healthcare professionals for continuous monitoring and recording of cardiac rhythm data in ambulatory adult patients. The device provides AI-assisted detection of cardiac arrhythmias to aid clinical decision-making.\n\n**Status: COMPLETE — Under QA review**",
  "metadata": {"ctdSection": "4.0", "stage": "review"}
}' > /dev/null

echo "   📄 Adding predicate comparison..."
api_post "/api/concept2cure/projects/$P2_ID/artifacts" '{
  "type": "markdown",
  "category": "document",
  "title": "Substantial Equivalence Comparison (eSTAR Section 10)",
  "content": "# Substantial Equivalence Comparison\n## eSTAR Section 10\n\n| Feature | CardioSync Monitor Pro (CSM-300) | HeartTrack ECG (K192847) | Equivalence |\n|---------|--------------------------------|--------------------------|-------------|\n| Intended Use | Ambulatory cardiac monitoring | Ambulatory cardiac monitoring | Equivalent |\n| Technology | Single-lead ECG, wireless | Single-lead ECG, wireless | Equivalent |\n| Detection | AI + manual review | Manual review only | New feature — validated |\n| Recording | 72-hour continuous | 48-hour continuous | Improved — no safety impact |\n| Connectivity | BLE 5.2 | BLE 4.2 | Updated standard |\n| Water Resistance | IP67 | IP54 | Improved |\n| Software Level | Moderate | Moderate | Equivalent |\n| Biocompatibility | ISO 10993 tested | ISO 10993 tested | Equivalent |\n| Electrical Safety | IEC 60601-1 Ed. 3.2 | IEC 60601-1 Ed. 3.1 | Updated standard |\n\n### Rationale for Substantial Equivalence\nThe CSM-300 shares the same intended use, fundamental technology, and target population as the predicate device K192847. The AI-assisted arrhythmia detection represents a software enhancement that has been independently validated per FDA guidance on Clinical Decision Support software.\n\n**Status: COMPLETE — Signed off by Regulatory**",
  "metadata": {"ctdSection": "10.0", "stage": "approved"}
}' > /dev/null

echo "   📄 Adding performance testing summary..."
api_post "/api/concept2cure/projects/$P2_ID/artifacts" '{
  "type": "markdown",
  "category": "document",
  "title": "Performance Testing Summary (eSTAR Section 11)",
  "content": "# Performance Testing Summary\n## eSTAR Section 11 — IN PROGRESS\n\n### 11.1 Bench Testing\n| Test | Standard | Status | Result |\n|------|----------|--------|--------|\n| Electrical Safety | IEC 60601-1 Ed. 3.2 | ✅ Complete | PASS |\n| EMC Testing | IEC 60601-1-2 | ✅ Complete | PASS |\n| Biocompatibility | ISO 10993-5, -10 | ✅ Complete | PASS |\n| Battery Safety | IEC 62133 | ✅ Complete | PASS |\n| Software Verification | IEC 62304 | ✅ Complete | PASS |\n| Cybersecurity | FDA Premarket Guidance | 🔄 In Progress | Pending |\n| Wireless Coexistence | ANSI C63.27 | 🔄 In Progress | Pending |\n\n### 11.2 Algorithm Validation\n| Arrhythmia | Sensitivity | Specificity | Dataset Size |\n|------------|-------------|-------------|-------------|\n| AFib | 97.2% | 98.8% | 12,450 segments |\n| AFL | 94.1% | 99.1% | 3,280 segments |\n| PVC | 96.8% | 97.9% | 8,920 segments |\n| VT | 98.5% | 99.5% | 1,840 segments |\n| SVT | 93.4% | 98.2% | 2,650 segments |\n\n### 11.3 Clinical Study Summary\nA prospective, multi-center study (n=312 patients) comparing CSM-300 to Holter monitoring showed equivalence in arrhythmia detection (primary endpoint met, p<0.001).\n\n⚠️ **Remaining items:**\n- Cybersecurity documentation per FDA premarket guidance (est. 2 weeks)\n- Wireless coexistence final report (est. 1 week)\n\n**Target completion: April 15, 2026**",
  "metadata": {"ctdSection": "11.0", "stage": "draft"}
}' > /dev/null

echo "   📄 Adding software documentation..."
api_post "/api/concept2cure/projects/$P2_ID/artifacts" '{
  "type": "markdown",
  "category": "document",
  "title": "Software Documentation (eSTAR Section 9)",
  "content": "# Software Documentation\n## eSTAR Section 9\n\n### 9.1 Software Level of Concern: MODERATE\n\n### 9.2 Software Description\n- **Development Environment**: Python 3.11, TensorFlow 2.15\n- **Deployment**: Containerized cloud inference (AWS EKS)\n- **On-device firmware**: C++ on ARM Cortex-M4\n- **Mobile App**: React Native (iOS/Android)\n\n### 9.3 Software Development Lifecycle\n- IEC 62304 Class B lifecycle followed\n- Git-based version control with automated CI/CD\n- Unit test coverage: 94.2%\n- Integration test coverage: 87.6%\n\n### 9.4 Risk Analysis (per ISO 14971)\n| Hazard | Severity | Probability | Risk Level | Mitigation |\n|--------|----------|-------------|------------|------------|\n| False negative (missed arrhythmia) | Serious | Remote | Medium | Alert escalation, physician review |\n| False positive | Minor | Occasional | Low | Confirmation prompt, snooze |\n| Data breach | Moderate | Remote | Medium | AES-256 encryption, SOC2 |\n| Battery failure during recording | Minor | Remote | Low | Low-battery alerts at 20%, 10% |\n\n### 9.5 Cybersecurity\n- SBOM (Software Bill of Materials) generated\n- Threat model per STRIDE methodology\n- Penetration testing by independent lab (pending final report)\n\n**Status: UNDER REVIEW — Awaiting cybersecurity pen test results**",
  "metadata": {"ctdSection": "9.0", "stage": "review"}
}' > /dev/null

# ============================================================================
# PROJECT 3: NDA — LATE STAGE (Near submission-ready)
# ============================================================================
echo ""
echo "📋 Creating Project 3: NDA — Zeltraxin (Late Stage, Near Submission)..."

P3_RESP=$(api_post "/api/concept2cure/projects" '{
  "name": "Zeltraxin (ZTX-108) — NDA Submission",
  "submissionType": "NDA",
  "description": "New Drug Application for Zeltraxin, a first-in-class STING agonist for treatment of advanced non-small cell lung cancer (NSCLC). Pivotal Phase 3 ILLUMINATE trial completed with statistically significant OS benefit.",
  "sponsor": "Concept2Cure Oncology",
  "product": "Zeltraxin (ZTX-108)",
  "region": "US FDA",
  "targetSubmissionDate": "2026-04-15T00:00:00.000Z"
}')
P3_ID=$(echo "$P3_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "   ✅ Project created: $P3_ID"

echo "   📄 Adding clinical study report..."
api_post "/api/concept2cure/projects/$P3_ID/artifacts" '{
  "type": "markdown",
  "category": "document",
  "title": "Clinical Study Report — ILLUMINATE Phase 3 (Module 2.7.3)",
  "content": "# Clinical Study Report: ILLUMINATE\n## Protocol ZTX-108-301\n## Module 2.7.3 — Summary of Clinical Efficacy\n\n### Study Design\nRandomized, double-blind, placebo-controlled, multicenter Phase 3 trial evaluating Zeltraxin + pembrolizumab vs placebo + pembrolizumab in PD-L1 high (TPS ≥50%) advanced NSCLC.\n\n### Key Results\n| Endpoint | ZTX-108 + Pembro | Placebo + Pembro | HR (95% CI) | p-value |\n|----------|------------------|-------------------|-------------|----------|\n| Median OS | 24.8 months | 17.1 months | 0.68 (0.56-0.82) | <0.001 |\n| Median PFS | 11.2 months | 7.4 months | 0.62 (0.51-0.75) | <0.001 |\n| ORR | 52.3% | 34.1% | — | <0.001 |\n| DCR | 78.6% | 61.2% | — | <0.001 |\n| Duration of Response | 14.7 months | 9.8 months | — | 0.003 |\n\n### Participants\n- **Enrolled**: 642 patients across 78 sites (US, EU, Japan)\n- **Demographics**: Median age 63y, 58% male, 72% adenocarcinoma\n- **PD-L1**: TPS ≥50% (inclusion criterion)\n\n### Safety Summary\n- Treatment-related AEs (Grade ≥3): 38.2% vs 29.4%\n- Immune-related AEs: 24.5% vs 18.2%\n- Treatment discontinuation due to AEs: 12.1% vs 8.3%\n- No new safety signals beyond known class effects\n\n### Conclusion\nZeltraxin in combination with pembrolizumab demonstrated a statistically significant and clinically meaningful improvement in overall survival compared to pembrolizumab alone in patients with PD-L1 high advanced NSCLC.\n\n**Status: APPROVED — Final signed report**",
  "metadata": {"ctdSection": "2.7.3", "stage": "approved"}
}' > /dev/null

echo "   📄 Adding CMC Module 3 summary..."
api_post "/api/concept2cure/projects/$P3_ID/artifacts" '{
  "type": "markdown",
  "category": "document",
  "title": "Quality Overall Summary (Module 2.3)",
  "content": "# Quality Overall Summary — Zeltraxin (ZTX-108)\n## Module 2.3 — FINAL\n\n### Drug Substance (2.3.S)\n- **Manufacturer**: Lonza Biologics, Basel, Switzerland\n- **Process**: 6-step synthesis from commercially available starting materials\n- **Specifications**: 99.5% purity (HPLC), 12 specified impurities all <0.15%\n- **Stability**: 36 months at 25°C/60% RH, 6 months at 40°C/75% RH\n\n### Drug Product (2.3.P)\n- **Dosage Form**: Lyophilized powder for injection, 100 mg/vial\n- **Reconstitution**: 5 mL Sterile Water for Injection → 20 mg/mL\n- **Excipients**: Mannitol, L-histidine, polysorbate 80\n- **Manufacturing Site**: Catalent Pharma Solutions, Bloomington, IN\n- **Batch Size**: 5,000 vials (commercial scale validated)\n- **Stability**: 24 months at 2-8°C\n\n### Process Validation\n- 3 consecutive commercial-scale batches manufactured\n- All critical quality attributes (CQAs) within specification\n- Process capability index (Cpk) > 1.33 for all CQAs\n\n**Status: APPROVED — QA signed off**",
  "metadata": {"ctdSection": "2.3", "stage": "approved"}
}' > /dev/null

echo "   📄 Adding nonclinical overview..."
api_post "/api/concept2cure/projects/$P3_ID/artifacts" '{
  "type": "markdown",
  "category": "document",
  "title": "Nonclinical Overview (Module 2.4)",
  "content": "# Nonclinical Overview — Zeltraxin (ZTX-108)\n## Module 2.4 — FINAL\n\n### Pharmacology\n- **Primary Pharmacodynamics**: ZTX-108 selectively activates the STING pathway (EC50 = 12 nM). Demonstrated dose-dependent IFN-β induction in human PBMCs and tumor microenvironment remodeling in syngeneic models.\n- **Safety Pharmacology**: No significant effects on hERG (IC50 >30 μM), respiratory function, or CNS in GLP studies.\n- **Pharmacokinetics**: Dose-proportional PK in cynomolgus monkey. T½ = 8.2h (IV), Vd = 0.15 L/kg.\n\n### Toxicology\n| Study | Species | Duration | NOAEL | Key Findings |\n|-------|---------|----------|-------|---------------|\n| Repeat-dose | Rat | 26 weeks | 30 mg/kg | Injection site reactions, reversible ↑ALT |\n| Repeat-dose | Monkey | 39 weeks | 20 mg/kg | Cytokine release (dose-limiting), reversible |\n| Carcinogenicity | Rat | 2 years | 30 mg/kg | No carcinogenic potential |\n| Reproductive | Rat/Rabbit | Seg I-III | 15 mg/kg | ↓Fetal weight at 30 mg/kg (teratogenicity neg.) |\n| Genotoxicity | In vitro/in vivo | — | — | Negative (Ames, MN, Comet) |\n\n### Human Dose Justification\nRecommended Phase 3 dose (200 mg IV Q3W) provides ~8x safety margin to monkey NOAEL based on AUC.\n\n**Status: APPROVED — Signed**",
  "metadata": {"ctdSection": "2.4", "stage": "approved"}
}' > /dev/null

echo "   📄 Adding clinical overview..."
api_post "/api/concept2cure/projects/$P3_ID/artifacts" '{
  "type": "markdown",
  "category": "document",
  "title": "Clinical Overview (Module 2.5)",
  "content": "# Clinical Overview — Zeltraxin (ZTX-108)\n## Module 2.5 — FINAL\n\n### Clinical Development Program\n| Study | Phase | N | Design | Status |\n|-------|-------|---|--------|--------|\n| ZTX-108-101 | Phase 1 | 48 | Dose escalation, open-label | Completed |\n| ZTX-108-102 | Phase 1b | 82 | Combination with pembrolizumab | Completed |\n| ZTX-108-201 | Phase 2 | 186 | Randomized, Simon 2-stage | Completed |\n| ZTX-108-301 (ILLUMINATE) | Phase 3 | 642 | Randomized, double-blind, placebo-controlled | Completed |\n| ZTX-108-302 | Phase 3 | 420 | Open-label extension (ongoing) | Enrolling |\n\n### Benefit-Risk Assessment\n**Benefits:**\n- 7.7-month improvement in median OS (HR 0.68, p<0.001)\n- 3.8-month improvement in median PFS (HR 0.62, p<0.001)\n- Consistent effect across pre-specified subgroups\n- Durable responses (median DOR 14.7 months)\n\n**Risks:**\n- Incremental immune-related AE rate (+6.3%)\n- Injection site reactions (Grade 1-2 in 18%)\n- Cytokine release syndrome (Grade ≥3 in 2.8%, manageable with protocol)\n\n**Conclusion:** The benefit-risk profile of Zeltraxin + pembrolizumab is favorable for patients with PD-L1 high advanced NSCLC, representing a meaningful advance in first-line treatment.\n\n**Status: APPROVED — Signed**",
  "metadata": {"ctdSection": "2.5", "stage": "approved"}
}' > /dev/null

echo "   📄 Adding regulatory strategy document..."
api_post "/api/concept2cure/projects/$P3_ID/artifacts" '{
  "type": "markdown",
  "category": "document",
  "title": "Regulatory Strategy & Submission Plan",
  "content": "# Regulatory Submission Strategy — Zeltraxin NDA\n\n## Submission Timeline\n| Milestone | Target Date | Status |\n|-----------|-------------|--------|\n| Pre-NDA Meeting (Type A) | Jan 15, 2026 | ✅ Complete — FDA aligned |\n| Module 3 (CMC) final | Feb 28, 2026 | ✅ Complete |\n| Module 2.7 (Clinical Summary) | Mar 15, 2026 | ✅ Complete |\n| Module 5 (Clinical Study Reports) | Mar 20, 2026 | ✅ Complete |\n| eCTD technical validation | Apr 1, 2026 | 🔄 In Progress |\n| NDA gate review | Apr 8, 2026 | ⏳ Scheduled |\n| **NDA Submission** | **Apr 15, 2026** | ⏳ On track |\n| PDUFA date (est.) | Oct 15, 2026 | — |\n\n## Regulatory Designations\n- ✅ Fast Track Designation (granted Aug 2024)\n- ✅ Breakthrough Therapy Designation (granted Nov 2024)\n- ✅ Priority Review expected based on BT designation\n- ⏳ Orphan Drug exclusivity — under evaluation for rare NSCLC subtypes\n\n## Post-Marketing Commitments (Anticipated)\n1. Open-label extension study (ZTX-108-302) — ongoing\n2. Real-world evidence study in community oncology settings\n3. Pediatric study plan (PSP) per PREA — to be submitted within 120 days\n\n## Risk Mitigation\n- Advisory Committee meeting: FDA indicated advisory committee is unlikely given BT data strength\n- REMS: Not anticipated based on safety profile\n- Risk Evaluation: Cytokine release management protocol included in labeling\n\n**Status: APPROVED — Executive sign-off received**",
  "metadata": {"ctdSection": "1.2", "stage": "approved"}
}' > /dev/null

# ============================================================================
# PROJECT 4: BLA — Biosimilar (In Progress)
# ============================================================================
echo ""
echo "📋 Creating Project 4: BLA — Adalimumab Biosimilar (Medium Stage)..."

P4_RESP=$(api_post "/api/concept2cure/projects" '{
  "name": "C2C-ADA-BS — Adalimumab Biosimilar BLA",
  "submissionType": "BLA",
  "description": "Biologics License Application for C2C-ADA-BS, a proposed biosimilar to Humira (adalimumab). Analytical similarity, PK bioequivalence, and confirmatory clinical study completed.",
  "sponsor": "Concept2Cure Biosimilars",
  "product": "C2C-ADA-BS (Adalimumab Biosimilar)",
  "region": "US FDA",
  "targetSubmissionDate": "2026-08-01T00:00:00.000Z"
}')
P4_ID=$(echo "$P4_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "   ✅ Project created: $P4_ID"

echo "   📄 Adding analytical similarity report..."
api_post "/api/concept2cure/projects/$P4_ID/artifacts" '{
  "type": "markdown",
  "category": "document",
  "title": "Analytical Similarity Assessment",
  "content": "# Analytical Similarity Assessment — C2C-ADA-BS vs. Humira®\n\n## Executive Summary\nComprehensive analytical characterization demonstrates that C2C-ADA-BS is highly similar to US-licensed Humira® (adalimumab) with no clinically meaningful differences.\n\n## Structural Characterization\n| Attribute | C2C-ADA-BS | Humira® (n=30 lots) | Assessment |\n|-----------|------------|---------------------|------------|\n| Primary Sequence | Identical | Reference | ✅ Match |\n| Molecular Weight (intact) | 148,256 Da | 148,242-148,271 Da | ✅ Within range |\n| Glycosylation (G0F) | 52.3% | 48-58% | ✅ Similar |\n| Charge variants (main) | 61.2% | 57-66% | ✅ Similar |\n| SEC monomer | 99.4% | 99.0-99.7% | ✅ Similar |\n| Binding affinity (TNF-α) | KD = 89 pM | KD = 78-102 pM | ✅ Similar |\n| ADCC activity | 98% relative | 90-110% | ✅ Similar |\n| CDC activity | Not detected | Not detected | ✅ Consistent |\n\n## Conclusion\nAnalytical fingerprinting across 47 quality attributes demonstrates high similarity. No residual uncertainty requiring clinical mitigation.\n\n**Status: COMPLETE — Peer reviewed**",
  "metadata": {"ctdSection": "3.2.R", "stage": "approved"}
}' > /dev/null

echo "   📄 Adding PK bioequivalence study..."
api_post "/api/concept2cure/projects/$P4_ID/artifacts" '{
  "type": "markdown",
  "category": "document",
  "title": "PK Bioequivalence Study Report",
  "content": "# Pharmacokinetic Bioequivalence Study\n## Protocol C2C-ADA-PK-001\n\n### Study Design\nRandomized, double-blind, 3-arm, parallel-group, single-dose PK study in healthy volunteers.\n\n### Arms\n- Arm A: C2C-ADA-BS 40 mg SC (n=126)\n- Arm B: US-Humira® 40 mg SC (n=126)\n- Arm C: EU-Humira® 40 mg SC (n=126)\n\n### Results\n| PK Parameter | C2C-ADA-BS / US-Humira® Ratio (90% CI) | Bioequivalence Criteria |\n|--------------|----------------------------------------|------------------------|\n| AUC₀₋∞ | 1.02 (0.94 - 1.10) | 0.80 - 1.25 ✅ |\n| AUC₀₋ₜ | 1.01 (0.93 - 1.09) | 0.80 - 1.25 ✅ |\n| Cmax | 0.98 (0.89 - 1.08) | 0.80 - 1.25 ✅ |\n| Tmax (median) | 120h vs 132h | — (descriptive) |\n\n### Immunogenicity\n- ADA incidence: 48.4% (C2C-ADA-BS) vs 46.0% (US-Humira®) — comparable\n- NAb incidence: 12.7% vs 11.1% — comparable\n\n### Conclusion\nPK bioequivalence demonstrated for all primary endpoints. No clinically meaningful differences in immunogenicity.\n\n**Status: COMPLETE — QA Approved**",
  "metadata": {"ctdSection": "2.7.1", "stage": "approved"}
}' > /dev/null

# ============================================================================
# PROJECT 5: MAA — European Submission  (Planning)
# ============================================================================
echo ""
echo "📋 Creating Project 5: MAA — Venorapib (EU Submission, Planning Stage)..."

P5_RESP=$(api_post "/api/concept2cure/projects" '{
  "name": "Venorapib (VRB-330) — MAA Submission (EMA)",
  "submissionType": "MAA",
  "description": "Marketing Authorisation Application to EMA for Venorapib, a selective VEGFR-2/PDGFR-β dual inhibitor for first-line treatment of advanced renal cell carcinoma (RCC). Centralized procedure planned.",
  "sponsor": "Concept2Cure EU Operations",
  "product": "Venorapib (VRB-330)",
  "region": "EU EMA",
  "targetSubmissionDate": "2026-12-01T00:00:00.000Z"
}')
P5_ID=$(echo "$P5_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "   ✅ Project created: $P5_ID"

echo "   📄 Adding EMA regulatory strategy..."
api_post "/api/concept2cure/projects/$P5_ID/artifacts" '{
  "type": "markdown",
  "category": "document",
  "title": "EMA MAA Strategy & Scientific Advice",
  "content": "# MAA Regulatory Strategy — Venorapib (VRB-330)\n\n## Regulatory Pathway\n- **Procedure**: Centralized (mandatory — new active substance, oncology)\n- **Rapporteur**: To be assigned (preferred: Netherlands or Sweden)\n- **Legal basis**: Article 8(3) — full application\n\n## EMA Scientific Advice\n| Meeting | Date | Key Outcomes |\n|---------|------|-------------|\n| Pre-submission | Sep 2025 | Agreed on pivotal trial design |\n| Scientific Advice | Dec 2025 | CMC: agreed ICH Q12 approach. Clinical: confirmed OS as primary endpoint |\n| Pre-submission (MAA) | Planned Q3 2026 | Format, eCTD structure, paediatric |\n\n## Paediatric Investigation Plan (PIP)\n- **Status**: PIP application submitted to PDCO (Jan 2026)\n- **Requested waiver**: Children <12 years (RCC extremely rare in paediatrics)\n- **Deferral requested**: Adolescent study (12-17y) deferred post-approval\n\n## Key EU-Specific Requirements\n1. Risk Management Plan (EU-RMP) — Module V\n2. Environmental Risk Assessment (ERA) — PEC/PNEC calculation\n3. QP/QRD review of SmPC/PL — aligned with QRD template v10.3\n4. Braille requirement for outer packaging\n\n## Timeline\n| Phase | Target | Status |\n|-------|--------|--------|\n| eCTD Module 1 (EU admin) | Aug 2026 | Not started |\n| Module 2-5 compilation | Oct 2026 | Not started |\n| MAA validation submission | Dec 2026 | On track |\n| Day 120 (CHMP assessment) | May 2027 | — |\n| Opinion | Aug 2027 | — |\n\n**Status: PLANNING — Scientific Advice received**",
  "metadata": {"ctdSection": "1.2", "stage": "draft"}
}' > /dev/null

# ============================================================================
# PROJECT 6: De Novo — Novel AI Diagnostic (Early-Mid Stage)
# ============================================================================
echo ""
echo "📋 Creating Project 6: De Novo — RetinAI Diagnostic (Novel AI Device)..."

P6_RESP=$(api_post "/api/concept2cure/projects" '{
  "name": "RetinAI DX-1 — De Novo Classification Request",
  "submissionType": "DE_NOVO",
  "description": "De Novo classification request for RetinAI DX-1, an AI-based autonomous diabetic retinopathy screening system for use in primary care settings without an ophthalmologist. No predicate device exists.",
  "sponsor": "Concept2Cure Digital Health",
  "product": "RetinAI DX-1",
  "region": "US FDA",
  "targetSubmissionDate": "2026-07-15T00:00:00.000Z"
}')
P6_ID=$(echo "$P6_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "   ✅ Project created: $P6_ID"

echo "   📄 Adding De Novo risk assessment..."
api_post "/api/concept2cure/projects/$P6_ID/artifacts" '{
  "type": "markdown",
  "category": "document",
  "title": "De Novo Risk-Benefit Analysis & Classification Rationale",
  "content": "# De Novo Classification Request — RetinAI DX-1\n\n## Proposed Classification\n- **Device Type**: AI-Based Autonomous Retinal Imaging Analysis Software\n- **Proposed Class**: Class II with Special Controls\n- **Proposed Product Code**: QMT (proposed new)\n- **Regulation Number**: 21 CFR 886.xxxx (proposed)\n\n## Risk Assessment (per FDA De Novo guidance)\n\n### Identified Risks\n| Risk | Severity | Probability | Level | Mitigation |\n|------|----------|-------------|-------|------------|\n| False negative (missed DR) | Major | Occasional | High | Multi-image capture, quality check, physician referral pathway |\n| False positive (unnecessary referral) | Minor | Probable | Medium | Specificity threshold >87%, follow-up protocol |\n| Image quality failure | Minor | Occasional | Low | Automated quality assessment, re-capture prompt |\n| Algorithm bias (underserved populations) | Moderate | Remote | Medium | Diverse training dataset (40% underrepresented groups) |\n| Cybersecurity breach | Moderate | Remote | Medium | HIPAA encryption, no local PHI storage |\n\n### Proposed Special Controls\n1. Clinical performance testing with pre-specified sensitivity/specificity thresholds\n2. Labeling indicating the device is for screening only, not diagnosis\n3. Annual algorithm monitoring and performance reporting\n4. Software validation per IEC 62304\n5. Cybersecurity per FDA premarket guidance\n\n### Clinical Evidence\n- **Pivotal Study**: Multi-center (n=1,247 patients, 12 sites)\n- **Sensitivity (referable DR)**: 91.7% (95% CI: 89.1–93.8%)\n- **Specificity**: 93.4% (95% CI: 91.3–95.1%)\n- **Primary care operator agreement**: 98.2% usability score\n\n## Risk-Benefit Conclusion\nGeneral controls alone are insufficient. However, with the proposed special controls, the probable benefits outweigh the probable risks, supporting Class II classification.\n\n**Status: IN REVIEW — Internal regulatory committee**",
  "metadata": {"ctdSection": "De Novo", "stage": "review"}
}' > /dev/null

echo ""
echo "=========================================="
echo "  ✅ Demo Data Seeding Complete!"
echo "=========================================="
echo ""
echo "Projects created:"
echo "  1. $P1_ID — IND (Novacetrol) — Early Stage, 3 artifacts"
echo "  2. $P2_ID — 510(k) (CardioSync) — Mid Stage, 4 artifacts"
echo "  3. $P3_ID — NDA (Zeltraxin) — Late Stage, 5 artifacts"
echo "  4. $P4_ID — BLA (Adalimumab Biosimilar) — Medium Stage, 2 artifacts"
echo "  5. $P5_ID — MAA (Venorapib/EMA) — Planning, 1 artifact"
echo "  6. $P6_ID — De Novo (RetinAI) — Early-Mid, 1 artifact"
echo ""
echo "Demo walkthrough suggestions:"
echo "  • IND workflow:    Show drafting lifecycle, CMC gaps"
echo "  • 510(k) workflow: Show predicate comparison, testing matrix, software docs"
echo "  • NDA workflow:    Show near-complete submission with clinical data"
echo "  • BLA workflow:    Show biosimilar analytical similarity"
echo "  • MAA workflow:    Show EU-specific regulatory strategy"
echo "  • De Novo:         Show novel device risk assessment"
echo ""
echo "Login: $EMAIL / $PASSWORD"

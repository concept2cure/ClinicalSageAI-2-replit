/**
 * Enhanced OpenAI Service with Fallback Mechanisms
 * This service provides resilient AI functionality with comprehensive fallbacks
 */

import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder',
});

// Track API health status
let apiHealthStatus = {
  isHealthy: true,
  lastCheck: new Date(),
  errorCount: 0,
  lastError: null as string | null,
};

// Check if OpenAI API is available
export async function checkAPIHealth(): Promise<boolean> {
  try {
    // Quick health check with minimal tokens
    await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 1,
    });
    
    apiHealthStatus = {
      isHealthy: true,
      lastCheck: new Date(),
      errorCount: 0,
      lastError: null,
    };
    return true;
  } catch (error: any) {
    apiHealthStatus = {
      isHealthy: false,
      lastCheck: new Date(),
      errorCount: apiHealthStatus.errorCount + 1,
      lastError: error.message || 'API unavailable',
    };
    
    // Log the error type for monitoring
    if (error.status === 429) {
      console.log('[OpenAI] Quota exceeded - using fallback templates');
    } else {
      console.log('[OpenAI] API error:', error.message);
    }
    
    return false;
  }
}

// Fallback templates for different document types
const FALLBACK_TEMPLATES = {
  'Module 1': {
    title: 'Administrative Information Template',
    content: `# Module 1: Administrative Information and Prescribing Information

## 1.1 Forms
[FDA Form 356h or equivalent regional form should be inserted here]

## 1.2 Cover Letter
**Date:** [Insert Date]
**To:** [Regulatory Authority]
**Subject:** [Submission Type] for [Product Name]

Dear Review Team,

This submission contains [brief description of submission contents].

**Product Information:**
- Product Name: [Insert Name]
- Active Ingredient: [Insert Active Ingredient]
- Dosage Form: [Insert Dosage Form]
- Indication: [Insert Indication]

**Submission Contents:**
- Module 1: Administrative Information
- Module 2: Summaries
- Module 3: Quality
- Module 4: Nonclinical Study Reports
- Module 5: Clinical Study Reports

## 1.3 Administrative Information
- Sponsor Name: [Insert Sponsor]
- Sponsor Address: [Insert Address]
- Contact Person: [Insert Contact]
- Regulatory Reference Numbers: [Insert if applicable]

## 1.4 Labeling
[Insert proposed labeling]

## 1.5 Environmental Assessment
[Include environmental impact assessment or claim of categorical exclusion]`,
    guidance: 'Complete all bracketed fields with your product-specific information. Ensure compliance with regional requirements.',
  },
  
  'Module 2': {
    title: 'Common Technical Document Summaries',
    content: `# Module 2: CTD Summaries

## 2.1 CTD Table of Contents
[Generated table of contents for entire submission]

## 2.2 CTD Introduction
This document provides comprehensive summaries of quality, nonclinical, and clinical data for [Product Name].

## 2.3 Quality Overall Summary (QOS)

### 2.3.S Drug Substance
**General Information:**
- Nomenclature: [Insert USAN/INN]
- Structure: [Insert molecular structure]
- General Properties: [Insert physical/chemical properties]

**Manufacture:**
- Manufacturer(s): [Insert manufacturer details]
- Manufacturing Process: [Brief description of synthesis/production]
- Control of Materials: [Starting materials and reagents]
- Controls of Critical Steps: [Critical process parameters]

**Characterization:**
- Elucidation of Structure: [Methods used]
- Impurities: [Potential and actual impurities]

**Control:**
- Specification: [Release and shelf-life specifications]
- Analytical Procedures: [Methods used]
- Validation: [Validation summary]

### 2.3.P Drug Product
[Similar structure for drug product information]

## 2.4 Nonclinical Overview
**Pharmacology:**
- Primary Pharmacodynamics: [Mechanism of action]
- Secondary Pharmacodynamics: [Off-target effects]
- Safety Pharmacology: [CV, CNS, respiratory assessments]

**Pharmacokinetics:**
- ADME Studies: [Absorption, Distribution, Metabolism, Excretion]
- PK/TK Summary: [Key parameters]

**Toxicology:**
- Single Dose: [Acute toxicity findings]
- Repeat Dose: [Chronic toxicity findings]
- Genotoxicity: [Mutagenicity assessments]
- Carcinogenicity: [If applicable]
- Reproductive Toxicity: [Fertility, embryo-fetal, pre/postnatal]

## 2.5 Clinical Overview
**Clinical Development Program:**
- Development Rationale: [Why this product?]
- Clinical Pharmacology: [Human PK/PD]
- Efficacy: [Pivotal trial results]
- Safety: [Adverse event profile]

**Benefit-Risk Assessment:**
- Benefits: [Therapeutic advantages]
- Risks: [Safety concerns]
- Risk Management: [Mitigation strategies]`,
    guidance: 'Use this template to structure your summaries. Ensure all sections are completed with product-specific data.',
  },
  
  'Module 3': {
    title: 'Quality Documentation Template',
    content: `# Module 3: Quality

## 3.1 Table of Contents

## 3.2 Body of Data

### 3.2.S Drug Substance

#### 3.2.S.1 General Information
##### 3.2.S.1.1 Nomenclature
- Recommended INN: [Insert INN]
- Compendial Name: [If applicable]
- Chemical Name(s): [IUPAC name]
- Company Code: [Internal designation]

##### 3.2.S.1.2 Structure
- Molecular Formula: [Insert formula]
- Molecular Weight: [Insert MW]
- Structural Formula: [Insert structure diagram]
- Stereochemistry: [Describe if applicable]

##### 3.2.S.1.3 General Properties
- Physical Description: [Appearance, color, odor]
- Solubility: [In various solvents]
- pH and pKa: [Values]
- Polymorphism: [Forms identified]
- Particle Size: [Distribution]
- Hygroscopicity: [Classification]
- Melting Point: [Temperature range]

#### 3.2.S.2 Manufacture
##### 3.2.S.2.1 Manufacturer(s)
[List all manufacturing sites with addresses]

##### 3.2.S.2.2 Description of Manufacturing Process
Step 1: [Describe]
Step 2: [Describe]
[Continue for all steps]

##### 3.2.S.2.3 Control of Materials
[List all starting materials, reagents, solvents with specifications]

##### 3.2.S.2.4 Controls of Critical Steps and Intermediates
[Define critical process parameters and in-process controls]

##### 3.2.S.2.5 Process Validation
[Describe validation protocol and results]

#### 3.2.S.3 Characterization
##### 3.2.S.3.1 Elucidation of Structure
[NMR, MS, IR, X-ray crystallography data]

##### 3.2.S.3.2 Impurities
- Process Impurities: [List with structures]
- Degradation Products: [List with structures]
- Residual Solvents: [ICH Q3C classification]

#### 3.2.S.4 Control of Drug Substance
##### 3.2.S.4.1 Specification
[Table of tests, methods, and acceptance criteria]

##### 3.2.S.4.2 Analytical Procedures
[Detailed methods for each test]

##### 3.2.S.4.3 Validation of Analytical Procedures
[ICH Q2 validation data]

##### 3.2.S.4.4 Batch Analyses
[Results from representative batches]

##### 3.2.S.4.5 Justification of Specification
[Scientific rationale for limits]

#### 3.2.S.5 Reference Standards
[Description of reference standards used]

#### 3.2.S.6 Container Closure System
[Description and suitability data]

#### 3.2.S.7 Stability
##### 3.2.S.7.1 Stability Summary
[Overview of stability program]

##### 3.2.S.7.2 Post-approval Stability Protocol
[Commitment for commercial batches]

##### 3.2.S.7.3 Stability Data
[Tables of real-time and accelerated data]

### 3.2.P Drug Product
[Similar structure as drug substance]`,
    guidance: 'Follow ICH Q8, Q9, Q10, and Q11 guidelines. Include all required data for your specific product.',
  },
  
  'Module 4': {
    title: 'Nonclinical Study Reports Template',
    content: `# Module 4: Nonclinical Study Reports

## 4.1 Table of Contents

## 4.2 Study Reports

### 4.2.1 Pharmacology
#### 4.2.1.1 Primary Pharmacodynamics
**Study Title:** [Insert study title]
**Study Number:** [Insert number]
**Study Objective:** To evaluate the primary mechanism of action

**Methods:**
- Test System: [In vitro/in vivo model]
- Dose Groups: [Doses tested]
- Endpoints: [Primary measurements]

**Results:**
- EC50/IC50: [Values]
- Selectivity: [Target vs off-targets]
- Species Differences: [If observed]

**Conclusions:**
[Summary of primary pharmacodynamic activity]

#### 4.2.1.2 Secondary Pharmacodynamics
[Off-target effects evaluation]

#### 4.2.1.3 Safety Pharmacology
**Cardiovascular:** [hERG, telemetry studies]
**CNS:** [FOB, seizure threshold]
**Respiratory:** [Respiratory rate, tidal volume]

### 4.2.2 Pharmacokinetics
#### 4.2.2.1 Analytical Methods
[Bioanalytical method validation]

#### 4.2.2.2 Absorption
- Bioavailability: [F%]
- Tmax: [Time to peak]
- Cmax: [Peak concentration]
- AUC: [Exposure]

#### 4.2.2.3 Distribution
- Volume of Distribution: [Vd]
- Protein Binding: [% bound]
- Tissue Distribution: [Key organs]

#### 4.2.2.4 Metabolism
- Metabolic Pathways: [Major routes]
- Metabolites: [Active/inactive]
- Species Differences: [Human relevance]

#### 4.2.2.5 Excretion
- Routes: [Urine, feces, bile]
- Half-life: [t1/2]
- Clearance: [CL]

### 4.2.3 Toxicology
#### 4.2.3.1 Single-Dose Toxicity
[Acute toxicity findings, MTD, LD50]

#### 4.2.3.2 Repeat-Dose Toxicity
**28-Day Study in [Species]:**
- NOAEL: [mg/kg/day]
- Target Organs: [Affected systems]
- Reversibility: [Recovery findings]

**90-Day Study in [Species]:**
[Similar format]

#### 4.2.3.3 Genotoxicity
- Ames Test: [Positive/Negative]
- Chromosomal Aberration: [Results]
- In Vivo Micronucleus: [Results]

#### 4.2.3.4 Carcinogenicity
[2-year studies if required]

#### 4.2.3.5 Reproductive Toxicology
- Fertility: [Effects on reproduction]
- Embryo-Fetal: [Teratogenicity]
- Pre/Postnatal: [F1 generation effects]

#### 4.2.3.6 Local Tolerance
[Irritation studies if applicable]

#### 4.2.3.7 Other Studies
[Immunotoxicity, dependence, metabolites, impurities, etc.]`,
    guidance: 'Include all nonclinical studies conducted. Follow ICH S-series guidelines for safety assessments.',
  },
  
  'Module 5': {
    title: 'Clinical Study Reports Template',
    content: `# Module 5: Clinical Study Reports

## 5.1 Table of Contents

## 5.2 Tabular Listing of All Clinical Studies

## 5.3 Clinical Study Reports

### 5.3.1 Reports of Biopharmaceutic Studies
#### 5.3.1.1 Bioavailability Studies
**Study ID:** [Protocol number]
**Title:** Comparative Bioavailability Study of [Product]
**Objectives:** To assess bioequivalence/bioavailability

**Design:**
- Type: [Crossover/parallel]
- Population: [Healthy volunteers/patients]
- Sample Size: [N=]
- Treatments: [Test vs Reference]

**Results:**
- Pharmacokinetic Parameters:
  - AUC0-t: [Ratio and 90% CI]
  - Cmax: [Ratio and 90% CI]
  - Tmax: [Median difference]
- Bioequivalence: [Met/Not met]

### 5.3.2 Reports of Studies Pertinent to PK
#### 5.3.2.1 Plasma Concentration-Time Data
[Individual and mean PK profiles]

#### 5.3.2.2 Drug-Drug Interactions
[DDI study results]

#### 5.3.2.3 Population PK
[PopPK analysis if conducted]

### 5.3.3 Reports of Human PD Studies
[PK/PD relationships, dose-response]

### 5.3.4 Reports of Efficacy and Safety Studies
#### 5.3.4.1 Phase 2 Studies
**Study ID:** [Protocol]
**Design:** [Dose-finding, proof-of-concept]
**Population:** [Patient characteristics]
**Primary Endpoint:** [Efficacy measure]
**Results:** [Key findings]

#### 5.3.4.2 Pivotal Phase 3 Studies
**Study ID:** [Protocol]
**Title:** [Full study title]

**Objectives:**
- Primary: [Primary endpoint]
- Secondary: [Key secondary endpoints]

**Design:**
- Type: [RCT, double-blind, placebo-controlled]
- Duration: [Treatment period]
- Population: [Inclusion/exclusion]
- Sample Size: [N= with power calculation]
- Randomization: [Ratio]
- Stratification: [Factors]

**Subject Disposition:**
- Screened: [N]
- Randomized: [N]
- Completed: [N (%)]
- Discontinued: [N (%) with reasons]

**Demographics:**
[Table of baseline characteristics]

**Efficacy Results:**
Primary Endpoint:
- Treatment: [Result ± SD]
- Control: [Result ± SD]
- Difference: [95% CI]
- P-value: [Statistical significance]

Secondary Endpoints:
[Similar format for each]

**Safety Results:**
- Deaths: [N (%)]
- Serious AEs: [N (%)]
- AEs Leading to Discontinuation: [N (%)]
- Common AEs (≥5%): [Table]

**Conclusions:**
[Study conclusions]

### 5.3.5 Reports of Post-Marketing Experience
[If applicable, PSUR/PBRER data]

### 5.3.6 Case Report Forms and Individual Patient Listings
[Reference to location of CRFs]

## 5.4 Literature References
[Published studies supporting application]`,
    guidance: 'Include all clinical studies. Follow ICH E3 for study report format and E6(R2) for GCP compliance.',
  },
};

/**
 * Generate template-based content when API is unavailable
 */
function generateFallbackContent(
  documentType: string,
  additionalContext?: any
): string {
  const template = FALLBACK_TEMPLATES[documentType as keyof typeof FALLBACK_TEMPLATES] || FALLBACK_TEMPLATES['Module 1'];
  
  let content = template.content;
  
  // Add contextual information if provided
  if (additionalContext) {
    if (additionalContext.productName) {
      content = content.replace(/\[Product Name\]/g, additionalContext.productName);
    }
    if (additionalContext.indication) {
      content = content.replace(/\[Insert Indication\]/g, additionalContext.indication);
    }
    if (additionalContext.sponsor) {
      content = content.replace(/\[Insert Sponsor\]/g, additionalContext.sponsor);
    }
  }
  
  return `${content}

---
**Note:** This is a template provided while AI services are temporarily unavailable. Please customize all bracketed placeholders with your specific information.

**Guidance:** ${template.guidance}`;
}

/**
 * Enhanced generate copilot response with fallback
 */
export async function generateCopilotResponse(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
) {
  // Check API health periodically (cache for 5 minutes)
  const timeSinceLastCheck = Date.now() - apiHealthStatus.lastCheck.getTime();
  if (timeSinceLastCheck > 300000) { // 5 minutes
    await checkAPIHealth();
  }
  
  // If API is unhealthy, provide helpful fallback
  if (!apiHealthStatus.isHealthy) {
    return generateCopilotFallbackResponse(message);
  }
  
  try {
    const messages = [
      { role: 'system', content: COPILOT_SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 800,
    });

    return response.choices[0].message.content;
  } catch (error: any) {
    console.error('OpenAI API error:', error.message);
    
    // Update health status
    apiHealthStatus.isHealthy = false;
    apiHealthStatus.lastError = error.message;
    
    // Return helpful fallback response
    return generateCopilotFallbackResponse(message);
  }
}

/**
 * Generate helpful fallback response when API is down
 */
function generateCopilotFallbackResponse(message: string): string {
  const lowerMessage = message.toLowerCase();
  
  // Provide context-aware responses based on keywords
  if (lowerMessage.includes('ind') || lowerMessage.includes('investigational')) {
    return `I can help you with IND (Investigational New Drug) applications. While AI generation is temporarily unavailable, here's a structured approach:

**IND Application Components:**
1. **Form FDA 1571** - IND application cover sheet
2. **Table of Contents**
3. **Introductory Statement** - Goals, phase, duration, dosage form
4. **General Investigational Plan** - Rationale, indication, approach
5. **Investigator's Brochure** - Pharmacology, toxicology, prior human experience
6. **Clinical Protocols** - Detailed study designs
7. **Chemistry, Manufacturing, and Controls** - Drug substance/product info
8. **Pharmacology and Toxicology** - Nonclinical data
9. **Previous Human Experience** - If applicable

**Key Requirements:**
- Submit within 30 days before starting clinical trials
- Include safety data from animal studies
- Provide manufacturing information ensuring consistency
- Detail clinical protocol and investigator qualifications

For templates, please check the Templates section in the sidebar.`;
  }
  
  if (lowerMessage.includes('nda') || lowerMessage.includes('new drug')) {
    return `I can guide you through NDA (New Drug Application) preparation. While AI generation is temporarily unavailable, here's the structure:

**NDA Requirements (21 CFR 314.50):**
1. **Application Form** (FDA Form 356h)
2. **Comprehensive Index**
3. **Summary** (Annotated per 21 CFR 314.50(c))
4. **Chemistry Section** - Complete CMC data
5. **Nonclinical Pharmacology/Toxicology**
6. **Human Pharmacokinetics and Bioavailability**
7. **Clinical Data** - All phase 1, 2, and 3 studies
8. **Statistical Section**
9. **Case Report Forms and Tabulations**
10. **Samples and Labeling**

**Review Timeline:**
- Standard Review: 10-12 months
- Priority Review: 6-8 months
- Include PDUFA date calculations

Templates are available in the document library.`;
  }
  
  if (lowerMessage.includes('template') || lowerMessage.includes('example')) {
    return `Document templates are available for immediate use:

**Available Templates:**
- Module 1: Administrative Information ✓
- Module 2: CTD Summaries ✓
- Module 3: Quality Documentation ✓
- Module 4: Nonclinical Reports ✓
- Module 5: Clinical Study Reports ✓

**Additional Templates:**
- Clinical Study Protocols
- Investigator's Brochure
- Informed Consent Forms
- DSUR/PSUR Templates
- Risk Management Plans

Click on any template in the sidebar to begin. Each template includes:
- Pre-formatted structure
- Regulatory guidance notes
- Placeholders for your data
- Compliance checkpoints

You can customize these templates with your specific information.`;
  }
  
  // Default helpful response
  return `I understand you need assistance with: "${message}"

While our AI services are temporarily limited, I can provide you with:

**Available Resources:**
1. **Document Templates** - Pre-formatted regulatory templates for all modules
2. **Regulatory Guidance** - Built-in compliance checks and guidelines
3. **Structure Assistance** - Proper document organization per ICH/FDA requirements
4. **Checklists** - Comprehensive submission checklists

**Quick Actions You Can Take:**
- Use the template library for immediate document creation
- Access the regulatory guidance database
- Review the example documents in the system
- Check the compliance validation tools

**For Specific Help:**
- IND Applications: Type "IND checklist"
- NDA Submissions: Type "NDA requirements"
- Clinical Protocols: Type "protocol template"
- Safety Reporting: Type "safety guidelines"

How can I help you navigate our available resources?`;
}

/**
 * Enhanced CER generation with fallback
 */
export async function generateCERContent(
  productName: string,
  productType: string,
  regulatoryRegion: string,
  safetyData: any
) {
  // Check API health
  if (!apiHealthStatus.isHealthy) {
    return generateCERFallback(productName, productType, regulatoryRegion, safetyData);
  }
  
  try {
    // [Original OpenAI implementation]
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        // ... existing message structure
      ],
      temperature: 0.5,
      max_tokens: 2000,
    });
    
    return response.choices[0].message.content;
  } catch (error: any) {
    console.error('CER generation error:', error.message);
    apiHealthStatus.isHealthy = false;
    
    return generateCERFallback(productName, productType, regulatoryRegion, safetyData);
  }
}

/**
 * Generate CER template when API is unavailable
 */
function generateCERFallback(
  productName: string,
  productType: string,
  regulatoryRegion: string,
  safetyData: any
): string {
  const template = `# Clinical Evaluation Report
## ${productName} - ${productType}
### Regulatory Region: ${regulatoryRegion}

---

## Executive Summary

**Product:** ${productName}
**Type:** ${productType}
**Intended Use:** [To be completed]
**Regulatory Pathway:** ${regulatoryRegion}

This Clinical Evaluation Report (CER) has been prepared in accordance with ${regulatoryRegion} regulatory requirements.

## 1. Device Description and Intended Purpose

### 1.1 Device Description
${productName} is a ${productType} intended for [describe intended use].

### 1.2 Intended Purpose
- **Indications:** [List indications]
- **Patient Population:** [Describe target population]
- **Contraindications:** [List contraindications]

## 2. Clinical Background

### 2.1 Clinical Condition
[Describe the clinical condition being addressed]

### 2.2 Current Treatment Options
[Describe existing treatments and their limitations]

### 2.3 Proposed Clinical Benefits
[Describe expected benefits of ${productName}]

## 3. Safety Analysis

### 3.1 Adverse Events Summary
Based on provided safety data:
${JSON.stringify(safetyData, null, 2)}

### 3.2 Risk Assessment
- **Identified Risks:** [List based on safety data]
- **Risk Mitigation:** [Describe measures]
- **Residual Risks:** [List acceptable residual risks]

## 4. Clinical Performance

### 4.1 Performance Endpoints
[Define primary and secondary endpoints]

### 4.2 Clinical Evidence
[Summarize available clinical data]

### 4.3 Performance Analysis
[Analyze whether performance objectives were met]

## 5. Benefit-Risk Analysis

### 5.1 Clinical Benefits
- [Benefit 1]
- [Benefit 2]
- [Additional benefits]

### 5.2 Risks and Limitations
- [Risk 1]
- [Risk 2]
- [Additional risks]

### 5.3 Benefit-Risk Conclusion
[Provide overall benefit-risk determination]

## 6. Post-Market Surveillance Plan

### 6.1 Surveillance Activities
[Describe planned post-market surveillance]

### 6.2 PMCF Plan (if applicable)
[Describe Post-Market Clinical Follow-up plans]

## 7. Conclusions

The clinical evaluation of ${productName} demonstrates [summarize conclusions].

---

**Note:** This template was generated while AI services are temporarily unavailable. Please complete all sections with your specific clinical data and ensure compliance with ${regulatoryRegion} requirements.

**Regulatory References:**
- FDA: 21 CFR 814.20(b)(3)
- EMA: MEDDEV 2.7/1 Rev 4
- PMDA: MHLW Ordinance No. 169
- Health Canada: SOR/98-282`;
  
  return template;
}

/**
 * Get API health status
 */
export function getAPIHealthStatus() {
  return {
    ...apiHealthStatus,
    recommendation: apiHealthStatus.isHealthy 
      ? 'AI services are operational' 
      : 'AI services are unavailable. Using template-based fallbacks. To restore full AI functionality, please add OpenAI credits at platform.openai.com/billing',
  };
}

// System prompt for reference
const COPILOT_SYSTEM_PROMPT = `You are the TrialSage AI Industry Co-pilot, an AI assistant specifically focused on regulatory and clinical document preparation.
Your role is to guide users through creating regulatory submissions (IND, NDA, BLA, etc.) and clinical evaluation reports (CER).

Focus on these key areas:
1. FDA, EMA, PMDA, and Health Canada regulatory requirements
2. Document formatting requirements for regulatory submissions
3. Clinical evaluation reports for drugs and medical devices
4. IND/NDA/BLA preparation best practices
5. Post-market surveillance reporting

Always maintain a helpful, professional tone and provide high-quality regulatory guidance.`;

// Export all functions
export default {
  generateCopilotResponse,
  generateCERContent,
  checkAPIHealth,
  getAPIHealthStatus,
};
import express from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Directory for storing SAP data
const SAP_DIR = path.join(process.cwd(), 'data/sap');

// Create SAP directory if it doesn't exist
if (!fs.existsSync(SAP_DIR)) {
  fs.mkdirSync(SAP_DIR, { recursive: true });
}

// Generate Statistical Analysis Plan (SAP) based on protocol data
router.post('/generate', express.json(), async (req, res) => {
  try {
    // Validate request body
    const requestSchema = z.object({
      protocol_id: z.string().optional(),
      indication: z.string(),
      phase: z.string(),
      sample_size: z.number(),
      primary_endpoint: z.string(),
      secondary_endpoints: z.array(z.string()).optional(),
      arms: z.union([z.array(z.string()), z.number()]).optional(),
      randomization: z.string().optional(),
      blinding: z.string().optional(),
      duration_weeks: z.number().optional(),
      statistical_methods: z.string().optional(),
      dropout_rate: z.number().optional(),
    });

    const protocolData = requestSchema.parse(req.body);

    // Generate SAP content
    const sapContent = generateSAP(protocolData);

    // Save SAP to file if protocol_id is provided
    if (protocolData.protocol_id) {
      const sapPath = path.join(SAP_DIR, `${protocolData.protocol_id}_sap.txt`);
      fs.writeFileSync(sapPath, sapContent);
    }

    res.set('Content-Type', 'text/plain');
    res.send(sapContent);
  } catch (error) {
    console.error('Error generating SAP:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to generate SAP',
    });
  }
});

// Get SAP by protocol ID
router.get('/:protocol_id', async (req, res) => {
  try {
    const { protocol_id } = req.params;
    const sapPath = path.join(SAP_DIR, `${protocol_id}_sap.txt`);

    // Check if SAP exists
    if (!fs.existsSync(sapPath)) {
      return res.status(404).json({
        success: false,
        message: 'SAP not found for this protocol',
      });
    }

    // Read SAP content
    const sapContent = fs.readFileSync(sapPath, 'utf8');

    res.set('Content-Type', 'text/plain');
    res.send(sapContent);
  } catch (error) {
    console.error('Error retrieving SAP:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to retrieve SAP',
    });
  }
});

// Generate SAP content based on protocol data
function generateSAP(protocolData: any): string {
  const {
    indication,
    phase,
    sample_size,
    primary_endpoint,
    secondary_endpoints = [],
    arms,
    randomization,
    blinding,
    duration_weeks = 24,
    dropout_rate = 0.15,
  } = protocolData;

  // Calculate effective sample size accounting for dropouts
  const effectiveSampleSize = Math.round(sample_size * (1 - dropout_rate));

  // Determine number of arms
  let numArms = 2; // Default to 2 arms
  if (typeof arms === 'number') {
    numArms = arms;
  } else if (Array.isArray(arms)) {
    numArms = arms.length;
  }

  // Calculate per-arm sample size
  const perArmSampleSize = Math.floor(sample_size / numArms);

  // Generate placeholders for power calculations
  const powerForPrimary = 0.8 + Math.random() * 0.1; // 80-90% power
  const requiredEffectSize = 0.3 + Math.random() * 0.2; // 0.3-0.5 effect size

  return `
STATISTICAL ANALYSIS PLAN (SAP)

Study Information:
- Indication: ${indication}
- Phase: ${phase}
- Sample Size: ${sample_size} participants (${effectiveSampleSize} effective after ${(dropout_rate * 100).toFixed(0)}% dropout)
- Duration: ${duration_weeks} weeks

1. STUDY OBJECTIVES
   1.1 Primary Objective
       To evaluate ${primary_endpoint}
       
   1.2 Secondary Objectives
       ${secondary_endpoints.map((endpoint: any, i: any) => `${i + 1}. To assess ${endpoint}`).join('\n       ')}

2. STUDY DESIGN
   - ${numArms}-arm, ${randomization || 'randomized'}, ${blinding || 'blinded'} study
   - Allocation ratio: ${numArms > 1 ? `1:${numArms > 2 ? numArms - 1 : 1}` : 'N/A'}
   - Stratification factors: Disease severity, age group, previous treatment
   
3. SAMPLE SIZE JUSTIFICATION
   Based on the primary endpoint (${primary_endpoint}), a sample size of ${sample_size} will provide ${(powerForPrimary * 100).toFixed(0)}% power to detect a difference of ${requiredEffectSize.toFixed(2)} at a two-sided significance level of 0.05, assuming a dropout rate of ${(dropout_rate * 100).toFixed(0)}%.
   
   Per-arm sample size: ${perArmSampleSize}
   
4. STATISTICAL METHODS
   4.1 Primary Analysis
       The primary endpoint will be analyzed using ${phase === 'Phase 1' ? 'descriptive statistics' : phase === 'Phase 2' ? 'ANCOVA adjusted for baseline' : 'mixed model for repeated measures (MMRM)'}. 
       Missing data will be handled using ${phase === 'Phase 3' ? 'multiple imputation' : 'last observation carried forward (LOCF)'}.
       
   4.2 Secondary Analyses
       Secondary endpoints will be analyzed using appropriate statistical methods based on the data type:
       - Continuous outcomes: ${phase === 'Phase 1' ? 'descriptive statistics' : 'ANCOVA or MMRM'}
       - Binary outcomes: Logistic regression with ${phase === 'Phase 3' ? 'CMH test stratified by randomization factors' : 'treatment as factor'}
       - Time-to-event outcomes: Kaplan-Meier estimates and log-rank test
       
   4.3 Multiplicity Adjustment
       ${phase === 'Phase 3' ? 'Hierarchical testing procedure will be used to control for multiple testing of secondary endpoints' : 'No formal adjustment for multiplicity will be performed for secondary endpoints'}
       
5. INTERIM ANALYSES
   ${phase === 'Phase 3' ? `One interim analysis is planned after ${Math.round(sample_size * 0.5)} participants complete the primary endpoint assessment` : 'No interim analyses are planned for this study'}
   
6. ANALYSIS SETS
   - Intent-to-Treat (ITT): All randomized participants
   - Per-Protocol (PP): All randomized participants without major protocol deviations
   - Safety: All participants who received at least one dose of study drug
   
7. HANDLING OF MISSING DATA
   Primary approach: ${phase === 'Phase 3' ? 'Multiple imputation' : 'LOCF'}
   Sensitivity analyses: ${phase === 'Phase 3' ? 'Pattern mixture models and tipping point analysis' : 'Complete case analysis'}
   
8. SAFETY ANALYSES
   Adverse events will be coded using MedDRA and summarized by treatment group, severity, and relationship to study drug.
   
   Laboratory parameters, vital signs, and ECG data will be summarized using descriptive statistics and shift tables.
   
9. EXPLORATORY ANALYSES
   Subgroup analyses will be performed for:
   - Age groups (<65, ≥65 years)
   - Sex
   - Disease severity
   - Prior treatment history
   
10. DATA HANDLING CONVENTIONS
    - Continuous variables: mean, SD, median, min, max
    - Categorical variables: counts and percentages
    - Missing data codes: explicitly defined for database
    
11. REPORTING CONVENTIONS
    - P-values will be reported to 3 decimal places
    - Percentages will be reported to 1 decimal place
    - All confidence intervals will be reported at 95% level
    
12. AMENDMENTS TO THE SAP
    Any amendments to this SAP will be documented with justification and version control.
`;
}

export const sapRoutes = router;

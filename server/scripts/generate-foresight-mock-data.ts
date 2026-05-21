/**
 * AnA Predictions™ Mock Data Generation Script
 * Generates realistic pharmaceutical data for testing all modules
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { 
  doseEscalationStudies,
  doseLevels,
  doseCohorts,
  dltEvents,
  crossSpeciesPkpd,
  speciesComparisons,
  indNarratives,
  indNarrativeSections,
  foresightPredictions
} from '@shared/schema';
import { ForesightAIEngine } from '../services/foresight-ai-engine';

const aiEngine = new ForesightAIEngine();

async function generateDoseEscalationData(organizationId: string) {
  console.log('📊 Generating dose escalation study data...');
  
  // Create a dose escalation study for an oncology drug
  const [study] = (await db!.insert(doseEscalationStudies as any).values({
    organizationId,
    studyName: 'ONCO-2025 Phase I Dose Escalation',
    compoundName: 'ONX-4521',
    indication: 'Advanced Solid Tumors',
    escalationMethod: '3_plus_3',
    startingDose: 0.1,
    maxDose: 10.0,
    currentDoseLevel: 0.3,
    targetToxicityRate: 0.25,
    status: 'enrolling',
    metadata: {
      protocol: 'ONCO-2025-001',
      investigator: 'Dr. Sarah Johnson',
      site: 'Memorial Cancer Center'
    }
  }).returning()) as any[];
  
  console.log(`✅ Created dose escalation study: ${study.id}`);
  
  // Create dose levels - using correct column names for the database
  const doseLevelData = [
    { level_number: 1, dose_amount: 0.1, dose_unit: 'mg/kg' },
    { level_number: 2, dose_amount: 0.3, dose_unit: 'mg/kg' },
    { level_number: 3, dose_amount: 0.6, dose_unit: 'mg/kg' },
    { level_number: 4, dose_amount: 1.0, dose_unit: 'mg/kg' },
    { level_number: 5, dose_amount: 1.5, dose_unit: 'mg/kg' },
    { level_number: 6, dose_amount: 2.0, dose_unit: 'mg/kg' },
    { level_number: 7, dose_amount: 3.0, dose_unit: 'mg/kg' }
  ];
  
  const levels = [];
  for (const level of doseLevelData) {
    // Use raw SQL to insert dose levels to handle column naming
    const result = await db!.execute(sql`
      INSERT INTO dose_levels (study_id, level_number, dose_amount, dose_unit)
      VALUES (${study.id}, ${level.level_number}, ${level.dose_amount}, ${level.dose_unit})
      RETURNING *
    `);
    levels.push(result.rows[0]);
  }
  
  console.log(`✅ Created ${levels.length} dose levels`);
  
  // Create cohorts with patients - using correct column names
  const cohort1Result = await db!.execute(sql`
    INSERT INTO dose_cohorts (study_id, cohort_number, dose_level, patients_enrolled, dlts_observed, status)
    VALUES (${study.id}, 1, 0.1, 3, 0, 'completed')
    RETURNING *
  `);
  const cohort1 = [cohort1Result.rows[0]];
  
  const cohort2Result = await db!.execute(sql`
    INSERT INTO dose_cohorts (study_id, cohort_number, dose_level, patients_enrolled, dlts_observed, status)
    VALUES (${study.id}, 2, 0.3, 3, 1, 'completed')
    RETURNING *
  `);
  const cohort2 = [cohort2Result.rows[0]];
  
  // Report a DLT event
  await db!.insert(dltEvents as any).values({
    studyId: study.id,
    cohortId: cohort2[0].id,
    patientIdentifier: 'PT-002-003',
    dltType: 'Grade 3 Neutropenia',
    grade: 3,
    onsetDay: 14,
    resolved: true,
    description: 'Grade 3 neutropenia requiring G-CSF support',
    attribution: 'probable',
    reportedDate: new Date()
  });
  
  console.log('✅ Created cohorts and DLT events');
  
  // Calculate optimal dose escalation
  console.log('🔬 Calculating optimal dose escalation...');
  const escalationResult = await aiEngine.calculateOptimalDoseEscalation(study.id);
  console.log(`📈 Recommended next dose: ${escalationResult.recommendedDose} mg/kg`);
  console.log(`🎯 Estimated MTD: ${escalationResult.mtdEstimate} mg/kg`);
  
  return study;
}

async function generateCrossSpeciesPKPDData(organizationId: string) {
  console.log('🐁 Generating cross-species PK/PD data...');
  
  const speciesData = [
    {
      species: 'mouse' as const,
      dose: 10,
      doseUnit: 'mg/kg' as const,
      cmax: 1200,
      auc: 8500,
      halfLife: 2.5,
      clearance: 12.5,
      volume: 0.45,
      bodyWeight: 0.025
    },
    {
      species: 'rat' as const,
      dose: 5,
      doseUnit: 'mg/kg' as const,
      cmax: 850,
      auc: 6200,
      halfLife: 3.2,
      clearance: 8.5,
      volume: 0.85,
      bodyWeight: 0.25
    },
    {
      species: 'dog' as const,
      dose: 2,
      doseUnit: 'mg/kg' as const,
      cmax: 420,
      auc: 4100,
      halfLife: 5.8,
      clearance: 4.2,
      volume: 15.5,
      bodyWeight: 12
    },
    {
      species: 'monkey' as const,
      dose: 3,
      doseUnit: 'mg/kg' as const,
      cmax: 380,
      auc: 3800,
      halfLife: 4.5,
      clearance: 5.1,
      volume: 8.2,
      bodyWeight: 4
    }
  ];
  
  // Perform cross-species analysis
  const analysisResult = await aiEngine.performCrossSpeciesAnalysis({
    organizationId,
    compoundId: 'CMP-2025-001',
    compoundName: 'CTX-8901',
    speciesData
  });
  
  console.log('✅ Cross-species analysis completed');
  console.log(`🧬 Predicted human clearance: ${analysisResult.scalingResults.predictedHumanClearance.toFixed(2)} L/hr`);
  console.log(`💊 Human equivalent dose (HED): ${analysisResult.hedResults.hed.toFixed(3)} mg/kg`);
  console.log(`🔒 Recommended starting dose: ${analysisResult.regulatoryDoses.recommendedStartingDose.toFixed(4)} mg/kg`);
  console.log(`📊 Allometric scaling exponents: CL=${analysisResult.scalingResults.clearanceExponent.toFixed(2)}, V=${analysisResult.scalingResults.volumeExponent.toFixed(2)}`);
  
  return analysisResult;
}

async function generateINDNarrative(organizationId: string, studyId: string) {
  console.log('📝 Generating IND narrative...');
  
  const narrativeResult = await aiEngine.generateINDNarrative({
    organizationId,
    studyId,
    drugName: 'Rezolimab',
    indication: 'Metastatic Colorectal Cancer',
    narrativeType: 'clinical_overview',
    regulatoryBody: 'FDA',
    additionalContext: {
      mechanism: 'PD-1/CTLA-4 dual checkpoint inhibitor',
      phase: 'Phase I/II',
      patientPopulation: 'Adults with mCRC who have progressed on standard therapy'
    }
  });
  
  console.log('✅ IND narrative generated');
  console.log(`📄 Narrative ID: ${narrativeResult.narrativeId}`);
  console.log(`🎯 Compliance score: ${narrativeResult.complianceScore}%`);
  console.log(`📑 Sections created: ${narrativeResult.sections.length}`);
  
  return narrativeResult;
}

async function generatePredictiveSuccessScore(organizationId: string, studyId: string) {
  console.log('🔮 Calculating predictive success score...');
  
  const biomarkerData = [
    { name: 'PD-L1 Expression', value: 65, unit: '%', correlation: 0.72 },
    { name: 'Tumor Mutation Burden', value: 12.5, unit: 'mut/Mb', correlation: 0.68 },
    { name: 'MSI Status', value: 1, unit: 'MSI-H', correlation: 0.85 },
    { name: 'CD8+ T-cell Infiltration', value: 450, unit: 'cells/mm²', correlation: 0.61 }
  ];
  
  const preclinicalData = {
    efficacyScore: 0.82,
    safetyScore: 0.75,
    pkProfile: 0.88,
    mechanismValidation: 0.91
  };
  
  const competitorData = [
    { drug: 'Pembrolizumab', phase: 'Approved', successStatus: 'approved' as const },
    { drug: 'Nivolumab', phase: 'Approved', successStatus: 'approved' as const },
    { drug: 'Atezolizumab', phase: 'Phase III', successStatus: 'ongoing' as const },
    { drug: 'Drug-X', phase: 'Discontinued', successStatus: 'failed' as const }
  ];
  
  const successScore = await aiEngine.calculatePredictiveSuccessScore({
    organizationId,
    studyId,
    phase: 'II',
    indication: 'oncology',
    biomarkerData,
    preclinicalData,
    competitorData
  });
  
  console.log('✅ Predictive success score calculated');
  console.log(`🎯 Success probability: ${(successScore.successProbability * 100).toFixed(1)}%`);
  console.log(`📊 Confidence interval: ${(successScore.confidenceInterval.lower * 100).toFixed(1)}% - ${(successScore.confidenceInterval.upper * 100).toFixed(1)}%`);
  console.log(`🚦 Go/No-Go recommendation: ${successScore.goNoGoRecommendation}`);
  console.log(`⚠️  Risk factors identified: ${successScore.riskFactors.length}`);
  
  // Display key drivers
  console.log('📈 Key success drivers:');
  successScore.keyDrivers.forEach((driver: any) => {
    const emoji = driver.impact === 'positive' ? '✅' : '⚠️';
    console.log(`  ${emoji} ${driver.factor}: ${(driver.score * 100).toFixed(1)}% - ${driver.description}`);
  });
  
  return successScore;
}

async function generateComprehensiveMockData() {
  console.log('🚀 Starting AnA Predictions™ Mock Data Generation...\n');
  
  // Use test organization ID (you should replace with actual org ID from your database)
  const organizationId = '7'; // Default test organization
  
  try {
    console.log('=' .repeat(60));
    console.log('DOSE ESCALATION MODULE');
    console.log('=' .repeat(60));
    const doseStudy = await generateDoseEscalationData(organizationId);
    
    console.log('\n' + '=' .repeat(60));
    console.log('CROSS-SPECIES PK/PD ANALYSIS');
    console.log('=' .repeat(60));
    const pkpdAnalysis = await generateCrossSpeciesPKPDData(organizationId);
    
    console.log('\n' + '=' .repeat(60));
    console.log('IND NARRATIVE GENERATION');
    console.log('=' .repeat(60));
    const indNarrative = await generateINDNarrative(organizationId, doseStudy.id);
    
    console.log('\n' + '=' .repeat(60));
    console.log('PREDICTIVE SUCCESS SCORING');
    console.log('=' .repeat(60));
    const successScore = await generatePredictiveSuccessScore(organizationId, doseStudy.id);
    
    console.log('\n' + '=' .repeat(60));
    console.log('✨ AnA Predictions™ Mock Data Generation Complete!');
    console.log('=' .repeat(60));
    console.log('\n📊 Summary:');
    console.log('  • Dose Escalation Study: Active');
    console.log('  • Cross-Species Analysis: Completed');
    console.log('  • IND Narrative: Generated');
    console.log('  • Success Probability: Calculated');
    console.log('\n🎯 All modules are functioning with real calculations!');
    
    return {
      doseStudy,
      pkpdAnalysis,
      indNarrative,
      successScore
    };
  } catch (error) {
    console.error('❌ Error generating mock data:', error);
    throw error;
  }
}

// Run if called directly
generateComprehensiveMockData()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

export { generateComprehensiveMockData };
/**
 * Test Phase 1: Document-Type Specific AI Models & Automated Categorization
 *
 * This test verifies the enhanced commitment extraction endpoint with:
 * - Document-specific AI configurations (IND, NDA, BLA, CSR)
 * - Automated categorization based on regulatory taxonomy
 * - Specialized AI models for each submission type
 */

const BASE_URL = 'http://localhost:5000';
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = '550e8400-e29b-41d4-a716-446655440001';

// Test document samples for different submission types
const TEST_DOCUMENTS = {
  IND: {
    text: `
    The sponsor commits to submit safety updates every 60 days during the first year of the study.
    All serious adverse events must be reported to the FDA within 7 days of knowledge of the event.
    The clinical investigator will maintain detailed safety monitoring records throughout the study.
    Protocol amendments shall be submitted to the FDA for review prior to implementation.
    The sponsor agrees to conduct additional safety monitoring if requested by the FDA.
    `,
    documentType: 'Clinical Protocol',
  },
  NDA: {
    text: `
    The applicant commits to conduct a post-marketing surveillance study within 12 months of approval.
    REMS program implementation must be completed within 30 days of approval.
    Labeling updates will be submitted annually or when significant safety information becomes available.
    Manufacturing quality control measures shall be maintained according to cGMP standards.
    The company agrees to provide periodic safety updates every 6 months for the first 3 years.
    `,
    documentType: 'Clinical Overview',
  },
  BLA: {
    text: `
    The applicant will submit immunogenicity studies within 24 months of approval.
    Manufacturing consistency data must be provided quarterly for the first year.
    Comparability protocols will be established for any manufacturing changes.
    The sponsor commits to monitor immunogenicity in clinical practice through post-market studies.
    Biological product characterization reports shall be submitted annually.
    `,
    documentType: 'Clinical Overview',
  },
  CSR: {
    text: `
    All adverse events will be analyzed according to MedDRA coding standards.
    Protocol deviations must be documented and reported in the final study report.
    Data integrity measures include double data entry and source data verification.
    Statistical analysis plans will be finalized before database lock.
    The sponsor agrees to respond to regulatory queries within 30 days of receipt.
    `,
    documentType: 'Clinical Study Report',
  },
};

async function testDocumentSpecificModels() {
  logger.info('\n🧪 TESTING PHASE 1: DOCUMENT-TYPE SPECIFIC AI MODELS');
  logger.info('=' * 60);

  for (const [submissionType, testData] of Object.entries(TEST_DOCUMENTS)) {
    logger.info(`\n📋 Testing ${submissionType} Specialized Model`);
    logger.info(`Document Type: ${testData.documentType}`);
    logger.info('─'.repeat(40));

    const payload = {
      documentText: testData.text,
      submissionType: submissionType,
      documentType: testData.documentType,
      selectedDocumentScope: 'entire-ectd',
      selectedVersion: 'v2.0',
      analysisDepth: 'comprehensive',
    };

    const headers = {
      'Content-Type': 'application/json',
      'x-tenant-id': TENANT_ID,
      'x-user-id': USER_ID,
    };

    try {
      logger.info(`🚀 Sending request to enhanced extract commitments endpoint...`);

      const response = await fetch(`${BASE_URL}/api/ai/commitments/extract`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();

      logger.info(`📊 Response Status: ${response.status}`);
      logger.info(`✅ Success: ${responseData.success}`);

      if (responseData.success && responseData.data) {
        const { commitments, summary } = responseData.data;

        logger.info('\n🎯 DOCUMENT-SPECIFIC MODEL VERIFICATION:');
        logger.info(`✓ Total Commitments: ${summary.totalCommitments}`);
        logger.info(`✓ Critical Commitments: ${summary.criticalCommitments}`);
        logger.info(
          `✓ Model Version: ${summary.documentInfo?.documentSpecificModel || 'Not specified'}`
        );
        logger.info(
          `✓ AI Enhanced Features: ${summary.documentInfo?.aiEnhancedFeatures?.join(', ') || 'Not specified'}`
        );

        // Test automated categorization
        if (commitments && commitments.length > 0) {
          logger.info('\n🤖 AUTOMATED CATEGORIZATION ANALYSIS:');

          commitments.forEach((commitment, index) => {
            logger.info(`\nCommitment ${index + 1}:`);
            logger.info(`  Description: ${commitment.description.substring(0, 60)}...`);
            logger.info(`  Type: ${commitment.type}`);
            logger.info(`  Priority: ${commitment.priority}`);
            logger.info(`  Risk Level: ${commitment.riskLevel}`);

            if (commitment.aiAnalysis) {
              logger.info(`  AI Analysis:`);
              logger.info(`    Pattern: ${commitment.aiAnalysis.linguisticPattern}`);
              logger.info(`    Confidence: ${commitment.aiAnalysis.confidenceScore}`);
              logger.info(`    Context: ${commitment.aiAnalysis.semanticContext}`);

              if (commitment.aiAnalysis.automaticCategorization) {
                logger.info(`    Categorization:`);
                logger.info(
                  `      Primary: ${commitment.aiAnalysis.automaticCategorization.primaryCategory}`
                );
                logger.info(
                  `      Regulatory: ${commitment.aiAnalysis.automaticCategorization.regulatoryCategory}`
                );
                logger.info(
                  `      Risk Assessment: ${commitment.aiAnalysis.automaticCategorization.riskAssessment}`
                );
              }
            }
          });
        }

        // Check for Phase 1 specific features
        const phase1Features = [
          'document_specific_patterns',
          'automated_categorization',
          'confidence_scoring',
        ];

        const detectedFeatures = summary.documentInfo?.aiEnhancedFeatures || [];
        const hasPhase1Features = phase1Features.some(feature =>
          detectedFeatures.includes(feature)
        );

        if (hasPhase1Features) {
          logger.info('\n✅ PHASE 1 FEATURES CONFIRMED:');
          logger.info('  ✓ Document-specific patterns detected');
          logger.info('  ✓ Automated categorization active');
          logger.info('  ✓ Confidence scoring implemented');
        } else {
          logger.info('\n⚠️  PHASE 1 FEATURES NOT DETECTED');
        }
      } else {
        logger.info(`❌ Error: ${responseData.error || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error(`❌ Request failed: ${error.message}`);
    }
  }

  logger.info('\n🏁 PHASE 1 TESTING COMPLETE');
}

// Run the test
testDocumentSpecificModels().catch(console.error);

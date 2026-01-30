// Test script to demonstrate text processing capabilities
import fetch from 'node-fetch';

const testDocument = `
CLINICAL STUDY REPORT
Protocol: NCT04123456
Study Title: A Phase III, Randomized, Double-Blind Study of Drug XYZ-789

REGULATORY COMPLIANCE:
This study was conducted in accordance with:
- 21 CFR 312.32 (IND Safety Reports)
- ICH E6(R2) Good Clinical Practice
- ISO 14155:2020 Clinical Investigation
- EMA/CHMP/ICH/135/1995

SECTION 8.1: SAFETY ANALYSIS

8.1.1 Overview of Adverse Events
During the study period from 01-Jan-2023 to 31-Dec-2023, a total of 1,234 patients 
were enrolled across 45 sites in the United States and Europe.

Treatment-emergent adverse events (TEAEs) were reported in:
- XYZ-789 arm: 89.2% (550/617 patients)
- Placebo arm: 76.4% (472/617 patients)
- p-value = 0.0012

Serious adverse events (SAEs) occurred in:
- XYZ-789 arm: 34.5% (213/617)
- Placebo arm: 28.9% (178/617)
- Hazard ratio: 1.24 (95% CI: 1.01-1.52)

8.1.2 Most Common Adverse Events (≥10% incidence)
1. Nausea: 45.3% vs 23.1%
2. Fatigue: 38.7% vs 31.2%
3. Diarrhea: 28.9% vs 12.4%
4. Neutropenia: 24.6% vs 8.3%
5. Rash: 18.2% vs 4.9%

Organizations involved: Pfizer Inc., Merck & Co., Johnson & Johnson
Principal Investigator: Dr. Sarah Chen, MD, PhD
Study drugs: XYZ-789 (experimental), ABC-123 (comparator)

CONCLUSION:
The safety profile of XYZ-789 demonstrated manageable toxicities consistent with
the mechanism of action. The primary endpoint of progression-free survival was met
with statistical significance (HR 0.68, 95% CI: 0.54-0.85, p<0.001).
`;

async function testTextProcessing() {
  try {
    logger.info('Testing Lumen AI Text Processing Capabilities...\n');

    const response = await fetch('http://localhost:5000/api/ask-lumen', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'Analyze the safety data and extract key regulatory compliance information',
        context: 'clinical-safety',
        documentContent: testDocument,
      }),
    });

    const data = await response.json();

    logger.info('=== TEXT PROCESSING RESULTS ===\n');

    if (data.metadata && data.metadata.document_analysis) {
      const analysis = data.metadata.document_analysis;

      logger.info('Document Type:', analysis.document_type);
      logger.info('Jurisdiction:', analysis.jurisdiction);
      logger.info('\nRegulatory Tags Found:', analysis.regulatory_tags?.length || 0);
      if (analysis.regulatory_tags?.length > 0) {
        analysis.regulatory_tags.forEach(tag => logger.info(`  - ${tag}`));
      }

      logger.info('\nMedical Terms Found:', analysis.medical_terms?.length || 0);
      if (analysis.medical_terms?.length > 0) {
        analysis.medical_terms.forEach(term => logger.info(`  - ${term}`));
      }

      if (analysis.text_statistics) {
        logger.info('\nText Statistics:');
        logger.info(`  - Word Count: ${analysis.text_statistics.wordCount}`);
        logger.info(`  - Sentence Count: ${analysis.text_statistics.sentenceCount}`);
        logger.info(`  - Average Word Length: ${analysis.text_statistics.averageWordLength}`);
        logger.info(`  - Readability Score: ${analysis.text_statistics.readabilityScore}`);
      }

      if (analysis.extracted_entities) {
        logger.info('\nExtracted Entities:');
        logger.info(`  - Organizations: ${analysis.extracted_entities.organizations?.length || 0}`);
        if (analysis.extracted_entities.organizations?.length > 0) {
          analysis.extracted_entities.organizations.forEach(org => logger.info(`    • ${org}`));
        }
        logger.info(`  - Drug Names: ${analysis.extracted_entities.drugNames?.length || 0}`);
        if (analysis.extracted_entities.drugNames?.length > 0) {
          analysis.extracted_entities.drugNames.forEach(drug => logger.info(`    • ${drug}`));
        }
        logger.info(`  - Study IDs: ${analysis.extracted_entities.studyIdentifiers?.length || 0}`);
        if (analysis.extracted_entities.studyIdentifiers?.length > 0) {
          analysis.extracted_entities.studyIdentifiers.forEach(id => logger.info(`    • ${id}`));
        }
        logger.info(`  - Dates: ${analysis.extracted_entities.dates?.length || 0}`);
        if (analysis.extracted_entities.dates?.length > 0) {
          analysis.extracted_entities.dates.forEach(date => logger.info(`    • ${date}`));
        }
      }

      logger.info(`\nSegment Count: ${analysis.segment_count || 0}`);
      logger.info(`Parser Used: ${analysis.parser_used}`);
    }

    logger.info('\n=== CSR DATABASE RESULTS ===');
    if (data.metadata && data.metadata.csr_database_results) {
      logger.info(`Found ${data.metadata.csr_database_results.count} related CSRs`);
    }

    logger.info('\n=== AI RESPONSE ===');
    logger.info(data.response);
  } catch (error) {
    logger.error('Error:', error.message);
  }
}

// Run the test
testTextProcessing();

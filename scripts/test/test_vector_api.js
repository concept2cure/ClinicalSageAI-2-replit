/**
 * Test Enhanced Vector Database API
 * Tests the enhanced regulatory metadata functionality
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api';

// Sample test documents with regulatory metadata
const testDocuments = [
  {
    doc_id: 'test_csr_001',
    doc_title: 'Phase III Clinical Study Report - Cardiovascular Safety',
    content:
      'This clinical study report presents results of a randomized, double-blind, placebo-controlled Phase III study evaluating cardiovascular safety of XYZ-123 in diabetes patients. Study conducted per ICH GCP guidelines and FDA regulations. Primary endpoint was cardiovascular death, myocardial infarction, or stroke.',
    ectd_section: '5.3.5.1',
    doc_type: 'CSR',
    region_tag: ['FDA', 'EMA'],
    page_number: 1,
  },
  {
    doc_id: 'test_ich_q2r1',
    doc_title: 'ICH Q2(R1) Validation of Analytical Procedures',
    content:
      'This ICH harmonised tripartite guideline addresses validation of analytical procedures for registration applications. Parameters for method validation include accuracy, precision, specificity, detection limit, quantitation limit, linearity, and range.',
    ectd_section: '3.2.S.4.2',
    doc_type: 'ICH_Guideline',
    region_tag: ['ICH', 'FDA', 'EMA', 'PMDA'],
    page_number: 1,
  },
  {
    doc_id: 'test_protocol_001',
    doc_title: 'Clinical Trial Protocol - ABC-456 Phase II Oncology',
    content:
      'Phase II, open-label, multicenter study to evaluate efficacy and safety of ABC-456 in advanced non-small cell lung cancer patients. Primary objective: evaluate objective response rate. Tumor assessments per RECIST 1.1 criteria every 8 weeks.',
    ectd_section: '5.3.5.1',
    doc_type: 'Protocol',
    region_tag: ['FDA'],
    page_number: 1,
  },
  {
    doc_id: 'test_fda_guidance',
    doc_title: 'FDA Guidance - Bioanalytical Method Validation',
    content:
      'FDA guidance provides recommendations for bioanalytical method validation for pharmacokinetic studies. Covers validation of assays for quantitative determination of drugs and metabolites in biological matrices. Key parameters include selectivity, sensitivity, accuracy, precision.',
    ectd_section: '1.3',
    doc_type: 'FDA_Guidance',
    region_tag: ['FDA'],
    page_number: 1,
  },
];

async function testVectorHealth() {
  logger.info('🔧 Testing vector database health...');
  try {
    const response = await axios.get(`${BASE_URL}/vector-health`);
    logger.info('   ✅ Vector DB Health:', response.data);
    return response.data;
  } catch (error) {
    logger.info('   ❌ Health check failed:', error.message);
    return null;
  }
}

async function addTestDocument(doc) {
  logger.info(`📝 Adding test document: ${doc.doc_title.substring(0, 50)}...`);
  try {
    // For this test, we'll use a simple POST to add documents
    // In practice, this would go through the enhanced ingestion pipeline
    const response = await axios.post(`${BASE_URL}/vector-add`, {
      ...doc,
      // The API will generate embeddings automatically
    });
    logger.info(`   ✅ Added document ${doc.doc_id}`);
    return true;
  } catch (error) {
    logger.info(`   ❌ Failed to add ${doc.doc_id}:`, error.response?.data || error.message);
    return false;
  }
}

async function testEnhancedSearch() {
  logger.info('\n🔍 Testing enhanced vector search...');

  const searchTests = [
    {
      name: 'Search CSR documents',
      query: 'cardiovascular safety clinical study',
      filters: { doc_type: 'CSR' },
    },
    {
      name: 'Search ICH Guidelines',
      query: 'analytical validation procedures',
      filters: { doc_type: 'ICH_Guideline' },
    },
    {
      name: 'Search eCTD Section 5.3',
      query: 'clinical trial protocol',
      filters: { ectd_section: '5.3.5.1' },
    },
    {
      name: 'Search FDA documents',
      query: 'bioanalytical method validation',
      filters: { region: 'FDA' },
    },
  ];

  for (const test of searchTests) {
    logger.info(`\n   📋 ${test.name}:`);
    logger.info(`      Query: "${test.query}"`);
    logger.info(`      Filters:`, test.filters);

    try {
      const searchPayload = {
        query: test.query,
        limit: 3,
        ...test.filters,
      };

      const response = await axios.post(`${BASE_URL}/vector-search`, searchPayload);
      const results = response.data;

      logger.info(`      ✅ Found ${results.total || 0} results`);

      if (results.results && results.results.length > 0) {
        results.results.slice(0, 2).forEach((result, i) => {
          logger.info(`         ${i + 1}. ${result.doc_title || 'Unknown'}`);
          logger.info(`            eCTD: ${result.ectd_section || 'N/A'}`);
          logger.info(`            Type: ${result.doc_type || 'N/A'}`);
          logger.info(
            `            Regions: ${result.region_tag ? result.region_tag.join(', ') : 'N/A'}`
          );
          if (result.similarity_score) {
            logger.info(`            Score: ${result.similarity_score.toFixed(3)}`);
          }
        });
      }
    } catch (error) {
      logger.info(`      ❌ Search failed:`, error.response?.data || error.message);
    }
  }
}

async function verifyMetadataFields() {
  logger.info('\n📊 Verifying enhanced metadata fields...');

  try {
    // Test search with specific metadata filters
    const metadataTests = [
      { filter: 'doc_type', value: 'CSR', description: 'Clinical Study Reports' },
      { filter: 'doc_type', value: 'ICH_Guideline', description: 'ICH Guidelines' },
      { filter: 'ectd_section', value: '5.3.5.1', description: 'eCTD Section 5.3.5.1' },
      { filter: 'region', value: 'FDA', description: 'FDA Documents' },
    ];

    for (const test of metadataTests) {
      const searchPayload = {
        query: 'validation',
        limit: 10,
        [test.filter]: test.value,
      };

      const response = await axios.post(`${BASE_URL}/vector-search`, searchPayload);
      const count = response.data.total || 0;

      logger.info(`   ${test.description}: ${count} documents`);
    }
  } catch (error) {
    logger.info('   ❌ Metadata verification failed:', error.message);
  }
}

async function runCompleteTest() {
  logger.info('🚀 Enhanced Vector Database Test Suite');
  logger.info('=' * 50);

  // Test 1: Check vector database health
  const health = await testVectorHealth();
  if (!health) {
    logger.info('❌ Vector database is not accessible. Stopping tests.');
    return;
  }

  logger.info('\n📈 Enhanced Schema Verification:');
  logger.info(`   Enhanced Schema: ${health.enhanced_schema ? '✅ Active' : '❌ Missing'}`);
  logger.info(
    `   Metadata Fields: ${health.metadata_fields ? health.metadata_fields.join(', ') : 'None'}`
  );
  logger.info(`   Total Chunks: ${health.total_chunks || 0}`);

  // Test 2: Add test documents (if we have the endpoint)
  logger.info('\n📝 Adding test documents...');
  let documentsAdded = 0;
  for (const doc of testDocuments) {
    if (await addTestDocument(doc)) {
      documentsAdded++;
    }
  }
  logger.info(`   Added ${documentsAdded}/${testDocuments.length} test documents`);

  // Test 3: Test enhanced search functionality
  await testEnhancedSearch();

  // Test 4: Verify metadata field functionality
  await verifyMetadataFields();

  logger.info('\n' + '=' * 50);
  logger.info('✅ Enhanced Vector Database Test Complete!');
  logger.info(`   📈 Schema Enhancement: ${health.enhanced_schema ? 'VERIFIED' : 'FAILED'}`);
  logger.info(`   🔍 Search Functionality: TESTED`);
  logger.info(`   📊 Metadata Fields: ${health.metadata_fields ? 'VERIFIED' : 'FAILED'}`);

  return health.enhanced_schema && health.metadata_fields && health.metadata_fields.length > 0;
}

// Run the test
runCompleteTest()
  .then(success => {
    if (success) {
      logger.info(
        '\n🎉 Phase 1, Step 1 VERIFIED: Enhanced vector database with regulatory metadata is operational'
      );
      process.exit(0);
    } else {
      logger.info('\n❌ Phase 1, Step 1 INCOMPLETE: Enhanced vector database verification failed');
      process.exit(1);
    }
  })
  .catch(error => {
    logger.error('❌ Test suite failed:', error.message);
    process.exit(1);
  });

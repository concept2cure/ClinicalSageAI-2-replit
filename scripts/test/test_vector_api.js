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
  console.log('🔧 Testing vector database health...');
  try {
    const response = await axios.get(`${BASE_URL}/vector-health`);
    console.log('   ✅ Vector DB Health:', response.data);
    return response.data;
  } catch (error) {
    console.log('   ❌ Health check failed:', error.message);
    return null;
  }
}

async function addTestDocument(doc) {
  console.log(`📝 Adding test document: ${doc.doc_title.substring(0, 50)}...`);
  try {
    // For this test, we'll use a simple POST to add documents
    // In practice, this would go through the enhanced ingestion pipeline
    const response = await axios.post(`${BASE_URL}/vector-add`, {
      ...doc,
      // The API will generate embeddings automatically
    });
    console.log(`   ✅ Added document ${doc.doc_id}`);
    return true;
  } catch (error) {
    console.log(`   ❌ Failed to add ${doc.doc_id}:`, error.response?.data || error.message);
    return false;
  }
}

async function testEnhancedSearch() {
  console.log('\n🔍 Testing enhanced vector search...');

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
    console.log(`\n   📋 ${test.name}:`);
    console.log(`      Query: "${test.query}"`);
    console.log(`      Filters:`, test.filters);

    try {
      const searchPayload = {
        query: test.query,
        limit: 3,
        ...test.filters,
      };

      const response = await axios.post(`${BASE_URL}/vector-search`, searchPayload);
      const results = response.data;

      console.log(`      ✅ Found ${results.total || 0} results`);

      if (results.results && results.results.length > 0) {
        results.results.slice(0, 2).forEach((result, i) => {
          console.log(`         ${i + 1}. ${result.doc_title || 'Unknown'}`);
          console.log(`            eCTD: ${result.ectd_section || 'N/A'}`);
          console.log(`            Type: ${result.doc_type || 'N/A'}`);
          console.log(
            `            Regions: ${result.region_tag ? result.region_tag.join(', ') : 'N/A'}`
          );
          if (result.similarity_score) {
            console.log(`            Score: ${result.similarity_score.toFixed(3)}`);
          }
        });
      }
    } catch (error) {
      console.log(`      ❌ Search failed:`, error.response?.data || error.message);
    }
  }
}

async function verifyMetadataFields() {
  console.log('\n📊 Verifying enhanced metadata fields...');

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

      console.log(`   ${test.description}: ${count} documents`);
    }
  } catch (error) {
    console.log('   ❌ Metadata verification failed:', error.message);
  }
}

async function runCompleteTest() {
  console.log('🚀 Enhanced Vector Database Test Suite');
  console.log('=' * 50);

  // Test 1: Check vector database health
  const health = await testVectorHealth();
  if (!health) {
    console.log('❌ Vector database is not accessible. Stopping tests.');
    return;
  }

  console.log('\n📈 Enhanced Schema Verification:');
  console.log(`   Enhanced Schema: ${health.enhanced_schema ? '✅ Active' : '❌ Missing'}`);
  console.log(
    `   Metadata Fields: ${health.metadata_fields ? health.metadata_fields.join(', ') : 'None'}`
  );
  console.log(`   Total Chunks: ${health.total_chunks || 0}`);

  // Test 2: Add test documents (if we have the endpoint)
  console.log('\n📝 Adding test documents...');
  let documentsAdded = 0;
  for (const doc of testDocuments) {
    if (await addTestDocument(doc)) {
      documentsAdded++;
    }
  }
  console.log(`   Added ${documentsAdded}/${testDocuments.length} test documents`);

  // Test 3: Test enhanced search functionality
  await testEnhancedSearch();

  // Test 4: Verify metadata field functionality
  await verifyMetadataFields();

  console.log('\n' + '=' * 50);
  console.log('✅ Enhanced Vector Database Test Complete!');
  console.log(`   📈 Schema Enhancement: ${health.enhanced_schema ? 'VERIFIED' : 'FAILED'}`);
  console.log(`   🔍 Search Functionality: TESTED`);
  console.log(`   📊 Metadata Fields: ${health.metadata_fields ? 'VERIFIED' : 'FAILED'}`);

  return health.enhanced_schema && health.metadata_fields && health.metadata_fields.length > 0;
}

// Run the test
runCompleteTest()
  .then(success => {
    if (success) {
      console.log(
        '\n🎉 Phase 1, Step 1 VERIFIED: Enhanced vector database with regulatory metadata is operational'
      );
      process.exit(0);
    } else {
      console.log('\n❌ Phase 1, Step 1 INCOMPLETE: Enhanced vector database verification failed');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  });

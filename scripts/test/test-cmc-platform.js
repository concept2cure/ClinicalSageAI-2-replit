#!/usr/bin/env node

/**
 * CMC Platform Comprehensive Testing Script
 * Tests all API endpoints and creates sample data for proper functionality testing
 */

const API_BASE = 'http://localhost:5000';
const PROJECT_ID = '45cc837f-2a7c-4216-ac5c-6454d038bc20'; // First project from our list

console.log('🧪 Testing CMC Platform APIs...\n');

// Test API endpoint function
async function testAPI(url, method = 'GET', data = null) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (data) options.body = JSON.stringify(data);

    const response = await fetch(`${API_BASE}${url}`, options);
    const result = await response.text();

    // Try to parse as JSON
    let jsonResult;
    try {
      jsonResult = JSON.parse(result);
    } catch {
      jsonResult = { error: 'Invalid JSON response', rawResponse: result.substring(0, 200) };
    }

    return {
      status: response.status,
      ok: response.ok,
      data: jsonResult,
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      data: { error: error.message },
    };
  }
}

// Sample data for testing
const sampleData = {
  substance: {
    substanceName: 'Adalimumab Active Ingredient', // Fixed: use substanceName for consistency
    substanceType: 'monoclonal_antibody', // Fixed: use substanceType
    casNumber: '331731-18-1',
    molecularFormula: 'C6553H10073N1751O2023S46',
    molecularWeight: 147300.0,
    appearance: 'Clear to slightly opalescent liquid',
    solubility: 'Freely soluble in water',
    storageConditions: '2-8°C, protected from light',
    shelfLife: '24 months',
    manufacturingProcess: 'Recombinant DNA technology in CHO cells',
    controlStrategy: 'In-process controls and release testing per ICH Q6B',
    specifications: 'Appearance, Identity, Purity, Potency, Safety',
  },

  product: {
    productName: 'Adalimumab Solution for Injection', // Fixed: use productName instead of name
    dosageForm: 'Solution for injection',
    strength: '40 mg/0.8 mL',
    routeOfAdministration: 'Subcutaneous',
    excipients: 'Mannitol, polysorbate 80, sodium chloride',
    containerClosure: 'Pre-filled syringe with needle safety device',
    appearance: 'Clear to slightly opalescent, colorless to pale yellow',
    osmolality: '280-320 mOsm/kg',
    pH: '5.0-6.0',
    storageConditions: '2-8°C, do not freeze or shake',
    shelfLife: '24 months',
    packagingConfiguration: 'Single-use pre-filled syringe',
  },

  analyticalMethod: {
    methodName: 'HPLC-UV Method for Adalimumab Purity', // Fixed: use methodName instead of name
    methodType: 'chromatographic',
    technique: 'HPLC-UV',
    purpose: 'Purity determination',
    specification: 'Not less than 95% purity',
    validationStatus: 'validated',
    detectionLimit: '0.1 mg/mL',
    quantitationLimit: '0.5 mg/mL',
    accuracy: '98-102%',
    precision: 'RSD ≤ 2.0%',
    specificity: 'Validated against known impurities',
    linearity: 'R² ≥ 0.999',
    range: '0.5-2.0 mg/mL',
    robustness: 'Validated per ICH Q2(R1)',
  },

  stabilityStudy: {
    studyName: 'Adalimumab Long-term Stability Study', // Fixed: use studyName instead of studyId
    studyType: 'long_term',
    storageCondition: '25°C ± 2°C/60% RH ± 5% RH', // Fixed: use storageCondition instead of condition
    duration: '36 months',
    status: 'ongoing',
    timePoints: '0, 3, 6, 9, 12, 18, 24, 36 months', // Fixed: use timePoints instead of timepoints
    testParameters: 'Appearance, pH, osmolality, purity, potency',
    containerClosure: 'Pre-filled syringe', // Fixed: align with schema
    startedDate: '2024-01-15', // Fixed: use string format for date
    completedDate: null,
  },

  compliance: {
    guideline: 'ICH Q6B',
    requirement: 'Specifications for biotechnological/biological products',
    status: 'compliant',
    riskLevel: 'high',
    assignedTo: 'Dr. Sarah Johnson',
    dueDate: '2025-12-31', // Fixed: use string format for date
    notes: 'Full analytical characterization completed per ICH Q6B guidelines',
  },
};

async function runTests() {
  console.log('📋 API Endpoint Testing Results:\n');

  // Test each endpoint
  const tests = [
    { name: 'Projects List', url: '/api/cmc/projects' },
    { name: 'Single Project', url: `/api/cmc/projects/${PROJECT_ID}` },
    { name: 'Substances', url: `/api/cmc/projects/${PROJECT_ID}/substances` },
    { name: 'Products', url: `/api/cmc/projects/${PROJECT_ID}/products` },
    { name: 'Analytical Methods', url: `/api/cmc/projects/${PROJECT_ID}/analytical-methods` },
    { name: 'Stability Studies', url: `/api/cmc/projects/${PROJECT_ID}/stability-studies` },
    { name: 'Compliance', url: `/api/cmc/projects/${PROJECT_ID}/compliance` },
    { name: 'Documents', url: `/api/cmc/projects/${PROJECT_ID}/documents` },
  ];

  const results = {};

  for (const test of tests) {
    const result = await testAPI(test.url);
    results[test.name] = result;

    const status = result.ok ? '✅' : '❌';
    const dataCount = result.data?.data ? result.data.data.length : 0;
    const errorMsg = result.data?.error || '';

    console.log(
      `${status} ${test.name}: ${result.status} | Data: ${dataCount} items | ${errorMsg}`
    );
  }

  console.log('\n🔧 Creating Sample Data...\n');

  // Create sample data for each endpoint
  const createTests = [
    {
      name: 'Create Substance',
      url: `/api/cmc/projects/${PROJECT_ID}/substances`,
      data: sampleData.substance,
    },
    {
      name: 'Create Product',
      url: `/api/cmc/projects/${PROJECT_ID}/products`,
      data: sampleData.product,
    },
    {
      name: 'Create Analytical Method',
      url: `/api/cmc/projects/${PROJECT_ID}/analytical-methods`,
      data: sampleData.analyticalMethod,
    },
    {
      name: 'Create Stability Study',
      url: `/api/cmc/projects/${PROJECT_ID}/stability-studies`,
      data: sampleData.stabilityStudy,
    },
    {
      name: 'Create Compliance',
      url: `/api/cmc/projects/${PROJECT_ID}/compliance`,
      data: sampleData.compliance,
    },
  ];

  for (const test of createTests) {
    const result = await testAPI(test.url, 'POST', test.data);
    const status = result.ok ? '✅' : '❌';
    const errorMsg = result.data?.error || '';

    console.log(`${status} ${test.name}: ${result.status} | ${errorMsg}`);
  }

  console.log('\n📊 Re-testing Data Retrieval...\n');

  // Re-test GET endpoints to see if data was created
  for (const test of tests.slice(2, -1)) {
    // Skip projects, just test CMC endpoints
    const result = await testAPI(test.url);
    const status = result.ok ? '✅' : '❌';
    const dataCount = result.data?.data ? result.data.data.length : 0;

    console.log(`${status} ${test.name}: ${dataCount} items retrieved`);
  }

  console.log('\n🎯 Summary:');
  console.log('- If substances/products still show 0 items, API routing is broken');
  console.log('- If analytical methods/stability/compliance show 0 items, database schema issues');
  console.log('- If data creation fails, form submission in UI will be broken');
  console.log('- All working endpoints should return JSON, not HTML');

  return results;
}

// Run the tests
runTests().catch(console.error);

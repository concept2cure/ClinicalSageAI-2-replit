// Test script for Predictive Document Section Suggestions API
const fetch = require('node-fetch');

async function testPredictiveAPI() {
  try {
    const response = await fetch('http://localhost:5000/api/ai/predictive-sections/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_content:
          'This is a test IND document for oncology Phase I study. We need to add more sections for regulatory compliance.',
        document_type: 'investigator_brochure',
        therapeutic_area: 'oncology',
        study_phase: 'Phase I',
        ectd_context: true,
      }),
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers.raw());

    const text = await response.text();
    console.log('Response body (first 500 chars):', text.substring(0, 500));

    try {
      const json = JSON.parse(text);
      console.log('Parsed JSON:', json);
    } catch (e) {
      console.log('Response is not JSON, it appears to be HTML');
    }
  } catch (error) {
    console.error('Error testing API:', error);
  }
}

testPredictiveAPI();

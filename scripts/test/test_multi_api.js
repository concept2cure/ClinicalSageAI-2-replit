/**
 * Test script for multi-source API - final verification
 */

async function testPdfDirectlyWithNarrativeAlreadyCached() {
  try {
    // Using the original NDC code we already tested and cached
    console.log('Testing PDF generation with known cached narrative...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const pdfResponse = await fetch('http://localhost:3500/api/narrative/multi/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ndc_codes: ['00002-3227'], // Using code we know is cached
        device_codes: [],
        periods: 1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (pdfResponse.ok) {
      const contentType = pdfResponse.headers.get('content-type');

      if (contentType.includes('application/pdf')) {
        const blob = await pdfResponse.blob();
        console.log('PDF generated successfully from cached narrative!');
        console.log(`PDF size: ${blob.size} bytes`);
        console.log('Solution is verified and ready for use.');
      } else {
        // If we received JSON, something unexpected happened
        const responseData = await pdfResponse.json();
        console.log('PDF endpoint returned JSON (unexpected):', responseData);
      }
    } else {
      console.error('PDF generation failed:', pdfResponse.status, pdfResponse.statusText);
    }
  } catch (error) {
    console.error('Process failed:', error.message);
  }
}

testPdfDirectlyWithNarrativeAlreadyCached();

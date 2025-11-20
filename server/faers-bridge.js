/**
 * FAERS Bridge Service
 *
 * This module provides a bridge between the Express backend and the Python
 * scripts that interact with the FDA FAERS API and OpenAI to generate CER reports.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Generate a CER report from an NDC code using the Python scripts
 *
 * @param {string} ndcCode - The NDC (National Drug Code) identifier
 * @param {string} productName - Optional product name for better context
 * @returns {Promise<string>} The generated CER report text
 */
async function generateCERFromFAERS(ndcCode, productName = null) {
  return new Promise((resolve, reject) => {
    // Create a temporary Python script that calls our functions
    const tempScriptPath = path.join(process.cwd(), 'temp_faers_script.py');

    const scriptContent = `
import sys
import json
from faers_client import get_faers_data
from cer_narrative import generate_cer_narrative

try:
    ndc_code = "${ndcCode}"
    product_name = ${productName ? `"${productName}"` : 'None'}
    
    # Fetch FAERS data for the NDC code
    faers_data = get_faers_data(ndc_code)
    
    # Generate the CER narrative
    cer_text = generate_cer_narrative(faers_data, product_name)
    
    # Return results as JSON
    result = {
        "cer_report": cer_text,
        "ndc_code": ndc_code,
        "product_name": product_name,
        "total_records": faers_data.get("meta", {}).get("results", {}).get("total", 0)
    }
    print(json.dumps(result))
except Exception as e:
    error_result = {"error": str(e)}
    print(json.dumps(error_result))
    sys.exit(1)
`;

    // Write the temporary script file
    fs.writeFileSync(tempScriptPath, scriptContent);

    // Execute the Python script
    const pythonProcess = spawn('python', [tempScriptPath]);

    let outputData = '';
    let errorData = '';

    pythonProcess.stdout.on('data', data => {
      outputData += data.toString();
    });

    pythonProcess.stderr.on('data', data => {
      errorData += data.toString();
    });

    pythonProcess.on('close', code => {
      // Delete the temporary script file
      fs.unlinkSync(tempScriptPath);

      if (code === 0) {
        try {
          const result = JSON.parse(outputData);
          if (result.error) {
            reject(new Error(result.error));
          } else {
            resolve(result);
          }
        } catch (e) {
          reject(new Error(`Failed to parse Python output: ${e.message}`));
        }
      } else {
        reject(new Error(`Python process exited with code ${code}: ${errorData}`));
      }
    });
  });
}

module.exports = {
  generateCERFromFAERS,
};

/**
 * FAERS Bridge Module
 *
 * This module provides a bridge between the Node.js/Express backend and
 * the Python FAERS client for retrieving and processing FDA FAERS data.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Execute a Python script with arguments and return its output
 *
 * @param {string} scriptName - The Python script to execute
 * @param {Array<string>} args - Arguments to pass to the script
 * @param {Object} inputData - Optional data to pass to the script via stdin
 * @returns {Promise<any>} Parsed JSON result from the script
 */
function executePythonScript(scriptName, args = [], inputData = null) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), scriptName);
    const pythonProcess = spawn('python3', [scriptPath, ...args]);

    let dataString = '';
    let errorString = '';

    // Collect data from script stdout
    pythonProcess.stdout.on('data', data => {
      dataString += data.toString();
    });

    // Collect error output
    pythonProcess.stderr.on('data', data => {
      errorString += data.toString();
    });

    // Handle process completion
    pythonProcess.on('close', code => {
      if (code !== 0) {
        console.error(`Python script execution failed with code ${code}: ${errorString}`);
        reject(new Error(`Python process exited with code ${code}: ${errorString}`));
        return;
      }

      try {
        const result = JSON.parse(dataString);
        resolve(result);
      } catch (error) {
        if (dataString.trim()) {
          resolve(dataString.trim());
        } else {
          reject(new Error(`Failed to parse Python script output: ${error.message}`));
        }
      }
    });

    // If there's input data, write it to stdin
    if (inputData) {
      pythonProcess.stdin.write(JSON.stringify(inputData));
      pythonProcess.stdin.end();
    }
  });
}

/**
 * Fetch FAERS data for a given NDC code
 *
 * @param {string} ndcCode - National Drug Code to query
 * @returns {Promise<Object>} FAERS data for the drug
 */
async function fetchFaersData(ndcCode) {
  try {
    // Execute Python FAERS client in a separate process
    return await executePythonScript('faers_client.py', [ndcCode]);
  } catch (error) {
    console.error('Error fetching FAERS data:', error);
    throw error;
  }
}

/**
 * Generate a CER narrative from FAERS data
 *
 * @param {Object} faersData - Processed FAERS data from the client
 * @param {string} productName - Optional product name to use in the report
 * @returns {Promise<string>} Generated CER narrative text
 */
async function generateCerNarrative(faersData, productName = null) {
  try {
    // Create temporary input file with FAERS data
    const inputData = {
      faersData,
      productName,
    };

    // Execute Python narrative generator in a separate process
    const result = await executePythonScript('cer_narrative.py', [], inputData);

    if (typeof result === 'string') {
      return result;
    } else {
      return result.narrative || result;
    }
  } catch (error) {
    console.error('Error generating CER narrative:', error);
    throw error;
  }
}

export { fetchFaersData, generateCerNarrative };

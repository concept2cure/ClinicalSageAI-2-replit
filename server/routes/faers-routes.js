/**
 * FDA FAERS Routes
 *
 * This module provides API routes for interacting with the FDA FAERS API
 * and generating CER reports using OpenAI.
 */

const express = require('express');
const router = express.Router();
const { generateCERFromFAERS } = require('../faers-bridge');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Generate a CER from an NDC code using FAERS data
router.get('/:ndcCode', async (req, res) => {
  try {
    const { ndcCode } = req.params;
    const { product_name } = req.query;

    console.log(`Generating CER for NDC code: ${ndcCode}`);

    // Direct Python execution approach
    const command = `python -c "import json; from faers_client import get_faers_data; from cer_narrative import generate_cer_narrative; faers_data = get_faers_data('${ndcCode}'); cer_text = generate_cer_narrative(faers_data${product_name ? `, '${product_name}'` : ''}); print(json.dumps({'cer_report': cer_text}))"`;

    const { stdout, stderr } = await execPromise(command);

    if (stderr) {
      console.error('Python Error:', stderr);
      return res.status(500).json({ error: 'Error generating CER report', details: stderr });
    }

    const result = JSON.parse(stdout);
    res.json(result);
  } catch (error) {
    console.error('Error generating CER report:', error);
    res.status(500).json({
      error: 'Failed to generate CER report',
      message: error.message,
    });
  }
});

// Alternative implementation using bridge module
router.post('/:ndcCode', async (req, res) => {
  try {
    const { ndcCode } = req.params;
    const { product_name } = req.body;

    console.log(
      `Generating CER for NDC code: ${ndcCode}, Product: ${product_name || 'Not specified'}`
    );

    // Use the bridge module to generate the CER
    const result = await generateCERFromFAERS(ndcCode, product_name);

    res.status(200).json(result);
  } catch (error) {
    console.error('Error generating CER report:', error);
    res.status(500).json({
      error: 'Failed to generate CER report',
      message: error.message,
    });
  }
});

module.exports = router;

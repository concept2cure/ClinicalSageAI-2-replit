// cer_routes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { openai } = require('../openai-service');

/**
 * Routes for Clinical Evaluation Report Generator
 */

// Base FAERS API URL (for direct access)
const FAERS_API_BASE = 'https://api.fda.gov/drug/event.json';

// Default FastAPI server location (for Python-based processing)
const FASTAPI_SERVER = process.env.FASTAPI_SERVER || 'http://localhost:8000';

// Generate a CER for a single NDC code
router.post('/generate', async (req, res) => {
  try {
    const { ndc_code } = req.body;

    if (!ndc_code) {
      return res.status(400).json({ success: false, message: 'NDC code is required' });
    }

    // Call the FastAPI endpoint
    const response = await axios.post(`${FASTAPI_SERVER}/cer/generate`, {
      ndc_code,
    });

    return res.json({
      success: true,
      ...response.data,
    });
  } catch (error) {
    console.error('Error generating CER:', error);
    return res.status(500).json({
      success: false,
      message: error.response?.data?.detail || 'Error generating CER report',
    });
  }
});

// Analyze multiple NDC codes for comparison
router.post('/analyze', async (req, res) => {
  try {
    const { ndc_codes } = req.body;

    if (!ndc_codes || !Array.isArray(ndc_codes) || ndc_codes.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one NDC code is required' });
    }

    // Call the FastAPI endpoint for comparative analysis
    const response = await axios.post(`${FASTAPI_SERVER}/cer/analyze`, {
      ndc_codes,
    });

    // Format data for visualization
    const visualizationData = {
      event_labels: [],
      products: {},
    };

    // Check if we have valid data
    if (response.data && response.data.comparative_data) {
      const { comparative_data } = response.data;

      // Get all unique events across all products
      const allEvents = new Set();
      Object.values(comparative_data).forEach(product => {
        if (product.event_summary) {
          Object.keys(product.event_summary).forEach(event => allEvents.add(event));
        }
      });

      visualizationData.event_labels = Array.from(allEvents);

      // Map each product's data to the correct format
      Object.entries(comparative_data).forEach(([ndcCode, productData]) => {
        const eventValues = visualizationData.event_labels.map(event =>
          productData.event_summary && productData.event_summary[event]
            ? productData.event_summary[event]
            : 0
        );

        visualizationData.products[ndcCode] = eventValues;
      });
    }

    return res.json({
      success: true,
      visualization_data: visualizationData,
      raw_data: response.data,
    });
  } catch (error) {
    console.error('Error analyzing NDC codes:', error);
    return res.status(500).json({
      success: false,
      message: error.response?.data?.detail || 'Error analyzing NDC codes',
    });
  }
});

// Natural Language Query Processing
router.post('/nlp-query', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ success: false, message: 'Query is required' });
    }

    // Try using OpenAI to interpret the query
    try {
      // Use OpenAI to interpret the natural language query
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: 'system',
            content: `You are an expert in clinical evaluation reports and FDA adverse event data. 
            Interpret the user's natural language query about adverse events and transform it into a structured 
            filtering request. Return your response as a JSON object with these fields:
            - filters: array of filter conditions (e.g. age ranges, gender, event types)
            - sort: how to sort results (default: frequency)
            - limit: maximum number of records to return (default: 50)
            - group_by: how to group results (e.g. by event, by patient age, etc.)
            - intent: the main purpose of the query (e.g. find_events, compare_products, summarize, etc.)
            `,
          },
          { role: 'user', content: query },
        ],
        response_format: { type: 'json_object' },
      });

      // Parse the AI response
      const aiResponse = JSON.parse(completion.choices[0].message.content);

      // Here you would use the structured response to filter your data
      // For now, let's just return the structured interpretation
      return res.json({
        success: true,
        results: {
          interpretation: aiResponse,
          // In a real implementation, you would apply these filters to your data
          // and return the filtered results
          filtered_data: [],
        },
        query,
      });
    } catch (aiError) {
      console.error('Error processing NLP with OpenAI:', aiError);

      // Fallback to basic keyword matching if OpenAI fails
      return res.json({
        success: true,
        results: {
          interpretation: {
            filters: [{ type: 'keyword', value: query }],
            sort: 'frequency',
            limit: 50,
            group_by: 'event',
            intent: 'basic_search',
          },
          filtered_data: [], // In a real implementation, this would have data
        },
        query,
        ai_error: true,
      });
    }
  } catch (error) {
    console.error('Error processing NLP query:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing natural language query',
    });
  }
});

// PDF Export endpoint
router.get('/export-pdf', async (req, res) => {
  try {
    const { ndc_code, ndc_codes } = req.query;

    let codesArray = [];

    // Handle both single NDC and multiple NDCs
    if (ndc_code) {
      codesArray = [ndc_code];
    } else if (ndc_codes) {
      codesArray = ndc_codes.split(',');
    }

    if (codesArray.length === 0) {
      return res.status(400).json({ success: false, message: 'NDC code(s) are required' });
    }

    // Call the FastAPI endpoint for PDF generation
    const response = await axios.post(
      `${FASTAPI_SERVER}/cer/export-pdf`,
      { ndc_codes: codesArray },
      { responseType: 'arraybuffer' }
    );

    // Set appropriate headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="cer_report_${new Date().toISOString().slice(0, 10)}.pdf"`
    );

    // Send the PDF data
    return res.send(Buffer.from(response.data));
  } catch (error) {
    console.error('Error exporting PDF:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating PDF report',
    });
  }
});

// Get basic usage statistics for the CER module
router.get('/stats', async (req, res) => {
  try {
    // In a real implementation, this would fetch actual usage statistics
    // For now, return placeholder stats
    return res.json({
      success: true,
      stats: {
        total_reports_generated: 1254,
        total_products_analyzed: 478,
        most_common_products: [
          { ndc: '0002-3227-30', count: 87 },
          { ndc: '0074-3799-13', count: 64 },
          { ndc: '0078-0357-15', count: 51 },
        ],
        most_common_events: [
          { name: 'HEADACHE', count: 312 },
          { name: 'NAUSEA', count: 287 },
          { name: 'DIZZINESS', count: 245 },
        ],
      },
    });
  } catch (error) {
    console.error('Error retrieving CER stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving CER statistics',
    });
  }
});

module.exports = router;

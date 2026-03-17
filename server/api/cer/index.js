const express = require('express');
const { getPool } = require('../../db/pool');
const { getOpenAIClient } = require('../../services/openai-client');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Initialize OpenAI client
const openai = getOpenAIClient();

// Middleware to check for valid API key if missing
const checkApiKey = (req, res, next) => {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is missing');
    return res.status(500).json({
      error:
        'OpenAI API key is missing. Please configure the API key in the environment variables.',
    });
  }
  next();
};

// Create necessary directories if they don't exist
const ensureDirectories = () => {
  const dirs = ['./uploads', './uploads/cer', './uploads/cer/reports', './uploads/cer/temp'];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

ensureDirectories();

/**
 * API Routes for CER Generator
 */

// Get all CER reports
router.get('/reports', async (req, res) => {
  try {
    const { status, search } = req.query;

    let query = `
      SELECT 
        r.id, 
        r.title, 
        r.status, 
        r.created_at, 
        r.updated_at,
        COUNT(s.id) AS section_count,
        JSON_AGG(
          json_build_object(
            'id', s.id,
            'title', s.title,
            'status', s.status
          )
        ) AS sections
      FROM cer_reports r
      LEFT JOIN cer_sections s ON r.id = s.report_id
    `;

    const whereConditions = [];
    const queryParams = [];

    if (status && status !== 'all') {
      whereConditions.push(`r.status = $${queryParams.length + 1}`);
      queryParams.push(status);
    }

    if (search) {
      whereConditions.push(`r.title ILIKE $${queryParams.length + 1}`);
      queryParams.push(`%${search}%`);
    }

    if (whereConditions.length > 0) {
      query += ' WHERE ' + whereConditions.join(' AND ');
    }

    query += ' GROUP BY r.id ORDER BY r.updated_at DESC';

    const result = await pool.query(query, queryParams);

    res.json({
      reports: result.rows,
    });
  } catch (error) {
    console.error('Error fetching CER reports:', error);
    res.status(500).json({ error: 'Failed to retrieve CER reports' });
  }
});

// Get a specific CER report
router.get('/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get report details
    const reportQuery = 'SELECT * FROM cer_reports WHERE id = $1';
    const reportResult = await pool.query(reportQuery, [id]);

    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = reportResult.rows[0];

    // Get sections
    const sectionsQuery = 'SELECT * FROM cer_sections WHERE report_id = $1 ORDER BY section_order';
    const sectionsResult = await pool.query(sectionsQuery, [id]);

    // Get data sources
    const dataSourcesQuery = 'SELECT * FROM cer_data_sources WHERE report_id = $1';
    const dataSourcesResult = await pool.query(dataSourcesQuery, [id]);

    // Combine everything
    report.sections = sectionsResult.rows;
    report.dataSources = dataSourcesResult.rows;

    res.json(report);
  } catch (error) {
    console.error('Error fetching CER report:', error);
    res.status(500).json({ error: 'Failed to retrieve CER report' });
  }
});

// Create a new CER report
router.post('/reports', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { title, template_id, product_id, date_range_start, date_range_end } = req.body;

    // Insert report
    const reportQuery = `
      INSERT INTO cer_reports 
        (title, status, template_id, product_id, date_range_start, date_range_end) 
      VALUES 
        ($1, 'draft', $2, $3, $4, $5) 
      RETURNING *
    `;

    const reportValues = [
      title,
      template_id,
      product_id,
      date_range_start || null,
      date_range_end || null,
    ];

    const reportResult = await client.query(reportQuery, reportValues);
    const report = reportResult.rows[0];

    // Get template sections
    const templateSectionsQuery = `
      SELECT * FROM cer_template_sections 
      WHERE template_id = $1 
      ORDER BY section_order
    `;

    const templateSections = await client.query(templateSectionsQuery, [template_id]);

    // Insert sections from template
    if (templateSections.rows.length > 0) {
      const sectionInsertQueries = templateSections.rows.map((section, index) => {
        return client.query(
          `INSERT INTO cer_sections 
            (report_id, title, description, status, section_order, section_key, regulatory_framework)
          VALUES 
            ($1, $2, $3, 'draft', $4, $5, $6)`,
          [
            report.id,
            section.title,
            section.description,
            index + 1,
            section.section_key,
            section.regulatory_framework,
          ]
        );
      });

      await Promise.all(sectionInsertQueries);
    }

    // Get updated report with sections
    const sectionsQuery = 'SELECT * FROM cer_sections WHERE report_id = $1 ORDER BY section_order';
    const sectionsResult = await client.query(sectionsQuery, [report.id]);
    report.sections = sectionsResult.rows;

    await client.query('COMMIT');
    res.status(201).json(report);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating CER report:', error);
    res.status(500).json({ error: 'Failed to create CER report' });
  } finally {
    client.release();
  }
});

// Update a CER report
router.put('/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, status, date_range_start, date_range_end } = req.body;

    const query = `
      UPDATE cer_reports 
      SET 
        title = COALESCE($1, title),
        status = COALESCE($2, status),
        date_range_start = COALESCE($3, date_range_start),
        date_range_end = COALESCE($4, date_range_end),
        updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `;

    const values = [title, status, date_range_start, date_range_end, id];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating CER report:', error);
    res.status(500).json({ error: 'Failed to update CER report' });
  }
});

// Delete a CER report
router.delete('/reports/:id', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { id } = req.params;

    // Delete sections
    await client.query('DELETE FROM cer_sections WHERE report_id = $1', [id]);

    // Delete data sources
    await client.query('DELETE FROM cer_data_sources WHERE report_id = $1', [id]);

    // Delete report
    const result = await client.query('DELETE FROM cer_reports WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Report not found' });
    }

    await client.query('COMMIT');
    res.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting CER report:', error);
    res.status(500).json({ error: 'Failed to delete CER report' });
  } finally {
    client.release();
  }
});

// Get a specific section of a report
router.get('/reports/:reportId/sections/:sectionId', async (req, res) => {
  try {
    const { reportId, sectionId } = req.params;

    const query = 'SELECT * FROM cer_sections WHERE report_id = $1 AND id = $2';
    const result = await pool.query(query, [reportId, sectionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching section:', error);
    res.status(500).json({ error: 'Failed to retrieve section' });
  }
});

// Update a section
router.put('/reports/:reportId/sections/:sectionId', async (req, res) => {
  try {
    const { reportId, sectionId } = req.params;
    const { content, status } = req.body;

    const query = `
      UPDATE cer_sections 
      SET 
        content = COALESCE($1, content),
        status = COALESCE($2, status),
        updated_at = NOW()
      WHERE report_id = $3 AND id = $4
      RETURNING *
    `;

    const values = [content, status, reportId, sectionId];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }

    // Update the report's updated_at timestamp
    await pool.query('UPDATE cer_reports SET updated_at = NOW() WHERE id = $1', [reportId]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating section:', error);
    res.status(500).json({ error: 'Failed to update section' });
  }
});

// Generate content for a section using AI
router.post('/reports/:reportId/sections/:sectionId/generate', checkApiKey, async (req, res) => {
  try {
    const { reportId, sectionId } = req.params;

    // Get report and section details
    const reportQuery = 'SELECT * FROM cer_reports WHERE id = $1';
    const reportResult = await pool.query(reportQuery, [reportId]);

    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = reportResult.rows[0];

    const sectionQuery = 'SELECT * FROM cer_sections WHERE report_id = $1 AND id = $2';
    const sectionResult = await pool.query(sectionQuery, [reportId, sectionId]);

    if (sectionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }

    const section = sectionResult.rows[0];

    // Get product details if available
    let productDetails = null;
    if (report.product_id) {
      const productQuery = 'SELECT * FROM cer_products WHERE id = $1';
      const productResult = await pool.query(productQuery, [report.product_id]);

      if (productResult.rows.length > 0) {
        productDetails = productResult.rows[0];
      }
    }

    // Generate content with OpenAI
    const sectionPrompt = `
    Generate a detailed and professional content for the "${section.title}" section of a Clinical Evaluation Report (CER).
    
    Report Title: ${report.title}
    Report Status: ${report.status}
    ${productDetails ? `Product: ${productDetails.name} (${productDetails.identifier})` : ''}
    ${report.date_range_start ? `Date Range: ${report.date_range_start} to ${report.date_range_end}` : ''}
    
    Section Purpose: ${section.description || 'Provide a comprehensive overview of the section topic.'}
    Regulatory Framework: ${section.regulatory_framework || 'FDA'}
    
    Requirements:
    - Follow ${section.regulatory_framework || 'FDA'} guidelines for this section
    - Use formal, scientific language appropriate for regulatory submission
    - Maintain an objective, evidence-based tone
    - Include appropriate section headers and subheaders for organization
    - Be comprehensive yet concise
    - Highlight any areas where additional data might be needed
    
    Generated content should be ready for review by regulatory affairs professionals.
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content:
            'You are a regulatory affairs expert specializing in medical device and pharmaceutical regulatory documentation. You create detailed, accurate, and compliant content for Clinical Evaluation Reports.',
        },
        {
          role: 'user',
          content: sectionPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2500,
    });

    const generatedContent = completion.choices[0].message.content;

    // Update the section with the generated content
    const updateQuery = `
      UPDATE cer_sections 
      SET 
        content = $1,
        status = 'generated',
        updated_at = NOW()
      WHERE report_id = $2 AND id = $3
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, [generatedContent, reportId, sectionId]);

    // Update the report's updated_at timestamp
    await pool.query('UPDATE cer_reports SET updated_at = NOW() WHERE id = $1', [reportId]);

    res.json({
      section: updateResult.rows[0],
      content: generatedContent,
    });
  } catch (error) {
    console.error('Error generating section content:', error);
    res.status(500).json({ error: 'Failed to generate section content' });
  }
});

// Analyze content with AI
router.post('/analyze', checkApiKey, async (req, res) => {
  try {
    const { report_id, section_id, analysis_type } = req.body;

    // Get section content
    const sectionQuery = 'SELECT * FROM cer_sections WHERE report_id = $1 AND id = $2';
    const sectionResult = await pool.query(sectionQuery, [report_id, section_id]);

    if (sectionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }

    const section = sectionResult.rows[0];

    if (!section.content) {
      return res.status(400).json({ error: 'Section has no content to analyze' });
    }

    // Generate prompt based on analysis type
    let analysisPrompt = '';
    switch (analysis_type) {
      case 'completeness':
        analysisPrompt = `
        Analyze the following Clinical Evaluation Report section for completeness.
        
        Section Title: ${section.title}
        Regulatory Framework: ${section.regulatory_framework || 'FDA'}
        
        Content to analyze:
        ${section.content.substring(0, 2000)}
        
        Provide an analysis with:
        1. An overall score from 0-100 based on completeness
        2. A brief summary of the completeness assessment (2-3 sentences)
        3. List of strengths (3-5 bullet points)
        4. List of weaknesses/areas that need more information (3-5 bullet points)
        5. Specific recommendations for improving completeness (3-5 bullet points)
        
        Format your response as a JSON object with the following structure:
        {
          "overall_score": [number between 0-100],
          "summary": "[summary text]",
          "strengths": ["strength 1", "strength 2", ...],
          "weaknesses": ["weakness 1", "weakness 2", ...],
          "recommendations": ["recommendation 1", "recommendation 2", ...]
        }
        `;
        break;

      case 'regulatory_compliance':
        analysisPrompt = `
        Analyze the following Clinical Evaluation Report section for regulatory compliance with ${section.regulatory_framework || 'FDA'} guidelines.
        
        Section Title: ${section.title}
        Regulatory Framework: ${section.regulatory_framework || 'FDA'}
        
        Content to analyze:
        ${section.content.substring(0, 2000)}
        
        Provide an analysis with:
        1. An overall compliance score from 0-100
        2. A brief summary of the compliance assessment (2-3 sentences)
        3. List of compliant elements (3-5 bullet points)
        4. List of potential compliance issues (3-5 bullet points)
        5. Specific recommendations for improving compliance (3-5 bullet points)
        
        Format your response as a JSON object with the following structure:
        {
          "overall_score": [number between 0-100],
          "summary": "[summary text]",
          "strengths": ["strength 1", "strength 2", ...],
          "weaknesses": ["weakness 1", "weakness 2", ...],
          "recommendations": ["recommendation 1", "recommendation 2", ...]
        }
        `;
        break;

      case 'clarity':
        analysisPrompt = `
        Analyze the following Clinical Evaluation Report section for clarity, readability, and professional quality.
        
        Section Title: ${section.title}
        
        Content to analyze:
        ${section.content.substring(0, 2000)}
        
        Provide an analysis with:
        1. An overall clarity score from 0-100
        2. A brief summary of the clarity assessment (2-3 sentences)
        3. List of well-written elements (3-5 bullet points)
        4. List of areas that could be improved for clarity (3-5 bullet points)
        5. Specific recommendations for improving clarity (3-5 bullet points)
        
        Format your response as a JSON object with the following structure:
        {
          "overall_score": [number between 0-100],
          "summary": "[summary text]",
          "strengths": ["strength 1", "strength 2", ...],
          "weaknesses": ["weakness 1", "weakness 2", ...],
          "recommendations": ["recommendation 1", "recommendation 2", ...]
        }
        `;
        break;

      default:
        return res.status(400).json({ error: 'Invalid analysis type' });
    }

    // Generate analysis with OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content:
            'You are a regulatory affairs expert specializing in Clinical Evaluation Reports. You analyze CER content for quality, completeness, and compliance.',
        },
        {
          role: 'user',
          content: analysisPrompt,
        },
      ],
      temperature: 0.5,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const analysisResult = JSON.parse(completion.choices[0].message.content);

    // Save analysis result to database
    const saveAnalysisQuery = `
      INSERT INTO cer_analysis_results
        (report_id, section_id, analysis_type, score, summary, strengths, weaknesses, recommendations)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    await pool.query(saveAnalysisQuery, [
      report_id,
      section_id,
      analysis_type,
      analysisResult.overall_score,
      analysisResult.summary,
      JSON.stringify(analysisResult.strengths),
      JSON.stringify(analysisResult.weaknesses),
      JSON.stringify(analysisResult.recommendations),
    ]);

    res.json({
      analysis: analysisResult,
    });
  } catch (error) {
    console.error('Error analyzing content:', error);
    res.status(500).json({ error: 'Failed to analyze content' });
  }
});

// Get regulatory guidelines
router.get('/regulatory-guidelines', async (req, res) => {
  try {
    const { framework, section_key } = req.query;

    let query = 'SELECT * FROM cer_regulatory_guidelines WHERE 1=1';
    const queryParams = [];

    if (framework) {
      query += ` AND regulatory_authority = $${queryParams.length + 1}`;
      queryParams.push(framework);
    }

    if (section_key) {
      query += ` AND section_key = $${queryParams.length + 1}`;
      queryParams.push(section_key);
    }

    const result = await pool.query(query, queryParams);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching regulatory guidelines:', error);
    res.status(500).json({ error: 'Failed to retrieve regulatory guidelines' });
  }
});

// Get CER templates
router.get('/templates', async (req, res) => {
  try {
    const query = 'SELECT * FROM cer_templates';
    const result = await pool.query(query);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching CER templates:', error);
    res.status(500).json({ error: 'Failed to retrieve CER templates' });
  }
});

// Get CER products
router.get('/products', async (req, res) => {
  try {
    const query = 'SELECT * FROM cer_products';
    const result = await pool.query(query);

    res.json({ products: result.rows });
  } catch (error) {
    console.error('Error fetching CER products:', error);
    res.status(500).json({ error: 'Failed to retrieve CER products' });
  }
});

// AI Co-pilot endpoint
router.post('/ai-copilot', checkApiKey, async (req, res) => {
  try {
    const { message, history, report_id, section_id } = req.body;

    // Get additional context if report_id and section_id are provided
    let contextPrompt = '';

    if (report_id && section_id) {
      // Get report details
      const reportQuery = 'SELECT * FROM cer_reports WHERE id = $1';
      const reportResult = await pool.query(reportQuery, [report_id]);

      if (reportResult.rows.length > 0) {
        const report = reportResult.rows[0];

        // Get section details
        const sectionQuery = 'SELECT * FROM cer_sections WHERE report_id = $1 AND id = $2';
        const sectionResult = await pool.query(sectionQuery, [report_id, section_id]);

        if (sectionResult.rows.length > 0) {
          const section = sectionResult.rows[0];

          contextPrompt = `
          You are assisting with a Clinical Evaluation Report (CER) with the following details:
          
          Report Title: ${report.title}
          Report Status: ${report.status}
          Current Section: ${section.title}
          Regulatory Framework: ${section.regulatory_framework || 'FDA'}
          
          The user is currently working on the "${section.title}" section of this CER report.
          `;
        }
      }
    }

    // Convert history array to OpenAI format
    const messageHistory = history.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    // Add the context as a system message if available
    if (contextPrompt) {
      messageHistory.unshift({
        role: 'system',
        content: contextPrompt,
      });
    } else {
      messageHistory.unshift({
        role: 'system',
        content:
          'You are an AI co-pilot for Clinical Evaluation Reports. You provide expert guidance on regulatory requirements, content structure, and best practices for CER documentation.',
      });
    }

    // Add the new user message
    messageHistory.push({
      role: 'user',
      content: message,
    });

    // Generate response with OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: messageHistory,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const response = completion.choices[0].message.content;

    // Save the conversation to the database
    const saveConversationQuery = `
      INSERT INTO cer_ai_conversations
        (report_id, section_id, user_message, ai_response)
      VALUES
        ($1, $2, $3, $4)
    `;

    await pool.query(saveConversationQuery, [
      report_id || null,
      section_id || null,
      message,
      response,
    ]);

    res.json({
      response,
    });
  } catch (error) {
    console.error('Error communicating with AI co-pilot:', error);
    res.status(500).json({ error: 'Failed to get AI co-pilot response' });
  }
});

// Export report as PDF
router.get('/reports/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;

    // Get report details
    const reportQuery = 'SELECT * FROM cer_reports WHERE id = $1';
    const reportResult = await pool.query(reportQuery, [id]);

    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = reportResult.rows[0];

    // Get sections
    const sectionsQuery = 'SELECT * FROM cer_sections WHERE report_id = $1 ORDER BY section_order';
    const sectionsResult = await pool.query(sectionsQuery, [id]);

    const sections = sectionsResult.rows;

    // Generate PDF file path
    const fileName = `CER_${report.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${id}.pdf`;
    const filePath = path.join('./uploads/cer/reports', fileName);

    // For now, return a success message
    // In a real implementation, this would generate a PDF and stream it to the client
    res.json({
      message: 'PDF export successfully initiated',
      fileName,
      report_id: id,
    });
  } catch (error) {
    console.error('Error exporting PDF:', error);
    res.status(500).json({ error: 'Failed to export PDF' });
  }
});

module.exports = router;

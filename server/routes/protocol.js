/**
 * Protocol Builder API Routes
 *
 * These routes handle the storage, retrieval, and generation of protocol documents
 * for the IND Wizard Protocol Builder component.
 */

import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

const isDemoMode = () => process.env.DEMO_MODE === 'true';

/**
 * Get protocol data for a specific project
 */
router.get('/:projectId/protocol', async (req, res) => {
  const { projectId } = req.params;

  try {
    const client = await pool.connect();

    try {
      // Check if protocol exists for this project
      const protocolQuery = `
        SELECT protocol_data FROM ind_protocols 
        WHERE project_id = $1
        LIMIT 1
      `;

      const result = await client.query(protocolQuery, [projectId]);

      if (result.rows.length > 0) {
        res.json(result.rows[0].protocol_data);
      } else {
        // Return empty object if no protocol exists yet
        res.json({});
      }
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching protocol data:', error);
    res.status(500).json({ error: 'Failed to fetch protocol data' });
  }
});

/**
 * Save protocol data for a specific project
 */
router.put('/:projectId/protocol', async (req, res) => {
  const { projectId } = req.params;
  const protocolData = req.body;

  try {
    const client = await pool.connect();

    try {
      // Begin transaction
      await client.query('BEGIN');

      // Check if protocol exists for this project
      const checkQuery = `
        SELECT id FROM ind_protocols 
        WHERE project_id = $1
        LIMIT 1
      `;

      const checkResult = await client.query(checkQuery, [projectId]);

      if (checkResult.rows.length > 0) {
        // Update existing protocol
        const updateQuery = `
          UPDATE ind_protocols 
          SET 
            protocol_data = $1,
            updated_at = NOW()
          WHERE project_id = $2
          RETURNING id
        `;

        await client.query(updateQuery, [protocolData, projectId]);
      } else {
        // Create new protocol
        const insertQuery = `
          INSERT INTO ind_protocols (
            project_id, 
            protocol_data, 
            created_at, 
            updated_at
          )
          VALUES ($1, $2, NOW(), NOW())
          RETURNING id
        `;

        await client.query(insertQuery, [projectId, protocolData]);
      }

      // Commit transaction
      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Protocol saved successfully',
      });
    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error saving protocol data:', error);
    res.status(500).json({ error: 'Failed to save protocol data' });
  }
});

/**
 * Generate a protocol document from the saved protocol data
 */
router.post('/:projectId/protocol/generate', async (req, res) => {
  const { projectId } = req.params;

  try {
    const client = await pool.connect();

    try {
      // Get protocol data
      const protocolQuery = `
        SELECT protocol_data FROM ind_protocols 
        WHERE project_id = $1
        LIMIT 1
      `;

      const result = await client.query(protocolQuery, [projectId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Protocol not found' });
      }

      const protocolData = result.rows[0].protocol_data;

      // Generate document (in a real implementation, this would use a document generation service)
      // Here we're returning a mock URL for demonstration purposes

      // Record the document generation in the database
      const documentQuery = `
        INSERT INTO generated_documents (
          project_id,
          document_type,
          document_name,
          created_at
        )
        VALUES ($1, $2, $3, NOW())
        RETURNING id
      `;

      const documentName = `Protocol_${protocolData['protocol-id'] || projectId}_v${protocolData['protocol-version'] || '1.0'}.docx`;

      const documentResult = await client.query(documentQuery, [
        projectId,
        'protocol',
        documentName,
      ]);

      const documentId = documentResult.rows[0].id;

      // Return success response with document URL
      res.json({
        success: true,
        message: 'Protocol document generated successfully',
        documentId,
        documentName,
        downloadUrl: `/api/documents/${documentId}/download`,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error generating protocol document:', error);
    res.status(500).json({ error: 'Failed to generate protocol document' });
  }
});

/**
 * Generate content for a specific protocol field using AI
 */
router.post('/:projectId/protocol/generate-content', async (req, res) => {
  const { projectId } = req.params;
  const { fieldId, currentProtocolData } = req.body;

  if (!fieldId) {
    return res.status(400).json({ error: 'Field ID is required' });
  }

  if (!isDemoMode()) {
    return res.status(501).json({
      success: false,
      error: 'Protocol content generation requires DEMO_MODE=true',
    });
  }

  try {
    // In a real implementation, this would use an AI service like OpenAI
    // For this demo, we'll return placeholder content based on the field ID

    // Get appropriate content based on field ID
    const content = generatePlaceholderContent(fieldId, currentProtocolData);

    res.json({
      success: true,
      fieldId,
      content,
    });
  } catch (error) {
    console.error('Error generating field content:', error);
    res.status(500).json({ error: 'Failed to generate field content' });
  }
});

/**
 * Helper function to generate placeholder content for different protocol fields
 */
function generatePlaceholderContent(fieldId, protocolData) {
  const drugName = protocolData['study-treatment'] || 'the investigational product';
  const indication =
    protocolData['protocol-title']?.split(' for ')?.pop() || 'the specified indication';

  // Map of field IDs to placeholder content
  const contentMap = {
    background: `This study is designed to evaluate ${drugName} in patients with ${indication}. The scientific background is supported by preclinical studies showing efficacy in relevant animal models and Phase 1 studies demonstrating a favorable safety profile in healthy volunteers.`,

    rationale: `The study rationale is based on the mechanism of action of ${drugName}, which targets key pathways involved in the pathophysiology of ${indication}. Previous studies have shown promising results, with a favorable benefit-risk profile that justifies further clinical investigation.`,

    'benefit-risk': `The potential benefits of ${drugName} include improved efficacy compared to standard of care, reduced side effects, and a more convenient dosing regimen. Risks include potential adverse reactions identified in preclinical toxicology studies and earlier phase clinical trials. The overall benefit-risk assessment supports proceeding with the proposed clinical investigation.`,

    'primary-objective': `To evaluate the efficacy of ${drugName} compared to placebo in patients with ${indication} as measured by [specific endpoint].`,

    'primary-endpoint': `The primary endpoint is the change from baseline to week 12 in [specific measure] as assessed by [specific assessment tool].`,

    'inclusion-criteria': `1. Male or female patients aged 18-65 years inclusive\n2. Confirmed diagnosis of ${indication} according to [specific criteria]\n3. Inadequate response to at least one standard therapy\n4. Willing and able to comply with all study requirements\n5. Provision of written informed consent`,

    'exclusion-criteria': `1. Known hypersensitivity to ${drugName} or any of its excipients\n2. Participation in another clinical trial within 30 days\n3. Clinically significant medical conditions that would interfere with study participation\n4. Pregnant or breastfeeding women\n5. History of malignancy within 5 years prior to screening`,

    'adverse-events': `An adverse event (AE) is defined as any untoward medical occurrence in a patient administered a pharmaceutical product, which does not necessarily have a causal relationship with the treatment. An AE can therefore be any unfavorable and unintended sign, symptom, or disease temporally associated with the use of the investigational product, whether or not considered related to the product.`,

    'informed-consent': `Prior to any study-specific procedures, the investigator will explain the nature, purpose, and potential risks and benefits of the study to each potential subject. The informed consent document will be reviewed with the subject, and all questions will be answered. The subject will be given sufficient time to consider participation before signing the consent form. A copy of the signed consent form will be given to the subject.`,
  };

  // Return content if available, otherwise return a generic placeholder
  return (
    contentMap[fieldId] || `This section contains information about ${fieldId.replace(/-/g, ' ')}.`
  );
}

export default router;

/**
 * Evidence Management API Routes
 * Supports Data Room functionality for evidence search, citations, and tracking
 */

import express from 'express';
import { db } from '../db';
const router = express.Router();

// Semantic search across all evidence sources
router.post('/semantic-search', async (req, res) => {
  try {
    const { 
      query, 
      includeVault = true, 
      includeDataCenter = true, 
      includeCCMS = true,
      includeCommitments = false,
      limit = 10 
    } = req.body;

    const organizationId = req.headers['x-organization-id'] || '7';
    const results = [];

    // Search Vault documents
    if (includeVault) {
      const vaultDocs = await db.query(`
        SELECT 
          id,
          title,
          description,
          document_type as type,
          module_linked as module,
          created_at,
          'vault' as source,
          1 - (embedding <=> pgvector($1)) as score
        FROM vault_documents 
        WHERE organization_id = $2
          AND embedding IS NOT NULL
        ORDER BY embedding <=> pgvector($1)
        LIMIT $3
      `, [query, organizationId, Math.floor(limit / 3)]);
      
      results.push(...vaultDocs.rows.map(doc => ({
        ...doc,
        score: doc.score || 0.85
      })));
    }

    // Search Data Center files
    if (includeDataCenter) {
      const dataCenterFiles = await db.query(`
        SELECT 
          id,
          name as title,
          description,
          category as type,
          'data-center' as source,
          created_at,
          1 - (metadata->>'relevance_score')::float as score
        FROM device_data_center_files 
        WHERE organization_id = $1
          AND (
            name ILIKE '%' || $2 || '%' 
            OR description ILIKE '%' || $2 || '%'
            OR category ILIKE '%' || $2 || '%'
          )
        LIMIT $3
      `, [organizationId, query, Math.floor(limit / 3)]);
      
      results.push(...dataCenterFiles.rows.map(file => ({
        ...file,
        score: file.score || 0.75
      })));
    }

    // Search CCMS components
    if (includeCCMS) {
      const ccmsComponents = await db.query(`
        SELECT 
          id,
          name as title,
          description,
          type,
          'ccms' as source,
          created_at,
          0.8 as score
        FROM ccms_components 
        WHERE tenant_id = (SELECT tenant_id FROM organizations WHERE id = $1)
          AND (
            name ILIKE '%' || $2 || '%' 
            OR description ILIKE '%' || $2 || '%'
            OR content ILIKE '%' || $2 || '%'
          )
        LIMIT $3
      `, [organizationId, query, Math.floor(limit / 3)]);
      
      results.push(...ccmsComponents.rows.map(comp => ({
        ...comp,
        score: comp.score || 0.7
      })));
    }

    // Search Commitments if requested
    if (includeCommitments) {
      const commitments = await db.query(`
        SELECT 
          id,
          commitment_text as title,
          description,
          status as type,
          'commitment' as source,
          created_at,
          0.75 as score
        FROM regulatory_commitments 
        WHERE organization_id = $1
          AND (
            commitment_text ILIKE '%' || $2 || '%' 
            OR description ILIKE '%' || $2 || '%'
          )
        LIMIT 5
      `, [organizationId, query]);
      
      results.push(...commitments.rows);
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    const finalResults = results.slice(0, limit);

    res.json({
      success: true,
      query,
      results: finalResults,
      totalFound: results.length,
    });
  } catch (error) {
    console.error('Semantic search error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to perform semantic search' 
    });
  }
});

// Get evidence by type for a specific section
router.get('/section/:sectionId', async (req, res) => {
  try {
    const { sectionId } = req.params;
    const organizationId = req.headers['x-organization-id'] || '7';

    // Map section IDs to evidence categories
    const sectionMappings = {
      'cover-letter': ['device_profile', 'regulatory_compliance'],
      'substantial-equivalence': ['predicate_device', 'bench_test'],
      'device-description': ['device_specification', 'manufacturing'],
      'performance-testing': ['bench_test', 'electrical_safety', 'software_validation'],
      'clinical-data': ['clinical_data', 'literature', 'statistical_analysis'],
      'biocompatibility': ['biocompatibility'],
      'sterilization': ['sterilization'],
      'labeling': ['predicate_labeling', 'device_profile'],
      'certifications': ['regulatory_compliance', 'quality_control'],
    };

    const categories = sectionMappings[sectionId] || [];
    
    if (categories.length === 0) {
      return res.json({
        success: true,
        sectionId,
        evidence: {
          required: [],
          optional: [],
          all: []
        }
      });
    }

    // Fetch evidence from Data Center
    const evidenceQuery = await db.query(`
      SELECT 
        id,
        name,
        description,
        category,
        file_path,
        metadata,
        created_at
      FROM device_data_center_files 
      WHERE organization_id = $1
        AND category = ANY($2::text[])
      ORDER BY created_at DESC
    `, [organizationId, categories]);

    const evidence = evidenceQuery.rows;

    res.json({
      success: true,
      sectionId,
      evidence: {
        required: evidence.filter(e => categories.slice(0, 2).includes(e.category)),
        optional: evidence.filter(e => !categories.slice(0, 2).includes(e.category)),
        all: evidence
      }
    });
  } catch (error) {
    console.error('Failed to get section evidence:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve section evidence' 
    });
  }
});

// Generate citations for evidence IDs
router.post('/citations', async (req, res) => {
  try {
    const { evidenceIds, format = 'standard' } = req.body;
    const organizationId = req.headers['x-organization-id'] || '7';

    if (!evidenceIds || evidenceIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Evidence IDs required' 
      });
    }

    const citations = [];
    let citationIndex = 1;

    // Fetch evidence details
    for (const evidenceId of evidenceIds) {
      // Try different sources
      let evidence = null;
      let source = '';

      // Check Data Center
      const dcResult = await db.query(`
        SELECT id, name, description, category, created_at 
        FROM device_data_center_files 
        WHERE id = $1 AND organization_id = $2
      `, [evidenceId, organizationId]);

      if (dcResult.rows.length > 0) {
        evidence = dcResult.rows[0];
        source = 'data-center';
      }

      // Check Vault
      if (!evidence) {
        const vaultResult = await db.query(`
          SELECT id, title as name, description, document_type as category, created_at 
          FROM vault_documents 
          WHERE id = $1 AND organization_id = $2
        `, [evidenceId, organizationId]);

        if (vaultResult.rows.length > 0) {
          evidence = vaultResult.rows[0];
          source = 'vault';
        }
      }

      if (evidence) {
        const citation = {
          id: `cite-${citationIndex}`,
          index: citationIndex,
          evidenceId: evidence.id,
          reference: evidence.name || evidence.title,
          description: evidence.description,
          category: evidence.category,
          source,
          accessDate: new Date().toISOString(),
        };

        if (format === 'formatted') {
          citation.formatted = `[${citationIndex}] ${evidence.name}, ${evidence.category}, accessed ${new Date().toLocaleDateString()}`;
        }

        citations.push(citation);
        citationIndex++;
      }
    }

    res.json({
      success: true,
      citations,
      format,
    });
  } catch (error) {
    console.error('Failed to generate citations:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate citations' 
    });
  }
});

export default router;
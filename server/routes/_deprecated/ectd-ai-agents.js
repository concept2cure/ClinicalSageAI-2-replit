/**
 * eCTD AI Agents Integration Routes
 *
 * This module provides API endpoints for the three enhanced AI agents:
 * 1. Enhanced Section Generation (generateSection.py)
 * 2. Traceability Indexer (traceability_indexer.py)
 * 3. Conflict Checker (conflict_checker.py)
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

const router = express.Router();

/**
 * Enhanced Section Generation Endpoint
 * Uses the generateSection.py agent for LLM + source-based generation
 */
router.post('/generate-section', async (req, res) => {
  try {
    const { section_type, documents, requirements, compliance_region } = req.body;

    console.log('🎯 Enhanced Section Generation Request:', {
      section_type,
      documents_count: documents?.length || 0,
      compliance_region,
    });

    // Prepare data for Python agent
    const inputData = {
      section_type,
      documents: documents || [],
      requirements: requirements || {},
      compliance_region: compliance_region || 'FDA',
    };

    // Call the generateSection.py agent
    const pythonProcess = spawn('python3', [
      path.join(__dirname, '../../generateSection.py'),
      '--input',
      JSON.stringify(inputData),
    ]);

    let outputData = '';
    let errorData = '';

    pythonProcess.stdout.on('data', data => {
      outputData += data.toString();
    });

    pythonProcess.stderr.on('data', data => {
      errorData += data.toString();
    });

    pythonProcess.on('close', code => {
      if (code === 0) {
        try {
          const result = JSON.parse(outputData);
          console.log('✅ Section generation completed successfully');
          res.json({
            success: true,
            section_id: result.section_id,
            section_title: result.section_title,
            content: result.content,
            source_references: result.source_references,
            quality_score: result.quality_score,
            regulatory_compliance_score: result.regulatory_compliance_score,
            timestamp: result.timestamp,
          });
        } catch (parseError) {
          console.error('❌ Error parsing section generation result:', parseError);
          res.status(500).json({
            success: false,
            error: 'Failed to parse generation result',
            details: parseError.message,
          });
        }
      } else {
        console.error('❌ Section generation failed:', errorData);
        res.status(500).json({
          success: false,
          error: 'Section generation process failed',
          details: errorData,
        });
      }
    });
  } catch (error) {
    console.error('❌ Enhanced section generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during section generation',
      details: error.message,
    });
  }
});

/**
 * Traceability Indexing Endpoint
 * Uses the traceability_indexer.py agent for comprehensive source tracking
 */
router.post('/index-traceability', async (req, res) => {
  try {
    const { section_id, section_title, content, source_documents, ectd_context } = req.body;

    console.log('🔗 Traceability Indexing Request:', {
      section_id,
      section_title,
      content_length: content?.length || 0,
      source_documents_count: source_documents?.length || 0,
      ectd_module: ectd_context?.module,
    });

    // Prepare data for Python agent
    const inputData = {
      section_id,
      section_title,
      content,
      source_documents: source_documents || [],
      ectd_context: ectd_context || {},
    };

    // Call the traceability_indexer.py agent
    const pythonProcess = spawn('python3', [
      path.join(__dirname, '../../traceability_indexer.py'),
      '--input',
      JSON.stringify(inputData),
    ]);

    let outputData = '';
    let errorData = '';

    pythonProcess.stdout.on('data', data => {
      outputData += data.toString();
    });

    pythonProcess.stderr.on('data', data => {
      errorData += data.toString();
    });

    pythonProcess.on('close', code => {
      if (code === 0) {
        try {
          const result = JSON.parse(outputData);
          console.log('✅ Traceability indexing completed successfully');
          res.json({
            success: true,
            section_id: result.section_id,
            section_title: result.section_title,
            content_references: result.content_references,
            dependency_map: result.dependency_map,
            quality_metrics: result.quality_metrics,
            compliance_status: result.compliance_status,
            last_updated: result.last_updated,
            version: result.version,
          });
        } catch (parseError) {
          console.error('❌ Error parsing traceability result:', parseError);
          res.status(500).json({
            success: false,
            error: 'Failed to parse traceability result',
            details: parseError.message,
          });
        }
      } else {
        console.error('❌ Traceability indexing failed:', errorData);
        res.status(500).json({
          success: false,
          error: 'Traceability indexing process failed',
          details: errorData,
        });
      }
    });
  } catch (error) {
    console.error('❌ Traceability indexing error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during traceability indexing',
      details: error.message,
    });
  }
});

/**
 * Conflict Detection Endpoint
 * Uses the conflict_checker.py agent for source contradiction analysis
 */
router.post('/check-conflicts', async (req, res) => {
  try {
    const { documents, scope } = req.body;

    console.log('⚠️ Conflict Detection Request:', {
      documents_count: documents?.length || 0,
      analysis_scope: scope,
    });

    // Prepare data for Python agent
    const inputData = {
      documents: documents || [],
      scope: scope || 'submission',
    };

    // Call the conflict_checker.py agent
    const pythonProcess = spawn('python3', [
      path.join(__dirname, '../../conflict_checker.py'),
      '--input',
      JSON.stringify(inputData),
    ]);

    let outputData = '';
    let errorData = '';

    pythonProcess.stdout.on('data', data => {
      outputData += data.toString();
    });

    pythonProcess.stderr.on('data', data => {
      errorData += data.toString();
    });

    pythonProcess.on('close', code => {
      if (code === 0) {
        try {
          const result = JSON.parse(outputData);
          console.log('✅ Conflict analysis completed successfully');
          res.json({
            success: true,
            analysis_id: result.analysis_id,
            scope: result.scope,
            total_conflicts: result.total_conflicts,
            critical_conflicts: result.critical_conflicts,
            major_conflicts: result.major_conflicts,
            minor_conflicts: result.minor_conflicts,
            conflicts: result.conflicts,
            overall_risk_score: result.overall_risk_score,
            recommendations: result.recommendations,
            analysis_timestamp: result.analysis_timestamp,
          });
        } catch (parseError) {
          console.error('❌ Error parsing conflict analysis result:', parseError);
          res.status(500).json({
            success: false,
            error: 'Failed to parse conflict analysis result',
            details: parseError.message,
          });
        }
      } else {
        console.error('❌ Conflict analysis failed:', errorData);
        res.status(500).json({
          success: false,
          error: 'Conflict analysis process failed',
          details: errorData,
        });
      }
    });
  } catch (error) {
    console.error('❌ Conflict detection error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during conflict detection',
      details: error.message,
    });
  }
});

/**
 * Get Generation History
 * Retrieve history of enhanced section generations
 */
router.get('/generation-history', async (req, res) => {
  try {
    // This would typically fetch from a database
    // For now, return a simple response structure
    res.json({
      success: true,
      history: [],
      message: 'Generation history endpoint ready',
    });
  } catch (error) {
    console.error('❌ Error fetching generation history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch generation history',
      details: error.message,
    });
  }
});

/**
 * Get Traceability Reports
 * Retrieve comprehensive traceability reports
 */
router.get('/traceability-reports', async (req, res) => {
  try {
    // This would typically fetch from a database
    // For now, return a simple response structure
    res.json({
      success: true,
      reports: [],
      message: 'Traceability reports endpoint ready',
    });
  } catch (error) {
    console.error('❌ Error fetching traceability reports:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch traceability reports',
      details: error.message,
    });
  }
});

/**
 * Get Conflict Summary
 * Retrieve summary of all conflict analyses
 */
router.get('/conflict-summary', async (req, res) => {
  try {
    // This would typically fetch from a database
    // For now, return a simple response structure
    res.json({
      success: true,
      summary: {
        total_analyses: 0,
        critical_conflicts: 0,
        major_conflicts: 0,
        minor_conflicts: 0,
      },
      message: 'Conflict summary endpoint ready',
    });
  } catch (error) {
    console.error('❌ Error fetching conflict summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conflict summary',
      details: error.message,
    });
  }
});

export default router;

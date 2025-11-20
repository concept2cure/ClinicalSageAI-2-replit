import express from 'express';
import ContextAwareGuidanceService from '../services/contextAwareGuidance.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * Get contextual guidance for specific eCTD module/section
 */
router.post('/guidance', async (req, res) => {
  try {
    const { moduleId, sectionId, currentContent, documentType } = req.body;

    if (!moduleId) {
      return res.status(400).json({
        success: false,
        error: 'Module ID is required',
      });
    }

    const guidance = await ContextAwareGuidanceService.getContextualGuidance(
      moduleId,
      sectionId,
      currentContent,
      documentType
    );

    res.json(guidance);
  } catch (error) {
    logger.error('Contextual guidance API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate contextual guidance',
    });
  }
});

/**
 * Real-time content analysis
 */
router.post('/analyze-realtime', async (req, res) => {
  try {
    const { content, moduleId, sectionId } = req.body;

    const context = ContextAwareGuidanceService.buildModuleContext(moduleId, sectionId);
    const analysis = await ContextAwareGuidanceService.analyzeContentRealTime(content, context);

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    logger.error('Real-time analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Analysis failed',
    });
  }
});

/**
 * Get inline recommendations for content improvement
 */
router.post('/inline-recommendations', async (req, res) => {
  try {
    const { content, moduleId, sectionId, cursorPosition } = req.body;

    const context = ContextAwareGuidanceService.buildModuleContext(moduleId, sectionId);
    const recommendations = await ContextAwareGuidanceService.getInlineRecommendations(
      content,
      context
    );

    res.json({
      success: true,
      recommendations,
      context,
    });
  } catch (error) {
    logger.error('Inline recommendations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate recommendations',
    });
  }
});

/**
 * Get historical FDA comments for specific section
 */
router.get('/historical-comments/:moduleId/:sectionId?', async (req, res) => {
  try {
    const { moduleId, sectionId } = req.params;

    const comments = ContextAwareGuidanceService.getHistoricalComments(moduleId, sectionId);
    const context = ContextAwareGuidanceService.buildModuleContext(moduleId, sectionId);

    res.json({
      success: true,
      comments,
      context,
      totalComments: comments.length,
    });
  } catch (error) {
    logger.error('Historical comments error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve historical comments',
    });
  }
});

export default router;

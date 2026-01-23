/**
 * Section Order API Routes
 *
 * These routes handle retrieving and saving custom section ordering:
 * - GET retrieves ordered sections for a submission
 * - PUT saves a new custom order (bulk update)
 */

import { Router } from 'express';
import { verifyJwt } from '../middleware/auth.cjs';
import { supabase } from '../lib/supabaseClient.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * @route GET /api/sections/order/:submissionId
 * @description Get ordered list of sections for a submission
 * @access Private
 */
router.get('/:submissionId', verifyJwt, async (req, res) => {
  try {
    const { submissionId } = req.params;

    // Verify the submission exists and user has access
    const { data: submission, error: submissionError } = await supabase
      .from('ind_wizards')
      .select('id')
      .eq('id', submissionId)
      .single();

    if (submissionError || !submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Get the ordered sections
    const { data, error } = await supabase
      .from('ind_section_order')
      .select('*')
      .eq('submission_id', submissionId)
      .order('sort_index');

    if (error) {
      logger.error(`Error fetching section order: ${error.message}`, error);
      return res.status(500).json({ message: 'Error fetching section order' });
    }

    res.json(data);
  } catch (err) {
    logger.error(`Error in get section order: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route PUT /api/sections/order/:submissionId
 * @description Save new order for sections (bulk update)
 * @access Private
 */
router.put('/:submissionId', verifyJwt, async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { order } = req.body;

    if (!Array.isArray(order)) {
      return res.status(400).json({ message: 'Order must be an array of section codes' });
    }

    // Verify the submission exists and user has access
    const { data: submission, error: submissionError } = await supabase
      .from('ind_wizards')
      .select('id')
      .eq('id', submissionId)
      .single();

    if (submissionError || !submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Create upsert array
    const upserts = order.map((sectionCode, index) => ({
      submission_id: submissionId,
      section_code: sectionCode,
      sort_index: index,
      updated_at: new Date().toISOString(),
      updated_by: req.user.id,
    }));

    // First delete existing order
    const { error: deleteError } = await supabase
      .from('ind_section_order')
      .delete()
      .eq('submission_id', submissionId);

    if (deleteError) {
      logger.error(`Error deleting existing section order: ${deleteError.message}`, deleteError);
      return res.status(500).json({ message: 'Error updating section order' });
    }

    // Insert new order
    const { error: insertError } = await supabase.from('ind_section_order').insert(upserts);

    if (insertError) {
      logger.error(`Error inserting new section order: ${insertError.message}`, insertError);
      return res.status(500).json({ message: 'Error updating section order' });
    }

    // Log the reordering event
    await supabase.from('activity_log').insert({
      user_id: req.user.id,
      action: 'SECTION_REORDER',
      entity_type: 'submission',
      entity_id: submissionId,
      details: {
        order_count: order.length,
        sections: order,
      },
    });

    res.json({
      success: true,
      message: 'Section order updated successfully',
      order_count: order.length,
    });
  } catch (err) {
    logger.error(`Error in update section order: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/sections/order/:submissionId/default
 * @description Get default section order (for new submissions)
 * @access Private
 */
router.get('/:submissionId/default', verifyJwt, async (req, res) => {
  try {
    // Get section definitions in default order
    const { data, error } = await supabase
      .from('ind_section_definitions')
      .select('code, title, parent_code')
      .order('sort_order');

    if (error) {
      logger.error(`Error fetching default section order: ${error.message}`, error);
      return res.status(500).json({ message: 'Error fetching default section order' });
    }

    res.json(
      data.map(section => ({
        section_code: section.code,
        sort_index: data.findIndex(s => s.code === section.code),
        submission_id: req.params.submissionId,
        section_title: section.title,
        parent_code: section.parent_code,
      }))
    );
  } catch (err) {
    logger.error(`Error in get default section order: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/sections/order/:submissionId/reset
 * @description Reset to default order
 * @access Private
 */
router.post('/:submissionId/reset', verifyJwt, async (req, res) => {
  try {
    const { submissionId } = req.params;

    // Delete existing custom order
    const { error: deleteError } = await supabase
      .from('ind_section_order')
      .delete()
      .eq('submission_id', submissionId);

    if (deleteError) {
      logger.error(`Error resetting section order: ${deleteError.message}`, deleteError);
      return res.status(500).json({ message: 'Error resetting section order' });
    }

    // Log the reset event
    await supabase.from('activity_log').insert({
      user_id: req.user.id,
      action: 'SECTION_ORDER_RESET',
      entity_type: 'submission',
      entity_id: submissionId,
    });

    res.json({
      success: true,
      message: 'Section order reset to default',
    });
  } catch (err) {
    logger.error(`Error in reset section order: ${err.message}`, err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;

/**
 * Retention Policy API Routes
 *
 * This module handles the REST API endpoints for managing document retention policies,
 * including creation, retrieval, update, and deletion of policies, as well as
 * handling manual execution of the retention job.
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { validateBody, schemas } from '../middleware/validation.js';
import { logAction } from '../utils/audit-logger.js';
import { runRetentionJob } from '../jobs/retentionCron.js';

const router = express.Router();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Authentication middleware to ensure only authenticated users can access these routes
const authenticate = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required',
      timestamp: new Date().toISOString(),
    });
  }
  next();
};

// Authorization middleware to ensure only admins can manage retention policies
const authorizeAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'This action requires administrator privileges',
      timestamp: new Date().toISOString(),
    });
  }
  next();
};

/**
 * GET /api/retention/policies
 * Retrieve all retention policies
 */
router.get('/policies', authenticate, async (req, res) => {
  try {
    const { data: policies, error } = await supabase
      .from('retention_policies')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    res.json({
      status: 'success',
      data: policies,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API] Error fetching retention policies:', error.message);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/retention/policies/:id
 * Retrieve a specific retention policy
 */
router.get('/policies/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: policy, error } = await supabase
      .from('retention_policies')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!policy) {
      return res.status(404).json({
        status: 'error',
        message: 'Retention policy not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      status: 'success',
      data: policy,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API] Error fetching retention policy:', error.message);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/retention/policies
 * Create a new retention policy
 */
router.post(
  '/policies',
  authenticate,
  authorizeAdmin,
  validateBody(schemas.retentionPolicy),
  async (req, res) => {
    try {
      const policyData = req.validatedBody;

      // Check if a policy with the same name already exists
      const { data: existingPolicy, error: checkError } = await supabase
        .from('retention_policies')
        .select('id')
        .eq('policyName', policyData.policyName)
        .maybeSingle();

      if (checkError) {
        throw new Error(`Database error: ${checkError.message}`);
      }

      if (existingPolicy) {
        return res.status(409).json({
          status: 'error',
          message: 'A retention policy with this name already exists',
          timestamp: new Date().toISOString(),
        });
      }

      // Insert new policy
      const { data: newPolicy, error } = await supabase
        .from('retention_policies')
        .insert([
          {
            ...policyData,
            created_by: req.user.id,
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      // Log the action
      logAction({
        action: 'policy.create',
        userId: req.user.id,
        username: req.user.username,
        entityType: 'retention_policy',
        entityId: newPolicy.id,
        details: {
          policy_name: newPolicy.policyName,
          document_type: newPolicy.documentType,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.status(201).json({
        status: 'success',
        data: newPolicy,
        message: 'Retention policy created successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[API] Error creating retention policy:', error.message);
      res.status(500).json({
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * PUT /api/retention/policies/:id
 * Update an existing retention policy
 */
router.put(
  '/policies/:id',
  authenticate,
  authorizeAdmin,
  validateBody(schemas.retentionPolicy),
  async (req, res) => {
    try {
      const { id } = req.params;
      const policyData = req.validatedBody;

      // Check if policy exists
      const { data: existingPolicy, error: checkError } = await supabase
        .from('retention_policies')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (checkError) {
        throw new Error(`Database error: ${checkError.message}`);
      }

      if (!existingPolicy) {
        return res.status(404).json({
          status: 'error',
          message: 'Retention policy not found',
          timestamp: new Date().toISOString(),
        });
      }

      // Update policy
      const { data: updatedPolicy, error } = await supabase
        .from('retention_policies')
        .update({
          ...policyData,
          updated_by: req.user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      // Log the action
      logAction({
        action: 'policy.update',
        userId: req.user.id,
        username: req.user.username,
        entityType: 'retention_policy',
        entityId: id,
        details: {
          policy_name: updatedPolicy.policyName,
          document_type: updatedPolicy.documentType,
          changes: {
            before: existingPolicy,
            after: updatedPolicy,
          },
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        status: 'success',
        data: updatedPolicy,
        message: 'Retention policy updated successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[API] Error updating retention policy:', error.message);
      res.status(500).json({
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * DELETE /api/retention/policies/:id
 * Delete a retention policy
 */
router.delete('/policies/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if policy exists
    const { data: existingPolicy, error: checkError } = await supabase
      .from('retention_policies')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (checkError) {
      throw new Error(`Database error: ${checkError.message}`);
    }

    if (!existingPolicy) {
      return res.status(404).json({
        status: 'error',
        message: 'Retention policy not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Delete policy
    const { error } = await supabase.from('retention_policies').delete().eq('id', id);

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // Log the action
    logAction({
      action: 'policy.delete',
      userId: req.user.id,
      username: req.user.username,
      entityType: 'retention_policy',
      entityId: id,
      details: {
        policy_name: existingPolicy.policyName,
        document_type: existingPolicy.documentType,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      status: 'success',
      message: 'Retention policy deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API] Error deleting retention policy:', error.message);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/retention/run-job
 * Manually trigger the retention job
 */
router.post('/run-job', authenticate, authorizeAdmin, async (req, res) => {
  try {
    // Start the job in the background so we can return quickly
    const jobPromise = runRetentionJob();

    // Log the action
    logAction({
      action: 'job.manual_run',
      userId: req.user.id,
      username: req.user.username,
      entityType: 'retention_job',
      details: {
        initiated_at: new Date().toISOString(),
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Send immediate response that job was started
    res.json({
      status: 'success',
      message: 'Retention job started successfully',
      timestamp: new Date().toISOString(),
    });

    // Wait for the job to complete (but don't block the response)
    jobPromise
      .then(success => {
        console.log(
          `[API] Manual retention job completed with status: ${success ? 'success' : 'failure'}`
        );
      })
      .catch(error => {
        console.error('[API] Error in manual retention job:', error.message);
      });
  } catch (error) {
    console.error('[API] Error starting retention job:', error.message);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/retention/document-types
 * Get all document types that can be used in retention policies
 */
router.get('/document-types', authenticate, async (req, res) => {
  try {
    // Get unique document types from the documents table
    const { data, error } = await supabase
      .from('documents')
      .select('document_type')
      .order('document_type');

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // Extract unique types
    const uniqueTypes = [...new Set(data.map(doc => doc.document_type))].filter(Boolean).sort();

    res.json({
      status: 'success',
      data: uniqueTypes,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API] Error fetching document types:', error.message);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

import express from 'express';
import supabase from '../lib/supabaseClient.js';
import { verifyJwt, requireRoles } from '../middleware/auth.cjs';

const router = express.Router();

/**
 * @route GET /api/vault/audit
 * @desc Get audit logs for the current tenant
 * @access Private
 */
router.get('/', verifyJwt, async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { limit = 100, offset = 0, action } = req.query;

    // Build query
    let query = supabase
      .from('audit_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by action if provided
    if (action) {
      query = query.eq('action', action);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching audit logs:', error);
      return res.status(500).json({ message: error.message });
    }

    return res.json({
      logs: data || [],
      count,
    });
  } catch (error) {
    console.error('Error in audit logs route:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route POST /api/vault/audit
 * @desc Create a custom audit log entry
 * @access Private (admin/manager only)
 */
router.post('/', verifyJwt, requireRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;
    const { action, details } = req.body;

    if (!action) {
      return res.status(400).json({ message: 'Action is required' });
    }

    const { data, error } = await supabase
      .from('audit_logs')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        action,
        details: details || {},
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating audit log:', error);
      return res.status(500).json({ message: error.message });
    }

    return res.status(201).json(data);
  } catch (error) {
    console.error('Error in create audit log route:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route GET /api/vault/audit/user/:userId
 * @desc Get audit logs for a specific user (admin only)
 * @access Private (admin only)
 */
router.get('/user/:userId', verifyJwt, requireRoles(['admin']), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { userId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const { data, error, count } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching user audit logs:', error);
      return res.status(500).json({ message: error.message });
    }

    return res.json({
      logs: data || [],
      count,
    });
  } catch (error) {
    console.error('Error in user audit logs route:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route GET /api/vault/audit/actions
 * @desc Get list of unique audit actions
 * @access Private
 */
router.get('/actions', verifyJwt, async (req, res) => {
  try {
    const { tenantId } = req.user;

    // Use PostgreSQL DISTINCT to get unique actions
    const { data, error } = await supabase
      .from('audit_logs')
      .select('action')
      .eq('tenant_id', tenantId)
      .order('action')
      .limit(100);

    if (error) {
      console.error('Error fetching audit actions:', error);
      return res.status(500).json({ message: error.message });
    }

    // Extract unique actions
    const uniqueActions = [...new Set(data.map(log => log.action))];

    return res.json(uniqueActions);
  } catch (error) {
    console.error('Error in audit actions route:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route GET /api/vault/audit/dashboard
 * @desc Get audit stats for dashboard
 * @access Private (admin/manager only)
 */
router.get('/dashboard', verifyJwt, requireRoles(['admin', 'manager']), async (req, res) => {
  try {
    const { tenantId } = req.user;

    // Get today's date at midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get activity in last 24 hours
    const { data: recentActivity, error: recentError } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false });

    if (recentError) {
      console.error('Error fetching recent activity:', recentError);
      return res.status(500).json({ message: recentError.message });
    }

    // Get action counts
    const { data: actionCounts, error: countsError } = await supabase
      .from('audit_logs')
      .select('action, count')
      .eq('tenant_id', tenantId)
      .group('action')
      .limit(10);

    if (countsError) {
      console.error('Error fetching action counts:', countsError);
      // Continue with partial data
    }

    // Get top users
    const { data: topUsers, error: usersError } = await supabase
      .from('audit_logs')
      .select('user_id, count')
      .eq('tenant_id', tenantId)
      .not('user_id', 'is', null)
      .group('user_id')
      .order('count', { ascending: false })
      .limit(5);

    if (usersError) {
      console.error('Error fetching top users:', usersError);
      // Continue with partial data
    }

    return res.json({
      recentActivity: recentActivity || [],
      actionCounts: actionCounts || [],
      topUsers: topUsers || [],
      totalLogs: recentActivity?.length || 0,
    });
  } catch (error) {
    console.error('Error in audit dashboard route:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;

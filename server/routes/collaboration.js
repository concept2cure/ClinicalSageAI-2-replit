// Collaboration Center API routes
import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { requireTenant } from '../middleware/tenant.js';

const router = Router();

// Tenant enforcement (JWT in production; header fallback only in dev/demo)
router.use(requireTenant());

// GET /api/collaboration/activities - Get recent activities
router.get('/activities', async (req, res) => {
  try {
    const { 
      limit = 50, 
      offset = 0, 
      category,
      device_name,
      user_name,
      activity_type,
      importance,
      milestones_only
    } = req.query;

    let conditions = [sql`organization_id = ${req.organizationId}`];
    
    if (category) {
      conditions.push(sql`category = ${category}`);
    }
    
    if (device_name) {
      conditions.push(sql`device_name = ${device_name}`);
    }
    
    if (user_name) {
      conditions.push(sql`user_name ILIKE ${'%' + user_name + '%'}`);
    }
    
    if (activity_type) {
      conditions.push(sql`activity_type = ${activity_type}`);
    }
    
    if (importance && importance !== 'all') {
      conditions.push(sql`importance = ${importance}`);
    }
    
    if (milestones_only === 'true') {
      conditions.push(sql`is_milestone = true`);
    }

    const whereClause = conditions.length > 0 
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    // Get activities
    const result = await db.execute(sql`
      SELECT * FROM collaboration_activities 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT ${parseInt(limit)} 
      OFFSET ${parseInt(offset)}
    `);
    
    // Get total count
    const countResult = await db.execute(sql`
      SELECT COUNT(*) as total FROM collaboration_activities 
      ${whereClause}
    `);

    // postgres-js returns the rows directly
    const activities = Array.isArray(result) ? result : result.rows || [];
    const countRows = Array.isArray(countResult) ? countResult : countResult.rows || [];

    res.json({
      success: true,
      activities: activities,
      total: parseInt(countRows[0]?.total || 0),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('[Collaboration] Error getting activities:', error);
    res.status(500).json({ error: 'Failed to get activities' });
  }
});

// POST /api/collaboration/activities - Log a new activity
router.post('/activities', async (req, res) => {
  try {
    const {
      user_name,
      user_role,
      activity_type,
      action,
      target_type,
      target_name,
      category,
      device_name,
      regulatory_status,
      importance = 'normal',
      is_milestone = false,
      metadata = {}
    } = req.body;

    if (!user_name || !activity_type || !action) {
      return res.status(400).json({ 
        error: 'Missing required fields: user_name, activity_type, action' 
      });
    }

    const result = await db.execute(sql`
      INSERT INTO collaboration_activities (
        organization_id,
        user_name,
        user_role,
        activity_type,
        action,
        target_type,
        target_name,
        metadata,
        category,
        device_name,
        regulatory_status,
        importance,
        is_milestone
      ) VALUES (
        ${req.organizationId},
        ${user_name},
        ${user_role || null},
        ${activity_type},
        ${action},
        ${target_type || null},
        ${target_name || null},
        ${JSON.stringify(metadata)}::jsonb,
        ${category || null},
        ${device_name || null},
        ${regulatory_status || null},
        ${importance},
        ${is_milestone}
      )
      RETURNING *
    `);

    // postgres-js returns the rows directly
    const insertedRows = Array.isArray(result) ? result : result.rows || [];

    res.json({
      success: true,
      activity: insertedRows[0]
    });
  } catch (error) {
    console.error('[Collaboration] Error logging activity:', error);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

// GET /api/collaboration/stats - Get collaboration statistics
router.get('/stats', async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const stats = await db.execute(sql`
      SELECT 
        COUNT(*) as total_activities,
        COUNT(DISTINCT user_name) as active_users,
        COUNT(DISTINCT device_name) as active_devices,
        COUNT(CASE WHEN is_milestone THEN 1 END) as milestones_achieved,
        COUNT(CASE WHEN importance = 'critical' THEN 1 END) as critical_activities,
        COUNT(CASE WHEN importance = 'high' THEN 1 END) as high_priority_activities,
        COUNT(CASE WHEN regulatory_status = 'approved' THEN 1 END) as approved_items,
        COUNT(CASE WHEN regulatory_status = 'under_review' THEN 1 END) as under_review
      FROM collaboration_activities 
      WHERE organization_id = ${req.organizationId}
      AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
    `);

    const activityByType = await db.execute(sql`
      SELECT activity_type, COUNT(*) as count 
      FROM collaboration_activities 
      WHERE organization_id = ${req.organizationId}
      AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY activity_type
      ORDER BY count DESC
    `);

    const topContributors = await db.execute(sql`
      SELECT user_name, user_role, COUNT(*) as activity_count 
      FROM collaboration_activities 
      WHERE organization_id = ${req.organizationId}
      AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY user_name, user_role
      ORDER BY activity_count DESC
      LIMIT 10
    `);

    // postgres-js returns the rows directly
    const statsRows = Array.isArray(stats) ? stats : stats.rows || [];
    const typeRows = Array.isArray(activityByType) ? activityByType : activityByType.rows || [];
    const contributorRows = Array.isArray(topContributors) ? topContributors : topContributors.rows || [];

    const defaultStats = {
      total_activities: 0,
      active_users: 0,
      active_devices: 0,
      milestones_achieved: 0,
      critical_activities: 0,
      high_priority_activities: 0,
      approved_items: 0,
      under_review: 0
    };

    res.json({
      success: true,
      stats: statsRows[0] || defaultStats,
      activityByType: typeRows,
      topContributors: contributorRows,
      period: `Last ${days} days`
    });
  } catch (error) {
    console.error('[Collaboration] Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get collaboration stats' });
  }
});

// GET /api/collaboration/timeline - Get activity timeline
router.get('/timeline', async (req, res) => {
  try {
    const { device_name, days = 30 } = req.query;

    let conditions = [
      sql`organization_id = ${req.organizationId}`,
      sql`created_at >= CURRENT_DATE - INTERVAL '${days} days'`
    ];
    
    if (device_name) {
      conditions.push(sql`device_name = ${device_name}`);
    }

    const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

    const timeline = await db.execute(sql`
      SELECT 
        DATE(created_at) as activity_date,
        COUNT(*) as activity_count,
        COUNT(CASE WHEN is_milestone THEN 1 END) as milestone_count,
        COUNT(CASE WHEN importance = 'critical' THEN 1 END) as critical_count,
        COUNT(DISTINCT user_name) as unique_users
      FROM collaboration_activities 
      ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY activity_date DESC
    `);

    // postgres-js returns the rows directly
    const timelineRows = Array.isArray(timeline) ? timeline : timeline.rows || [];

    res.json({
      success: true,
      timeline: timelineRows,
      period: `Last ${days} days`,
      device: device_name || 'All devices'
    });
  } catch (error) {
    console.error('[Collaboration] Error getting timeline:', error);
    res.status(500).json({ error: 'Failed to get activity timeline' });
  }
});

// DELETE /api/collaboration/activities/:id - Delete an activity (admin only)
router.delete('/activities/:id', async (req, res) => {
  try {
    const activityId = parseInt(req.params.id);
    
    const result = await db.execute(sql`
      DELETE FROM collaboration_activities 
      WHERE id = ${activityId} AND organization_id = ${req.organizationId}
      RETURNING action
    `);

    // postgres-js returns the rows directly
    const deletedRows = Array.isArray(result) ? result : result.rows || [];

    if (deletedRows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    res.json({
      success: true,
      message: `Activity "${deletedRows[0].action}" deleted successfully`
    });
  } catch (error) {
    console.error('[Collaboration] Error deleting activity:', error);
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

export default router;
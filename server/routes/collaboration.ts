/**
 * Collaboration Routes — Team activity and presence
 *
 * Provides activity feed and team member data for the collaboration sidebar.
 * Uses persisted user/activity data from DB-backed sources.
 */
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { users } from '../../shared/schema';

const router = Router();

/**
 * GET /api/collaboration/activities
 * Returns recent collaboration activities across the organization
 */
router.get('/activities', async (req: Request, res: Response) => {
  try {
    // In production, this would query a dedicated activities table.
    // For now, return recent user actions as activity entries.
    const recentUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        lastLogin: users.lastLogin,
      })
      .from(users)
      .limit(20);

    const activities = recentUsers
      .filter(u => u.lastLogin)
      .map(u => ({
        id: u.id,
        type: 'login',
        actor: u.name || u.email?.split('@')[0] || 'User',
        actorEmail: u.email,
        description: `${u.name || 'User'} was active`,
        timestamp: u.lastLogin?.toISOString(),
      }));

    res.json({ activities });
  } catch (error) {
    console.error('[collaboration] Activities error:', error);
    // Graceful fallback
    res.json({ activities: [] });
  }
});

/**
 * GET /api/collaboration/team
 * Returns team members in the organization
 */
router.get('/team', async (req: Request, res: Response) => {
  try {
    const teamMembers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        title: users.title,
        department: users.department,
        avatar: users.avatar,
        lastLogin: users.lastLogin,
      })
      .from(users)
      .limit(50);

    const members = teamMembers.map(u => {
      // Determine presence based on last login recency
      const lastSeen = u.lastLogin ? new Date(u.lastLogin).getTime() : 0;
      const minutesAgo = (Date.now() - lastSeen) / 60000;
      let presence: 'online' | 'away' | 'offline' = 'offline';
      if (minutesAgo < 15) presence = 'online';
      else if (minutesAgo < 60) presence = 'away';

      return {
        id: u.id,
        name: u.name || u.email?.split('@')[0] || 'User',
        email: u.email,
        title: u.title || '',
        department: u.department || '',
        avatar: u.avatar || null,
        presence,
        lastSeen: u.lastLogin?.toISOString() || null,
      };
    });

    res.json({ members });
  } catch (error) {
    console.error('[collaboration] Team error:', error);
    // Fail closed instead of returning demo/fabricated presence data
    res.json({ members: [] });
  }
});

export default router;

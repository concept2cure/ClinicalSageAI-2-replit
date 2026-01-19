import express from 'express';
import { and, eq, isNull, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getPool } from '../db/pool.js';
import {
  coauthorSections,
  coauthorValidationRules,
} from '../../shared/schema.ts';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();
const pool = getPool();
const db = drizzle(pool);

router.use(authenticateJWT);

const resolveRiskLevel = (sourceStatus, targetStatus) => {
  const criticalStates = new Set(['critical', 'blocked']);
  const mediumStates = new Set(['pending', 'review', 'in-progress']);
  if (criticalStates.has(sourceStatus) || criticalStates.has(targetStatus)) return 'high';
  if (mediumStates.has(sourceStatus) || mediumStates.has(targetStatus)) return 'medium';
  return 'low';
};

/**
 * GET /api/coauthor/sections
 * Returns all CTD sections with position and connection data
 */
router.get('/sections', (req, res) => {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { sessionId, submissionId, moduleNumber } = req.query;
  const conditions = [eq(coauthorSections.organizationId, organizationId)];
  if (sessionId) conditions.push(eq(coauthorSections.sessionId, String(sessionId)));
  if (submissionId) conditions.push(eq(coauthorSections.submissionId, String(submissionId)));
  if (moduleNumber) conditions.push(eq(coauthorSections.moduleNumber, String(moduleNumber)));

  db.select()
    .from(coauthorSections)
    .where(and(...conditions))
    .then(rows => res.json(rows))
    .catch(error => {
      console.error('Error fetching sections:', error);
      res.status(500).json({ error: 'Failed to fetch sections' });
    });
});

/**
 * GET /api/coauthor/sections/:id
 * Returns a specific CTD section by ID
 */
router.get('/sections/:id', (req, res) => {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  db.select()
    .from(coauthorSections)
    .where(and(eq(coauthorSections.organizationId, organizationId), eq(coauthorSections.sectionId, req.params.id)))
    .limit(1)
    .then(rows => {
      if (!rows.length) {
        return res.status(404).json({ error: 'Section not found' });
      }
      res.json(rows[0]);
    })
    .catch(error => {
      console.error('Error fetching section:', error);
      res.status(500).json({ error: 'Failed to fetch section' });
    });
});

/**
 * POST /api/coauthor/layout/:id
 * Updates the position of a CTD section
 */
router.post('/layout/:id', (req, res) => {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const { x, y, connections } = req.body;

  db.update(coauthorSections)
    .set({
      x: typeof x === 'number' ? x : undefined,
      y: typeof y === 'number' ? y : undefined,
      connections: Array.isArray(connections) ? connections : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(coauthorSections.organizationId, organizationId), eq(coauthorSections.sectionId, id)))
    .returning()
    .then(rows => {
      if (!rows.length) {
        return res.status(404).json({ error: 'Section not found' });
      }
      res.json(rows[0]);
    })
    .catch(error => {
      console.error('Error updating layout:', error);
      res.status(500).json({ error: 'Failed to update layout' });
    });
});

/**
 * GET /api/coauthor/risks
 * Returns risk connection data for the Canvas
 */
router.get('/risks', (req, res) => {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  db.select()
    .from(coauthorSections)
    .where(eq(coauthorSections.organizationId, organizationId))
    .then(rows => {
      const sectionById = new Map(rows.map(section => [section.sectionId, section]));
      const riskConnections = [];

      rows.forEach(section => {
        const connections = Array.isArray(section.connections) ? section.connections : [];
        connections.forEach(targetId => {
          const target = sectionById.get(targetId);
          if (!target) return;
          riskConnections.push({
            source: section.sectionId,
            target: target.sectionId,
            riskLevel: resolveRiskLevel(section.status, target.status),
          });
        });
      });

      res.json(riskConnections);
    })
    .catch(error => {
      console.error('Error fetching risks:', error);
      res.status(500).json({ error: 'Failed to fetch risks' });
    });
});

/**
 * GET /api/coauthor/guidance/:id
 * Returns regulatory guidance for a specific section
 */
router.get('/guidance/:id', (req, res) => {
  const { id } = req.params;
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  db.select()
    .from(coauthorSections)
    .where(and(eq(coauthorSections.organizationId, organizationId), eq(coauthorSections.sectionId, id)))
    .limit(1)
    .then(async rows => {
      if (!rows.length) {
        return res.status(404).json({ error: 'Section not found' });
      }

      const section = rows[0];
      const moduleLabel = section.moduleNumber ? `Module ${section.moduleNumber}` : undefined;

      const ruleConditions = [eq(coauthorValidationRules.isActive, true)];
      if (moduleLabel) {
        ruleConditions.push(eq(coauthorValidationRules.module, moduleLabel));
      }

      const rules = await db
        .select()
        .from(coauthorValidationRules)
        .where(
          and(
            ...ruleConditions,
            or(
              eq(coauthorValidationRules.organizationId, organizationId),
              isNull(coauthorValidationRules.organizationId)
            )
          )
        );

      const sectionRules = rules.filter(rule => !rule.section || rule.section === id);

      const guidance = {
        sectionId: id,
        title: section.title,
        status: section.status,
        rules: sectionRules.map(rule => ({
          ruleId: rule.ruleId,
          agency: rule.agency,
          category: rule.category,
          severity: rule.severity,
          name: rule.ruleName,
          description: rule.description,
          remediation: rule.remediationText,
        })),
      };

      res.json(guidance);
    })
    .catch(error => {
      console.error('Error fetching guidance:', error);
      res.status(500).json({ error: 'Failed to fetch guidance' });
    });
});

export default router;

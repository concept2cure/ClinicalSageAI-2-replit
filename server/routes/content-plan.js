/**
 * Content Plan API Routes
 * Manages section requirements, ownership, and evidence linking
 */

import express from 'express';
import { pool as db } from '../utils/database.js';
import { getSecureOrgId } from '../utils/tenantContext';
const router = express.Router();

// Get content plan for a project
router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const organizationId = getSecureOrgId(req);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    // Default content plan structure for 510(k) submission
    const defaultSections = [
      {
        id: 'cover-letter',
        title: '510(k) Cover Letter',
        description: 'Administrative information and device overview',
        module: 'Module 1',
        required: true,
        order: 1,
      },
      {
        id: 'substantial-equivalence',
        title: 'Substantial Equivalence Discussion',
        description: 'Comparison with predicate device(s)',
        module: 'Module 2',
        required: true,
        order: 2,
      },
      {
        id: 'device-description',
        title: 'Device Description',
        description: 'Detailed technical specifications and intended use',
        module: 'Module 2',
        required: true,
        order: 3,
      },
      {
        id: 'performance-testing',
        title: 'Performance Data',
        description: 'Bench testing, electrical safety, and software validation',
        module: 'Module 3',
        required: true,
        order: 4,
      },
      {
        id: 'biocompatibility',
        title: 'Biocompatibility',
        description: 'Biological evaluation per ISO 10993',
        module: 'Module 4',
        required: false,
        order: 5,
      },
      {
        id: 'sterilization',
        title: 'Sterilization Validation',
        description: 'Sterilization methods and validation data',
        module: 'Module 3',
        required: false,
        order: 6,
      },
      {
        id: 'clinical-data',
        title: 'Clinical Data',
        description: 'Clinical trials, literature review, and real-world evidence',
        module: 'Module 5',
        required: false,
        order: 7,
      },
      {
        id: 'labeling',
        title: 'Proposed Labeling',
        description: 'Device labeling, instructions for use, and packaging',
        module: 'Module 1',
        required: true,
        order: 8,
      },
    ];

    // Fetch section status from database if project exists
    let sectionStatus = {};
    if (projectId !== 'default') {
      const statusQuery = await db.query(
        `
        SELECT
          section_id,
          status,
          owner,
          due_date,
          completion_percentage,
          last_updated
        FROM content_plan_sections
        WHERE project_id = $1 AND organization_id = $2
      `,
        [projectId, organizationId]
      );

      statusQuery.rows.forEach(row => {
        sectionStatus[row.section_id] = row;
      });
    }

    // Fetch evidence counts for each section
    const evidenceQuery = await db.query(
      `
      SELECT
        section_id,
        COUNT(*) as evidence_count,
        MAX(created_at) as latest_evidence
      FROM section_evidence_links
      WHERE organization_id = $1
        AND (project_id = $2 OR project_id IS NULL)
      GROUP BY section_id
    `,
      [organizationId, projectId]
    );

    const evidenceCounts = {};
    evidenceQuery.rows.forEach(row => {
      evidenceCounts[row.section_id] = {
        count: parseInt(row.evidence_count),
        latestDate: row.latest_evidence,
      };
    });

    // Build complete content plan
    const sections = defaultSections.map(section => {
      const status = sectionStatus[section.id] || {};
      const evidence = evidenceCounts[section.id] || { count: 0 };

      // Determine completeness and gaps
      const hasEvidence = evidence.count > 0;
      const isComplete = status.status === 'complete' || status.completion_percentage === 100;
      const isStale =
        evidence.latestDate &&
        new Date(evidence.latestDate) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days old

      const gaps = [];
      if (section.required && !hasEvidence) {
        gaps.push('Missing required evidence');
      }
      if (section.required && !status.owner) {
        gaps.push('No owner assigned');
      }
      if (isStale) {
        gaps.push('Evidence may be outdated');
      }

      return {
        ...section,
        owner: status.owner || null,
        dueDate: status.due_date || null,
        status: status.status || 'not-started',
        completionPercentage: status.completion_percentage || 0,
        isComplete,
        hasStaleContent: isStale,
        evidence: {
          count: evidence.count,
          latestDate: evidence.latestDate,
        },
        gaps,
        lastUpdated: status.last_updated || null,
      };
    });

    // Calculate overall progress
    const totalRequired = sections.filter(s => s.required).length;
    const completedRequired = sections.filter(s => s.required && s.isComplete).length;
    const overallProgress = totalRequired > 0 ? (completedRequired / totalRequired) * 100 : 0;

    res.json({
      success: true,
      projectId,
      sections,
      summary: {
        totalSections: sections.length,
        requiredSections: totalRequired,
        completedSections: sections.filter(s => s.isComplete).length,
        sectionsWithEvidence: sections.filter(s => s.evidence.count > 0).length,
        overallProgress: Math.round(overallProgress),
        gaps: sections.reduce((acc, s) => acc + s.gaps.length, 0),
      },
    });
  } catch (error) {
    console.error('Failed to get content plan:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve content plan',
    });
  }
});

// Update section status
router.put('/:projectId/section/:sectionId', async (req, res) => {
  try {
    const { projectId, sectionId } = req.params;
    const { owner, dueDate, status, completionPercentage } = req.body;
    const organizationId = getSecureOrgId(req);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    // Upsert section status
    await db.query(
      `
      INSERT INTO content_plan_sections
        (project_id, section_id, organization_id, owner, due_date, status, completion_percentage, last_updated)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (project_id, section_id, organization_id)
      DO UPDATE SET
        owner = EXCLUDED.owner,
        due_date = EXCLUDED.due_date,
        status = EXCLUDED.status,
        completion_percentage = EXCLUDED.completion_percentage,
        last_updated = NOW()
    `,
      [projectId, sectionId, organizationId, owner, dueDate, status, completionPercentage]
    );

    res.json({
      success: true,
      message: 'Section status updated',
    });
  } catch (error) {
    console.error('Failed to update section status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update section status',
    });
  }
});

// Link evidence to section
router.post('/:projectId/section/:sectionId/evidence', async (req, res) => {
  try {
    const { projectId, sectionId } = req.params;
    const { evidenceId, evidenceType, source } = req.body;
    const organizationId = getSecureOrgId(req);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    await db.query(
      `
      INSERT INTO section_evidence_links
        (project_id, section_id, evidence_id, evidence_type, source, organization_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT DO NOTHING
    `,
      [projectId, sectionId, evidenceId, evidenceType, source, organizationId]
    );

    res.json({
      success: true,
      message: 'Evidence linked to section',
    });
  } catch (error) {
    console.error('Failed to link evidence:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to link evidence to section',
    });
  }
});

export default router;

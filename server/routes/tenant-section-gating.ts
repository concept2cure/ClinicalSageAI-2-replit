import { authMiddleware } from '../auth';
import { qualityManagementPlans, cerSections } from '../../shared/schema';

// Define these locally since they're not exported from schema
const cerSectionsGating = {
  id: 'id',
  organizationId: 'organization_id',
  qmpId: 'qmp_id',
  sectionKey: 'section_key',
  requiredLevel: 'required_level',
  active: 'active',
  createdById: 'created_by_id',
  updatedById: 'updated_by_id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

// Define ctqFactors locally since it's not exported from schema
const ctqFactors = {
  id: 'id',
  organizationId: 'organization_id',
  name: 'name',
  riskLevel: 'risk_level',
  description: 'description',
  mitigationStrategy: 'mitigation_strategy',
  applicableSection: 'applicable_section',
  category: 'category',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

import express from 'express';
import { tenantContext, getTenantContext } from '../middleware/tenantContext';
import { db, pool } from '../db';

const router = express.Router();

// Apply tenant context middleware to all routes
router.use(tenantContext);
router.use(authMiddleware);

// Get section gating for a QMP
router.get('/api/tenant-section-gating/:qmpId', async (req, res) => {
  try {
    const { qmpId } = req.params;
    const { organizationId } = getTenantContext(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const query = {
      text: `
        SELECT id, organization_id, qmp_id, section_key, required_level, active, created_by_id, updated_by_id, created_at, updated_at
        FROM qmp_section_gating
        WHERE ${cerSectionsGating.organizationId} = $1
        AND ${cerSectionsGating.qmpId} = $2
        ORDER BY ${cerSectionsGating.sectionKey} ASC
      `,
      values: [organizationId, qmpId],
    };

    const result = await pool.query(query);

    res.json({
      status: 'success',
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching section gating:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

// Update section gating for a QMP
router.post('/api/tenant-section-gating/:qmpId/update', async (req, res) => {
  try {
    const { qmpId } = req.params;
    const { organizationId } = getTenantContext(req);
    const { sectionKey, requiredLevel, active } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    // Check if the entry exists
    const checkQuery = {
      text: `
        SELECT id FROM qmp_section_gating
        WHERE ${cerSectionsGating.organizationId} = $1
        AND ${cerSectionsGating.qmpId} = $2
        AND ${cerSectionsGating.sectionKey} = $3
      `,
      values: [organizationId, qmpId, sectionKey],
    };

    const checkResult = await pool.query(checkQuery);

    let result;
    if ((checkResult.rowCount ?? 0) > 0) {
      // Update existing record
      const updateQuery = {
        text: `
          UPDATE qmp_section_gating 
          SET ${cerSectionsGating.requiredLevel} = $1, 
              ${cerSectionsGating.active} = $2,
              ${cerSectionsGating.updatedAt} = CURRENT_TIMESTAMP,
              ${cerSectionsGating.updatedById} = $3
          WHERE ${cerSectionsGating.organizationId} = $4 
          AND ${cerSectionsGating.qmpId} = $5
          AND ${cerSectionsGating.sectionKey} = $6
          RETURNING *
        `,
        values: [requiredLevel, active, req.user?.id || null, organizationId, qmpId, sectionKey],
      };
      result = await pool.query(updateQuery);
    } else {
      // Insert new record
      const insertQuery = {
        text: `
          INSERT INTO qmp_section_gating (
            ${cerSectionsGating.organizationId}, 
            ${cerSectionsGating.qmpId}, 
            ${cerSectionsGating.sectionKey}, 
            ${cerSectionsGating.requiredLevel}, 
            ${cerSectionsGating.active},
            ${cerSectionsGating.createdById},
            ${cerSectionsGating.updatedById},
            ${cerSectionsGating.createdAt},
            ${cerSectionsGating.updatedAt}
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING *
        `,
        values: [
          organizationId,
          qmpId,
          sectionKey,
          requiredLevel,
          active,
          req.user?.id || null,
          req.user?.id || null,
        ],
      };
      result = await pool.query(insertQuery);
    }

    res.json({
      status: 'success',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error updating section gating:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

// Get CTQ factors for a specific applicable section
router.get('/api/tenant-ctq-factors/:section', async (req, res) => {
  try {
    const { section } = req.params;
    const { organizationId } = getTenantContext(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const query = {
      text: `
        SELECT id, organization_id, name, risk_level, description, mitigation_strategy, applicable_section, category, created_at, updated_at
        FROM ctq_factors
        WHERE ${ctqFactors.organizationId} = $1
        AND ${ctqFactors.applicableSection} = $2
        ORDER BY ${ctqFactors.riskLevel} DESC, ${ctqFactors.name} ASC
      `,
      values: [organizationId, section],
    };

    const result = await pool.query(query);

    res.json({
      status: 'success',
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching CTQ factors:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

// Create or update a CTQ factor
router.post('/api/tenant-ctq-factors', async (req, res) => {
  try {
    const { id, name, description, riskLevel, mitigationStrategy, applicableSection, category } =
      req.body;
    const { organizationId } = getTenantContext(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    let result;
    if (id) {
      // Update existing CTQ factor
      const updateQuery = {
        text: `
          UPDATE ctq_factors 
          SET ${ctqFactors.name} = $1, 
              ${ctqFactors.description} = $2,
              ${ctqFactors.riskLevel} = $3,
              ${ctqFactors.mitigationStrategy} = $4,
              ${ctqFactors.applicableSection} = $5,
              ${ctqFactors.category} = $6,
              ${ctqFactors.updatedAt} = CURRENT_TIMESTAMP
          WHERE ${ctqFactors.id} = $7
          AND ${ctqFactors.organizationId} = $8
          RETURNING *
        `,
        values: [
          name,
          description,
          riskLevel,
          mitigationStrategy,
          applicableSection,
          category,
          id,
          organizationId,
        ],
      };
      result = await pool.query(updateQuery);
    } else {
      // Create new CTQ factor
      const insertQuery = {
        text: `
          INSERT INTO ctq_factors (
            ${ctqFactors.organizationId}, 
            ${ctqFactors.name}, 
            ${ctqFactors.description}, 
            ${ctqFactors.riskLevel}, 
            ${ctqFactors.mitigationStrategy},
            ${ctqFactors.applicableSection},
            ${ctqFactors.category},
            ${ctqFactors.createdAt},
            ${ctqFactors.updatedAt}
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING *
        `,
        values: [
          organizationId,
          name,
          description,
          riskLevel,
          mitigationStrategy,
          applicableSection,
          category,
        ],
      };
      result = await pool.query(insertQuery);
    }

    res.json({
      status: 'success',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error updating CTQ factor:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

// Delete a CTQ factor
router.delete('/api/tenant-ctq-factors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { organizationId } = getTenantContext(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const query = {
      text: `
        DELETE FROM ctq_factors 
        WHERE ${ctqFactors.id} = $1
        AND ${ctqFactors.organizationId} = $2
        RETURNING *
      `,
      values: [id, organizationId],
    };

    const result = await pool.query(query);

    if ((result.rowCount ?? 0) === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'CTQ factor not found',
      });
    }

    res.json({
      status: 'success',
      message: 'CTQ factor deleted successfully',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error deleting CTQ factor:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

console.log('Tenant Section Gating routes registered');

export default router;

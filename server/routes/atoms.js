import express from 'express';
import { db } from '../db/index.js';
import { and, eq, ilike, sql, desc } from 'drizzle-orm';
import { lumenDataAtoms } from '@shared/schema';

const router = express.Router();

const resolveOrganizationId = req =>
  req.organizationId || req.query.organizationId || req.body?.organizationId;

/**
 * GET /api/atoms - Get all content atoms
 */
router.get('/', async (req, res) => {
  try {
    const orgId = resolveOrganizationId(req);
    if (!orgId) {
      return res.status(400).json({
        success: false,
        error: 'organizationId is required',
      });
    }

    const { sourceType, atomType, status, tags, search, limit } = req.query;
    const conditions = [eq(lumenDataAtoms.organizationId, Number(orgId))];

    if (sourceType) {
      conditions.push(eq(lumenDataAtoms.sourceType, String(sourceType)));
    }

    if (atomType) {
      conditions.push(eq(lumenDataAtoms.atomType, String(atomType)));
    }

    if (status) {
      conditions.push(eq(lumenDataAtoms.status, String(status)));
    }

    if (search) {
      conditions.push(ilike(lumenDataAtoms.content, `%${search}%`));
    }

    if (tags) {
      const tagList = String(tags)
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean);

      if (tagList.length > 0) {
        conditions.push(sql`${lumenDataAtoms.tags} && ${tagList}::text[]`);
      }
    }

    const atoms = await db
      .select()
      .from(lumenDataAtoms)
      .where(and(...conditions))
      .orderBy(desc(lumenDataAtoms.createdAt))
      .limit(limit ? Number(limit) : 250);

    res.json({
      success: true,
      atoms,
      total: atoms.length,
    });
  } catch (error) {
    console.error('Error fetching atoms:', error);
    res.status(500).json({
      error: 'Failed to fetch content atoms',
      details: error.message,
    });
  }
});

/**
 * GET /api/atoms/:id - Get a specific content atom
 */
router.get('/:id', async (req, res) => {
  try {
    const orgId = resolveOrganizationId(req);
    const { id } = req.params;

    if (!orgId) {
      return res.status(400).json({
        success: false,
        error: 'organizationId is required',
      });
    }

    const [atom] = await db
      .select()
      .from(lumenDataAtoms)
      .where(
        and(eq(lumenDataAtoms.id, id), eq(lumenDataAtoms.organizationId, Number(orgId)))
      )
      .limit(1);

    if (!atom) {
      return res.status(404).json({
        error: 'Content atom not found',
      });
    }

    res.json({
      success: true,
      atom,
    });
  } catch (error) {
    console.error('Error fetching atom:', error);
    res.status(500).json({
      error: 'Failed to fetch content atom',
      details: error.message,
    });
  }
});

/**
 * POST /api/atoms - Create a new content atom
 */
router.post('/', async (req, res) => {
  try {
    const orgId = resolveOrganizationId(req);
    const {
      sourceType,
      sourceId,
      atomType,
      title,
      content,
      structuredData,
      tags,
      confidence,
      status,
    } = req.body;

    if (!orgId || !sourceType || !atomType || !title || !content) {
      return res.status(400).json({
        error: 'Missing required fields: organizationId, sourceType, atomType, title, content',
      });
    }

    const [newAtom] = await db
      .insert(lumenDataAtoms)
      .values({
        organizationId: Number(orgId),
        sourceType,
        sourceId,
        atomType,
        title,
        content,
        structuredData: structuredData || null,
        tags: tags || [],
        confidence: confidence ?? 0.7,
        status: status || 'active',
        updatedAt: new Date(),
      })
      .returning();

    res.status(201).json({
      success: true,
      message: 'Content atom created successfully',
      atom: newAtom,
    });
  } catch (error) {
    console.error('Error creating atom:', error);
    res.status(500).json({
      error: 'Failed to create content atom',
      details: error.message,
    });
  }
});

/**
 * PUT /api/atoms/:id - Update a content atom
 */
router.put('/:id', async (req, res) => {
  try {
    const orgId = resolveOrganizationId(req);
    const { id } = req.params;

    if (!orgId) {
      return res.status(400).json({
        error: 'organizationId is required',
      });
    }

    const [updatedAtom] = await db
      .update(lumenDataAtoms)
      .set({
        ...req.body,
        updatedAt: new Date(),
      })
      .where(
        and(eq(lumenDataAtoms.id, id), eq(lumenDataAtoms.organizationId, Number(orgId)))
      )
      .returning();

    if (!updatedAtom) {
      return res.status(404).json({
        error: 'Content atom not found',
      });
    }

    res.json({
      success: true,
      message: 'Content atom updated successfully',
      atom: updatedAtom,
    });
  } catch (error) {
    console.error('Error updating atom:', error);
    res.status(500).json({
      error: 'Failed to update content atom',
      details: error.message,
    });
  }
});

/**
 * DELETE /api/atoms/:id - Delete a content atom
 */
router.delete('/:id', async (req, res) => {
  try {
    const orgId = resolveOrganizationId(req);
    const { id } = req.params;

    if (!orgId) {
      return res.status(400).json({
        error: 'organizationId is required',
      });
    }

    const [deletedAtom] = await db
      .delete(lumenDataAtoms)
      .where(
        and(eq(lumenDataAtoms.id, id), eq(lumenDataAtoms.organizationId, Number(orgId)))
      )
      .returning();

    if (!deletedAtom) {
      return res.status(404).json({
        error: 'Content atom not found',
      });
    }

    res.json({
      success: true,
      message: 'Content atom deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting atom:', error);
    res.status(500).json({
      error: 'Failed to delete content atom',
      details: error.message,
    });
  }
});

export default router;


import express from 'express';
import { db } from '../db/index.js';
import { cerDocuments, cerSections } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';

const router = express.Router();

// Save document sections
router.post('/documents/:projectId/save', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { documentType, sections, metadata } = req.body;
    const organizationId = req.headers['x-organization-id'];

    // Save or update document record
    const [document] = await db
      .insert(cerDocuments)
      .values({
        projectId,
        documentType,
        organizationId,
        metadata,
        status: 'draft',
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: [cerDocuments.projectId, cerDocuments.documentType],
        set: {
          metadata,
          updatedAt: new Date()
        }
      })
      .returning();

    // Save sections
    for (const [sectionId, sectionData] of Object.entries(sections)) {
      await db
        .insert(cerSections)
        .values({
          documentId: document.id,
          sectionId,
          title: sectionData.title,
          content: sectionData.content,
          required: sectionData.required,
          lastModified: sectionData.lastModified
        })
        .onConflictDoUpdate({
          target: [cerSections.documentId, cerSections.sectionId],
          set: {
            content: sectionData.content,
            lastModified: sectionData.lastModified
          }
        });
    }

    res.json({ 
      success: true, 
      documentId: document.id,
      message: 'Document saved successfully' 
    });
  } catch (error) {
    console.error('Error saving document:', error);
    res.status(500).json({ error: error.message });
  }
});

// Load document sections
router.get('/documents/:projectId/:documentType', async (req, res) => {
  try {
    const { projectId, documentType } = req.params;
    const organizationId = req.headers['x-organization-id'];

    const document = await db.query.cerDocuments.findFirst({
      where: and(
        eq(cerDocuments.projectId, projectId),
        eq(cerDocuments.documentType, documentType),
        eq(cerDocuments.organizationId, organizationId)
      ),
      with: {
        sections: true
      }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    console.error('Error loading document:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

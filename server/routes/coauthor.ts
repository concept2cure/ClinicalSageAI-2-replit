/**
 * Co-Author Routes
 * eCTD collaborative authoring service
 */
import { Router, Request, Response } from 'express';

const router = Router();

// ── Sessions ────────────────────────────────────────────────────────────────

router.get('/sessions', (_req: Request, res: Response) => {
  res.json({
    sessions: [],
    message: 'Co-author service ready',
  });
});

router.post('/sessions', (req: Request, res: Response) => {
  const { title, templateId, moduleNumber } = req.body || {};
  res.status(201).json({
    success: true,
    session: {
      id: Date.now(),
      title: title || 'Untitled Session',
      templateId: templateId || null,
      moduleNumber: moduleNumber || null,
      status: 'active',
      createdAt: new Date().toISOString(),
    },
  });
});

// ── Documents ───────────────────────────────────────────────────────────────

router.get('/documents', (_req: Request, res: Response) => {
  res.json({
    documents: [],
    total: 0,
    message: 'No co-author documents yet',
  });
});

router.get('/documents/:id', (req: Request, res: Response) => {
  res.json({
    document: {
      id: req.params.id,
      title: 'Draft Document',
      content: '',
      status: 'draft',
      version: '0.1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });
});

router.post('/documents', (req: Request, res: Response) => {
  const { title, sectionId, moduleNumber, content, templateId } = req.body || {};

  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  res.status(201).json({
    success: true,
    document: {
      id: Date.now(),
      title,
      sectionId: sectionId || null,
      moduleNumber: moduleNumber || null,
      content: content || '',
      templateId: templateId || null,
      status: 'draft',
      version: '0.1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });
});

router.put('/documents/:id', (req: Request, res: Response) => {
  const { title, content, status } = req.body || {};
  res.json({
    success: true,
    document: {
      id: req.params.id,
      title: title || 'Untitled',
      content: content || '',
      status: status || 'draft',
      updatedAt: new Date().toISOString(),
    },
  });
});

router.delete('/documents/:id', (req: Request, res: Response) => {
  res.json({ success: true, deletedId: req.params.id });
});

// ── Templates ───────────────────────────────────────────────────────────────

router.get('/templates', (_req: Request, res: Response) => {
  res.json({
    templates: [
      { id: 'module-2-5', name: 'Module 2.5 – Clinical Overview', moduleNumber: '2.5' },
      { id: 'module-2-7', name: 'Module 2.7 – Clinical Summary', moduleNumber: '2.7' },
      { id: 'module-3-2-s', name: 'Module 3.2.S – Drug Substance', moduleNumber: '3.2.S' },
      { id: 'module-3-2-p', name: 'Module 3.2.P – Drug Product', moduleNumber: '3.2.P' },
      { id: 'module-5-3', name: 'Module 5.3 – Clinical Study Reports', moduleNumber: '5.3' },
    ],
  });
});

export default router;

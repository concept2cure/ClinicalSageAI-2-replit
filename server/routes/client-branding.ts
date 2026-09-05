/**
 * Client Branding & Template Management API
 *
 * Organization-level branding assets and custom document templates.
 * Data persisted in projectMemoryEntries with category 'client_branding'.
 *
 * @module server/routes/client-branding
 */

import { Router, Request, Response } from 'express';
import auditService from '../services/auditService';
import { createScopedLogger } from '../utils/logger';
import { createFeatureStore } from '../utils/feature-persistence';
import { requireAuthedOrgId } from '../utils/authedOrgId';
import { serverError } from '../lib/api-response';

const logger = createScopedLogger('client-branding');
const router = Router();
const store = createFeatureStore('client_branding');

// SECURITY: every handler in this router reads/writes per-org branding
// assets. Pre-fix, each one took `req.query.organizationId` or
// `req.body.organizationId` verbatim — a query-param IDOR that let
// any authenticated user read or overwrite another tenant's branding
// (logo, colors, custom templates). The orgId now comes from the JWT
// only, via requireAuthedOrgId; the query/body field is ignored.

router.get('/settings', async (req: Request, res: Response) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const orgId = guard.orgId;

    const rows = await store.query(orgId, 'settings');
    if (rows.length > 0) {
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...settings } = rows[0];
      return res.json(settings);
    }

    res.json({
      organizationId: orgId,
      companyName: '',
      logoUrl: null,
      logoBase64: null,
      letterheadUrl: null,
      primaryColor: '#1e40af',
      secondaryColor: '#3b82f6',
      accentColor: '#93c5fd',
      fontFamily: 'Inter, sans-serif',
      headerHtml: null,
      footerHtml: null,
      watermarkText: null,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return serverError(res, logger, 'loading settings', err);
  }
});

router.patch('/settings', async (req: Request, res: Response) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const orgId = guard.orgId;

    const rows = await store.query(orgId, 'settings');
    const existing = rows.length > 0 ? rows[0] : null;
    const base = existing
      ? (() => {
          const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = existing;
          return rest;
        })()
      : { organizationId: orgId };

    const updated = { ...base, ...req.body, organizationId: orgId, updatedAt: new Date().toISOString() };

    if (existing) {
      await store.update(existing.id, orgId, updated);
    } else {
      await store.insert(orgId, 'settings', 'Branding Settings', updated);
    }

    await auditService.logAction({
      tenantId: orgId,
      action: 'branding_settings_updated',
      resourceType: 'organization',
      resourceId: orgId,
      details: { updatedFields: Object.keys(req.body) },
    });

    res.json(updated);
  } catch (err: any) {
    return serverError(res, logger, 'updating settings', err);
  }
});

router.post('/upload-logo', async (req: Request, res: Response) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const orgId = guard.orgId;
    const { logoBase64, fileName } = req.body;
    if (!logoBase64) return res.status(400).json({ error: 'logoBase64 is required' });

    const rows = await store.query(orgId, 'settings');
    const existing = rows.length > 0 ? rows[0] : null;
    const base = existing
      ? (() => {
          const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = existing;
          return rest;
        })()
      : { organizationId: orgId };

    const logoUrl = `/api/client-branding/logo/${orgId}`;
    const updated = { ...base, logoBase64, logoUrl, updatedAt: new Date().toISOString() };

    if (existing) {
      await store.update(existing.id, orgId, updated);
    } else {
      await store.insert(orgId, 'settings', 'Branding Settings', updated);
    }

    await auditService.logAction({
      tenantId: orgId,
      action: 'logo_uploaded',
      resourceType: 'organization',
      resourceId: orgId,
      details: { fileName },
    });

    logger.info(`Logo uploaded for org ${orgId}`);
    res.json({ logoUrl, updated: true });
  } catch (err: any) {
    return serverError(res, logger, 'saving upload logo', err);
  }
});

router.get('/logo/:orgId', async (req: Request, res: Response) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    // SECURITY: serve only the caller's own branding. The :orgId path segment
    // must match the JWT-bound org; a mismatch must not leak another tenant's
    // logo. Returns 404 rather than 403 to avoid existence disclosure.
    const orgId = parseInt(String(req.params.orgId), 10);
    if (orgId !== guard.orgId) {
      return res.status(404).json({ error: 'No logo uploaded' });
    }
    const rows = await store.query(orgId, 'settings');
    const settings = rows.length > 0 ? rows[0] : null;

    if (!settings?.logoBase64) {
      return res.status(404).json({ error: 'No logo uploaded' });
    }

    const match = settings.logoBase64.match(/^data:(.+);base64,(.+)$/);
    if (match) {
      const [, mimeType, data] = match;
      const buffer = Buffer.from(data, 'base64');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buffer);
    } else {
      res.status(400).json({ error: 'Invalid logo format' });
    }
  } catch (err: any) {
    return serverError(res, logger, 'loading logo', err);
  }
});

router.post('/upload-letterhead', async (req: Request, res: Response) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const orgId = guard.orgId;
    const { letterheadBase64, fileName } = req.body;
    if (!letterheadBase64) return res.status(400).json({ error: 'letterheadBase64 is required' });

    const rows = await store.query(orgId, 'settings');
    const existing = rows.length > 0 ? rows[0] : null;
    const base = existing
      ? (() => {
          const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = existing;
          return rest;
        })()
      : { organizationId: orgId };

    const letterheadUrl = `/api/client-branding/letterhead/${orgId}`;
    const updated = { ...base, letterheadUrl, updatedAt: new Date().toISOString() };

    if (existing) {
      await store.update(existing.id, orgId, updated);
    } else {
      await store.insert(orgId, 'settings', 'Branding Settings', updated);
    }

    await auditService.logAction({
      tenantId: orgId,
      action: 'letterhead_uploaded',
      resourceType: 'organization',
      resourceId: orgId,
      details: { fileName },
    });

    logger.info(`Letterhead uploaded for org ${orgId}`);
    res.json({ letterheadUrl: letterheadUrl, updated: true });
  } catch (err: any) {
    return serverError(res, logger, 'saving upload letterhead', err);
  }
});

router.get('/templates', async (req: Request, res: Response) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const orgId = guard.orgId;

    const category = req.query.category as string | undefined;
    let templates = await store.query(orgId, 'template');
    templates = templates.filter((t: any) => t.isActive !== false);
    if (category) templates = templates.filter((t: any) => t.category === category);

    res.json(templates);
  } catch (err: any) {
    return serverError(res, logger, 'loading templates', err);
  }
});

router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(String(req.params.id), 10);
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const orgId = guard.orgId;

    const template = await store.getById(templateId, orgId);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    res.json(template);
  } catch (err: any) {
    return serverError(res, logger, 'loading templates', err);
  }
});

router.post('/templates', async (req: Request, res: Response) => {
  try {
    // Tenant scope from the JWT only, consistent with every other handler in
    // this file — the body org field is ignored.
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const orgId = guard.orgId;
    const { name, description, category, fileType, content, placeholders } = req.body;

    if (!name || !category)
      return res.status(400).json({ error: 'name and category are required' });

    const templateData = {
      organizationId: orgId,
      name,
      description: description || '',
      category,
      fileType: fileType || 'html',
      fileUrl: null,
      content: content || null,
      placeholders: placeholders || {},
      isActive: true,
      usageCount: 0,
      createdBy: 'Current User',
    };

    const template = await store.insert(orgId, 'template', name, templateData);

    await auditService.logAction({
      tenantId: orgId,
      action: 'template_created',
      resourceType: 'document_template',
      resourceId: template.id,
      details: { name, category },
    });

    logger.info(`Template ${template.id} created: ${name} [${category}]`);
    res.status(201).json(template);
  } catch (err: any) {
    return serverError(res, logger, 'saving templates', err);
  }
});

router.patch('/templates/:id', async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(String(req.params.id), 10);
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const orgId = guard.orgId;

    const existing = await store.getById(templateId, orgId);
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = existing;
    const updated = {
      ...data,
      ...req.body,
      id: undefined,
      organizationId: existing.organizationId,
    };

    const result = await store.update(templateId, orgId, updated, req.body.name);

    await auditService.logAction({
      tenantId: orgId,
      action: 'template_updated',
      resourceType: 'document_template',
      resourceId: templateId,
      details: { updatedFields: Object.keys(req.body) },
    });

    res.json(result);
  } catch (err: any) {
    return serverError(res, logger, 'updating templates', err);
  }
});

router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(String(req.params.id), 10);
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const orgId = guard.orgId;

    const existing = await store.getById(templateId, orgId);
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = existing;
    await store.update(templateId, orgId, { ...data, isActive: false });

    await auditService.logAction({
      tenantId: orgId,
      action: 'template_deleted',
      resourceType: 'document_template',
      resourceId: templateId,
    });

    res.json({ deleted: true });
  } catch (err: any) {
    return serverError(res, logger, 'deleting templates', err);
  }
});

router.post('/render-template/:id', async (req: Request, res: Response) => {
  try {
    const templateId = parseInt(String(req.params.id), 10);
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const orgId = guard.orgId;
    const values = req.body.values || {};

    const template = await store.getById(templateId, orgId);
    if (!template || !template.content) {
      return res.status(404).json({ error: 'Template not found or has no renderable content' });
    }

    const settingsRows = await store.query(orgId, 'settings');
    const branding = settingsRows.length > 0
      ? settingsRows[0]
      : { companyName: '', primaryColor: '#1e40af', secondaryColor: '#3b82f6', accentColor: '#93c5fd', fontFamily: 'Inter, sans-serif', logoUrl: '' };

    const allValues: Record<string, string> = {
      companyName: branding.companyName || '',
      primaryColor: branding.primaryColor || '#1e40af',
      secondaryColor: branding.secondaryColor || '#3b82f6',
      accentColor: branding.accentColor || '#93c5fd',
      fontFamily: branding.fontFamily || 'Inter, sans-serif',
      logoUrl: branding.logoUrl || '',
      textColor: '#1e293b',
      ...values,
    };

    let rendered = template.content;
    for (const [key, value] of Object.entries(allValues)) {
      rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    rendered = rendered.replace(
      /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_: string, key: string, content: string) => {
        return allValues[key] ? content : '';
      },
    );

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...tplData } = template;
    const usageCount = (tplData.usageCount || 0) + 1;
    await store.update(templateId, orgId, { ...tplData, usageCount });

    res.json({
      html: rendered,
      templateId,
      templateName: template.name,
      usedPlaceholders: Object.keys(allValues),
    });
  } catch (err: any) {
    return serverError(res, logger, 'saving render template', err);
  }
});

export default router;

/**
 * Client Branding & Template Management API
 *
 * Organization-level branding assets and custom document templates.
 * Data persisted in projectMemoryEntries with category 'client_branding'.
 *
 * @module server/routes/client-branding
 */

import { Router, Request, Response } from 'express';
import { recordAuditRow, type AuditRowOutcome } from '../services/audit/audit-write-outcome';
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

/**
 * Who created this — from the request, never invented.
 *
 * `createdBy` was the literal string 'Current User', so every document template
 * in the store records its author as words nobody is. requireAuthedOrgId has
 * already established an authenticated principal by the time this runs, so a
 * missing identity is an anomaly and the write is refused rather than attributed
 * to a placeholder.
 */
function authorLabel(req: Request): string | null {
  const u = (req as any).user as { id?: unknown; name?: unknown; email?: unknown } | undefined;
  if (!u) return null;
  const name = typeof u.name === 'string' && u.name.trim() !== '' ? u.name.trim() : null;
  const email = typeof u.email === 'string' && u.email.trim() !== '' ? u.email.trim() : null;
  if (name) return name;
  if (email) return email;
  return u.id == null ? null : `user #${String(u.id)}`;
}

/**
 * Report a §11.10(e) audit outcome on a response whose body is a stored record.
 *
 * WO-16C #133. The six audit writes in this router were
 * `await auditService.logAction({…})` at statement position: awaited, and the
 * `AuditWriteResult` it resolved discarded. `logAction` does not reject when
 * persistence fails — an audit-trail outage must not break the action it
 * records — so discarding the value left a recorded branding change and an
 * unrecorded one producing byte-identical responses. All six now go through
 * `recordAuditRow` and the outcome leaves the handler.
 *
 * Where it goes depends on the body. Three of the six answer with a body this
 * file builds itself (`{ logoUrl, updated: true }`,
 * `{ letterheadUrl, updated: true }`, `{ deleted: true }`) and carry the
 * outcome in it under `auditTrail`. The other three answer with the branding or
 * template record itself, and both PATCH handlers in this router merge a
 * caller-supplied body straight over the stored record (settings via
 * `{ ...base, ...req.body }`, templates via `{ ...data, ...req.body }`), so a
 * key added to a record-shaped response becomes a stored field the moment a
 * caller sends that body back. Those three report through headers instead,
 * leaving the record representation byte-identical. No status code changes for
 * either shape.
 *
 * `X-Audit-Row-Persisted` is `'true'` or `'false'`; `X-Audit-Row-Code` is set
 * only on the failure arm and carries `recordAuditRow`'s stable code — never
 * the store's own error text, which stays in that helper's log line. Same
 * header pair as the transparent proxy in
 * server/routes/predicate-intelligence.ts and the 204 in
 * server/routes/submissions.ts.
 */
function setAuditRowHeaders(res: Response, outcome: AuditRowOutcome): void {
  res.setHeader('X-Audit-Row-Persisted', String(outcome.persisted));
  if (!outcome.persisted) res.setHeader('X-Audit-Row-Code', outcome.code);
}

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

    /* WO-16C #133. The branding row is already committed by the `store.update`
       (existing row) or `store.insert` (first row) directly above, so this is
       the §11.10(e) log BESIDE a completed action, not the action itself: a lost
       audit row is not a reason to undo a settings change the tenant can already
       read back. The change stands and the caller is told, through the headers
       rather than the body because this response is the stored settings record
       and the merge two statements up would turn any added key into a stored
       field on the next PATCH. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId,
      action: 'branding_settings_updated',
      resourceType: 'organization',
      resourceId: orgId,
      details: { updatedFields: Object.keys(req.body) },
    });
    setAuditRowHeaders(res, auditTrail);

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

    /* WO-16C #133. The logo bytes are already committed by the `store.update` /
       `store.insert` directly above and are already servable at
       GET /logo/:orgId, so this is the §11.10(e) log beside a completed action.
       A lost row does not un-upload the logo, so nothing is reverted; the
       outcome rides in this handler's own response body, which is not a stored
       record. `auditTrail` is `{ persisted: true, chained }` — `chained: false`
       meaning the tamper-proof store holds it but the retrievable audit_logs row
       does not — or `{ persisted: false, code, message }` when no durable store
       took it. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId,
      action: 'logo_uploaded',
      resourceType: 'organization',
      resourceId: orgId,
      details: { fileName },
    });

    logger.info(`Logo uploaded for org ${orgId}`);
    res.json({ logoUrl, updated: true, auditTrail });
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

    /* WO-16C #133. The letterhead URL is already committed by the
       `store.update` / `store.insert` directly above, so this is the §11.10(e)
       log beside a completed action and a lost row is not a reason to revert it.
       The outcome rides in this handler's own response body, which is not a
       stored record. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId,
      action: 'letterhead_uploaded',
      resourceType: 'organization',
      resourceId: orgId,
      details: { fileName },
    });

    logger.info(`Letterhead uploaded for org ${orgId}`);
    res.json({ letterheadUrl: letterheadUrl, updated: true, auditTrail });
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

    const author = authorLabel(req);
    if (!author) {
      return res.status(403).json({
        error: 'The signed-in user could not be identified, so the template was not created.',
      });
    }

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
      createdBy: author,
    };

    const template = await store.insert(orgId, 'template', name, templateData);

    /* WO-16C #133. The template row is already committed by the `store.insert`
       directly above — its id is in `template.id` and it is already listed by
       GET /templates — so this is the §11.10(e) log beside a completed action.
       The 201 stands and is not downgraded to make room for a reporting field;
       the outcome goes in the headers because the body is the stored template
       record, which the PATCH handler below merges a caller-supplied body over. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId,
      action: 'template_created',
      resourceType: 'document_template',
      resourceId: template.id,
      details: { name, category },
    });
    setAuditRowHeaders(res, auditTrail);

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

    /* WO-16C #133. The edit is already committed by the `store.update` directly
       above, whose row is what `result` holds, so this is the §11.10(e) log
       beside a completed action — and the one that records WHICH fields a user
       changed, which the stored record itself does not keep. It is not a reason
       to roll the edit back. The outcome goes in the headers because this body is
       the stored template record and the merge above would turn any added key
       into a stored field on the next PATCH. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId,
      action: 'template_updated',
      resourceType: 'document_template',
      resourceId: templateId,
      details: { updatedFields: Object.keys(req.body) },
    });
    setAuditRowHeaders(res, auditTrail);

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

    /* WO-16C #133. The soft delete is already committed by the
       `store.update(…, { isActive: false })` directly above, so this is the
       §11.10(e) log beside a completed action: the template has already dropped
       out of GET /templates, which filters on `isActive !== false`, and a lost
       audit row is not a reason to un-delete it. The outcome rides in this
       handler's own response body, which is not a stored record; the 200 and the
       existing `deleted: true` are unchanged. */
    const auditTrail = await recordAuditRow({
      tenantId: orgId,
      action: 'template_deleted',
      resourceType: 'document_template',
      resourceId: templateId,
    });

    res.json({ deleted: true, auditTrail });
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

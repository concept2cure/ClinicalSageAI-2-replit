/**
 * Client Branding & Template Management API
 *
 * Organization-level branding assets and custom document templates.
 * Clients can upload:
 *   - Company logo (PNG/SVG/JPEG)
 *   - Letterhead template (PDF/DOCX)
 *   - Custom document templates for use in eCTD CoAuthor, Report Canvas, AnA
 *   - Brand colors and typography settings
 *
 * All uploads are tenant-scoped and audit-logged.
 *
 * @module server/routes/client-branding
 */

import { Router, Request, Response } from 'express';
import auditService from '../services/auditService';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('client-branding');
const router = Router();

// ── In-memory store (production uses organizations.settings + documentTemplates DB) ──

interface BrandingSettings {
  organizationId: number;
  companyName: string;
  logoUrl: string | null;
  logoBase64: string | null; // For inline embedding in documents
  letterheadUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  headerHtml: string | null; // Custom HTML for document headers
  footerHtml: string | null; // Custom HTML for document footers
  watermarkText: string | null;
  updatedAt: string;
}

interface ClientTemplate {
  id: number;
  organizationId: number;
  name: string;
  description: string;
  category: 'cover_letter' | 'csr_section' | 'protocol' | 'ib' | 'clinical_overview' | 'submission_letter' | 'regulatory_correspondence' | 'custom';
  fileType: string; // docx, pdf, html
  fileUrl: string | null;
  content: string | null; // For HTML templates
  placeholders: Record<string, string>; // Dynamic fields
  isActive: boolean;
  usageCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const brandingStore = new Map<number, BrandingSettings>();
const templateStore = new Map<number, ClientTemplate[]>();
let nextTemplateId = 100;

// Seed default branding for demo org
brandingStore.set(1, {
  organizationId: 1,
  companyName: 'Concept2Cure Biosciences',
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

// Seed demo templates
templateStore.set(1, [
  {
    id: 1,
    organizationId: 1,
    name: 'FDA Cover Letter',
    description: 'Standard cover letter for FDA submissions with company letterhead',
    category: 'cover_letter',
    fileType: 'html',
    fileUrl: null,
    content: `<div style="font-family: {{fontFamily}}; color: {{textColor}};">
<div style="border-bottom: 2px solid {{primaryColor}}; padding-bottom: 16px; margin-bottom: 24px;">
  <div style="display: flex; align-items: center; gap: 12px;">
    {{#if logoUrl}}<img src="{{logoUrl}}" alt="{{companyName}}" style="height: 40px;" />{{/if}}
    <div>
      <div style="font-size: 18px; font-weight: 700; color: {{primaryColor}};">{{companyName}}</div>
      <div style="font-size: 11px; color: #6b7280;">{{companyAddress}}</div>
    </div>
  </div>
</div>
<p>{{date}}</p>
<p>{{recipientName}}<br/>{{recipientTitle}}<br/>{{recipientDivision}}<br/>Food and Drug Administration<br/>{{recipientAddress}}</p>
<p>Re: {{submissionType}} — {{productName}} ({{indicationShort}})</p>
<p>Dear {{recipientName}},</p>
<p>{{bodyContent}}</p>
<p>Sincerely,</p>
<p>{{signatoryName}}<br/>{{signatoryTitle}}<br/>{{companyName}}</p>
</div>`,
    placeholders: {
      companyName: 'Company name',
      companyAddress: 'Company address',
      date: 'Letter date',
      recipientName: 'FDA reviewer name',
      recipientTitle: 'FDA reviewer title',
      recipientDivision: 'FDA division',
      recipientAddress: 'FDA office address',
      submissionType: 'IND/NDA/BLA/510(k)',
      productName: 'Product name',
      indicationShort: 'Brief indication',
      bodyContent: 'Letter body',
      signatoryName: 'Signatory full name',
      signatoryTitle: 'Signatory title',
    },
    isActive: true,
    usageCount: 12,
    createdBy: 'Admin',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 2,
    organizationId: 1,
    name: 'CSR Section Template',
    description: 'Standard Clinical Study Report section template with ICH E3 formatting',
    category: 'csr_section',
    fileType: 'html',
    fileUrl: null,
    content: `<div style="font-family: {{fontFamily}};">
<div style="text-align: center; margin-bottom: 32px;">
  {{#if logoUrl}}<img src="{{logoUrl}}" alt="{{companyName}}" style="height: 36px; margin-bottom: 8px;" />{{/if}}
  <h1 style="font-size: 16px; color: {{primaryColor}};">{{sectionTitle}}</h1>
  <p style="font-size: 12px; color: #6b7280;">{{protocolNumber}} — {{productName}}</p>
  <p style="font-size: 11px; color: #9ca3af;">Version {{versionNumber}} | {{date}} | {{classification}}</p>
</div>
<div>{{bodyContent}}</div>
<div style="border-top: 1px solid #e5e7eb; margin-top: 32px; padding-top: 12px; font-size: 10px; color: #9ca3af;">
  {{companyName}} — Confidential | {{date}} | Page {{pageNumber}} of {{totalPages}}
</div>
</div>`,
    placeholders: {
      sectionTitle: 'Section heading (e.g., "Section 11 — Efficacy Evaluation")',
      protocolNumber: 'Protocol number',
      productName: 'Product name',
      versionNumber: 'Document version',
      date: 'Document date',
      classification: 'Confidentiality level',
      bodyContent: 'Section content',
    },
    isActive: true,
    usageCount: 47,
    createdBy: 'Admin',
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 3,
    organizationId: 1,
    name: 'Regulatory Correspondence',
    description: 'Template for regulatory authority correspondence and information requests',
    category: 'regulatory_correspondence',
    fileType: 'html',
    fileUrl: null,
    content: null,
    placeholders: {
      agency: 'Regulatory agency',
      subject: 'Subject line',
      referenceNumber: 'Submission/application reference',
    },
    isActive: true,
    usageCount: 8,
    createdBy: 'Admin',
    createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
]);

// ── GET /api/client-branding/settings ────────────────────────────────────────
// Returns the branding settings for the current organization.
router.get('/settings', (req: Request, res: Response) => {
  const orgId = Number(req.query.organizationId);
  if (!orgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }
  const settings = brandingStore.get(orgId) || brandingStore.get(1);
  res.json(settings);
});

// ── PATCH /api/client-branding/settings ──────────────────────────────────────
// Update branding settings (colors, fonts, header/footer HTML, watermark).
router.patch('/settings', async (req: Request, res: Response) => {
  const orgId = Number(req.body.organizationId);
  if (!orgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }
  const existing = brandingStore.get(orgId) || brandingStore.get(1)!;

  const updated: BrandingSettings = {
    ...existing,
    ...req.body,
    organizationId: orgId,
    updatedAt: new Date().toISOString(),
  };

  brandingStore.set(orgId, updated);

  await auditService.logAction({
    tenantId: orgId,
    action: 'branding_settings_updated',
    resourceType: 'organization',
    resourceId: orgId,
    details: { updatedFields: Object.keys(req.body) },
  });

  res.json(updated);
});

// ── POST /api/client-branding/upload-logo ────────────────────────────────────
// Upload a company logo. Accepts base64-encoded image data.
router.post('/upload-logo', async (req: Request, res: Response) => {
  const { organizationId, logoBase64, fileName } = req.body;
  const orgId = Number(organizationId);
  if (!orgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }

  if (!logoBase64) {
    return res.status(400).json({ error: 'logoBase64 is required' });
  }

  const existing = brandingStore.get(orgId) || brandingStore.get(1)!;
  existing.logoBase64 = logoBase64;
  existing.logoUrl = `/api/client-branding/logo/${orgId}`;
  existing.updatedAt = new Date().toISOString();
  brandingStore.set(orgId, existing);

  await auditService.logAction({
    tenantId: orgId,
    action: 'logo_uploaded',
    resourceType: 'organization',
    resourceId: orgId,
    details: { fileName },
  });

  logger.info(`Logo uploaded for org ${orgId}`);
  res.json({ logoUrl: existing.logoUrl, updated: true });
});

// ── GET /api/client-branding/logo/:orgId ─────────────────────────────────────
// Serve the organization logo.
router.get('/logo/:orgId', (req: Request, res: Response) => {
  const orgId = parseInt(req.params.orgId, 10);
  const settings = brandingStore.get(orgId);
  if (!settings?.logoBase64) {
    return res.status(404).json({ error: 'No logo uploaded' });
  }

  // Extract MIME type and data from base64
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
});

// ── POST /api/client-branding/upload-letterhead ──────────────────────────────
// Upload a company letterhead template.
router.post('/upload-letterhead', async (req: Request, res: Response) => {
  const { organizationId, letterheadBase64, fileName } = req.body;
  const orgId = Number(organizationId);
  if (!orgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }

  if (!letterheadBase64) {
    return res.status(400).json({ error: 'letterheadBase64 is required' });
  }

  const existing = brandingStore.get(orgId) || brandingStore.get(1)!;
  existing.letterheadUrl = `/api/client-branding/letterhead/${orgId}`;
  existing.updatedAt = new Date().toISOString();
  brandingStore.set(orgId, existing);

  await auditService.logAction({
    tenantId: orgId,
    action: 'letterhead_uploaded',
    resourceType: 'organization',
    resourceId: orgId,
    details: { fileName },
  });

  logger.info(`Letterhead uploaded for org ${orgId}`);
  res.json({ letterheadUrl: existing.letterheadUrl, updated: true });
});

// ── GET /api/client-branding/templates ───────────────────────────────────────
// List all custom templates for the organization.
router.get('/templates', (req: Request, res: Response) => {
  const orgId = Number(req.query.organizationId);
  if (!orgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }
  const category = req.query.category as string | undefined;
  let templates = templateStore.get(orgId) || [];

  if (category) {
    templates = templates.filter(t => t.category === category);
  }

  res.json(templates.filter(t => t.isActive));
});

// ── GET /api/client-branding/templates/:id ───────────────────────────────────
// Get a single template with its content and placeholders.
router.get('/templates/:id', (req: Request, res: Response) => {
  const templateId = parseInt(req.params.id, 10);
  const orgId = Number(req.query.organizationId);
  if (!orgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }
  const templates = templateStore.get(orgId) || [];
  const template = templates.find(t => t.id === templateId);

  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  res.json(template);
});

// ── POST /api/client-branding/templates ──────────────────────────────────────
// Create a new custom template.
router.post('/templates', async (req: Request, res: Response) => {
  const {
    organizationId,
    name,
    description,
    category,
    fileType,
    content,
    placeholders,
  } = req.body;

  if (!name || !category) {
    return res.status(400).json({ error: 'name and category are required' });
  }

  const orgId = Number(organizationId);
  if (!orgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }
  const template: ClientTemplate = {
    id: nextTemplateId++,
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!templateStore.has(orgId)) {
    templateStore.set(orgId, []);
  }
  templateStore.get(orgId)!.push(template);

  await auditService.logAction({
    tenantId: orgId,
    action: 'template_created',
    resourceType: 'document_template',
    resourceId: template.id,
    details: { name, category },
  });

  logger.info(`Template ${template.id} created: ${name} [${category}]`);
  res.status(201).json(template);
});

// ── PATCH /api/client-branding/templates/:id ─────────────────────────────────
// Update an existing template.
router.patch('/templates/:id', async (req: Request, res: Response) => {
  const templateId = parseInt(req.params.id, 10);
  const orgId = Number(req.body.organizationId);
  if (!orgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }
  const templates = templateStore.get(orgId) || [];
  const template = templates.find(t => t.id === templateId);

  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  Object.assign(template, {
    ...req.body,
    id: template.id,
    organizationId: template.organizationId,
    updatedAt: new Date().toISOString(),
  });

  await auditService.logAction({
    tenantId: orgId,
    action: 'template_updated',
    resourceType: 'document_template',
    resourceId: templateId,
    details: { updatedFields: Object.keys(req.body) },
  });

  res.json(template);
});

// ── DELETE /api/client-branding/templates/:id ────────────────────────────────
// Soft-delete a template (mark inactive).
router.delete('/templates/:id', async (req: Request, res: Response) => {
  const templateId = parseInt(req.params.id, 10);
  const orgId = Number(req.query.organizationId);
  if (!orgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }
  const templates = templateStore.get(orgId) || [];
  const template = templates.find(t => t.id === templateId);

  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  template.isActive = false;

  await auditService.logAction({
    tenantId: orgId,
    action: 'template_deleted',
    resourceType: 'document_template',
    resourceId: templateId,
  });

  res.json({ deleted: true });
});

// ── GET /api/client-branding/render-template/:id ─────────────────────────────
// Render a template with provided placeholder values and org branding.
router.post('/render-template/:id', (req: Request, res: Response) => {
  const templateId = parseInt(req.params.id, 10);
  const orgId = Number(req.body.organizationId);
  if (!orgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }
  const values = req.body.values || {};

  const templates = templateStore.get(orgId) || [];
  const template = templates.find(t => t.id === templateId);
  if (!template || !template.content) {
    return res.status(404).json({ error: 'Template not found or has no renderable content' });
  }

  const branding = brandingStore.get(orgId) || brandingStore.get(1)!;

  // Merge branding values with provided values
  const allValues: Record<string, string> = {
    companyName: branding.companyName,
    primaryColor: branding.primaryColor,
    secondaryColor: branding.secondaryColor,
    accentColor: branding.accentColor,
    fontFamily: branding.fontFamily,
    logoUrl: branding.logoUrl || '',
    textColor: '#1e293b',
    ...values,
  };

  // Replace template placeholders
  let rendered = template.content;
  for (const [key, value] of Object.entries(allValues)) {
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  // Handle conditional blocks
  rendered = rendered.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, content) => {
    return allValues[key] ? content : '';
  });

  // Increment usage count
  template.usageCount++;

  res.json({
    html: rendered,
    templateId,
    templateName: template.name,
    usedPlaceholders: Object.keys(allValues),
  });
});

export default router;

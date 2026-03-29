/**
 * Knowledge Base BFF Proxy — Phase 7.1
 *
 * Server-side proxy to Shadow Service /knowledge/* endpoints.
 * Keeps REVIEW_ADMIN_TOKEN server-side only; the browser never sees it.
 *
 * Mounted at: /api/knowledge-base
 *
 * Routes proxied:
 *   POST /upload                     → /knowledge/ingest-files  (multipart)
 *   GET  /context/:projectId         → /knowledge/project-context/{id}
 *   POST /generate-docx              → /knowledge/generate-docx
 *   POST /generate-ind-package       → /knowledge/generate-ind-package
 *   POST /generate-ind-section       → /knowledge/generate-ind-section
 *
 * Env vars:
 *   SHADOW_SERVICE_URL   — default http://localhost:8001
 *   REVIEW_ADMIN_TOKEN   — shared admin token
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth.js';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  AlignmentType,
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  WidthType,
} from 'docx';
import { db } from '../db.js';
import { eq, desc } from 'drizzle-orm';
import { cmcProjects, drugSubstances, drugProducts } from '../../shared/cmc-schema.js';
import {
  concept2cureArtifacts,
  concept2cureArtifactVersions,
  concept2cureProvenanceEvents,
} from '../../shared/schema.js';
import crypto from 'crypto';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────────────────
// Config helpers
// ─────────────────────────────────────────────────────────────────────────────

function shadowUrl(): string {
  return process.env.SHADOW_SERVICE_URL || 'http://localhost:8001';
}

function adminToken(): string {
  return process.env.REVIEW_ADMIN_TOKEN || '';
}

function requireToken(res: Response): boolean {
  if (!adminToken()) {
    res
      .status(503)
      .json({ error: 'Knowledge Base not configured', detail: 'REVIEW_ADMIN_TOKEN is not set' });
    return false;
  }
  return true;
}

/**
 * Emit provenance event for knowledge-base generated documents.
 */
async function emitKBProvenanceEvent(params: {
  artifactDbId: number;
  organizationId: number;
  eventType: string;
  eventAction: string;
  actorId?: number;
  actorName?: string;
  details?: Record<string, unknown>;
  sourceDescription?: string;
  backendRoute?: string;
  ipAddress?: string;
}) {
  try {
    if (!db) return null;
    const eventId = `prov_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    await db.insert(concept2cureProvenanceEvents).values({
      eventId,
      artifactId: params.artifactDbId,
      organizationId: params.organizationId,
      eventType: params.eventType,
      eventAction: params.eventAction,
      actorId: params.actorId || null,
      actorName: params.actorName || null,
      actorEmail: null,
      details: params.details || {},
      sourceArtifactId: null,
      sourceDescription: params.sourceDescription || null,
      backendRoute: params.backendRoute || null,
      backendService: 'knowledge-base',
      ipAddress: params.ipAddress || null,
    });
    return eventId;
  } catch (err: any) {
    console.warn('[knowledge-base] Provenance emit failed:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — proxy a JSON request, return raw response
// ─────────────────────────────────────────────────────────────────────────────

async function proxyJson(
  path: string,
  method: string,
  body?: unknown,
  queryParams?: Record<string, string>
): Promise<{ status: number; body: string; contentType: string }> {
  const url = new URL(path, shadowUrl());
  if (queryParams) {
    for (const [k, v] of Object.entries(queryParams)) {
      if (v) url.searchParams.set(k, v);
    }
  }
  const headers: Record<string, string> = { 'X-Admin-Token': adminToken() };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const resp = await fetch(url.toString(), init);
  const text = await resp.text();
  return {
    status: resp.status,
    body: text,
    contentType: resp.headers.get('content-type') || 'application/json',
  };
}

// Helper — proxy and pipe binary (DOCX) response
async function proxyBinary(
  path: string,
  method: string,
  body: unknown,
  res: Response
): Promise<void> {
  const url = new URL(path, shadowUrl());
  const resp = await fetch(url.toString(), {
    method,
    headers: {
      'X-Admin-Token': adminToken(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  // Copy status + headers that matter
  res.status(resp.status);
  const cd = resp.headers.get('content-disposition');
  if (cd) res.setHeader('Content-Disposition', cd);
  const ct = resp.headers.get('content-type') || 'application/octet-stream';
  res.setHeader('Content-Type', ct);

  const xsg = resp.headers.get('x-sections-generated');
  const xsf = resp.headers.get('x-sections-failed');
  if (xsg) res.setHeader('X-Sections-Generated', xsg);
  if (xsf) res.setHeader('X-Sections-Failed', xsf);

  const buf = await resp.arrayBuffer();
  res.send(Buffer.from(buf));
}

// ─────────────────────────────────────────────────────────────────────────────
// Node-side DOCX fallback when Shadow Service is unreachable
// ─────────────────────────────────────────────────────────────────────────────

interface DocxSection {
  title: string;
  content: string;
  sectionCode?: string;
}

/**
 * Decode common HTML entities to plain text.
 */
function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(parseInt(n, 10)));
}

/**
 * Parse inline HTML into formatted TextRun[] preserving bold/italic/underline/etc.
 */
function parseInlineHtml(html: string): TextRun[] {
  const runs: TextRun[] = [];
  const tagStack: string[] = [];
  let i = 0;
  let textBuf = '';

  const flushText = (): void => {
    if (textBuf) {
      const decoded = decodeHtmlEntities(textBuf);
      if (decoded.trim() || decoded === ' ') {
        const opts: Record<string, unknown> = { text: decoded };
        for (const tag of tagStack) {
          const t = tag.toLowerCase();
          if (t === 'strong' || t === 'b') opts.bold = true;
          if (t === 'em' || t === 'i') opts.italics = true;
          if (t === 'u') opts.underline = { type: 'single' };
          if (t === 's' || t === 'del' || t === 'strike') opts.strike = true;
          if (t === 'sup') opts.superScript = true;
          if (t === 'sub') opts.subScript = true;
          if (t === 'mark') opts.shading = { fill: 'FFFF00' };
        }
        runs.push(new TextRun(opts as any));
      }
      textBuf = '';
    }
  };

  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) { textBuf += html[i]; i++; continue; }
      const tagFull = html.slice(i + 1, end).trim();
      const isClosing = tagFull.startsWith('/');
      const tagName = (isClosing ? tagFull.slice(1) : tagFull.split(/[\s/]/)[0]).toLowerCase();
      if (tagName === 'br') { flushText(); runs.push(new TextRun({ break: 1 } as any)); i = end + 1; continue; }
      if (['img', 'hr', 'input'].includes(tagName) || tagFull.endsWith('/')) { i = end + 1; continue; }
      if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ul', 'ol',
        'table', 'tr', 'td', 'th', 'thead', 'tbody', 'blockquote', 'pre', 'code'].includes(tagName)) {
        i = end + 1; continue;
      }
      flushText();
      if (isClosing) {
        const idx = tagStack.lastIndexOf(tagName);
        if (idx !== -1) tagStack.splice(idx, 1);
      } else {
        tagStack.push(tagName);
      }
      i = end + 1;
    } else {
      textBuf += html[i];
      i++;
    }
  }
  flushText();
  return runs.length > 0 ? runs : [new TextRun({ text: '' })];
}

/**
 * Parse HTML content into DOCX paragraph/table elements, preserving formatting.
 */
function htmlToDocxElements(html: string): (Paragraph | DocxTable)[] {
  const elements: (Paragraph | DocxTable)[] = [];
  let processed = html;

  // Extract tables first (complex nested structure)
  const tablePlaceholders: DocxTable[] = [];
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  processed = processed.replace(tableRegex, (_: string, tableContent: string) => {
    const rows: DocxTableRow[] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
      const cells: DocxTableCell[] = [];
      const cellRegex = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        const isHeader = cellMatch[1].toLowerCase() === 'th';
        const cellRuns = isHeader
          ? parseInlineHtml(`<strong>${cellMatch[2]}</strong>`)
          : parseInlineHtml(cellMatch[2]);
        cells.push(new DocxTableCell({
          children: [new Paragraph({ children: cellRuns })],
          width: { size: 100, type: WidthType.AUTO },
        }));
      }
      if (cells.length > 0) {
        rows.push(new DocxTableRow({ children: cells }));
      }
    }
    if (rows.length > 0) {
      tablePlaceholders.push(new DocxTable({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      }));
      return `\n__TABLE_${tablePlaceholders.length - 1}__\n`;
    }
    return '';
  });

  // Split remaining content by block-level closing tags
  const lines = processed
    .replace(/<\/(p|div|h[1-6]|blockquote|pre|li)>/gi, '\n')
    .split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Table placeholder
    const tableMatch = line.match(/^__TABLE_(\d+)__$/);
    if (tableMatch) {
      const idx = parseInt(tableMatch[1], 10);
      if (tablePlaceholders[idx]) elements.push(tablePlaceholders[idx]);
      continue;
    }

    // Headings (h1-h4)
    const hMatch = line.match(/^<h([1-6])([^>]*)>([\s\S]*?)$/i);
    if (hMatch) {
      const level = parseInt(hMatch[1], 10);
      const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
        1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4,
      };
      const alignMatch = (hMatch[2] || '').match(/text-align:\s*(center|right|justify)/i);
      const alignment = alignMatch
        ? ({ center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED } as any)[alignMatch[1].toLowerCase()]
        : undefined;
      elements.push(new Paragraph({
        children: parseInlineHtml(hMatch[3]),
        heading: headingMap[level] || HeadingLevel.HEADING_4,
        spacing: { before: level === 1 ? 400 : 240, after: 120 },
        ...(alignment ? { alignment } : {}),
      }));
      continue;
    }

    // Blockquote
    if (line.match(/^<blockquote/i)) {
      const content = line.replace(/<\/?blockquote[^>]*>/gi, '').replace(/<\/?p[^>]*>/gi, '');
      const bqRuns = parseInlineHtml(`<em>${content}</em>`);
      elements.push(new Paragraph({
        children: bqRuns,
        indent: { left: 720 },
        spacing: { before: 120, after: 120 },
      }));
      continue;
    }

    // List items
    const liMatch = line.match(/^<li[^>]*>([\s\S]*?)$/i);
    if (liMatch) {
      elements.push(new Paragraph({
        children: parseInlineHtml(liMatch[1]),
        bullet: { level: 0 },
        spacing: { after: 60 },
      }));
      continue;
    }

    // Horizontal rule
    if (line.match(/^<hr/i)) {
      elements.push(new Paragraph({
        children: [new TextRun({ text: '\u2500'.repeat(60), color: 'CCCCCC', size: 16 })],
        spacing: { before: 200, after: 200 },
      }));
      continue;
    }

    // Regular paragraph
    const pMatch = line.match(/^<p([^>]*)>([\s\S]*?)$/i);
    const content = pMatch ? pMatch[2] : line.replace(/<[/]?(?:div|span)[^>]*>/gi, '');
    const stripped = content.replace(/<[^>]*>/g, '').trim();
    if (!stripped) continue;

    const alignMatch = pMatch ? (pMatch[1] || '').match(/text-align:\s*(center|right|justify)/i) : null;
    const alignment = alignMatch
      ? ({ center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED } as any)[alignMatch[1].toLowerCase()]
      : undefined;

    elements.push(new Paragraph({
      children: parseInlineHtml(content),
      spacing: { after: 120 },
      ...(alignment ? { alignment } : {}),
    }));
  }

  return elements;
}

async function renderDocxNodeFallback(
  title: string,
  sections: DocxSection[],
  submissionType?: string
): Promise<Buffer> {
  const children: (Paragraph | DocxTable)[] = [];

  // Title page
  children.push(
    new Paragraph({
      text: title || 'Regulatory Document',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  if (submissionType) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Submission Type: ${submissionType}`,
            italics: true,
            size: 22,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
      })
    );
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated: ${new Date().toISOString().split('T')[0]}`,
          size: 20,
          color: '666666',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 },
    })
  );

  // Render each section with formatting-aware HTML parsing
  for (const section of sections) {
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );

    if (section.sectionCode) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Section: ${section.sectionCode}`,
              italics: true,
              size: 20,
              color: '888888',
            }),
          ],
          spacing: { after: 100 },
        })
      );
    }

    const content = section.content || '';
    if (!content.trim() || content.trim() === '<p></p>') {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: '[Section content pending]', italics: true, color: '999999' }),
          ],
        })
      );
    } else {
      const docxElements = htmlToDocxElements(content);
      children.push(...docxElements);
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/knowledge-base/upload
// Accepts multipart/form-data with project_id (field) + files[]
// ═════════════════════════════════════════════════════════════════════════════

router.post('/upload', upload.array('files'), async (req: Request, res: Response) => {
  if (!requireToken(res)) return;
  const projectId = String(req.body?.project_id || '');
  if (!projectId) return void res.status(422).json({ error: 'project_id is required' });

  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return void res.status(422).json({ error: 'At least one file is required' });
  }

  try {
    // Re-assemble as FormData for the Python service
    const form = new FormData();
    form.append('project_id', projectId);
    for (const f of files) {
      form.append('files', new Blob([f.buffer], { type: f.mimetype }), f.originalname);
    }

    const url = new URL('/knowledge/ingest-files', shadowUrl());
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'X-Admin-Token': adminToken() },
      body: form,
    });
    const json = await resp.json();
    res.status(resp.status).json(json);
  } catch (err: any) {
    console.error('[knowledge-base] upload proxy error:', err.message);
    res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/knowledge-base/context/:projectId
// ═════════════════════════════════════════════════════════════════════════════

router.get('/context/:projectId', async (req: Request, res: Response) => {
  if (!requireToken(res)) return;
  const { projectId } = req.params;

  try {
    const qp: Record<string, string> = {};
    if (req.query.max_chars_per_doc) qp.max_chars_per_doc = String(req.query.max_chars_per_doc);
    if (req.query.max_total_chars) qp.max_total_chars = String(req.query.max_total_chars);

    const result = await proxyJson(`/knowledge/project-context/${projectId}`, 'GET', undefined, qp);
    res.status(result.status).type(result.contentType).send(result.body);
  } catch (err: any) {
    console.error('[knowledge-base] context proxy error:', err.message);
    res.status(502).json({ error: 'Shadow service unreachable', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/knowledge-base/generate-docx
// ═════════════════════════════════════════════════════════════════════════════

router.post('/generate-docx', async (req: Request, res: Response) => {
  try {
    // Try shadow service first
    await proxyBinary('/knowledge/generate-docx', 'POST', req.body, res);
  } catch (err: any) {
    console.warn('[knowledge-base] Shadow service unavailable, using Node DOCX fallback');
    try {
      const { title, sections, submissionType, content } = req.body;
      const docSections: DocxSection[] =
        Array.isArray(sections) && sections.length > 0
          ? sections
          : [{ title: title || 'Document', content: content || '', sectionCode: '' }];

      const buffer = await renderDocxNodeFallback(
        title || 'Regulatory Document',
        docSections,
        submissionType
      );

      const filename = `${(title || 'document').replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (fallbackErr: any) {
      console.error('[knowledge-base] Node DOCX fallback also failed:', fallbackErr.message);
      res.status(500).json({ error: 'DOCX generation failed', detail: fallbackErr.message });
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/knowledge-base/generate-ind-package
// ═════════════════════════════════════════════════════════════════════════════

router.post('/generate-ind-package', async (req: Request, res: Response) => {
  try {
    await proxyBinary('/knowledge/generate-ind-package', 'POST', req.body, res);
  } catch (err: any) {
    console.warn(
      '[knowledge-base] Shadow service unavailable for IND package, using Node fallback'
    );
    try {
      const { project_id, sections: reqSections, drug_name, sponsor, indication } = req.body;

      // Build IND package sections from known CTD structure
      const indSections: DocxSection[] =
        reqSections && Array.isArray(reqSections) && reqSections.length > 0
          ? reqSections
          : [
              {
                title: '1. Administrative Information',
                content: `Sponsor: ${sponsor || 'Not specified'}\nDrug Name: ${drug_name || 'Not specified'}\nIndication: ${indication || 'Not specified'}`,
                sectionCode: 'M1',
              },
              { title: '2. Clinical Overview', content: '[To be completed]', sectionCode: 'M2.5' },
              {
                title: '3. Quality (CMC) Summary',
                content: '[To be completed]',
                sectionCode: 'M2.3',
              },
              {
                title: '4. Nonclinical Overview',
                content: '[To be completed]',
                sectionCode: 'M2.4',
              },
              {
                title: '5. Clinical Protocol Synopsis',
                content: '[To be completed]',
                sectionCode: 'M5',
              },
            ];

      const buffer = await renderDocxNodeFallback(
        `IND Package — ${drug_name || 'Investigational Drug'}`,
        indSections,
        'IND'
      );

      const filename = `IND_Package_${(drug_name || 'drug').replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (fallbackErr: any) {
      console.error('[knowledge-base] Node IND fallback failed:', fallbackErr.message);
      res.status(500).json({ error: 'IND package generation failed', detail: fallbackErr.message });
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/knowledge-base/generate-ind-section
// ═════════════════════════════════════════════════════════════════════════════

router.post('/generate-ind-section', async (req: Request, res: Response) => {
  try {
    const result = await proxyJson('/knowledge/generate-ind-section', 'POST', req.body);
    res.status(result.status).type(result.contentType).send(result.body);
  } catch (err: any) {
    console.warn('[knowledge-base] Shadow service unavailable for IND section, returning scaffold');
    const { section_code, section_title, drug_name } = req.body;
    res.json({
      section_code: section_code || 'unknown',
      title: section_title || 'IND Section',
      content: `<h1>${section_title || 'IND Section'}</h1>\n<p>This section for ${drug_name || 'the investigational drug'} requires authoring. Use the Document Editor to draft content with Regulatory Intelligence assistance.</p>`,
      status: 'scaffold',
      generated_by: 'node-fallback',
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/knowledge-base/generate-module3-docx
// CMC data → Module 3 (Quality) DOCX document
// Accepts explicit payload OR cmcProjectId to fetch from DB
// ═════════════════════════════════════════════════════════════════════════════

router.post('/generate-module3-docx', async (req: Request, res: Response) => {
  try {
    let {
      drug_name,
      substance_name,
      molecular_formula,
      molecular_weight,
      dosage_form,
      strength,
      route_of_administration,
      manufacturing_process,
      specifications,
      stability_data,
      impurities_profile,
      composition,
    } = req.body;

    const { cmcProjectId, saveAsArtifact, projectId: artifactProjectId } = req.body;

    // If cmcProjectId provided, fetch real data from DB
    if (cmcProjectId && db) {
      try {
        const [cmcProject] = await db
          .select()
          .from(cmcProjects)
          .where(eq(cmcProjects.id, cmcProjectId));
        if (cmcProject) {
          drug_name = drug_name || cmcProject.drugName;
          dosage_form = dosage_form || cmcProject.dosageForm;
        }

        const substances = await db
          .select()
          .from(drugSubstances)
          .where(eq(drugSubstances.projectId, cmcProjectId));
        if (substances.length > 0) {
          const s = substances[0];
          substance_name = substance_name || s.substanceName;
          molecular_formula = molecular_formula || s.molecularFormula;
          molecular_weight = molecular_weight || s.molecularWeight;
          manufacturing_process = manufacturing_process || s.manufacturingRoute;
          specifications = specifications || s.specifications;
          stability_data = stability_data || s.stability;
          impurities_profile = impurities_profile || s.impurities;
        }

        const products = await db
          .select()
          .from(drugProducts)
          .where(eq(drugProducts.projectId, cmcProjectId));
        if (products.length > 0) {
          const p = products[0];
          dosage_form = dosage_form || p.dosageForm;
          strength = strength || p.strength;
          route_of_administration = route_of_administration || p.routeOfAdministration;
          composition = composition || p.formulation || p.excipients;
          stability_data = stability_data || p.stabilityData;
        }

        console.log(
          `[knowledge-base] Module 3: loaded CMC data from project ${cmcProjectId} (drug: ${drug_name})`
        );
      } catch (dbErr: any) {
        console.warn(`[knowledge-base] Could not load CMC project data: ${dbErr.message}`);
      }
    } else if (!drug_name && !substance_name && db) {
      // No explicit data and no cmcProjectId — try to find the first CMC project for this org
      try {
        const user = (req as any).user;
        const orgId = user?.organizationId?.toString();
        if (orgId) {
          const cmcProjectsList = await db
            .select()
            .from(cmcProjects)
            .where(eq(cmcProjects.organizationId, orgId))
            .orderBy(desc(cmcProjects.updatedAt))
            .limit(1);
          if (cmcProjectsList.length > 0) {
            const cp = cmcProjectsList[0];
            drug_name = cp.drugName;
            dosage_form = cp.dosageForm;

            const substances = await db
              .select()
              .from(drugSubstances)
              .where(eq(drugSubstances.projectId, cp.id));
            if (substances.length > 0) {
              const s = substances[0];
              substance_name = s.substanceName;
              molecular_formula = s.molecularFormula;
              molecular_weight = s.molecularWeight;
              specifications = s.specifications;
              stability_data = s.stability;
              impurities_profile = s.impurities;
            }

            const products = await db
              .select()
              .from(drugProducts)
              .where(eq(drugProducts.projectId, cp.id));
            if (products.length > 0) {
              const p = products[0];
              dosage_form = dosage_form || p.dosageForm;
              strength = p.strength;
              route_of_administration = p.routeOfAdministration;
              composition = p.formulation;
            }
            console.log(
              `[knowledge-base] Module 3: auto-loaded CMC project "${cp.name}" for org ${orgId}`
            );
          }
        }
      } catch (autoLoadErr: any) {
        console.warn('[knowledge-base] Auto-load CMC project failed:', autoLoadErr.message);
      }
    }

    const sections: DocxSection[] = [
      {
        title: '3.2.S Drug Substance',
        sectionCode: '3.2.S',
        content: [
          `Substance Name: ${substance_name || drug_name || 'Not specified'}`,
          molecular_formula ? `Molecular Formula: ${molecular_formula}` : '',
          molecular_weight ? `Molecular Weight: ${molecular_weight}` : '',
          '',
          '3.2.S.1 General Information',
          `The drug substance ${substance_name || drug_name || '[name]'} is described in this section per ICH M4Q guidelines.`,
          '',
          '3.2.S.2 Manufacture',
          typeof manufacturing_process === 'string'
            ? manufacturing_process
            : 'Manufacturing process details to be provided.',
          '',
          '3.2.S.3 Characterization',
          impurities_profile
            ? `Impurities Profile: ${typeof impurities_profile === 'string' ? impurities_profile : JSON.stringify(impurities_profile)}`
            : 'Characterization data to be provided.',
          '',
          '3.2.S.4 Control of Drug Substance',
          specifications
            ? `Specifications: ${typeof specifications === 'string' ? specifications : JSON.stringify(specifications)}`
            : 'Specifications to be provided.',
          '',
          '3.2.S.7 Stability',
          stability_data
            ? `Stability Data: ${typeof stability_data === 'string' ? stability_data : JSON.stringify(stability_data)}`
            : 'Stability data to be provided per ICH Q1A guidelines.',
        ]
          .filter(Boolean)
          .join('\n'),
      },
      {
        title: '3.2.P Drug Product',
        sectionCode: '3.2.P',
        content: [
          dosage_form ? `Dosage Form: ${dosage_form}` : '',
          strength ? `Strength: ${strength}` : '',
          route_of_administration ? `Route: ${route_of_administration}` : '',
          '',
          '3.2.P.1 Description and Composition',
          composition
            ? `Composition: ${typeof composition === 'string' ? composition : JSON.stringify(composition)}`
            : 'Composition details to be provided.',
          '',
          '3.2.P.2 Pharmaceutical Development',
          'Development history and rationale to be provided.',
          '',
          '3.2.P.3 Manufacture',
          'Manufacturing process and controls to be provided.',
          '',
          '3.2.P.5 Control of Drug Product',
          'Product specifications and analytical procedures to be provided.',
          '',
          '3.2.P.8 Stability',
          'Drug product stability data per ICH Q1A to be provided.',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];

    const buffer = await renderDocxNodeFallback(
      `Module 3 – Quality (CMC): ${drug_name || substance_name || 'Drug'}`,
      sections,
      'CTD Module 3'
    );

    const filename = `Module3_CMC_${(drug_name || substance_name || 'drug').replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`;

    // If saveAsArtifact is requested, also persist as a project artifact
    if (saveAsArtifact && artifactProjectId && db) {
      try {
        const user = (req as any).user;
        const parsedProjId = parseInt(artifactProjectId, 10);
        const orgId = user?.organizationId;
        if (isNaN(parsedProjId) || !orgId) {
          console.warn('[knowledge-base] Skipping artifact save: invalid projectId or missing org');
        } else {
          const docTitle = `Module 3 – Quality (CMC): ${drug_name || substance_name || 'Drug'}`;
          const htmlContent = sections
            .map(s => `<h2>${s.title}</h2><pre>${s.content}</pre>`)
            .join('');
          const artifactId = `artifact_${crypto.randomUUID()}`;
          const contentHash = crypto.createHash('sha256').update(htmlContent).digest('hex');

          await db.insert(concept2cureArtifacts).values({
            artifactId,
            projectId: parsedProjId,
            organizationId: orgId,
            type: 'regulatory_document',
            category: 'document',
            title: docTitle,
            content: htmlContent,
            contentHash,
            version: 1,
            ctdSection: '3.2',
            status: 'draft',
            createdById: user?.id || null,
          });

          // Also create first version record
          const [inserted] = await db
            .select()
            .from(concept2cureArtifacts)
            .where(eq(concept2cureArtifacts.artifactId, artifactId));
          if (inserted) {
            await db.insert(concept2cureArtifactVersions).values({
              artifactId: inserted.id,
              organizationId: orgId,
              version: 1,
              content: htmlContent,
              contentHash,
              createdById: user?.id || null,
            });

            // Emit provenance events for Module 3 generation
            // 1. Generation event
            await emitKBProvenanceEvent({
              artifactDbId: inserted.id,
              organizationId: orgId,
              eventType: 'generation',
              eventAction: 'ai_generate',
              actorId: user?.id,
              actorName: user?.name || user?.email,
              details: {
                generationMethod: 'template_with_structured_data',
                template: 'CTD Module 3 – Quality (CMC)',
                ctdSection: '3.2',
                drugName: drug_name,
                substanceName: substance_name,
                cmcProjectId: cmcProjectId || null,
                contentHash,
                contentLength: htmlContent.length,
              },
              sourceDescription: cmcProjectId
                ? `Generated Module 3 from CMC project ${cmcProjectId}`
                : 'Generated Module 3 from manual input data',
              backendRoute: 'POST /api/knowledge-base/generate-module3-docx',
            });

            // 2. Source input events — track what fed the document
            if (cmcProjectId) {
              await emitKBProvenanceEvent({
                artifactDbId: inserted.id,
                organizationId: orgId,
                eventType: 'source_input',
                eventAction: 'cmc_data_load',
                actorId: user?.id,
                details: {
                  cmcProjectId,
                  dataFields: {
                    drugName: !!drug_name,
                    substanceName: !!substance_name,
                    molecularFormula: !!molecular_formula,
                    molecularWeight: !!molecular_weight,
                    dosageForm: !!dosage_form,
                    strength: !!strength,
                    routeOfAdministration: !!route_of_administration,
                    manufacturingProcess: !!manufacturing_process,
                    specifications: !!specifications,
                    stabilityData: !!stability_data,
                    impuritiesProfile: !!impurities_profile,
                    composition: !!composition,
                  },
                },
                sourceDescription: `CMC structured data from project ${cmcProjectId}`,
                backendRoute: 'POST /api/knowledge-base/generate-module3-docx',
              });
            }
          }

          console.log(
            `[knowledge-base] Module 3 also saved as artifact ${artifactId} in project ${artifactProjectId}`
          );
        }
      } catch (artErr: any) {
        console.warn(`[knowledge-base] Could not save Module 3 as artifact: ${artErr.message}`);
      }
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    console.error('[knowledge-base] Module 3 DOCX generation failed:', err.message);
    res.status(500).json({ error: 'Module 3 DOCX generation failed', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/knowledge-base/cmc-project-data
// Fetch the active CMC project's drug substance and product data
// ═════════════════════════════════════════════════════════════════════════════
router.get('/cmc-project-data', async (req: Request, res: Response) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not available' });
    }
    const user = (req as any).user;
    const orgId = user?.organizationId?.toString();
    const cmcProjectId = req.query.cmcProjectId as string | undefined;

    let project: any = null;
    if (cmcProjectId) {
      const [p] = await db.select().from(cmcProjects).where(eq(cmcProjects.id, cmcProjectId));
      project = p;
    } else if (orgId) {
      const [p] = await db
        .select()
        .from(cmcProjects)
        .where(eq(cmcProjects.organizationId, orgId))
        .orderBy(desc(cmcProjects.updatedAt))
        .limit(1);
      project = p;
    }

    if (!project) {
      return res.json({ success: true, data: null, message: 'No CMC project found' });
    }

    const substances = await db
      .select()
      .from(drugSubstances)
      .where(eq(drugSubstances.projectId, project.id));
    const products = await db
      .select()
      .from(drugProducts)
      .where(eq(drugProducts.projectId, project.id));

    res.json({
      success: true,
      data: {
        project: {
          id: project.id,
          name: project.name,
          drugName: project.drugName,
          drugType: project.drugType,
          dosageForm: project.dosageForm,
          indication: project.indication,
          developmentStage: project.developmentStage,
        },
        drugSubstances: substances,
        drugProducts: products,
      },
    });
  } catch (err: any) {
    console.error('[knowledge-base] CMC project data fetch failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch CMC project data' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/knowledge-base/save-docx-as-artifact
// Save generated DOCX content as a project artifact for in-platform access
// ═════════════════════════════════════════════════════════════════════════════
router.post('/save-docx-as-artifact', async (req: Request, res: Response) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const { projectId, title, htmlContent, ctdSection, type } = req.body;
    if (!projectId || !title || !htmlContent) {
      return res.status(400).json({ error: 'projectId, title, and htmlContent are required' });
    }
    if (typeof htmlContent === 'string' && htmlContent.trim().length === 0) {
      return res.status(400).json({ error: 'Content must not be empty — no empty artifact creation allowed' });
    }

    const user = (req as any).user;
    const orgId = user?.organizationId;
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const parsedProjectId = parseInt(projectId, 10);
    if (isNaN(parsedProjectId)) {
      return res.status(400).json({ error: 'projectId must be a valid integer' });
    }
    const artifactId = `artifact_${crypto.randomUUID()}`;
    const contentHash = crypto.createHash('sha256').update(htmlContent).digest('hex');

    await db.insert(concept2cureArtifacts).values({
      artifactId,
      projectId: parsedProjectId,
      organizationId: orgId,
      type: type || 'regulatory_document',
      category: 'document',
      title,
      content: htmlContent,
      contentHash,
      version: 1,
      ctdSection: ctdSection || null,
      status: 'draft',
      createdById: user?.id || null,
    });

    // Create version record
    const [inserted] = await db
      .select()
      .from(concept2cureArtifacts)
      .where(eq(concept2cureArtifacts.artifactId, artifactId));
    if (inserted) {
      await db.insert(concept2cureArtifactVersions).values({
        artifactId: inserted.id,
        organizationId: orgId,
        version: 1,
        content: htmlContent,
        contentHash,
        createdById: user?.id || null,
      });

      // Emit provenance: artifact creation via DOCX save
      await emitKBProvenanceEvent({
        artifactDbId: inserted.id,
        organizationId: orgId,
        eventType: 'generation',
        eventAction: 'docx_save_as_artifact',
        actorId: user?.id,
        actorName: user?.name || user?.email,
        details: {
          title,
          type: type || 'regulatory_document',
          ctdSection: ctdSection || null,
          contentHash,
          contentLength: htmlContent.length,
        },
        sourceDescription: ctdSection
          ? `Saved DOCX as artifact for CTD section ${ctdSection}`
          : 'Saved DOCX as project artifact',
        backendRoute: 'POST /api/knowledge-base/save-docx-as-artifact',
      });
    }

    res.json({
      success: true,
      data: {
        artifactId,
        title,
        version: 1,
      },
    });
  } catch (err: any) {
    console.error('[knowledge-base] Save as artifact failed:', err.message);
    res.status(500).json({ error: 'Failed to save as artifact' });
  }
});

export default router;

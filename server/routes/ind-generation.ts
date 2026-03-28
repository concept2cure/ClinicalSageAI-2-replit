/**
 * IND Generation Routes — API for AnA to guide IND submission preparation.
 *
 * Endpoints:
 * - GET /api/ind/structure — Returns complete IND CTD structure (Module 1-5)
 * - GET /api/ind/status/:projectId — Returns section-by-section completion status
 * - POST /api/ind/generate-section — Generate a specific CTD section using AI
 * - POST /api/ind/generate-form — Generate FDA administrative forms (1571, 1572, 3674)
 * - POST /api/ind/assemble — Assemble complete eCTD package
 *
 * @module server/routes/ind-generation
 */

import { Router, Request, Response } from 'express';
import { IND_SECTIONS, getSectionsByModule, getSectionByCode, getModuleStatus, getGenerationPrompt } from '../services/ind/ind-section-registry.js';
import { getGateway } from '../services/ai-gateway/index.js';
import { getMasterDocumentBuilder } from '../services/docx/masterDocumentBuilder.js';
import { pool } from '../db.js';

const router = Router();

// ─── GET /api/ind/structure ───────────────────────────────────────────────────
// Returns the complete IND CTD structure for the frontend to display

router.get('/structure', (_req: Request, res: Response) => {
  const modules = [1, 2, 3, 4, 5].map(n => ({
    number: n,
    name: ['Administrative', 'CTD Summaries', 'Quality (CMC)', 'Nonclinical', 'Clinical'][n - 1],
    sections: getSectionsByModule(n as 1 | 2 | 3 | 4 | 5).map(s => ({
      code: s.code,
      title: s.title,
      required: s.required,
      contentType: s.contentType,
      guidance: s.guidance,
      wordCountRange: s.wordCountRange,
      dependencies: s.dependencies,
    })),
  }));

  res.json({ success: true, data: { modules, totalSections: IND_SECTIONS.length } });
});

// ─── GET /api/ind/status/:projectId ───────────────────────────────────────────
// Returns section completion status for a specific project

router.get('/status/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    // Get all artifacts for the project
    const result = await pool.query(
      `SELECT id, title, "ctdSection" as "ctdSection", status FROM artifacts WHERE "projectId" = $1`,
      [projectId]
    );
    const artifacts = result.rows;

    // Map against IND structure
    const sectionStatus = IND_SECTIONS.map(section => {
      const artifact = artifacts.find((a: { ctdSection?: string }) => a.ctdSection === section.code);
      return {
        code: section.code,
        title: section.title,
        module: section.module,
        required: section.required,
        status: artifact
          ? (artifact as { status?: string }).status || 'draft'
          : 'not_started',
        artifactId: artifact ? (artifact as { id: string }).id : null,
      };
    });

    const moduleStatus = getModuleStatus(artifacts);

    res.json({
      success: true,
      data: {
        sections: sectionStatus,
        modules: moduleStatus,
        totalSections: IND_SECTIONS.length,
        completedSections: sectionStatus.filter(s => s.status !== 'not_started').length,
        approvedSections: sectionStatus.filter(s => s.status === 'approved' || s.status === 'locked').length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to retrieve IND status' });
  }
});

// ─── POST /api/ind/generate-section ───────────────────────────────────────────
// Generate a specific CTD section using AI and save as governed artifact

router.post('/generate-section', async (req: Request, res: Response) => {
  try {
    const { projectId, sectionCode, productName, indication, sponsor, phase } = req.body;

    const section = getSectionByCode(sectionCode);
    if (!section) {
      return res.status(400).json({ success: false, error: `Unknown section code: ${sectionCode}` });
    }

    // Build the generation prompt
    const prompt = getGenerationPrompt(sectionCode, { productName, indication, sponsor, phase });

    // Call AI gateway to generate the content
    const gw = getGateway();
    const response = await gw.route({
      taskType: 'document_drafting',
      messages: [
        { role: 'system', content: 'You are a senior regulatory affairs writer producing content for an FDA IND submission. Write in formal regulatory language. Include proper section headings and sub-headings per ICH M4 CTD structure.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 8192,
      callerModule: 'ind-generation',
    });

    const content = response.content || '';

    // Save as governed artifact
    const artifactResult = await pool.query(
      `INSERT INTO artifacts (title, content, type, status, "ctdSection", "projectId", "createdAt", "updatedAt")
       VALUES ($1, $2, 'regulatory_document', 'draft', $3, $4, NOW(), NOW())
       RETURNING id, title, status, "ctdSection"`,
      [`${section.code} ${section.title}`, content, section.code, projectId]
    );

    const artifact = artifactResult.rows[0];

    res.json({
      success: true,
      data: {
        artifactId: artifact.id,
        sectionCode: section.code,
        sectionTitle: section.title,
        status: 'draft',
        wordCount: content.split(/\s+/).length,
        content: content.substring(0, 500) + '...', // Preview
        message: `${section.code} ${section.title} drafted successfully.`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Generation failed' });
  }
});

// ─── POST /api/ind/generate-form ──────────────────────────────────────────────
// Generate FDA administrative forms (1571, 1572, 3674) as DOCX

router.post('/generate-form', async (req: Request, res: Response) => {
  try {
    const { formType, projectId, sponsorName, investigatorName, productName, indication, phase } = req.body;

    const builder = getMasterDocumentBuilder();

    const sections = [{
      number: '1',
      title: `FDA Form ${formType}`,
      content: `<p>This form has been auto-generated for ${productName || 'the investigational product'} (${indication || 'the proposed indication'}).</p>
<p><strong>Sponsor:</strong> ${sponsorName || '[Sponsor Name]'}</p>
<p><strong>Investigator:</strong> ${investigatorName || '[Investigator Name]'}</p>
<p><strong>Phase:</strong> ${phase || '[Phase]'}</p>
<p><strong>Date:</strong> ${new Date().toISOString().split('T')[0]}</p>`,
    }];

    const result = await builder.generateFromScratch({
      documentType: `fda-form-${formType}`,
      sections,
      outputFormat: 'docx',
      documentTitle: `FDA_Form_${formType}`,
    });

    res.json({
      success: true,
      data: {
        outputPath: result.outputPath,
        format: result.format,
        sizeBytes: result.sizeBytes,
        formType,
        message: `FDA Form ${formType} generated as DOCX.`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Form generation failed' });
  }
});

// ─── POST /api/ind/assemble ───────────────────────────────────────────────────
// Assemble all sections into an eCTD package

router.post('/assemble', async (req: Request, res: Response) => {
  try {
    const { projectId, sponsorName, productName } = req.body;

    // Get all artifacts for the project
    const result = await pool.query(
      `SELECT id, title, "ctdSection", status, content FROM artifacts WHERE "projectId" = $1 ORDER BY "ctdSection"`,
      [projectId]
    );
    const artifacts = result.rows;

    // Check readiness
    const required = IND_SECTIONS.filter(s => s.required);
    const missing = required.filter(s => !artifacts.find((a: { ctdSection?: string }) => a.ctdSection === s.code));

    if (missing.length > 0) {
      return res.json({
        success: false,
        error: 'Not all required sections are complete',
        data: {
          missing: missing.map(s => ({ code: s.code, title: s.title, module: s.module })),
          missingCount: missing.length,
          totalRequired: required.length,
          completedRequired: required.length - missing.length,
        },
      });
    }

    // Generate eCTD backbone XML
    const builder = getMasterDocumentBuilder();
    const modules = [1, 2, 3, 4, 5].map(n => ({
      number: String(n),
      title: ['Administrative', 'CTD Summaries', 'Quality', 'Nonclinical', 'Clinical'][n - 1],
      documents: artifacts
        .filter((a: { ctdSection?: string }) => a.ctdSection?.startsWith(String(n)))
        .map((a: { id: string; title: string; ctdSection?: string }) => ({
          id: a.id,
          title: a.title,
          filePath: `m${n}/${a.ctdSection}/${a.title.replace(/[^a-zA-Z0-9]/g, '_')}.docx`,
        })),
    }));

    const ectdXml = await builder.generateEctdXml({
      submissionType: 'initial',
      applicantName: sponsorName || 'Sponsor',
      productName: productName || 'Investigational Product',
      modules,
    });

    res.json({
      success: true,
      data: {
        ectdXml,
        sectionCount: artifacts.length,
        modules: modules.map(m => ({ number: m.number, title: m.title, documentCount: m.documents.length })),
        message: 'eCTD package assembled. Ready for export.',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Assembly failed' });
  }
});

export default router;

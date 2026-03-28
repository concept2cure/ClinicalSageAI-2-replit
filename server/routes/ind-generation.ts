/**
 * IND Generation Routes — API for AnA to guide IND submission preparation.
 *
 * Uses the existing concept2cure artifact API for persistence (not raw SQL).
 * Uses the AI gateway for content generation.
 * Uses the IND Section Registry for structure.
 *
 * @module server/routes/ind-generation
 */

import { Router, Request, Response } from 'express';
import {
  IND_SECTIONS,
  getSectionsByModule,
  getSectionByCode,
  getModuleStatus,
  getGenerationPrompt,
} from '../services/ind/ind-section-registry.js';
import { getGateway } from '../services/ai-gateway/index.js';
import { getMasterDocumentBuilder } from '../services/docx/masterDocumentBuilder.js';

const router = Router();

// ─── GET /api/ind/structure ───────────────────────────────────────────────────

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

router.get('/status/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    // Fetch project artifacts using the internal concept2cure API pattern
    // This uses the same data path as the frontend
    let artifacts: Array<{ id: string; ctdSection?: string; status?: string }> = [];
    try {
      // Try to fetch from the concept2cure artifacts endpoint internally
      const port = process.env.PORT || 5000;
      const fetchRes = await fetch(`http://localhost:${port}/api/concept2cure/projects/${projectId}/artifacts`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (fetchRes.ok) {
        const json = await fetchRes.json();
        artifacts = json.data?.artifacts || json.data || [];
      }
    } catch {
      // If internal fetch fails, return empty — sections will show as not_started
      artifacts = [];
    }

    // Map against IND structure
    const sectionStatus = IND_SECTIONS.map(section => {
      const artifact = artifacts.find(a => a.ctdSection === section.code);
      return {
        code: section.code,
        title: section.title,
        module: section.module,
        required: section.required,
        status: artifact ? (artifact.status || 'draft') : 'not_started',
        artifactId: artifact ? artifact.id : null,
      };
    });

    const moduleStatus = getModuleStatus(
      artifacts.map(a => ({ ctdSection: a.ctdSection, status: a.status }))
    );

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
        {
          role: 'system',
          content: 'You are a senior regulatory affairs writer producing content for an FDA IND submission. Write in formal regulatory language suitable for submission. Follow ICH M4 CTD structure. Include proper section headings and sub-headings. Produce comprehensive, publication-quality content.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 8192,
      callerModule: 'ind-generation',
    });

    const content = response.content || '';
    const title = `${section.code} ${section.title}`;

    // Save as governed artifact via the concept2cure API
    try {
      const port = process.env.PORT || 5000;
      const createRes = await fetch(`http://localhost:${port}/api/concept2cure/projects/${projectId}/artifacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          type: 'regulatory_document',
          category: 'document',
          ctdSection: section.code,
        }),
      });

      if (createRes.ok) {
        const json = await createRes.json();
        const artifact = json.data;
        return res.json({
          success: true,
          data: {
            artifactId: artifact?.id || artifact?.artifactId,
            sectionCode: section.code,
            sectionTitle: section.title,
            status: 'draft',
            wordCount: content.split(/\s+/).length,
            content: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
            message: `${title} drafted successfully.`,
          },
        });
      }
    } catch {
      // Artifact creation failed — still return the content
    }

    // Fallback: return content without artifact creation
    res.json({
      success: true,
      data: {
        sectionCode: section.code,
        sectionTitle: section.title,
        status: 'generated',
        wordCount: content.split(/\s+/).length,
        content: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
        fullContent: content,
        message: `${title} content generated. Save it as an artifact to track in your submission.`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Generation failed' });
  }
});

// ─── POST /api/ind/generate-form ──────────────────────────────────────────────

router.post('/generate-form', async (req: Request, res: Response) => {
  try {
    const { formType, projectId, sponsorName, investigatorName, productName, indication, phase } = req.body;

    const builder = getMasterDocumentBuilder();

    const sections = [{
      number: '1',
      title: `FDA Form ${formType}`,
      content: `<h2>FDA Form ${formType}</h2>
<p><strong>Sponsor:</strong> ${sponsorName || '[Sponsor Name]'}</p>
<p><strong>Investigator:</strong> ${investigatorName || '[Investigator Name]'}</p>
<p><strong>Product:</strong> ${productName || '[Product Name]'}</p>
<p><strong>Indication:</strong> ${indication || '[Indication]'}</p>
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

router.post('/assemble', async (req: Request, res: Response) => {
  try {
    const { projectId, sponsorName, productName } = req.body;

    // Fetch all artifacts via internal API
    let artifacts: Array<{ id: string; title: string; ctdSection?: string; status?: string; content?: string }> = [];
    try {
      const port = process.env.PORT || 5000;
      const fetchRes = await fetch(`http://localhost:${port}/api/concept2cure/projects/${projectId}/artifacts`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (fetchRes.ok) {
        const json = await fetchRes.json();
        artifacts = json.data?.artifacts || json.data || [];
      }
    } catch {
      return res.status(500).json({ success: false, error: 'Failed to fetch project artifacts' });
    }

    // Check readiness
    const required = IND_SECTIONS.filter(s => s.required);
    const missing = required.filter(s => !artifacts.find(a => a.ctdSection === s.code));

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
        .filter(a => a.ctdSection?.startsWith(String(n)))
        .map(a => ({
          id: a.id,
          title: a.title,
          filePath: `m${n}/${a.ctdSection}/${(a.title || 'document').replace(/[^a-zA-Z0-9]/g, '_')}.docx`,
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

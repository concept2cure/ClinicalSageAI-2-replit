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
import {
  CTD_AUTHORING_GUIDANCE,
  getCtdAuthoringGuidance,
  listLifecycleDocumentTypes,
  getLifecycleDocumentType,
  getLifecycleDocumentTypeForRegistry,
  resolveCtdSectionsForDocType,
} from '../services/ind/ctd/index.js';
import { getGateway } from '../services/ai-gateway/index.js';
import { getMasterDocumentBuilder } from '../services/docx/masterDocumentBuilder.js';

// Also import device registry
let getDeviceSections: ((type: '510K' | 'PMA' | 'DE_NOVO' | 'CER') => Array<{ code: string; title: string; required: boolean; guidance: string }>) | null = null;
try {
  const deviceMod = await import('../services/device/device-section-registry.js');
  getDeviceSections = deviceMod.getDeviceSections;
} catch {
  // Device registry not available
}

const router = Router();

// ─── Unresolved-placeholder detection (fail-closed drafting) ──────────────────
//
// The /generate-section system prompt (below) instructs the model to base
// every statement ONLY on the source material supplied and to insert a
// clearly-bracketed ALL-CAPS placeholder — e.g. [DATA TO BE INSERTED],
// [NOAEL VALUE] — wherever the source is silent on a specific fact, number,
// or safety/efficacy conclusion, mirroring the source-grounded convention
// already used by the CTD authoring builders (ib-builder.ts,
// nonclinical-study-report-builder.ts). So any surviving `[ALL CAPS ...]`
// span in the returned content means the section is NOT data-complete,
// regardless of how finished the surrounding prose reads.
//
// Deliberately broad on purpose (fail closed per repo working agreement): a
// false positive costs a section an extra "needs data" glance from a
// reviewer; a false negative would let an invented NOAEL value or toxicology
// conclusion ship into a submission-tracked governed artifact reported as
// "drafted successfully" — the defect this check exists to close.
const UNRESOLVED_PLACEHOLDER_PATTERN = /\[[A-Z][A-Z0-9 _/()-]{2,}\]/g;

/** Returns the distinct unresolved placeholders still present in `content`. */
function findUnresolvedPlaceholders(content: string): string[] {
  const matches = content.match(UNRESOLVED_PLACEHOLDER_PATTERN);
  return matches ? Array.from(new Set(matches)) : [];
}

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

// ─── GET /api/ind/lifecycle-types ─────────────────────────────────────────────
// The full IND→NDA/BLA lifecycle document-type set: Pre-IND/EOP2/Pre-NDA/Pre-BLA
// meeting packages, IND + amendments, IND safety reports, annual reports/DSUR,
// NDA, BLA, ISS/ISE, and post-approval supplements.

router.get('/lifecycle-types', (_req: Request, res: Response) => {
  const types = listLifecycleDocumentTypes().map(dt => ({
    id: dt.id,
    label: dt.label,
    category: dt.category,
    family: dt.family,
    agency: dt.agency,
    description: dt.description,
    timing: dt.timing ?? null,
    meetingPackage: dt.meetingPackage ?? false,
    componentCount: dt.components.length,
    ctdSectionCount: resolveCtdSectionsForDocType(dt).length,
    regulatoryBasis: dt.regulatoryBasis,
  }));
  res.json({ success: true, data: { types, total: types.length } });
});

// ─── GET /api/ind/lifecycle-types/by-registry/:registryId ─────────────────────
// Resolve a canonical document-taxonomy id (US_NDA, US_IND_SR, ...) — the kind
// the product's catalog already offers — to its deep authoring guidance.

router.get('/lifecycle-types/by-registry/:registryId', (req: Request, res: Response) => {
  const dt = getLifecycleDocumentTypeForRegistry(String(req.params.registryId));
  if (!dt) {
    return res.status(404).json({ success: false, error: `No authoring guidance mapped to registry id: ${req.params.registryId}` });
  }
  const ctdSections = resolveCtdSectionsForDocType(dt).map(s => ({
    code: s.code, title: s.title, module: s.module, guidance: s.guidance,
  }));
  res.json({ success: true, data: { ...dt, ctdSections } });
});

// ─── GET /api/ind/lifecycle-types/:id ─────────────────────────────────────────

router.get('/lifecycle-types/:id', (req: Request, res: Response) => {
  const dt = getLifecycleDocumentType(String(req.params.id));
  if (!dt) {
    return res.status(404).json({ success: false, error: `Unknown lifecycle document type: ${req.params.id}` });
  }
  const ctdSections = resolveCtdSectionsForDocType(dt).map(s => ({
    code: s.code,
    title: s.title,
    module: s.module,
    required: s.requiredFor.includes(dt.family === 'BLA' ? 'BLA' : dt.family === 'NDA' ? 'NDA' : 'IND'),
    guidance: s.guidance,
  }));
  res.json({ success: true, data: { ...dt, ctdSections } });
});

// ─── GET /api/ind/guidance/:code ──────────────────────────────────────────────
// Leaf-level CTD authoring guidance for a section code (e.g. "3.2.S.4", "2.7.4").

router.get('/guidance/:code', (req: Request, res: Response) => {
  const g = getCtdAuthoringGuidance(String(req.params.code));
  if (!g) {
    return res.status(404).json({ success: false, error: `No CTD authoring guidance for: ${req.params.code}` });
  }
  res.json({ success: true, data: g });
});

// ─── GET /api/ind/guidance ────────────────────────────────────────────────────

router.get('/guidance', (_req: Request, res: Response) => {
  const codes = Object.values(CTD_AUTHORING_GUIDANCE).map(g => ({
    code: g.code,
    title: g.title,
    module: g.module,
    requiredFor: g.requiredFor,
  }));
  res.json({ success: true, data: { codes, total: codes.length } });
});

// ─── GET /api/ind/device-status/:type/:projectId ──────────────────────────────
// Universal section status for device submissions (510K, PMA, CER, DE_NOVO)

router.get('/device-status/:type/:projectId', async (req: Request, res: Response) => {
  try {
    const { type, projectId } = req.params;
    const deviceType = String(type).toUpperCase() as '510K' | 'PMA' | 'DE_NOVO' | 'CER';

    if (!getDeviceSections) {
      return res.json({ success: true, data: { sections: [], totalSections: 0, completedSections: 0 } });
    }

    const sections = getDeviceSections(deviceType);
    if (!sections || sections.length === 0) {
      return res.json({ success: true, data: { sections: [], totalSections: 0, completedSections: 0 } });
    }

    // Fetch project artifacts via internal API
    let artifacts: Array<{ id: string; ctdSection?: string; status?: string }> = [];
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
      artifacts = [];
    }

    const sectionStatus = sections.map(section => {
      const artifact = artifacts.find(a => a.ctdSection === section.code);
      return {
        code: section.code,
        title: section.title,
        module: 0,
        required: section.required,
        status: artifact ? (artifact.status || 'draft') : 'not_started',
        artifactId: artifact ? artifact.id : null,
      };
    });

    res.json({
      success: true,
      data: {
        sections: sectionStatus,
        totalSections: sections.length,
        completedSections: sectionStatus.filter(s => s.status !== 'not_started').length,
        approvedSections: sectionStatus.filter(s => s.status === 'approved' || s.status === 'locked').length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to retrieve device status' });
  }
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
    const { projectId, sectionCode, productName, indication, sponsor, phase, sourceData } = req.body;

    const section = getSectionByCode(sectionCode);
    if (!section) {
      return res.status(400).json({ success: false, error: `Unknown section code: ${sectionCode}` });
    }

    // Build the generation prompt. When the caller supplies structured
    // source/evidence material (study data, tabulated results, etc.) via
    // `sourceData`, thread it into the user prompt so the model has
    // something real to ground on; otherwise say so explicitly rather than
    // silently letting the model fill the gap with a plausible-sounding
    // invented value.
    const basePrompt = getGenerationPrompt(sectionCode, { productName, indication, sponsor, phase });
    const prompt = sourceData
      ? `${basePrompt}\n\nSOURCE DATA (use ONLY this for any study results, numeric values, or conclusions; do not go beyond it):\n${String(sourceData)}`
      : `${basePrompt}\n\nNo structured source data (study reports, tabulated results, safety findings, etc.) was supplied for this request. Do not invent any — use an ALL-CAPS bracketed placeholder such as [DATA TO BE INSERTED] for every specific finding, number, or conclusion that would normally be drawn from source data.`;

    // Call AI gateway to generate the content
    const gw = getGateway();
    const response = await gw.route({
      taskType: 'document_drafting',
      messages: [
        {
          role: 'system',
          content:
            'You are a senior regulatory affairs writer producing content for an FDA IND submission. Write in formal regulatory language suitable for submission. Follow ICH M4 CTD structure. Include proper section headings and sub-headings. Produce comprehensive, publication-quality content.\n\n' +
            'Base every statement ONLY on the source material provided in this request (product identity, indication, phase, and any SOURCE DATA supplied). Do NOT invent study results, numbers, NOAEL/dose values, toxicology or pharmacokinetic findings, or safety/efficacy conclusions that are not present in the provided material. Wherever the source is silent on a specific fact, insert a clearly-bracketed ALL-CAPS placeholder — e.g. [DATA TO BE INSERTED], [NOAEL VALUE], [TOXICOLOGY FINDING TO BE INSERTED] — do not fill the gap with a plausible-sounding fabricated value.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 8192,
      callerModule: 'ind-generation',
    });

    const content = response.content || '';
    const title = `${section.code} ${section.title}`;

    // Fail-closed data-completeness check: content that still carries an
    // unresolved [ALL-CAPS PLACEHOLDER] is NOT ready to report as drafted,
    // no matter how finished the surrounding prose reads. See
    // findUnresolvedPlaceholders above.
    const unresolvedPlaceholders = findUnresolvedPlaceholders(content);
    const needsData = unresolvedPlaceholders.length > 0;
    const incompleteMessage = `${title} drafted, but ${unresolvedPlaceholders.length} statement(s) could not be grounded in supplied source data and were left as placeholders. Supply source/evidence data and regenerate before this section can be considered submission-ready.`;

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
          metadata: { needsData, unresolvedPlaceholders },
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
            needsData,
            unresolvedPlaceholders,
            wordCount: content.split(/\s+/).length,
            content: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
            message: needsData ? incompleteMessage : `${title} drafted successfully.`,
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
        status: needsData ? 'draft' : 'generated',
        needsData,
        unresolvedPlaceholders,
        wordCount: content.split(/\s+/).length,
        content: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
        fullContent: content,
        message: needsData
          ? incompleteMessage
          : `${title} content generated. Save it as an artifact to track in your submission.`,
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
      // 'Sponsor' reads as the applicant's name in the backbone's
      // <applicant-name>; an absent applicant must say it is absent.
      applicantName: sponsorName || 'UNASSIGNED (applicant)',
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

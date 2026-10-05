/**
 * IND Generation Routes — API for AnA to guide IND submission preparation.
 *
 * Uses the existing concept2cure artifact API for persistence (not raw SQL),
 * called with the caller's own credentials. Uses the AI gateway for content
 * generation. Uses the IND Section Registry for structure.
 *
 * Fails closed (record step g-ind-generation-route-fails-closed, 2026-10-05):
 * a section is reported drafted only when the artifact store returned the id it
 * saved it under, and a failed artifact read is an error, never "every section
 * not started". Before, both loopback calls went out with no Authorization
 * header to a route behind authenticateToken, failed every time, and the
 * failure was swallowed into `success: true` and all-`not_started` answers.
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
import { serverError } from '../lib/api-response.js';
import { createScopedLogger } from '../utils/logger.js';
import { resolveOrgId, resolveUserId } from '../types/auth-request.js';

// Also import device registry
let getDeviceSections: ((type: '510K' | 'PMA' | 'DE_NOVO' | 'CER') => Array<{ code: string; title: string; required: boolean; guidance: string }>) | null = null;
try {
  const deviceMod = await import('../services/device/device-section-registry.js');
  getDeviceSections = deviceMod.getDeviceSections;
} catch {
  // Device registry not available
}

const router = Router();
const log = createScopedLogger('ind-generation');

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

// ─── The project's artifacts, read and written as the caller ──────────────────
//
// Both go through the canonical artifact route
// (server/routes/c2c/artifacts.ts, mounted behind authenticateToken), so the
// project is authorized there, by authorizedProjectId, for the caller's
// organization. The caller's own Authorization header is forwarded: this router
// is itself mounted behind authenticateToken, so every request here carries one.
// Without it the artifact route answers 401, which is what it answered on every
// call before.

/**
 * A project reference as the artifact route accepts it: an integer id or a
 * program UUID. Anything else is refused before it is put in a URL path, where
 * a "/" or ".." would address a different route with the caller's credentials.
 */
const PROJECT_REF = /^[A-Za-z0-9_-]{1,64}$/;

function projectRefOf(value: unknown): string | null {
  const ref = typeof value === 'number' && Number.isInteger(value) ? String(value) : value;
  return typeof ref === 'string' && PROJECT_REF.test(ref) ? ref : null;
}

function projectArtifactsUrl(projectRef: string): string {
  const port = process.env.PORT || 5000;
  return `http://localhost:${port}/api/concept2cure/projects/${projectRef}/artifacts`;
}

function callerHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof req.headers.authorization === 'string') headers.Authorization = req.headers.authorization;
  return headers;
}

/**
 * The status to answer when the artifact route refused or failed: its own 403
 * or 404 (the project is not the caller's), otherwise 502 — the store did not
 * answer, which is this server's failure, not the caller's.
 */
function failedStoreStatus(upstream: number | null): 403 | 404 | 502 {
  return upstream === 403 || upstream === 404 ? upstream : 502;
}

type ProjectArtifact = { id: string; ctdSection?: string | null; status?: string };
type ArtifactRead = { ok: true; artifacts: ProjectArtifact[] } | { ok: false; status: 403 | 404 | 502 };

async function readProjectArtifacts(req: Request, projectRef: string): Promise<ArtifactRead> {
  try {
    const fetchRes = await fetch(projectArtifactsUrl(projectRef), { headers: callerHeaders(req) });
    if (!fetchRes.ok) {
      log.warn('project artifact read refused', { projectRef, status: fetchRes.status });
      return { ok: false, status: failedStoreStatus(fetchRes.status) };
    }
    const json = await fetchRes.json();
    const list = json?.data?.artifacts ?? json?.data;
    if (!Array.isArray(list)) {
      log.warn('project artifact read returned no list', { projectRef });
      return { ok: false, status: 502 };
    }
    return { ok: true, artifacts: list as ProjectArtifact[] };
  } catch (error) {
    log.error('project artifact read failed', { projectRef, error: error instanceof Error ? error.message : String(error) });
    return { ok: false, status: 502 };
  }
}

/**
 * Create the section's artifact through the artifact route. Returns the id the
 * store saved it under, or null with the route's status (null when it never
 * answered).
 */
async function saveSectionArtifact(
  req: Request,
  projectRef: string,
  body: Record<string, unknown>,
): Promise<{ artifactId: string | null; status: number | null }> {
  try {
    const createRes = await fetch(projectArtifactsUrl(projectRef), {
      method: 'POST',
      headers: callerHeaders(req),
      body: JSON.stringify(body),
    });
    if (!createRes.ok) return { artifactId: null, status: createRes.status };
    const json = await createRes.json();
    const id = json?.data?.id ?? json?.data?.artifactId;
    return { artifactId: typeof id === 'string' && id.length > 0 ? id : null, status: createRes.status };
  } catch (error) {
    log.error('section artifact save failed', {
      projectRef,
      error: error instanceof Error ? error.message : String(error),
    });
    return { artifactId: null, status: null };
  }
}

function sendUnreadable(res: Response, status: 403 | 404 | 502): Response {
  return res.status(status).json({
    success: false,
    code: 'ARTIFACTS_UNREADABLE',
    error:
      status === 502
        ? "The project's saved sections could not be read, so no section status is reported."
        : 'Project not found or not accessible.',
  });
}

function sendBadProjectRef(res: Response): Response {
  return res.status(400).json({
    success: false,
    error: 'projectId is required: the integer id or program UUID of the project the sections belong to.',
  });
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
    const { type } = req.params;
    const projectRef = projectRefOf(req.params.projectId);
    if (!projectRef) return sendBadProjectRef(res);
    const deviceType = String(type).toUpperCase() as '510K' | 'PMA' | 'DE_NOVO' | 'CER';

    if (!getDeviceSections) {
      return res.json({ success: true, data: { sections: [], totalSections: 0, completedSections: 0 } });
    }

    const sections = getDeviceSections(deviceType);
    if (!sections || sections.length === 0) {
      return res.json({ success: true, data: { sections: [], totalSections: 0, completedSections: 0 } });
    }

    const read = await readProjectArtifacts(req, projectRef);
    if (!read.ok) return sendUnreadable(res, read.status);
    const { artifacts } = read;

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
    const projectRef = projectRefOf(req.params.projectId);
    if (!projectRef) return sendBadProjectRef(res);

    // A failed read is an error. Reading it as an empty list reported every
    // section as not_started for a project that may have them all drafted.
    const read = await readProjectArtifacts(req, projectRef);
    if (!read.ok) return sendUnreadable(res, read.status);
    const { artifacts } = read;

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
      artifacts.map(a => ({ ctdSection: a.ctdSection ?? undefined, status: a.status }))
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
    // Checked before the model call: a draft that cannot be saved is not spent.
    const projectRef = projectRefOf(projectId);
    if (!projectRef) return sendBadProjectRef(res);

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
      // The caller's tenant and identity, so the gateway's placement floor and
      // approved-model rule for high-risk drafting apply to this call.
      organizationId: resolveOrgId(req) ?? undefined,
      userId: resolveUserId(req) ?? undefined,
      projectId: projectRef,
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

    // Save as governed artifact via the concept2cure API. The section is
    // reported drafted only with the id the store saved it under; anything
    // else is a refusal, and the unsaved text is not handed back as if it
    // were a draft on record.
    const { artifactId, status: saveStatus } = await saveSectionArtifact(req, projectRef, {
      title,
      content,
      type: 'regulatory_document',
      category: 'document',
      ctdSection: section.code,
      metadata: { needsData, unresolvedPlaceholders },
    });
    if (!artifactId) {
      log.warn('section drafted but not saved', { projectRef, sectionCode: section.code, saveStatus });
      const status = failedStoreStatus(saveStatus);
      return res.status(status).json({
        success: false,
        code: 'SECTION_NOT_SAVED',
        error:
          status === 502
            ? `${title} was not saved to the project, so no draft is on record. Try again.`
            : `${title} was not saved: project not found or not accessible.`,
      });
    }

    return res.json({
      success: true,
      data: {
        artifactId,
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
  } catch (error) {
    // The gateway's text (provider error, model id, upstream host) goes to the
    // log against the request id, not into the body (P1-17, IAM-18 (1)).
    serverError(res, log, 'generating the section', error);
  }
});

// The former POST /generate-form and POST /assemble handlers were removed.
// Neither had a caller. /generate-form returned a one-paragraph summary
// document named `FDA_Form_<n>.docx` that was not the FDA form (the real
// fill path is services/ind-forms/ind-form-fill-service.ts); /assemble
// counted a section complete when any artifact existed for it, regardless
// of the needsData flag /generate-section records, and reported "Ready for
// export" over a hand-rolled backbone that hardcoded sequence 0000 and
// operation=new. Assembly is services/ectd/assemble-from-core.ts.

export default router;

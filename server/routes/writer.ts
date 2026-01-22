import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';
import { toSql } from 'pgvector';
import pool from '../lib/db.js';
import { checkAuth } from '../controllers/auth.js';
import { generateEmbedding } from '../utils/ai_engine.js';
import auditService from '../services/auditService.js';
import { logAudit } from '../utils/audit.js';

const router = Router();

const writerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many draft requests. Please slow down.' },
});

const kimiClient = process.env.KIMI_API_KEY
  ? new OpenAI({
      apiKey: process.env.KIMI_API_KEY,
      baseURL: 'https://api.moonshot.cn/v1',
    })
  : null;

const openAIClient = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

interface DraftRequestBody {
  sectionType?: string;
  context?: string;
  cmcData?: {
    impurities?: Array<{
      name?: string;
      result?: string | number;
      percent?: string | number;
      limit?: string | number;
    }>;
  };
}

interface AuthUser {
  id?: string | number;
  organizationId?: string | number;
  appUserId?: string | number;
}

interface AuthRequest extends Request {
  user?: AuthUser;
}

interface StructuredDraft {
  title: string;
  regulatory_code: string;
  content_body: string;
  key_claims: string[];
  risk_assessment: string;
}

const MAX_CONTEXT_LENGTH = 10000;
const VALID_SECTIONS = [
  'indications',
  '510k_summary',
  'substantial_equivalence',
  'biocompatibility',
  'cmc_justification',
] as const;

type ValidSection = typeof VALID_SECTIONS[number];

const SECTION_PROMPTS: Record<ValidSection, string> = {
  indications:
    'Draft a "Statement of Indications for Use" (Form FDA 3881). Focus on patient population, anatomical sites, and clinical application.',
  '510k_summary':
    'Draft a "510(k) Summary" (21 CFR 807.92). Include Submitter info placeholder, Device Name, Predicate Device, and Summary of Technologies.',
  substantial_equivalence:
    'Draft a "Substantial Equivalence Discussion" (21 CFR 807.100). Compare the subject device to the predicate in terms of technological characteristics and safety/effectiveness.',
  biocompatibility:
    'Draft a "Biocompatibility Executive Summary". Reference ISO 10993 standards applicable to the device nature described.',
  cmc_justification:
    'Draft a "Justification of Specification" (Module 3.2.S.4.5) for Drug Substance Impurities.',
};

const isValidSection = (sectionType: string): sectionType is ValidSection => {
  return (VALID_SECTIONS as readonly string[]).includes(sectionType);
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const getErrorStatus = (error: unknown): number | null => {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: number }).status;
    return typeof status === 'number' ? status : null;
  }
  return null;
};

router.post('/draft', checkAuth, writerLimiter, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { sectionType, context, cmcData } = req.body as DraftRequestBody;

    if (!context || typeof context !== 'string') {
      return res.status(400).json({ error: 'Context is required' });
    }

    const trimmedContext = context.trim();
    if (trimmedContext.length < 10) {
      return res.status(400).json({ error: 'Context is too short for generation.' });
    }

    if (!kimiClient && !openAIClient) {
      return res.status(503).json({ error: 'Drafting unavailable' });
    }

    const tokenTenantId = authReq.user?.organizationId;
    if (!tokenTenantId) {
      return res.status(403).json({ error: 'Tenant context missing from token' });
    }

    const tenantHeader = req.headers['x-organization-id'];
    if (tenantHeader && Number(tenantHeader) !== Number(tokenTenantId)) {
      return res.status(403).json({ error: 'Tenant mismatch' });
    }

    const normalizedSectionType = sectionType && typeof sectionType === 'string'
      ? sectionType.trim()
      : 'indications';

    if (!isValidSection(normalizedSectionType)) {
      return res.status(400).json({
        error: `Invalid sectionType. Allowed: ${VALID_SECTIONS.join(', ')}`,
      });
    }

    const sectionPrompt = SECTION_PROMPTS[normalizedSectionType];

    console.log(`[ARCHITECT] 🏗️ Building structured section: ${normalizedSectionType}`);

    const vector = await generateEmbedding(trimmedContext.slice(0, MAX_CONTEXT_LENGTH));

    const sql = `
      SELECT deep_data, (embedding <=> $1) as distance
      FROM csr_deep_vault
      WHERE deep_data->>'tenant_id' = $2
        AND embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT 3;
    `;

    const searchResult = await pool.query(sql, [toSql(vector), String(tokenTenantId)]);

    const evidenceBlock = searchResult.rows.length
      ? searchResult.rows
          .map(
            row =>
              `SOURCE: ${row.deep_data.protocol_id} | DATA: ${row.deep_data.adverse_events} AEs, ${row.deep_data.enrollment_current} patients.`
          )
          .join('\n')
      : 'No matching protocols found.';

    const promptContext = trimmedContext.slice(0, 2000);
    let prompt = `
You are a Regulatory Architect AI.
TASK: ${sectionPrompt}
CONTEXT: ${promptContext}
EVIDENCE: ${evidenceBlock}

OUTPUT REQUIREMENT: Return ONLY valid JSON in this exact format:
{
  "title": "Formal Section Title",
  "regulatory_code": "Relevant CFR Code (e.g., 21 CFR 807.92)",
  "content_body": "The main drafting text...",
  "key_claims": ["Claim 1", "Claim 2"],
  "risk_assessment": "Low/Medium/High based on evidence"
}
`;

    if (normalizedSectionType === 'cmc_justification' && cmcData?.impurities?.length) {
      const impuritiesList = cmcData.impurities
        .map(imp => {
          const rawValue = imp.result ?? imp.percent ?? '';
          const value = typeof rawValue === 'number' ? rawValue : String(rawValue);
          const limit = imp.limit ?? '0.15%';
          return `- ${imp.name || 'Unnamed impurity'}: ${value}% (Limit: ${limit})`;
        })
        .join('\n');

      prompt = `
You are a CMC Regulatory Writer.
TASK: Draft the "Justification of Specification" (Module 3.2.S.4.5) for Drug Substance Impurities.

PROJECT CONTEXT: ${promptContext || 'Synthetic peptide drug substance.'}

DATA PROFILE:
${impuritiesList}

INSTRUCTIONS:
1. Explicitly state that the impurity profile is controlled.
2. For any impurity < 0.10%, state it is below the ICH Reporting Threshold.
3. For any impurity > 0.15%, draft a justification placeholder (e.g., "Qualified by toxicology study [Study ID]...").
4. Return JSON with keys: "title", "regulatory_code" (3.2.S.4.5), "content_body", "risk_assessment" (Low/Medium/High).
`;
    }

    let rawOutput = '';

    if (kimiClient) {
      try {
        const completion = await kimiClient.chat.completions.create({
          model: 'moonshot-v1-8k',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        });
        rawOutput = completion.choices[0]?.message?.content || '';
      } catch (error: unknown) {
        console.warn('Kimi Failed, using OpenAI...', getErrorMessage(error));
      }
    }

    if (!rawOutput && openAIClient) {
      const completion = await openAIClient.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });
      rawOutput = completion.choices[0]?.message?.content || '';
    }

    if (!rawOutput) {
      return res.status(502).json({ error: 'Drafting failed' });
    }

    let structuredDraft: StructuredDraft | null = null;

    try {
      structuredDraft = JSON.parse(rawOutput) as StructuredDraft;
    } catch (parseError) {
      console.error('[ARCHITECT] JSON parse failed:', parseError, rawOutput);
      return res.status(502).json({ error: 'AI generated malformed structure. Please retry.' });
    }

    const actorId = Number.isFinite(Number(authReq.user?.appUserId))
      ? Number(authReq.user?.appUserId)
      : null;

    await auditService.logAction({
      tenantId: Number(tokenTenantId),
      userId: actorId,
      action: auditService.ACTIONS.REGULATORY_ANALYSIS,
      resourceType: auditService.RESOURCE_TYPES.ANALYSIS,
      resourceId: 'writer-draft',
      details: {
        sectionType: normalizedSectionType,
        contextLength: trimmedContext.length,
        sources: searchResult.rows.map(row => row.deep_data.protocol_id),
        draftLength: structuredDraft?.content_body?.length || 0,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null,
      sessionId: req.headers['x-session-id'] || null,
      severity: auditService.SEVERITY.INFO,
    });

    const auditUserId = authReq.user?.appUserId ?? authReq.user?.id ?? 'SYSTEM';
    logAudit(
      String(tokenTenantId),
      String(auditUserId),
      'AI_DRAFT_GENERATE',
      `Generated section '${normalizedSectionType}' for context: ${trimmedContext.substring(0, 30)}...`,
      req.ip
    );

    res.json({
      data: structuredDraft,
      sources: searchResult.rows.map(row => row.deep_data.protocol_id),
    });
  } catch (error: unknown) {
    const status = getErrorStatus(error);
    if (status === 429) {
      return res.status(429).json({ error: 'AI Service Busy. Please try again in 30 seconds.' });
    }
    console.error('[WRITER ERROR]', error);
    res.status(500).json({ error: 'Generation failed' });
  }
});

export default router;

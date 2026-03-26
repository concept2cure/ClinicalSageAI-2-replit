/**
 * Client Intelligence Memory Service
 *
 * Manages the deep-learning intelligence system for client organizations.
 * Ingests documents (PDF, DOCX, XLSX, CSV, TXT), extracts knowledge atoms,
 * and persists them as searchable, embeddable memory entries that feed
 * into the AnA 1.0 RI Context Builder so all agents become
 * intimately aware of each client's identity, pipeline, and needs.
 *
 * @module server/services/client-intelligence-memory
 */

import { db, pool } from '../db';
import {
  clientIntelligenceProfiles,
  clientMemoryEntries,
  clientIngestedDocuments,
  projectIntelligenceProfiles,
  projectMemoryEntries,
  projectIngestedDocuments,
  projects,
  type ClientIntelligenceProfile,
  type ClientMemoryEntry,
  type ClientIngestedDocument,
  type ProjectIntelligenceProfile,
  type ProjectMemoryEntry,
  type ProjectIngestedDocument,
} from 'shared/schema';
import { eq, and, desc, sql, asc } from 'drizzle-orm';
import { getEmbeddingService } from './enhancedEmbeddingService.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ClientPersonaInput {
  companyName: string;
  industry?: string;
  subIndustry?: string;
  companySize?: string;
  headquarters?: string;
  website?: string;
  yearFounded?: number;
  primarySubmissionTypes?: string[];
  regulatoryMarkets?: string[];
  therapeuticAreas?: string[];
  technologyPlatforms?: string[];
  pipelineAssets?: PipelineAssetInput[];
  companyPersona?: string;
  regulatoryPhilosophy?: string;
  communicationPreferences?: string;
  keyStakeholders?: StakeholderInput[];
}

export interface PipelineAssetInput {
  name: string;
  phase: string;
  indication: string;
  mechanism?: string;
  target?: string;
  description?: string;
}

export interface StakeholderInput {
  name: string;
  title: string;
  role: string;
  preferences?: string;
}

export interface DocumentIngestionResult {
  documentId: number;
  fileName: string;
  extractedText: string;
  tokenCount: number;
  memoryEntriesCreated: number;
  status: 'completed' | 'failed';
  error?: string;
}

export interface MemorySearchResult {
  entries: ClientMemoryEntry[];
  totalCount: number;
}

export interface DocumentChecklist {
  category: string;
  items: DocumentChecklistItem[];
}

export interface DocumentChecklistItem {
  label: string;
  description: string;
  fileTypes: string[];
  priority: 'required' | 'recommended' | 'optional';
  uploaded: boolean;
}

// ─── Memory Categories ──────────────────────────────────────────────────────

const MEMORY_CATEGORIES = [
  'persona',        // Company identity, culture, values
  'regulatory',     // Regulatory strategy, filing history, agency interactions
  'pipeline',       // Drug/device pipeline, development stages
  'competitive',    // Competitive landscape, market position
  'operational',    // Internal processes, team structure, SOPs
  'preference',     // Communication preferences, template preferences
  'history',        // Past submissions, regulatory decisions, correspondence
  'clinical',       // Clinical trial history, endpoints, patient populations
] as const;

// ─── Document Checklist Template ────────────────────────────────────────────

const DOCUMENT_CHECKLIST: DocumentChecklist[] = [
  {
    category: 'Company Profile',
    items: [
      { label: 'Company Overview / About Us', description: 'Mission statement, company history, leadership', fileTypes: ['pdf', 'docx'], priority: 'required', uploaded: false },
      { label: 'Organizational Chart', description: 'Team structure, key departments', fileTypes: ['pdf', 'docx', 'xlsx'], priority: 'recommended', uploaded: false },
      { label: 'Corporate Presentation / Pitch Deck', description: 'Investor deck or corporate overview slides', fileTypes: ['pdf', 'pptx'], priority: 'recommended', uploaded: false },
    ],
  },
  {
    category: 'Regulatory History',
    items: [
      { label: 'Prior Submissions Log', description: 'History of regulatory filings (INDs, NDAs, 510(k)s, etc.)', fileTypes: ['xlsx', 'csv', 'pdf'], priority: 'required', uploaded: false },
      { label: 'FDA Meeting Minutes', description: 'Pre-IND, Type B/C meeting minutes or correspondence', fileTypes: ['pdf', 'docx'], priority: 'recommended', uploaded: false },
      { label: 'Regulatory Strategy Documents', description: 'Global regulatory strategy, pathway analysis', fileTypes: ['pdf', 'docx'], priority: 'required', uploaded: false },
      { label: 'Warning Letters or CRLs', description: 'Any FDA/EMA correspondence requiring response', fileTypes: ['pdf'], priority: 'optional', uploaded: false },
    ],
  },
  {
    category: 'Pipeline & Products',
    items: [
      { label: 'Pipeline Overview', description: 'Current drug/device pipeline with stages and timelines', fileTypes: ['pdf', 'xlsx', 'docx'], priority: 'required', uploaded: false },
      { label: 'Product Specifications', description: 'Detailed product/device specifications', fileTypes: ['pdf', 'docx'], priority: 'recommended', uploaded: false },
      { label: 'Clinical Development Plans', description: 'CDPs, study synopses, or development strategy', fileTypes: ['pdf', 'docx'], priority: 'recommended', uploaded: false },
      { label: 'Patent / IP Portfolio', description: 'Patent landscape or IP strategy documents', fileTypes: ['pdf', 'xlsx'], priority: 'optional', uploaded: false },
    ],
  },
  {
    category: 'Operations & Quality',
    items: [
      { label: 'Quality Management SOPs', description: 'QMS overview, key SOPs, quality policy', fileTypes: ['pdf', 'docx'], priority: 'recommended', uploaded: false },
      { label: 'Vendor / CRO Agreements', description: 'Key partnerships, outsourcing strategy', fileTypes: ['pdf', 'docx'], priority: 'optional', uploaded: false },
      { label: 'Project Timelines', description: 'Master timelines, Gantt charts, milestone tracker', fileTypes: ['xlsx', 'pdf', 'csv'], priority: 'recommended', uploaded: false },
    ],
  },
  {
    category: 'Competitive Intelligence',
    items: [
      { label: 'Competitive Landscape Analysis', description: 'Competitor mapping, market analysis', fileTypes: ['pdf', 'docx', 'xlsx'], priority: 'recommended', uploaded: false },
      { label: 'Market Research Reports', description: 'Market size, patient population, unmet need', fileTypes: ['pdf', 'docx'], priority: 'optional', uploaded: false },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE CRUD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create or update a client intelligence profile.
 */
export async function upsertClientProfile(
  organizationId: number,
  input: ClientPersonaInput,
  userId: number,
  clientWorkspaceId?: number
): Promise<ClientIntelligenceProfile> {
  // Check for existing profile
  const existing = await db
    .select()
    .from(clientIntelligenceProfiles)
    .where(
      and(
        eq(clientIntelligenceProfiles.organizationId, organizationId),
        clientWorkspaceId
          ? eq(clientIntelligenceProfiles.clientWorkspaceId, clientWorkspaceId)
          : sql`${clientIntelligenceProfiles.clientWorkspaceId} IS NULL`
      )
    )
    .limit(1);

  const slug = input.companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const profileData = {
    organizationId,
    clientWorkspaceId: clientWorkspaceId || null,
    companyName: input.companyName,
    companySlug: slug,
    industry: input.industry || null,
    subIndustry: input.subIndustry || null,
    companySize: input.companySize || null,
    headquarters: input.headquarters || null,
    website: input.website || null,
    yearFounded: input.yearFounded || null,
    primarySubmissionTypes: input.primarySubmissionTypes || [],
    regulatoryMarkets: input.regulatoryMarkets || [],
    therapeuticAreas: input.therapeuticAreas || [],
    technologyPlatforms: input.technologyPlatforms || [],
    pipelineAssets: input.pipelineAssets || [],
    companyPersona: input.companyPersona || null,
    regulatoryPhilosophy: input.regulatoryPhilosophy || null,
    communicationPreferences: input.communicationPreferences || null,
    keyStakeholders: input.keyStakeholders || [],
    lastEnrichedBy: userId,
    lastEnrichedAt: new Date(),
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    const [updated] = await db
      .update(clientIntelligenceProfiles)
      .set(profileData)
      .where(eq(clientIntelligenceProfiles.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(clientIntelligenceProfiles)
    .values({
      ...profileData,
      createdBy: userId,
      profileStatus: 'active',
    })
    .returning();
  return created;
}

/**
 * Get the client intelligence profile for an organization.
 */
export async function getClientProfile(
  organizationId: number,
  clientWorkspaceId?: number
): Promise<ClientIntelligenceProfile | null> {
  const rows = await db
    .select()
    .from(clientIntelligenceProfiles)
    .where(
      and(
        eq(clientIntelligenceProfiles.organizationId, organizationId),
        clientWorkspaceId
          ? eq(clientIntelligenceProfiles.clientWorkspaceId, clientWorkspaceId)
          : sql`${clientIntelligenceProfiles.clientWorkspaceId} IS NULL`
      )
    )
    .limit(1);

  return rows[0] || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT INGESTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Estimate token count from text length.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.25);
}

/**
 * Extract text from an uploaded file buffer based on MIME type.
 * Uses available parsers for PDF, DOCX, Excel, CSV, and plain text.
 */
async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<{ text: string; pageCount?: number }> {
  try {
    // Plain text / Markdown
    if (
      mimeType === 'text/plain' ||
      mimeType === 'text/markdown' ||
      mimeType === 'text/csv' ||
      fileName.endsWith('.txt') ||
      fileName.endsWith('.md') ||
      fileName.endsWith('.csv')
    ) {
      const text = buffer.toString('utf-8');
      return { text };
    }

    // PDF
    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const result = await pdfParse(buffer);
        return { text: result.text, pageCount: result.numpages };
      } catch {
        return { text: `[PDF file: ${fileName} — text extraction unavailable]` };
      }
    }

    // DOCX
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileName.endsWith('.docx')
    ) {
      try {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        return { text: result.value };
      } catch {
        return { text: `[DOCX file: ${fileName} — text extraction unavailable]` };
      }
    }

    // XLSX / Excel
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel' ||
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls')
    ) {
      try {
        const ExcelJS = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const textParts: string[] = [];
        workbook.eachSheet((worksheet) => {
          textParts.push(`\n--- Sheet: ${worksheet.name} ---\n`);
          worksheet.eachRow((row) => {
            const values = row.values as any[];
            if (Array.isArray(values)) {
              textParts.push(values.slice(1).map(v => String(v ?? '')).join('\t'));
            }
          });
        });
        return { text: textParts.join('\n') };
      } catch {
        return { text: `[Excel file: ${fileName} — text extraction unavailable]` };
      }
    }

    // Fallback
    return { text: `[File: ${fileName} (${mimeType}) — unsupported format for text extraction]` };
  } catch (err: any) {
    console.error(`[ClientIntelligence] Text extraction failed for ${fileName}:`, err.message);
    return { text: `[File: ${fileName} — extraction error: ${err.message}]` };
  }
}

/**
 * AI-powered extraction of memory entries from document text.
 * Uses structured prompts to identify knowledge atoms.
 */
function extractMemoryEntriesFromText(
  text: string,
  fileName: string,
  profileName: string
): Array<{
  category: string;
  subcategory: string;
  title: string;
  content: string;
  confidenceScore: number;
  importanceLevel: string;
}> {
  const entries: Array<{
    category: string;
    subcategory: string;
    title: string;
    content: string;
    confidenceScore: number;
    importanceLevel: string;
  }> = [];

  // Truncate to reasonable size for analysis
  const analysisText = text.slice(0, 50000);
  const lowerText = analysisText.toLowerCase();

  // ── Extract company identity signals ──────────────────────────
  if (lowerText.includes('mission') || lowerText.includes('vision') || lowerText.includes('founded')) {
    const missionMatch = analysisText.match(/(?:mission|vision|purpose)[:\s]*([^\n.]{20,300})/i);
    if (missionMatch) {
      entries.push({
        category: 'persona',
        subcategory: 'mission_vision',
        title: `${profileName} Mission/Vision Statement`,
        content: missionMatch[1].trim(),
        confidenceScore: 0.85,
        importanceLevel: 'high',
      });
    }
  }

  // ── Extract therapeutic area signals ──────────────────────────
  const therapeuticPatterns = [
    'oncology', 'immunology', 'neurology', 'cardiology', 'rare disease',
    'gene therapy', 'cell therapy', 'ophthalmology', 'dermatology',
    'infectious disease', 'metabolic', 'respiratory', 'hematology',
    'gastroenterology', 'endocrinology', 'musculoskeletal',
  ];
  const foundAreas = therapeuticPatterns.filter(area => lowerText.includes(area));
  if (foundAreas.length > 0) {
    entries.push({
      category: 'pipeline',
      subcategory: 'therapeutic_areas',
      title: `${profileName} Therapeutic Focus Areas`,
      content: `Identified therapeutic areas: ${foundAreas.join(', ')}. Source: ${fileName}`,
      confidenceScore: 0.75,
      importanceLevel: 'high',
    });
  }

  // ── Extract regulatory pathway signals ────────────────────────
  const regulatoryPatterns = [
    { pattern: /\b(IND|investigational new drug)\b/i, label: 'IND' },
    { pattern: /\b(NDA|new drug application)\b/i, label: 'NDA' },
    { pattern: /\b(BLA|biologics license)\b/i, label: 'BLA' },
    { pattern: /\b510\(k\)/i, label: '510(k)' },
    { pattern: /\b(PMA|premarket approval)\b/i, label: 'PMA' },
    { pattern: /\b(De Novo)\b/i, label: 'De Novo' },
    { pattern: /\b(MAA|marketing authorisation)\b/i, label: 'MAA' },
    { pattern: /\b(eCTD)\b/i, label: 'eCTD' },
  ];
  const foundPathways = regulatoryPatterns
    .filter(p => p.pattern.test(analysisText))
    .map(p => p.label);
  if (foundPathways.length > 0) {
    entries.push({
      category: 'regulatory',
      subcategory: 'submission_pathways',
      title: `${profileName} Regulatory Pathways Referenced`,
      content: `Regulatory pathways mentioned: ${foundPathways.join(', ')}. Source: ${fileName}`,
      confidenceScore: 0.8,
      importanceLevel: 'high',
    });
  }

  // ── Extract pipeline/drug names ───────────────────────────────
  const drugPatterns = analysisText.match(/\b[A-Z]{2,4}[-\s]?\d{3,5}\b/g);
  if (drugPatterns && drugPatterns.length > 0) {
    const unique = [...new Set(drugPatterns)].slice(0, 10);
    entries.push({
      category: 'pipeline',
      subcategory: 'compound_identifiers',
      title: `${profileName} Compound/Product Identifiers`,
      content: `Potential compound identifiers found: ${unique.join(', ')}. Source: ${fileName}`,
      confidenceScore: 0.65,
      importanceLevel: 'medium',
    });
  }

  // ── Extract competitor signals ─────────────────────────────────
  const competitorPatterns = analysisText.match(
    /(?:competitor|competing|rival|versus|vs\.?)\s*(?:include|are|:)?\s*([^\n.]{10,200})/gi
  );
  if (competitorPatterns) {
    entries.push({
      category: 'competitive',
      subcategory: 'competitor_mentions',
      title: `${profileName} Competitive References`,
      content: competitorPatterns.slice(0, 3).join('; ').trim(),
      confidenceScore: 0.7,
      importanceLevel: 'medium',
    });
  }

  // ── Extract Phase/Clinical Trial signals ──────────────────────
  const phaseMatches = analysisText.match(/Phase\s*[I1][I1]?[I1]?[abAB]?/g);
  if (phaseMatches) {
    const uniquePhases = [...new Set(phaseMatches)];
    entries.push({
      category: 'clinical',
      subcategory: 'development_phases',
      title: `${profileName} Clinical Development Phases`,
      content: `Clinical phases referenced: ${uniquePhases.join(', ')}. Source: ${fileName}`,
      confidenceScore: 0.8,
      importanceLevel: 'medium',
    });
  }

  // ── Extract key personnel/stakeholders ────────────────────────
  const titlePatterns = analysisText.match(
    /(?:CEO|CTO|CMO|CSO|COO|VP|Director|Head|Chief)\s*(?:of\s+)?[A-Z][a-zA-Z\s]{3,40}/g
  );
  if (titlePatterns) {
    entries.push({
      category: 'operational',
      subcategory: 'key_personnel',
      title: `${profileName} Key Personnel`,
      content: `Key roles identified: ${[...new Set(titlePatterns)].slice(0, 8).join('; ')}. Source: ${fileName}`,
      confidenceScore: 0.7,
      importanceLevel: 'medium',
    });
  }

  // ── Always create a document summary entry ─────────────────────
  const firstParagraph = analysisText.slice(0, 500).replace(/\s+/g, ' ').trim();
  entries.push({
    category: 'history',
    subcategory: 'document_ingestion',
    title: `Ingested: ${fileName}`,
    content: `Document "${fileName}" was ingested into client intelligence. Opening content: ${firstParagraph}...`,
    confidenceScore: 1.0,
    importanceLevel: 'low',
  });

  return entries;
}

/**
 * Ingest a document into client intelligence memory.
 */
export async function ingestDocument(
  profileId: number | null,
  organizationId: number,
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  userId: number
): Promise<DocumentIngestionResult> {
  // 1. Create the ingested document record
  const [docRecord] = await db
    .insert(clientIngestedDocuments)
    .values({
      profileId,
      organizationId,
      fileName: file.originalname,
      fileType: file.originalname.split('.').pop() || 'unknown',
      fileSizeBytes: file.size,
      mimeType: file.mimetype,
      processingStatus: 'processing',
      uploadedBy: userId,
    })
    .returning();

  try {
    // 2. Extract text
    const { text, pageCount } = await extractTextFromFile(
      file.buffer,
      file.mimetype,
      file.originalname
    );
    const tokenCount = estimateTokens(text);

    // 3. Get the profile for context
    const profile = await db
      .select()
      .from(clientIntelligenceProfiles)
      .where(eq(clientIntelligenceProfiles.id, profileId))
      .limit(1);

    const profileName = profile[0]?.companyName || 'Unknown Client';

    // 4. Extract memory entries from text
    const extractedEntries = extractMemoryEntriesFromText(text, file.originalname, profileName);

    // 5. Persist memory entries
    if (extractedEntries.length > 0) {
      await db.insert(clientMemoryEntries).values(
        extractedEntries.map(entry => ({
          profileId,
          organizationId,
          category: entry.category,
          subcategory: entry.subcategory,
          title: entry.title,
          content: entry.content,
          sourceDocumentName: file.originalname,
          sourceDocumentType: file.originalname.split('.').pop() || 'unknown',
          confidenceScore: entry.confidenceScore,
          importanceLevel: entry.importanceLevel,
          extractedBy: 'ai' as const,
        }))
      );
    }

    // 6. Update the document record
    await db
      .update(clientIngestedDocuments)
      .set({
        extractedText: text.slice(0, 100000), // Store first 100K chars
        tokenCount,
        pageCount: pageCount || null,
        processingStatus: 'completed',
        memoryEntriesGenerated: extractedEntries.length,
        processedAt: new Date(),
      })
      .where(eq(clientIngestedDocuments.id, docRecord.id));

    // 7. Update profile counters
    await db
      .update(clientIntelligenceProfiles)
      .set({
        totalDocumentsIngested: sql`${clientIntelligenceProfiles.totalDocumentsIngested} + 1`,
        totalTokensProcessed: sql`${clientIntelligenceProfiles.totalTokensProcessed} + ${tokenCount}`,
        lastDocumentIngestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientIntelligenceProfiles.id, profileId));

    return {
      documentId: docRecord.id,
      fileName: file.originalname,
      extractedText: text.slice(0, 2000), // Preview
      tokenCount,
      memoryEntriesCreated: extractedEntries.length,
      status: 'completed',
    };
  } catch (err: any) {
    // Mark as failed
    await db
      .update(clientIngestedDocuments)
      .set({
        processingStatus: 'failed',
        processingError: err.message,
      })
      .where(eq(clientIngestedDocuments.id, docRecord.id));

    return {
      documentId: docRecord.id,
      fileName: file.originalname,
      extractedText: '',
      tokenCount: 0,
      memoryEntriesCreated: 0,
      status: 'failed',
      error: err.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all memory entries for a client profile, optionally filtered by category.
 */
export async function getMemoryEntries(
  profileId?: number,
  options?: { category?: string; limit?: number; offset?: number }
): Promise<MemorySearchResult> {
  const conditions = [
    eq(clientMemoryEntries.profileId, profileId),
    eq(clientMemoryEntries.status, 'active'),
  ];

  if (options?.category) {
    conditions.push(eq(clientMemoryEntries.category, options.category));
  }

  const [entries, countResult] = await Promise.all([
    db
      .select()
      .from(clientMemoryEntries)
      .where(and(...conditions))
      .orderBy(desc(clientMemoryEntries.createdAt))
      .limit(options?.limit || 100)
      .offset(options?.offset || 0),
    db
      .select({ count: sql<number>`count(*)` })
      .from(clientMemoryEntries)
      .where(and(...conditions)),
  ]);

  return {
    entries,
    totalCount: Number(countResult[0]?.count || 0),
  };
}

/**
 * Get all ingested documents for a profile.
 */
export async function getIngestedDocuments(
  profileId: number
): Promise<ClientIngestedDocument[]> {
  return db
    .select()
    .from(clientIngestedDocuments)
    .where(eq(clientIngestedDocuments.profileId, profileId))
    .orderBy(desc(clientIngestedDocuments.uploadedAt));
}

/**
 * Get the document checklist with upload status for a profile.
 */
export async function getDocumentChecklist(
  profileId: number
): Promise<DocumentChecklist[]> {
  const docs = await getIngestedDocuments(profileId);
  const uploadedNames = new Set(docs.map(d => d.fileName.toLowerCase()));

  return DOCUMENT_CHECKLIST.map(cat => ({
    ...cat,
    items: cat.items.map(item => ({
      ...item,
      uploaded: docs.some(d => {
        const ext = d.fileType?.toLowerCase() || '';
        const name = d.fileName.toLowerCase();
        // Check if any uploaded doc roughly matches this checklist item
        return (
          item.fileTypes.includes(ext) &&
          (name.includes(item.label.toLowerCase().split(' ')[0]) || uploadedNames.has(name))
        );
      }),
    })),
  }));
}

/**
 * Build a comprehensive client intelligence summary for injection into
 * the AnA 1.0 RI Context Builder system prompt.
 */
export async function buildClientIntelligenceContext(
  organizationId: number,
  clientWorkspaceId?: number
): Promise<string | null> {
  const profile = await getClientProfile(organizationId, clientWorkspaceId);
  if (!profile || profile.profileStatus !== 'active') return null;

  const { entries } = await getMemoryEntries(profile.id, { limit: 50 });

  // Group entries by category
  const grouped: Record<string, ClientMemoryEntry[]> = {};
  for (const entry of entries) {
    if (!grouped[entry.category]) grouped[entry.category] = [];
    grouped[entry.category].push(entry);
  }

  const parts: string[] = [];

  // ── Profile header ─────────────────────────────────────────────
  parts.push(`
## Client Intelligence — ${profile.companyName}
You have deep knowledge of this client organization. Use this intelligence to personalize every interaction.

### Company Identity
- **Company**: ${profile.companyName}${profile.industry ? ` (${profile.industry}${profile.subIndustry ? ` — ${profile.subIndustry}` : ''})` : ''}${profile.companySize ? `\n- **Size**: ${profile.companySize}` : ''}${profile.headquarters ? `\n- **HQ**: ${profile.headquarters}` : ''}${profile.website ? `\n- **Web**: ${profile.website}` : ''}`);

  // ── Regulatory identity ────────────────────────────────────────
  const submTypes = profile.primarySubmissionTypes as string[] | null;
  const markets = profile.regulatoryMarkets as string[] | null;
  const therapAreas = profile.therapeuticAreas as string[] | null;
  const techPlatforms = profile.technologyPlatforms as string[] | null;

  if (submTypes?.length || markets?.length || therapAreas?.length) {
    parts.push(`
### Regulatory Profile${submTypes?.length ? `\n- **Submission Types**: ${submTypes.join(', ')}` : ''}${markets?.length ? `\n- **Markets**: ${markets.join(', ')}` : ''}${therapAreas?.length ? `\n- **Therapeutic Areas**: ${therapAreas.join(', ')}` : ''}${techPlatforms?.length ? `\n- **Technology Platforms**: ${techPlatforms.join(', ')}` : ''}`);
  }

  // ── Pipeline assets ────────────────────────────────────────────
  const pipeline = profile.pipelineAssets as PipelineAssetInput[] | null;
  if (pipeline?.length) {
    const pipelineStr = pipeline
      .slice(0, 8)
      .map(a => `  - **${a.name}**: ${a.phase} — ${a.indication}${a.mechanism ? ` (${a.mechanism})` : ''}`)
      .join('\n');
    parts.push(`
### Pipeline Assets
${pipelineStr}`);
  }

  // ── Company persona ────────────────────────────────────────────
  if (profile.companyPersona) {
    parts.push(`
### Company Persona & Culture
${profile.companyPersona}`);
  }

  if (profile.regulatoryPhilosophy) {
    parts.push(`
### Regulatory Philosophy
${profile.regulatoryPhilosophy}`);
  }

  if (profile.communicationPreferences) {
    parts.push(`
### Communication Preferences
${profile.communicationPreferences}`);
  }

  // ── Key stakeholders ───────────────────────────────────────────
  const stakeholders = profile.keyStakeholders as StakeholderInput[] | null;
  if (stakeholders?.length) {
    const stakeStr = stakeholders
      .slice(0, 6)
      .map(s => `  - **${s.name}** — ${s.title} (${s.role})${s.preferences ? `: ${s.preferences}` : ''}`)
      .join('\n');
    parts.push(`
### Key Stakeholders
${stakeStr}`);
  }

  // ── Learned intelligence by category ───────────────────────────
  if (entries.length > 0) {
    parts.push(`
### Learned Intelligence (${entries.length} knowledge atoms from ${profile.totalDocumentsIngested || 0} documents)`);

    for (const [category, catEntries] of Object.entries(grouped)) {
      const highPriority = catEntries.filter(
        e => e.importanceLevel === 'high' || e.importanceLevel === 'critical'
      );
      const items = highPriority.length > 0 ? highPriority : catEntries.slice(0, 3);
      parts.push(`
#### ${category.charAt(0).toUpperCase() + category.slice(1)}
${items.map(e => `- ${e.title}: ${e.content.slice(0, 200)}`).join('\n')}`);
    }
  }

  // ── AI guidance ────────────────────────────────────────────────
  parts.push(`
### How to Use This Intelligence
- Reference the client's pipeline and therapeutic areas when suggesting strategies
- Align recommendations with their regulatory philosophy
- Use their communication preferences to calibrate your tone and detail level
- Proactively flag competitive intelligence relevant to their pipeline
- When drafting documents, default to their preferred submission types and markets
- Reference past submissions and regulatory history for continuity`);

  return parts.join('\n');
}

/**
 * Delete a memory entry (soft-delete by archiving).
 */
export async function archiveMemoryEntry(entryId: number): Promise<void> {
  await db
    .update(clientMemoryEntries)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(clientMemoryEntries.id, entryId));
}

/**
 * Verify/confirm a memory entry as accurate.
 */
export async function verifyMemoryEntry(entryId: number, userId: number): Promise<void> {
  await db
    .update(clientMemoryEntries)
    .set({
      isVerifiedByUser: true,
      verifiedAt: new Date(),
      verifiedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(clientMemoryEntries.id, entryId));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT-LEVEL INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProjectIntelligenceInput {
  regulatoryStrategy?: string;
  targetIndication?: string;
  targetPopulation?: string;
  primaryEndpoints?: Array<{ endpoint: string; type: string; measurement: string }>;
  comparatorDevicesOrDrugs?: Array<{ name: string; type: string; reference: string }>;
  keyConstraints?: string;
  submissionTimeline?: Array<{ milestone: string; targetDate: string; status: string }>;
  projectPersona?: string;
  customInstructions?: string;
}

/**
 * Create or update a project intelligence profile.
 */
export async function upsertProjectIntelligence(
  projectId: number,
  organizationId: number,
  input: ProjectIntelligenceInput,
  userId: number
): Promise<ProjectIntelligenceProfile> {
  const existing = await db
    .select()
    .from(projectIntelligenceProfiles)
    .where(eq(projectIntelligenceProfiles.projectId, projectId))
    .limit(1);

  const profileData = {
    projectId,
    organizationId,
    regulatoryStrategy: input.regulatoryStrategy || null,
    targetIndication: input.targetIndication || null,
    targetPopulation: input.targetPopulation || null,
    primaryEndpoints: input.primaryEndpoints || [],
    comparatorDevicesOrDrugs: input.comparatorDevicesOrDrugs || [],
    keyConstraints: input.keyConstraints || null,
    submissionTimeline: input.submissionTimeline || [],
    projectPersona: input.projectPersona || null,
    customInstructions: input.customInstructions || null,
    lastEnrichedBy: userId,
    lastEnrichedAt: new Date(),
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    const [updated] = await db
      .update(projectIntelligenceProfiles)
      .set(profileData)
      .where(eq(projectIntelligenceProfiles.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(projectIntelligenceProfiles)
    .values({ ...profileData, createdBy: userId, profileStatus: 'active' })
    .returning();
  return created;
}

/**
 * Get project intelligence profile.
 */
export async function getProjectIntelligence(
  projectId: number
): Promise<ProjectIntelligenceProfile | null> {
  const rows = await db
    .select()
    .from(projectIntelligenceProfiles)
    .where(eq(projectIntelligenceProfiles.projectId, projectId))
    .limit(1);
  return rows[0] || null;
}

/**
 * Ingest a document into project-level intelligence.
 */
export async function ingestProjectDocument(
  projectProfileId: number | null,
  projectId: number,
  organizationId: number,
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  userId: number
): Promise<DocumentIngestionResult> {
  const [docRecord] = await db
    .insert(projectIngestedDocuments)
    .values({
      projectProfileId,
      projectId,
      organizationId,
      fileName: file.originalname,
      fileType: file.originalname.split('.').pop() || 'unknown',
      fileSizeBytes: file.size,
      mimeType: file.mimetype,
      processingStatus: 'processing',
      uploadedBy: userId,
    })
    .returning();

  try {
    const { text, pageCount } = await extractTextFromFile(file.buffer, file.mimetype, file.originalname);
    const tokenCount = estimateTokens(text);

    // Get project name for context
    const proj = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const projectName = proj[0]?.name || 'Unknown Project';

    // Extract project-specific memory entries
    const extractedEntries = extractProjectMemoryEntries(text, file.originalname, projectName);

    if (extractedEntries.length > 0) {
      await db.insert(projectMemoryEntries).values(
        extractedEntries.map(entry => ({
          projectProfileId,
          projectId,
          organizationId,
          category: entry.category,
          subcategory: entry.subcategory,
          title: entry.title,
          content: entry.content,
          sourceDocumentName: file.originalname,
          sourceDocumentType: file.originalname.split('.').pop() || 'unknown',
          confidenceScore: entry.confidenceScore,
          importanceLevel: entry.importanceLevel,
          extractedBy: 'ai' as const,
        }))
      );
    }

    await db
      .update(projectIngestedDocuments)
      .set({
        extractedText: text.slice(0, 100000),
        tokenCount,
        pageCount: pageCount || null,
        processingStatus: 'completed',
        memoryEntriesGenerated: extractedEntries.length,
        processedAt: new Date(),
      })
      .where(eq(projectIngestedDocuments.id, docRecord.id));

    await db
      .update(projectIntelligenceProfiles)
      .set({
        totalDocumentsIngested: sql`${projectIntelligenceProfiles.totalDocumentsIngested} + 1`,
        totalTokensProcessed: sql`${projectIntelligenceProfiles.totalTokensProcessed} + ${tokenCount}`,
        lastDocumentIngestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projectIntelligenceProfiles.id, projectProfileId));

    return {
      documentId: docRecord.id,
      fileName: file.originalname,
      extractedText: text.slice(0, 2000),
      tokenCount,
      memoryEntriesCreated: extractedEntries.length,
      status: 'completed',
    };
  } catch (err: any) {
    await db
      .update(projectIngestedDocuments)
      .set({ processingStatus: 'failed', processingError: err.message })
      .where(eq(projectIngestedDocuments.id, docRecord.id));

    return {
      documentId: docRecord.id,
      fileName: file.originalname,
      extractedText: '',
      tokenCount: 0,
      memoryEntriesCreated: 0,
      status: 'failed',
      error: err.message,
    };
  }
}

/**
 * Extract project-specific memory entries from document text.
 */
function extractProjectMemoryEntries(
  text: string,
  fileName: string,
  projectName: string
): Array<{
  category: string;
  subcategory: string;
  title: string;
  content: string;
  confidenceScore: number;
  importanceLevel: string;
}> {
  const entries: Array<{
    category: string;
    subcategory: string;
    title: string;
    content: string;
    confidenceScore: number;
    importanceLevel: string;
  }> = [];

  const analysisText = text.slice(0, 50000);
  const lowerText = analysisText.toLowerCase();

  // ── Endpoint extraction ────────────────────────────────────────
  const endpointPatterns = analysisText.match(
    /(?:primary|secondary|exploratory)\s*(?:endpoint|outcome)[s]?\s*(?:include|are|:)?\s*([^\n.]{10,300})/gi
  );
  if (endpointPatterns) {
    entries.push({
      category: 'endpoint',
      subcategory: 'primary_endpoints',
      title: `${projectName} Clinical Endpoints`,
      content: endpointPatterns.slice(0, 3).join('; ').trim(),
      confidenceScore: 0.85,
      importanceLevel: 'high',
    });
  }

  // ── Patient population extraction ──────────────────────────────
  const populationMatch = analysisText.match(
    /(?:patient|subject|participant)\s*(?:population|cohort|group)[s]?\s*(?:include|consist|comprise)[s]?\s*([^\n.]{10,300})/i
  );
  if (populationMatch) {
    entries.push({
      category: 'clinical',
      subcategory: 'patient_population',
      title: `${projectName} Patient Population`,
      content: populationMatch[1].trim(),
      confidenceScore: 0.8,
      importanceLevel: 'high',
    });
  }

  // ── Study design extraction ────────────────────────────────────
  const designPatterns = [
    'randomized', 'double-blind', 'placebo-controlled', 'open-label',
    'single-arm', 'crossover', 'parallel-group', 'dose-escalation',
    'adaptive', 'basket', 'umbrella', 'platform',
  ];
  const foundDesigns = designPatterns.filter(d => lowerText.includes(d));
  if (foundDesigns.length > 0) {
    entries.push({
      category: 'strategy',
      subcategory: 'study_design',
      title: `${projectName} Study Design Elements`,
      content: `Study design characteristics: ${foundDesigns.join(', ')}. Source: ${fileName}`,
      confidenceScore: 0.8,
      importanceLevel: 'medium',
    });
  }

  // ── Risk factors extraction ────────────────────────────────────
  const riskMatch = analysisText.match(
    /(?:risk|safety|adverse|concern|limitation)[s]?\s*(?:include|are|:)?\s*([^\n.]{15,300})/gi
  );
  if (riskMatch) {
    entries.push({
      category: 'risk',
      subcategory: 'identified_risks',
      title: `${projectName} Risk/Safety Signals`,
      content: riskMatch.slice(0, 3).join('; ').trim(),
      confidenceScore: 0.75,
      importanceLevel: 'high',
    });
  }

  // ── Manufacturing/CMC signals ──────────────────────────────────
  const cmcPatterns = ['drug substance', 'drug product', 'formulation', 'stability',
    'manufacturing process', 'excipient', 'packaging', 'shelf life', 'GMP'];
  const foundCMC = cmcPatterns.filter(p => lowerText.includes(p));
  if (foundCMC.length >= 2) {
    entries.push({
      category: 'manufacturing',
      subcategory: 'cmc_signals',
      title: `${projectName} CMC References`,
      content: `CMC topics referenced: ${foundCMC.join(', ')}. Source: ${fileName}`,
      confidenceScore: 0.7,
      importanceLevel: 'medium',
    });
  }

  // ── Regulatory decision extraction ─────────────────────────────
  const decisionMatch = analysisText.match(
    /(?:FDA|EMA|PMDA|agency)\s*(?:recommended|required|requested|approved|denied|suggested)\s*([^\n.]{10,200})/gi
  );
  if (decisionMatch) {
    entries.push({
      category: 'decision',
      subcategory: 'agency_feedback',
      title: `${projectName} Regulatory Agency Feedback`,
      content: decisionMatch.slice(0, 3).join('; ').trim(),
      confidenceScore: 0.85,
      importanceLevel: 'critical',
    });
  }

  // ── Document summary ───────────────────────────────────────────
  const firstParagraph = analysisText.slice(0, 400).replace(/\s+/g, ' ').trim();
  entries.push({
    category: 'strategy',
    subcategory: 'document_ingestion',
    title: `Ingested: ${fileName}`,
    content: `Document "${fileName}" ingested for project "${projectName}". Content preview: ${firstParagraph}...`,
    confidenceScore: 1.0,
    importanceLevel: 'low',
  });

  return entries;
}

/**
 * Get project memory entries.
 */
export async function getProjectMemoryEntries(
  projectProfileId?: number,
  options?: { category?: string; limit?: number }
): Promise<{ entries: ProjectMemoryEntry[]; totalCount: number }> {
  const conditions = [
    eq(projectMemoryEntries.projectProfileId, projectProfileId),
    eq(projectMemoryEntries.status, 'active'),
  ];
  if (options?.category) {
    conditions.push(eq(projectMemoryEntries.category, options.category));
  }

  const [entries, countResult] = await Promise.all([
    db.select().from(projectMemoryEntries)
      .where(and(...conditions))
      .orderBy(desc(projectMemoryEntries.createdAt))
      .limit(options?.limit || 100),
    db.select({ count: sql<number>`count(*)` })
      .from(projectMemoryEntries)
      .where(and(...conditions)),
  ]);

  return { entries, totalCount: Number(countResult[0]?.count || 0) };
}

/**
 * Get project ingested documents.
 */
export async function getProjectIngestedDocuments(
  projectProfileId: number
): Promise<ProjectIngestedDocument[]> {
  return db.select().from(projectIngestedDocuments)
    .where(eq(projectIngestedDocuments.projectProfileId, projectProfileId))
    .orderBy(desc(projectIngestedDocuments.uploadedAt));
}

/**
 * Build project intelligence context for the AnA 1.0 RI system prompt.
 */
export async function buildProjectIntelligenceContext(
  projectId: number
): Promise<string | null> {
  const profile = await getProjectIntelligence(projectId);
  if (!profile || profile.profileStatus !== 'active') return null;

  const { entries } = await getProjectMemoryEntries(profile.id, { limit: 30 });
  const parts: string[] = [];

  parts.push(`
## Project Intelligence — Deep Knowledge for This Submission
You have studied this project's documents and strategy in detail. Use this intelligence to guide every recommendation.`);

  if (profile.regulatoryStrategy) {
    parts.push(`
### Regulatory Strategy
${profile.regulatoryStrategy}`);
  }

  if (profile.targetIndication || profile.targetPopulation) {
    parts.push(`
### Clinical Target${profile.targetIndication ? `\n- **Indication**: ${profile.targetIndication}` : ''}${profile.targetPopulation ? `\n- **Population**: ${profile.targetPopulation}` : ''}`);
  }

  const endpoints = profile.primaryEndpoints as Array<{ endpoint: string; type: string }> | null;
  if (endpoints?.length) {
    parts.push(`
### Primary Endpoints
${endpoints.map(e => `- **${e.endpoint}** (${e.type})`).join('\n')}`);
  }

  const comparators = profile.comparatorDevicesOrDrugs as Array<{ name: string; type: string }> | null;
  if (comparators?.length) {
    parts.push(`
### Comparator Products
${comparators.map(c => `- **${c.name}** (${c.type})`).join('\n')}`);
  }

  if (profile.keyConstraints) {
    parts.push(`
### Key Constraints & Considerations
${profile.keyConstraints}`);
  }

  if (profile.projectPersona) {
    parts.push(`
### Project-Specific Instructions
${profile.projectPersona}`);
  }

  if (profile.customInstructions) {
    parts.push(`
### Custom Instructions
${profile.customInstructions}`);
  }

  // Add learned entries grouped by category
  if (entries.length > 0) {
    const grouped: Record<string, ProjectMemoryEntry[]> = {};
    for (const entry of entries) {
      if (!grouped[entry.category]) grouped[entry.category] = [];
      grouped[entry.category].push(entry);
    }

    parts.push(`
### Learned Project Intelligence (${entries.length} knowledge atoms from ${profile.totalDocumentsIngested || 0} documents)`);

    for (const [cat, catEntries] of Object.entries(grouped)) {
      const highPriority = catEntries.filter(e => e.importanceLevel === 'high' || e.importanceLevel === 'critical');
      const items = highPriority.length > 0 ? highPriority : catEntries.slice(0, 3);
      parts.push(`
#### ${cat.charAt(0).toUpperCase() + cat.slice(1)}
${items.map(e => `- ${e.title}: ${e.content.slice(0, 200)}`).join('\n')}`);
    }
  }

  return parts.join('\n');
}


export type SemanticMemoryHit<T> = T & { similarity: number };



export interface SharedMemoryPoolEntry {
  id: number;
  scope: 'client' | 'project';
  profileId: number | null;
  projectId: number | null;
  category: string;
  subcategory: string | null;
  title: string;
  content: string;
  status: string;
  confidenceScore: number | null;
  importanceLevel: string | null;
  isVerifiedByUser: boolean;
  sourceDocumentName: string | null;
  sourceDocumentType: string | null;
  updatedAt: string;
}

export interface SemanticMemorySearchResult<T> {
  entries: Array<SemanticMemoryHit<T>>;
  totalCount: number;
  query: string;
}



/**
 * Supersede a client memory entry (lifecycle transition from active -> superseded).
 */
export async function supersedeClientMemoryEntry(
  entryId: number,
  organizationId: number,
  supersededById?: number
): Promise<void> {
  await db
    .update(clientMemoryEntries)
    .set({
      status: 'superseded',
      supersededById: supersededById ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(clientMemoryEntries.id, entryId),
        eq(clientMemoryEntries.organizationId, organizationId)
      )
    );
}

/**
 * Supersede a project memory entry (lifecycle transition from active -> superseded).
 */
export async function supersedeProjectMemoryEntry(
  entryId: number,
  projectId: number,
  organizationId: number
): Promise<void> {
  await db
    .update(projectMemoryEntries)
    .set({
      status: 'superseded',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectMemoryEntries.id, entryId),
        eq(projectMemoryEntries.projectId, projectId),
        eq(projectMemoryEntries.organizationId, organizationId)
      )
    );
}

/**
 * Shared memory pool view for multi-agent collaboration.
 * Merges client + project memory entries into one normalized list.
 */
export async function getSharedMemoryPool(
  organizationId: number,
  options?: {
    projectId?: number;
    category?: string;
    query?: string;
    limit?: number;
    includeSuperseded?: boolean;
  }
): Promise<{ entries: SharedMemoryPoolEntry[]; totalCount: number }> {
  const limit = Math.max(1, Math.min(options?.limit || 100, 500));
  const includeSuperseded = Boolean(options?.includeSuperseded);
  const statusFilter = includeSuperseded ? `IN ('active', 'superseded')` : `= 'active'`;

  const params: any[] = [organizationId];
  const pushParam = (v: any) => {
    params.push(v);
    return `$${params.length}`;
  };

  const clientWhere: string[] = [];
  const projectWhere: string[] = [];

  if (options?.category) {
    const p = pushParam(options.category);
    clientWhere.push(`category = ${p}`);
    projectWhere.push(`category = ${p}`);
  }

  if (options?.query?.trim()) {
    const q = pushParam(`%${options.query.trim()}%`);
    clientWhere.push(`(title ILIKE ${q} OR content ILIKE ${q})`);
    projectWhere.push(`(title ILIKE ${q} OR content ILIKE ${q})`);
  }

  if (options?.projectId) {
    const pid = pushParam(options.projectId);
    projectWhere.push(`project_id = ${pid}`);
  }

  const clientExtra = clientWhere.length ? ` AND ${clientWhere.join(' AND ')}` : '';
  const projectExtra = projectWhere.length ? ` AND ${projectWhere.join(' AND ')}` : '';
  const limitParam = pushParam(limit);

  const rows = await pool.query(
    `SELECT * FROM (
      SELECT
        id,
        'client'::text AS scope,
        profile_id,
        NULL::integer AS project_id,
        category,
        subcategory,
        title,
        content,
        status,
        confidence_score,
        importance_level,
        is_verified_by_user,
        source_document_name,
        source_document_type,
        updated_at
      FROM client_memory_entries
      WHERE organization_id = $1
        AND status ${statusFilter}
        ${clientExtra}

      UNION ALL

      SELECT
        id,
        'project'::text AS scope,
        project_profile_id AS profile_id,
        project_id,
        category,
        subcategory,
        title,
        content,
        status,
        confidence_score,
        importance_level,
        is_verified_by_user,
        source_document_name,
        source_document_type,
        updated_at
      FROM project_memory_entries
      WHERE organization_id = $1
        AND status ${statusFilter}
        ${projectExtra}
    ) shared_pool
    ORDER BY updated_at DESC
    LIMIT ${limitParam}`,
    params
  );

  return {
    entries: rows.rows.map((row: any) => ({
      id: row.id,
      scope: row.scope,
      profileId: row.profile_id,
      projectId: row.project_id,
      category: row.category,
      subcategory: row.subcategory,
      title: row.title,
      content: row.content,
      status: row.status,
      confidenceScore: row.confidence_score,
      importanceLevel: row.importance_level,
      isVerifiedByUser: Boolean(row.is_verified_by_user),
      sourceDocumentName: row.source_document_name,
      sourceDocumentType: row.source_document_type,
      updatedAt: new Date(row.updated_at).toISOString(),
    })),
    totalCount: rows.rows.length,
  };
}

/**
 * Semantic search over client memory entries using pgvector similarity.
 */
export async function searchMemoryEntriesSemantic(
  profileId: number | null,
  organizationId: number,
  query: string,
  options?: { limit?: number; category?: string; minSimilarity?: number }
 ): Promise<SemanticMemorySearchResult<ClientMemoryEntry>> {
  const limit = Math.max(1, Math.min(options?.limit || 10, 50));
  const minSimilarity = options?.minSimilarity ?? 0.65;

  const embeddingService = getEmbeddingService(pool);
  const embedded = await embeddingService.embed(query, 'text-embedding-3-small');
  const vectorLiteral = `[${embedded.embedding.join(',')}]`;

  const profileClause = profileId ? 'AND profile_id = $3' : '';
  const categoryClause = options?.category ? `AND category = $${profileId ? 5 : 4}` : '';
  const params: any[] = profileId
    ? [vectorLiteral, organizationId, profileId, minSimilarity]
    : [vectorLiteral, organizationId, minSimilarity];
  if (options?.category) params.push(options.category);
  params.push(limit);

  const rows = await pool.query(
    `SELECT
       *,
       1 - (embedding <=> $1::vector) AS similarity
     FROM client_memory_entries
     WHERE organization_id = $2
       ${profileClause}
       AND status = 'active'
       AND embedding IS NOT NULL
       AND 1 - (embedding <=> $1::vector) >= $${profileId ? 4 : 3}
       ${categoryClause}
     ORDER BY embedding <=> $1::vector
     LIMIT $${params.length}`,
    params
  );

  return {
    entries: rows.rows as Array<SemanticMemoryHit<ClientMemoryEntry>>,
    totalCount: rows.rows.length,
    query,
  };
}

/**
 * Semantic search over project memory entries using pgvector similarity.
 */
export async function searchProjectMemoryEntriesSemantic(
  projectProfileId: number | null,
  projectId: number,
  organizationId: number,
  query: string,
  options?: { limit?: number; category?: string; minSimilarity?: number }
): Promise<SemanticMemorySearchResult<ProjectMemoryEntry>> {
  const limit = Math.max(1, Math.min(options?.limit || 10, 50));
  const minSimilarity = options?.minSimilarity ?? 0.65;

  const embeddingService = getEmbeddingService(pool);
  const embedded = await embeddingService.embed(query, 'text-embedding-3-small');
  const vectorLiteral = `[${embedded.embedding.join(',')}]`;

  const profileClause = projectProfileId ? 'AND project_profile_id = $4' : '';
  const categoryClause = options?.category ? `AND category = $${projectProfileId ? 6 : 5}` : '';
  const params: any[] = projectProfileId
    ? [vectorLiteral, organizationId, projectId, projectProfileId, minSimilarity]
    : [vectorLiteral, organizationId, projectId, minSimilarity];
  if (options?.category) params.push(options.category);
  params.push(limit);

  const rows = await pool.query(
    `SELECT
       *,
       1 - (embedding <=> $1::vector) AS similarity
     FROM project_memory_entries
     WHERE organization_id = $2
       AND project_id = $3
       ${profileClause}
       AND status = 'active'
       AND embedding IS NOT NULL
       AND 1 - (embedding <=> $1::vector) >= $${projectProfileId ? 5 : 4}
       ${categoryClause}
     ORDER BY embedding <=> $1::vector
     LIMIT $${params.length}`,
    params
  );

  return {
    entries: rows.rows as Array<SemanticMemoryHit<ProjectMemoryEntry>>,
    totalCount: rows.rows.length,
    query,
  };
}

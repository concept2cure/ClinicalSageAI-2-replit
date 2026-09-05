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
} from '../../shared/schema';
import { eq, and, desc, sql, asc } from 'drizzle-orm';
import { getEmbeddingService } from './enhancedEmbeddingService.js';
import { resolveMemoryEntries } from './memory/llm-extraction.js';
import {
  extractMemoryEntriesFromText,
  extractProjectMemoryEntries,
} from './memory/heuristic-extraction.js';
import { extractTextFromFile } from './memory/document-text-extraction.js';
import { computeDocumentChecklist, type DocumentChecklist } from './memory/document-checklist.js';
import { ragRetrieve } from './ragRouter.js';

// ─── Embedding of newly inserted memory entries ─────────────────────────────

/**
 * Write embeddings for memory entries the ingest paths just inserted.
 *
 * Semantic recall over these tables filters `embedding IS NOT NULL`
 * (searchMemoryEntries / searchProjectMemoryEntries below), so an entry
 * stored without one is durable but invisible — the ingest paths wrote
 * exactly that state for every entry they ever created, and only the
 * consolidation job's promoted summaries were findable. Failure policy
 * matches memory-consolidation-job.ts: an embedding failure is logged and
 * the entries stay unembedded rather than failing the ingestion — the facts
 * are kept, and the log says they are not yet semantically reachable.
 */
async function embedInsertedMemoryEntries(
  table: 'client_memory_entries' | 'project_memory_entries',
  inserted: Array<{ id: number }>,
  entries: Array<{ title: string; content: string }>,
): Promise<void> {
  if (inserted.length === 0) return;
  try {
    const texts = entries.map(e => `${e.title}\n${e.content}`);
    const results = await getEmbeddingService(pool).embedBatch(texts, 'text-embedding-3-small');
    for (let i = 0; i < inserted.length; i++) {
      const embedding = results[i]?.embedding;
      if (!embedding) continue;
      await pool.query(
        `UPDATE ${table} SET embedding = $1::vector WHERE id = $2`,
        [`[${embedding.join(',')}]`, inserted[i].id],
      );
    }
  } catch (err) {
    console.warn(
      `[client-intelligence-memory] Embedding ${inserted.length} new ${table} entr(ies) failed — ` +
        `stored without embeddings (invisible to semantic recall until re-embedded): ` +
        (err instanceof Error ? err.message : 'unknown error'),
    );
  }
}

/** The shared column shape both ingest paths write for one extracted entry. */
function memoryEntryRow(
  entry: { category: string; subcategory?: string | null; title: string; content: string;
           confidenceScore?: number | null; importanceLevel?: string | null },
  fileName: string,
) {
  return {
    category: entry.category,
    subcategory: entry.subcategory,
    title: entry.title,
    content: entry.content,
    sourceDocumentName: fileName,
    sourceDocumentType: fileName.split('.').pop() || 'unknown',
    confidenceScore: entry.confidenceScore,
    importanceLevel: entry.importanceLevel,
    extractedBy: 'ai' as const,
  };
}

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

export type { DocumentChecklist, DocumentChecklistItem } from './memory/document-checklist.js';

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

  const [created] = (await db
    .insert(clientIntelligenceProfiles as any)
    .values({
      ...profileData,
      createdBy: userId,
      profileStatus: 'active',
    })
    .returning()) as any[];
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
 * Ingest a document into client intelligence memory.
 */
export async function ingestDocument(
  profileId: number,
  organizationId: number,
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  userId: number
): Promise<DocumentIngestionResult> {
  // 1. Create the ingested document record
  const [docRecord] = (await db
    .insert(clientIngestedDocuments as any)
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
    .returning()) as any[];

  try {
    // 2. Extract text
    const { text, pageCount } = await extractTextFromFile(
      file.buffer,
      file.mimetype,
      file.originalname
    );
    const tokenCount = estimateTokens(text);

    // 3. Get the profile for context
    const profile = profileId == null
      ? []
      : await db
          .select()
          .from(clientIntelligenceProfiles)
          .where(eq(clientIntelligenceProfiles.id, profileId))
          .limit(1);

    const profileName = profile[0]?.companyName || 'Unknown Client';

    // 4. Extract memory entries from text (governed LLM, heuristic fallback)
    const extractedEntries = await resolveMemoryEntries({
      kind: 'client',
      text,
      fileName: file.originalname,
      subjectName: profileName,
      organizationId,
      userId,
      heuristic: () => extractMemoryEntriesFromText(text, file.originalname, profileName),
    });

    // 5. Persist memory entries — embedded, because semantic recall filters
    // `embedding IS NOT NULL` and an unembedded entry is durable but invisible.
    if (extractedEntries.length > 0) {
      const inserted = (await db
        .insert(clientMemoryEntries as any)
        .values(extractedEntries.map(e => ({ profileId, organizationId, ...memoryEntryRow(e, file.originalname) })))
        .returning({ id: (clientMemoryEntries as any).id })) as Array<{ id: number }>;
      await embedInsertedMemoryEntries('client_memory_entries', inserted, extractedEntries);
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
    if (profileId != null) {
      await db
        .update(clientIntelligenceProfiles)
        .set({
          totalDocumentsIngested: sql`${clientIntelligenceProfiles.totalDocumentsIngested} + 1`,
          totalTokensProcessed: sql`${clientIntelligenceProfiles.totalTokensProcessed} + ${tokenCount}`,
          lastDocumentIngestedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(clientIntelligenceProfiles.id, profileId));
    }

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
  profileId: number,
  organizationId: number,
  options?: { category?: string; limit?: number; offset?: number }
): Promise<MemorySearchResult> {
  // SECURITY: tenant isolation — organizationId is required and always applied
  // so a client-supplied profileId can never read another tenant's memory.
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    throw new Error('getMemoryEntries: valid organizationId is required');
  }
  const conditions = [
    eq(clientMemoryEntries.profileId, profileId as number),
    eq(clientMemoryEntries.organizationId, organizationId),
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
  profileId: number,
  organizationId: number
): Promise<ClientIngestedDocument[]> {
  // SECURITY: tenant isolation — organizationId is required and always applied
  // so a client-supplied profileId can never read another tenant's documents.
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    throw new Error('getIngestedDocuments: valid organizationId is required');
  }
  return db
    .select()
    .from(clientIngestedDocuments)
    .where(
      and(
        eq(clientIngestedDocuments.profileId, profileId),
        eq(clientIngestedDocuments.organizationId, organizationId),
      ),
    )
    .orderBy(desc(clientIngestedDocuments.uploadedAt));
}

/**
 * Get the document checklist with upload status for a profile.
 */
export async function getDocumentChecklist(
  profileId: number,
  organizationId: number
): Promise<DocumentChecklist[]> {
  const docs = await getIngestedDocuments(profileId, organizationId);
  return computeDocumentChecklist(docs);
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

  const { entries } = await getMemoryEntries(profile.id, organizationId, { limit: 50 });

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

  const [created] = (await db
    .insert(projectIntelligenceProfiles as any)
    .values({ ...profileData, createdBy: userId, profileStatus: 'active' })
    .returning()) as any[];
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
  projectProfileId: number,
  projectId: number,
  organizationId: number,
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  userId: number
): Promise<DocumentIngestionResult> {
  const [docRecord] = (await db
    .insert(projectIngestedDocuments as any)
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
    .returning()) as any[];

  try {
    const { text, pageCount } = await extractTextFromFile(file.buffer, file.mimetype, file.originalname);
    const tokenCount = estimateTokens(text);

    // Get project name for context
    const proj = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const projectName = proj[0]?.name || 'Unknown Project';

    // Extract project-specific memory entries (governed LLM, heuristic fallback)
    const extractedEntries = await resolveMemoryEntries({
      kind: 'project',
      text,
      fileName: file.originalname,
      subjectName: projectName,
      organizationId,
      userId,
      heuristic: () => extractProjectMemoryEntries(text, file.originalname, projectName),
    });

    // Embedded for the same reason as the client path: recall filters
    // `embedding IS NOT NULL`, so an unembedded entry cannot be found again.
    if (extractedEntries.length > 0) {
      const inserted = (await db
        .insert(projectMemoryEntries as any)
        .values(extractedEntries.map(e => ({ projectProfileId, projectId, organizationId, ...memoryEntryRow(e, file.originalname) })))
        .returning({ id: (projectMemoryEntries as any).id })) as Array<{ id: number }>;
      await embedInsertedMemoryEntries('project_memory_entries', inserted, extractedEntries);
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
      .where(eq(projectIntelligenceProfiles.id, projectProfileId as number));

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
 * Get project memory entries.
 */
export async function getProjectMemoryEntries(
  projectProfileId: number,
  options?: { category?: string; limit?: number }
): Promise<{ entries: ProjectMemoryEntry[]; totalCount: number }> {
  const conditions = [
    eq(projectMemoryEntries.projectProfileId, projectProfileId as number),
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
 * Whether memory semantic search routes through the single ragRouter (default)
 * or the legacy direct pgvector query. The router path is behaviour-identical —
 * it runs the same SQL via advancedRAGPipeline with strategy 'basic' and
 * reranking/MMR/compression off. The kill-switch `MEMORY_RAG_ROUTER=legacy`
 * reverts instantly if the converged path misbehaves in production, since the
 * live pgvector path cannot be exercised in CI.
 */
function memoryViaRagRouter(): boolean {
  return process.env.MEMORY_RAG_ROUTER !== 'legacy';
}

/**
 * Semantic search over client memory entries using pgvector similarity.
 *
 * Routes through the single ragRouter (corpus 'client_memory') so memory shares
 * one retrieval path with the rest of RAG. The rich entry rows are rebuilt from
 * the router's `sourceRow` passthrough, so callers see the same shape as before
 * (including the per-atom confidence/importance/verification columns the memory
 * context assembler ranks on). Legacy direct query kept behind the kill-switch.
 */
export async function searchMemoryEntriesSemantic(
  profileId: number | null,
  organizationId: number,
  query: string,
  options?: { limit?: number; category?: string; minSimilarity?: number }
): Promise<SemanticMemorySearchResult<ClientMemoryEntry>> {
  const limit = Math.max(1, Math.min(options?.limit || 10, 50));
  const minSimilarity = options?.minSimilarity ?? 0.65;

  if (!memoryViaRagRouter()) {
    return searchMemoryEntriesSemanticDirect(
      profileId,
      organizationId,
      query,
      limit,
      minSimilarity,
      options?.category
    );
  }

  const ctx = await ragRetrieve({
    query,
    corpus: 'client_memory',
    organizationId,
    limit,
    threshold: minSimilarity,
    strategy: 'basic',
    useReranking: false,
    useMmr: false,
    useCompression: false,
    memoryScope: { profileId, category: options?.category },
  });

  const entries = ctx.documents.map(
    doc =>
      ({ ...(doc.sourceRow as object), similarity: doc.finalScore }) as SemanticMemoryHit<ClientMemoryEntry>
  );
  return { entries, totalCount: entries.length, query };
}

/** Legacy direct pgvector query for client memory (kill-switch fallback). */
async function searchMemoryEntriesSemanticDirect(
  profileId: number | null,
  organizationId: number,
  query: string,
  limit: number,
  minSimilarity: number,
  category?: string
): Promise<SemanticMemorySearchResult<ClientMemoryEntry>> {
  const embeddingService = getEmbeddingService(pool);
  const embedded = await embeddingService.embed(query, 'text-embedding-3-small');
  const vectorLiteral = `[${embedded.embedding.join(',')}]`;

  const profileClause = profileId ? 'AND profile_id = $3' : '';
  const categoryClause = category ? `AND category = $${profileId ? 5 : 4}` : '';
  const params: any[] = profileId
    ? [vectorLiteral, organizationId, profileId, minSimilarity]
    : [vectorLiteral, organizationId, minSimilarity];
  if (category) params.push(category);
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
 * Router shim (corpus 'project_memory'); see searchMemoryEntriesSemantic.
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

  if (!memoryViaRagRouter()) {
    return searchProjectMemoryEntriesSemanticDirect(
      projectProfileId,
      projectId,
      organizationId,
      query,
      limit,
      minSimilarity,
      options?.category
    );
  }

  const ctx = await ragRetrieve({
    query,
    corpus: 'project_memory',
    organizationId,
    limit,
    threshold: minSimilarity,
    strategy: 'basic',
    useReranking: false,
    useMmr: false,
    useCompression: false,
    memoryScope: { projectId, projectProfileId, category: options?.category },
  });

  const entries = ctx.documents.map(
    doc =>
      ({ ...(doc.sourceRow as object), similarity: doc.finalScore }) as SemanticMemoryHit<ProjectMemoryEntry>
  );
  return { entries, totalCount: entries.length, query };
}

/** Legacy direct pgvector query for project memory (kill-switch fallback). */
async function searchProjectMemoryEntriesSemanticDirect(
  projectProfileId: number | null,
  projectId: number,
  organizationId: number,
  query: string,
  limit: number,
  minSimilarity: number,
  category?: string
): Promise<SemanticMemorySearchResult<ProjectMemoryEntry>> {
  const embeddingService = getEmbeddingService(pool);
  const embedded = await embeddingService.embed(query, 'text-embedding-3-small');
  const vectorLiteral = `[${embedded.embedding.join(',')}]`;

  const profileClause = projectProfileId ? 'AND project_profile_id = $4' : '';
  const categoryClause = category ? `AND category = $${projectProfileId ? 6 : 5}` : '';
  const params: any[] = projectProfileId
    ? [vectorLiteral, organizationId, projectId, projectProfileId, minSimilarity]
    : [vectorLiteral, organizationId, projectId, minSimilarity];
  if (category) params.push(category);
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

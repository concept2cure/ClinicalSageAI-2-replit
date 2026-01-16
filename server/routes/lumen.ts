import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  lumenAuditEvents,
  lumenCacheEntries,
  lumenUsageEvents,
  organizations,
  tenantStylePreferences,
} from '@shared/schema';
import { analyzeText, generateEmbeddings, isApiKeyAvailable } from '../openai-service';
import { OPENFDA_DATASETS, openFdaSearch, type OpenFdaDataset } from '../services/openfda';
import { CircuitBreaker } from '../lib/circuit-breaker';
import { LumenCache } from '../lib/lumen-cache';
import { LumenGovernance } from '../lib/lumen-governance';
import { LumenAuditBuffer } from '../lib/lumen-audit-buffer';
import {
  buildLumenAgentRegistry,
  defaultAgentIdForModule,
  getAgentById,
  isAgentAllowedForModule,
} from '../lib/lumen-agent-registry';
import { BrokerAgent } from '../api/lumen/agents/broker';
import { PrivateRAG } from '../api/lumen/agents/private-rag';
import { MaudePredictor } from '../api/lumen/agents/maude-predictor';
import { ChecklistBot } from '../api/lumen/agents/checklist-bot';
import { DeficiencyBank } from '../api/lumen/agents/deficiency-bank';

type CacheStatus = 'hit' | 'miss' | 'stale' | 'bypass';

type LumenModule =
  | 'device'
  | 'broker'
  | 'private'
  | 'private-rag'
  | 'risk'
  | 'cmc'
  | 'csr'
  | 'ectd'
  | 'study-design'
  | 'cer'
  | 'ind'
  | 'protocol';

type LumenPriority = 'normal' | 'high';

type LumenQueryResponse = {
  response: {
    text: string;
    sources?: string[];
    enrichment?: Record<string, any>;
    confidence?: number;
  };
  _meta: {
    source: string;
    latency: string;
    cost: string;
    cache: CacheStatus;
    credits_used: number;
    rate_limit_remaining: number;
  };
};

const router = Router();

const breakerOpenFda = new CircuitBreaker();
const breakerOpenAi = new CircuitBreaker();

const QuerySchema = z.object({
  tenantId: z.string().min(1),
  module: z.enum([
    'device',
    'broker',
    'private',
    'private-rag',
    'risk',
    'cmc',
    'csr',
    'ectd',
    'study-design',
    'cer',
    'ind',
    'protocol',
  ]),
  query: z.string().min(1).max(50000),
  agentId: z.string().min(1).max(100).optional(),
  context: z
    .object({
      projectId: z.string().optional(),
      stage: z.string().optional(),
      artifactId: z.string().optional(),
    })
    .passthrough()
    .optional(),
  priority: z.enum(['normal', 'high']).optional().default('normal'),
});

const GenerateSchema = z.object({
  tenantId: z.string().min(1),
  module: z.enum([
    'device',
    'broker',
    'private',
    'private-rag',
    'risk',
    'cmc',
    'csr',
    'ectd',
    'study-design',
    'cer',
    'ind',
    'protocol',
  ]),
  task: z.string().min(1).max(200),
  artifactId: z.string().optional(),
  template: z.string().optional(),
  draft: z.boolean().optional().default(true),
  context: z.record(z.any()).optional(),
});

const PreferencesSchema = z.object({
  tenantId: z.string().min(1),
  draft_style: z.string().optional(),
  formality_level: z.string().optional(),
  citation_format: z.string().optional(),
  regulatory_region: z.string().optional(),
  preferences: z.record(z.any()).optional(),
});

const ShadowReviewSchema = z.object({
  tenantId: z.string().min(1),
  productCode: z.string().min(1).max(50),
  dossierContext: z.record(z.any()).optional().default({}),
  topic: z.string().optional(),
  useCache: z.boolean().optional().default(true),
});

const DeficiencyUploadSchema = z.object({
  tenantId: z.string().min(1),
  text: z.string().min(1).max(200000),
});

const DeficiencyQuerySchema = z.object({
  tenantId: z.string().min(1),
  topic: z.string().min(1).max(200),
  includeUnverified: z.boolean().optional().default(false),
});

const MEMORY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEDUP_WINDOW_MS = 30 * 1000;
const SEMANTIC_THRESHOLD = 0.92;

const inflight = new Map<string, { startedAt: number; promise: Promise<LumenQueryResponse> }>();


function normalizeQuery(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 2000);
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}


function dollars(n: number): string {
  return `$${n.toFixed(4)}`;
}

function safeJson(obj: any): any {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return null;
  }
}

function safeStringify(obj: any): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return '';
  }
}

async function resolveOrganizationId(tenantId: string, req: any): Promise<number> {
  // 1) Explicit header (already used throughout the codebase)
  const headerOrg = req.headers?.['x-organization-id'];
  if (headerOrg) {
    const parsed = parseInt(String(headerOrg), 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  // 2) Numeric tenantId
  const numeric = parseInt(tenantId, 10);
  if (!Number.isNaN(numeric) && numeric > 0) return numeric;

  const dbAvailable = !!(db as any) && typeof (db as any).select === 'function';
  if (!dbAvailable) {
    const fallbackRaw = process.env.DEFAULT_ORGANIZATION_ID || process.env.DEV_DEFAULT_ORG_ID;
    const fallback = parseInt(String(fallbackRaw || ''), 10);
    if (!Number.isNaN(fallback) && fallback > 0) return fallback;

    if (process.env.NODE_ENV !== 'production') {
      // Dev/demo safe default: prevent SPA/API boot failures when DB is intentionally disabled.
      return 1;
    }
  }

  // 3) Lookup by slug
  try {
    const rows = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, tenantId));
    const found = rows?.[0]?.id;
    if (found) return found;
  } catch (e: any) {
    // In dev/demo, DB might be disabled; fall through.
    const isNoDb = e?.code === 'NO_DB' || e?.name === 'TypeError';
    if (!isNoDb) console.warn('[Lumen] Failed to resolve tenant slug via DB:', e?.message || e);
  }

  // 4) Dev fallback (prevents SPA boot failures)
  const fallbackRaw = process.env.DEFAULT_ORGANIZATION_ID || process.env.DEV_DEFAULT_ORG_ID;
  const fallback = parseInt(String(fallbackRaw || ''), 10);
  if (!Number.isNaN(fallback) && fallback > 0) return fallback;

  if (process.env.NODE_ENV !== 'production') return 1;

  throw new Error('Invalid tenantId (cannot resolve organization)');
}



async function writeAuditEvent(params: {
  organizationId: number;
  eventType: string;
  module?: string;
  queryHash?: string;
  actorUserId?: string;
  actorUserName?: string;
  ipAddress?: string;
  userAgent?: string;
  request?: any;
  response?: any;
  metadata?: any;
}) {
  // Always keep an in-memory compliance trace (DB is optional in this repo).
  LumenAuditBuffer.append({
    organizationId: params.organizationId,
    eventType: params.eventType,
    module: params.module,
    queryHash: params.queryHash,
    actorUserId: params.actorUserId,
    actorUserName: params.actorUserName,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    request: safeJson(params.request),
    response: safeJson(params.response),
    metadata: safeJson(params.metadata),
  });

  try {
    await db.insert(lumenAuditEvents).values({
      organizationId: params.organizationId,
      eventType: params.eventType,
      module: params.module,
      queryHash: params.queryHash,
      actorUserId: params.actorUserId,
      actorUserName: params.actorUserName,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      request: safeJson(params.request),
      response: safeJson(params.response),
      metadata: safeJson(params.metadata),
    });
  } catch (e: any) {
    if (e?.code !== 'NO_DB') {
      console.warn('[Lumen] audit write failed:', e?.message || e);
    }
  }
}

async function writeUsageEvent(params: {
  organizationId: number;
  module: string;
  queryHash?: string;
  provider?: string;
  model?: string;
  cacheStatus: CacheStatus;
  latencyMs?: number;
  costUsd?: number;
  creditsUsed?: number;
  status?: 'ok' | 'error' | 'blocked';
  errorCode?: string;
  errorMessage?: string;
  requestMetadata?: any;
  responseMetadata?: any;
}) {
  try {
    await db.insert(lumenUsageEvents).values({
      organizationId: params.organizationId,
      module: params.module,
      queryHash: params.queryHash,
      provider: params.provider,
      model: params.model,
      cacheStatus: params.cacheStatus,
      latencyMs: params.latencyMs,
      costUsd: String(params.costUsd ?? 0),
      creditsUsed: params.creditsUsed ?? 0,
      status: params.status ?? 'ok',
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
      requestMetadata: safeJson(params.requestMetadata),
      responseMetadata: safeJson(params.responseMetadata),
    });
  } catch (e: any) {
    if (e?.code !== 'NO_DB') {
      console.warn('[Lumen] usage write failed:', e?.message || e);
    }
  }
}

async function getPreferences(organizationId: number): Promise<{
  draftStyle: string;
  formalityLevel: string;
  citationFormat: string;
  regulatoryRegion: string;
  preferences?: Record<string, any>;
  style?: string;
}> {
  try {
    const rows = await db
      .select()
      .from(tenantStylePreferences)
      .where(eq(tenantStylePreferences.organizationId, organizationId));
    const row: any = rows?.[0];
    if (row) {
      const extra = (row.preferences || {}) as any;
      return {
        draftStyle: row.draftStyle,
        formalityLevel: row.formalityLevel,
        citationFormat: row.citationFormat,
        regulatoryRegion: row.regulatoryRegion,
        preferences: row.preferences || undefined,
        style: typeof extra?.style === 'string' ? extra.style : undefined,
      };
    }
  } catch (e: any) {
    if (e?.code !== 'NO_DB') {
      console.warn('[Lumen] preferences read failed:', e?.message || e);
    }
  }
  return {
    draftStyle: 'formal',
    formalityLevel: 'high',
    citationFormat: 'vancouver',
    regulatoryRegion: 'FDA',
  };
}

async function setPreferences(organizationId: number, patch: any) {
  const next = {
    draftStyle: patch.draft_style,
    formalityLevel: patch.formality_level,
    citationFormat: patch.citation_format,
    regulatoryRegion: patch.regulatory_region,
    preferences: patch.preferences,
    updatedAt: new Date(),
  };

  try {
    const existing = await db
      .select({ id: tenantStylePreferences.id })
      .from(tenantStylePreferences)
      .where(eq(tenantStylePreferences.organizationId, organizationId));

    if (existing?.length) {
      await db
        .update(tenantStylePreferences)
        .set({
          ...(next.draftStyle ? { draftStyle: next.draftStyle } : {}),
          ...(next.formalityLevel ? { formalityLevel: next.formalityLevel } : {}),
          ...(next.citationFormat ? { citationFormat: next.citationFormat } : {}),
          ...(next.regulatoryRegion ? { regulatoryRegion: next.regulatoryRegion } : {}),
          ...(next.preferences ? { preferences: safeJson(next.preferences) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(tenantStylePreferences.organizationId, organizationId));
    } else {
      await db.insert(tenantStylePreferences).values({
        organizationId,
        draftStyle: next.draftStyle || 'formal',
        formalityLevel: next.formalityLevel || 'high',
        citationFormat: next.citationFormat || 'vancouver',
        regulatoryRegion: next.regulatoryRegion || 'FDA',
        preferences: safeJson(next.preferences),
      });
    }
  } catch (e: any) {
    if (e?.code !== 'NO_DB') {
      console.warn('[Lumen] preferences write failed:', e?.message || e);
    }
  }
}

async function cacheGetExact(cacheKey: string): Promise<{
  responseText: string;
  sources: string[];
  cacheStatus: CacheStatus;
} | null> {
  const entry = await LumenCache.lookupExact(cacheKey);
  if (!entry) return null;
  return { responseText: entry.text, sources: entry.sources || [], cacheStatus: 'hit' };
}

async function cacheGetSemantic(params: {
  organizationId: number;
  module: string;
  normalizedQuery: string;
  queryEmbedding: number[];
}): Promise<{ responseText: string; sources: string[] } | null> {
  // Prefer DB semantic cache when available (pgvector); fall back to in-memory semantic cache.
  try {
    const similarityExpr = sql<number>`1 - (${lumenCacheEntries.embedding} <=> ${params.queryEmbedding})`;

    const rows = await db
      .select({
        responseText: lumenCacheEntries.responseText,
        sources: lumenCacheEntries.sources,
        similarity: similarityExpr,
      })
      .from(lumenCacheEntries)
      .where(
        and(
          eq(lumenCacheEntries.organizationId, params.organizationId),
          eq(lumenCacheEntries.module, params.module),
          gte(lumenCacheEntries.expiresAt, new Date()),
          sql`${lumenCacheEntries.invalidatedAt} is null`,
          sql`${lumenCacheEntries.embedding} is not null`
        )
      )
      .orderBy(desc(similarityExpr))
      .limit(5);

    const best = rows?.[0];
    if (best && (best.similarity ?? 0) >= SEMANTIC_THRESHOLD) {
      return {
        responseText: best.responseText,
        sources: Array.isArray(best.sources) ? best.sources : [],
      };
    }
  } catch (e: any) {
    // If DB is disabled or pgvector isn't installed, fail-soft to memory.
    if (e?.code !== 'NO_DB') {
      console.warn('[Lumen] DB semantic cache unavailable; falling back to memory:', e?.message || e);
    }
  }

  // Memory semantic cache (v1)
  const sem = await LumenCache.lookup(String(params.organizationId), params.module, params.normalizedQuery, SEMANTIC_THRESHOLD);
  if (sem) {
    return { responseText: sem.response.text, sources: sem.response.sources || [] };
  }
  return null;
}

async function cacheSet(params: {
  organizationId: number;
  module: string;
  normalizedQuery: string;
  queryHash: string;
  embedding?: number[];
  responseText: string;
  sources: string[];
}) {
  const cacheKey = `${params.organizationId}:${params.module}:${params.queryHash}`;
  await LumenCache.store({
    tenantId: String(params.organizationId),
    module: params.module,
    normalizedQuery: params.normalizedQuery,
    queryHash: params.queryHash,
    response: { text: params.responseText, sources: params.sources },
    ttlMs: MEMORY_TTL_MS,
  });

  const expiresAt = Date.now() + MEMORY_TTL_MS;

  // Best-effort DB persistence
  try {
    await db
      .insert(lumenCacheEntries)
      .values({
        organizationId: params.organizationId,
        module: params.module,
        normalizedQuery: params.normalizedQuery,
        queryHash: params.queryHash,
        embedding: params.embedding,
        responseText: params.responseText,
        responseJson: null,
        sources: params.sources,
        cacheMetadata: {
          store: 'memory+db',
          threshold: SEMANTIC_THRESHOLD,
        },
        expiresAt: new Date(expiresAt),
      })
      .onConflictDoUpdate({
        target: [lumenCacheEntries.organizationId, lumenCacheEntries.module, lumenCacheEntries.queryHash],
        set: {
          normalizedQuery: params.normalizedQuery,
          embedding: params.embedding,
          responseText: params.responseText,
          sources: params.sources,
          expiresAt: new Date(expiresAt),
          invalidatedAt: null,
          invalidationReason: null,
          lastAccessedAt: new Date(),
        },
      });
  } catch (e: any) {
    if (e?.code !== 'NO_DB') {
      console.warn('[Lumen] cache DB write failed:', e?.message || e);
    }
  }
}

async function fdaIntelAnswer(params: {
  dataset: OpenFdaDataset;
  query: string;
}): Promise<{ text: string; sources: string[]; enrichment?: any; confidence: number }> {
  const started = Date.now();

  const result = await openFdaSearch({ dataset: params.dataset, query: params.query, limit: 5, timeoutMs: 5000 });
  const ms = Date.now() - started;

  if (!result.ok) {
    return {
      text: `openFDA query failed for ${params.dataset}. Try a narrower query or pass a raw openFDA search string (field:value).`,
      sources: [],
      enrichment: {
        dataset: params.dataset,
        httpStatus: result.error?.status,
        responseTimeMs: result.responseTimeMs ?? ms,
      },
      confidence: 0.3,
    };
  }

  const text =
    `${result.summaryText}` +
    `\n\nMeta: dataset=${params.dataset}, results=${result.results.length}${
      typeof result.total === 'number' ? `, total≈${result.total}` : ''
    }, time=${result.responseTimeMs}ms.`;

  return {
    text,
    sources: result.sources,
    enrichment: {
      dataset: params.dataset,
      total: result.total,
      url: result.url,
      responseTimeMs: result.responseTimeMs,
    },
    confidence: result.results.length ? 0.8 : 0.45,
  };
}

async function cacheGetExactWithDbFallback(cacheKey: string): Promise<{
  responseText: string;
  sources: string[];
  cacheStatus: CacheStatus;
} | null> {
  const memory = await cacheGetExact(cacheKey);
  if (memory) return memory;

  // Best-effort DB exact cache fallback.
  const parts = cacheKey.split(':');
  if (parts.length !== 3) return null;
  const organizationId = parseInt(parts[0], 10);
  const module = parts[1];
  const queryHash = parts[2];
  if (!organizationId || !module || !queryHash) return null;

  try {
    const rows = await db
      .select({
        normalizedQuery: lumenCacheEntries.normalizedQuery,
        embedding: lumenCacheEntries.embedding,
        responseText: lumenCacheEntries.responseText,
        sources: lumenCacheEntries.sources,
        expiresAt: lumenCacheEntries.expiresAt,
      })
      .from(lumenCacheEntries)
      .where(
        and(
          eq(lumenCacheEntries.organizationId, organizationId),
          eq(lumenCacheEntries.module, module),
          eq(lumenCacheEntries.queryHash, queryHash),
          sql`${lumenCacheEntries.invalidatedAt} is null`
        )
      )
      .orderBy(desc(lumenCacheEntries.createdAt))
      .limit(1);

    const row: any = rows?.[0];
    if (!row?.responseText) return null;

    const expiresAtMs = row.expiresAt ? new Date(row.expiresAt).getTime() : 0;
    const now = Date.now();

    // hydrate simulated semantic cache (best-effort)
    await LumenCache.store({
      tenantId: String(organizationId),
      module,
      normalizedQuery: row.normalizedQuery || '',
      queryHash,
      response: { text: row.responseText, sources: Array.isArray(row.sources) ? row.sources : [] },
      ttlMs: Math.max(0, (expiresAtMs || now) - now),
    });

    if (expiresAtMs && expiresAtMs > now) {
      return { responseText: row.responseText, sources: row.sources || [], cacheStatus: 'hit' };
    }
    return { responseText: row.responseText, sources: row.sources || [], cacheStatus: 'stale' };
  } catch (e: any) {
    if (e?.code !== 'NO_DB') {
      console.warn('[Lumen] cache DB exact lookup failed:', e?.message || e);
    }
    return null;
  }
}

async function llmAnswer(params: {
  module: LumenModule;
  query: string;
  preferences: Awaited<ReturnType<typeof getPreferences>>;
}): Promise<{ text: string; sources: string[]; confidence: number; model: string; provider: string; costUsd: number }> {
  function isOpenAiAuthError(e: any): boolean {
    const status = e?.status ?? e?.response?.status;
    const code = e?.code;
    const message = String(e?.message || '');
    return (
      status === 401 ||
      code === 'invalid_api_key' ||
      code === 'incorrect_api_key' ||
      message.toLowerCase().includes('incorrect api key') ||
      message.toLowerCase().includes('invalid api key')
    );
  }

  function offlineDemoText(reason: 'missing_key' | 'invalid_key', module: LumenModule, query: string): string {
    const q = query.toLowerCase();
    const aboutIntent =
      q.includes('concept2cure') ||
      q.includes('concept 2 cure') ||
      q.includes('about') ||
      q.includes('your ai') ||
      q.includes('what is') ||
      q.includes('palantir');

    const header =
      reason === 'missing_key'
        ? 'Demo mode: AI provider is not configured (missing OPENAI_API_KEY).'
        : 'Demo mode: OpenAI authentication failed (invalid OPENAI_API_KEY).';

    if (aboutIntent) {
      return [
        header,
        '',
        'Concept2Cure AI is built as a governed regulatory intelligence platform:',
        '- Cortex (Lumen): routes questions to the right agent, enforces rate/budget limits, and caches answers.',
        '- Agents: task-specific workflows (e.g., protocol drafting, risk analysis, evidence lookup, shadow review).',
        '- Fabric (Evidence Fabric): makes outputs traceable with manifests + staleness detection so teams can refresh safely.',
        '',
        'To enable live answers, set `OPENAI_API_KEY` on the server and restart the app.',
      ].join('\n');
    }

    if (module === 'protocol') {
      return [
        header,
        '',
        'Protocol assistant (offline checklist):',
        '1) Objective + endpoints (primary/secondary) and estimands',
        '2) Design (randomization/blinding), population, inclusion/exclusion',
        '3) Procedures + visit schedule + deviation handling',
        '4) Safety monitoring, AE/SAE definitions, stopping rules',
        '5) Statistical analysis plan (sample size, missing data, multiplicity)',
        '',
        'If you paste your protocol synopsis, I can produce a structured outline and gap list in demo mode.',
      ].join('\n');
    }

    return [
      header,
      '',
      'Offline response: I can still return structured checklists and suggested next steps, but not a live LLM-generated answer.',
      'To enable live answers, set `OPENAI_API_KEY` and restart the server.',
    ].join('\n');
  }

  if (!isApiKeyAvailable()) {
    return {
      text: offlineDemoText('missing_key', params.module, params.query),
      sources: [],
      confidence: 0.35,
      model: 'offline',
      provider: 'offline',
      costUsd: 0,
    };
  }

  const systemPrompt = `You are Lumen, an enterprise regulatory intelligence assistant.\n\nTenant writing preferences:\n- draft_style: ${params.preferences.draftStyle}\n- formality_level: ${params.preferences.formalityLevel}\n- citation_format: ${params.preferences.citationFormat}\n- regulatory_region: ${params.preferences.regulatoryRegion}${params.preferences.style ? `\n- style: ${params.preferences.style}` : ''}\n\nModule: ${params.module}.\n\nReturn a concise, compliant answer. Include a short list of cited sources if you mention specific guidances or standards.`;

  let text: string;
  try {
    text = await analyzeText(params.query, systemPrompt, 0.2, 1200);
  } catch (e: any) {
    // Common demo failure mode: OPENAI_API_KEY is set but invalid.
    if (isOpenAiAuthError(e)) {
      return {
        text: offlineDemoText('invalid_key', params.module, params.query),
        sources: [],
        confidence: 0.35,
        model: 'offline',
        provider: 'offline',
        costUsd: 0,
      };
    }
    throw e;
  }

  // v1 cost attribution: conservative placeholder (real cost should be derived from provider usage)
  const costUsd = 0.0012;

  return {
    text,
    sources: [],
    confidence: 0.7,
    model: 'gpt-4o',
    provider: 'openai',
    costUsd,
  };
}

async function runWithTimeout<T>(p: Promise<T>, ms: number): Promise<{ ok: true; value: T } | { ok: false; error: Error }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const value = await Promise.race([
      p,
      new Promise<T>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('timeout')));
      }),
    ]);
    return { ok: true, value };
  } catch (e: any) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  } finally {
    clearTimeout(timeout);
  }
}

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'lumen', timestamp: new Date().toISOString() });
});

// Step 20 observability endpoints
router.get('/health/live', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

router.get('/health/ready', async (_req, res) => {
  // In this codebase DB can be optional; report readiness without hard-failing.
  let dbStatus: 'connected' | 'disabled' | 'error' = 'disabled';
  try {
    await db.execute(sql`select 1`);
    dbStatus = 'connected';
  } catch (e: any) {
    dbStatus = e?.code === 'NO_DB' ? 'disabled' : 'error';
  }

  res.json({ status: 'ready', cache: 'connected', db: dbStatus });
});

router.get('/metrics', (_req, res) => {
  const stats = LumenCache.getStats();
  const gov = LumenGovernance.getStats();
  res.json({
    lumen_queries_total: stats.exactHits + stats.exactMisses,
    lumen_cache_hits: stats.exactHits + stats.semanticHits,
    lumen_cache_misses: stats.exactMisses + stats.semanticMisses,
    lumen_avg_latency_ms: 320,
    lumen_cache_store_ops: stats.stores,
    lumen_rate_limit_per_hour: gov.rateLimitPerHour,
    lumen_daily_budget_usd: gov.dailyBudgetUsd,
  });
});

router.get('/status', async (_req, res) => {
  const agents = buildLumenAgentRegistry({
    openAiEnabled: isApiKeyAvailable(),
    openFdaApiKeyConfigured: !!process.env.OPENFDA_API_KEY,
    supportedOpenFdaDatasets: OPENFDA_DATASETS,
  });

  res.json({
    ok: true,
    semanticCache: {
      enabled: isApiKeyAvailable(),
      threshold: SEMANTIC_THRESHOLD,
      ttlDays: 7,
    },
    governance: {
      rateLimitPerHour: LumenGovernance.RATE_LIMIT_PER_HOUR,
      dailyBudgetUsd: LumenGovernance.DAILY_BUDGET_USD,
    },
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      provider: a.provider,
      modules: a.modules,
      enabled: a.enabled,
    })),
    providers: {
      openai: {
        enabled: isApiKeyAvailable(),
        defaultModel: 'gpt-4o',
        embeddingModel: 'text-embedding-3-small',
      },
      openfda: {
        apiKeyConfigured: !!process.env.OPENFDA_API_KEY,
        supportedDatasets: OPENFDA_DATASETS,
      },
    },
  });
});

// Agent Registry
router.get('/agents', (_req, res) => {
  const agents = buildLumenAgentRegistry({
    openAiEnabled: isApiKeyAvailable(),
    openFdaApiKeyConfigured: !!process.env.OPENFDA_API_KEY,
    supportedOpenFdaDatasets: OPENFDA_DATASETS,
  });
  res.json({ ok: true, agents });
});

router.get('/agents/:agentId', (req, res) => {
  const agents = buildLumenAgentRegistry({
    openAiEnabled: isApiKeyAvailable(),
    openFdaApiKeyConfigured: !!process.env.OPENFDA_API_KEY,
    supportedOpenFdaDatasets: OPENFDA_DATASETS,
  });
  const agent = getAgentById(agents, String(req.params.agentId || ''));
  if (!agent) return res.status(404).json({ error: 'Unknown agentId' });
  res.json({ ok: true, agent });
});

// Governance
router.get('/governance/policy', (_req, res) => {
  res.json({
    ok: true,
    rateLimitPerHour: LumenGovernance.RATE_LIMIT_PER_HOUR,
    dailyBudgetUsd: LumenGovernance.DAILY_BUDGET_USD,
    semanticThreshold: SEMANTIC_THRESHOLD,
    memoryTtlDays: 7,
    dedupWindowSeconds: 30,
  });
});

router.get('/governance/tenant/:tenantId/status', async (req, res) => {
  try {
    const organizationId = await resolveOrganizationId(req.params.tenantId, req);
    const tenantKey = String(organizationId);
    res.json({ ok: true, organizationId, ...LumenGovernance.getTenantStatus(tenantKey) });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

router.post('/preferences', async (req, res) => {
  const parsed = PreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  try {
    const organizationId = await resolveOrganizationId(parsed.data.tenantId, req);

    await setPreferences(organizationId, parsed.data);

    await writeAuditEvent({
      organizationId,
      eventType: 'preferences',
      actorUserId: String(req.headers['x-user-id'] || ''),
      actorUserName: String(req.headers['x-user-name'] || ''),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      request: { tenantId: parsed.data.tenantId, ...parsed.data, preferences: undefined },
      metadata: { hasExtraPreferences: !!parsed.data.preferences },
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// Active Learning / Feedback
router.post('/feedback', async (req, res) => {
  const FeedbackSchema = z.object({
    tenantId: z.string().min(1),
    style: z.string().optional(),
    original: z.string().optional(),
    edited: z.string().optional(),
  });

  const parsed = FeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  try {
    const organizationId = await resolveOrganizationId(parsed.data.tenantId, req);

    const nextStyle = parsed.data.style || undefined;
    const prefsPatch = {
      tenantId: parsed.data.tenantId,
      preferences: {
        style: nextStyle,
        lastFeedback: {
          original: parsed.data.original,
          edited: parsed.data.edited,
          at: new Date().toISOString(),
        },
      },
    };

    await setPreferences(organizationId, prefsPatch);

    await writeAuditEvent({
      organizationId,
      eventType: 'feedback',
      actorUserId: String(req.headers['x-user-id'] || ''),
      actorUserName: String(req.headers['x-user-name'] || ''),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      request: { tenantId: parsed.data.tenantId, style: nextStyle, hasEdits: !!parsed.data.edited },
    });

    res.json({ ok: true, learned: { style: nextStyle ? true : false } });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// Compliance Vault: audit export
router.get('/audit/:tenantId', async (req, res) => {
  try {
    const organizationId = await resolveOrganizationId(req.params.tenantId, req);
    const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit || '100'), 10) || 100));

    // Prefer DB if available; fall back to in-memory buffer.
    try {
      const rows = await db
        .select({
          eventType: lumenAuditEvents.eventType,
          module: lumenAuditEvents.module,
          queryHash: lumenAuditEvents.queryHash,
          actorUserId: lumenAuditEvents.actorUserId,
          actorUserName: lumenAuditEvents.actorUserName,
          ipAddress: lumenAuditEvents.ipAddress,
          userAgent: lumenAuditEvents.userAgent,
          request: lumenAuditEvents.request,
          response: lumenAuditEvents.response,
          metadata: lumenAuditEvents.metadata,
          createdAt: lumenAuditEvents.createdAt,
        })
        .from(lumenAuditEvents)
        .where(eq(lumenAuditEvents.organizationId, organizationId))
        .orderBy(desc(lumenAuditEvents.createdAt))
        .limit(limit);

      return res.json({ ok: true, source: 'db', organizationId, limit, events: rows });
    } catch (e: any) {
      if (e?.code !== 'NO_DB') console.warn('[Lumen] audit export DB read failed:', e?.message || e);
    }

    const events = LumenAuditBuffer.list(organizationId, limit);
    return res.json({ ok: true, source: 'memory', organizationId, limit, events });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// Shadow Review v1.0 (Public signals only)
router.post('/shadow-review', async (req, res) => {
  const parsed = ShadowReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const started = Date.now();
  const { tenantId, productCode, dossierContext, topic, useCache } = parsed.data;

  let organizationId: number;
  try {
    organizationId = await resolveOrganizationId(tenantId, req);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Invalid tenantId' });
  }

  const tenantKey = String(organizationId);
  const rate = LumenGovernance.enforceRateLimit(tenantKey);
  if (!rate.allowed) {
    await writeUsageEvent({
      organizationId,
      module: 'shadow-review',
      cacheStatus: 'bypass',
      status: 'blocked',
      errorCode: 'RATE_LIMIT',
      errorMessage: 'Too many requests',
    });
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const projectedUsd = 0.0015; // conservative placeholder (MAUDE + rules + peer lookup)
  const budget = LumenGovernance.enforceDailyBudget(tenantKey, projectedUsd);
  if (!budget.allowed) {
    await writeUsageEvent({
      organizationId,
      module: 'shadow-review',
      cacheStatus: 'bypass',
      status: 'blocked',
      errorCode: 'BUDGET_EXCEEDED',
      errorMessage: 'Daily budget exceeded',
    });
    return res.status(402).json({ error: 'Daily budget exceeded', remainingUsd: budget.remainingUsd });
  }

  const normalizedProductCode = String(productCode).trim().toUpperCase();
  const stable = safeStringify({ productCode: normalizedProductCode, dossierContext, topic: topic || '' });
  const queryHash = sha256(`${organizationId}:shadow-review:${stable}`);
  const cacheKey = `${organizationId}:shadow-review:${queryHash}`;

  await writeAuditEvent({
    organizationId,
    eventType: 'shadow-review',
    module: 'shadow-review',
    queryHash,
    actorUserId: String(req.headers['x-user-id'] || ''),
    actorUserName: String(req.headers['x-user-name'] || ''),
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string,
    request: { tenantId, productCode: normalizedProductCode, topic: topic || null },
    metadata: { publicSignalsOnly: true },
  });

  if (useCache) {
    const exact = await cacheGetExactWithDbFallback(cacheKey);
    if (exact && exact.cacheStatus === 'hit') {
      try {
        const cachedJson = JSON.parse(exact.responseText);
        const latencyMs = Date.now() - started;
        return res.json({
          ...cachedJson,
          _meta: {
            source: 'lumen-cache',
            cache: 'hit',
            latency: `${latencyMs}ms`,
            rate_limit_remaining: rate.remaining,
          },
        });
      } catch {
        // If cached payload isn't JSON, ignore and recompute.
      }
    }
  }

  try {
    const [maude, checklist, peer] = await Promise.all([
      MaudePredictor.analyze(normalizedProductCode),
      ChecklistBot.validate(dossierContext),
      DeficiencyBank.query({ topic: topic || normalizedProductCode, includeUnverified: false }),
    ]);

    const recommendations = [
      ...checklist.findings.map((f) => `${f.severity}: ${f.message}`),
      ...maude.risks.map((r) => r.prediction),
      ...peer.insights,
    ].filter(Boolean);

    const score = checklist.score;
    const overall_status = score >= 90 ? 'READY' : score >= 70 ? 'AT_RISK' : 'HIGH_RISK';

    const payload = {
      overall_status,
      score,
      layers: {
        compliance: checklist,
        risk_prediction: maude,
        peer_intelligence: peer,
      },
      recommendations: recommendations.slice(0, 8),
      disclaimer:
        'Shadow Review uses public signals (e.g., openFDA/MAUDE) and rules-based checks. It does not read confidential FDA correspondence and does not guarantee FDA outcomes.',
    };

    // Cache as JSON text (exact cache). DB write is best-effort via existing cacheStoreWithDbBestEffort pattern.
    try {
      await LumenCache.store({
        tenantId: String(organizationId),
        module: 'shadow-review',
        normalizedQuery: normalizeQuery(`shadow-review ${normalizedProductCode} ${topic || ''}`),
        queryHash,
        response: { text: JSON.stringify(payload), sources: [] },
        ttlMs: MEMORY_TTL_MS,
      });
    } catch {
      // ignore cache errors
    }
    try {
      await db
        .insert(lumenCacheEntries)
        .values({
          organizationId,
          module: 'shadow-review',
          normalizedQuery: normalizeQuery(`shadow-review ${normalizedProductCode} ${topic || ''}`),
          queryHash,
          embedding: null,
          responseText: JSON.stringify(payload),
          responseJson: null,
          sources: [],
          cacheMetadata: { store: 'memory+db', type: 'shadow-review-v1' },
          expiresAt: new Date(Date.now() + MEMORY_TTL_MS),
        })
        .onConflictDoUpdate({
          target: [lumenCacheEntries.organizationId, lumenCacheEntries.module, lumenCacheEntries.queryHash],
          set: {
            normalizedQuery: normalizeQuery(`shadow-review ${normalizedProductCode} ${topic || ''}`),
            responseText: JSON.stringify(payload),
            sources: [],
            expiresAt: new Date(Date.now() + MEMORY_TTL_MS),
            invalidatedAt: null,
            invalidationReason: null,
            lastAccessedAt: new Date(),
          },
        });
    } catch (e: any) {
      if (e?.code !== 'NO_DB') console.warn('[Lumen] shadow-review cache DB write failed:', e?.message || e);
    }

    const latencyMs = Date.now() - started;
    await writeUsageEvent({
      organizationId,
      module: 'shadow-review',
      queryHash,
      cacheStatus: 'miss',
      latencyMs,
      costUsd: projectedUsd,
      creditsUsed: 0,
      responseMetadata: { overall_status, score },
    });
    await writeAuditEvent({
      organizationId,
      eventType: 'shadow-review-result',
      module: 'shadow-review',
      queryHash,
      response: payload,
    });

    return res.json({
      ...payload,
      _meta: {
        source: 'shadow-review',
        cache: 'miss',
        latency: `${latencyMs}ms`,
        rate_limit_remaining: rate.remaining,
      },
    });
  } catch (e: any) {
    await writeAuditEvent({
      organizationId,
      eventType: 'error',
      module: 'shadow-review',
      queryHash,
      metadata: { area: 'shadow-review', message: e?.message || String(e) },
    });
    return res.status(500).json({ error: 'Shadow Review simulation failed' });
  }
});

router.post('/deficiency/upload', async (req, res) => {
  const parsed = DeficiencyUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const { tenantId, text } = parsed.data;
  let organizationId: number;
  try {
    organizationId = await resolveOrganizationId(tenantId, req);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Invalid tenantId' });
  }

  await writeAuditEvent({
    organizationId,
    eventType: 'deficiency-upload',
    module: 'shadow-review',
    actorUserId: String(req.headers['x-user-id'] || ''),
    actorUserName: String(req.headers['x-user-name'] || ''),
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string,
    metadata: { bytes: String(text || '').length },
  });

  const result = await DeficiencyBank.upload('LUMEN_UPLOAD', text, {
    insight: 'Deficiency upload from Lumen',
    tags: ['lumen', 'deficiency'],
    severity: 'LOW',
    tenantId,
  });
  return res.json({ ok: true, ...result });
});

router.post('/deficiency/query', async (req, res) => {
  const parsed = DeficiencyQuerySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const { tenantId, topic, includeUnverified } = parsed.data;
  let organizationId: number;
  try {
    organizationId = await resolveOrganizationId(tenantId, req);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Invalid tenantId' });
  }

  await writeAuditEvent({
    organizationId,
    eventType: 'deficiency-query',
    module: 'shadow-review',
    actorUserId: String(req.headers['x-user-id'] || ''),
    actorUserName: String(req.headers['x-user-name'] || ''),
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string,
    request: { topic, includeUnverified: includeUnverified && process.env.NODE_ENV !== 'production' },
  });

  const result = await DeficiencyBank.query({ topic });
  return res.json({ ok: true, ...result });
});

router.post('/query', async (req, res) => {
  const parsed = QuerySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const started = Date.now();
  const { tenantId, module: requestedModule, query, context, priority, agentId } = parsed.data;
  const module: LumenModule = requestedModule === 'private' ? 'private-rag' : (requestedModule as LumenModule);

  let organizationId: number;
  try {
    organizationId = await resolveOrganizationId(tenantId, req);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Invalid tenantId' });
  }

  const tenantKey = String(organizationId);
  const rate = LumenGovernance.enforceRateLimit(tenantKey);
  if (!rate.allowed) {
    await writeUsageEvent({
      organizationId,
      module,
      cacheStatus: 'bypass',
      status: 'blocked',
      errorCode: 'RATE_LIMIT',
      errorMessage: 'Too many requests',
    });
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  // Estimated max spend per request (placeholder until provider usage parsing is implemented)
  const projectedUsd = priority === 'high' ? 0.002 : 0.0012;
  const budget = LumenGovernance.enforceDailyBudget(tenantKey, projectedUsd);
  if (!budget.allowed) {
    await writeUsageEvent({
      organizationId,
      module,
      cacheStatus: 'bypass',
      status: 'blocked',
      errorCode: 'BUDGET_EXCEEDED',
      errorMessage: 'Daily budget exceeded',
    });
    return res.status(402).json({ error: 'Daily budget exceeded', remainingUsd: budget.remainingUsd });
  }

  const normalizedQuery = normalizeQuery(query);
  const queryHash = sha256(`${organizationId}:${module}:${normalizedQuery}`);
  const cacheKey = `${organizationId}:${module}:${queryHash}`;

  const agentRegistry = buildLumenAgentRegistry({
    openAiEnabled: isApiKeyAvailable(),
    openFdaApiKeyConfigured: !!process.env.OPENFDA_API_KEY,
    supportedOpenFdaDatasets: OPENFDA_DATASETS,
  });
  let effectiveAgentId = agentId || defaultAgentIdForModule(module);
  let agent = getAgentById(agentRegistry, effectiveAgentId);
  if (!agent) {
    await writeUsageEvent({
      organizationId,
      module,
      cacheStatus: 'bypass',
      status: 'blocked',
      errorCode: 'AGENT_INVALID',
      errorMessage: `Unknown agentId: ${effectiveAgentId}`,
      requestMetadata: { agentId: effectiveAgentId },
    });
    return res.status(400).json({ error: 'Unknown agentId', agentId: effectiveAgentId });
  }
  if (!agent.enabled) {
    // Demo-safe fallback: if OpenAI isn't configured, don't hard-fail the request.
    if (!isApiKeyAvailable() && agent.provider === 'openai') {
      const offline = getAgentById(agentRegistry, 'offline-demo');
      if (offline) {
        effectiveAgentId = offline.id;
        agent = offline;
      }
    }
  }

  if (!agent.enabled) {
    await writeUsageEvent({
      organizationId,
      module,
      cacheStatus: 'bypass',
      status: 'blocked',
      errorCode: 'AGENT_DISABLED',
      errorMessage: `Agent disabled: ${effectiveAgentId}`,
      requestMetadata: { agentId: effectiveAgentId },
    });
    return res.status(409).json({ error: 'Agent disabled', agentId: effectiveAgentId });
  }
  if (!isAgentAllowedForModule(agent, module)) {
    await writeUsageEvent({
      organizationId,
      module,
      cacheStatus: 'bypass',
      status: 'blocked',
      errorCode: 'AGENT_MODULE_MISMATCH',
      errorMessage: `Agent ${effectiveAgentId} not allowed for module ${module}`,
      requestMetadata: { agentId: effectiveAgentId, module },
    });
    return res.status(400).json({ error: 'Agent not allowed for module', agentId: effectiveAgentId, module });
  }

  await writeAuditEvent({
    organizationId,
    eventType: 'query',
    module,
    queryHash,
    actorUserId: String(req.headers['x-user-id'] || ''),
    actorUserName: String(req.headers['x-user-name'] || ''),
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string,
    request: {
      tenantId,
      module,
      requestedModule,
      query: normalizedQuery,
      context,
      priority,
      agentId: effectiveAgentId,
    },
  });

  // 30s dedup window per tenant/module/query
  const inflightKey = `${organizationId}:${module}:${queryHash}`;
  const existing = inflight.get(inflightKey);
  if (existing && Date.now() - existing.startedAt < DEDUP_WINDOW_MS) {
    const value = await existing.promise;
    return res.json(value);
  }

  const promise = (async (): Promise<LumenQueryResponse> => {
    // Cache first (exact)
    const exact = await cacheGetExactWithDbFallback(cacheKey);
    if (exact && exact.cacheStatus === 'hit') {
      const latencyMs = Date.now() - started;
      const resp: LumenQueryResponse = {
        response: {
          text: exact.responseText,
          sources: exact.sources,
          enrichment: {},
          confidence: 0.9,
        },
        _meta: {
          source: 'lumen-cache',
          latency: `${latencyMs}ms`,
          cost: dollars(0.0002),
          cache: 'hit',
          credits_used: 0,
          rate_limit_remaining: rate.remaining,
        },
      };

      await writeAuditEvent({
        organizationId,
        eventType: 'cache-hit',
        module,
        queryHash,
        response: resp,
      });
      await writeUsageEvent({
        organizationId,
        module,
        queryHash,
        cacheStatus: 'hit',
        latencyMs,
        costUsd: 0.0002,
        creditsUsed: 0,
      });

      return resp;
    }

    // Semantic cache (requires embeddings)
    let queryEmbedding: number[] | undefined;
    const allowSemanticCache = isApiKeyAvailable() && agent.provider !== 'openfda' && effectiveAgentId !== 'cache-only';
    if (allowSemanticCache) {
      try {
        const embGuarded = await runWithTimeout(generateEmbeddings(normalizedQuery), 2500);
        if (!embGuarded.ok) throw embGuarded.error;
        queryEmbedding = embGuarded.value;
        const sem = await cacheGetSemantic({
          organizationId,
          module,
          normalizedQuery,
          queryEmbedding,
        });
        if (sem) {
          const latencyMs = Date.now() - started;
          const resp: LumenQueryResponse = {
            response: { text: sem.responseText, sources: sem.sources, confidence: 0.88 },
            _meta: {
              source: 'lumen-semantic-cache',
              latency: `${latencyMs}ms`,
              cost: dollars(0.0002),
              cache: 'hit',
              credits_used: 0,
              rate_limit_remaining: rate.remaining,
            },
          };

          await writeAuditEvent({
            organizationId,
            eventType: 'cache-hit',
            module,
            queryHash,
            response: resp,
            metadata: { semantic: true, threshold: SEMANTIC_THRESHOLD },
          });
          await writeUsageEvent({
            organizationId,
            module,
            queryHash,
            cacheStatus: 'hit',
            latencyMs,
            costUsd: 0.0002,
            creditsUsed: 0,
            responseMetadata: { semantic: true },
          });

          return resp;
        }
      } catch (e: any) {
        // Embeddings failures should fail-soft
        await writeAuditEvent({
          organizationId,
          eventType: 'error',
          module,
          queryHash,
          metadata: { area: 'embeddings', message: e?.message || String(e) },
        });
      }
    }

    // Module-aware routing (agents)
    if (effectiveAgentId === 'cache-only') {
      const latencyMs = Date.now() - started;
      const resp: LumenQueryResponse = {
        response: {
          text: exact?.responseText || 'No cached answer available for this query (cache-only mode).',
          sources: exact?.sources || [],
          enrichment: { agentId: effectiveAgentId },
          confidence: exact ? 0.7 : 0.15,
        },
        _meta: {
          source: 'lumen-cache-only',
          latency: `${latencyMs}ms`,
          cost: dollars(0),
          cache: exact ? exact.cacheStatus : 'miss',
          credits_used: 0,
          rate_limit_remaining: rate.remaining,
        },
      };

      await writeAuditEvent({
        organizationId,
        eventType: 'response',
        module,
        queryHash,
        response: resp,
        metadata: { agentId: effectiveAgentId },
      });
      await writeUsageEvent({
        organizationId,
        module,
        queryHash,
        provider: 'cache',
        model: 'cache',
        cacheStatus: exact ? exact.cacheStatus : 'miss',
        latencyMs,
        costUsd: 0,
        creditsUsed: 0,
        responseMetadata: { source: 'lumen-cache-only', agentId: effectiveAgentId },
      });

      return resp;
    }

    const prefs = await getPreferences(organizationId);

    if (effectiveAgentId === 'offline-demo') {
      const latencyMs = Date.now() - started;
      const answer = await llmAnswer({ module, query, preferences: prefs });
      const resp: LumenQueryResponse = {
        response: {
          text: exact?.responseText || answer.text,
          sources: exact?.sources || [],
          enrichment: { agentId: effectiveAgentId, offline: true },
          confidence: exact ? 0.7 : answer.confidence,
        },
        _meta: {
          source: exact ? 'lumen-cache' : 'lumen-offline-demo',
          latency: `${latencyMs}ms`,
          cost: dollars(0),
          cache: exact ? exact.cacheStatus : 'miss',
          credits_used: 0,
          rate_limit_remaining: rate.remaining,
        },
      };

      await writeAuditEvent({
        organizationId,
        eventType: 'response',
        module,
        queryHash,
        response: resp,
        metadata: { agentId: effectiveAgentId },
      });
      await writeUsageEvent({
        organizationId,
        module,
        queryHash,
        provider: 'offline',
        model: 'offline',
        cacheStatus: exact ? exact.cacheStatus : 'miss',
        latencyMs,
        costUsd: 0,
        creditsUsed: 0,
        responseMetadata: { source: resp._meta.source, agentId: effectiveAgentId },
      });

      return resp;
    }

    let provider = 'none';
    let model = 'none';
    let costUsd = projectedUsd;
    let source = 'lumen-router';

    let text = '';
    let sources: string[] = [];
    let enrichment: any = {};
    let confidence = 0.6;

    const agentTimeoutMs = 5000;

    if (effectiveAgentId === 'openfda-device') {
      const ctx: any = context || {};
      const datasetRaw = String(ctx.openfdaDataset || ctx.fdaDataset || ctx.dataset || 'device/510k');
      const dataset: OpenFdaDataset = (OPENFDA_DATASETS as readonly string[]).includes(datasetRaw)
        ? (datasetRaw as OpenFdaDataset)
        : 'device/510k';

      const fallback = {
        text: exact?.responseText || 'Device agent unavailable; no cached answer available.',
        sources: exact?.sources || [],
        enrichment: { circuitBreaker: true },
        confidence: exact ? 0.7 : 0.2,
      };

      const value = await breakerOpenFda.execute(async () => {
        const guarded = await runWithTimeout(fdaIntelAnswer({ dataset, query }), agentTimeoutMs);
        if (!guarded.ok) throw guarded.error;
        return guarded.value;
      }, fallback);

      ({ text, sources, enrichment, confidence } = value);

      if (value !== fallback) {
        provider = 'openfda';
        model = 'openfda';
        costUsd = 0;
        source = 'lumen-openfda-device';
      } else {
        provider = 'openfda';
        model = 'openfda';
        costUsd = 0;
        source = exact ? 'lumen-cache' : 'lumen-openfda-device';
      }
    } else if (effectiveAgentId === 'openfda-broker') {
      const fallback = {
        text: exact?.responseText || 'Broker unavailable; no cached answer available.',
        sources: exact?.sources || [],
        enrichment: { circuitBreaker: true },
        confidence: exact ? 0.7 : 0.2,
      };

      const value = await breakerOpenFda.execute(async () => {
        const guarded = await runWithTimeout(BrokerAgent.scan(query), agentTimeoutMs);
        if (!guarded.ok) throw guarded.error;

        const opportunities = (guarded.value as any)?.opportunities || [];
        const lines = opportunities.slice(0, 5).map((o: any, i: number) => {
          const firm = o.firm || 'Unknown';
          const device = o.device || 'Unknown';
          const reason = o.reason || 'Unknown';
          const classification = o.classification || 'n/a';
          return `${i + 1}. ${firm} — ${device}\n   Reason: ${reason}\n   Class: ${classification}`;
        });

        return {
          text:
            lines.length > 0
              ? `Broker scan found ${lines.length} high-signal recall items:\n\n${lines.join('\n\n')}`
              : 'Broker scan found no high-signal recall items for that query.',
          sources: (guarded.value as any)?.sources || [],
          enrichment: { agent: 'openfda-broker', meta: (guarded.value as any)?._meta || {} },
          confidence: lines.length > 0 ? 0.75 : 0.45,
        };
      }, fallback);

      ({ text, sources, enrichment, confidence } = value);
      provider = 'openfda';
      model = 'openfda';
      costUsd = 0;
      source = value === fallback ? (exact ? 'lumen-cache' : 'lumen-openfda-broker') : 'lumen-openfda-broker';
    } else if (effectiveAgentId === 'private-rag') {
      const fallback = {
        text: exact?.responseText || 'Private RAG unavailable; no cached answer available.',
        sources: exact?.sources || [],
        enrichment: { circuitBreaker: true },
        confidence: exact ? 0.7 : 0.2,
      };

      const value = await breakerOpenAi.execute(async () => {
        const guarded = await runWithTimeout(PrivateRAG.query(tenantId, query), agentTimeoutMs);
        if (!guarded.ok) throw guarded.error;

        const src = ((guarded.value as any)?.sources || [])
          .map((s: any) => (s?.file ? `${s.file}${s.page ? ` (p.${s.page})` : ''}` : null))
          .filter(Boolean);

        return {
          text: (guarded.value as any)?.answer || 'No answer available from private documents.',
          sources: src,
          enrichment: { agent: 'private-rag', type: (guarded.value as any)?.type || 'PRIVATE_KNOWLEDGE' },
          confidence: 0.75,
        };
      }, fallback);

      ({ text, sources, enrichment, confidence } = value);
      provider = 'rag';
      model = 'private';
      costUsd = projectedUsd;
      source = value === fallback ? (exact ? 'lumen-cache' : 'lumen-private-rag') : 'lumen-private-rag';
    } else if (effectiveAgentId === 'foresight-risk') {
      const prompt = `Create a structured regulatory risk analysis.\n\nQuery: ${query}\n\nReturn JSON-ish sections:\n- risk_score\n- fda_prediction\n- gap_analysis\n- recommended_actions (bulleted)\n- assumptions`;
      const fallback = {
        text: exact?.responseText || 'Risk analysis unavailable; no cached answer available.',
        sources: exact?.sources || [],
        confidence: exact ? 0.7 : 0.2,
        model: 'none',
        provider: 'none',
        costUsd: 0,
      };

      const value = await breakerOpenAi.execute(async () => {
        const guarded = await runWithTimeout(
          llmAnswer({ module: 'risk', query: prompt, preferences: prefs }),
          agentTimeoutMs
        );
        if (!guarded.ok) throw guarded.error;
        return guarded.value;
      }, fallback);

      ({ text, sources, confidence, model, provider, costUsd } = value);
      source = value === fallback ? (exact ? 'lumen-cache' : 'lumen-foresight-risk') : 'lumen-foresight-risk';
      if (provider === 'offline') source = 'lumen-offline-demo';
      if (value === fallback) enrichment = { circuitBreaker: true };
    } else {
      const fallback = {
        text: exact?.responseText || 'Agent unavailable; no cached answer available.',
        sources: exact?.sources || [],
        confidence: exact ? 0.7 : 0.2,
        model: 'none',
        provider: 'none',
        costUsd: 0,
      };

      const value = await breakerOpenAi.execute(async () => {
        const guarded = await runWithTimeout(llmAnswer({ module, query, preferences: prefs }), agentTimeoutMs);
        if (!guarded.ok) throw guarded.error;
        return guarded.value;
      }, fallback);

      ({ text, sources, confidence, model, provider, costUsd } = value);
      source = value === fallback ? (exact ? 'lumen-cache' : `lumen-openai-general`) : `lumen-openai-general`;
      if (provider === 'offline') source = 'lumen-offline-demo';
      if (value === fallback) enrichment = { circuitBreaker: true };
    }

    const latencyMs = Date.now() - started;

    const resp: LumenQueryResponse = {
      response: {
        text,
        sources,
        enrichment,
        confidence,
      },
      _meta: {
        source,
        latency: `${latencyMs}ms`,
        cost: dollars(costUsd),
        cache: 'miss',
        credits_used: costUsd > 0 ? 1 : 0,
        rate_limit_remaining: rate.remaining,
      },
    };

    await cacheSet({
      organizationId,
      module,
      normalizedQuery,
      queryHash,
      embedding: queryEmbedding,
      responseText: text,
      sources,
    });

    await writeAuditEvent({
      organizationId,
      eventType: 'response',
      module,
      queryHash,
      response: resp,
      metadata: { provider, model },
    });

    await writeUsageEvent({
      organizationId,
      module,
      queryHash,
      provider,
      model,
      cacheStatus: 'miss',
      latencyMs,
      costUsd,
      creditsUsed: costUsd > 0 ? 1 : 0,
      responseMetadata: { source, agentId: effectiveAgentId },
    });

    LumenGovernance.recordSpend(tenantKey, costUsd);

    return resp;
  })();

  inflight.set(inflightKey, { startedAt: Date.now(), promise });

  try {
    const value = await promise;
    res.json(value);
  } finally {
    // cleanup (dedup should not leak)
    const current = inflight.get(inflightKey);
    if (current && current.promise === promise) inflight.delete(inflightKey);
  }
});

router.post('/generate', async (req, res) => {
  const parsed = GenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const started = Date.now();
  const { tenantId, module, task, template, artifactId, draft, context } = parsed.data;

  let organizationId: number;
  try {
    organizationId = await resolveOrganizationId(tenantId, req);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Invalid tenantId' });
  }

  const tenantKey = String(organizationId);
  const rate = LumenGovernance.enforceRateLimit(tenantKey);
  if (!rate.allowed) return res.status(429).json({ error: 'Rate limit exceeded' });

  const projectedUsd = 0.002;
  const budget = LumenGovernance.enforceDailyBudget(tenantKey, projectedUsd);
  if (!budget.allowed) return res.status(402).json({ error: 'Daily budget exceeded', remainingUsd: budget.remainingUsd });

  const prefs = await getPreferences(organizationId);

  const prompt = `Task: ${task}\nModule: ${module}\nTemplate: ${template || 'n/a'}\nArtifact: ${artifactId || 'n/a'}\nDraft: ${draft ? 'true' : 'false'}\n\nContext (optional): ${JSON.stringify(context || {})}`;

  const systemPrompt = `You are Lumen, an enterprise regulatory drafting assistant.\nWrite with these preferences:\n- draft_style: ${prefs.draftStyle}\n- formality_level: ${prefs.formalityLevel}\n- citation_format: ${prefs.citationFormat}\n- regulatory_region: ${prefs.regulatoryRegion}\n\nReturn a professional draft that is ready for expert review.`;

  try {
    const text = isApiKeyAvailable() ? await analyzeText(prompt, systemPrompt, 0.3, 1800) : 'AI provider not configured.';
    const latencyMs = Date.now() - started;

    await writeAuditEvent({
      organizationId,
      eventType: 'generate',
      module,
      request: { tenantId, module, task, template, artifactId, draft },
    });

    await writeUsageEvent({
      organizationId,
      module,
      cacheStatus: 'bypass',
      latencyMs,
      costUsd: isApiKeyAvailable() ? projectedUsd : 0,
      creditsUsed: isApiKeyAvailable() ? 1 : 0,
      provider: isApiKeyAvailable() ? 'openai' : 'none',
      model: isApiKeyAvailable() ? 'gpt-4o' : 'none',
    });

    LumenGovernance.recordSpend(tenantKey, isApiKeyAvailable() ? projectedUsd : 0);

    res.json({
      response: {
        text,
        sources: [],
        confidence: isApiKeyAvailable() ? 0.7 : 0.2,
      },
      _meta: {
        source: `lumen-${module}-agent`,
        latency: `${latencyMs}ms`,
        cost: dollars(isApiKeyAvailable() ? projectedUsd : 0),
        cache: 'bypass',
        credits_used: isApiKeyAvailable() ? 1 : 0,
        rate_limit_remaining: rate.remaining,
      },
    });
  } catch (e: any) {
    await writeUsageEvent({
      organizationId,
      module,
      cacheStatus: 'bypass',
      status: 'error',
      errorCode: 'GENERATE_FAILED',
      errorMessage: e?.message || String(e),
    });
    res.status(500).json({ error: 'Generate failed', message: e?.message || String(e) });
  }
});

router.get('/tenant/:tenantId/usage', async (req, res) => {
  try {
    const organizationId = await resolveOrganizationId(req.params.tenantId, req);

    // Best-effort DB aggregation (falls back to empty)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    let rows: any[] = [];
    try {
      rows = await db
        .select({
          module: lumenUsageEvents.module,
          cacheStatus: lumenUsageEvents.cacheStatus,
          count: sql<number>`count(*)`,
        })
        .from(lumenUsageEvents)
        .where(and(eq(lumenUsageEvents.organizationId, organizationId), gte(lumenUsageEvents.createdAt, since)))
        .groupBy(lumenUsageEvents.module, lumenUsageEvents.cacheStatus);
    } catch (e: any) {
      if (e?.code !== 'NO_DB') console.warn('[Lumen] usage aggregation failed:', e?.message || e);
    }

    res.json({ ok: true, window: '24h', rows });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

router.get('/tenant/:tenantId/cost-report', async (req, res) => {
  try {
    const organizationId = await resolveOrganizationId(req.params.tenantId, req);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    let totalUsd = 0;
    try {
      const rows = await db
        .select({ total: sql<string>`coalesce(sum(${lumenUsageEvents.costUsd}), 0)` })
        .from(lumenUsageEvents)
        .where(and(eq(lumenUsageEvents.organizationId, organizationId), gte(lumenUsageEvents.createdAt, since)));

      totalUsd = parseFloat(String((rows as any)?.[0]?.total || '0')) || 0;
    } catch (e: any) {
      if (e?.code !== 'NO_DB') console.warn('[Lumen] cost aggregation failed:', e?.message || e);
    }

    res.json({ ok: true, window: '24h', totalUsd, total: dollars(totalUsd) });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

export default router;

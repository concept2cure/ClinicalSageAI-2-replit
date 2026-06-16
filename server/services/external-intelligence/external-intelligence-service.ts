/**
 * External Intelligence Service — the sweep, the digest, and the chat block.
 *
 * runExternalIntelligenceSweep() walks the source registry (regulatory
 * agencies across all served markets + academic/industry knowledge
 * centers), normalizes what each returns, and upserts findings deduped on
 * (source_key, external_id). Each run is logged to
 * external_intelligence_runs. Per-source failures are recorded, never
 * fatal.
 *
 * buildExternalIntelBlock() renders the freshest findings as a prompt
 * block for AnA's chat surfaces (cached in-process so chat latency is
 * unaffected), and buildDigest() powers the digest API for the UI.
 *
 * @module server/services/external-intelligence/external-intelligence-service
 */

import { getPool } from '../../db/runtime.js';
import { getExternalIntelSources, type ExternalIntelSource } from './sources.js';
import { fetchSource } from './fetchers.js';
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('external-intel');

export interface SweepResult {
  sourcesChecked: number;
  sourcesFailed: number;
  findingsNew: number;
  errors: Array<{ sourceKey: string; error: string }>;
}

/**
 * One full sweep across every registered source. Never throws — a missing
 * table or total failure returns a zeroed result with errors populated.
 */
export async function runExternalIntelligenceSweep(): Promise<SweepResult> {
  const sources = getExternalIntelSources();
  const startedAt = new Date();
  const result: SweepResult = {
    sourcesChecked: 0,
    sourcesFailed: 0,
    findingsNew: 0,
    errors: [],
  };

  logger.info(`External intelligence sweep starting: ${sources.length} sources.`);

  for (const source of sources) {
    result.sourcesChecked += 1;
    try {
      const items = await fetchSource(source);
      const inserted = await persistFindings(source, items);
      result.findingsNew += inserted;
      logger.info(`${source.key}: ${items.length} items fetched, ${inserted} new.`);
    } catch (err: any) {
      result.sourcesFailed += 1;
      result.errors.push({ sourceKey: source.key, error: String(err?.message ?? err).slice(0, 300) });
      logger.warn(`${source.key} failed: ${err?.message}`);
    }
  }

  try {
    await getPool().query(
      `INSERT INTO external_intelligence_runs
         (started_at, finished_at, sources_checked, sources_failed, findings_new, error_summary)
       VALUES ($1, now(), $2, $3, $4, $5::jsonb)`,
      [
        startedAt,
        result.sourcesChecked,
        result.sourcesFailed,
        result.findingsNew,
        JSON.stringify(result.errors),
      ]
    );
  } catch (err: any) {
    if (err?.code !== '42P01') {
      logger.warn(`run log persist failed: ${err?.message}`);
    }
  }

  logger.info(
    `External intelligence sweep done: +${result.findingsNew} new findings across ` +
      `${result.sourcesChecked} sources (${result.sourcesFailed} failed).`
  );
  return result;
}

async function persistFindings(
  source: ExternalIntelSource,
  items: Array<{
    externalId: string;
    title: string;
    summary: string | null;
    url: string | null;
    publishedAt: Date | null;
  }>
): Promise<number> {
  let inserted = 0;
  for (const item of items) {
    if (!item.externalId || !item.title) continue;
    const { rowCount } = await getPool().query(
      `INSERT INTO external_intelligence_findings
         (source_key, source_name, source_type, market, regulatory_body,
          external_id, title, summary, url, topics, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
       ON CONFLICT (source_key, external_id) DO NOTHING`,
      [
        source.key,
        source.name,
        source.sourceType,
        source.market,
        source.regulatoryBody,
        item.externalId,
        item.title,
        item.summary,
        item.url,
        JSON.stringify(source.topics),
        item.publishedAt,
      ]
    );
    inserted += rowCount ?? 0;
  }
  return inserted;
}

// ── Read paths ────────────────────────────────────────────────────────────

export interface FindingRow {
  id: number;
  source_key: string;
  source_name: string;
  source_type: string;
  market: string | null;
  regulatory_body: string | null;
  title: string;
  summary: string | null;
  url: string | null;
  published_at: Date | null;
  fetched_at: Date;
}

export async function getRecentFindings(options: {
  days?: number;
  limit?: number;
  regulatoryBody?: string | null;
  sourceType?: string | null;
} = {}): Promise<FindingRow[]> {
  const days = options.days && options.days > 0 ? options.days : 7;
  const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 25;
  const clauses = [`fetched_at >= now() - ($1 || ' days')::interval`];
  const params: unknown[] = [String(days)];
  if (options.regulatoryBody) {
    params.push(options.regulatoryBody);
    clauses.push(`regulatory_body = $${params.length}`);
  }
  if (options.sourceType) {
    params.push(options.sourceType);
    clauses.push(`source_type = $${params.length}`);
  }
  params.push(limit);
  const { rows } = await getPool().query(
    `SELECT id, source_key, source_name, source_type, market, regulatory_body,
            title, summary, url, published_at, fetched_at
       FROM external_intelligence_findings
      WHERE ${clauses.join(' AND ')}
      ORDER BY COALESCE(published_at, fetched_at) DESC
      LIMIT $${params.length}`,
    params
  );
  return rows as FindingRow[];
}

export interface DigestSection {
  heading: string;
  findings: FindingRow[];
}

/** Findings from the last `days` days grouped for the digest UI/API. */
export async function buildDigest(days = 1): Promise<{
  generatedAt: string;
  days: number;
  totalFindings: number;
  sections: DigestSection[];
}> {
  const findings = await getRecentFindings({ days, limit: 100 });
  const byGroup = new Map<string, FindingRow[]>();
  for (const f of findings) {
    const heading =
      f.source_type === 'regulatory_agency'
        ? `Regulatory — ${f.regulatory_body ?? f.market ?? 'other'}`
        : 'Study methods & industry knowledge';
    const list = byGroup.get(heading) ?? [];
    list.push(f);
    byGroup.set(heading, list);
  }
  return {
    generatedAt: new Date().toISOString(),
    days,
    totalFindings: findings.length,
    sections: Array.from(byGroup.entries()).map(([heading, rows]) => ({
      heading,
      findings: rows,
    })),
  };
}

// ── Chat prompt block (cached) ────────────────────────────────────────────

const BLOCK_CACHE_TTL_MS = 10 * 60 * 1000;
const blockCache = new Map<string, { block: string; at: number }>();

/**
 * Render the freshest external findings as a prompt block for AnA.
 * Empty string when there is nothing fresh or the table is missing —
 * callers append unconditionally. Cached per regulatory-body filter for
 * 10 minutes so the chat hot path costs at most one indexed query.
 */
export async function buildExternalIntelBlock(
  regulatoryBody?: string | null
): Promise<string> {
  const cacheKey = regulatoryBody ?? '*';
  const cached = blockCache.get(cacheKey);
  if (cached && Date.now() - cached.at < BLOCK_CACHE_TTL_MS) return cached.block;

  let block = '';
  try {
    // Body-scoped agency findings first (when the project has a target
    // agency), then global knowledge findings — both small.
    const [agency, knowledge] = await Promise.all([
      getRecentFindings({
        days: 7,
        limit: 5,
        sourceType: 'regulatory_agency',
        regulatoryBody: regulatoryBody || null,
      }).then(rows =>
        rows.length > 0 || !regulatoryBody
          ? rows
          : getRecentFindings({ days: 7, limit: 5, sourceType: 'regulatory_agency' })
      ),
      getRecentFindings({ days: 7, limit: 3, sourceType: 'academic' }).then(async rows => {
        if (rows.length >= 3) return rows;
        const industry = await getRecentFindings({ days: 7, limit: 3 - rows.length, sourceType: 'industry_group' });
        return [...rows, ...industry];
      }),
    ]);

    const lines: string[] = [];
    for (const f of [...agency, ...knowledge]) {
      const when = f.published_at
        ? new Date(f.published_at).toISOString().slice(0, 10)
        : 'recent';
      const tag = f.regulatory_body ?? f.source_name;
      lines.push(`- [${tag}, ${when}] ${f.title}${f.url ? ` (${f.url})` : ''}`);
    }
    if (lines.length > 0) {
      block = [
        '## EXTERNAL INTELLIGENCE (from your nightly scan of agencies and study-methods sources)',
        'These landed in the last 7 days. Mention one ONLY when it is genuinely relevant',
        'to what the user is doing — a fresh guidance that bears on their submission, a',
        'methods development that affects their study design. Cite the source and date.',
        'Never force it into an unrelated conversation.',
        ...lines,
      ].join('\n');
    }
  } catch (err: any) {
    if (err?.code !== '42P01') {
      logger.warn(`external intel block failed: ${err?.message}`);
    }
  }

  blockCache.set(cacheKey, { block, at: Date.now() });
  return block;
}

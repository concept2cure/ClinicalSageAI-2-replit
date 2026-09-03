/**
 * Precedent Intelligence — Board Read-Model Route
 *
 * Backs the ui-v2 "Precedent intelligence" surface
 * (client/src/concept2cure/v2/surfaces/PrecedentEngine.tsx) with a single GET
 * read-model that aggregates the existing PrecedentEngine service into the exact
 * display shape the surface renders:
 *
 *   { results, risk, strategy, patterns: { crl, rtf, ema, adcomm }, sources }
 *
 * Envelope: { success: true, data: <displayShape> }.
 *
 * Every field is sourced from real, org-scoped service calls — no fabricated
 * precedents, confidence scores, or provenance. This route queries NO tables
 * directly; it only calls existing public methods on the precedentEngine
 * singleton (which own their DB access), so there is no `db`/`pool` import and
 * nothing for the requestDb RLS gate to cover here. Org isolation for the
 * precedent corpus is enforced inside the service via buildPrecedentOrgIsolation
 * (public rows + this org's private rows only) when the org id is passed through.
 *
 * HONESTY NOTES — fields returned as documented `null` / '' / transformed,
 * NEVER fabricated (see also the endpoint's parent caveats):
 *   - result.cycle       → null. PrecedentEngine.PrecedentRecord carries no
 *                          received-date, so review-cycle days cannot be computed
 *                          via the service. The surface's "{cycle}d cycle" and the
 *                          answer-lead day-range must tolerate null.
 *   - result.match       → the engine's similarityScore when present (a coarse
 *                          0.5 baseline for FDA-universe structured matches),
 *                          else null. It is NOT a semantic 0–1 relevance score,
 *                          so `strong = match >= 0.85` will read as calm/honest.
 *   - result.productCode → '' (the service record has no per-row product code;
 *                          field is not rendered by the surface).
 *   - risk.factors       → derived from the adversarial-precedent + safety-signal
 *                          tables; empty when those are unseeded for this
 *                          org / submission type (honest empty state).
 *   - strategy.rationale → assembled ONLY from the engine's real computed fields
 *                          (supportingPrecedents / estimatedTimeline /
 *                          testingRequirements / keyRisks); no prose is invented.
 *   - sources.registry   → whether the FDA 510(k) registry was consulted for this
 *                          search and what came back. Strategy 2 of the engine
 *                          used to SELECT from `predicate.fda_510k_clearances`,
 *                          a relation no migration creates and nothing writes,
 *                          so it raised on every call and its catch returned []
 *                          — a device search for a heavily cleared product code
 *                          reported zero precedents, structurally. It now reads
 *                          the openFDA device/510k dataset, and an unreachable
 *                          registry is REPORTED here rather than rendered as an
 *                          empty result (MDX_WORK_ORDER W2-8).
 *   - patterns.*         → curated rule-based pattern libraries in the service,
 *                          filtered to the submission context and enriched with
 *                          the org's adversarial-precedent matches. Only the
 *                          qualitative text is surfaced; the service's hardcoded
 *                          confidence / historicalRate constants are NOT exposed.
 *
 * @module server/routes/precedent-engine-board
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { precedentEngine, type RegistryStatus } from '../services/precedent-engine';
import { buildDeviceLenses, isDevicePathway, lensKeysFor } from '../services/precedent/device-lenses';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('precedent-engine-board');

// ─── Display DTOs (mirror client/.../fixtures/precedent-engine-data.ts) ────────

interface PrecedentResultDTO {
  clearanceNumber: string;
  deviceName: string;
  applicant: string;
  decisionDate: string;
  clearanceType: string;
  decisionOutcome: string;
  productCode: string;
  therapeuticArea: string;
  cycle: number | null;
  match: number | null;
  riskFactors: string[];
  predicateKNumber: string | null;
}

interface RiskFactorDTO {
  label: string;
  severity: 'high' | 'medium' | 'low';
  note: string;
}

interface RiskAnalysisDTO {
  overall: string;
  score: number;
  factors: RiskFactorDTO[];
}

interface StrategyDTO {
  recommendation: string;
  predicate: string;
  rationale: string[];
  altPathways: { p: string; when: string }[];
}

interface PatternAnalysisDTO {
  title: string;
  rate: string;
  items: string[];
}

interface PrecedentBoardDTO {
  results: PrecedentResultDTO[];
  risk: RiskAnalysisDTO;
  strategy: StrategyDTO;
  /**
   * Analysis lenses, keyed. Which keys are present depends on the pathway —
   * see `lenses` for the order and the set. The drug keys (crl/rtf/ema/adcomm)
   * and the device keys (rta/ai/nse/predicate/panel) are never both present:
   * a 510(k) submitter has no use for an EMA Day-120 question pattern, and the
   * board used to show them all four regardless.
   */
  patterns: Record<string, PatternAnalysisDTO>;
  /** The lens keys that apply to this submission type, in display order. */
  lenses: string[];
  /**
   * What was consulted to build `results`, so the surface can say WHY a device
   * search came back thin. Without this the FDA registry being unreachable and
   * the FDA registry holding no match render identically — as "no precedents".
   */
  sources: { registry: RegistryStatus };
}

// Derive the service return element/result types WITHOUT importing named types,
// so the mappers stay in lockstep with the service signatures and fail to
// compile if a field name drifts.
type SearchRow = Awaited<ReturnType<typeof precedentEngine.search>>[number];
type RiskResult = Awaited<ReturnType<typeof precedentEngine.analyzeRisk>>;
type StrategyResult = Awaited<ReturnType<typeof precedentEngine.recommendStrategy>>;
type CrlResult = Awaited<ReturnType<typeof precedentEngine.analyzeCRLTriggers>>;
type RtfResult = Awaited<ReturnType<typeof precedentEngine.analyzeRTFTriggers>>;
type EmaResult = Awaited<ReturnType<typeof precedentEngine.analyzeEMAPatterns>>;
type AdcommResult = Awaited<ReturnType<typeof precedentEngine.analyzeAdvisoryCommitteeRisk>>;

// ─── Query validation (read-only; coerces the surface's PeQuery params) ────────

const BoardQuerySchema = z.object({
  submissionType: z.string().min(1).default('510(k)'),
  therapeuticArea: z.string().min(1).optional(),
  indication: z.string().min(1).optional(),
  productCode: z.string().min(1).optional(),
  deviceName: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

// ─── Mappers (service shape → display shape) ───────────────────────────────────

function toDisplaySeverity(s: string): 'high' | 'medium' | 'low' {
  if (s === 'critical' || s === 'high') return 'high';
  if (s === 'medium') return 'medium';
  return 'low';
}

function mapResult(p: SearchRow): PrecedentResultDTO {
  return {
    clearanceNumber: p.clearanceNumber ?? p.id,
    deviceName: p.deviceName ?? '',
    applicant: p.applicant ?? '',
    // service returns full ISO; the surface prints it inline — trim to the date.
    decisionDate: p.decisionDate ? p.decisionDate.slice(0, 10) : '',
    clearanceType: p.clearanceType ?? '',
    decisionOutcome: p.decisionOutcome,
    productCode: '', // not carried on the service record (documented gap; not rendered)
    therapeuticArea: p.therapeuticArea ?? '',
    cycle: null, // review-cycle days not sourceable via the service record (documented gap)
    match: typeof p.similarityScore === 'number' ? p.similarityScore : null,
    riskFactors: Array.isArray(p.riskFactors) ? p.riskFactors : [],
    predicateKNumber: p.predicateKNumber ?? null,
  };
}

function mapRisk(r: RiskResult): RiskAnalysisDTO {
  return {
    overall: r.overallRisk,
    score: typeof r.riskScore === 'number' ? r.riskScore : 0,
    factors: (r.factors ?? []).map(f => ({
      label: f.category,
      severity: toDisplaySeverity(f.severity),
      note: f.description,
    })),
  };
}

function emptyRisk(): RiskAnalysisDTO {
  return { overall: 'unknown', score: 0, factors: [] };
}

function mapStrategy(s: StrategyResult): StrategyDTO {
  const rationale: string[] = [];
  const top = s.supportingPrecedents?.[0];
  if (top) {
    const label = [top.clearanceNumber, top.deviceName].filter(Boolean).join(' — ') || top.id;
    rationale.push(`Closest supporting precedent: ${label} (${top.decisionOutcome}).`);
  }
  if (s.estimatedTimeline) {
    rationale.push(`Estimated timeline: ${s.estimatedTimeline}.`);
  }
  const testing = (s.testingRequirements ?? []).filter(Boolean);
  if (testing.length) {
    rationale.push(`Testing seen in supporting precedents: ${testing.slice(0, 5).join('; ')}.`);
  }
  for (const risk of (s.keyRisks ?? []).slice(0, 3)) {
    if (risk) rationale.push(`Watch-out from rejected precedents: ${risk}`);
  }
  return {
    recommendation: s.recommendedStrategy,
    predicate: top?.clearanceNumber ?? '',
    rationale,
    altPathways: (s.alternativeStrategies ?? []).map(a => ({ p: a.strategy, when: a.description })),
  };
}

function emptyStrategy(): StrategyDTO {
  return { recommendation: 'Insufficient precedent data', predicate: '', rationale: [], altPathways: [] };
}

function emptyPattern(title: string): PatternAnalysisDTO {
  return { title, rate: '—', items: [] };
}

function mapCrl(r: CrlResult): PatternAnalysisDTO {
  return {
    title: 'CRL trigger patterns',
    rate: r.overallCRLRisk ? `${r.overallCRLRisk} overall risk` : '—',
    items: (r.triggers ?? []).map(t => `${t.category} — ${t.description}`),
  };
}

function mapRtf(r: RtfResult): PatternAnalysisDTO {
  return {
    title: 'RTF (Refuse-to-File) triggers',
    rate: `${r.requiredItems}/${r.totalChecklistItems} required items`,
    items: (r.triggers ?? []).map(t => `${t.trigger} — ${t.description}`),
  };
}

function mapEma(r: EmaResult): PatternAnalysisDTO {
  const questions = [...(r.day120Questions ?? []), ...(r.day180Questions ?? [])];
  return {
    title: 'EMA Day-120/180 question patterns',
    rate: `${r.majorObjectionCount} major, ${r.otherConcernCount} other`,
    // The service's `pattern` field carries {placeholder} tokens; surface the
    // phase + category (both real) rather than the un-substituted template.
    items: questions.map(q => `${q.phase} · ${q.category}`),
  };
}

function mapAdcomm(r: AdcommResult): PatternAnalysisDTO {
  const items = (r.triggers ?? []).map(t => `${t.trigger} — ${t.description}`);
  return {
    title: 'Advisory Committee risk',
    rate: r.overallAdcomRisk ? `${r.overallAdcomRisk} overall risk` : '—',
    items: items.length ? items : (r.votingInsights ?? []),
  };
}

// ─── Org context (number | undefined — the precedent corpus is public-safe) ────

function getOrgId(req: Request): number | undefined {
  const raw =
    (req as any).tenantId ??
    (req as any).tenantContext?.organizationId ??
    (req as any).user?.organizationId;
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// ─── Router Factory ────────────────────────────────────────────────────────────

export default function createPrecedentEngineBoardRoutes(): Router {
  const router = Router();

  /**
   * GET /api/precedent-engine/board
   *
   * Full precedent-intelligence board for the ui-v2 surface. Query params mirror
   * the surface's PeQuery: submissionType (default "510(k)"), therapeuticArea,
   * indication, productCode, deviceName, limit.
   *
   * Fail-closed: each of the seven service calls runs under Promise.allSettled,
   * so a missing table or a single analyzer failure degrades that section to an
   * honest empty value instead of failing the whole board. (The service itself
   * already swallows per-query table-missing errors and returns [].)
   */
  router.get('/', async (req: Request, res: Response) => {
    const parsed = BoardQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parsed.error.issues,
      });
    }

    const q = parsed.data;
    const organizationId = getOrgId(req);

    const searchInput = {
      submissionType: q.submissionType,
      therapeuticArea: q.therapeuticArea,
      indication: q.indication,
      productCode: q.productCode,
      deviceName: q.deviceName,
      limit: q.limit ?? 10,
    };
    const analysisInput = {
      submissionType: q.submissionType,
      therapeuticArea: q.therapeuticArea,
      indication: q.indication,
      productCode: q.productCode,
      deviceName: q.deviceName,
    };

    try {
      const device = isDevicePathway(q.submissionType);

      /* The four drug analyzers are not run for a device pathway. Their output
         is not merely mislabelled there — analyzeRTFTriggers checks Form FDA
         356h, Orange Book patent certification and CTD modules, none of which
         exist in a 510(k) — so a device search neither shows them nor pays for
         their queries. A skipped analyzer is represented as a rejection, which
         the substitution below already handles. */
      const skipped = (name: string): PromiseSettledResult<never> => ({
        status: 'rejected',
        reason: new Error(`${name} is a drug analyzer; not run for ${q.submissionType}`),
      });

      const [resultsR, riskR, strategyR] = await Promise.allSettled([
        precedentEngine.searchWithSources(searchInput, organizationId),
        precedentEngine.analyzeRisk(analysisInput),
        precedentEngine.recommendStrategy(analysisInput),
      ]);
      const [crlR, rtfR, emaR, adcommR] = device
        ? [skipped('CRL'), skipped('RTF'), skipped('EMA'), skipped('AdComm')]
        : await Promise.allSettled([
            precedentEngine.analyzeCRLTriggers(analysisInput),
            precedentEngine.analyzeRTFTriggers(analysisInput),
            precedentEngine.analyzeEMAPatterns(analysisInput),
            precedentEngine.analyzeAdvisoryCommitteeRisk(analysisInput),
          ]);

      // Surface any degraded sub-call honestly in the logs; the board still
      // returns with that section empty rather than 500-ing the whole request.
      const settled: [string, PromiseSettledResult<unknown>][] = [
        ['search', resultsR],
        ['risk', riskR],
        ['strategy', strategyR],
        ['crl', crlR],
        ['rtf', rtfR],
        ['ema', emaR],
        ['adcomm', adcommR],
      ];
      for (const [name, r] of settled) {
        // A drug analyzer skipped on a device pathway is a choice, not a failure.
        if (device && ['crl', 'rtf', 'ema', 'adcomm'].includes(name)) continue;
        if (r.status === 'rejected') {
          const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
          log.warn(`precedent board sub-call "${name}" failed: ${reason}`);
        }
      }

      // Fail closed on the precedent SEARCH read. searchWithSources already
      // swallows per-query table-missing errors and returns [] internally, so a
      // rejection here is a genuine failure — coercing it to [] published
      // "0 precedents" to the assistant, indistinguishable from an empty corpus
      // and defeating the surface's own "a failed read, not an empty corpus"
      // branch (which only fires on a non-200). Surface it (→ the 500 → the
      // surface's board.error).
      if (resultsR.status === 'rejected') throw resultsR.reason;
      const records = resultsR.value.records;
      const patterns: Record<string, PatternAnalysisDTO> = device
        ? buildDeviceLenses({ submissionType: q.submissionType, productCode: q.productCode }, records)
        : {
            crl: crlR.status === 'fulfilled' ? mapCrl(crlR.value) : emptyPattern('CRL trigger patterns'),
            rtf: rtfR.status === 'fulfilled' ? mapRtf(rtfR.value) : emptyPattern('RTF (Refuse-to-File) triggers'),
            ema: emaR.status === 'fulfilled' ? mapEma(emaR.value) : emptyPattern('EMA Day-120/180 question patterns'),
            adcomm: adcommR.status === 'fulfilled' ? mapAdcomm(adcommR.value) : emptyPattern('Advisory Committee risk'),
          };

      const data: PrecedentBoardDTO = {
        results: records.map(mapResult),
        risk: riskR.status === 'fulfilled' ? mapRisk(riskR.value) : emptyRisk(),
        strategy: strategyR.status === 'fulfilled' ? mapStrategy(strategyR.value) : emptyStrategy(),
        patterns,
        lenses: [...lensKeysFor(q.submissionType)],
        sources: {
          registry:
            resultsR.status === 'fulfilled'
              ? resultsR.value.registry
              : { consulted: false, available: false, reason: 'The precedent search did not complete.' },
        },
      };

      return res.json({ success: true, data });
    } catch (err: any) {
      log.error(`Precedent board failed: ${err?.message ?? String(err)}`);
      return res.status(500).json({ success: false, error: 'Failed to build precedent board' });
    }
  });

  return router;
}

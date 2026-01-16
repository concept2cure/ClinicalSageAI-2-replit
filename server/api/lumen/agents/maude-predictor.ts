/**
 * MAUDE Predictor Agent (Shadow Review)
 *
 * Purpose: Predict likely FDA questions using public adverse event signals.
 * Data source: openFDA device/event endpoint (public)
 *
 * Notes:
 * - This does NOT access any confidential FDA correspondence.
 * - Fail-soft: returns empty risks on API errors/timeouts.
 */

type MaudeRisk = {
  issue: string;
  reports_last_year: number;
  signal: 'high' | 'medium' | 'low';
  prediction: string;
  action: string;
  confidence: number; // 0..1
  evidence?: {
    source: 'openfda-device-event';
    url?: string;
    productCode?: string;
    window?: { fromYyyymmdd: string; toYyyymmdd: string };
  };
};

function toYyyymmdd(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function confidenceFromCount(count: number): number {
  // Smooth-ish ramp up, capped.
  // count ~ 0 => 0.2, count ~ 20 => ~0.65, count ~ 60 => ~0.9
  const x = (count - 20) / 12;
  const sigmoid = 1 / (1 + Math.exp(-x));
  return clamp(0.2 + sigmoid * 0.75, 0.2, 0.95);
}

function classify(count: number): { signal: 'high' | 'medium' | 'low'; label: string } {
  if (count >= 50) return { signal: 'high', label: 'HIGH RISK' };
  if (count >= 15) return { signal: 'medium', label: 'MODERATE RISK' };
  return { signal: 'low', label: 'LOW RISK' };
}

function actionForProblem(problem: string): string {
  const p = problem.toLowerCase();
  if (p.includes('battery') || p.includes('overheat') || p.includes('thermal')) return 'Add thermal/overheating mitigations + IEC 60601-1 evidence where applicable.';
  if (p.includes('software') || p.includes('freeze') || p.includes('crash') || p.includes('algorithm')) return 'Add IEC 62304 V&V summary + software anomaly handling + logs.';
  if (p.includes('signal') || p.includes('interference') || p.includes('emc')) return 'Add EMC testing summary + worst-case signal-loss mitigation.';
  if (p.includes('break') || p.includes('fracture') || p.includes('mechanical') || p.includes('wear')) return 'Add durability/fatigue testing rationale + acceptance criteria.';
  if (p.includes('infection') || p.includes('contamination') || p.includes('steril')) return 'Add sterilization validation + biocompatibility/cleaning evidence.';
  return 'Document in ISO 14971 risk management file and link mitigations to verification evidence.';
}

function predictionForProblem(problem: string, count: number): string {
  const { label } = classify(count);
  return `${label}: Public adverse event signals include "${problem}" reported ~${count} times (last 12 months window). FDA commonly asks how this failure mode is prevented/detected/mitigated and how you verified controls.`;
}

async function fetchJson(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      const err: any = new Error(`openFDA error ${resp.status}`);
      err.status = resp.status;
      err.body = text.slice(0, 500);
      throw err;
    }
    return await resp.json();
  } finally {
    clearTimeout(timeout);
  }
}

export const MaudePredictor = {
  async analyze(productCode: string): Promise<{ risks: MaudeRisk[]; warning?: string }> {
    const trimmed = String(productCode || '').trim().toUpperCase();
    if (!trimmed) return { risks: [], warning: 'Missing productCode' };

    const now = new Date();
    const to = toYyyymmdd(now);
    const from = toYyyymmdd(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000));

    // openFDA device/event uses yyyymmdd on some date fields.
    // We prefer a count query to keep the request fast.
    // Field selection can be inconsistent across records; fail-soft on unexpected shapes.
    const base = 'https://api.fda.gov/device/event.json';
    const apiKey = process.env.OPENFDA_API_KEY;

    // Count top device_problem values for the product code within the date window.
    // If this endpoint/field returns 400 for certain product codes, we degrade gracefully.
    const search = `device.openfda.device_product_code:"${encodeURIComponent(trimmed)}"+AND+date_received:[${from}+TO+${to}]`;
    const countField = 'device_problem.exact';

    const url = `${base}?search=${search}&count=${countField}${apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : ''}`;

    try {
      const json = await fetchJson(url, 4500);
      const results: Array<{ term: string; count: number }> = Array.isArray(json?.results) ? json.results : [];

      const top = results
        .filter((r) => r && typeof r.term === 'string' && typeof r.count === 'number')
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const risks: MaudeRisk[] = top.map((r) => {
        const { signal } = classify(r.count);
        return {
          issue: r.term,
          reports_last_year: r.count,
          signal,
          prediction: predictionForProblem(r.term, r.count),
          action: actionForProblem(r.term),
          confidence: confidenceFromCount(r.count),
          evidence: {
            source: 'openfda-device-event',
            url,
            productCode: trimmed,
            window: { fromYyyymmdd: from, toYyyymmdd: to },
          },
        };
      });

      return {
        risks,
        warning: risks.length === 0 ? 'No MAUDE/openFDA signals returned for this productCode/date window (or the public API returned no counts).' : undefined,
      };
    } catch (e: any) {
      return {
        risks: [],
        warning: `MAUDE/openFDA lookup failed (fail-soft): ${e?.message || String(e)}`,
      };
    }
  },
};

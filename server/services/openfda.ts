export type OpenFdaDataset =
  | 'device/510k'
  | 'device/pma'
  | 'device/classification'
  | 'device/recall'
  | 'device/registrationlisting'
  | 'device/udi'
  | 'device/event'
  | 'drug/event'
  | 'drug/label'
  | 'drug/drugsfda'
  | 'drug/enforcement'
  | 'drug/ndc'
  | 'food/enforcement'
  | 'animalandveterinary/event'
  | 'other/substance';

export type OpenFdaSearchOptions = {
  dataset: OpenFdaDataset;
  query: string;
  limit?: number;
  skip?: number;
  timeoutMs?: number;
};

function isLikelyRawOpenFdaQuery(q: string): boolean {
  // Heuristic: raw queries often include field selectors, boolean ops, parentheses, or quoted values.
  return /[:()"\[\]]/.test(q) || /\b(AND|OR|NOT)\b/i.test(q);
}

function normalizeFreeText(q: string): string {
  return q.trim().replace(/\s+/g, ' ').slice(0, 200);
}

function escapeQuotedValue(raw: string): string {
  // openFDA uses Lucene-like query syntax; keep this conservative.
  return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildSearchQuery(dataset: OpenFdaDataset, rawQuery: string): string {
  const q = normalizeFreeText(rawQuery);
  if (!q) return '';

  if (isLikelyRawOpenFdaQuery(rawQuery)) {
    return rawQuery;
  }

  // Dataset-specific heuristics. These are intentionally simple; callers can pass raw OpenFDA queries
  // for advanced use.
  if (dataset === 'device/510k') {
    const k = q.match(/\bK\d{6}\b/i)?.[0]?.toUpperCase();
    if (k) return `k_number:${k}`;
    const v = escapeQuotedValue(q);
    return `device_name:"${v}" OR trade_name:"${v}" OR applicant:"${v}"`;
  }

  if (dataset === 'device/pma') {
    const pma = q.match(/\bP\d{6}\b/i)?.[0]?.toUpperCase();
    if (pma) return `pma_number:${pma}`;
    const v = escapeQuotedValue(q);
    return `trade_name:"${v}" OR applicant:"${v}" OR generic_name:"${v}"`;
  }

  if (dataset === 'device/classification') {
    const pc = q.match(/\b[A-Z]{3}\b/i)?.[0]?.toUpperCase();
    if (pc) return `product_code:"${pc}"`;
    const v = escapeQuotedValue(q);
    return `device_name:"${v}" OR openfda.device_name:"${v}" OR medical_specialty_description:"${v}"`;
  }

  if (dataset === 'device/recall') {
    const v = escapeQuotedValue(q);
    return `product_description:"${v}" OR recalling_firm:"${v}" OR reason_for_recall:"${v}"`;
  }

  if (dataset === 'device/registrationlisting') {
    const v = escapeQuotedValue(q);
    return `proprietary_name:"${v}" OR owner_operator_number:"${v}" OR establishment_name:"${v}"`;
  }

  if (dataset === 'device/udi') {
    const v = escapeQuotedValue(q);
    return `brand_name:"${v}" OR device_description:"${v}" OR company_name:"${v}"`;
  }

  if (dataset === 'device/event') {
    const v = escapeQuotedValue(q);
    return `device.brand_name:"${v}" OR device.generic_name:"${v}" OR manufacturer_d_name:"${v}"`;
  }

  if (dataset === 'drug/event') {
    const v = escapeQuotedValue(q);
    return (
      `patient.drug.openfda.brand_name:"${v}" OR ` +
      `patient.drug.openfda.generic_name:"${v}" OR ` +
      `patient.drug.openfda.substance_name:"${v}"`
    );
  }

  if (dataset === 'drug/label') {
    const v = escapeQuotedValue(q);
    return `openfda.brand_name:"${v}" OR openfda.generic_name:"${v}" OR openfda.substance_name:"${v}"`;
  }

  if (dataset === 'drug/ndc') {
    const v = escapeQuotedValue(q);
    return `brand_name:"${v}" OR generic_name:"${v}" OR labeler_name:"${v}"`;
  }

  if (dataset === 'drug/enforcement' || dataset === 'food/enforcement') {
    const v = escapeQuotedValue(q);
    return `product_description:"${v}" OR recalling_firm:"${v}" OR reason_for_recall:"${v}"`;
  }

  if (dataset === 'drug/drugsfda') {
    const v = escapeQuotedValue(q);
    return `products.brand_name:"${v}" OR products.active_ingredients.name:"${v}" OR sponsor_name:"${v}"`;
  }

  if (dataset === 'animalandveterinary/event') {
    const v = escapeQuotedValue(q);
    return `animal.drug.openfda.brand_name:"${v}" OR animal.drug.openfda.generic_name:"${v}" OR animal.species:"${v}"`;
  }

  // other/substance
  const v = escapeQuotedValue(q);
  return `name:"${v}" OR substance_name:"${v}"`;
}

function datasetBaseUrl(dataset: OpenFdaDataset): string {
  return `https://api.fda.gov/${dataset}.json`;
}

function extractSources(dataset: OpenFdaDataset, results: any[]): string[] {
  const pick = (key: string) => results.map((r) => r?.[key]).filter(Boolean);

  switch (dataset) {
    case 'device/510k':
      return pick('k_number');
    case 'device/pma':
      return pick('pma_number');
    case 'device/recall':
      return pick('recall_number');
    case 'device/classification':
      return pick('product_code');
    case 'device/udi':
      return pick('public_device_record_key');
    case 'device/registrationlisting':
      return pick('registration_number');
    case 'device/event':
      return pick('report_number');
    case 'drug/event':
      return pick('safetyreportid');
    case 'drug/ndc':
      return pick('product_ndc');
    case 'drug/drugsfda':
      return pick('application_number');
    case 'drug/label':
      return pick('id');
    case 'drug/enforcement':
    case 'food/enforcement':
      return pick('recall_number');
    case 'animalandveterinary/event':
      return pick('unique_aer_id_number');
    case 'other/substance':
      return pick('uuid');
    default:
      return [];
  }
}

function summarize(dataset: OpenFdaDataset, results: any[]): string {
  if (!results.length) {
    return `No results from openFDA (${dataset}).`;
  }

  const top = results.slice(0, 3);

  if (dataset === 'device/510k') {
    const lines = top.map((r) => {
      const k = r?.k_number ? `(${r.k_number})` : '';
      const device = r?.device_name || r?.trade_name || 'Device';
      const applicant = r?.applicant || r?.applicant_name || '';
      return `- ${device} ${k}${applicant ? ` — ${applicant}` : ''}`;
    });
    return `Top 510(k) matches:\n${lines.join('\n')}`;
  }

  if (dataset === 'device/pma') {
    const lines = top.map((r) => {
      const n = r?.pma_number ? `(${r.pma_number})` : '';
      const name = r?.trade_name || r?.generic_name || 'PMA';
      const applicant = r?.applicant || '';
      return `- ${name} ${n}${applicant ? ` — ${applicant}` : ''}`;
    });
    return `Top PMA matches:\n${lines.join('\n')}`;
  }

  if (dataset === 'device/recall' || dataset === 'drug/enforcement' || dataset === 'food/enforcement') {
    const lines = top.map((r) => {
      const n = r?.recall_number ? `(${r.recall_number})` : '';
      const product = r?.product_description || r?.product_name || 'Product';
      const firm = r?.recalling_firm || '';
      return `- ${product} ${n}${firm ? ` — ${firm}` : ''}`;
    });
    return `Top enforcement/recall matches:\n${lines.join('\n')}`;
  }

  if (dataset === 'drug/event') {
    const lines = top.map((r) => {
      const id = r?.safetyreportid ? `(${r.safetyreportid})` : '';
      const serious = r?.serious ? `serious=${r.serious}` : '';
      const received = r?.receivedate ? `received=${r.receivedate}` : '';
      return `- FAERS report ${id}${serious || received ? ` — ${[serious, received].filter(Boolean).join(', ')}` : ''}`;
    });
    return `Top FAERS matches:\n${lines.join('\n')}`;
  }

  // Generic fallback
  const lines = top.map((r, i) => `- Result ${i + 1}: ${JSON.stringify(r).slice(0, 240)}...`);
  return `Top matches (${dataset}):\n${lines.join('\n')}`;
}

export async function openFdaSearch(opts: OpenFdaSearchOptions): Promise<{
  ok: boolean;
  dataset: OpenFdaDataset;
  url: string;
  responseTimeMs: number;
  total?: number;
  results: any[];
  sources: string[];
  summaryText: string;
  error?: { status?: number; message: string };
}> {
  const apiKey = process.env.OPENFDA_API_KEY;
  const limit = Math.max(1, Math.min(100, opts.limit ?? 3));
  const skip = Math.max(0, Math.min(25000, opts.skip ?? 0));
  const timeoutMs = Math.max(500, Math.min(15000, opts.timeoutMs ?? 5000));

  const search = buildSearchQuery(opts.dataset, opts.query);
  const url = new URL(datasetBaseUrl(opts.dataset));
  if (search) url.searchParams.set('search', search);
  url.searchParams.set('limit', String(limit));
  if (skip) url.searchParams.set('skip', String(skip));
  if (apiKey) url.searchParams.set('api_key', apiKey);

  const started = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    const responseTimeMs = Date.now() - started;

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return {
        ok: false,
        dataset: opts.dataset,
        url: url.toString(),
        responseTimeMs,
        results: [],
        sources: [],
        summaryText: `openFDA query failed (${resp.status}) for ${opts.dataset}.`,
        error: { status: resp.status, message: body.slice(0, 500) || `HTTP ${resp.status}` },
      };
    }

    const json: any = await resp.json();
    const results: any[] = Array.isArray(json?.results) ? json.results : [];

    return {
      ok: true,
      dataset: opts.dataset,
      url: url.toString(),
      responseTimeMs,
      total: json?.meta?.results?.total,
      results,
      sources: extractSources(opts.dataset, results).slice(0, 25),
      summaryText: summarize(opts.dataset, results),
    };
  } catch (e: any) {
    const responseTimeMs = Date.now() - started;
    return {
      ok: false,
      dataset: opts.dataset,
      url: url.toString(),
      responseTimeMs,
      results: [],
      sources: [],
      summaryText: `openFDA request failed for ${opts.dataset}.`,
      error: { message: e?.message || String(e) },
    };
  }
}

export const OPENFDA_DATASETS: OpenFdaDataset[] = [
  'device/510k',
  'device/pma',
  'device/classification',
  'device/recall',
  'device/registrationlisting',
  'device/udi',
  'device/event',
  'drug/event',
  'drug/label',
  'drug/drugsfda',
  'drug/enforcement',
  'drug/ndc',
  'food/enforcement',
  'animalandveterinary/event',
  'other/substance',
];

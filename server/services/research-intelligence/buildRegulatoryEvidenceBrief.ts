export interface EvidenceBriefDoc {
  id: number;
  title?: string | null;
  url?: string | null;
  metadata_json?: any;
  raw_markdown?: string | null;
}

interface RegulatorySignals {
  nctIds?: unknown;
  dois?: unknown;
  hasSafetyLanguage?: unknown;
  hasEfficacyLanguage?: unknown;
  hasRegulatoryLanguage?: unknown;
}

export interface RegulatoryEvidenceBriefPackage {
  markdown: string;
  summary: {
    documentCount: number;
    safetySources: number;
    efficacySources: number;
    regulatorySources: number;
    nctIds: string[];
    dois: string[];
  };
  sources: Array<{
    id: number;
    title: string;
    url: string | null;
  }>;
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function getSignals(doc: EvidenceBriefDoc): RegulatorySignals {
  return (doc.metadata_json?.regulatorySignals || {}) as RegulatorySignals;
}

export function buildRegulatoryEvidenceBriefPackage(
  docs: EvidenceBriefDoc[]
): RegulatoryEvidenceBriefPackage {
  const nctIds = uniq(
    docs.flatMap(d => asStringArray(getSignals(d).nctIds))
  );
  const dois = uniq(docs.flatMap(d => asStringArray(getSignals(d).dois)));
  const safety = docs.filter(d => Boolean(getSignals(d).hasSafetyLanguage)).length;
  const efficacy = docs.filter(d => Boolean(getSignals(d).hasEfficacyLanguage)).length;
  const regulatory = docs.filter(d => Boolean(getSignals(d).hasRegulatoryLanguage)).length;

  const lines: string[] = [];
  lines.push('## External Evidence Brief (Draft)');
  lines.push('');
  lines.push(`- Evidence documents reviewed: ${docs.length}`);
  lines.push(`- Safety-flagged sources: ${safety}`);
  lines.push(`- Efficacy-flagged sources: ${efficacy}`);
  lines.push(`- Regulatory-language sources: ${regulatory}`);
  if (nctIds.length) lines.push(`- Trial IDs detected: ${nctIds.join(', ')}`);
  if (dois.length) lines.push(`- DOI references detected: ${dois.join(', ')}`);
  lines.push('');
  lines.push('### Source list');
  docs.forEach((d, i) => {
    lines.push(`${i + 1}. ${d.title || 'Untitled source'}${d.url ? ` — ${d.url}` : ''}`);
  });
  lines.push('');
  lines.push('### Medical writing notes (requires reviewer validation)');
  lines.push('- Treat this as a drafting aid; do not auto-promote into final authored documents.');
  lines.push('- Verify endpoint language and denominator context before claim use.');
  lines.push('- Confirm each claim with primary source PDF/official record during QC.');

  return {
    markdown: lines.join('\n'),
    summary: {
      documentCount: docs.length,
      safetySources: safety,
      efficacySources: efficacy,
      regulatorySources: regulatory,
      nctIds,
      dois,
    },
    sources: docs.map(d => ({
      id: d.id,
      title: d.title || 'Untitled source',
      url: d.url || null,
    })),
  };
}

export function buildRegulatoryEvidenceBrief(docs: EvidenceBriefDoc[]) {
  return buildRegulatoryEvidenceBriefPackage(docs).markdown;
}

import React from 'react';

/** The deterministic catalog facts of a source; a null field was not found, never guessed. */
export interface SourceCatalog {
  nativeRecord?: { workArea: string; sourceScope: 'project' | 'organization'; kind: string; id: string; lifecycle: string; version: string | null } | null;
  studyRef: number | null;
  trialRegistryIdentifier: string | null;
  protocolNumber: string | null;
  documentDate: string | null;
  dataCutDate: string | null;
  dataset: {
    format: string | null;
    tableCount: number;
    tables: Array<{ name: string; standard: string | null; domain: string | null; rowCount: number; columnCount: number }>;
  } | null;
}

/**
 * What the catalog found a source is: protocol, registry id, data cut-off, and
 * for a table or define.xml its CDISC standard, domain and size. Facts only;
 * a fact not found is left out, never filled in.
 */
function nativeRecordFacts(record: SourceCatalog['nativeRecord']): string[] {
  if (!record) return [];
  return [record.workArea === 'quality' ? 'Quality system' : record.workArea,
    record.sourceScope === 'organization' ? 'Organization context' : 'Project record',
    ...(record.lifecycle ? [record.lifecycle.replace(/_/g, ' ')] : []), ...(record.version ? [`version ${record.version}`] : [])];
}

function catalogFacts(c: SourceCatalog | null | undefined): string[] {
  if (!c) return [];
  const facts: string[] = [];
  facts.push(...nativeRecordFacts(c.nativeRecord));
  if (c.protocolNumber) facts.push(`Protocol ${c.protocolNumber}`);
  if (c.trialRegistryIdentifier) facts.push(c.trialRegistryIdentifier);
  if (c.dataCutDate) facts.push(`data cut-off ${c.dataCutDate}`);
  else if (c.documentDate) facts.push(`dated ${c.documentDate}`);
  const t = c.dataset?.tables[0];
  if (t) {
    const kind = t.standard ? `${t.standard}${t.domain ? ` ${t.domain}` : ''}` : 'table';
    facts.push(c.dataset!.format === 'define-xml'
      ? `define.xml · ${c.dataset!.tableCount} dataset${c.dataset!.tableCount === 1 ? '' : 's'}`
      : `${kind} · ${t.columnCount} columns · ${t.rowCount} rows`);
  }
  return facts;
}

export function SourceCatalogLine({ catalog, className = 'sec-sub' }: { catalog?: SourceCatalog | null; className?: string }) {
  const facts = catalogFacts(catalog);
  if (facts.length === 0) return null;
  return (
    <span className={className} style={{ display: 'block' }} data-testid="source-catalog">
      {facts.join(' · ')}
    </span>
  );
}

/** Where a search matched in the text read from the file; nothing outside a search. */
export function SourceSnippet({ show, text, className = 'sec-sub' }: { show: boolean; text?: string | null; className?: string }) {
  if (!show || !text) return null;
  return (
    <span className={className} style={{ display: 'block' }}>
      &hellip;{text.replace(/<\/?b>/g, '')}&hellip;
    </span>
  );
}

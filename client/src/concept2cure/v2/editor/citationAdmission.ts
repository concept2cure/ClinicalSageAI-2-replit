import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, redactInternals } from '@/lib/queryClient';
import { isProgramId } from './draftToDocument';
import type { CitationSource } from '@shared/authoring/citations';
import { citedSourceIdsInHtml } from './citationNode';
import type { ProjectSourceRecord } from './projectSourceCatalog';
import type { SourceReadState } from './useProjectSourceCatalog';

interface Admission { sectionId: string; sourceId: string; sourceDetails?: CitationSource | null }
interface Read { documentId: string | null; state: SourceReadState; admissions: Admission[]; error: string | null }
const empty = (documentId: string | null): Read => ({ documentId, state: documentId ? 'loading' : 'idle', admissions: [], error: null });
function admission(value: unknown): Admission | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.source !== 'cre_evidence_source' || !isProgramId(row.section_id) || typeof row.reference_id !== 'string') return null;
  if (!/^[1-9]\d*$/.test(row.reference_id) || !Number.isSafeInteger(Number(row.reference_id))) return null;
  if (row.source_details == null) return { sectionId: row.section_id, sourceId: row.reference_id,
    ...(row.source_details === null ? { sourceDetails: null } : {}) };
  const source = row.source_details as Record<string, unknown>;
  if (typeof source !== 'object' || source.id !== row.reference_id || !(source.title === null || typeof source.title === 'string')) return null;
  return { sectionId: row.section_id, sourceId: row.reference_id, sourceDetails: source as unknown as CitationSource };
}

/** Read recorded source associations through the existing document citation route. */
export function useDocumentCitationAdmission(documentId: string | null, programId: string | null) {
  const [epoch, setEpoch] = useState(0);
  const [read, setRead] = useState<Read>(() => empty(documentId));
  const generation = useRef(0);
  const key = `${programId ?? ''}:${documentId ?? ''}`;
  const readKey = useRef(key);
  useEffect(() => {
    const run = ++generation.current;
    readKey.current = key;
    setRead(empty(documentId));
    if (!documentId) return;
    void (async () => {
      try {
        const response = await apiRequest('GET', `/api/authoring/docs/${encodeURIComponent(documentId)}/citations`);
        const body: unknown = await response.json();
        if (!response.ok || !Array.isArray(body)) throw new Error('The document’s recorded source associations could not be read.');
        if (body.some(row => !row || typeof row !== 'object' || (row.source === 'cre_evidence_source' && !admission(row)))) throw new Error('The document’s recorded source associations could not be verified.');
        if (generation.current !== run) return;
        setRead({ documentId, state: 'ready', admissions: body.flatMap(row => { const item = admission(row); return item ? [item] : []; }), error: null });
      } catch (error) {
        if (generation.current !== run) return;
        setRead({ ...empty(documentId), state: 'error', error: redactInternals(error instanceof Error ? error.message : '', 'The recorded source associations could not be read.') });
      }
    })();
    return () => { generation.current += 1; };
  }, [documentId, key, epoch]);
  const retry = useCallback(() => { generation.current += 1; setRead(empty(documentId)); setEpoch(value => value + 1); }, [documentId]);
  // A confirmed source write adds exactly the association the API accepted;
  // it does not infer authority from a pasted marker or a catalogue title.
  const admit = useCallback((sectionId: string, sourceId: number) => {
    setRead(previous => previous.state === 'ready' ? { ...previous, admissions: [...previous.admissions, { sectionId, sourceId: String(sourceId) }] } : previous);
  }, []);
  return { ...(read.documentId === documentId && readKey.current === key ? read : empty(documentId)), retry, admit };
}

export function admittedCitationSources(catalogue: ProjectSourceRecord[], admissions: Admission[], sectionId: string | null): CitationSource[] {
  const byId = new Map(catalogue.map(row => [String(row.id), row]));
  return admissions.filter(row => row.sectionId === sectionId).flatMap(row => {
    const captured = byId.get(row.sourceId);
    if (row.sourceDetails === null || captured?.dataEligible === false) return [];
    if (row.sourceDetails) return [row.sourceDetails];
    return captured ? [{ id: row.sourceId, title: captured.title }] : [];
  });
}

export function admittedPrecedingSources(sections: Array<{ id: string; content?: string | null }>, activeSectionId: string | null,
  catalogue: ProjectSourceRecord[], admissions: Admission[]): { sources: CitationSource[]; ids: string[] } {
  const sources: CitationSource[] = [];
  const ids: string[] = [];
  for (const section of sections) {
    if (section.id === activeSectionId) break;
    const admitted = admittedCitationSources(catalogue, admissions, section.id);
    const allowed = new Set(admitted.map(source => source.id));
    sources.push(...admitted);
    ids.push(...citedSourceIdsInHtml(section.content ?? '').filter(id => allowed.has(id)));
  }
  return { sources, ids };
}

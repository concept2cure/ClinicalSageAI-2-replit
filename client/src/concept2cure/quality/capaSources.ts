/**
 * Which CAPAs were raised from a quality record — derived from the CAPA
 * register, never stored on the record (2026-10-29).
 *
 * Raise CAPA (QmsRecords.tsx) records the source as a CAPA `sourceRefs` entry
 * `{ kind, id, label }`. Nothing set the nonconformance's own `capa_linked`
 * flag, and no other record kept a link, so a record could not say a CAPA had
 * been raised from it. This reads the CAPA register once and indexes it by
 * source, so each register shows its CAPAs from the one place they are recorded.
 *
 * @module client/src/concept2cure/quality/capaSources
 */
import { useMemo } from 'react';
import { useFetchJson } from '../mdx/hooks/useFetchJson';
import { listOf } from './qmsList';
import type { CapaRow } from './qmsRecordData';

/** The `sourceRefs` kind each quality record is raised as. One place, used by Raise CAPA and the CAPA column. */
export const CAPA_SOURCE_KIND = {
  nonconforming: 'qms_nonconforming_product',
  supplier: 'qms_supplier',
  audit: 'qms_internal_audit',
  review: 'qms_management_review',
} as const;

/** The CAPA codes raised from each record of `kind`, by record id; null while unread or when the read failed. */
export function useCapasBySource(kind: string | undefined): { codesFor: (id: string) => string[] | null; failed: boolean } {
  const read = useFetchJson<unknown>(kind ? '/api/capa-mdr/capa' : null);
  const index = useMemo(() => {
    const rows = listOf<CapaRow>(read.data);
    if (!kind || !rows) return null;
    const byId = new Map<string, string[]>();
    for (const capa of rows) {
      for (const ref of capa.sourceRefs ?? []) {
        if (ref?.kind === kind && typeof ref.id === 'string') byId.set(ref.id, [...(byId.get(ref.id) ?? []), capa.capaCode]);
      }
    }
    return byId;
  }, [kind, read.data]);
  const failed = !!kind && !read.loading && (read.error != null || (read.data != null && index === null));
  return { codesFor: (id) => (index ? index.get(id) ?? [] : null), failed };
}

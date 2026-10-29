/**
 * ChangeLinkForm — "Link a record" on a change, offering the records Quality
 * holds (2026-10-29).
 *
 * A link was a free-text reference, so a change's "deviation" or "CAPA" link
 * named a record the platform could not resolve. The nonconformance, CAPA and
 * supplier registers are in Quality now (P-48), so for those types the drawer
 * lists the organisation's own records: the reference and its description are
 * taken from the pick (C2CForm `derive`), shown read-only, and are what is sent.
 * The other types (validation, document, SOP, risk, other) keep the typed
 * reference. A register that could not be read says so; the typed reference
 * stays available, never a guessed record.
 *
 * @module client/src/concept2cure/quality/ChangeLinkForm
 */
import * as React from 'react';
import { C2CForm } from '../v2/C2CForm';
import { useFetchJson } from '../mdx/hooks/useFetchJson';
import { listOf } from './qmsList';
import { LINK_TYPE_LABEL, RELATIONSHIP_LABEL, type LinkType } from './changeData';
import type { CapaRow, NonconformanceRow, SupplierRow } from './qmsRecordData';

export interface LinkPick { value: string; label: string }
type Registered = 'deviation' | 'capa' | 'supplier';

/** The registers a link type is chosen from. */
const REGISTERS: Record<Registered, { path: string; name: string }> = {
  deviation: { path: '/api/mdx/qms/nonconforming', name: 'nonconformance' },
  capa: { path: '/api/capa-mdr/capa', name: 'CAPA' },
  supplier: { path: '/api/mdx/qms/suppliers', name: 'supplier' },
};

/** How a register row reads as a pick: its own number, and what it is. */
function toPick(type: Registered, row: unknown): LinkPick {
  switch (type) {
    case 'deviation': { const r = row as NonconformanceRow; return { value: r.nc_number, label: r.description }; }
    case 'capa': { const r = row as CapaRow; return { value: r.capaCode, label: r.title }; }
    case 'supplier': { const r = row as SupplierRow; return { value: r.supplier_code || r.supplier_name, label: r.supplier_name }; }
  }
}
const isRegistered = (t: string): t is Registered => t in REGISTERS;

/** The register's records as picks, or null while unread or when the read failed. */
function useRegisterPicks(type: string): { picks: LinkPick[] | null; failed: boolean; loading: boolean } {
  const registered = isRegistered(type) ? type : null;
  const read = useFetchJson<unknown>(registered ? REGISTERS[registered].path : null);
  const rows = React.useMemo(() => (registered ? listOf<object>(read.data) : null), [registered, read.data]);
  if (!registered) return { picks: null, failed: false, loading: false };
  const failed = !read.loading && (read.error != null || (read.data != null && rows === null));
  return { picks: rows ? rows.map((r) => toPick(registered, r)) : null, failed, loading: read.loading };
}

const optionsOf = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

export function ChangeLinkForm({ changeNumber, refusal, onCancel, onSubmit }: {
  changeNumber: string;
  refusal: string | null;
  onCancel: () => void;
  onSubmit: (v: { linkType: LinkType; linkedRef: string; linkedLabel?: string; relationship?: string }) => void;
}) {
  const [type, setType] = React.useState('');
  const register = useRegisterPicks(type);
  const byValue = new Map((register.picks ?? []).map((p) => [p.value, p]));
  const regName = isRegistered(type) ? REGISTERS[type].name : '';
  const status = !isRegistered(type)
    ? undefined
    : register.loading ? `Reading the ${regName} register…`
      : register.failed ? `The ${regName} register could not be read; type the reference instead.`
        : register.picks && register.picks.length === 0 ? `No ${regName} is recorded yet; type the reference instead.` : '';

  return (
    <C2CForm
      config={{
        eyebrow: 'Change control',
        title: `Link a record to ${changeNumber}`,
        governed: 'The link is written to the audit trail under your name.',
        submitLabel: 'Link record',
        ...(refusal ? { notice: refusal } : {}),
        fields: [
          { key: 'linkType', label: 'Record type', type: 'select', required: true, half: true, options: optionsOf(LINK_TYPE_LABEL) },
          { key: 'relationship', label: 'How it relates', type: 'select', half: true, options: optionsOf(RELATIONSHIP_LABEL) },
          ...(isRegistered(type) ? [{
            key: 'record', label: `Choose the ${regName}`, type: 'select' as const,
            options: (register.picks ?? []).map((p) => ({ value: p.value, label: `${p.value} — ${p.label}` })),
            desc: `From your organisation's ${regName} register.`, descStatus: status,
          }] : []),
          {
            key: 'linkedRef', label: 'Reference', type: 'text', required: true, placeholder: 'DEV-2026-041',
            desc: 'The record’s number as it appears in its own register.',
            derive: (v) => (isRegistered(v.linkType) && v.record ? v.record : null),
          },
          {
            key: 'linkedLabel', label: 'Short description', type: 'text',
            derive: (v) => (isRegistered(v.linkType) && v.record ? byValue.get(v.record)?.label ?? null : null),
          },
        ],
      }}
      onFieldChange={(key, value) => { if (key === 'linkType') setType(value); }}
      onCancel={onCancel}
      onSubmit={(v) => onSubmit({
        linkType: v.linkType as LinkType,
        linkedRef: v.linkedRef.trim(),
        linkedLabel: v.linkedLabel?.trim() || undefined,
        relationship: v.relationship || undefined,
      })}
    />
  );
}

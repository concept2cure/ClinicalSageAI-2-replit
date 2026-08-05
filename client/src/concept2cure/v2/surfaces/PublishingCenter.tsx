/**
 * Publishing Center — the version-aware eCTD publishing surface.
 *
 * Registry id: `ectd-publishing`.
 *
 * Wired to the eCTD publishing engine (server/routes/ectd-v4.ts, mounted
 * /api/ectd), read/validate only — nothing here transmits or freezes:
 *   • GET /api/ectd/qualification/spec-versions   — the EXACT ICH/FDA spec
 *                                                   versions each package is
 *                                                   qualified against
 *   • GET /api/ectd/controlled-vocab              — every controlled-vocabulary
 *                                                   list (v3.2.2 coded attrs +
 *                                                   v4.0 genericode) with OIDs
 *   • GET /api/ectd/controlled-vocab/:listId      — a v4.0 list's codes
 *
 * The user picks the eCTD version (v3.2.2 or v4.0/HL7 RPS); the panels adapt —
 * v4.0 shows the FDA Regional IG OID and the genericode code systems, v3.2.2
 * shows the us-regional coded-attribute vocabularies. Every panel renders live
 * server data, an honest empty, or an honest error — never a fixture.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import '../styles/project-home-v2.css';

type EctdVersion = 'v3.2.2' | 'v4.0';

interface CvListSummary { id: string; shortName?: string; oid?: string; codeCount: number; }
interface CvListingResponse {
  regionalIgOid: string;
  v4: CvListSummary[];
  v3: Array<{ id: string; codeCount: number }>;
}
interface CvCodeRow { code: string; description: string; }
interface CvList { id: string; shortName: string; oid: string; codes: CvCodeRow[]; }
type SpecVersions = Record<EctdVersion, Record<string, string>>;

async function readJson<T = any>(path: string): Promise<{ ok: boolean; status: number; body: T | null }> {
  try {
    const res = await apiRequest('GET', path);
    const body = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

/** Friendly label for a v4.0 code-list id. */
const V4_LABELS: Record<string, string> = {
  applicationType: 'Application type',
  submissionType: 'Submission type',
  submissionUnitType: 'Submission unit type',
  contextOfUse: 'Context of use (CTD sections)',
  formType: 'Form type',
  couKeywordDefinitionType: 'Keyword definition type',
  promotionalDocumentType: 'Promotional document type',
  promotionalMaterialAudienceType: 'Promotional material audience',
  promotionalMaterialType: 'Promotional material type',
  submissionContactType: 'Submission contact type',
  submissionContactStatus: 'Submission contact status',
  submissionUnitStatus: 'Submission unit status',
  telecomUse: 'Telecom use',
  telecomCapabilities: 'Telecom capabilities',
};

export function PublishingCenter(_props: SurfaceViewProps) {
  const [version, setVersion] = useState<EctdVersion>('v4.0');

  const [specs, setSpecs] = useState<SpecVersions | null>(null);
  const [listing, setListing] = useState<CvListingResponse | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [selectedList, setSelectedList] = useState<string>('contextOfUse');
  const [list, setList] = useState<CvList | null>(null);
  const [listState, setListState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      setLoadState('loading');
      const [s, l] = await Promise.all([
        readJson<SpecVersions>('/api/ectd/qualification/spec-versions'),
        readJson<CvListingResponse>('/api/ectd/controlled-vocab'),
      ]);
      if (!live) return;
      if (!s.ok || !l.ok || !s.body || !l.body) { setLoadState('error'); return; }
      setSpecs(s.body); setListing(l.body); setLoadState('ready');
    })();
    return () => { live = false; };
  }, []);

  const loadList = useCallback(async (listId: string) => {
    setListState('loading'); setList(null);
    const { ok, body } = await readJson<CvList>(`/api/ectd/controlled-vocab/${encodeURIComponent(listId)}`);
    if (!ok || !body) { setListState('error'); return; }
    setList(body); setListState('ready');
  }, []);

  useEffect(() => {
    // v4.0 browses genericode lists; v3.2.2 lists have no per-list codes endpoint here.
    if (version === 'v4.0') void loadList(selectedList);
  }, [version, selectedList, loadList]);

  const specRows = specs ? Object.entries(specs[version] ?? {}) : [];
  const filteredCodes = useMemo(() => {
    if (!list) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return list.codes;
    return list.codes.filter((c) => c.code.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  }, [list, filter]);

  return (
    <div className="cm-body">
      {/* ── Header: version selector ── */}
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Publishing Center</span>
          <span className="s">eCTD backbone, controlled vocabulary &amp; qualification</span>
        </div>
        <div className="pj-card-b" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>eCTD version</label>
          <select className="c2c-input" style={{ height: 30 }} value={version} onChange={(e) => setVersion(e.target.value as EctdVersion)}>
            <option value="v4.0">eCTD v4.0 · HL7 RPS</option>
            <option value="v3.2.2">eCTD v3.2.2</option>
          </select>
          {version === 'v4.0' && listing?.regionalIgOid && (
            <span className="rd-chip tone-ok" title="FDA eCTD v4.0 Regional Implementation Guide OID">
              {I.shieldCheck} Regional IG OID {listing.regionalIgOid}
            </span>
          )}
        </div>
      </div>

      {/* ── Qualified against (spec versions) ── */}
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Qualified against</span>
          <span className="s">{version}</span>
        </div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {loadState === 'loading' ? (
            <div style={{ padding: 16 }}><EmptyState icon={I.book} title="Loading spec versions…" /></div>
          ) : loadState === 'error' ? (
            <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load spec versions" hint="GET /api/ectd/qualification/spec-versions didn’t respond. Sign in to your tenant and retry." /></div>
          ) : specRows.length === 0 ? (
            <div style={{ padding: 16 }}><EmptyState icon={I.book} title="No spec versions" /></div>
          ) : (
            <table className="reg-tbl"><thead><tr><th>Specification</th><th>Version qualified against</th></tr></thead>
              <tbody>{specRows.map(([k, v]) => (
                <tr key={k}><td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</td><td>{v}</td></tr>
              ))}</tbody></table>
          )}
        </div>
      </div>

      {/* ── Controlled vocabulary ── */}
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Controlled vocabulary</span>
          {version === 'v4.0' && list && <span className="s mono">{list.oid !== 'na' ? list.oid : 'no OID'}</span>}
        </div>
        <div className="pj-card-b">
          {version === 'v3.2.2' ? (
            listing?.v3?.length ? (
              <>
                <p style={{ fontSize: 12.5, color: 'var(--c2c-dim,#667085)', marginTop: 0 }}>
                  eCTD v3.2.2 carries its US-regional controlled values as coded attributes
                  (<span className="mono">fdaat</span>/<span className="mono">fdast</span>/<span className="mono">fdasst</span>/<span className="mono">fdaft</span>) in <span className="mono">us-regional.xml</span>.
                </p>
                <table className="reg-tbl"><thead><tr><th>Coded-attribute list</th><th style={{ textAlign: 'right' }}>Codes</th></tr></thead>
                  <tbody>{listing.v3.map((l) => (
                    <tr key={l.id}><td style={{ fontWeight: 600 }}>{l.id.replace(/([A-Z])/g, ' $1')}</td><td style={{ textAlign: 'right' }}>{l.codeCount}</td></tr>
                  ))}</tbody></table>
              </>
            ) : (
              <EmptyState icon={I.book} title="Vocabulary unavailable" hint="Sign in to your tenant to browse the v3.2.2 coded attributes." />
            )
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>Code list</label>
                <select aria-label="Controlled vocabulary list" className="c2c-input" style={{ height: 30, minWidth: 260 }} value={selectedList} onChange={(e) => setSelectedList(e.target.value)}>
                  {(listing?.v4 ?? []).map((l) => (
                    <option key={l.id} value={l.id}>{V4_LABELS[l.id] ?? l.id} ({l.codeCount})</option>
                  ))}
                </select>
                <input
                  aria-label="Filter codes"
                  className="c2c-input" style={{ height: 30, marginLeft: 'auto', minWidth: 200 }}
                  placeholder="Filter codes…" value={filter} onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              {listState === 'loading' ? (
                <EmptyState icon={I.book} title="Loading codes…" />
              ) : listState === 'error' ? (
                <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load this code list" hint="GET /api/ectd/controlled-vocab/:listId didn’t respond." />
              ) : !list || filteredCodes.length === 0 ? (
                <EmptyState icon={I.book} title={filter ? 'No codes match your filter' : 'No codes'} />
              ) : (
                <div style={{ maxHeight: 420, overflow: 'auto' }}>
                  <table className="reg-tbl"><thead><tr><th style={{ width: 220 }}>Code</th><th>Description</th></tr></thead>
                    <tbody>{filteredCodes.map((c) => (
                      <tr key={c.code}><td className="mono">{c.code}</td><td>{c.description}</td></tr>
                    ))}</tbody></table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

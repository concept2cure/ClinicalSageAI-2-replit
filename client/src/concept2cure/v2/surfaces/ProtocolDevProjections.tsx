/**
 * Protocol development — the five projections of the bound study design.
 *
 * docs/design/PROTOCOL_DESIGN_CONVERGENCE.md step 2. The design-as-data spine
 * (server/services/study-design) already produces an ICH M11 protocol, a SAP
 * skeleton, a Schedule of Activities, a trial-registry record and a CRF shell
 * from one structured object, and already serves every one of them at
 * `GET /api/study-design/:studyId/<projection>`. This module is the protocol
 * author's way in. It is a READER:
 *
 *   • it adds no route and no second exporter — every fetch below is the
 *     existing study-design endpoint, and the download is the engine's own
 *     JSON, byte for byte, not a client-side re-render of it;
 *   • it writes nothing. Nothing here generates into the protocol's sections.
 *     That is a later step of the design document's order of work and no
 *     control on this screen implies it;
 *   • it papers over nothing. Every projection already reports `gaps` and a
 *     per-section / per-field status when the design object lacks the content,
 *     and those are rendered as what they are. A projection with gaps is never
 *     drawn as a completed document.
 */
import React, { useState } from 'react';
import * as PG from './ProtocolGov';
import { apiRequest } from '@/lib/queryClient';
import { downloadText, safeFileName } from '../download';

type Obj = Record<string, unknown>;
const str = (v: unknown): string => (v == null ? '' : String(v));
const asRows = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);

/** One entry of a projection: a section, a registry field group, a CRF form. */
interface Entry { key: string; label: string; status: string; text: string; gaps: string[] }

/** A projection, normalized for rendering. Percentages and gaps are the
 *  engine's; nothing here recomputes either. */
interface View { standard: string; percent: number | null; gaps: string[]; entries: Entry[]; note: string }

export interface ProjectionSpec {
  id: string;
  label: string;
  /** What it is a projection OF — printed under the control, always. */
  of: string;
  /** The existing study-design endpoint, relative to /api/study-design/:id. */
  path: string;
  normalize: (payload: Obj) => View;
}

const pct = (c: unknown): number | null => {
  const p = (c as Obj | undefined)?.percent;
  return typeof p === 'number' ? p : null;
};

/** ICH M11 protocol and the SAP skeleton share the section shape. */
function sectionsView(doc: Obj): View {
  const sections = asRows(doc.sections);
  return {
    standard: str(doc.standard),
    percent: pct(doc.completeness),
    gaps: [],
    note: str(doc.synopsis),
    entries: sections.map((s) => ({
      key: str(s.number) + ' ' + str(s.title),
      label: str(s.number) + '. ' + str(s.title),
      status: str(s.status),
      text: str(s.content),
      gaps: Array.isArray(s.gaps) ? (s.gaps as string[]) : [],
    })),
  };
}

function soaView(doc: Obj): View {
  const rows = asRows(doc.rows);
  const counts = (doc.counts ?? {}) as Obj;
  return {
    standard: str(doc.standard),
    percent: pct(doc.completeness),
    gaps: (Array.isArray(doc.gaps) ? doc.gaps : []) as string[],
    note: doc.present === false
      ? 'The design object carries no Schedule of Activities, so there is no grid to project.'
      : `${str(counts.visits)} visit(s), ${str(counts.activities)} activity row(s), ${str(counts.scheduledCells)} scheduled cell(s).`,
    entries: rows.map((r) => {
      const activity = (r.activity ?? {}) as Obj;
      return {
        key: str(activity.id) || str(activity.name),
        label: str(activity.name),
        status: str(activity.category),
        text: `Scheduled at ${str(r.scheduledCount)} visit(s).`,
        gaps: [],
      };
    }),
  };
}

/** One registry record → one block of field-group entries. */
function registryEntries(record: Obj, prefix: string): Entry[] {
  return asRows(record.modules).map((m) => {
    const fields = asRows(m.fields);
    const missing = fields.filter((f) => f.status !== 'rendered');
    return {
      key: prefix + ':' + str(m.name),
      label: prefix + ' — ' + str(m.name),
      status: missing.length === 0 ? 'rendered' : 'partial',
      text: `${fields.length - missing.length} of ${fields.length} field(s) rendered from the design object.`,
      gaps: missing.map((f) => str(f.name) + ': ' + (str(f.gap) || 'not carried by the design object')),
    };
  });
}

function registrationView(payload: Obj): View {
  const recs = (payload.registrations ?? {}) as Obj;
  const ctgov = (recs.ctgov ?? {}) as Obj;
  const ctis = (recs.ctis ?? {}) as Obj;
  const gaps = [
    ...((Array.isArray(ctgov.gaps) ? ctgov.gaps : []) as string[]).map((g) => 'ClinicalTrials.gov: ' + g),
    ...((Array.isArray(ctis.gaps) ? ctis.gaps : []) as string[]).map((g) => 'EU CTIS: ' + g),
  ];
  return {
    standard: [str(ctgov.standard), str(ctis.standard)].filter(Boolean).join(' · '),
    percent: pct(ctgov.completeness),
    gaps,
    note: `Registrable — ClinicalTrials.gov: ${ctgov.registrable ? 'yes' : 'no'}; EU CTIS: ${ctis.registrable ? 'yes' : 'no'}.`,
    entries: [...registryEntries(ctgov, 'ClinicalTrials.gov'), ...registryEntries(ctis, 'EU CTIS')],
  };
}

function crfView(doc: Obj): View {
  const counts = (doc.counts ?? {}) as Obj;
  return {
    standard: str(doc.standard),
    percent: pct(doc.completeness),
    gaps: (Array.isArray(doc.gaps) ? doc.gaps : []) as string[],
    note: `${str(counts.forms ?? asRows(doc.forms).length)} form(s) projected from the Schedule of Activities.`,
    entries: asRows(doc.forms).map((f) => ({
      key: str(f.name),
      label: str(f.name),
      status: str(f.origin),
      text: `${asRows(f.items).length} item(s)${f.cdashDomain ? ' · CDASH ' + str(f.cdashDomain) : ''}.`,
      gaps: f.note ? [str(f.note)] : [],
    })),
  };
}

/** The five, in the order the design document names them. */
export const PROJECTIONS: ProjectionSpec[] = [
  {
    id: 'protocol', label: 'ICH M11 protocol', path: 'protocol',
    of: 'A projection of the study design object as an ICH M11-structured protocol.',
    normalize: (p) => sectionsView((p.protocol ?? {}) as Obj),
  },
  {
    id: 'sap', label: 'Statistical Analysis Plan skeleton', path: 'sap',
    of: 'A projection of the study design object’s statistical plan and estimands (ICH E9 / E9(R1)).',
    normalize: (p) => sectionsView((p.sap ?? {}) as Obj),
  },
  {
    id: 'soa', label: 'Schedule of Activities', path: 'schedule-of-activities',
    of: 'A projection of the study design object’s time-and-events grid (ICH M11 §7).',
    normalize: (p) => soaView((p.scheduleOfActivities ?? {}) as Obj),
  },
  {
    id: 'registration', label: 'Trial registry record', path: 'registration',
    of: 'A projection of the study design object as a registry record — ClinicalTrials.gov under FDAAA 801 and EU CTIS under Regulation 536/2014.',
    normalize: registrationView,
  },
  {
    id: 'crf', label: 'CRF shell', path: 'crf-shell',
    of: 'A projection of the study design object’s Schedule of Activities as a blank CRF set (CDISC CDASH).',
    normalize: (p) => crfView((p.crfShell ?? {}) as Obj),
  },
];

/** The server's refusal, in its own words. */
function refusal(body: unknown, status: number): string {
  const err = (body as { error?: unknown } | null)?.error;
  if (typeof err === 'string') return err;
  const obj = err as { message?: string; code?: string } | undefined;
  return obj?.message || obj?.code || `HTTP ${status}`;
}

async function loadProjection(studyId: string, spec: ProjectionSpec): Promise<Obj> {
  const res = await apiRequest('GET', `/api/study-design/${encodeURIComponent(studyId)}/${spec.path}`);
  const json = (await res.json().catch(() => null)) as Obj | null;
  if (!res.ok || !json) {
    throw new Error(refusal(json, res.status) + ' Nothing was projected.');
  }
  return json;
}

/* ── Rendering ─────────────────────────────────────────────────────────── */

function EntryRow({ e }: { e: Entry }) {
  return (
    <div className="pj-card" style={{ padding: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 12 }}>{e.label}</b>
        {e.status && <PG.StatusBadge status={e.status} />}
      </div>
      {e.text && <div style={{ fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap' }}>{e.text}</div>}
      {e.gaps.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }} aria-label={`Gaps in ${e.label}`}>
          {e.gaps.map((g) => <li key={g}>{g}</li>)}
        </ul>
      )}
    </div>
  );
}

function ProjectionBody({ view }: { view: View }) {
  return (
    <>
      <div className="pd-kv">
        <span className="pd-kv-k">Standard</span>
        <span className="pd-kv-v pg-mono">{view.standard || 'not stated by the engine'}</span>
      </div>
      {view.percent !== null && (
        <div className="pd-kv">
          <span className="pd-kv-k">Rendered from the design object</span>
          <span className="pd-kv-v pg-mono">{view.percent}%</span>
        </div>
      )}
      {view.note && <div className="pde-note">{view.note}</div>}
      {view.gaps.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12 }} aria-label="What the design object does not carry">
          {view.gaps.map((g) => <li key={g}>{g}</li>)}
        </ul>
      )}
      {view.entries.length === 0 && view.gaps.length === 0 && (
        <div className="pde-note">The engine returned no content and reported no gap. Nothing is claimed here.</div>
      )}
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {view.entries.map((e) => <EntryRow key={e.key} e={e} />)}
      </div>
    </>
  );
}

export interface ProjectionsPanelProps {
  studyId: string;
  /** Names the file the author downloads. */
  designTitle: string;
}

/**
 * The five projections, one open at a time. Nothing is fetched until the
 * author asks for one, and a refusal is shown as a refusal.
 */
export function ProjectionsPanel({ studyId, designTitle }: ProjectionsPanelProps) {
  const [open, setOpen] = useState<ProjectionSpec | null>(null);
  const [payload, setPayload] = useState<Obj | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const show = async (spec: ProjectionSpec) => {
    setOpen(spec); setPayload(null); setError(null); setBusy(true);
    try {
      setPayload(await loadProjection(studyId, spec));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!open || !payload) return;
    const name = safeFileName(designTitle || studyId, 'study-design') + '-' + open.id + '.json';
    if (!downloadText(name, JSON.stringify(payload, null, 2), 'application/json')) {
      setError('The browser refused the download. No file was saved.');
    }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <h3 className="pd-pane-t" style={{ fontSize: 13 }}>Projections of this design</h3>
      <div className="pd-pane-s">
        Read-only. Nothing is written back into the protocol — each of these is a projection of the
        study design object, produced by the deterministic engine, not of this document.
      </div>
      <div className="pde-actions" style={{ flexWrap: 'wrap', marginTop: 8 }}>
        {PROJECTIONS.map((p) => (
          <PG.Btn key={p.id} icon="fileText" variant={open?.id === p.id ? 'primary' : 'outline'} onClick={() => show(p)}>
            {p.label}
          </PG.Btn>
        ))}
      </div>
      <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 11 }} aria-label="What each projection is a projection of">
        {PROJECTIONS.map((p) => <li key={p.id}><b>{p.label}</b> — {p.of}</li>)}
      </ul>
      {open && (
        <section role="region" aria-label={open.label} style={{ marginTop: 12 }}>
          <div className="pd-pane-h">
            <div><h3 className="pd-pane-t" style={{ fontSize: 13 }}>{open.label}</h3><div className="pd-pane-s">{open.of}</div></div>
            <div className="pde-actions">
              <PG.Btn icon="download" variant="outline" disabled={!payload} onClick={save}>Download (JSON)</PG.Btn>
            </div>
          </div>
          {busy && <div role="status" className="scaf-note">Projecting…</div>}
          {error && <div className="pde-refusal" role="alert">{error}</div>}
          {payload && !error && <ProjectionBody view={open.normalize(payload)} />}
        </section>
      )}
    </div>
  );
}

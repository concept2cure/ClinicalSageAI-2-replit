/**
 * From the project, every record anchored to it (PF-17, project first).
 *
 * Every governed record starts at a project, and the project page could not
 * show them: each surface listed its own store, and a record anchored to the
 * project in one store was invisible from the others. GET
 * /api/c2c/projects/:id/records reads each store by its project key — the
 * submissions, Data Room sources, Authoring documents, Vault documents, study
 * designs and filing documents that name this project — and this panel lists
 * them in one place.
 *
 * Honest per section: a store this environment does not carry, or one whose
 * read failed, says so and is never shown as "none". The server returns at
 * most 200 rows per section, so a full section says "the first 200", never a
 * total it did not count.
 */
import React from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData } from '../dataConnect';
import { enumWords, filingTypeWords, regionWords, studyPhaseWords, submissionStatusWords } from './projectWords';

type RecordRow = Record<string, unknown>;
interface RecordSection {
  available: boolean;
  rows: RecordRow[];
  reason?: string;
}
interface ProjectRecordsRead {
  projectId: string;
  records: Partial<Record<SectionKey, RecordSection>>;
}

type SectionKey = 'submissions' | 'sources' | 'authoringDocuments' | 'vaultDocuments' | 'studyDesigns' | 'filingDocuments';

/** The server's per-section cap (routes/c2c/projects.ts PROJECT_RECORD_READS). */
const SECTION_CAP = 200;

const text = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const joined = (...parts: unknown[]): string => parts.map(text).filter(Boolean).join(' · ');

/* Each detail says its stored values by their labels (projectWords.ts): it read
   "ind · fda · planning" (2026-10-31). A title falls back to words, never to an
   internal id. */
const SECTIONS: ReadonlyArray<{ key: SectionKey; label: string; title: (r: RecordRow) => string; detail: (r: RecordRow) => string }> = [
  { key: 'submissions', label: 'Submissions', title: (r) => text(r.title) ?? 'Untitled submission',
    detail: (r) => joined(filingTypeWords(r.application_type), regionWords(r.primary_region), submissionStatusWords(r.status)) },
  { key: 'sources', label: 'Data Room sources', title: (r) => text(r.title) ?? 'Untitled source', detail: (r) => joined(enumWords(r.source_type)) },
  { key: 'authoringDocuments', label: 'Authoring documents', title: (r) => text(r.title) ?? 'Untitled document', detail: (r) => joined(enumWords(r.status)) },
  { key: 'vaultDocuments', label: 'Vault documents', title: (r) => text(r.document_title) ?? text(r.document_code) ?? 'Document', detail: (r) => joined(r.document_code, r.version != null ? `v${r.version}` : null) },
  { key: 'studyDesigns', label: 'Study designs', title: (r) => text(r.title) ?? 'Untitled study design', detail: (r) => joined(studyPhaseWords(r.study_phase), enumWords(r.protocol_status)) },
  { key: 'filingDocuments', label: 'Filing documents', title: (r) => text(r.title) ?? 'Untitled filing document', detail: (r) => joined(filingTypeWords(r.doc_type)) },
];

function SectionBody({ section, title, detail }: {
  section: RecordSection | undefined;
  title: (r: RecordRow) => string;
  detail: (r: RecordRow) => string;
}) {
  if (!section || !section.available) {
    return <div className="scaf-note">Not available here: {section?.reason ?? 'the read returned nothing for this store'}.</div>;
  }
  if (section.rows.length === 0) return <div className="scaf-note">None in this project yet.</div>;
  return (
    <div className="pj-acts">
      {section.rows.map((r, i) => (
        <div key={i} className="pj-act">
          <span className="pj-act-w">{title(r)}</span>
          <span className="pj-act-t">{detail(r)}</span>
        </div>
      ))}
    </div>
  );
}

function countLabel(section: RecordSection | undefined): string {
  if (!section || !section.available) return 'not available';
  const n = section.rows.length;
  return n >= SECTION_CAP ? `the first ${SECTION_CAP}` : String(n);
}

export function ProjectRecords({ pid }: { pid: string }) {
  const state = useLiveData<ProjectRecordsRead>(`/api/c2c/projects/${pid}/records`);
  if (state.loading) {
    return <div role="status" aria-busy="true" className="scaf-note" style={{ padding: '16px 10px' }}>Loading the project’s records…</div>;
  }
  if (state.error || !state.data) {
    return (
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title="Couldn't load the project's records"
        hint="The project records read didn't respond. Sign in and retry, or check the service is reachable."
      />
    );
  }
  const records = state.data.records ?? {};
  return (
    <div>
      {SECTIONS.map(({ key, label, title, detail }) => {
        const section = records[key];
        return (
          <div key={key} style={{ marginTop: 12 }} data-records-section={key}>
            <div className="pj-sec-h"><h3>{label} <span className="rd-chip tone-idle">{countLabel(section)}</span></h3></div>
            <SectionBody section={section} title={title} detail={detail} />
          </div>
        );
      })}
    </div>
  );
}

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

/** The project's records as one card in Project knowledge, on every step (D3-2a, D3.md §4.8 item 7). Each store is
 *  a closed disclosure whose summary says its count ("Vault documents · 6") or that it is not available, so the card
 *  is a short list until a person opens a store. It moved here from the Author step's "Records in this project". */
export function ProjectRecords({ pid, activity }: { pid: string; activity?: React.ReactNode }) {
  const state = useLiveData<ProjectRecordsRead>(`/api/c2c/projects/${pid}/records`);
  const records = state.data?.records ?? {};
  return (
    <section className="pj-card" aria-labelledby="pj-records-h">
      <div className="pj-card-h"><h3 id="pj-records-h">Records</h3></div>
      {state.loading ? <p role="status" aria-busy="true" className="pj-team-note">Reading the project’s records…</p>
        : state.error || !state.data ? (
          <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load the project's records" read={state} readWhat="the project's records"
            hint="The project records read didn't respond. Sign in and retry, or check the service is reachable." />
        ) : SECTIONS.map(({ key, label, title, detail }) => {
          const section = records[key];
          return (
            <details key={key} className="pj-more" data-records-section={key}>
              <summary>{label} · {countLabel(section)}</summary>
              <SectionBody section={section} title={title} detail={detail} />
            </details>
          );
        })}
      {/* The project's audit read, last (D3-2b): every act, its actor and its recorded reason. It was a section of
          the Author step. It is read by the page, so a failed records read does not hide it. */}
      {activity && (
        <details className="pj-more" data-records-section="activity">
          <summary>Activity</summary>
          {activity}
        </details>
      )}
    </section>
  );
}

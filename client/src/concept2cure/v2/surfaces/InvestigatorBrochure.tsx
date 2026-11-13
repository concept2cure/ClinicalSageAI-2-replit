/**
 * Investigator's Brochure -- ICH E6(R3) Appendix A IB section tree with per-section
 * readiness, for the open project.
 *
 * Registry id: `investigator-brochure`
 *
 * Surfaces GET /api/investigator-brochure?programId=…: the ICH E6(R3) Appendix A IB
 * section registry with a deterministic per-section verdict (rendered | partial |
 * missing) and the inputs each open section still needs. The backend ASSEMBLES this
 * from the PROJECT's real upstream evidence stores (nonclinical_studies through their
 * submission, clinical_studies, adverse_events / risk_management_plans,
 * cmc_module3_sections) via
 * server/services/authoring/investigator-brochure-view-assembler — no
 * `c2c_investigator_brochure` blob, no fixture. Fixture-free (useLiveRows): renders
 * the real persisted rows, an honest error state, or an honest empty state.
 *
 * One project (2026-11-12, S12 sweep finding 92). The read named no project and the
 * server answered for the whole organisation, so the page showed "36% required
 * sections ready" with no project open, and the same figure for a project that held
 * none of the data behind it. With no project open the page now says so, shows no
 * figure and reads nothing. The figure counts only the sections that need project
 * data: the title page, confidentiality statement, table of contents and references
 * need none, and are labelled so instead of "Ready".
 */
import React from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { shellProgramId, shellProgramName, useShellProject } from '../shellProject';
import '../styles/project-home-v2.css';

/** The per-section display contract GET /api/investigator-brochure returns
 *  (server/services/authoring/investigator-brochure-view-assembler.ts → IBSectionRow):
 *  the real ICH E6(R3) Appendix A section registry with a deterministic per-section verdict. */
interface IBSectionRow {
  number: string;
  title: string;
  required: boolean;
  status: 'rendered' | 'partial' | 'missing';
  gaps: string[];
  description: string;
  /** 0 = top-level IB chapter / front matter, 1 = sub-section (e.g. 4.1). */
  depth: number;
  /** False for front matter and references: they need no project data and are left out of the figure. */
  needsData?: boolean;
}

/* ── verdict → tone / label ── */
const STATUS_TONE: Record<IBSectionRow['status'], string> = {
  rendered: 'ok',
  partial: 'warn',
  missing: 'err',
};
const STATUS_LABEL: Record<IBSectionRow['status'], string> = {
  rendered: 'Ready',
  partial: 'Partial',
  missing: 'Missing inputs',
};

/** What a section's chip says. A section that needs no project data is always
 *  "rendered" by the engine; calling that "Ready" claimed a readiness nobody assessed. */
function sectionChip(s: IBSectionRow): { tone: string; label: string } {
  return s.needsData === false
    ? { tone: 'idle', label: 'No project data needed' }
    : { tone: STATUS_TONE[s.status], label: STATUS_LABEL[s.status] };
}

function PageHead({ eyebrow, title, sub, actions }: {
  eyebrow: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="ph">
      <div>
        <div className="ph-eyebrow">{eyebrow}</div>
        <h1 className="ph-title">{title}</h1>
        {sub && <div className="ph-sub">{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}

/* ════ Investigator's Brochure surface ════ */

/** The figure: the required sections that need project data, and how many have all of it.
 *  A row that does not say whether it needs data (an older server) is counted, as it was before. */
function readinessOf(rows: IBSectionRow[]) {
  const counted = rows.filter((s) => s.required && s.needsData !== false);
  const ready = counted.filter((s) => s.status === 'rendered').length;
  return {
    counted: counted.length,
    ready,
    completeness: counted.length ? Math.round((ready / counted.length) * 100) : 0,
    open: rows.filter((s) => s.needsData !== false && s.status !== 'rendered').length,
  };
}

/* What AnA can see of this screen. The Ask button hands her "draft the OPEN
   sections" — which requires knowing which ones are open and what each is
   missing. Every gap the backend recorded travels with the section, because
   "why is 4.2 partial?" is answerable only from those strings.

   A FAILED read publishes the failure: a 0% completeness figure derived from
   an unreachable store is a filing-readiness claim nobody computed. With no
   project open she is told that, and given no figure. */
function ibAnaContext(a: {
  programId: string | null; projectName: string | null; loading: boolean; error?: string; rows: IBSectionRow[];
}) {
  if (!a.programId) {
    return {
      summary:
        'No project is open, so this screen shows no Investigator’s Brochure readiness: ' +
        'the readiness is worked out for one project.',
      availableActions: ['Open a project'],
    };
  }
  if (a.loading) {
    return { summary: 'The Investigator’s Brochure section structure is still loading; nothing on screen is final yet.' };
  }
  if (a.error) {
    return {
      summary:
        'The Investigator’s Brochure structure could not be read, so this screen is showing no ' +
        'sections because of a failure, not because none exist.',
      availableActions: ['Retry the IB structure read'],
    };
  }
  const r = readinessOf(a.rows);
  return {
    documentType: 'ICH_IB',
    summary:
      `Investigator's Brochure readiness for ${a.projectName ?? 'the open project'} (ICH E6(R3) Appendix A): ` +
      `${a.rows.length} section(s). ${r.counted} required section(s) need project data and ${r.ready} have all of it, ` +
      `so completeness is ${r.completeness}%. ${r.open} section(s) still lack data. ` +
      'Only this project’s recorded studies, safety records and Module 3 sections are counted; ' +
      'documents filed in its Vault are not.',
    facts: {
      totalSections: a.rows.length,
      sectionsNeedingProjectData: r.counted,
      sectionsWithAllData: r.ready,
      completenessPercent: r.completeness,
      openSections: r.open,
      sections: a.rows.slice(0, 24).map((sec) => ({
        number: sec.number, title: sec.title, required: sec.required,
        status: sec.status, gaps: sec.gaps ?? [], depth: sec.depth,
        needsProjectData: sec.needsData !== false,
      })),
    },
    availableActions: [
      'Draft an open IB section from the linked M2.4 / M2.5 / M2.7 summaries and integrated safety',
      'Read a section’s recorded gaps and what it still needs',
    ],
  };
}

/** One section: its number, title, what it is for, its verdict and what it still needs. */
function SectionRow({ s }: { s: IBSectionRow }) {
  const chip = sectionChip(s);
  return (
    <div
      data-ib-section={s.number}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '10px 14px', borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--bg-000)',
        marginLeft: s.depth * 22,
      }}
    >
      <span className="pg-mono" style={{ minWidth: 34, fontSize: 12, opacity: 0.7, paddingTop: 2 }}>
        {s.number}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: s.depth === 0 ? 600 : 500, fontSize: s.depth === 0 ? 14 : 13 }}>
            {s.title}
          </span>
          {!s.required && (
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, opacity: 0.55 }}>
              optional
            </span>
          )}
          <span className={`rd-chip tone-${chip.tone}`} style={{ marginLeft: 'auto' }}>{chip.label}</span>
        </div>
        {s.description && (
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 3 }}>{s.description}</div>
        )}
        {Array.isArray(s.gaps) && s.gaps.length > 0 && (
          <div style={{ fontSize: 12, marginTop: 6, color: 'var(--warning)' }}>
            Needs: {s.gaps.join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}

/** The project's readiness: the figure, each section, and what the figure counts. */
function ProjectReadiness({ rows, unread }: { rows: IBSectionRow[]; unread: number }) {
  const r = readinessOf(rows);
  return (
    <>
      {/* Completeness rollup */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          margin: '4px 0 18px', padding: '12px 16px',
          border: '1px solid var(--border)', borderRadius: 10,
          background: 'var(--bg-000)',
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{r.completeness}%</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>of the sections that need project data</div>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ height: 8, borderRadius: 6, background: 'var(--bg-200)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${r.completeness}%`, background: 'var(--success)' }} />
          </div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          {r.ready} of {r.counted} sections that need project data have it
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((s) => <SectionRow key={s.number} s={s} />)}
      </div>

      <div className="scaf-note" style={{ marginTop: 18, maxWidth: 760 }}>
        A section is <b>Ready</b> when this project holds every kind of data it needs, <b>Partial</b> when it holds some, and <b>Missing inputs</b> when it holds none. What is counted: the project&rsquo;s recorded nonclinical and clinical studies, its adverse events and risk management plan, and its Module 3 sections. Documents filed in the project&rsquo;s Vault are not counted. AnA drafts the open sections from the linked summaries and never invents results.
        {unread > 0 && (
          <> {unread === 1
            ? 'One study register in this workspace does not record which project a study belongs to, so it is not counted here.'
            : `${unread} registers in this workspace do not record which project a record belongs to, so they are not counted here.`}</>
        )}
      </div>
    </>
  );
}

/** What stands in for the readiness when there is none to show: no project, a read in flight, a failed read, no rows. */
function ReadinessState({ programId, loading, error, onNav }: {
  programId: string | null; loading: boolean; error?: string; onNav: (id: string) => void;
}) {
  if (!programId) {
    return (
      <EmptyState
        icon={I.fileText}
        title={'Open a project to see its Investigator’s Brochure readiness'}
        hint="Readiness is worked out for one project, from its own recorded studies, safety records and Module 3 sections."
        action={{ label: 'Open Projects', onAct: () => onNav('projects') }}
      />
    );
  }
  if (loading) {
    return <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading IB section structure…</div>;
  }
  if (error) {
    return (
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title={'Couldn’t load the Investigator’s Brochure readiness'}
        hint={'The readiness of this project’s brochure could not be read, so no figure is shown.'}
      />
    );
  }
  return (
    <EmptyState
      icon={I.fileText}
      title="No Investigator's Brochure sections returned"
      hint="The IB section registry came back empty. Once the M2.4 nonclinical overview, M2.5/M2.7 clinical summaries, and integrated safety inputs are linked, the ICH E6(R3) Appendix A sections populate here with per-section readiness."
    />
  );
}

export function InvestigatorBrochure({ onAsk, onNav }: SurfaceViewProps) {
  /* The readiness is one project's. With none open there is nothing to read: the
     hook is given no path, so no request is made and no figure can be shown. */
  const programId = shellProgramId(useShellProject());
  const projectName = programId ? shellProgramName() : null;
  /* Fixture-free — the real persisted IB section tree, an honest error state, or
     an honest empty state. A project with nothing recorded gets the deterministic
     ICH E6(R3) Appendix A outline with each data-bearing section marked `missing`,
     so `rows` is real content, never a codebase fixture. */
  const { rows, loading, error, empty, meta } = useLiveRows<IBSectionRow>(
    programId ? `/api/investigator-brochure?programId=${encodeURIComponent(programId)}` : null,
  );
  const unread = Array.isArray(meta?.storesWithoutProject) ? meta.storesWithoutProject.length : 0;

  const anaContext = React.useMemo(
    () => ibAnaContext({ programId, projectName, loading, error, rows }),
    [programId, projectName, loading, error, rows],
  );
  usePublishSurfaceContext('investigator-brochure', anaContext);

  const shown = Boolean(programId) && !loading && !error && !empty;
  return (
    <div className="page-inner">
      <PageHead
        eyebrow="Project · IND authoring"
        title="Investigator's Brochure"
        sub={projectName
          ? `Which sections of the brochure for ${projectName} have the project data they need (ICH E6(R3) Appendix A).`
          : 'Which sections of a project’s brochure have the project data they need (ICH E6(R3) Appendix A).'}
        actions={programId ? (
          <button className="btn ghost" onClick={() => onAsk('Draft the open Investigator\'s Brochure sections from the linked M2.4 / M2.5 / M2.7 summaries and integrated safety.')}>
            {I.sparkles} Ask AnA
          </button>
        ) : undefined}
      />
      {shown
        ? <ProjectReadiness rows={rows} unread={unread} />
        : <ReadinessState programId={programId} loading={loading} error={error} onNav={onNav} />}
    </div>
  );
}

/**
 * New submission: the canonical submission record, started from the open
 * project's filing (docs/design/FILING_SPINE.md F20).
 *
 * The form opened on IND · FDA · Biotech for every project, a hard-coded
 * default, so an EMA MAA project's new submission started as a US IND. Now:
 *   - with a project open, the application type and region are the project's
 *     own (`program_type`, `primary_agency`, read from its record), and the
 *     client type is the open workspace's;
 *   - when that market already exists on the project, no region is
 *     preselected: a second submission in the same market is a choice;
 *   - a value the form does not offer is not guessed, and a record that could
 *     not be read preselects nothing and says so;
 *   - with no project open, nothing is preselected;
 *   - each region option carries what the platform can carry for that market,
 *     for the application type chosen, in the server's words (F19).
 *
 * The form waits for the project's record and its submissions before it
 * opens, because its defaults are fixed when it mounts.
 */
import React from 'react';
import { canonicalRegionOf } from '@shared/regulatory/region-identity';
import { C2CForm, type C2CFormField } from '../C2CForm';
import { useLiveData } from '../dataConnect';
import { useMarketSupport } from '../MarketSupportLine';
import { SC_APPTYPES, SC_REGIONS } from '../fixtures/submission';

/** The columns of GET /api/c2c/projects/:id this form reads. */
interface ProjectFiling {
  program_type?: string | null;
  primary_agency?: string | null;
  product_type?: string | null;
}

/** The submission region an agency names, when the form offers it; '' otherwise. */
export function scRegionForAgency(agency: string | null | undefined): string {
  const raw = String(agency ?? '').trim();
  if (!raw) return '';
  const code = canonicalRegionOf(raw) ?? canonicalRegionOf(raw.replace(/[\s-]+/g, '_'));
  const hit = code ? SC_REGIONS.find((r) => canonicalRegionOf(r.v) === code) : undefined;
  return hit ? hit.v : '';
}

/** The application type a program type names, when the form offers it; '' otherwise. */
export function scAppTypeFor(programType: string | null | undefined): string {
  const v = String(programType ?? '').trim().toLowerCase();
  return SC_APPTYPES.some((a) => a.v === v) ? v : '';
}

const WS_CLIENT_TYPE: Record<string, string> = { Pharma: 'pharma', Biotech: 'biotech', MDX: 'mdx' };
const PRODUCT_CLIENT_TYPE: Record<string, string> = { device: 'mdx', ivd: 'ivd' };

export interface NewSubmissionDefaults { applicationType: string; primaryRegion: string; clientType: string }

/** The form's starting values, from the project's record and its submissions. */
export function newSubmissionDefaults(
  project: ProjectFiling | null,
  workspace: string | null | undefined,
  existing: ReadonlyArray<{ applicationType: string; primaryRegion: string }>,
  /** The project's submissions could not be read, so whether the market exists is unknown. */
  existingUnread = false,
): NewSubmissionDefaults {
  if (!project) return { applicationType: '', primaryRegion: '', clientType: '' };
  const applicationType = scAppTypeFor(project.program_type);
  const region = scRegionForAgency(project.primary_agency);
  const marketExists = !!region && existing.some(
    (s) => s.primaryRegion === region && String(s.applicationType).toLowerCase() === (applicationType || String(project.program_type ?? '').toLowerCase()),
  );
  const clientType = WS_CLIENT_TYPE[workspace ?? ''] ?? PRODUCT_CLIENT_TYPE[String(project.product_type ?? '').toLowerCase()] ?? '';
  return { applicationType, primaryRegion: marketExists || existingUnread ? '' : region, clientType };
}

/** What the region field says about its options, from the state of the read. */
function regionDescFor(appType: string, loading: boolean, failed: boolean, markets: number | null): string {
  if (!appType) return 'Choose an application type to see what the platform can carry for each region.';
  if (loading || (markets === null && !failed)) return 'Checking what the platform can carry for each region…';
  if (failed || !markets) return 'What the platform can carry for each region could not be read.';
  return 'Each region says what the platform can carry for that market and application type.';
}

/** Why a default is missing, said inside the drawer. */
function noticeFor(projectUnread: boolean, submissionsUnread: boolean): string | undefined {
  if (projectUnread) return 'The project record could not be read, so nothing is preselected. Choose the application type and region.';
  if (submissionsUnread) {
    return "This project's submissions could not be read, so no region is preselected: whether that market already exists is not known.";
  }
  return undefined;
}

/** The form's fields, with each region option labelled by the server's statement. */
function submissionFields(
  defaults: NewSubmissionDefaults,
  summaryFor: (v: string) => string | null,
  regionDesc: string,
  openProjectName: string | null,
  programmes: ReadonlyArray<{ id: string; title: string; code: string }>,
): C2CFormField[] {
  return [
    { key: 'title', label: 'Title', type: 'text', placeholder: 'e.g. BX-701 — Initial IND', required: true },
    {
      key: 'applicationType', label: 'Application type', type: 'select',
      // The canonical vocabulary the rest of this surface renders, including
      // the non-US applications (MAA, CTA) a global team opens as a second market.
      options: SC_APPTYPES.map((a) => ({ value: a.v, label: a.l })),
      default: defaults.applicationType, required: true,
    },
    {
      key: 'primaryRegion', label: 'Primary region', type: 'select',
      options: SC_REGIONS.map((r) => {
        const summary = summaryFor(r.v);
        return { value: r.v, label: summary ? `${r.l} · ${summary}` : r.l };
      }),
      // Full width: the option carries the market's statement (F19), and its
      // last clause ("no channel") is the part a half-width select would clip.
      default: defaults.primaryRegion, required: true,
      desc: regionDesc,
    },
    {
      key: 'clientType', label: 'Client type', type: 'select',
      options: [
        { value: 'pharma', label: 'Pharma' },
        { value: 'biotech', label: 'Biotech' },
        { value: 'mdx', label: 'Medical device' },
        { value: 'ivd', label: 'IVD' },
      ],
      default: defaults.clientType, required: true, half: true,
    },
    /* With a project open the submission is that project's: it is named
       here, read-only, and there is no picker. */
    openProjectName
      ? { key: 'project', label: 'Project', type: 'text', half: true, derive: () => openProjectName }
      : {
          key: 'projectId', label: 'Programme', type: 'select',
          options: programmes.map((p) => ({ value: p.id, label: [p.code, p.title].filter(Boolean).join(' · ') || p.id })),
          required: true, half: true,
        },
  ];
}

/** The open project's record, read once, and the form's defaults from it. */
function useProjectFiling(
  openProgramId: string | null,
  workspace: string | null | undefined,
  projectSubmissions: ReadonlyArray<{ applicationType: string; primaryRegion: string }>,
  submissionsUnread: boolean,
) {
  const project = useLiveData<ProjectFiling>(openProgramId ? `/api/c2c/projects/${openProgramId}` : null, [openProgramId]);
  const settled = !openProgramId || !project.loading;
  const unread = !!openProgramId && settled && (!!project.error || !project.data);
  const defaults = newSubmissionDefaults(openProgramId && !unread ? project.data : null, workspace, projectSubmissions, submissionsUnread);
  return { settled, unread, defaults };
}

/** Each region's statement for the application type chosen (F19), and what the field says about them. */
function useRegionStatements(appType: string) {
  const support = useMarketSupport(appType || null);
  /* Only a statement for the type now chosen labels the options: while a new
     type is read, the previous type's statements are not shown under it. */
  const current = support.data?.applicationType === appType ? support.data : null;
  const summaryFor = (v: string): string | null =>
    current?.markets?.find((m) => m.region === canonicalRegionOf(v))?.summary ?? null;
  const regionDesc = regionDescFor(appType, support.loading, !!support.error, current?.markets?.length ?? null);
  return { summaryFor, regionDesc };
}

export function NewSubmissionForm({
  openProgramId,
  openProjectName,
  workspace,
  projectSubmissions,
  submissionsSettled,
  submissionsUnread,
  programmes,
  creating,
  onCancel,
  onSubmit,
}: {
  openProgramId: string | null;
  openProjectName: string | null;
  workspace: string | null | undefined;
  projectSubmissions: ReadonlyArray<{ applicationType: string; primaryRegion: string }>;
  /** False while the project's submissions are still being read. */
  submissionsSettled: boolean;
  /** The project's submissions could not be read. */
  submissionsUnread: boolean;
  programmes: ReadonlyArray<{ id: string; title: string; code: string }>;
  creating: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const filing = useProjectFiling(openProgramId, workspace, projectSubmissions, submissionsUnread);
  const [chosenType, setChosenType] = React.useState<string | null>(null);
  const appType = chosenType ?? filing.defaults.applicationType;
  const { summaryFor, regionDesc } = useRegionStatements(appType);

  /* The defaults are fixed when the form mounts, so it opens once both reads
     have settled. After that it stays mounted: a later re-read cannot take
     away what has been typed. */
  const settledOnce = React.useRef(false);
  if (filing.settled && (!openProgramId || submissionsSettled)) settledOnce.current = true;
  if (!settledOnce.current) {
    return <div role="status" aria-busy="true" className="scaf-note">Reading the open project…</div>;
  }
  const notice = noticeFor(filing.unread, submissionsUnread);

  const fields = submissionFields(filing.defaults, summaryFor, regionDesc, openProjectName, programmes);

  return (
    <C2CForm
      config={{
        eyebrow: 'Submission',
        title: 'Create a submission',
        sub: 'The canonical submission record. Its sequences, validation profile and regional Module 1 are derived from the type and agency chosen here.',
        submitLabel: creating ? 'Creating…' : 'Create submission',
        fields,
        notice,
      }}
      onCancel={onCancel}
      onSubmit={onSubmit}
      onFieldChange={(key, value) => { if (key === 'applicationType') setChosenType(value); }}
    />
  );
}

/**
 * The CMC change-control register (cmc_change_control), split out of cmcRegisters.tsx so that file stays under the
 * repository's 100 kB ceiling (2026-11-10, P-122). It is the same register: RegisterCard, its helpers and its forms
 * come from where they always lived.
 */
import { I } from '../icons';
import { RegisterCard, chip, fmtDate, riskChip, text } from './cmcRegisters';
import { changeControlForm, changeControlBody } from './cmcRegisterForms';

/* ═══════════ Change control — GET /api/cmc/change-control ═══════════ */

export interface ChangeControlApiRow {
  id: number;
  changeNumber: string;
  changeType: string | null;
  description: string | null;
  justification?: string | null;
  regulatoryFiling: string | null;
  status: string | null;
  riskAssessment?: { level?: string } | null;
  impactAssessment?: { summary?: string; impactedSections?: string[] } | null;
  implementationDate?: string | null;
}

/** An API change row → the edit form's defaults. */
function changeDefaults(r: ChangeControlApiRow) {
  return {
    changeNumber: r.changeNumber ?? '',
    changeType: r.changeType ?? '',
    description: r.description ?? '',
    justification: r.justification ?? '',
    regulatoryFiling: r.regulatoryFiling ?? '',
    status: r.status ?? 'draft',
    riskAssessment: { level: r.riskAssessment?.level ?? 'medium' },
    impactAssessment: {
      summary: r.impactAssessment?.summary,
      impactedSections: r.impactAssessment?.impactedSections ?? [],
    },
    implementationDate: r.implementationDate ?? undefined,
  };
}

/**
 * The changes actually logged for the organization (cmc_change_control).
 * The simulator alongside this computes a what-if filing path over canonical
 * SUPAC / ICH Q12 rules; this is the real register behind it.
 */
export function CmChangeRegister() {
  const CLOSED = ['approved', 'implemented', 'closed', 'rejected'];
  return (
    <RegisterCard<ChangeControlApiRow>
      path="/api/cmc/change-control"
      title="Change-control register"
      meta={(rows) => {
        const open = rows.filter((r) => !CLOSED.includes(String(r.status || '').toLowerCase())).length;
        return `organization-wide — ${open} open — ICH Q12`;
      }}
      icon={I.gitBranch}
      loadingTitle="Loading change-control records…"
      emptyTitle="No change-control records yet"
      emptyHint="Logged CMC changes — with their type, filing category and status — appear here. Use the simulator above to model a change, then Raise change to put it under control."
      errorTitle="Couldn’t load change-control records"
      errorHint="The org-scoped change-control register didn’t load. Sign in and try again."
      rowKey={(r) => r.id}
      create={{
        label: 'Raise change',
        subject: 'change record',
        path: '/api/cmc/change-control',
        form: () => changeControlForm(null),
        toBody: (v, projectId) => changeControlBody(v, projectId),
      }}
      rowActions={[
        {
          label: 'Update',
          subject: 'change record',
          form: (r) => changeControlForm(changeDefaults(r)),
          path: (r) => `/api/cmc/change-control/${r.id}`,
          toBody: (v, _r, projectId) => changeControlBody(v, projectId),
        },
      ]}
      columns={[
        { header: 'Change', render: (r) => r.changeNumber, mono: true, bold: true },
        { header: 'Type', render: (r) => text(r.changeType) },
        { header: 'Description', render: (r) => text(r.description) },
        { header: 'Risk', render: (r) => riskChip(r.riskAssessment?.level) },
        { header: 'Filing', render: (r) => (r.regulatoryFiling ? r.regulatoryFiling : <span className="cm-meta">not set</span>) },
        { header: 'Implementation', render: (r) => fmtDate(r.implementationDate) },
        { header: 'Status', render: (r) => chip(r.status, 'draft') },
      ]}
    />
  );
}

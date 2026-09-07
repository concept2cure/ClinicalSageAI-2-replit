/**
 * GeneratorTab — the CER workbench's hero tab: the Article 61 section
 * inventory, the MEDDEV 2.7/1 structure check, and the governed export
 * actions.
 *
 *   · Sections — the program's live cerv2 sections (same feed as the 510(k)
 *     eSTAR list; the legacy table spans all pathways), with CSV export.
 *   · Structure check — maps authored sections onto the canonical CER
 *     structure and POSTs /api/submissions/device/cer/assess for the server's
 *     deterministic verdict; missing required sections are listed verbatim.
 *   · Export — POST /api/cerv2/export/pdf|docx|zip assembles the document
 *     from the org's REAL authored sections server-side. The human-review
 *     attestation is honest input: unchecked stays unchecked, and a
 *     production server's 403 refusal is shown, not worked around.
 *   · Draft with AnA — the (previously dead) button now routes a concrete
 *     drafting request into the shell's AnA conversation, with counts drawn
 *     from live data instead of the old hard-coded "4 signals · 412 hits".
 */

import * as React from 'react';
import { I } from '../../icons';
import { EmptyState } from '../../../v2/dataConnect';
import { AskAnaChip } from '../AskAnaChip';
import { AnaDraftBanner } from '../../components/AnaDraftBanner';
import { CER_EXPORT } from '../../data/cer';
import type { EstarRow } from '../../data/k510';
import type { Program } from '../../data/programs';
import type { DeviceProfileView } from '../../hooks/useDeviceProfile';
import { useCerExport, type CerExportFormat } from '../../hooks/useCerExport';
import {
  assessCerStructure,
  matchPresentSectionIds,
  useCerStructure,
  type CerStructureAssessment,
} from '../../hooks/useCerStructure';
import { readEquivalentDevices } from './EquivalenceTab';
import { SampleDataBanner } from '../../components/SampleDataBanner';
import { useSampleMode } from '../../components/DataGate';
import { useSampleRows } from '../../lib/useSampleRows';
import type { EditorSectionRef } from '../../../v2/editorTarget';
import { downloadCsv } from '../../../v2/download';

export interface GeneratorTabProps {
  program: Program | null;
  sections: EstarRow[] | null;
  sectionsLoading: boolean;
  sectionsError: string | null;
  /** Re-fetch the section list — called after an AnA draft is accepted so
   *  the AnaDraftBanner affordance disappears. */
  refreshSections: () => void;
  /** Live counts for the drafting plan; 0 when nothing is loaded. */
  includedSignalCount: number;
  literatureTotal: number;
  profile: DeviceProfileView | null;
  onAskAna: (text: string) => void;
  /** Open the one document editor on this section. Code + label travel so the
   *  editor can select the matching authored section — or say honestly that
   *  it holds no such section yet. Absent → the affordance is not drawn (a
   *  button that navigates and claims nothing is the defect this fixes). */
  onOpenEditor?: (section?: EditorSectionRef) => void;
}

function downloadSectionsCsv(rows: Array<{ label: string; status: string }>) {
  const headers = ['Section', 'Status'];
  downloadCsv(
    `cer-sections-${new Date().toISOString().slice(0, 10)}.csv`,
    headers,
    rows.map((s) => [s.label, String(s.status)]),
  );
}

export function GeneratorTab({
  program,
  sections,
  sectionsLoading,
  sectionsError,
  refreshSections,
  includedSignalCount,
  literatureTotal,
  profile,
  onAskAna,
  onOpenEditor,
}: GeneratorTabProps) {
  const sampleOn = useSampleMode();
  const structure = useCerStructure();
  const { busy: exportBusy, outcome: exportOutcome, exportCer } = useCerExport();

  const [reviewed, setReviewed] = React.useState(false);
  const [reviewerName, setReviewerName] = React.useState('');
  const [equivalenceClaimed, setEquivalenceClaimed] = React.useState<boolean | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [assessment, setAssessment] = React.useState<CerStructureAssessment | null>(null);
  const [assessError, setAssessError] = React.useState<string | null>(null);

  const sourceSections = useSampleRows(
    sections,
    CER_EXPORT.map((s, i) => ({ id: i + 1, label: s.label, status: s.status as never, blocker: false })),
  );
  const usingSampleSections = sampleOn && (sections === null || sections.length === 0) && sourceSections.length > 0;

  /* Default the equivalence claim to what the program record actually says. */
  const equivDefault = readEquivalentDevices(profile).length > 0;
  const equivClaimed = equivalenceClaimed ?? equivDefault;

  const titleById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const s of structure.sections ?? []) map.set(s.id, `${s.number}. ${s.title}`);
    return map;
  }, [structure.sections]);

  async function onStructureCheck() {
    if (checking || !structure.sections) return;
    setChecking(true);
    setAssessError(null);
    const present = matchPresentSectionIds(sections ?? [], structure.sections);
    const result = await assessCerStructure(present, equivClaimed);
    setChecking(false);
    if (!result) {
      setAssessment(null);
      setAssessError('Structure check failed — the server could not be reached');
      return;
    }
    setAssessment(result);
  }

  async function onExport(format: CerExportFormat) {
    if (!program || exportBusy) return;
    await exportCer(
      { id: program.id, code: program.code, title: program.title },
      format,
      { humanReviewApproved: reviewed, reviewerName: reviewed ? reviewerName : undefined },
    );
  }

  const exportStatus = exportBusy
    ? 'Assembling the export from your authored sections…'
    : exportOutcome
      ? exportOutcome.ok
        ? // "Exported" was said whether or not the file reached the browser.
          // Whether the server placed it in the registry and whether the user
          // actually received it are two different facts, and both are reported.
          !exportOutcome.delivered
          ? exportOutcome.filename
            ? `${exportOutcome.filename} was produced but the browser blocked the download`
            : 'Export accepted, but the server returned no file to download'
          : exportOutcome.governed
            ? `Exported ${exportOutcome.filename ?? 'document'} — placed in the artifact registry`
            : `Exported ${exportOutcome.filename ?? 'document'} — delivered and audit-logged; ` +
              'registry placement is pending the document-identity contract'
        : `Export refused — ${exportOutcome.error}`
      : null;

  const structureStatus = checking
    ? 'Checking the CER structure…'
    : assessError
      ? assessError
      : assessment
        ? assessment.ready
          ? `All ${assessment.totalRequired} required sections matched (${assessment.presentCount} present)`
          : `${assessment.missingRequiredSections.length} required section${assessment.missingRequiredSections.length === 1 ? '' : 's'} missing · ${assessment.presentCount} of ${assessment.totalRequired} present`
        : structure.error
          ? `Canonical CER structure unavailable — ${structure.error}`
          : null;

  return (
    <>
      <SampleDataBanner show={usingSampleSections} loading={sectionsLoading} label="CER sections" />
      <div className="col2">
        <div>
          {/* ── Structure check ── */}
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Structure check · MEDDEV 2.7/1 Rev 4</div>
                <div className="s">
                  Maps your authored sections onto the canonical CER structure — deterministic, no
                  content is judged
                </div>
              </div>
              <div className="actions" style={{ display: 'flex', gap: 8 }}>
                <button
                  className="section-more"
                  disabled={checking || !structure.sections}
                  title={
                    structure.sections
                      ? 'Run the canonical structure gap check'
                      : 'Canonical structure not loaded yet'
                  }
                  onClick={() => void onStructureCheck()}
                >
                  {checking ? 'Checking…' : 'Run structure check'}
                </button>
                <button
                  className="section-more"
                  title="Have AnA run the assessment with assess_device_evidence_structure and walk the gaps with you"
                  onClick={() =>
                    onAskAna(
                      `Run a CER structure assessment for ${program ? program.title : 'this program'} with ` +
                        'assess_device_evidence_structure' +
                        (equivClaimed ? ' (equivalence is claimed)' : '') +
                        ' and propose how to close each missing required section.',
                    )
                  }
                >
                  Assess with AnA {I.sparkles}
                </button>
              </div>
            </div>
            <div className="panel-body pad">
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-200)' }}>
                <input
                  type="checkbox"
                  checked={equivClaimed}
                  onChange={(e) => setEquivalenceClaimed(e.target.checked)}
                />
                Equivalence claimed — Article 61(5) makes the equivalence section required
              </label>
              {structureStatus && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{ fontSize: 12, color: 'var(--text-200)', marginTop: 8 }}
                >
                  {structureStatus}
                </div>
              )}
              {assessment && assessment.missingRequiredSections.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-300)', lineHeight: 1.6 }}>
                  {assessment.missingRequiredSections.map((id) => (
                    <li key={id}>
                      Missing: {titleById.get(id) ?? id}
                    </li>
                  ))}
                </ul>
              )}
              {assessment && assessment.sectionsNeedingClinicalData.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-400)', marginTop: 8, lineHeight: 1.5 }}>
                  Needs clinical-data substantiation (present, confirm the evidence):{' '}
                  {assessment.sectionsNeedingClinicalData
                    .map((id) => titleById.get(id) ?? id)
                    .join(' · ')}
                </div>
              )}
            </div>
          </div>

          {/* ── Export ── */}
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Export</div>
                <div className="s">
                  Assembled server-side from your authored sections · governed export with audit
                  trail
                </div>
              </div>
            </div>
            <div className="panel-body pad">
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: 'var(--text-200)', lineHeight: 1.5 }}>
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  A human has reviewed the assembled content. Production exports are refused
                  without this attestation.
                </span>
              </label>
              {reviewed && (
                <label style={{ display: 'block', marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-300)', display: 'block', marginBottom: 3 }}>
                    Reviewer name
                  </span>
                  <input
                    value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value)}
                    placeholder="Who reviewed this content"
                    style={{
                      width: '100%',
                      maxWidth: 280,
                      fontSize: 12,
                      padding: '5px 8px',
                      background: 'var(--bg-050)',
                      border: '1px solid var(--border-control)',
                      borderRadius: 6,
                      color: 'var(--text-200)',
                    }}
                  />
                </label>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {(['pdf', 'docx', 'zip'] as CerExportFormat[]).map((format) => (
                  <button
                    key={format}
                    className="section-more"
                    disabled={!program || exportBusy}
                    title={
                      program
                        ? `Export the CER as ${format.toUpperCase()} — assembled from your authored sections`
                        : `Export is available once a program is open`
                    }
                    onClick={() => void onExport(format)}
                  >
                    Export {format.toUpperCase()} {I.download}
                  </button>
                ))}
              </div>
              {exportStatus && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{ fontSize: 11, color: 'var(--text-300)', marginTop: 8, lineHeight: 1.5 }}
                >
                  {exportStatus}
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          {/* ── Sections ── */}
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">CER sections</div>
                <div className="s">
                  {sectionsLoading
                    ? 'Loading sections…'
                    : sectionsError
                      ? `Sections unavailable — ${sectionsError}`
                      : `Article 61 template · ${sourceSections.length} section${sourceSections.length === 1 ? '' : 's'}`}
                </div>
              </div>
              <div className="actions">
                <button
                  className="tb-btn"
                  title="Export CER section status as CSV"
                  onClick={() => downloadSectionsCsv(sourceSections)}
                >
                  {I.download}
                </button>
              </div>
            </div>
            {sections !== null && sections.length === 0 && !usingSampleSections ? (
              /* No CTA and nothing to press. The panel named the thing that
                 would fix it — scaffolding the document — and left the reader
                 to find it. `refreshSections` is already a prop on this
                 component, so a real control was one line away the whole time.
                 It is the weaker of the two possible actions (re-read rather
                 than scaffold), and it is a real one. */
              <EmptyState
                icon={I.fileText}
                title="No CER sections created yet"
                hint="Sections appear here once the document is scaffolded for this program."
                action={{ label: 'Check again', onAct: refreshSections }}
                regulation="Serves the clinical evaluation report (MDR Annex XIV Part A)"
                testId="cer-no-sections"
              />
            ) : (
              <div className="estar">
                {sourceSections.map((s, i) => (
                  <React.Fragment key={s.id}>
                    <div className="estar-row">
                      <div className="estar-num">{String(i + 1).padStart(2, '0')}</div>
                      <div className="estar-label">
                        {s.label}
                        {/* Drafting flows through AnA: she writes the section via
                            write_kit_section, the draft surfaces on this row as an
                            AnaDraftBanner, and acceptance goes through the governed
                            accept round trip. */}
                        <AskAnaChip
                          onAsk={() =>
                            onAskAna(
                              `Draft the "${s.label}" section of the CER for ${program ? program.title : 'this program'} ` +
                                'with write_kit_section — ground it in the included safety signals and the literature corpus, ' +
                                'and mark every evidence gap in the text rather than papering over it.',
                            )
                          }
                          label={`Draft ${s.label} with AnA`}
                        />
                      </div>
                      {/* One flex cell for status + editor hand-off: .estar-row is a
                          3-column grid, so a 4th direct child would wrap to its own
                          row instead of sitting beside the pill. */}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span className={`status-pill ${s.status}`}>{s.status}</span>
                        {onOpenEditor && (
                          <button
                            className="tb-btn"
                            title={`Open “${s.label}” in the document editor`}
                            aria-label={`Open ${s.label} in the document editor`}
                            onClick={() => onOpenEditor({ code: s.id, label: s.label })}
                          >
                            {I.edit}
                          </button>
                        )}
                      </span>
                    </div>
                    {s.draft ? (
                      <AnaDraftBanner draft={s.draft} onAccepted={refreshSections} />
                    ) : null}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          {/* ── Drafting plan ── */}
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Drafting plan</div>
                <div className="s">AnA drafts from included signals and the literature corpus</div>
              </div>
            </div>
            <div className="panel-body pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-200)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--text-400)', flexShrink: 0 }}>{I.sparkles}</span>
                <span>
                  Generate <b>Clinical data summary</b>
                  {includedSignalCount > 0 || literatureTotal > 0
                    ? ` from ${includedSignalCount} included signal${includedSignalCount === 1 ? '' : 's'} and ${literatureTotal.toLocaleString()} literature hit${literatureTotal === 1 ? '' : 's'}`
                    : ' once signals and literature are connected'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-200)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--text-400)', flexShrink: 0 }}>{I.sparkles}</span>
                <span>
                  Draft <b>Safety and risk-benefit</b> from the adjudicated signal register
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-200)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--text-400)', flexShrink: 0 }}>{I.sparkles}</span>
                <span>
                  Complete <b>PMS plan</b> from the post-market documentation set
                </span>
              </div>
              <button
                style={{
                  marginTop: 6,
                  padding: '8px 14px',
                  background: 'var(--accent-100)',
                  color: 'var(--text-000)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 12,
                  fontWeight: 500,
                  alignSelf: 'flex-start',
                }}
                onClick={() =>
                  onAskAna(
                    `Draft the CER for ${program ? program.title : 'this program'} — pull from the included safety signals` +
                      (includedSignalCount > 0 ? ` (${includedSignalCount})` : '') +
                      ', the literature corpus' +
                      (literatureTotal > 0 ? ` (${literatureTotal.toLocaleString()} hits)` : '') +
                      ', and the recorded equivalence data. Mark every gap in narrative form.',
                  )
                }
              >
                Draft with AnA
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

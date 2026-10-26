/**
 * EquivalenceTab — Article 61(5) equivalence, rendered from the ONLY
 * equivalence data the backend holds today: the program row's
 * equivalent_devices json (read through GET /api/510k/device/profile, which
 * returns the org-scoped regulatory_programs row). Read-only by necessity —
 * the profile PUT does not accept equivalentDevices and no per-criterion
 * matrix backend exists; the tab says so instead of simulating one.
 *
 * (The kit's example device cards and MDCG 2020-5 matrix, CER_EQUIV_DEVICES
 * and CER_EQUIV_MATRIX, were removed with sample mode on 2026-10-14.)
 */

import * as React from 'react';
import { AskAnaChip } from '../AskAnaChip';
import type { DeviceProfileView } from '../../hooks/useDeviceProfile';
import { I } from '../../icons';
import { EmptyState } from '../../../v2/dataConnect';

/** The equivalent_devices json element shape (shared/schema/programs.ts). */
export interface ProgramEquivalentDevice {
  id?: string;
  name?: string;
  manufacturer?: string;
  ceMarkNumber?: string;
  technicalEquivalence?: string;
  biologicalEquivalence?: string;
  clinicalEquivalence?: string;
}

export function readEquivalentDevices(profile: DeviceProfileView | null): ProgramEquivalentDevice[] {
  const raw = (profile as unknown as { equivalentDevices?: unknown })?.equivalentDevices;
  if (!Array.isArray(raw)) return [];
  return raw.filter((d): d is ProgramEquivalentDevice => !!d && typeof d === 'object');
}

export interface EquivalenceTabProps {
  profile: DeviceProfileView | null;
  profileLoading: boolean;
  profileError: string | null;
  programTitle: string | null;
  onAskAna: (text: string) => void;
}

const DIMENSIONS: Array<{ key: keyof ProgramEquivalentDevice; label: string }> = [
  { key: 'technicalEquivalence', label: 'Technical' },
  { key: 'biologicalEquivalence', label: 'Biological' },
  { key: 'clinicalEquivalence', label: 'Clinical' },
];

const verdictPill: Record<string, string> = {
  equivalent: 'complete',
  similar: 'review',
  different: 'blocked',
};

export function EquivalenceTab({
  profile,
  profileLoading,
  profileError,
  programTitle,
  onAskAna,
}: EquivalenceTabProps) {
  const devices = readEquivalentDevices(profile);

  const summary = profileLoading
    ? 'Loading the project’s device profile…'
    : profileError
      ? `Device profile unavailable — ${profileError}`
      : devices.length > 0
        ? `${devices.length} claimed equivalent device${devices.length === 1 ? '' : 's'} on the project record · read-only`
        : 'No equivalent devices recorded on this project';

  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">Equivalence · Article 61(5)</div>
          <div className="section-sub" role="status" aria-live="polite">{summary}</div>
        </div>
        <button
          className="section-more"
          onClick={() =>
            onAskAna(
              `Draft the MDCG 2020-5 equivalence rationale for ${programTitle ?? 'this project'} ` +
                'across the technical, biological and clinical dimensions — write the equivalence section ' +
                'with write_kit_section and flag every gap in the narrative.',
            )
          }
        >
          Draft equivalence rationale with AnA
        </button>
      </div>

      {devices.length > 0 && (
        <div className="panel">
          <div className="panel-hdr">
            <div>
              <div className="t">Claimed equivalent devices</div>
              {/* Was: "From the program record (equivalent_devices) · editing
                  requires the programs API — the device-profile form does not
                  write this field yet." Three implementation facts, none of
                  them actionable by the reader, on a panel a notified body's
                  reviewer may be looking at. The fact that MATTERS to them is
                  that this view is read-only, and that survives. */}
              <div className="s">
                Read-only — this view shows the claim recorded on the program and does not edit it
              </div>
            </div>
          </div>
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Device</th>
                  <th style={{ width: '18%' }}>Manufacturer</th>
                  <th style={{ width: '12%' }}>CE mark</th>
                  <th>Equivalence narrative (technical · biological · clinical)</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d, i) => (
                  <tr key={d.id ?? i}>
                    <td>
                      <div className="k-name" style={{ fontWeight: 500, fontSize: 12 }}>
                        {d.name || 'Unnamed device'}
                      </div>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-300)' }}>{d.manufacturer || '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-300)' }}>{d.ceMarkNumber || '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-300)', lineHeight: 1.5 }}>
                      {DIMENSIONS.map(({ key, label }) => (
                        <div key={key}>
                          <b style={{ color: 'var(--text-200)', fontWeight: 500 }}>{label}:</b>{' '}
                          {(d[key] as string) || 'not recorded'}
                        </div>
                      ))}
                      <AskAnaChip
                        onAsk={() =>
                          onAskAna(
                            `Assess equivalence between ${programTitle ?? 'the subject device'} and ${
                              d.name ?? 'the claimed equivalent'
                            } per MDCG 2020-5 — technical, biological and clinical.`,
                          )
                        }
                        label={`Ask AnA about ${d.name ?? 'this device'}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {devices.length === 0 && !profileLoading && (
        <div className="panel">
          {/* The copy here named a JSON column and an API endpoint —
              "equivalent_devices via the programs API" — on screen, to a
              regulatory reviewer. That is the information-disclosure class
              guardrail, not a wording preference: the reader cannot act on
              either name, and both describe the implementation rather than the
              record.
              No CTA, deliberately. The tab is read-only by necessity (the
              profile PUT does not accept equivalentDevices and no per-criterion
              matrix backend exists), so a button here would be a control that
              cannot do the thing it names. The panel says where the claim is
              actually kept instead. */}
          <EmptyState
            icon={I.fileText}
            title="No equivalence claim recorded"
            hint="Equivalent devices are recorded on the device profile for this project. This tab reads that record; it does not edit it."
            regulation="Serves the MDR Annex XIV Part A clinical evaluation, MDCG 2020-5 equivalence"
            testId="equivalence-empty"
          />
        </div>
      )}

    </>
  );
}

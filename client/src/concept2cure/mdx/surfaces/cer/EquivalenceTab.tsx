/**
 * EquivalenceTab — Article 61(5) equivalence, rendered from the ONLY
 * equivalence data the backend holds today: the program row's
 * equivalent_devices json (read through GET /api/510k/device/profile, which
 * returns the org-scoped regulatory_programs row). Read-only by necessity —
 * the profile PUT does not accept equivalentDevices and no per-criterion
 * matrix backend exists; the tab says so instead of simulating one.
 *
 * The kit's device cards + MDCG 2020-5 matrix fixtures render ONLY under the
 * explicit sample-mode guard, and only when the program has no recorded
 * equivalent devices.
 */

import * as React from 'react';
import { AskAnaChip } from '../AskAnaChip';
import {
  CER_EQUIV_DEVICES,
  CER_EQUIV_MATRIX,
} from '../../data/cer';
import type { DeviceProfileView } from '../../hooks/useDeviceProfile';
import { SampleDataBanner } from '../../components/SampleDataBanner';
import { useSampleMode } from '../../components/DataGate';

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
  const sampleOn = useSampleMode();
  const devices = readEquivalentDevices(profile);
  const usingSample = sampleOn && devices.length === 0 && !profileLoading;

  const summary = profileLoading
    ? 'Loading the program’s device profile…'
    : profileError
      ? `Device profile unavailable — ${profileError}`
      : devices.length > 0
        ? `${devices.length} claimed equivalent device${devices.length === 1 ? '' : 's'} on the program record · read-only`
        : 'No equivalent devices recorded on this program';

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
              `Draft the MDCG 2020-5 equivalence rationale for ${programTitle ?? 'this program'} ` +
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
              <div className="s">
                From the program record (equivalent_devices) · editing requires the programs API —
                the device-profile form does not write this field yet
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

      {devices.length === 0 && !usingSample && !profileLoading && (
        <div className="panel">
          <div
            role="status"
            style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text-300)' }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-200)', marginBottom: 4 }}>
              No equivalence claim recorded
            </div>
            Record claimed equivalent devices on the program (equivalent_devices via the programs
            API) to populate this view. A per-criterion equivalence matrix backend does not exist
            yet — until it does, this tab reads the program record only.
          </div>
        </div>
      )}

      <SampleDataBanner show={usingSample} loading={profileLoading} label="equivalence matrix" />
      {usingSample && <SampleEquivalenceMatrix onAskAna={onAskAna} />}
    </>
  );
}

/** The kit's MDCG 2020-5 example matrix — reachable only in sample mode. */
function SampleEquivalenceMatrix({ onAskAna }: { onAskAna: (text: string) => void }) {
  const [eqDevice, setEqDevice] = React.useState('eqA');
  const subject = CER_EQUIV_DEVICES[0];
  const eqDef = CER_EQUIV_DEVICES.find((d) => d.id === eqDevice) ?? CER_EQUIV_DEVICES[1];

  const dims = CER_EQUIV_MATRIX.reduce<Record<string, typeof CER_EQUIV_MATRIX>>((acc, r) => {
    (acc[r.dim] = acc[r.dim] || []).push(r);
    return acc;
  }, {});

  return (
    <div className="panel">
      <div className="panel-hdr">
        <div>
          <div className="t">
            Sample conformity matrix · {subject.label} vs {eqDef.label}
          </div>
          <div className="s">MDCG 2020-5 · all three dimensions must be conform</div>
        </div>
        <div className="actions" style={{ display: 'flex', gap: 6 }}>
          {CER_EQUIV_DEVICES.filter((d) => d.id !== 'subj').map((d) => (
            <button
              key={d.id}
              className={`audit-filter ${eqDevice === d.id ? 'active' : ''}`}
              aria-pressed={eqDevice === d.id}
              onClick={() => setEqDevice(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="tbl-scroll">
        {Object.entries(dims).map(([dim, rows]) => (
          <div key={dim}>
            <div
              style={{
                padding: '10px 16px 4px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-300)',
                letterSpacing: '0.02em',
              }}
            >
              {dim}
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Criterion</th>
                  <th style={{ width: '14%' }}>Verdict</th>
                  <th>Justification</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const verdict = r.verdicts[eqDevice];
                  return (
                    <tr key={`${dim}-${i}`}>
                      <td>
                        <div className="k-name" style={{ fontWeight: 400, fontSize: 12 }}>
                          {r.crit}
                        </div>
                      </td>
                      <td>
                        <span className={`status-pill ${verdictPill[verdict] ?? 'draft'}`}>{verdict}</span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-300)', lineHeight: 1.5 }}>
                        {r.notes[eqDevice]}
                        {verdict !== 'equivalent' && (
                          <AskAnaChip
                            onAsk={() =>
                              onAskAna(
                                `Draft a gap-bridging narrative for "${r.crit}" between ${subject.label} and ${eqDef.label}`,
                              )
                            }
                            label="Ask AnA"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

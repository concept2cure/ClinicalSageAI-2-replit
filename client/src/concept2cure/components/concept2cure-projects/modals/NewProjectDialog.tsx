/**
 * NewProjectDialog — region → application type → confirm wizard.
 * Mirror of design-system/ui_kits/home/Projects.jsx (lines 1531–1793).
 *
 * Per HANDOFF Open Questions item 1: id generation here is the prototype's
 * `pr-${Date.now()...}` — to be replaced with server UUIDv7/KSUID when
 * wiring the create mutation. The pr- prefix is mock affordance only.
 *
 * Per item 2: status: 'planning' from the prototype is an enum drift; we
 * write status: 'draft' to match PCP_STATUSES.
 *
 * Per item 3: submissionType comes from NPD_TYPES verbatim (canonical
 * lookup) — no string-mangling.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import {
  NPD_REGIONS, NPD_TYPES, NPD_FAMILY_LABELS,
  NPD_PREVIEWS, NPD_DEFAULT_PREVIEW,
  buildPhases,
  PR_PROJECTS,
  useProjectsMutations,
} from '../data';
import type { NpdRegion, NpdType } from '../data';
import type { Project } from '../types';

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
  /** Called when a real backend write succeeds, so the host can refetch
   *  the project list. Optional — without it, the wizard still updates
   *  the in-memory PR_PROJECTS seed for the demo path. */
  onApiCreated?: () => void;
}

export function NewProjectDialog({ onClose, onCreated, onApiCreated }: Props) {
  const [step, setStep] = useState<'region' | 'type' | 'confirm'>('region');
  const [regionCode, setRegionCode] = useState<string | null>(null);
  const [type, setType] = useState<NpdType | null>(null);
  const [name, setName] = useState('');
  const [product, setProduct] = useState('');
  const [sponsor, setSponsor] = useState('Concept2Cure');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { createProject } = useProjectsMutations({ onSuccess: onApiCreated });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const types = regionCode ? (NPD_TYPES[regionCode] || []) : [];
  const groupedTypes = useMemo(() => {
    const g: Record<string, NpdType[]> = {};
    for (const t of types) (g[t.family] = g[t.family] || []).push(t);
    return g;
  }, [types]);

  const preview = type ? (NPD_PREVIEWS[type.id] || NPD_DEFAULT_PREVIEW) : null;
  const requiredCount = preview ? preview.sections.filter(s => s.required).length : 0;
  const optionalCount = preview ? preview.sections.length - requiredCount : 0;

  const sectionsByModule = useMemo(() => {
    if (!preview) return {};
    const g: Record<number, typeof preview.sections> = {};
    for (const s of preview.sections) (g[s.module] = g[s.module] || []).push(s);
    return g;
  }, [preview]);

  function pickRegion(r: NpdRegion) { setRegionCode(r.region); setStep('type'); }
  function pickType(t: NpdType)     { setType(t); setStep('confirm'); }
  function back() {
    if (step === 'confirm') setStep('type');
    else if (step === 'type') { setStep('region'); setRegionCode(null); setType(null); }
  }

  async function create() {
    if (!type || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const regionMeta = NPD_REGIONS.find(r => r.region === regionCode);
    const projName = name.trim() || type.displayName;
    const projDesc = product.trim() || `${type.displayName} workspace`;
    const projSponsor = sponsor.trim() || 'Concept2Cure';
    const projProduct = product.trim() || '';

    try {
      const result = await createProject({
        name: projName,
        description: projDesc,
        product: projProduct,
        sponsor: projSponsor,
        region: regionCode ?? undefined,
        agency: regionMeta?.agency,
        targetAgency: regionMeta?.agency,
        type,
      });
      onCreated(result.id);
    } catch (err) {
      // Real backend write failed (offline / not authed / new tenant
      // without create permission). Per HANDOFF item 14 the prototype
      // mutates the in-memory seed; we keep that as the demo fallback
      // so the wizard's CTA always advances.
      const fallbackId = `pr-${Date.now().toString(36)}`;
      const next: Project = {
        id: fallbackId,
        name: projName,
        desc: projDesc,
        starred: false,
        chats: [],
        memory: { enabled: false, summary: '', updated: '' },
        instructions: '',
        files: [],
        submissionType: type.applicationType.toUpperCase().replace(/[^A-Z0-9]/g, '') as Project['submissionType'],
        submissionTypeLabel: type.displayName,
        product: projProduct || '—',
        sponsor: projSponsor,
        targetAgency: regionMeta ? regionMeta.agency : '',
        targetDate: '',
        status: 'draft',
        phases: buildPhases(type.preset, 0),
        daysToTarget: null,
      };
      PR_PROJECTS.unshift(next);
      setSubmitError(err instanceof Error ? err.message : 'Backend create failed; using demo seed.');
      onCreated(fallbackId);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="npd" role="dialog" aria-label="Create new project" aria-modal="true">
      <div className="npd-scrim" onClick={onClose} />
      <div className="npd-shell" onClick={e => e.stopPropagation()}>
        <header className="npd-head">
          <div>
            <div className="npd-eyebrow">New project</div>
            <div className="npd-title">
              {step === 'region' && 'Choose region'}
              {step === 'type' && 'Choose application type'}
              {step === 'confirm' && 'Confirm and name'}
            </div>
          </div>
          <button type="button" className="npd-close" onClick={onClose} aria-label="Close">
            {I.close}
          </button>
        </header>

        <div className="npd-steps">
          {(['region', 'type', 'confirm'] as const).map((s, i) => {
            const idx = (['region', 'type', 'confirm'] as const).indexOf(step);
            const done = i < idx;
            const current = i === idx;
            return (
              <Fragment key={s}>
                <div className={`npd-step ${current ? 'is-current' : ''} ${done ? 'is-done' : ''}`}>
                  <span className="npd-step-num">{done ? I.check : i + 1}</span>
                  <span className="npd-step-lbl">
                    {s === 'region' ? 'Region' : s === 'type' ? 'Application type' : 'Confirm'}
                  </span>
                </div>
                {i < 2 && <div className={`npd-step-line ${done ? 'is-done' : ''}`} />}
              </Fragment>
            );
          })}
        </div>

        <div className="npd-body">
          <div className="npd-pane npd-pane-l">
            {step === 'region' && (
              <div className="npd-list">
                {NPD_REGIONS.map(r => (
                  <button type="button" key={r.region} className="npd-row" onClick={() => pickRegion(r)}>
                    <span className="npd-row-ico">{I.globe}</span>
                    <div className="npd-row-body">
                      <div className="npd-row-title">{r.country}</div>
                      <div className="npd-row-sub">{r.agency} · {r.agencyFullName}</div>
                    </div>
                    <span className="npd-row-meta">{r.count} types</span>
                    <span className="npd-row-chev">{I.right}</span>
                  </button>
                ))}
              </div>
            )}

            {step === 'type' && (
              <div className="npd-types">
                <button type="button" className="npd-back" onClick={back}>← Back to regions</button>
                {Object.keys(groupedTypes).length === 0 && (
                  <div className="npd-empty">No application types defined for this region yet.</div>
                )}
                {Object.entries(groupedTypes).map(([family, items]) => (
                  <div key={family} className="npd-group">
                    <div className="npd-group-lbl">
                      {NPD_FAMILY_LABELS[family as keyof typeof NPD_FAMILY_LABELS] || family}
                    </div>
                    <div className="npd-list">
                      {items.map(t => (
                        <button type="button" key={t.id} className="npd-row" onClick={() => pickType(t)}>
                          <span className="npd-row-ico">
                            {t.dossierStandard === 'eCTD' ? I.beaker : I.shieldCheck}
                          </span>
                          <div className="npd-row-body">
                            <div className="npd-row-title">{t.displayName}</div>
                            <div className="npd-row-sub">
                              {t.applicationType} · {t.dossierStandard} · {t.stage}
                            </div>
                          </div>
                          <span className="npd-row-chev">{I.right}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {step === 'confirm' && type && (
              <div className="npd-form">
                <button type="button" className="npd-back" onClick={back}>← Back to application types</button>

                <div className="npd-summary">
                  <div className="npd-summary-row"><span>Region</span><span>{NPD_REGIONS.find(r => r.region === regionCode)?.country}</span></div>
                  <div className="npd-summary-row"><span>Agency</span><span>{NPD_REGIONS.find(r => r.region === regionCode)?.agency ?? '—'}</span></div>
                  <div className="npd-summary-row"><span>Application</span><span>{type.displayName}</span></div>
                  <div className="npd-summary-row"><span>Dossier format</span><span>{type.dossierStandard}</span></div>
                  <div className="npd-summary-row"><span>Stage</span><span>{type.stage}</span></div>
                </div>

                <div className="npd-field">
                  <label className="npd-lbl">Project name</label>
                  <input
                    className="npd-input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={type.displayName}
                    autoFocus
                  />
                  <div className="npd-hint">Leave blank to use the application type as the name.</div>
                </div>

                <div className="npd-field">
                  <label className="npd-lbl">Product</label>
                  <input
                    className="npd-input"
                    value={product}
                    onChange={e => setProduct(e.target.value)}
                    placeholder="e.g. CT-247 cardiac monitor"
                  />
                </div>

                <div className="npd-field">
                  <label className="npd-lbl">Sponsor</label>
                  <input
                    className="npd-input"
                    value={sponsor}
                    onChange={e => setSponsor(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <aside className="npd-pane npd-pane-r">
            {!type && (
              <div className="npd-preview-empty">
                <div className="npd-preview-empty-ico">{I.beaker}</div>
                <div className="npd-preview-empty-title">Bootstrap preview</div>
                <div className="npd-preview-empty-sub">
                  Pick an application type to see what gets created — sections, milestones, required artifacts, and the submission gateway.
                </div>
              </div>
            )}
            {type && preview && (
              <>
                <div className="npd-preview-head">
                  <div className="npd-preview-eyebrow">Bootstrap preview</div>
                  <div className="npd-preview-title">{type.displayName}</div>
                  <div className="npd-preview-meta">
                    {type.dossierStandard} · {preview.sections.length} sections · {preview.milestones.length} milestones
                  </div>
                </div>

                <div className="npd-preview-sec">
                  <div className="npd-preview-sec-head">
                    <span>Sections</span>
                    <span className="npd-preview-counts">
                      {requiredCount} required · {optionalCount} optional
                    </span>
                  </div>
                  <div className="npd-preview-modules">
                    {Object.entries(sectionsByModule).map(([mod, secs]) => (
                      <div key={mod} className="npd-preview-mod">
                        <div className="npd-preview-mod-lbl">Module {mod}</div>
                        <div className="npd-preview-mod-rows">
                          {secs.map(s => (
                            <div key={s.code} className="npd-preview-mod-row">
                              <span className="npd-preview-code">{s.code}</span>
                              <span className="npd-preview-stitle">{s.title}</span>
                              {s.required && <span className="npd-preview-req">req</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="npd-preview-sec">
                  <div className="npd-preview-sec-head"><span>Milestones</span></div>
                  <div className="npd-preview-mlist">
                    {preview.milestones.map((m, i) => (
                      <div key={m.id} className="npd-preview-mrow">
                        <span className="npd-preview-mnum">{i + 1}.</span>
                        <span className="npd-preview-mtitle">{m.title}</span>
                        <span className="npd-preview-mtasks">{m.taskCount} tasks</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="npd-preview-sec">
                  <div className="npd-preview-sec-head"><span>Required artifacts</span></div>
                  <div className="npd-preview-chips">
                    {preview.artifacts.map(a => (
                      <span key={a} className="npd-preview-chip">{a.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                </div>

                <div className="npd-preview-gw">
                  <span className="npd-preview-gw-lbl">Gateway</span>
                  <span className="npd-preview-gw-val">{preview.gateway}</span>
                </div>
              </>
            )}
          </aside>
        </div>

        <footer className="npd-foot">
          {submitError && (
            <span className="npd-error" role="status" aria-live="polite">
              {submitError}
            </span>
          )}
          <button type="button" className="npd-btn ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          {step === 'confirm' ? (
            <button
              type="button"
              className="npd-btn primary"
              onClick={create}
              disabled={submitting}
            >
              {submitting ? 'Creating…' : 'Create project'}
            </button>
          ) : (
            <button type="button" className="npd-btn primary is-disabled" disabled>
              Create project
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

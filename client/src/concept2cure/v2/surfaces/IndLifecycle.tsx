import React, { useState, useEffect, useMemo } from 'react';
import { I } from '../icons';
import { SampleTag, liveGet } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { AnswerLead } from '../AnswerLead';
import {
  INDL_PROGRAM,
  INDL_FORMS,
  INDL_SECTIONS,
  INDL_STATUS_LABEL,
  INDL_CLOCK_STATUS,
  INDL_DELIVERABLES,
  indlReadiness,
  indlClock,
} from '../fixtures/ind-lifecycle-data';
import type {
  IndlClockState,
  IndlProgram,
  IndlForm,
  IndlSection,
} from '../fixtures/ind-lifecycle-data';
import '../styles/project-home-v2.css';

/* ── Live read shape: one org-scoped IND checklist (GET /api/ind-checklist) ──
   Combines the program record with its Module 1 forms checklist and eCTD
   section blueprint -- the exact keys the surface renders. */
interface IndlChecklist {
  code: string;
  drugName: string;
  productName: string;
  indication: string;
  sponsorName: string;
  submissionType: string;
  targetReceiptOffsetDays: number;
  forms: IndlForm[];
  sections: IndlSection[];
}

const IND_CHECKLIST_FIXTURE: IndlChecklist = {
  ...INDL_PROGRAM,
  forms: INDL_FORMS,
  sections: INDL_SECTIONS,
};

/* ════ IND Lifecycle -- the deliverable-first IND workspace (21 CFR 312) ════ */

export function IndLifecycle({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;

  /* live ?? fixture -- render the codebase fixture immediately (no empty flash),
     then adopt the org's seeded IND checklist only when the GET returns the full
     display shape (program + nested forms[] + sections[]). Readiness is computed
     locally from whichever set loaded, so the local form/section state keeps
     working either way. Never fabricates: the pill stays "Sample" until a real
     shape-matching row arrives. */
  const [prog, setProg] = useState<IndlProgram>(INDL_PROGRAM);
  const [forms, setForms] = useState<IndlForm[]>(INDL_FORMS);
  const [sections, setSections] = useState<IndlSection[]>(INDL_SECTIONS);
  const [sample, setSample] = useState(true);
  const [tab, setTab] = useState<'file' | 'lifecycle'>('file');
  const [toast, setToast] = useState('');

  const R = useMemo(() => indlReadiness(sections, forms), [sections, forms]);

  useEffect(() => {
    let cancelled = false;
    liveGet<{ data?: IndlChecklist[] }>('/api/ind-checklist', {
      data: [IND_CHECKLIST_FIXTURE],
    }).then((res) => {
      if (cancelled) return;
      const row = res.data?.data?.[0];
      if (
        !res.sample &&
        row &&
        row.code &&
        Array.isArray(row.forms) &&
        row.forms.length > 0 &&
        Array.isArray(row.sections) &&
        row.sections.length > 0
      ) {
        setProg({
          code: row.code,
          drugName: row.drugName,
          productName: row.productName,
          indication: row.indication,
          sponsorName: row.sponsorName,
          submissionType: row.submissionType,
          targetReceiptOffsetDays: row.targetReceiptOffsetDays,
        });
        setForms(row.forms);
        setSections(row.sections);
        setSample(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* 30-day regulatory clock -- a PROJECTION until FDA receipt (not yet filed). */
  const clock = useMemo<IndlClockState>(() => {
    const receipt = new Date(
      Date.now() + (prog.targetReceiptOffsetDays || 14) * 86400000,
    ).toISOString();
    return indlClock(receipt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const receiptDate = useMemo(
    () =>
      new Date(
        Date.now() + (prog.targetReceiptOffsetDays || 14) * 86400000,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const clearDate = useMemo(
    () => (clock ? new Date(clock.thirtyDayDate) : null),
    [clock],
  );
  const fmt = (d: Date | null) =>
    d
      ? d.toLocaleDateString([], {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : '--';
  const cst = INDL_CLOCK_STATUS[clock ? clock.status : 'submitted'] || {
    label: '--',
    tone: 'info',
  };

  const formsDone = forms.filter((f) => f.done).length;
  const deliverables = INDL_DELIVERABLES.filter((d) => d.group === tab);
  const stLabel = INDL_STATUS_LABEL;

  return (
    <div className="page-inner indl" data-screen-label="IND Lifecycle">
      <div className="surface-head">
        <div>
          <div className="surface-kicker">
            {I.rocket} IND Lifecycle -- 21 CFR 312 -- /api/ind-checklist
          </div>
          <h1>
            {prog.drugName} -- Initial IND <SampleTag sample={sample} />
          </h1>
          <p className="surface-sub">
            {prog.productName} -- {prog.indication} -- {prog.sponsorName} --
            eCTD v4.0 (FDA)
          </p>
        </div>
        <div className="surface-head-actions">
          <button
            className="btn ghost"
            onClick={() => onNav && onNav('vault')}
            title="Open the IND dossier in the Vault"
          >
            {I.folder} Dossier
          </button>
          <button
            className="btn ghost"
            onClick={() =>
              ask(
                'What is the fastest path to make the ' +
                  prog.drugName +
                  ' IND submission-ready?',
              )
            }
          >
            {I.sparkles} Ask AnA
          </button>
        </div>
      </div>

      <AnswerLead
        tone={
          R.ready ? 'good' : R.blockers.length > 4 ? 'urgent' : 'calm'
        }
        eyebrow={
          'Is the ' +
          prog.drugName +
          ' IND ready to file -- and what stands between you and submission'
        }
        headline={
          R.ready ? (
            <>
              The {prog.drugName} IND is <b>ready to file</b> -- every
              required section is approved and all three Module 1 forms are
              complete.
            </>
          ) : (
            <>
              The {prog.drugName} IND is{' '}
              <b>{R.overallPercentage}% ready</b>.{' '}
              {R.blockers.length} thing
              {R.blockers.length === 1 ? '' : 's'} stand
              {R.blockers.length === 1 ? 's' : ''} between you and a
              fileable submission (21 CFR 312.23).
            </>
          )
        }
        body={
          R.ready ? (
            <>
              Once you file, the 30-day safe-to-proceed clock runs to{' '}
              <b>{fmt(clearDate)}</b> absent a clinical hold (312.40(b)). I
              will keep the lifecycle documents current from there.
            </>
          ) : (
            <>
              {R.requiredSections.total - R.requiredSections.completed}{' '}
              required section
              {R.requiredSections.total - R.requiredSections.completed === 1
                ? ''
                : 's'}{' '}
              {R.requiredSections.total - R.requiredSections.completed === 1
                ? 'is'
                : 'are'}{' '}
              not yet approved and {forms.length - formsDone} Module 1 form
              {forms.length - formsDone === 1 ? '' : 's'}{' '}
              {forms.length - formsDone === 1 ? 'is' : 'are'} open. Close
              those and the package is fileable.
            </>
          )
        }
        reassure="None of these are FDA findings -- they are the checklist I hold so nothing slips before you submit."
        action={{
          label: R.ready
            ? 'Assemble the submission sequence'
            : 'Resolve the top blocker',
          onClick: () => {
            if (R.ready) {
              onNav && onNav('submission-center');
            } else if (R.blockers[0]) {
              ask(
                'Help me resolve ' +
                  R.blockers[0].code +
                  ': ' +
                  R.blockers[0].message,
              );
            }
          },
        }}
        secondary={
          sample
            ? "Sample checklist -- the live route returns this org's IND forms and section state, and readiness is computed from it."
            : 'Live from GET /api/ind-checklist.'
        }
      />

      <div className="indl-grid">
        {/* HERO deliverable: the IND Filing Readiness Report (312.23) */}
        <div className="indl-main">
          <div className="cm-doc indl-doc">
            <div className="cm-doc-bar">
              <span className="cm-doc-name">
                {prog.drugName}_IND_filing-readiness_312.23
              </span>
              <div className="cm-doc-bar-r">
                <span
                  className={'indl-verdict ' + (R.ready ? 'ok' : 'no')}
                >
                  {R.ready ? 'READY TO FILE' : 'NOT YET FILEABLE'}
                </span>
                <button
                  className="btn ghost sm"
                  onClick={() =>
                    ask(
                      'Generate the IND filing-readiness report (21 CFR 312.23) as a governed PDF for ' +
                        prog.drugName +
                        '.',
                    )
                  }
                >
                  {I.download} Export
                </button>
              </div>
            </div>
            <div className="cm-doc-body indl-doc-body">
              <div className="indl-cover">
                <h2>IND Filing Readiness -- 21 CFR 312.23</h2>
                <div className="indl-cover-meta">
                  <span>{prog.productName}</span>
                  <span>{prog.sponsorName}</span>
                  <span>Initial IND -- eCTD v4.0 (FDA)</span>
                  <span>
                    Assessed{' '}
                    {new Date().toLocaleDateString([], {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <div className="indl-overall">
                  <div className="indl-overall-bar">
                    <div
                      className={'fill ' + (R.ready ? 'ok' : '')}
                      style={{ width: R.overallPercentage + '%' }}
                    />
                  </div>
                  <span className="indl-overall-pct">
                    {R.overallPercentage}%
                  </span>
                </div>
              </div>

              <h3>1 -- Module progress</h3>
              <div className="indl-mods">
                {R.moduleProgress.map((m) => (
                  <div key={m.module} className="indl-mod">
                    <div className="indl-mod-h">
                      <span className="l">{m.title}</span>
                      <span className="pct">{m.percentage}%</span>
                    </div>
                    <div className="indl-mod-bar">
                      <div
                        className={
                          'fill' + (m.percentage >= 100 ? ' ok' : '')
                        }
                        style={{ width: m.percentage + '%' }}
                      />
                    </div>
                    <div className="indl-mod-m">
                      {m.completed}/{m.total} required sections approved
                    </div>
                  </div>
                ))}
              </div>

              <h3>
                2 -- Module 1 forms{' '}
                <span className="indl-h-x">
                  -- 21 CFR 312.23(a)(1)
                </span>
              </h3>
              <div className="indl-forms">
                {forms.map((f) => (
                  <div
                    key={f.id}
                    className={'indl-form' + (f.done ? ' ok' : '')}
                  >
                    <span className="indl-form-ic">
                      {f.done ? I.checkCircle : I.alertTriangle}
                    </span>
                    <span className="indl-form-b">
                      <span className="t">
                        {f.title} -- {f.label}
                      </span>
                      <span className="s">{f.ref}</span>
                    </span>
                    <span
                      className={
                        'rd-chip tone-' + (f.done ? 'good' : 'warn')
                      }
                    >
                      {f.done ? 'Complete' : 'Open'}
                    </span>
                  </div>
                ))}
              </div>

              <h3>
                3 -- Blockers to filing{' '}
                <span className="indl-h-x">
                  -- {R.blockers.length} -- ready = zero blockers
                </span>
              </h3>
              {R.blockers.length === 0 ? (
                <p className="indl-clean">
                  {I.check} No blockers. Every required section is approved
                  and all Module 1 forms are complete -- the package is
                  fileable.
                </p>
              ) : (
                <div className="indl-blockers">
                  {R.blockers.map((b, i) => {
                    const sec = (
                      R.requiredSections.incomplete || []
                    ).find((g) => g.code === b.code);
                    return (
                      <div key={b.code + i} className="indl-blk">
                        <span
                          className={'indl-blk-kind k-' + b.kind}
                        >
                          {b.kind === 'required_form'
                            ? 'Form'
                            : b.kind === 'overdue_safety_report'
                              ? 'Safety'
                              : 'Section'}
                        </span>
                        <div className="indl-blk-b">
                          <div className="indl-blk-t">
                            <span className="mono">{b.code}</span>
                            {sec ? ' -- ' + sec.title : ''}
                            {sec ? (
                              <span className="indl-blk-st">
                                {' '}
                                --{' '}
                                {stLabel[sec.status] || sec.status}
                              </span>
                            ) : null}
                          </div>
                          <div className="indl-blk-ref">
                            {sec
                              ? sec.regulatoryRef
                              : b.kind === 'required_form'
                                ? '21 CFR 312.23(a)(1)'
                                : '21 CFR 312.32'}
                          </div>
                        </div>
                        <button
                          className="btn ghost sm"
                          onClick={() =>
                            ask(
                              'Help me clear IND blocker ' +
                                b.code +
                                ': ' +
                                b.message,
                            )
                          }
                        >
                          {I.sparkles} Resolve
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Aside: the 30-day clock + the documents AnA assembles */}
        <aside className="indl-aside">
          <div className="indl-clock">
            <div className="indl-clock-h">
              {I.clock} Regulatory clock{' '}
              <span className={'rd-chip tone-' + cst.tone}>
                {cst.label}
              </span>
            </div>
            <div className="indl-clock-big">
              {clock ? clock.daysUntilThirtyDay : '--'}
              <span>days to safe-to-proceed</span>
            </div>
            <div className="indl-clock-rows">
              <div>
                <span>Target FDA receipt</span>
                <b>{fmt(receiptDate)}</b>
              </div>
              <div>
                <span>30-day clears</span>
                <b>{fmt(clearDate)}</b>
              </div>
              <div>
                <span>21 CFR</span>
                <b>312.40(b) / 312.42</b>
              </div>
            </div>
            <p className="indl-clock-note">
              {clock ? clock.rationale : ''}{' '}
              <span className="indl-proj">
                Projection until FDA receipt.
              </span>
            </p>
          </div>

          <div className="indl-deliv">
            <div className="indl-deliv-h">Documents AnA assembles</div>
            <div className="indl-deliv-tabs" role="tablist">
              <button
                role="tab"
                className={tab === 'file' ? 'on' : ''}
                onClick={() => setTab('file')}
              >
                For filing
              </button>
              <button
                role="tab"
                className={tab === 'lifecycle' ? 'on' : ''}
                onClick={() => setTab('lifecycle')}
              >
                Lifecycle
              </button>
            </div>
            <div className="indl-deliv-list">
              {deliverables.map((d) => (
                <div key={d.id} className="indl-dcard">
                  <div className="indl-dcard-h">
                    <span className="indl-dcard-t">{d.title}</span>
                    {d.ai && (
                      <span
                        className="indl-ai"
                        title="AnA-draftable"
                      >
                        {I.sparkles} AnA
                      </span>
                    )}
                  </div>
                  <div className="indl-dcard-meta">
                    <span className="indl-place">{d.placement}</span>
                    <span className="indl-ref">{d.ref}</span>
                  </div>
                  <div className="indl-dcard-desc">{d.desc}</div>
                  <div className="indl-dcard-acts">
                    <button
                      className="btn primary sm"
                      onClick={() => ask(d.ask)}
                    >
                      {I.sparkles} Assemble
                    </button>
                    <span className="indl-route mono">
                      {d.route.replace('POST ', '')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="indl-deliv-foot">
              Each assembles deterministically, renders to a
              submission-ready PDF leaf, and files as an eCTD sequence.
            </div>
          </div>
        </aside>
      </div>

      {toast && (
        <div className="etmf-toast">
          {I.check} {toast}
        </div>
      )}
    </div>
  );
}

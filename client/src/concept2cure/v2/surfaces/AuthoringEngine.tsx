import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveRows, ErrorState } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Inline fixture types ── */

interface AePipeStage {
  k: string;
  ic: string;
  n: string;
  t: string;
  d: string;
}

interface AeSystem {
  id: string;
  loc: string;
  mod: string;
  t: string;
  tmpl: boolean;
  multi: string[];
  sub: string;
  guarantees: string[];
  checks: string[];
}


interface AeAutomation {
  id: string;
  t: string;
  flow: [string, string][];
  val: string;
}

/* ── Inline fixture data (kit window globals) ── */

const AE_PIPE: AePipeStage[] = [
  { k: 'raw', ic: 'database', n: 'Input', t: 'Raw data & sources', d: 'Datasets, source tables, prior submissions, evidence in the Vault.' },
  { k: 'extract', ic: 'workflow', n: 'Structure', t: 'Extract & structure', d: 'AnA maps raw inputs to the document model — sections, tables, endpoints.' },
  { k: 'system', ic: 'sparkles', n: 'AI system', t: 'Per-doc-type system', d: 'The AI system for this document type drafts against its required-content spec.' },
  { k: 'draft', ic: 'penLine', n: 'Draft', t: 'Multi-modal draft', d: 'Text, tables, figures and graphs — grounded, every claim cited.' },
  { k: 'validate', ic: 'shieldCheck', n: 'Validate', t: 'Deterministic checks', d: 'Non-AI validation: required sections, numeric reconciliation, citations.' },
  { k: 'review', ic: 'checkCircle', n: 'Govern', t: 'Review & e-sign', d: 'Human review, track-changes, 21 CFR Part 11 e-signature.' },
  { k: 'final', ic: 'gitBranch', n: 'Final', t: 'Final draft to eCTD', d: 'Rendered to DOCX/PDF and placed on its CTD leaf.' },
];

const AE_SYSTEMS: AeSystem[] = [
  { id: 'co25', loc: '2.5', mod: 'Module 2', t: 'Clinical Overview', tmpl: true, multi: ['tables'],
    sub: 'Benefit-risk narrative synthesizing efficacy, safety and clinical pharmacology.',
    guarantees: ['Enforces the ICH M4E §2.5.1–2.5.6 required structure', 'Every efficacy/safety claim grounded to a locked source (no draft cuts)', 'Harmonizes endpoint language with §2.7.3 / §2.7.4 automatically', 'Pulls benefit-risk framing from the approved precedent set'],
    checks: ['Required-section assertion vs the M4E template map', 'Claim ↔ locked-evidence citation check (rejects uncited numbers)', 'Cross-section numeric consistency vs §2.7.3', 'Contradiction scan against the dossier (blocks on CON-####)'] },
  { id: 'sce273', loc: '2.7.3', mod: 'Module 2', t: 'Summary of Clinical Efficacy', tmpl: true, multi: ['tables', 'figures'],
    sub: 'Integrated efficacy summary across the pivotal and supportive studies.',
    guarantees: ['Assembles pooled efficacy tables directly from ADaM', 'Regenerates forest plots and KM curves from the locked datasets', 'Every endpoint traces to its CSR §11 source', 'Subgroup consistency narrated with the supporting figures'],
    checks: ['ADaM → table value-preservation diff', 'Figure ↔ underlying dataset hash match', 'Endpoint definition consistency with the SAP', 'Required subsection completeness'] },
  { id: 'scs274', loc: '2.7.4', mod: 'Module 2', t: 'Summary of Clinical Safety', tmpl: true, multi: ['tables'],
    sub: 'Integrated safety summary — exposure, AEs, labs, deaths, SAEs.',
    guarantees: ['Builds the exposure and AE tables from the pooled safety dataset', 'Applies MedDRA SOC/PT structure deterministically', 'Flags any AE-count divergence from the ISS', 'Death and SAE narratives linked to source ICSRs'],
    checks: ['AE count reconciliation vs ISS (non-AI)', 'MedDRA coding conformance', 'Exposure denominator consistency', 'Required §2.7.4.1–2.7.4.7 presence'] },
  { id: 'nc26', loc: '2.6', mod: 'Module 2', t: 'Nonclinical Written & Tabulated Summaries', tmpl: true, multi: ['tables'],
    sub: '2.6.1–2.6.7 pharmacology, PK and toxicology written + tabulated summaries.',
    guarantees: ['Generates the tabulated summaries from the study reports', 'Every finding chip links to its source GLP study', 'Carcinogenicity subsection held open until the study locks', 'TTC / impurity logic applied where relevant'],
    checks: ['Study → tabulated-summary value check', 'SEND domain conformance reference', 'Required 2.6.x subsection map', 'Units → controlled terminology mapping'] },
  { id: 'csr', loc: 'ICH E3', mod: 'Module 5', t: 'Clinical Study Report', tmpl: true, multi: ['tables', 'figures'],
    sub: 'Full ICH E3 CSR from the SAP, TLF shells and the locked database.',
    guarantees: ['14-section ICH E3 structure enforced', 'TLFs generated from ADaM and placed in-text', '§11 efficacy narrated from the pre-specified analyses', 'Protocol-deviation and disposition tables auto-built'],
    checks: ['TLF ↔ dataset reconciliation', 'Section-14 required-table presence', 'Analysis population consistency', 'Cross-reference integrity (in-text ↔ appendix)'] },
  { id: 'proto', loc: 'ICH M11', mod: 'Module 5', t: 'Clinical Protocol', tmpl: true, multi: ['tables'],
    sub: 'ICH M11 protocol — objectives, eligibility, SoA, statistics, risk.',
    guarantees: ['ICH M11 template structure and common-technical content', 'Schedule-of-assessments grid built and validated', 'Objectives ↔ endpoints ↔ estimands kept consistent', 'Deterministic completeness gate before finalize'],
    checks: ['M11 required-section assertion', 'SoA grid internal consistency', 'Estimand ↔ endpoint linkage', '45 CFR 46 / ICH GCP element presence'] },
  { id: 'cmcs', loc: '3.2.S', mod: 'Module 3', t: 'CMC — Drug Substance', tmpl: true, multi: ['tables', 'figures'],
    sub: '3.2.S manufacture, characterization, control and stability.',
    guarantees: ['Specification tables built to ICH Q6A', 'Stability trends charted from the study data', 'Impurity control narrated with ICH Q3A/M7/Q3D logic', 'Comparability tables across lots assembled'],
    checks: ['Spec table ↔ batch-data reconciliation', 'Stability trend numeric check', 'Q6A required-attribute presence', 'Comparability acceptance-criteria assertion'] },
  { id: 'cmcp', loc: '3.2.P', mod: 'Module 3', t: 'CMC — Drug Product', tmpl: true, multi: ['tables'],
    sub: '3.2.P description, development, manufacture, control, stability.',
    guarantees: ['Formulation and process tables from the batch records', 'Dissolution and CQA profiles charted', 'Control strategy narrated to ICH Q14', 'Container-closure section assembled'],
    checks: ['Batch-record ↔ table value check', 'CQA/CPP consistency with the control strategy', 'Q8/Q14 required-element presence', 'Stability commitment completeness'] },
  { id: 'issise', loc: 'ISS / ISE', mod: 'Module 5', t: 'Integrated Summaries (ISS / ISE)', tmpl: false, multi: ['tables', 'figures'],
    sub: 'Integrated safety and efficacy summaries across the program.',
    guarantees: ['Pools across studies with harmonized definitions', 'Rebuilds pooled tables when any contributing study updates', 'Every pooled figure regenerates from the integrated dataset', 'Divergences from individual CSRs surfaced'],
    checks: ['Cross-study pooling reconciliation', 'Definition-harmonization assertion', 'Pooled figure ↔ dataset hash', 'Contributing-study completeness'] },
  { id: 'uspi', loc: 'M1 · PLLR', mod: 'Module 1', t: 'Prescribing Information (USPI)', tmpl: true, multi: ['tables'],
    sub: 'USPI per PLLR / 21 CFR 201.57 and SPL; EU SmPC variant.',
    guarantees: ['PLLR / 201.57 section order enforced', 'Dosing and AE tables derived from the clinical summaries', 'Highlights ↔ full-PI consistency maintained', 'SPL structured output rendered'],
    checks: ['201.57 required-section assertion', 'Highlights ↔ full-PI consistency check', 'AE table ↔ §2.7.4 reconciliation', 'SPL schema validation'] },
  { id: 'brief', loc: 'Briefing', mod: 'Lifecycle', t: 'Agency Briefing Book', tmpl: true, multi: ['tables'],
    sub: 'Pre-IND / Type B–C / Pre-NDA-BLA briefing documents with questions.',
    guarantees: ['Meeting-type template applied (FDA / EMA / PMDA)', 'Background assembled from the current dossier', 'Questions framed with position and supporting data', 'Prior-minutes commitments cross-referenced'],
    checks: ['Meeting-type required-section map', 'Question ↔ supporting-data linkage', 'Prior-commitment cross-reference', 'Page/format compliance'] },
  { id: 'psur', loc: 'PSUR', mod: 'Lifecycle', t: 'PSUR / PBRER', tmpl: true, multi: ['tables'],
    sub: 'Periodic benefit-risk evaluation report on the ICH E2C schedule.',
    guarantees: ['ICH E2C(R2) structure enforced', 'Exposure and cumulative tables from the safety database', 'Signal section linked to the signal-management log', 'Benefit-risk conclusion grounded in the period data'],
    checks: ['E2C required-section assertion', 'Cumulative-count reconciliation', 'Signal-log linkage completeness', 'Data-lock-point consistency'] },
];


const AE_AUTOMATIONS: AeAutomation[] = [
  { id: 'a1', t: 'Tabular summary sync',
    flow: [['When', 'New tabular data lands for a table AnA already summarized'], ['AnA does', 'Regenerate the narrative summary from the updated table'], ['Then', 'Notify the owner via Collaboration & Tasking with a plain-language change summary']],
    val: 'Row/column reconciliation checksum, unit-CT mapping and a numeric-equality assertion confirm the regenerated summary matches the new table exactly — non-AI, run on every execution.' },
  { id: 'a2', t: 'Table merge & normalization',
    flow: [['When', 'An incoming table differs in formatting or data labeling'], ['AnA does', 'Deterministically resolve formatting and map labels to the canonical schema'], ['Then', 'Merge preserved values; flag residual conflicts for human review']],
    val: 'Schema-conformance and value-preservation diff assert that no cell value was altered by the normalization; any unmapped label or lost value stops the merge and raises a Tasking item.' },
  { id: 'a3', t: 'Cross-reference integrity',
    flow: [['When', 'A value changes in a source table'], ['AnA does', 'Find every document paragraph that cites that value'], ['Then', 'Mark those paragraphs stale and create a Tasking item for the author']],
    val: 'Provenance-hash comparison between the cited value and its live source. A hash mismatch marks the paragraph stale on its own, without asking the model to judge whether the value moved.' },
  { id: 'a4', t: 'Section completeness gate',
    flow: [['When', 'A document reaches "ready for review"'], ['AnA does', 'Assert every required CTD / ICH section is present and non-empty'], ['Then', 'Block promotion and list the missing sections if the gate fails']],
    val: 'Template section-map assertion runs the required-content spec for that document type — a non-AI gate that blocks promotion and names the sections still missing.' },
];

/* ── Window globals -- cross-surface data providers ── */
declare global {
  interface Window {
    openAna?: (q: string) => void;
  }
}

/* ════ AuthoringEngine -- end-to-end CTD document creation suite ════ */

export function AuthoringEngine({ onAsk, onNav }: SurfaceViewProps) {
  const [tab, setTab] = useState('pyramid');
  /* The org's real learned templates — same org-scoped read the Template
     Library surface uses. The epoch lets the error state offer a retry. */
  const [tplEpoch, setTplEpoch] = useState(0);
  const tpl = useLiveRows<{ id: string; name: string }>('/api/c2c/templates', ['/api/c2c/templates', tplEpoch]);
  const [sel, setSel] = useState('co25');
  const sys = AE_SYSTEMS.find((s) => s.id === sel) || AE_SYSTEMS[0];
  const ask = onAsk;
  const open = (id: string) => {
    onNav && onNav(id);
  };
  const tabs: [string, string][] = [
    ['pyramid', 'Raw data to draft'],
    ['systems', 'Document systems'],
    ['templates', 'Templates'],
    ['automations', 'GxP automations'],
  ];

  /* WHAT ANA SEES HERE. This page is a capability brochure: the disclaimer IS
     the payload — without it, "is my 2.5 grounded?" gets answered from a
     description of what the engine can do. The template count is the page's
     only live read; everything else describes no program and no status. */
  const tabLabel = (tabs.find(([id]) => id === tab) ?? [tab, tab])[1];
  const anaContext = useMemo(() => {
    let summary =
      'AnA Authoring Engine — this page describes what the engine is built to do for each document type; ' +
      `it reads no programs and reports no program status. The "${tabLabel}" tab is open.`;
    if (tab === 'systems') {
      summary += ` The ${sys.t} system (CTD ${sys.loc}) is selected.`;
    }
    if (tab === 'templates') {
      summary += tpl.loading
        ? ' The organization template read is still loading.'
        : tpl.error
          ? ' The organization templates could not be read — a failed read, not an organization with no templates.'
          : tpl.rows.length === 0
            ? ' No templates learned for this organization yet.'
            : ` ${tpl.rows.length} template(s) learned for this organization.`;
    }
    return {
      summary,
      facts: {
        describesCapabilityOnly: true,
        openTab: tab,
        ...(tab === 'systems'
          ? { selectedSystemId: sys.id, selectedSystemTitle: sys.t, selectedSystemCtdLocation: sys.loc }
          : {}),
        ...(tab === 'templates'
          ? tpl.loading
            ? {}
            : tpl.error
              ? { templatesUnavailable: true }
              : { templateCount: tpl.rows.length }
          : {}),
      },
    };
  }, [tab, tabLabel, sys, tpl.loading, tpl.error, tpl.rows]);
  /* Capability-reference navigation only: this page reads no programs, and
     drafting a document stays the person's request. */
  useSurfaceActionHandlers('authoring-engine', {
    'authoring-engine.open-tab': (params) => {
      const target = String(params.tab ?? '');
      const meta = tabs.find(([id]) => id === target);
      if (!meta) return { ok: false, reason: `No authoring-engine tab named "${params.tab}".` };
      if (tab === target) return { ok: true, detail: `Already on ${meta[1]}` };
      setTab(target);
      return { ok: true, detail: `Opened ${meta[1]}` };
    },
    'authoring-engine.select-system': (params) => {
      const target = String(params.system ?? '');
      const sys = AE_SYSTEMS.find((s) => s.id === target);
      if (!sys) return { ok: false, reason: `No document system named "${params.system}".` };
      const switched = tab !== 'systems';
      if (switched) setTab('systems');
      setSel(sys.id);
      return {
        ok: true,
        detail: `Selected the ${sys.t} system (CTD ${sys.loc})` + (switched ? ' on the document-systems tab' : ''),
      };
    },
  });

  usePublishSurfaceContext('authoring-engine', anaContext);

  return (
    <div className="ae">
      <div className="reg-head" style={{ marginBottom: 6 }}>
        <div>
          <div className="reg-eyebrow">Biotech & Pharma {I.dot} authoring</div>
          <h1 className="reg-title">AnA Authoring Engine</h1>
          <p className="reg-sub">One route from raw data to a final draft across the CTD. Each document type has its own drafting system that works from evidence you have locked, cites each claim to its source, and surfaces anything it could not ground — across text, tables, figures and graphs.</p>
        </div>
        <button className="reg-ask" onClick={() => ask('Draft my next CTD document with the right document-type system, grounded on the locked evidence')}>{I.sparkles} Draft with AnA</button>
      </div>

      <div className="ae-badges">
        <span className="ae-badge">{I.check} A drafting system per document type</span>
        <span className="ae-badge">{I.check} Claims cited to locked evidence</span>
        <span className="ae-badge">{I.check} Multi-modal — text, tables, figures, graphs</span>
        <span className="ae-badge">{I.check} Learns from templates you add</span>
        <span className="ae-badge">{I.check} GxP automations {I.dot} deterministic post-checks</span>
      </div>

      {/* WHAT THIS SCREEN IS. Everything below the tabs is a description of the
          engine's document-type coverage -- it reads none of your data and
          reports on none of your programs. It said so nowhere, while sitting
          in the Apps catalog as a purchasable module beside `document-authoring`
          (the real editor), so a reader had no way to tell a capability list
          from their own configured state. Saying it once, plainly, is cheaper
          than the support conversation that follows finding out. */}
      <div className="scaf-note" style={{ marginTop: 12, marginBottom: 4, maxWidth: 820 }}>
        This page describes what the authoring engine is built to do for each document type.
        It does not read your programs or report their status. Open the document editor to
        work on a real document.
      </div>

      <div className="reg-tabs">
        {tabs.map(([id, l]) => (
          <button key={id} className={'reg-tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>

      {tab === 'pyramid' && (
        <div>
          <div className="ae-pipe">
            {AE_PIPE.map((s) => (
              <div key={s.k} className="ae-pstage" data-k={s.k}>
                <div className="ae-pstage-n">{s.n}</div>
                <div className="ae-pstage-ic">{I[s.ic] || I.grid}</div>
                <div className="ae-pstage-t">{s.t}</div>
                <div className="ae-pstage-d">{s.d}</div>
              </div>
            ))}
          </div>
          <div className="scaf-note" style={{ marginTop: 16, maxWidth: 820 }}>
            Every document type rides this same pipeline. The AI system for that type owns the middle — it knows the required structure, what must be grounded, and which tables and figures the draft needs — while the deterministic validation and Part 11 governance own the finish. Open a document type to see what its system guarantees.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={() => open('document-authoring')}>{I.penLine} Open the document editor</button>
            <button className="btn ghost" onClick={() => open('vault')}>{I.vault} Add raw data to the Vault</button>
            <button className="btn ghost" onClick={() => setTab('systems')}>{I.grid} Browse document systems</button>
          </div>
        </div>
      )}

      {tab === 'systems' && (
        <div>
          <div className="ae-detail">
            <div className="ae-detail-h">
              <div>
                <div className="ae-sys-top" style={{ marginBottom: 6 }}>
                  <span className="ae-sys-loc">{sys.loc}</span>
                  <span className="ae-sys-mod">{sys.mod}</span>
                  {sys.tmpl && <span className="ae-sys-tag" data-tmpl="">Template learned</span>}
                  {sys.multi.map((m) => <span key={m} className="ae-sys-tag">{m}</span>)}
                </div>
                <div className="ae-detail-t">{sys.t}</div>
                <div className="ae-detail-s">{sys.sub}</div>
              </div>
              <button className="reg-ask" onClick={() => ask(`Draft the ${sys.t} (${sys.loc}) with its document-type system, grounded on the locked evidence`)}>{I.sparkles} Draft this</button>
            </div>
            <div className="ae-detail-cols">
              <div>
                <div className="pj-seclbl" style={{ marginTop: 0 }}>What the system is built to produce</div>
                <div className="ae-chk">
                  {sys.guarantees.map((g, i) => (
                    <div key={i} className="ae-chk-row"><span className="ico">{I.checkCircle}</span>{g}</div>
                  ))}
                </div>
              </div>
              <div>
                <div className="pj-seclbl" style={{ marginTop: 0 }}>Built-in validation (non-AI)</div>
                <div className="ae-chk">
                  {sys.checks.map((c, i) => (
                    <div key={i} className="ae-chk-row" data-det=""><span className="ico">{I.shieldCheck}</span>{c}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="ae-grid">
            {AE_SYSTEMS.map((s) => (
              <button key={s.id} className="ae-sys" data-on={sel === s.id || undefined} onClick={() => setSel(s.id)}>
                <div className="ae-sys-top"><span className="ae-sys-loc">{s.loc}</span><span className="ae-sys-mod">{s.mod}</span></div>
                <div className="ae-sys-t">{s.t}</div>
                <div className="ae-sys-foot">
                  <span className="ae-sys-tags">
                    {s.tmpl && <span className="ae-sys-tag" data-tmpl="">tmpl</span>}
                    {s.multi.map((m) => <span key={m} className="ae-sys-tag">{m}</span>)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'templates' && (
        <div style={{ maxWidth: 820 }}>
          <div className="scaf-note" style={{ marginBottom: 16 }}>
            Specify the document type and add your template — AnA learns your terminology, formatting and structure, so drafts arrive in your preferred format from the first pass. Templates render to DOCX and PDF.
          </div>
          {/* ── "No templates learned yet" was a constant ─────────────────────
              This tab asserted that the tenant had no templates while making no
              request at all — a tenant with a full Template Library was told
              its library was empty, on the screen that exists to tell it
              otherwise. /api/c2c/templates is the same org-scoped read the
              Template Library surface uses; this now shares it, and separates
              the three states it can actually be in: still loading, failed to
              read, and genuinely none. */}
          {tpl.loading ? (
            <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading your templates…</div>
          ) : tpl.error ? (
            <ErrorState
              title="Couldn't load your templates"
              message={tpl.error}
              retry={() => setTplEpoch((n) => n + 1)}
            />
          ) : tpl.rows.length === 0 ? (
            <EmptyState
              title="No templates learned yet"
              hint="Add a template and AnA learns your terminology, formatting and structure — drafts then arrive in your house style from the first pass. Manage them in the Template Library."
              icon={I.fileText}
            />
          ) : (
            <div className="scaf-note" style={{ padding: '14px 12px' }}>
              {tpl.rows.length} template{tpl.rows.length === 1 ? '' : 's'} learned for this
              organization. AnA drafts in their terminology, formatting and structure.
              Open the Template Library to review or add to them.
            </div>
          )}
          <button className="btn primary" style={{ marginTop: 8 }} onClick={() => open('template-library')}>
            {I.plus} {tpl.rows.length > 0 ? 'Manage templates' : 'Add a template'}
          </button>
        </div>
      )}

      {tab === 'automations' && (
        <div style={{ maxWidth: 860 }}>
          <div className="scaf-note" style={{ marginBottom: 16 }}>
            Automations run with less human engagement than the rest of AnA — so each carries built-in validation logic that uses <b>non-AI</b> techniques to confirm it performed as intended, every single time. More powerful than traditional software automation, because AI resolves the messy parts and deterministic checks verify the result.
          </div>
          {AE_AUTOMATIONS.map((a) => (
            <div key={a.id} className="ae-auto">
              <div className="ae-auto-h">
                <span style={{ color: 'var(--accent-200)' }}>{I.workflow}</span>
                <span className="ae-auto-t">{a.t}</span>
                <span className="ae-det-badge">{I.shieldCheck} Deterministic post-check</span>
              </div>
              <div className="ae-flow">
                {a.flow.map((f, i) => (
                  <div key={i} className="ae-flow-step">
                    <div className="ae-flow-k">{f[0]}</div>
                    <div className="ae-flow-v">{f[1]}</div>
                  </div>
                ))}
              </div>
              <div className="ae-auto-val">
                <div className="ae-auto-val-l">Built-in validation logic (non-AI)</div>
                <div className="ae-auto-val-t">{a.val}</div>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn ghost" onClick={() => open('tasks')}>{I.checkSquare} Open Collaboration & Tasking</button>
            <button className="btn ghost" onClick={() => open('orchestration')}>{I.workflow} Orchestration & readiness</button>
          </div>
        </div>
      )}
    </div>
  );
}

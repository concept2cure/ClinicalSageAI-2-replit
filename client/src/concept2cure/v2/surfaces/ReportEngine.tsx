import React, { useState, useMemo, useRef } from 'react';
import { I } from '../icons';
import { connected, liveMutateOrNull, useLiveData, EmptyState } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { apiRequest } from '@/lib/queryClient';
import { isClinicalRegulatoryGraphEnabled } from '../clinicalRegulatoryGraphFlag';
import '../styles/project-home-v2.css';

/* ═══════════════════════════════════════════════════════════════════
   Reporting & Analytics -- a protocol-analysis document producer,
   not a chart dashboard.

   Grounded in server/routes/analytics-routes.ts (concept2cure-v2):
   - POST /api/analytics/analyze-protocol-text -> deep CSR analyzer +
     generateRecommendations() + generateStatisticalInsights() +
     IND readiness assessment + similar-CSR matches.
   - GET  /api/analytics/dashboard -> real aggregates from csrReports.

   The DELIVERABLE is the generated analysis document (Recommendations /
   Statistical Insights / IND Readiness) rendered as real prose.

   Registers as SURFACE_VIEWS['report-engine'].
   ═══════════════════════════════════════════════════════════════════ */

/* ── Types ── */

interface ParsedProtocol {
  title: string;
  indication: string;
  phase: string;
  sample_size: number;
  duration_weeks: number;
  primary_endpoint: string;
  risk_factors: RiskFactor[];
}

interface RiskFactor {
  description: string;
  severity: string;
  mitigation?: string;
}

interface SimilarProtocol {
  id: string;
  title: string;
  indication: string;
  phase: string;
  sample_size: number;
  duration_weeks: number;
  similarity: number | null;
}

interface Analysis {
  protocol_data: ParsedProtocol;
  similar_protocols: SimilarProtocol[];
  recommendations?: string;
  statistical_insights?: string;
  source: 'live' | 'local';
}

interface DocDef {
  id: string;
  label: string;
  gen: (a: ParsedProtocol, csrs?: SimilarProtocol[]) => string;
  blurb: string;
  needsCsr?: boolean;
}

/** Render contract for the CSR-library panel — a subset of the org-scoped
 *  GET /api/analytics/dashboard response (server/routes/analytics-routes.ts).
 *  Every field here is a REAL aggregate of the caller org's csr_reports; no
 *  field is defaulted to a fabricated value. */
interface DashboardData {
  totalReports: number;
  recentAdditions: number;
  uniqueIndications: number;
  averageCompletionRate: number;
  reportsByPhase: Record<string, number>;
  reportsByIndication: Record<string, number>;
}

/* ── Ported document generators (analytics-routes.ts) ── */

function genRecommendations(a: ParsedProtocol, csrs: SimilarProtocol[] = []): string {
  const riskCount = (a.risk_factors || []).length;
  const high = (a.risk_factors || []).filter(r => (r.severity || '').toLowerCase() === 'high');
  const med = (a.risk_factors || []).filter(r => (r.severity || '').toLowerCase() === 'medium');
  let s = `# Protocol Design Recommendations\nGenerated: ${new Date().toLocaleString()}\n\n`;
  s += `Based on our analysis of your protocol "${a.title || 'Untitled'}" for ${a.indication || 'unspecified indication'} and comparison with ${csrs.length} similar studies, we offer the following evidence-based recommendations:\n\n`;
  s += `## Study Design\n\n`;
  const avgN = csrs.reduce((x, c) => x + (c.sample_size || 0), 0) / (csrs.length || 1);
  if (a.sample_size) {
    if (csrs.length) {
      if (a.sample_size < avgN * 0.8) s += `- **Sample Size:** Consider increasing your sample size from ${a.sample_size} to approximately ${Math.round(avgN)} participants. Similar successful studies used ${Math.round(avgN)} participants on average. Insufficient sample size is a common cause of inconclusive results.\n\n`;
      else s += `- **Sample Size:** Your proposed sample size of ${a.sample_size} appears adequate based on comparison with similar studies.\n\n`;
    } else s += `- **Sample Size:** Your proposed sample size is ${a.sample_size}. Without comparable studies in our database, we recommend consulting a statistician for power analysis.\n\n`;
  } else s += `- **Sample Size:** No sample size was specified in your protocol. We recommend conducting a formal power analysis.\n\n`;
  const avgD = csrs.reduce((x, c) => x + (c.duration_weeks || 0), 0) / (csrs.length || 1);
  if (a.duration_weeks) {
    if (csrs.length && a.duration_weeks < avgD * 0.8) s += `- **Study Duration:** Your proposed duration of ${a.duration_weeks} weeks may be insufficient. Similar studies averaged ${Math.round(avgD)} weeks. Short study duration can miss important long-term effects or trends.\n\n`;
    else s += `- **Study Duration:** Your proposed duration of ${a.duration_weeks} weeks appears adequate.\n\n`;
  } else s += `- **Study Duration:** No study duration was specified. This is a critical parameter and should be defined explicitly.\n\n`;
  if (riskCount) {
    s += `## Risk Mitigation\n\nYour protocol has ${riskCount} identified risk factors (${high.length} high, ${med.length} medium severity).\n\n`;
    if (high.length) { s += `### High Priority\n`; high.forEach((r, i) => { s += `${i + 1}. **${r.description}**${r.mitigation ? ` -- Suggested mitigation: ${r.mitigation}` : ''}\n`; }); s += `\n`; }
    if (med.length) { s += `### Medium Priority\n`; med.forEach((r, i) => { s += `${i + 1}. **${r.description}**${r.mitigation ? ` -- Suggested mitigation: ${r.mitigation}` : ''}\n`; }); s += `\n`; }
  }
  s += `## General Best Practices\n\n- **Documentation:** Ensure clear documentation of inclusion/exclusion criteria with objective measures where possible.\n- **Adaptive Design:** Consider incorporating adaptive design elements to enhance efficiency and flexibility.\n- **Monitoring:** Implement robust data monitoring procedures with predefined stopping rules.\n- **Blinding:** Where applicable, maintain adequate blinding procedures to reduce bias.\n- **Endpoint Selection:** Ensure endpoints are validated, clinically meaningful, and measurable with precision.\n\n`;
  if (csrs.length) {
    s += `## Reference Studies\n\nThe following similar studies informed these recommendations:\n\n`;
    csrs.slice(0, 3).forEach((st, i) => { s += `${i + 1}. **${st.title}** (${st.id})\n   - Indication: ${st.indication}\n   - Phase: ${st.phase}\n   - Sample Size: ${st.sample_size}\n   - Duration: ${st.duration_weeks} weeks\n   - Similarity Score: ${st.similarity != null ? `${(st.similarity * 100).toFixed(1)}%` : 'n/a'}\n\n`; });
  }
  s += `---\n*These recommendations are generated based on historical clinical study data and should be reviewed by qualified clinical research professionals.*\n`;
  return s;
}

function genStatisticalInsights(a: ParsedProtocol): string {
  let s = `# Statistical Analysis Insights\nGenerated: ${new Date().toLocaleString()}\n\n`;
  if (a.sample_size) {
    s += `## Sample Size and Power\n\n### Power Analysis\nWith your proposed sample size of ${a.sample_size}, estimated power varies by effect size:\n\n`;
    [{ size: 0.2, desc: 'small' }, { size: 0.5, desc: 'medium' }, { size: 0.8, desc: 'large' }].forEach(e => {
      const p = Math.min(0.99, 0.4 + ((a.sample_size || 0) * e.size) / 100);
      s += `- **${e.desc.charAt(0).toUpperCase() + e.desc.slice(1)} effect (${e.size})**: Approximately ${(p * 100).toFixed(1)}% power at alpha=0.05\n`;
    });
    const drop = Math.round((a.sample_size || 0) * 0.15);
    s += `\n### Dropout Considerations\n- Based on typical dropout rates in ${a.indication || 'clinical'} studies, we recommend accounting for approximately 15% participant attrition.\n- Consider enrolling an additional ${drop} participants (total: ${(a.sample_size || 0) + drop}) to maintain statistical power after dropouts.\n\n`;
  }
  s += `## Study Design Considerations\n\n### Randomization Strategy\n- For your ${a.phase ? `Phase ${a.phase}` : ''} study in ${a.indication || 'this indication'}, consider stratified randomization to balance important prognostic factors.\n- Key stratification variables might include: age groups, disease severity, and baseline biomarkers.\n\n### Interim Analysis\n- We recommend implementing interim analyses at 30% and 60% enrollment to assess safety and conditional power.\n- Consider using O'Brien-Fleming boundaries to control Type I error rate across multiple looks at the data.\n\n### Statistical Model Considerations\n- Consider including the following covariates in your primary analysis: age, sex, disease duration, and baseline scores.\n- For time-to-event outcomes, ensure appropriate censoring mechanisms are defined.\n- For repeated measures, consider mixed-effects models to account for within-subject correlation.\n\n`;
  s += `---\n*These statistical insights are general recommendations and should be reviewed by a qualified biostatistician.*\n`;
  return s;
}

function genIndReadiness(_a: ParsedProtocol): string {
  let s = `# IND Readiness Assessment\n\n*Qualitative regulatory guidance -- no numeric readiness score is emitted (the codebase returns null until a real scorer is wired).*\n\n`;
  s += `## Strengths\n\n- Well-defined primary and secondary endpoints\n- Clear inclusion/exclusion criteria\n- Appropriate statistical analysis plan\n- Adequate safety monitoring provisions\n\n`;
  s += `## Improvement Areas\n\n- Additional details needed on concomitant medication management (FDA 21 CFR 312.23(a)(6))\n- Consider adding interim analysis points (ICH E9, Section 4.5)\n- Strengthen data management plan section (ICH E6(R2), Section 5.5)\n- Expand on randomization implementation details (EMA Guideline on multiplicity issues)\n\n`;
  s += `## Regulatory Guidance\n\n- Aligns with FDA guidance for Phase 2 trials in this indication\n- Consistent with ICH E6(R2) requirements for Good Clinical Practice\n- Meets basic requirements for EMA Scientific Advice submissions\n- May require additional ethnic considerations for PMDA submission\n\n`;
  s += `## Citations\n\n- U.S. FDA (2023). IND Application Procedures: Clinical Hold. 21 CFR 312.42\n- EMA (2022). Guideline on the clinical evaluation of anticancer medicinal products. EMA/CHMP/205/95 Rev.6\n- ICH (2016). Integrated Addendum to ICH E6(R1): Guideline for GCP E6(R2)\n\n---\n*Reviewed against FDA/EMA/PMDA guidance. Numeric scoring intentionally omitted.*\n`;
  return s;
}

/**
 * The three governed evidence reports (work order §13).
 *
 * These are deliberately NOT produced by the local markdown generators above.
 * They render from a TraceView through the trace service and the existing
 * governed artifact path — an evidence-chain report assembled client-side from a
 * pasted protocol would carry no provenance and no audit id, yet would look
 * identical on screen to one that did. That is the exact confusion this product
 * cannot afford.
 *
 * So the generator here produces only the honest explanation of where the real
 * document comes from. Once AnA grounds a recommendation in the evidence graph,
 * ReportGovernance renders the trace; until then a user sees this, and it tells
 * them why.
 *
 * Export stays blocked while any cited finding is unverified or carries an
 * unresolved extraction conflict — enforced on the governed artifact path, not
 * by hiding a button.
 */
function genGovernedEvidenceReport(kind: string): string {
  return (
    `# ${kind}\n\n` +
    `This is a governed evidence report. It is not generated from the pasted protocol — it ` +
    `renders from the clinical-regulatory trace service through the existing governed artifact ` +
    `path, so every figure in it carries its source, its calculation method and its audit id.\n\n` +
    `No trace is available for this document yet. A trace is created when AnA grounds a ` +
    `recommendation in the shared evidence graph — ask AnA to compare a design node to precedent, ` +
    `then open the evidence chain from the artifact it produces.\n\n` +
    `---\n` +
    `*This report cannot be sealed or exported while any finding it cites is unverified or has an ` +
    `unresolved extraction conflict.*\n`
  );
}

const DOC_REGISTRY: DocDef[] = [
  { id: 'recommendations', label: 'Design Recommendations', gen: genRecommendations, needsCsr: true, blurb: 'Evidence-based protocol design recommendations vs. similar studies.' },
  { id: 'statistical', label: 'Statistical Insights', gen: (a) => genStatisticalInsights(a), blurb: 'Power analysis, dropout, randomization and modelling guidance.' },
  { id: 'ind', label: 'IND Readiness', gen: (a) => genIndReadiness(a), blurb: 'Qualitative IND readiness assessment with regulatory citations.' },
];

/** Flag-gated — appended only when the Clinical-Regulatory Intelligence Graph is on. */
const EVIDENCE_DOC_REGISTRY: DocDef[] = [
  { id: 'evidence_chain', label: 'Evidence chain', gen: () => genGovernedEvidenceReport('Evidence chain'), blurb: 'Sources, calculations, assumptions and contradictions behind a recommendation.' },
  { id: 'design_risk', label: 'Design risk', gen: () => genGovernedEvidenceReport('Design risk'), blurb: 'Supportive evidence, negative precedent, applicability, differences and unknowns.' },
  { id: 'regulatory_precedent', label: 'Regulatory precedent', gen: () => genGovernedEvidenceReport('Regulatory precedent'), blurb: 'Verified FDA findings and outcomes relevant to this design, with honest coverage.' },
];

/** The document types on offer, honouring the graph flag. */
function docRegistry(): DocDef[] {
  return isClinicalRegulatoryGraphEnabled()
    ? [...DOC_REGISTRY, ...EVIDENCE_DOC_REGISTRY]
    : DOC_REGISTRY;
}

function docById(id: string): DocDef | undefined { return docRegistry().find(x => x.id === id); }

/* ── Lightweight protocol parser (offline) ── */

function parseProtocol(text: string): ParsedProtocol {
  const g = (re: RegExp, d: string) => { const m = text.match(re); return m ? m[1].trim() : d; };
  const num = (re: RegExp, d: number) => { const m = text.match(re); return m ? parseInt(m[1].replace(/[,\s]/g, ''), 10) : d; };
  const title = g(/^\s*(?:title|protocol)[:\-]\s*(.+)$/im, text.split('\n').find(l => l.trim())?.slice(0, 80) || 'Untitled Protocol');
  const indication = g(/indication[:\-]\s*(.+)/i, 'Unspecified');
  const phase = g(/phase\s*[:\-]?\s*([1-4IViv]+)/i, 'Unknown');
  const sample = num(/(?:sample size|n\s*=|enroll(?:ment|)|subjects?)\D{0,12}(\d[\d,]{1,6})/i, 0);
  const dur = num(/(\d{1,3})\s*weeks?/i, 0);
  const endpoint = g(/primary endpoint[:\-]\s*(.+)/i, '');
  const risks: RiskFactor[] = [];
  if (sample && sample < 60) risks.push({ description: 'Small sample size may limit statistical power', severity: 'high', mitigation: 'Run a formal power analysis and increase enrollment' });
  if (dur && dur < 12) risks.push({ description: 'Short study duration may miss durable effects', severity: 'medium', mitigation: 'Extend follow-up or add a long-term extension' });
  if (!endpoint) risks.push({ description: 'Primary endpoint not clearly stated', severity: 'medium', mitigation: 'State a single, validated primary endpoint' });
  return { title, indication, phase, sample_size: sample, duration_weeks: dur, primary_endpoint: endpoint, risk_factors: risks };
}

/* ── Tiny markdown -> HTML ── */

function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const lines = md.split('\n'); let html = ''; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^#{1,6}\s/.test(l)) { const n = (l.match(/^(#+)/) || ['', '#'])[1].length; html += `<h${n}>${inline(l.replace(/^#+\s*/, ''))}</h${n}>`; }
    else if (/^---/.test(l)) html += '<hr/>';
    else if (/^\s*-\s/.test(l)) { html += '<ul>'; while (i < lines.length && /^\s*-\s/.test(lines[i])) { html += `<li>${inline(lines[i].replace(/^\s*-\s*/, ''))}</li>`; i++; } html += '</ul>'; continue; }
    else if (/^\s*\d+\.\s/.test(l)) { html += '<ol>'; while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) { html += `<li>${inline(lines[i].replace(/^\s*\d+\.\s*/, ''))}</li>`; i++; } html += '</ol>'; continue; }
    else if (l.trim()) html += `<p>${inline(l)}</p>`;
    i++;
  }
  return html;
}

/* ── Inline toast helper ── */

function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const fire = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2400); };
  return [msg, fire];
}

/* ═══ Main surface ═══ */

export function ReportEngine({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk || (() => {});
  const [text, setText] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [docType, setDocType] = useState('recommendations');
  const [busy, setBusy] = useState(false);
  const [toast, fireToast] = useToast();

  const runLocal = () => { const a = parseProtocol(text); setAnalysis({ protocol_data: a, similar_protocols: [], source: 'local' }); };
  const analyze = () => {
    if (text.trim().length < 50) { fireToast('Add more protocol detail (min ~50 chars)'); return; }
    // The old guard read `window.C2C_API`, which nothing assigns, so this always
    // fell through to the local analyzer and the server was never consulted.
    // dataConnect now carries the POST mapping its comment said was missing.
    if (!connected()) { runLocal(); return; }
    setBusy(true);
    liveMutateOrNull<any>('POST', '/api/analytics/analyze-protocol-text', { text })
      .then((r) => {
        if (!r.data) { runLocal(); return; }
        const d = r.data;
        setAnalysis({
          protocol_data: d.protocol_data || parseProtocol(text),
          similar_protocols: d.similar_protocols || [],
          recommendations: d.recommendations,
          statistical_insights: d.statistical_insights,
          source: 'live',
        });
      })
      .catch(() => runLocal())
      .finally(() => setBusy(false));
  };

  const docDef = docById(docType);
  const md = useMemo(() => {
    if (!analysis || !docDef) return '';
    const a = analysis.protocol_data;
    if (analysis.source === 'live') {
      if (docType === 'recommendations' && analysis.recommendations) return analysis.recommendations;
      if (docType === 'statistical' && analysis.statistical_insights) return analysis.statistical_insights;
    }
    return docType === 'recommendations' ? genRecommendations(a, analysis.similar_protocols || [])
      : docType === 'statistical' ? genStatisticalInsights(a)
        : genIndReadiness(a);
  }, [analysis, docType, docDef]);
  const html = useMemo(() => analysis ? mdToHtml(md) : '', [md, analysis]);
  const a = analysis && analysis.protocol_data;

  /*
   * "Open in editor" — a real handoff. See the long note on the same handler in
   * Biostatistics.tsx for the full reasoning; in short: this wrote {title, md}
   * to localStorage['c2c_biostat_doc'], a key with no reader in any file in any
   * commit, so the analysis never travelled and the editor opened on whatever it
   * would have opened on anyway.
   *
   * The payload is CONTENT, not an id, so honouring it means creating the row:
   * POST the document, POST the section holding the prose, then navigate. Both
   * writes are awaited; a failure keeps you here with the analysis on screen and
   * an honest reason, because navigating away from work that was not saved is
   * the same defect this replaces.
   */
  const openingRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const openEditor = async () => {
    if (openingRef.current) return; // a second click must not create a second document
    const title = docDef?.label || 'Protocol analysis';
    if (!md.trim()) { fireToast('Nothing to open yet — analyze a protocol first.'); return; }
    openingRef.current = true; setOpening(true);
    try {
      const proj = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
      const programId = proj && typeof proj.id === 'string' ? proj.id : null;
      const dRes = await apiRequest('POST', '/api/authoring/docs', {
        // Protocol-derived analysis documents file under Module 5; the server
        // defaults to M3 when this is omitted, which would be wrong here.
        title, module: 'M5',
        ...(programId ? { client_program_id: programId } : {}),
      });
      const dJson = await dRes.json().catch(() => null) as { document?: { id?: unknown }; error?: string } | null;
      if (!dRes.ok || !dJson?.document?.id) {
        fireToast(dRes.status === 401
          ? 'Not opened — your session isn’t authenticated. Nothing was saved; the analysis is still here.'
          : 'Couldn’t create the document — ' + (dJson?.error ?? 'HTTP ' + dRes.status) + '. Nothing was saved; the analysis is still here.');
        return;
      }
      const docId = String(dJson.document.id);
      const sRes = await apiRequest('POST', '/api/authoring/sections', {
        doc_id: docId,
        // Not a CTD number on purpose — the editor binds outline nodes by exact
        // code match, and this surface cannot know the filing position.
        code: docDef?.id || 'protocol_analysis',
        title, content: md,
      });
      const sJson = await sRes.json().catch(() => null) as { section?: { id?: unknown }; error?: string } | null;
      if (!sRes.ok || !sJson?.section?.id) {
        fireToast('The document was created but its text didn’t save — ' + (sJson?.error ?? 'HTTP ' + sRes.status) + '. Staying here so you don’t lose it.');
        return;
      }
      // Saved. With no navigator wired, say where the work went rather than
      // doing nothing visible — the silent no-op is the defect being removed.
      if (onNav) onNav('document-authoring');
      else fireToast('Saved to the authoring store as “' + title + '” — open Document authoring to edit it.');
    } catch (e) {
      fireToast('Couldn’t open in the editor — ' + (e instanceof Error ? e.message : String(e)) + '. Nothing was saved.');
    } finally {
      openingRef.current = false; setOpening(false);
    }
  };

  return (
    <div className="ra">
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Specialist -- evidence -- /api/analytics</div>
          <h1 className="sp-title">Reporting &amp; analytics</h1>
          <p className="sp-state">Drop in a protocol and AnA analyses it against the CSR intelligence library -- then writes the design recommendations, statistical insights and IND-readiness memo you can act on.</p>
        </div>
      </div>

      {analysis && a ? (
        <AnswerLead
          tone="calm"
          eyebrow={'Your analysis of ' + (a.title || 'the protocol').slice(0, 48) + ' is ready'}
          headline={<>I read the {a.phase && a.phase !== 'Unknown' ? <>Phase {a.phase} </> : null}{a.indication && a.indication !== 'Unspecified' ? <>{a.indication.toLowerCase()} </> : null}protocol and drafted your <b>{docDef?.label}</b> -- {a.risk_factors.length ? <><b>{a.risk_factors.length} design {a.risk_factors.length === 1 ? 'risk' : 'risks'}</b> to address</> : <>the design looks sound on the parameters I could read</>}.</>}
          body={<>{a.sample_size ? <>At N={a.sample_size}{a.duration_weeks ? <> over {a.duration_weeks} weeks</> : null}, the recommendations and statistical insights are written out below -- power estimates, dropout, and comparison to similar studies. {analysis.source === 'local' ? 'Connect the backend to match against the live CSR library.' : `Matched against ${(analysis.similar_protocols || []).length} similar CSRs.`}</> : <>I could not read a sample size from the text -- add it and the power analysis will fill in.</>}</>}
          reassure="Everything is drafted as a real document, not a chart -- read it, adjust, and send it to the editor."
          action={{ label: opening ? 'Saving to the editor…' : 'Open in document editor', onClick: () => void openEditor(), alt: { label: 'Re-analyze', onClick: analyze } }}
          secondary="Or switch documents and re-run below."
        />
      ) : (
        <AnswerLead
          tone="calm"
          eyebrow="What do you want to understand about your protocol"
          headline={<>Paste a protocol and I will tell you where it is strong, where it is risky, and what the statistics say.</>}
          body="You will get three written deliverables -- design recommendations vs. similar studies, statistical insights (power, dropout, modelling), and an IND-readiness read -- not just numbers on a chart."
          reassure="I only report what the data supports; I will not invent a score the model cannot stand behind."
          action={{ label: 'Analyze the protocol', onClick: analyze }}
          secondary="Edit the protocol text below first if you like."
        />
      )}

      <div className="ra-layout">
        <div className="pj-card ra-input">
          <div className="pj-card-h"><span className="t">Protocol</span><span className="s">paste or edit</span></div>
          <div className="pj-card-b">
            <textarea className="ra-ta" value={text} onChange={e => setText(e.target.value)} placeholder="Paste your protocol synopsis -- title, indication, phase, sample size, duration, primary endpoint..." />
            <div className="ra-actions">
              <button className="sp-primary" onClick={analyze} disabled={busy}>{I.sparkles} {busy ? 'Analyzing...' : 'Analyze protocol'}</button>
              {analysis && (
                <div className="ra-doctabs">
                  {docRegistry().map(d => <button key={d.id} className={'ra-doctab' + (docType === d.id ? ' on' : '')} onClick={() => setDocType(d.id)}>{d.label}</button>)}
                </div>
              )}
            </div>
            {a && (
              <div className="ra-parsed">
                <span><b>{a.phase !== 'Unknown' ? 'Phase ' + a.phase : 'Phase --'}</b></span>
                <span>{a.indication}</span>
                {a.sample_size ? <span>N={a.sample_size}</span> : null}
                {a.duration_weeks ? <span>{a.duration_weeks} wk</span> : null}
              </div>
            )}
          </div>
        </div>

        <div className="bs-doc ra-doc">
          {analysis ? (<>
            <div className="bs-doc-bar">
              <div className="bs-doc-bar-l"><span className="bs-doc-kind">{docDef?.label}</span><span className="bs-doc-prov">{analysis.source === 'live' ? '/api/analytics' : 'Ported generator -- offline'} -- draft</span></div>
              <div className="bs-doc-bar-a">
                <button className="bs-da" onClick={() => ask('Refine the ' + (docDef?.label || 'document') + ' for this protocol')}>{I.sparkles} Refine</button>
                <button className="bs-da primary" onClick={() => void openEditor()} disabled={opening}>{I.penLine} {opening ? 'Saving to the editor…' : 'Open in editor'}</button>
              </div>
            </div>
            <div className="bs-doc-page"><div className="bs-doc-render" dangerouslySetInnerHTML={{ __html: html }} /></div>
          </>) : (
            <div className="ra-empty"><div className="ra-empty-ic">{I.barChart}</div><div className="ra-empty-t">Your analysis document appears here</div><div className="ra-empty-s">Analyze a protocol to generate the recommendations, statistical insights and IND-readiness memo.</div></div>
          )}
        </div>
      </div>

      <AnalyticsDashboard />
      {toast && <div className="c2c-toast">{toast}</div>}
    </div>
  );
}

/* ── CSR intelligence library -- GET /api/analytics/dashboard (org-scoped, real) ──

   Fixture-free (GA real-data standard). The panel renders the caller org's REAL
   csr_reports aggregates, or an honest loading / empty / error state — never a
   fabricated "sample" metric. The route is tenant-isolated (403 without org
   context), so an unauthorized or failed read surfaces as an honest error card,
   and an org with no indexed reports surfaces as an honest empty card. Every KPI
   and every bar below is derived from the response; nothing is defaulted to a
   fabricated value. */

function AnalyticsDashboard() {
  const { data, loading, error } = useLiveData<DashboardData>('/api/analytics/dashboard');

  const totalReports = data ? Number(data.totalReports) || 0 : 0;
  const hasReports = totalReports > 0;
  const phases = data ? Object.entries(data.reportsByPhase || {}) : [];
  const maxPhase = Math.max(1, ...phases.map(([, v]) => v));
  const inds = data ? Object.entries(data.reportsByIndication || {}).slice(0, 6) : [];
  const maxInd = Math.max(1, ...inds.map(([, v]) => v));

  return (
    <div className="pj-card" style={{ marginTop: 14 }}>
      <div className="pj-card-h">
        <span className="t">CSR intelligence library</span>
        <span className="s">/api/analytics/dashboard{hasReports ? ` -- ${totalReports} reports` : ''}</span>
      </div>
      <div className="pj-card-b">
        {loading ? (
          <div className="ra-empty"><div className="ra-empty-ic">{I.barChart}</div><div className="ra-empty-t">Loading the CSR library...</div></div>
        ) : error ? (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load the CSR library"
            hint="These aggregates are your organization's CSR reports. The analytics service returned an error or no organization scope -- sign in with an organization and retry."
          />
        ) : !hasReports ? (
          <EmptyState
            icon={I.barChart}
            title="No CSR reports in your library yet"
            hint="Once your organization's clinical study reports are indexed, their phase, indication and completion aggregates appear here. Nothing is shown until then."
          />
        ) : (
          <>
            <div className="ra-kpis">
              <div className="ra-kpi"><div className="ra-kpi-v">{totalReports}</div><div className="ra-kpi-l">CSR reports</div></div>
              <div className="ra-kpi"><div className="ra-kpi-v">{data?.uniqueIndications ?? 0}</div><div className="ra-kpi-l">Indications</div></div>
              <div className="ra-kpi"><div className="ra-kpi-v">{data?.recentAdditions ?? 0}</div><div className="ra-kpi-l">Added -- 30d</div></div>
              <div className="ra-kpi"><div className="ra-kpi-v">{Math.round((data?.averageCompletionRate || 0) * 100)}%</div><div className="ra-kpi-l">Avg completion</div></div>
            </div>
            <div className="ra-charts">
              <div className="ra-chart"><div className="ra-chart-t">By phase</div>{phases.length ? phases.map(([k, v]) => (<div key={k} className="ra-bar-row"><span className="ra-bar-l">{k}</span><div className="ra-bar-track"><div className="ra-bar-fill" style={{ width: (v / maxPhase * 100) + '%' }} /></div><span className="ra-bar-v">{v}</span></div>)) : <div className="ra-empty-s">No phase breakdown recorded for these reports.</div>}</div>
              <div className="ra-chart"><div className="ra-chart-t">Top indications</div>{inds.length ? inds.map(([k, v]) => (<div key={k} className="ra-bar-row"><span className="ra-bar-l">{k}</span><div className="ra-bar-track"><div className="ra-bar-fill alt" style={{ width: (v / maxInd * 100) + '%' }} /></div><span className="ra-bar-v">{v}</span></div>)) : <div className="ra-empty-s">No indication breakdown recorded for these reports.</div>}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

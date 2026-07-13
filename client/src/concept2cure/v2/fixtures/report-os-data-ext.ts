/* Report-OS extended functions -- complex logic that depends on external
   program/GI state. Ported from kit report-os-data.jsx (window globals). */

import {
  RO_TIERS, RO_FEATURE_TIER, RO_FEATURE_LABEL, RO_FAMILY, RO_TYPES,
  roFeatureForType, roDecide, roFilterForSegment, roPresetsForSeg,
  roRouteIntent, roMarketsIn, roResolveType,
  type RoReportType, type RoPreset,
} from './report-os-data';

/* ---- Types ---- */

export interface RoProgram {
  code: string; label: string; filing: string; indication: string;
  readiness: number | null; scope: string; scopeId: string;
  agency?: string; pdufa?: string | null;
}

export interface RoProgramRegistry {
  [seg: string]: {
    code: string; indication: string; app?: string; readiness?: number;
    agency?: string; target?: { label: string; v: string };
  };
}

interface GiBinding {
  program: { code: string; name: string; filing: string; indication?: string; scope?: string };
  findings: Array<{ title: string; severity?: string; contradictionType?: string; deterministicRule?: string }>;
  checks: Array<{ k: string; detail: string }>;
}

export interface RenderedSection {
  id: string; title: string;
  blocks: Array<Record<string, unknown>>;
}

export interface RenderedReport {
  reportTypeId: string; reportTypeLabel: string;
  scopeType: string; scopeId: string;
  generatedAt: string; status: string;
  truthfulness: { allowedStatus: string; downgradedFrom: string; reasons: string[] };
  sections: RenderedSection[];
}

export interface RoAnaReplyResult {
  tool: string; text: string;
  locked?: { feature: string; requiredTier: string; typeLabel: string };
  question?: boolean;
  chips?: [string, string][];
  report: RenderedReport | null;
  dashboard: Record<string, unknown> | null;
}

/* ---- Program resolver ---- */

export function roProgram(
  seg: string,
  pjPrograms?: RoProgramRegistry,
  giBySeg?: Record<string, GiBinding>,
): RoProgram {
  const pj = (pjPrograms || {} as RoProgramRegistry)[seg];
  const gi = (giBySeg || {} as Record<string, GiBinding>)[seg];
  if (pj) {
    return {
      code: pj.code, label: pj.indication, filing: (pj.app || '').split(' · ')[0] || pj.app || '',
      indication: pj.indication, readiness: pj.readiness ?? null,
      scope: 'program', scopeId: pj.code, agency: pj.agency,
      pdufa: (pj.target && /PDUFA|action/i.test(pj.target.label)) ? pj.target.v : null,
    };
  }
  if (gi) {
    return {
      code: gi.program.code, label: gi.program.name, filing: gi.program.filing,
      indication: gi.program.indication || '', readiness: null,
      scope: gi.program.scope || 'submission', scopeId: gi.program.code,
    };
  }
  return {
    code: 'BX-204', label: 'Bextrelimab', filing: 'NDA',
    indication: 'Oncology', readiness: 88, scope: 'program', scopeId: 'BX-204',
  };
}

/* ---- Rendered report builder ---- */

function S(id: string, title: string, blocks: Array<Record<string, unknown>>): RenderedSection {
  return { id, title, blocks };
}

export function roRenderReport(
  type: RoReportType, seg: string,
  pjPrograms?: RoProgramRegistry, giBySeg?: Record<string, GiBinding>,
): RenderedReport {
  const p = roProgram(seg, pjPrograms, giBySeg);
  const gi = (giBySeg || {} as Record<string, GiBinding>)[seg] || { findings: [], checks: [] };
  const findings = gi.findings || [];
  const blockingTitles = findings.filter(f => f.contradictionType === 'dosage_conflict').map(f => f.title);
  const now = new Date().toISOString();
  const disclosure = {
    kind: 'disclosure', method: 'RIM foresight model · deterministic + AI-refined signals',
    confidence: 0.0, validated: false,
    note: 'Advisory only — the predictive model is not validated for regulatory decision-making. Every projected value is provisional and must be confirmed against the governed record.',
  };
  let sections: RenderedSection[] = [];
  const fam = type.family;
  const id = type.typeId;

  if (id === 'readiness.executive_digest' || id === 'ema.maa_readiness_assessment' || id === 'china_nmpa.registration_dossier_readiness' || fam === 'usa_fda_pma') {
    const r = p.readiness;
    const readLabel = r == null ? 'not yet computed' : (r >= 85 ? 'on track' : r >= 60 ? 'in assembly' : 'early');
    sections = [
      S('overview', 'Executive summary', [
        { kind: 'summary', text: `${p.code} — ${p.filing}${p.indication ? ' · ' + p.indication : ''}. Submission readiness is ${r == null ? 'not yet computed' : r + '%'} (${readLabel})${blockingTitles.length ? `, with ${blockingTitles.length} item${blockingTitles.length > 1 ? 's' : ''} blocking promotion` : ''}.` },
        { kind: 'metric', label: 'Submission readiness', value: r ?? null, unit: '%', status: r == null ? 'missing' : r >= 85 ? 'ready' : 'partial', provenance: [{ sourceTable: 'submission_readiness', sourceField: 'score', recordId: p.code, transformation: 'computeInitialRun confidence' }] },
        { kind: 'metric', label: 'Blocking items', value: blockingTitles.length, status: blockingTitles.length ? 'partial' : 'ready', provenance: [{ sourceTable: 'contradiction_findings', transformation: 'authority=blocks_promotion' }] },
        { kind: 'metric', label: 'Target action', value: p.pdufa ?? null, status: p.pdufa ? 'ready' : 'missing', provenance: p.pdufa ? [{ sourceTable: 'submission_ops', sourceField: 'pdufa_date', recordId: p.code }] : undefined },
      ]),
      S('readiness', 'Readiness signal', [
        { kind: 'chart', chartType: 'readiness_ring', spec: { value: r ?? 0, label: 'Readiness' }, provenance: [{ sourceTable: 'submission_readiness', recordId: p.code }] },
      ]),
    ];
    if (findings.length) {
      sections.push(S('gaps', 'Gaps & blockers', [
        ...(blockingTitles.length ? [{ kind: 'blocker-list', items: blockingTitles }] : []),
        { kind: 'gap-list', items: findings.filter(f => f.contradictionType !== 'dosage_conflict').map(f => ({ title: f.title, severity: f.severity, message: f.deterministicRule || '' })) },
      ]));
    }
    sections.push(S('read', 'AnA read', [
      { kind: 'narrative', text: `${p.code} is ${readLabel}. ${blockingTitles.length ? 'Clear the ' + blockingTitles.length + ' blocking item' + (blockingTitles.length > 1 ? 's' : '') + ' before promoting into the submission sequence; ' : ''}the remaining items are advisory and can be resolved in parallel with assembly.`, aiGenerated: true, disclosure: 'Narrative summarizes governed metrics; it originates no new numbers.' },
    ]));
  } else if (id === 'usa_fda.estar_510k_equivalence_matrix') {
    const checks = gi.checks || [];
    sections = [
      S('se', 'Substantial-equivalence summary', [
        { kind: 'summary', text: `${p.code} — ${p.filing}. Predicate comparison and performance claims are consistent across the SE discussion, the 510(k) summary and the IFU.` },
        { kind: 'metric', label: 'Substantial equivalence', value: 'Supported', status: 'ready', provenance: [{ sourceTable: 'substantial_equivalence', recordId: p.code }] },
      ]),
      S('matrix', 'Predicate equivalence matrix', [
        { kind: 'table', columns: ['Attribute', 'Subject', 'Predicate', 'Assessment'],
          rows: [
            ['Accuracy (MARD)', '8.2%', '8.7%', 'Equivalent'],
            ['Intended use', 'CGM', 'CGM', 'Same'],
            ['Labeling claim', 'Matches pivotal', '—', 'No over-statement'],
          ], provenance: [{ sourceTable: 'predicate_mapping', recordId: p.code, transformation: 'testing_coverage cross-ref' }] },
      ]),
    ];
    if (checks.length) {
      sections.push(S('checks', 'Consistency checks', [
        { kind: 'gap-list', items: checks.map(c => ({ title: c.k + ' — consistent', severity: 'low', message: c.detail })) },
      ]));
    }
  } else if (fam === 'prediction') {
    const isPremortem = id === 'prediction.crl_rtf_premortem';
    sections = [
      S('forecast', isPremortem ? 'CRL / RTF pre-mortem' : 'Regulatory forecast', [
        { kind: 'summary', text: isPremortem
          ? `${p.code} — ${p.filing}. Advisory projection of refuse-to-file and complete-response-letter risk from the deficiency-risk model. Not a prediction of the agency's decision.`
          : `${p.code} — ${p.filing}. Advisory trajectory of the submission-readiness twin toward an approval / review / deficiency outcome. Current readiness ${p.readiness == null ? 'not yet computed' : p.readiness + '%'}.` },
        { kind: 'chart', chartType: 'forecast_band', spec: { anchor: p.readiness ?? 60, label: isPremortem ? 'Deficiency risk' : 'Readiness trajectory' }, provenance: [{ sourceTable: isPremortem ? 'deficiency_risk' : 'readiness_trend', recordId: p.code }] },
      ]),
      S('method', 'Method & limits', [disclosure]),
    ];
  } else {
    sections = [
      S('summary', (RO_FAMILY[fam] || {}).label || 'Report', [
        { kind: 'summary', text: `${type.label} for ${p.code} — ${p.filing}. Structure and governance rules are set; concrete values populate when the live provider (${(RO_FAMILY[fam] || {}).label || fam}) runs against this scope.` },
        { kind: 'metric', label: 'Items in scope', value: null, status: 'missing', provenance: [{ sourceTable: 'provider', transformation: 'awaiting live run' }] },
        { kind: 'metric', label: 'Completeness', value: null, unit: '%', status: 'missing' },
      ]),
      S('note', 'How this fills', [
        { kind: 'disclosure', method: 'Governed provider · ' + (type.t?.requireExplicitGaps ? 'explicit-gaps required' : 'partial allowed'), validated: false, note: 'Unsourced values are shown as missing, never estimated. Connect the live backend to populate this report from ' + type.scopes.join(' / ') + ' scope data.' },
      ]),
    ];
  }

  return {
    reportTypeId: type.typeId, reportTypeLabel: type.label, scopeType: p.scope, scopeId: p.scopeId,
    generatedAt: now, status: 'partial',
    truthfulness: {
      allowedStatus: 'partial', downgradedFrom: 'final',
      reasons: [
        'Sample render — not connected to the live governed providers',
        ...(type.t?.requireDisclosure ? ['Predictive model is not validated — advisory only'] : []),
      ],
    },
    sections,
  };
}

/* ---- Portfolio rollup ---- */

export function roPortfolio(pjPrograms?: RoProgramRegistry): Array<{ code: string; indication: string; filing: string; readiness?: number; seg: string }> {
  const rows: Array<{ code: string; indication: string; filing: string; readiness?: number; seg: string }> = [];
  const pj = pjPrograms || {};
  Object.keys(pj).forEach(seg => {
    const p = pj[seg];
    rows.push({ code: p.code, indication: p.indication, filing: (p.app || '').split(' · ')[0], readiness: p.readiness, seg });
  });
  return rows;
}

/* ---- Proactive opener ---- */

export function roSuggestForClient(
  seg: string,
  pjPrograms?: RoProgramRegistry, giBySeg?: Record<string, GiBinding>,
  memAtoms?: unknown[],
): { headline: string; body: string; preset: RoPreset; prompts: string[] } {
  const p = roProgram(seg, pjPrograms, giBySeg);
  const preset = roPresetsForSeg(seg)[0];
  const mem = (memAtoms || []).length;
  const rBit = p.readiness == null ? `${p.code} is in ${p.filing} preparation` : `${p.code} is ${p.readiness}% ready`;
  const pduBit = p.pdufa ? ` with a target action date of ${p.pdufa}` : '';
  const histBit = mem ? ` I’m also drawing on ${mem} thing${mem > 1 ? 's' : ''} I remember about how you work.` : '';
  return {
    headline: 'I can build any report or dashboard you need — just ask.',
    body: `Looking across your portfolio, ${rBit}${pduBit}. Based on that and where each program sits, I’d start with the ${preset.label}.${histBit}`,
    preset,
    prompts: [
      `Build the ${preset.label}`,
      p.readiness != null ? `How ready is ${p.code} to file?` : `What reports can you run for ${p.code}?`,
      seg === 'pharma' || seg === 'biotech' ? 'What’s my CRL risk?' : 'Show the 510(k) equivalence matrix',
      'Compare readiness across all my programs',
    ],
  };
}

/* ---- Conversational brain ---- */

export function roAnaReply(
  utterance: string, seg: string, tier: string,
  ctx?: { report?: RenderedReport },
  pjPrograms?: RoProgramRegistry, giBySeg?: Record<string, GiBinding>,
): RoAnaReplyResult {
  ctx = ctx || {};
  const route = roRouteIntent(utterance);
  const name = route.matched ? route.name! : (route.candidates && route.candidates[0]) || 'generate_report';
  const p = roProgram(seg, pjPrograms, giBySeg);
  function cap(s: string): string { return (RO_TIERS.find(t => t.id === s) || { label: s }).label; }
  const lockMsg = (feature: string, typeLabel: string): RoAnaReplyResult => ({
    tool: name, text: `I can set up "${typeLabel}", but it needs the ${cap(RO_FEATURE_TIER[feature])} plan — it’s a ${RO_FEATURE_LABEL[feature]} capability. I won’t show an estimated result on a plan that hasn’t unlocked the governed model. Here’s what it includes and how to unlock it.`,
    locked: { feature, requiredTier: RO_FEATURE_TIER[feature], typeLabel }, report: null, dashboard: null,
  });
  const entitledFor = (t: RoReportType) => roDecide(t.typeId, t.family, tier);

  if (name === 'portfolio_readiness') {
    const dec = roDecide('portfolio_rollup', 'portfolio', tier);
    if (!dec.entitled) return lockMsg('portfolio_rollup', 'Portfolio readiness rollup');
    const rows = roPortfolio(pjPrograms);
    return { tool: name, text: `Here’s readiness across your ${rows.length} program${rows.length > 1 ? 's' : ''}. The numbers are the governed readiness scores — I’m ranking and framing them, not recomputing them.`,
      dashboard: { kind: 'portfolio', label: 'Portfolio readiness', why: 'Board view across all programs', rows }, report: null };
  }
  if (name === 'compare_regions') {
    const markets = roMarketsIn(utterance);
    if (markets.length < 2) return { tool: name, question: true, text: `Which markets should I compare for ${p.code}? Pick at least two.`, chips: [['FDA vs EMA', `Compare FDA and EMA for ${p.code}`], ['FDA vs EMA vs PMDA', `Compare FDA, EMA and PMDA for ${p.code}`], ['FDA vs NMPA', `Compare FDA and NMPA for ${p.code}`]], report: null, dashboard: null };
    return { tool: name, text: `Comparing ${markets.join(', ')} for ${p.code}. Where I don’t yet have a governed value for a market I’ll show it as missing rather than estimate it.`,
      dashboard: { kind: 'compare', label: `Regional comparison — ${p.code}`, why: markets.join(' · '), markets, program: p }, report: null };
  }
  if (name === 'explain_blockers') {
    const rep = ctx.report;
    if (!rep) return { tool: name, question: true, text: 'Which report should I explain? Generate or open one and I’ll walk through what’s holding it from final.', chips: [['Executive Readiness Digest', `Generate the executive readiness digest for ${p.code}`]], report: null, dashboard: null };
    const reasons = (rep.truthfulness && rep.truthfulness.reasons) || [];
    return { tool: name, text: `"${rep.reportTypeLabel}" is held at ${rep.status} because: ${reasons.join('; ')}. Clear those and it can promote toward final — I’ll narrate each blocker, but the status gate is deterministic.`, report: rep, dashboard: null };
  }
  if (name === 'get_prediction') {
    const isPre = /crl|rtf|reject|refuse/.test((utterance || '').toLowerCase());
    const t = RO_TYPES.find(x => x.typeId === (isPre ? 'prediction.crl_rtf_premortem' : 'prediction.regulatory_forecast'))!;
    const dec = entitledFor(t);
    if (!dec.entitled) return lockMsg(dec.feature, t.label);
    return { tool: name, text: `Here’s the ${t.label} for ${p.code}. It’s advisory — the model isn’t validated, so every projected value carries a disclosure and I present it as partial, never final.`, report: roRenderReport(t, seg, pjPrograms, giBySeg), dashboard: null };
  }
  const resolved = roResolveType(utterance, seg);
  if (name === 'list_report_types' || !resolved) {
    const cands = roFilterForSegment(RO_TYPES, seg).slice(0, 6);
    return { tool: 'list_report_types', question: true,
      text: `Tell me what you want to see and I’ll build it. For ${p.code} (${p.filing}) I can run any of these — or describe the question in your own words and I’ll pick the right governed report.`,
      chips: cands.map(t => [t.label, `Generate the ${t.label} for ${p.code}`] as [string, string]), report: null, dashboard: null };
  }
  const dec = entitledFor(resolved);
  if (!dec.entitled) return lockMsg(dec.feature, resolved.label);
  return { tool: 'generate_report', text: `Here’s the ${resolved.label} for ${p.code}. Every value is provenance-linked to a governed source — I’m assembling and explaining it, not originating any number. It’s ${resolved.t?.forbidFinal ? 'advisory (partial)' : 'partial until the live providers run'}.`, report: roRenderReport(resolved, seg, pjPrograms, giBySeg), dashboard: null };
}

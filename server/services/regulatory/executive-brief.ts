/**
 * IVD program executive-brief generator.
 *
 * Renders a program plan (from buildProgramPlan) into a structured Markdown
 * brief — a server-side text artifact suitable for export, email, or storage as
 * an ivd_generated_document. This is a document generator, not a UI.
 *
 * Deterministic given a plan.
 */

import type { ProgramPlan } from './program-plan';

export interface BriefSection {
  title: string;
  body: string;
}

export interface ExecutiveBrief {
  device: string;
  markdown: string;
  sections: BriefSection[];
}

const usd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** Render a program plan to a structured Markdown executive brief. */
export function generateExecutiveBrief(plan: ProgramPlan): ExecutiveBrief {
  const es = plan.executiveSummary;
  const sections: BriefSection[] = [];

  // 1) Executive summary
  sections.push({
    title: 'Executive summary',
    body: [
      `- **Device:** ${plan.device}`,
      `- **EU IVDR class:** ${es.ivdrClass} (confidence: ${es.ivdrConfidence}) — notified body ${es.notifiedBodyRequired ? 'required' : 'not required'}`,
      `- **US pathway:** ${es.fdaPathway}`,
      `- **Submission readiness:** ${es.readinessScore}/100 — verdict: ${es.verdict.replace(/_/g, ' ')} (risk tier: ${es.riskTier})`,
      es.cdxReadinessScore !== undefined ? `- **CDx co-development readiness:** ${es.cdxReadinessScore}/100` : '',
      `- **Estimated time-to-market:** ${es.estimatedCalendarWeeksP50} weeks (P50) / ${es.estimatedCalendarWeeksP90} weeks (P90)`,
      `- **Remaining evidence cost:** ${usd(es.totalRemainingCostUsd)}`,
    ].filter(Boolean).join('\n'),
  });

  // 2) Recommended next actions
  if (es.topNextActions.length > 0) {
    const rows = es.topNextActions
      .map((a, i) => `${i + 1}. **${a.label}** — +${a.readinessGain} readiness, ~${a.effortWeeks} wks, ${usd(a.costUsd)}${a.removesMajor ? ' _(clears a major deficiency)_' : ''}`)
      .join('\n');
    sections.push({ title: 'Recommended next actions (by impact)', body: rows });
  } else {
    sections.push({ title: 'Recommended next actions (by impact)', body: 'No further evidence is required to reach full readiness.' });
  }

  // 3) Classification rationale
  const matched = plan.classification.matchedRules.map(r => `- ${r.rule}: ${r.description}`).join('\n');
  sections.push({
    title: 'Classification',
    body: [
      `**Result:** Class ${plan.classification.classification}. ${plan.classification.conformityRoute}`,
      plan.classification.ambiguityNotes.length ? `\n**Notes:**\n${plan.classification.ambiguityNotes.map(n => `- ${n}`).join('\n')}` : '',
      matched ? `\n**Matched rules:**\n${matched}` : '',
    ].filter(Boolean).join('\n'),
  });

  // 4) Readiness & deficiencies
  const c = plan.review.counts;
  const topFindings = plan.review.findings
    .filter(f => f.severity === 'major' || f.severity === 'deficiency')
    .slice(0, 8)
    .map(f => `- _${f.severity}_ — **${f.area}:** ${f.finding}`)
    .join('\n');
  sections.push({
    title: 'Readiness & deficiencies',
    body: [
      `Findings: ${c.major} major, ${c.deficiency} deficiency, ${c.minor} minor. Estimated review cycles: ${plan.review.estimatedReviewCycles}.`,
      plan.review.strengths.length ? `\n**Strengths:**\n${plan.review.strengths.map(s => `- ${s}`).join('\n')}` : '',
      topFindings ? `\n**Top gaps:**\n${topFindings}` : '',
    ].filter(Boolean).join('\n'),
  });

  // 5) Study program (phased)
  const phaseBody = plan.studyProgram.sequencedPhases
    .map(p => {
      const studies = p.studies.map(s => `  - ${s.study} (${s.standard}, ~${s.estimatedEffortWeeks ?? '?'} wks)`).join('\n');
      return `**Phase ${p.phase} — ${p.name}** (≈${p.parallelWeeks} wks parallel)\n${studies}`;
    })
    .join('\n\n');
  sections.push({
    title: 'Study program',
    body: `${phaseBody}\n\n_Total effort: ${plan.studyProgram.totalSequentialEffortWeeks} wks sequential; ${plan.studyProgram.estimatedCalendarWeeks} wks calendar (parallel within phase)._`,
  });

  // 6) Evidence ROI
  const roi = plan.sensitivity.byRoi.filter(i => i.readinessGain > 0).slice(0, 5)
    .map(i => `- **${i.label}** — +${i.readinessGain} readiness · ${i.gainPerWeek}/wk · ${i.gainPer100k}/$100k · ${usd(i.costUsd)}`)
    .join('\n');
  if (roi) sections.push({ title: 'Evidence ROI (best first)', body: roi });

  // 7) Citations
  const cites = plan.citations
    .flatMap(c2 => c2.citations.map(x => `- ${x.label} — ${x.source}${x.url ? ` (${x.url})` : ''}`))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 30)
    .join('\n');
  if (cites) sections.push({ title: 'Sources', body: cites });

  const markdown = `# IVD Program Brief — ${plan.device}\n\n` +
    sections.map(s => `## ${s.title}\n\n${s.body}`).join('\n\n');

  return { device: plan.device, markdown, sections };
}

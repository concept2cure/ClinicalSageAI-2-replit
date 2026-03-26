/**
 * Body-Aware Authoring Substrate
 * Composes regional CTD templates, deficiency taxonomy, and regulatory
 * customizer to provide body-aware expectations, context, and gap detection.
 * @module server/services/body-aware-authoring
 */

export interface SectionExpectations {
  requirements: string[];
  guidelines: string[];
  commonDeficiencies: string[];
  bodySpecificNotes: string[];
  requiredLevel: 'required' | 'recommended' | 'optional';
}

export interface GapItem {
  requirement: string;
  status: 'missing' | 'weak' | 'present';
  bodyNote: string;
}

export interface GapAnalysis {
  gaps: GapItem[];
  overallCompleteness: number;
}

type AgencyKey = 'fda' | 'ema' | 'pmda' | 'health_canada' | 'tga' | 'general';
type SubmissionTypeKey = 'ind' | 'nda' | 'bla' | '510k' | 'pma' | 'de_novo' | 'cer' | 'ectd' | 'general';

const BODY_MAP: Record<string, AgencyKey> = {
  FDA: 'fda', EMA: 'ema', PMDA: 'pmda', MHRA: 'general', NMPA: 'general',
  TGA: 'tga', HEALTH_CANADA: 'health_canada',
};
const SUBMISSION_TYPE_MAP: Record<string, SubmissionTypeKey> = {
  IND: 'ind', NDA: 'nda', BLA: 'bla', '510K': '510k', PMA: 'pma',
  DE_NOVO: 'de_novo', CER: 'cer', ECTD: 'ectd',
};
const isModule1 = (code: string) => code.startsWith('1.') || code === '1';

// Dynamic loaders — graceful degradation when services unavailable
async function loadRegionalTemplates() {
  try { return await import('./regional-ctd-templates.js'); } catch { return null; }
}
async function loadDeficiencyTaxonomy() {
  try { return await import('./ana-ri/deficiency-taxonomy.js'); } catch { return null; }
}
async function loadRegulatoryCustomizer() {
  try {
    const mod = await import('./ana-biostats/regulatory-customizer.js');
    return mod.regulatoryCustomizer ?? null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// getSectionExpectations
// ─────────────────────────────────────────────────────────────────────────────

export async function getSectionExpectations(
  regulatorBody: string,
  submissionType: string,
  sectionCode: string,
): Promise<SectionExpectations> {
  const result: SectionExpectations = {
    requirements: [],
    guidelines: [],
    commonDeficiencies: [],
    bodySpecificNotes: [],
    requiredLevel: 'recommended',
  };

  const bodyUpper = regulatorBody.toUpperCase();
  const agencyKey = BODY_MAP[bodyUpper] ?? 'general';
  const subTypeKey = SUBMISSION_TYPE_MAP[submissionType.toUpperCase()] ?? 'general';

  // Module 1: regional template expectations
  if (isModule1(sectionCode)) {
    const templates = await loadRegionalTemplates();
    if (templates) {
      const tmpl = templates.getRegionalTemplate(bodyUpper);
      if (tmpl) {
        const section = findSection(tmpl.module1Sections, sectionCode);
        if (section) {
          result.requirements.push(section.description);
          result.requiredLevel = section.required ? 'required' : 'optional';
          if (section.childSections) {
            for (const child of section.childSections) {
              result.requirements.push(`${child.number} ${child.title}: ${child.description}`);
            }
          }
        }
        for (const req of tmpl.specificRequirements) {
          result.bodySpecificNotes.push(req);
        }
      }
    }
  }

  // Deficiency taxonomy — filtered by agency + submission type
  const taxonomy = await loadDeficiencyTaxonomy();
  if (taxonomy) {
    const patterns = taxonomy.DEFICIENCY_TAXONOMY.filter(
      (d: any) =>
        d.agencies.includes(agencyKey) &&
        d.submissionTypes.includes(subTypeKey),
    );
    for (const p of patterns) {
      result.commonDeficiencies.push(`${p.id}: ${p.title} (${p.severity}) — ${p.mitigations[0]}`);
    }
  }

  // Regulatory customizer — body-specific statistical/document expectations
  const customizer = await loadRegulatoryCustomizer();
  if (customizer && typeof customizer.customize === 'function') {
    try {
      const stub = {
        regulatoryBody: bodyUpper as any, clientTrack: 'biotech_pharma' as any,
        studyType: 'superiority' as any, objectiveType: 'efficacy' as any,
        endpointType: 'continuous' as any, alpha: 0.05, powerTarget: 0.8,
        effectSize: 0.5, attritionRate: 0.1, allocationRatio: 1,
      };
      const stubComp = { computedValues: {}, warnings: [] };
      const stubJudgment = { overallRisk: 'moderate', fragility: { category: 'moderate' } };
      const stubDomain = { adaptations: [] };
      const customization = customizer.customize(stub, stubComp as any, stubJudgment as any, stubDomain as any);
      if (customization) {
        result.guidelines.push(...(customization.statisticalExpectations ?? []));
        result.requirements.push(...(customization.documentRequirements ?? []));
        result.bodySpecificNotes.push(...(customization.specificConstraints ?? []));
        for (const ref of customization.guidanceReferences ?? []) {
          result.guidelines.push(`Reference: ${ref}`);
        }
      }
    } catch { /* graceful degradation */ }
  }

  // For harmonized modules (2-5) without template data, mark as recommended
  if (!isModule1(sectionCode) && result.requirements.length === 0) {
    result.requiredLevel = 'recommended';
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// getBodyAwareContext
// ─────────────────────────────────────────────────────────────────────────────

export async function getBodyAwareContext(
  regulatorBody: string,
  submissionType: string,
  sectionCode: string,
): Promise<string> {
  const exp = await getSectionExpectations(regulatorBody, submissionType, sectionCode);
  const lines: string[] = [
    `BODY-AWARE CONTEXT [${regulatorBody.toUpperCase()}] [${submissionType.toUpperCase()}] [Section ${sectionCode}]`,
    '',
  ];

  if (exp.requirements.length > 0) {
    lines.push(`Level: ${exp.requiredLevel}`, '', 'Requirements:');
    for (const r of exp.requirements) lines.push(`  - ${r}`);
  }

  if (exp.guidelines.length > 0) {
    lines.push('', 'Guidelines and References:');
    for (const g of exp.guidelines) lines.push(`  - ${g}`);
  }

  if (exp.commonDeficiencies.length > 0) {
    lines.push('', 'Common Deficiency Patterns:');
    for (const d of exp.commonDeficiencies) lines.push(`  - ${d}`);
  }

  if (exp.bodySpecificNotes.length > 0) {
    lines.push('', 'Body-Specific Notes:');
    for (const n of exp.bodySpecificNotes) lines.push(`  - ${n}`);
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// detectBodySpecificGaps
// ─────────────────────────────────────────────────────────────────────────────

export async function detectBodySpecificGaps(
  regulatorBody: string,
  submissionType: string,
  sectionCode: string,
  currentContent: string,
): Promise<GapAnalysis> {
  const exp = await getSectionExpectations(regulatorBody, submissionType, sectionCode);
  const contentLower = currentContent.toLowerCase();
  const gaps: GapItem[] = [];

  const allChecks = [
    ...exp.requirements.map(r => ({ text: r, source: 'requirement' as const })),
    ...exp.commonDeficiencies.map(d => ({ text: d, source: 'deficiency' as const })),
  ];

  for (const check of allChecks) {
    const keywords = extractKeywords(check.text);
    const matchCount = keywords.filter(kw => contentLower.includes(kw)).length;
    const matchRatio = keywords.length > 0 ? matchCount / keywords.length : 0;

    let status: 'missing' | 'weak' | 'present';
    if (matchRatio >= 0.5) status = 'present';
    else if (matchRatio > 0) status = 'weak';
    else status = 'missing';

    const bodyNote = check.source === 'deficiency'
      ? `${regulatorBody.toUpperCase()} reviewers commonly flag this area`
      : `${regulatorBody.toUpperCase()} ${exp.requiredLevel} element`;

    gaps.push({ requirement: check.text, status, bodyNote });
  }

  const total = gaps.length;
  const presentCount = gaps.filter(g => g.status === 'present').length;
  const weakCount = gaps.filter(g => g.status === 'weak').length;
  const overallCompleteness = total > 0
    ? Math.round(((presentCount + weakCount * 0.5) / total) * 100)
    : 100;

  return { gaps, overallCompleteness };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function findSection(sections: any[], code: string): any | null {
  for (const s of sections) {
    if (s.number === code) return s;
    if (s.childSections) {
      const found = findSection(s.childSections, code);
      if (found) return found;
    }
  }
  return null;
}

const STOP = new Set('the a an is are was were be been being have has had do does did will would could should may might shall can for and nor but or yet so at by in of on to up with that this it its from as if not no all'.split(' '));
function extractKeywords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
}

/**
 * perTemplate — the IVDR Annex XIII Performance Evaluation Report (PER) section
 * skeleton, as a structured template the existing `build_from_template` tool can
 * fill via string replacement.
 *
 * Rather than ship a binary .docx fixture in the repo, the skeleton is expressed
 * as ordered (heading, placeholder) blocks. The server's build_from_template /
 * author_docx_native path renders these to a real DOCX at author time; here the
 * structure is the single source of truth shared by:
 *   - the narrative materializer (perAuthoring.materializePerSections), and
 *   - the placeholder map (perAuthoring.buildPerTemplateReplacements).
 *
 * The skeleton covers the three IVDR Annex XIII pillars — scientific validity,
 * analytical performance, clinical performance — plus the front matter and the
 * benefit–risk conclusion that bind them into a PER.
 */

export interface PerTemplateBlock {
  /** Section heading as it appears in the document outline. */
  heading: string;
  /** The {{PLACEHOLDER}} build_from_template replaces with rendered prose. */
  placeholder: string;
  /** Annex XIII pillar / front-matter grouping (for the UI table of contents). */
  pillar: 'front_matter' | 'scientific_validity' | 'analytical_performance' | 'clinical_performance' | 'conclusion';
}

/**
 * The ordered Annex XIII PER skeleton. Placeholders match
 * perAuthoring.buildPerTemplateReplacements().
 */
export const PER_TEMPLATE_BLOCKS: PerTemplateBlock[] = [
  { heading: 'Device', placeholder: '{{DEVICE_NAME}}', pillar: 'front_matter' },
  { heading: 'PER Version', placeholder: '{{PER_VERSION}}', pillar: 'front_matter' },
  { heading: 'Date', placeholder: '{{PER_DATE}}', pillar: 'front_matter' },
  { heading: 'Author', placeholder: '{{AUTHOR_NAME}}', pillar: 'front_matter' },
  { heading: 'Author Qualifications', placeholder: '{{AUTHOR_QUALIFICATIONS}}', pillar: 'front_matter' },
  { heading: '1. Scientific Validity', placeholder: '{{SCIENTIFIC_VALIDITY}}', pillar: 'scientific_validity' },
  { heading: '2. Analytical Performance', placeholder: '{{ANALYTICAL_PERFORMANCE}}', pillar: 'analytical_performance' },
  { heading: '3. Clinical Performance', placeholder: '{{CLINICAL_PERFORMANCE}}', pillar: 'clinical_performance' },
  { heading: '4. Benefit–Risk Conclusion', placeholder: '{{BENEFIT_RISK}}', pillar: 'conclusion' },
];

/** All placeholders the PER template exposes (for replacement-map validation). */
export function perTemplatePlaceholders(): string[] {
  return PER_TEMPLATE_BLOCKS.map(b => b.placeholder);
}

/**
 * Does the template cover all three IVDR Annex XIII pillars? Used by the
 * skeleton-completeness test to catch an accidentally dropped section.
 */
export function templateCoversAnnexXiii(): boolean {
  const pillars = new Set(PER_TEMPLATE_BLOCKS.map(b => b.pillar));
  return (
    pillars.has('scientific_validity') &&
    pillars.has('analytical_performance') &&
    pillars.has('clinical_performance')
  );
}

/**
 * Render the skeleton to a plain-text / markdown document body by substituting
 * each placeholder from the supplied replacement map. This is the deterministic
 * fallback the Document Studio preview uses (and what the tests assert against);
 * the binary DOCX is produced server-side from the same replacements.
 */
export function renderPerSkeleton(replacements: Record<string, string>): string {
  const lines: string[] = [];
  for (const block of PER_TEMPLATE_BLOCKS) {
    const value = replacements[block.placeholder] ?? '';
    if (block.pillar === 'front_matter') {
      lines.push(`**${block.heading}:** ${value}`);
    } else {
      lines.push(`## ${block.heading}`, '', value);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

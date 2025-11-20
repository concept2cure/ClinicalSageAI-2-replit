// Minimal token mapper. Replace internals later with real joins.
export async function buildM3Tokens(programId: string) {
  return {
    PROGRAM_ID: programId,
    P3_PROCESS_FLOW: '- Blend → Granulate → Dry → Compress',
    P3_METHODS_TABLE:
      '| Test | Method | Status |\n|---|---|---|\n| Assay | HPLC-UV | VALIDATED |\n| Dissolution | USP II | VALIDATED |',
    P3_SPECS: 'Assay 95–105%; Dissolution Q=80% at 30 min; Impurities NMT 1.0%',
    P8_TIMEPOINTS: '0M, 3M, 6M, 9M, 12M, 18M, 24M',
    STABILITY_SUMMARY: 'LT 25°C/60% RH; ACC 40°C/75% RH; Trends acceptable.',
    METHOD_VALIDATION_SUMMARY: 'Methods validated per ICH Q2(R2).',
  };
}

export function renderSectionMD(section: string, tokens: Record<string, string>) {
  const tpl = `# ${section}\n\n## Process Description\n{{P3_PROCESS_FLOW}}\n\n## Methods\n{{P3_METHODS_TABLE}}\n\n## Specifications\n{{P3_SPECS}}\n\n## Stability Summary\n{{STABILITY_SUMMARY}}\n\n## Validation Summary\n{{METHOD_VALIDATION_SUMMARY}}\n`;
  return tpl.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, k) => tokens[k] ?? '');
}

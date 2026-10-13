import type { ImportedSection } from '../../import/docx-to-authoring';

const codeKey = (code: string): string => code.trim().toUpperCase();

function nextWorkingCode(position: number, reserved: Set<string>, used: Set<string>): string {
  let number = position;
  while (reserved.has(codeKey(`import.${number}`)) || used.has(codeKey(`import.${number}`))) number++;
  return `import.${number}`;
}

function repeatedHeadingWarning(section: ImportedSection, sourceCode: string, workingCode: string): string {
  const heading = `${sourceCode} ${section.title}`.trim();
  return `Source heading “${heading}” repeats section code “${sourceCode}”. `
    + `Its title and content are preserved separately under working identifier “${workingCode}”, not a CTD filing location. `
    + 'The first occurrence retains its recorded code. Choose distinct filing locations before review or filing.';
}

/** A Word file may repeat a coded heading for a continuation or appendix.
 * Authoring stores one section per code, so later occurrences receive local
 * working identifiers instead of losing passages or failing the transaction.
 * Reserve every recorded code first; titles, bodies and source order stay with
 * the caller, and the warnings retain each displaced source heading as evidence. */
export function allocateImportedSectionCodes(sections: ReadonlyArray<ImportedSection>, singleSectionCode?: string | null): {
  codes: string[]; warnings: string[];
} {
  const sourceCodes = sections.map(section => section.code || (sections.length === 1 ? singleSectionCode : null) || null);
  const reserved = new Set(sourceCodes.filter((code): code is string => Boolean(code)).map(codeKey));
  const used = new Set<string>();
  const warnings: string[] = [];
  const codes = sourceCodes.map((sourceCode, index) => {
    const repeated = sourceCode !== null && used.has(codeKey(sourceCode));
    const code = sourceCode && !repeated ? sourceCode : nextWorkingCode(index + 1, reserved, used);
    if (repeated && sourceCode) warnings.push(repeatedHeadingWarning(sections[index], sourceCode, code));
    used.add(codeKey(code));
    return code;
  });
  return { codes, warnings };
}

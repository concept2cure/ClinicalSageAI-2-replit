/**
 * A Word package small enough to read in a test: the parts a .docx always has,
 * with the main document's relationship part as given. For the rendition
 * suites (vault-pdf-rendition.test.ts, routes/__tests__/vault-download-rendition.test.ts),
 * where the converter is stubbed and what matters is what the package's
 * relationship parts name.
 */
import JSZip from 'jszip';

export const OFFICE_RELATIONSHIPS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** One relationship part, holding the given <Relationship/> elements. */
export const relationshipPart = (relationships = ''): string =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`;

/** An external relationship as Word writes one: a target outside the file. */
export const externalRelationship = (kind: string, target: string, targetMode = 'TargetMode="External"'): string =>
  `<Relationship Id="rId5" Type="${OFFICE_RELATIONSHIPS}/${kind}" Target="${target}" ${targetMode}/>`;

/** A .docx with the main document's relationship part as given, and any further entries. */
export async function wordPackage(
  documentRelationships: string | Buffer = relationshipPart(),
  further: Record<string, string | Buffer> = {},
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file('_rels/.rels', relationshipPart(`<Relationship Id="rId1" Type="${OFFICE_RELATIONSHIPS}/officeDocument" Target="word/document.xml"/>`));
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>');
  zip.file('word/_rels/document.xml.rels', documentRelationships);
  for (const [name, body] of Object.entries(further)) zip.file(name, body);
  return zip.generateAsync({ type: 'nodebuffer' });
}

/**
 * A package holding two entries named as the main relationship part: `first`
 * where the file begins, and `last` after it. A reader that keeps the last of
 * two (JSZip) and one that keeps the first would read different parts.
 */
export async function wordPackageWithTwoEntriesOfOneName(first: string, last: string): Promise<Buffer> {
  // JSZip keeps one entry per name, so the second is written under a name of
  // the same length and renamed in the bytes, in its local header and in the directory.
  const built = await wordPackage(first, { 'word/_rels/document.xml.relz': last });
  return Buffer.from(built.toString('latin1').split('document.xml.relz').join('document.xml.rels'), 'latin1');
}

/**
 * AnALedger embedder for .docx artifacts.
 *
 * Takes a .docx Buffer + an AnALedger XML payload and returns a NEW
 * .docx Buffer with the ledger injected as an Open XML custom XML part:
 *
 *   /customXml/item1.xml             — the AnALedger XML payload
 *   /customXml/itemProps1.xml        — datastoreItem with schemaRef
 *   /customXml/_rels/item1.xml.rels  — relationship: item → itemProps
 *
 * Plus updates to:
 *   /[Content_Types].xml             — register the two custom XML parts
 *   /word/_rels/document.xml.rels    — link the document part to the ledger
 *
 * Office Word recognizes the custom XML part and exposes it via
 * Developer tab → XML Mapping. The ledger survives offline storage,
 * vendor changes, and regulatory archival because it lives inside the
 * docx file itself — no external dependencies.
 *
 * If a docx already contains custom XML parts (item1.xml occupied), the
 * embedder finds the next available item index (item2, item3, …) and
 * uses that. Existing parts are not disturbed.
 *
 * @module server/services/export/docx-ledger-embedder
 */
import crypto from 'node:crypto';
import JSZip from 'jszip';

const CONTENT_TYPE_CUSTOM_XML = 'application/xml';
const CONTENT_TYPE_CUSTOM_XML_PROPS =
  'application/vnd.openxmlformats-officedocument.customXmlProperties+xml';
const CUSTOM_XML_RELATIONSHIP_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml';
const CUSTOM_XML_PROPS_RELATIONSHIP_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps';
const ANALEDGER_SCHEMA_URI =
  'http://concept2cure.com/schemas/AnALedger/v1';

export interface EmbedLedgerOptions {
  /**
   * Override the schema URI emitted in itemProps. Most callers should
   * leave this default so Word's XML Mapping picks up the canonical
   * AnALedger namespace.
   */
  schemaUri?: string;
}

/**
 * Embed an AnALedger XML payload into a docx buffer. Returns a new buffer
 * — the input is never mutated. Throws when the input isn't a valid zip
 * (i.e., not a docx) or when expected parts ([Content_Types].xml,
 * word/_rels/document.xml.rels) are missing.
 */
export async function embedLedgerInDocx(
  docxBuffer: Buffer,
  ledgerXml: string,
  options: EmbedLedgerOptions = {}
): Promise<Buffer> {
  const schemaUri = options.schemaUri ?? ANALEDGER_SCHEMA_URI;
  const zip = await JSZip.loadAsync(docxBuffer);

  // Find the next available customXml/itemN.xml slot. Existing parts
  // (some templates ship with item1.xml already populated) are preserved.
  const itemIndex = nextItemIndex(zip);
  const itemPath = `customXml/item${itemIndex}.xml`;
  const itemPropsPath = `customXml/itemProps${itemIndex}.xml`;
  const itemRelsPath = `customXml/_rels/item${itemIndex}.xml.rels`;

  // 1. Add the ledger payload.
  zip.file(itemPath, ledgerXml);

  // 2. Add the datastoreItem properties — Word reads schemaRef to wire
  // up XML Mapping.
  const datastoreItemId = `{${crypto.randomUUID()}}`;
  const itemPropsXml = buildItemPropsXml(datastoreItemId, schemaUri);
  zip.file(itemPropsPath, itemPropsXml);

  // 3. Relationship from item.xml → itemProps.xml.
  const itemRelsXml = buildItemRelsXml(`itemProps${itemIndex}.xml`);
  zip.file(itemRelsPath, itemRelsXml);

  // 4. Update [Content_Types].xml — register the two new parts.
  const contentTypesPath = '[Content_Types].xml';
  const contentTypes = await readZipText(zip, contentTypesPath);
  if (!contentTypes) {
    throw new Error('Invalid docx: missing [Content_Types].xml');
  }
  zip.file(
    contentTypesPath,
    addContentTypeOverrides(contentTypes, [
      { partName: `/${itemPath}`, contentType: CONTENT_TYPE_CUSTOM_XML },
      {
        partName: `/${itemPropsPath}`,
        contentType: CONTENT_TYPE_CUSTOM_XML_PROPS,
      },
    ])
  );

  // 5. Update word/_rels/document.xml.rels — add customXml relationship.
  const docRelsPath = 'word/_rels/document.xml.rels';
  const docRels = await readZipText(zip, docRelsPath);
  if (!docRels) {
    throw new Error('Invalid docx: missing word/_rels/document.xml.rels');
  }
  const newRelsXml = addCustomXmlRelationship(docRels, itemPath);
  zip.file(docRelsPath, newRelsXml);

  return await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function readZipText(
  zip: JSZip,
  path: string
): Promise<string | null> {
  const file = zip.file(path);
  if (!file) return null;
  return await file.async('text');
}

/**
 * Find the next available customXml/itemN.xml slot. Walks the zip to
 * see which item indices are already taken.
 */
function nextItemIndex(zip: JSZip): number {
  const taken = new Set<number>();
  for (const fileName of Object.keys((zip as any).files ?? {})) {
    const m = fileName.match(/^customXml\/item(\d+)\.xml$/);
    if (m) taken.add(parseInt(m[1], 10));
  }
  let n = 1;
  while (taken.has(n)) n += 1;
  return n;
}

function buildItemPropsXml(itemId: string, schemaUri: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<ds:datastoreItem` +
      ` xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"` +
      ` ds:itemID="${escapeAttr(itemId)}">` +
      `<ds:schemaRefs>` +
        `<ds:schemaRef ds:uri="${escapeAttr(schemaUri)}"/>` +
      `</ds:schemaRefs>` +
    `</ds:datastoreItem>`
  );
}

function buildItemRelsXml(targetItemProps: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1"` +
        ` Type="${CUSTOM_XML_PROPS_RELATIONSHIP_TYPE}"` +
        ` Target="${escapeAttr(targetItemProps)}"/>` +
    `</Relationships>`
  );
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface ContentTypeOverride {
  partName: string;
  contentType: string;
}

/**
 * Add `<Override PartName="…" ContentType="…"/>` entries to a docx's
 * [Content_Types].xml. Idempotent — if the partName already has an
 * override, leaves it alone.
 */
function addContentTypeOverrides(
  contentTypesXml: string,
  overrides: ContentTypeOverride[]
): string {
  let xml = contentTypesXml;
  for (const o of overrides) {
    const existing = new RegExp(
      `<Override\\b[^/]*PartName="${escapeRegex(o.partName)}"[^/]*/>`
    );
    if (existing.test(xml)) continue;
    const inject = `<Override PartName="${escapeAttr(o.partName)}" ContentType="${escapeAttr(o.contentType)}"/>`;
    xml = xml.replace(/<\/Types\s*>/, `${inject}</Types>`);
  }
  return xml;
}

/**
 * Add a customXml relationship to word/_rels/document.xml.rels.
 * Allocates a fresh rId not currently in use. Idempotent on Target.
 */
function addCustomXmlRelationship(
  docRelsXml: string,
  itemPath: string
): string {
  const target = `../${itemPath}`;
  const existing = new RegExp(
    `<Relationship\\b[^/]*Target="${escapeRegex(target)}"[^/]*/>`
  );
  if (existing.test(docRelsXml)) return docRelsXml;

  const usedIds = new Set<string>();
  const idRegex = /Id="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = idRegex.exec(docRelsXml)) !== null) usedIds.add(m[1]);

  // Find next rIdN.
  let n = 1;
  while (usedIds.has(`rId${n}`)) n += 1;
  const newId = `rId${n}`;
  const inject = `<Relationship Id="${newId}" Type="${CUSTOM_XML_RELATIONSHIP_TYPE}" Target="${escapeAttr(target)}"/>`;
  return docRelsXml.replace(/<\/Relationships\s*>/, `${inject}</Relationships>`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

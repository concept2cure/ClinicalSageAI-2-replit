/**
 * The XML half of the filed-sequence reader: a backbone's bytes decoded and
 * parsed safely, and where a leaf sits in its backbone's heading tree.
 *
 * Split out of filed-sequence-reader.ts (RULE 6: split, don't add) on
 * 2026-11-02. The split carries the fixes from an independent review of that
 * file (docs/evidence/MR-10/2026-11-01-filed-sequence-reader/README.md,
 * "Review round"). The four XML fixes:
 *   - A UTF-8 byte-order mark, which .NET and Windows publishing tools write
 *     by default, made a valid backbone "not well-formed". A UTF-16 one made
 *     it unreadable. A declared ISO-8859-1 backbone kept its parse but
 *     recorded every accented title as U+FFFD. A BOM is now honoured and
 *     dropped, a declared encoding is decoded as declared, and bytes that are
 *     not what they claim are refused by name.
 *   - The DOCTYPE pre-check, `/<!DOCTYPE[^>[]*\[/i`, backtracked
 *     quadratically. A 1 KB upload of repeated `<!DOCTYPE` held the event
 *     loop for 20 seconds. It also stopped at a `>` inside a quoted system
 *     literal. It is now one linear, quote-aware scan.
 *   - A backbone that relied on the DTD's #FIXED xmlns:xlink did not parse
 *     at all. The prefixes the ICH and FDA DTDs fix are now in scope when a
 *     document does not declare them.
 *   - "Must resolve in the ICH tree" could never fail. It now refuses a
 *     section that stops at a heading with sub-headings without naming one of
 *     them (2.8, 3.9, 4.2.4, 5.9). A heading whose name says a section letter
 *     the CTD does not have (3.2.Z, 2.3.Z) is not a heading at all.
 *   - A backbone of more leaves than any real one (LEAVES_MAX) is refused
 *     before its document is built.
 *
 * @module server/services/legacy-importer/filed-sequence-xml
 */

import { DOMParser, onErrorStopParsing, type Document, type Element } from '@xmldom/xmldom';
import { headingPathFor } from '../submission-gateways/ectd-packager/ich-headings';

/** A backbone over this is not read: real ones are a few megabytes, and xmldom holds about 4 KB per leaf. */
export const BACKBONE_MAX_BYTES = 32 * 1024 * 1024;

/** Elements between a backbone's root and a leaf; real eCTD nesting is under ten. */
export const HOLDERS_MAX = 32;

/**
 * Leaves in one backbone. A large NDA's index.xml holds tens of thousands
 * (case report forms); xmldom keeps about 4 KB of heap per leaf, so a backbone
 * of millions of empty leaves (a few megabytes zipped) is refused before its
 * document is built.
 */
export const LEAVES_MAX = 50_000;

export type BackboneProblemCode =
  | 'backbone_not_well_formed'
  | 'backbone_declares_entities'
  | 'backbone_encoding_unsupported'
  | 'backbone_too_large';

export interface BackboneProblem { code: BackboneProblemCode; message: string }

const UTF8_LABELS = new Set(['utf-8', 'utf8', 'us-ascii', 'ascii']);

/** The encoding a backbone's bytes say they are in: a byte-order mark, else the XML declaration, else UTF-8. */
function encodingOf(bytes: Buffer): { label: string; skip: number } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { label: 'utf-8', skip: 3 };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { label: 'utf-16le', skip: 2 };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { label: 'utf-16be', skip: 2 };
  const declared = /^<\?xml\s[^>]{0,200}?\bencoding\s*=\s*["']([A-Za-z0-9._-]{1,40})["']/.exec(bytes.subarray(0, 256).toString('latin1'))?.[1];
  const label = declared?.toLowerCase();
  return { label: label && !UTF8_LABELS.has(label) ? label : 'utf-8', skip: 0 };
}

/** A backbone's text, decoded as its bytes say, or why it cannot be. */
export function decodeBackbone(bytes: Buffer): { text: string } | BackboneProblem {
  if (bytes.length > BACKBONE_MAX_BYTES) {
    return { code: 'backbone_too_large', message: `is ${bytes.length} bytes; a backbone over ${BACKBONE_MAX_BYTES} bytes is not read` };
  }
  const { label, skip } = encodingOf(bytes);
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(label, { fatal: true, ignoreBOM: true });
  } catch {
    return { code: 'backbone_encoding_unsupported', message: `declares the encoding "${label}", which cannot be decoded here` };
  }
  try {
    return { text: decoder.decode(bytes.subarray(skip)) };
  } catch {
    return { code: 'backbone_encoding_unsupported', message: `is not valid ${label}` };
  }
}

/**
 * Does the text declare an entity, or a DOCTYPE with an internal subset? One
 * pass from each `<!DOCTYPE` to its closing `>`, skipping quoted literals, so
 * the cost is linear in the text whatever it holds.
 */
export function declaresEntitiesOrSubset(xml: string): boolean {
  if (/<!ENTITY/i.test(xml)) return true;
  const doctype = /<!DOCTYPE/gi;
  for (let m = doctype.exec(xml); m; m = doctype.exec(xml)) {
    let quote: string | null = null;
    let i = m.index + m[0].length;
    for (; i < xml.length; i++) {
      const c = xml[i];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === '[') return true;
      else if (c === '>') break;
    }
    doctype.lastIndex = Math.max(doctype.lastIndex, i);
  }
  return false;
}

/**
 * The prefixes the ICH eCTD and FDA us-regional DTDs fix (`#FIXED` attributes
 * on the root), in scope when a document relies on its DTD instead of
 * declaring them. A declaration in the document still wins.
 */
const DTD_FIXED_PREFIXES = {
  xlink: 'http://www.w3c.org/1999/xlink',
  ectd: 'http://www.ich.org/ectd',
  'fda-regional': 'http://www.ich.org/fda',
};

/** More than `max` leaf elements? Counted in one pass, stopping at the first past the cap. */
function leavesExceed(xml: string, max: number): boolean {
  const leaf = /<leaf[\s/>]/g;
  let n = 0;
  while (leaf.exec(xml)) if (++n > max) return true;
  return false;
}

/** A backbone's bytes as a document, or why they are not one. External DTDs are never fetched. */
export function parseBackbone(bytes: Buffer): { doc: Document } | BackboneProblem {
  const decoded = decodeBackbone(bytes);
  if ('code' in decoded) return decoded;
  if (leavesExceed(decoded.text, LEAVES_MAX)) {
    return { code: 'backbone_too_large', message: `holds more than ${LEAVES_MAX} leaves, which is not read` };
  }
  if (declaresEntitiesOrSubset(decoded.text)) {
    return { code: 'backbone_declares_entities', message: 'declares entities or an internal DTD subset, which a backbone has no use for; it is not parsed' };
  }
  try {
    const doc = new DOMParser({ onError: onErrorStopParsing, xmlns: DTD_FIXED_PREFIXES }).parseFromString(decoded.text, 'text/xml');
    if (!doc?.documentElement) return { code: 'backbone_not_well_formed', message: 'has no root element' };
    return { doc };
  } catch (err) {
    return { code: 'backbone_not_well_formed', message: `is not well-formed XML (${err instanceof Error ? err.message.split('\n')[0] : String(err)})` };
  }
}

/** Every element of this local name under `scope`, in document order. */
export function elementsNamed(scope: Document | Element, localName: string): Element[] {
  const out: Element[] = [];
  const all = scope.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (el?.localName === localName) out.push(el);
  }
  return out;
}

export const firstNamed = (scope: Document | Element, localName: string): Element | null => elementsNamed(scope, localName)[0] ?? null;
export const textOf = (el: Element | null): string | null => el?.textContent?.trim() || null;

/* ─── Headings ──────────────────────────────────────────────────────── */

/**
 * The CTD section an ICH or FDA heading element's name encodes, or null when
 * it encodes none: `m2-5-clinical-overview` → 2.5, `m3-2-s-drug-substance` →
 * 3.2.S, `m1-12-4-request-for-comments-and-advice` → 1.12.4. A letter segment
 * is read only where the CTD has one (3.2.S/P/A/R and 2.3.S/P/A/R).
 */
export function headingSection(element: string): string | null {
  const tokens = element.toLowerCase().split('-');
  if (!/^m\d+$/.test(tokens[0])) return null;
  const out = [tokens[0].slice(1)];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\d+$/.test(t)) {
      out.push(t);
    } else if (i === 2 && /^[a-z]$/.test(t) && ['3.2', '2.3'].includes(out.join('.'))) {
      // A letter the CTD has (S, P, A, R), or a name that says a section the CTD does not.
      if (!/^[spar]$/.test(t)) return null;
      out.push(t.toUpperCase());
    } else {
      break;
    }
  }
  return out.join('.');
}

/** Is `inner` the same section as `outer`, or inside it? */
function sectionWithin(inner: string, outer: string): boolean {
  const i = inner.split('.');
  const o = outer.split('.');
  return o.length <= i.length && o.every((seg, n) => seg === i[n]);
}

/** Elements a leaf may sit in that are not headings, by backbone. */
const WRAPPERS_INDEX = new Set(['node-extension']);
const WRAPPERS_REGIONAL = new Set([
  'node-extension', 'specific',
  // FDA v3.3: a form's leaf is written in <form> in the application's admin block.
  'form', 'submission-information', 'application', 'application-set', 'admin',
]);

export interface Placement { section: string; heading: string }
export interface Refused { refusal: string }

/** The elements between the backbone root and a leaf, outermost first; null past HOLDERS_MAX. */
function holdersOf(leaf: Element): Element[] | null {
  const holders: Element[] = [];
  for (let n = leaf.parentNode; n && n.nodeType === 1 && n !== n.ownerDocument?.documentElement; n = n.parentNode) {
    if (holders.length >= HOLDERS_MAX) return null;
    holders.push(n as Element);
  }
  return holders.reverse();
}

/** The deepest heading holding a leaf, every heading inside the one holding it; null when there is none. */
function deepestHeading(holders: Element[], wrappers: Set<string>): Placement | Refused | null {
  let found: Placement | null = null;
  for (const el of holders) {
    const name = el.localName ?? '';
    const section = headingSection(name);
    if (section === null) {
      if (!wrappers.has(name)) return { refusal: `<${name}> is not an eCTD heading, so it says no section` };
      continue;
    }
    if (found && !sectionWithin(section, found.section)) {
      return { refusal: `heading <${name}> (${section}) is not inside the heading that holds it (${found.section})` };
    }
    found = { section, heading: name };
  }
  return found;
}

function regionalPlacement(holders: Element[]): Placement | Refused {
  const found = deepestHeading(holders, WRAPPERS_REGIONAL);
  if (found && 'refusal' in found) return found;
  if (!found && holders.some((el) => el.localName === 'form')) return { section: '1.1', heading: 'form' };
  const parts = found?.section.split('.') ?? [];
  if (!found || parts[0] !== '1' || parts.length < 2) {
    return { refusal: `a Module 1 leaf must be filed under a Module 1 heading (1.x)${found ? `; <${found.heading}> is ${found.section}` : ''}` };
  }
  return found;
}

/**
 * A Modules 2-5 section must be one the ICH heading tree has: a heading of it
 * (3, 3.2, 5.3 included, since the DTD lets every heading hold leaves), or
 * below a heading with no sub-headings (3.2.S.4.1 under 3.2.S, 5.3.5.1 under
 * 5.3.5). A section that stops at a heading with sub-headings without naming
 * one of them (2.8, 3.9, 4.2.4, 5.9) is not.
 *
 * A leaf filed in a heading with sub-headings is read as filed. The packager
 * cannot place a later act at such a section (isPlaceableSection), and it
 * refuses one openly. Refusing the leaf here would keep its whole sequence out
 * of the filed state, for a leaf the agency holds (second review, 2026-11-02).
 */
function ichPlacement(holders: Element[]): Placement | Refused {
  const found = deepestHeading(holders, WRAPPERS_INDEX);
  if (!found) return { refusal: 'it is filed under no heading' };
  if ('refusal' in found || found.section === '1') return found;
  const chain = ['2', '3', '4', '5'].includes(found.section.split('.')[0]) ? headingPathFor(found.section) : null;
  const deepest = chain?.[chain.length - 1];
  if (!deepest || (deepest.children?.length && deepest.section.toLowerCase() !== found.section.toLowerCase())) {
    return { refusal: `heading <${found.heading}> is ${found.section}, which is not in the ICH Module 2-5 tree` };
  }
  return found;
}

/** Where a leaf is filed, from the elements that hold it. */
export function placementOf(leaf: Element, regional: boolean): Placement | Refused {
  const holders = holdersOf(leaf);
  if (!holders) return { refusal: `it is nested more than ${HOLDERS_MAX} elements below the backbone's root` };
  return regional ? regionalPlacement(holders) : ichPlacement(holders);
}

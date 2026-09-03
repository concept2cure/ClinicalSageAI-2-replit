/**
 * escapeXml must yield WELL-FORMED text for the agency backbone. Entity
 * escaping alone cannot: XML 1.0 §2.2 forbids most C0/C1 control characters
 * and U+FFFE/U+FFFF anywhere in a document, escaped or not, so a section
 * label carrying U+0001 produced a backbone a regional validator rejects.
 * Characters are built from code points so this file carries no raw bytes.
 */
import { describe, it, expect } from 'vitest';
import { escapeXml } from '../paths';

const ch = (cp: number) => String.fromCodePoint(cp);

describe('escapeXml', () => {
  it('escapes the five predefined entities', () => {
    expect(escapeXml(`a & b < c > d "e" 'f'`)).toBe('a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;');
  });

  it('STRIPS characters XML cannot carry (C0 except TAB/LF/CR, DEL..C1, U+FFFE/U+FFFF)', () => {
    const illegal = [0x00, 0x01, 0x08, 0x0b, 0x0c, 0x0e, 0x1f, 0x7f, 0x9f, 0xfffe, 0xffff];
    for (const cp of illegal) {
      const out = escapeXml(`Cover${ch(cp)}Letter`);
      expect(out, `U+${cp.toString(16)}`).toBe('CoverLetter');
    }
  });

  it('keeps TAB / LF / CR and ordinary Unicode text', () => {
    const s = `line1${ch(0x09)}x${ch(0x0a)}y${ch(0x0d)}z — Übersicht 概要`;
    expect(escapeXml(s)).toBe(s);
  });

  it('a mixed input is both stripped and escaped (the failing case: label + control char + entity)', () => {
    expect(escapeXml(`R&D${ch(0x01)} <v2>`)).toBe('R&amp;D &lt;v2&gt;');
  });
});

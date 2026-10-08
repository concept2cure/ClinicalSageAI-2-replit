/**
 * Which outline node an authored section files into (QA 2026-10-08, walk 2, j4).
 * The keys are the IND outline's own spellings (c2c_document_sections.section_key
 * on the QA project's filing).
 */
import { describe, it, expect } from 'vitest';
import { filingSectionKey } from '../filing-section-key';

const IND = [
  'M1', '1.1', '1.1.1', '1.14', '1.14.4.1', '1.14.4.2',
  'M2', '2.3', '2.3.S', '2.3.P', '2.5', '2.7',
  'M3', '3.2.S', '3.2.S.1', '3.2.S.2',
];

describe('filingSectionKey', () => {
  it('a section whose code is an outline key files there, as before', () => {
    expect(filingSectionKey(IND, '2.5')).toBe('2.5');
    expect(filingSectionKey(IND, '3.2.S.1')).toBe('3.2.S.1');
    expect(filingSectionKey(IND, '2.3')).toBe('2.3');
  });

  it('a section under an undivided node files into that node — the Clinical Overview’s 2.5.1 … 2.5.8', () => {
    for (const code of ['2.5.1', '2.5.7', '2.5.8', '2.5.4.1']) expect(filingSectionKey(IND, code)).toBe('2.5');
    expect(filingSectionKey(IND, '2.7.3')).toBe('2.7');
  });

  it('the nearest outline ancestor decides, not the first one', () => {
    expect(filingSectionKey(IND, '2.3.S.4')).toBe('2.3.S');
  });

  it('a node the outline subdivides is a container: a section under it with no slot of its own files nowhere', () => {
    expect(filingSectionKey(IND, '3.2.S.9')).toBeNull();
    expect(filingSectionKey(IND, '1.14.4.3')).toBeNull();
    expect(filingSectionKey(IND, '1.1.9')).toBeNull();
  });

  it('a bare module never takes a document, and an unrelated code files nowhere', () => {
    expect(filingSectionKey(['2', '2.5'], '2.6')).toBeNull();
    expect(filingSectionKey(IND, 'ZZ-not-in-pack')).toBeNull();
    expect(filingSectionKey(IND, '2.50')).toBeNull();
  });

  it('a section with no code belongs to no node', () => {
    expect(filingSectionKey(IND, null)).toBeNull();
    expect(filingSectionKey(IND, '')).toBeNull();
  });
});

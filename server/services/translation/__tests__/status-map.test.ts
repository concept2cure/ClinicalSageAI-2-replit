/**
 * status-map tests — prove the DB ↔ DTO status/method bridge is total, the status
 * mapping round-trips, and the status-aware method derivation reflects the
 * regulated origin/stage model (machine origin surfaces as mt_postedited only
 * after a human post-edit).
 */

import { describe, it, expect } from 'vitest';

import {
  dbStatusToDto,
  dtoStatusToDb,
  dbMethodToDto,
  dtoMethodToDb,
  type DbSegmentStatus,
  type DbSegmentMethod,
} from '../status-map';
import type { TranslationMethod, TranslationStatus } from '@shared/types/translation';

const DB_STATUSES: DbSegmentStatus[] = [
  'pending',
  'machine_translated',
  'post_edited',
  'back_translation_pending',
  'in_review',
  'approved',
  'rejected',
];
const DTO_STATUSES: TranslationStatus[] = [
  'pending',
  'mt_draft',
  'in_progress',
  'back_translation',
  'review',
  'approved',
  'rejected',
];

describe('status mapping', () => {
  it('round-trips every DTO status through DB and back', () => {
    for (const s of DTO_STATUSES) {
      expect(dbStatusToDto(dtoStatusToDb(s))).toBe(s);
    }
  });

  it('round-trips every DB status through DTO and back', () => {
    for (const s of DB_STATUSES) {
      expect(dtoStatusToDb(dbStatusToDto(s))).toBe(s);
    }
  });

  it('maps the machine-assisted intermediate stages explicitly', () => {
    expect(dbStatusToDto('machine_translated')).toBe('mt_draft');
    expect(dbStatusToDto('post_edited')).toBe('in_progress');
    expect(dbStatusToDto('back_translation_pending')).toBe('back_translation');
    expect(dbStatusToDto('in_review')).toBe('review');
  });
});

describe('method mapping', () => {
  it('human and translation_memory origins surface as human', () => {
    expect(dbMethodToDto('human', 'approved')).toBe('human');
    expect(dbMethodToDto('translation_memory', 'approved')).toBe('human');
  });

  it('a machine draft stays machine until post-edited', () => {
    expect(dbMethodToDto('machine', 'pending')).toBe('machine');
    expect(dbMethodToDto('machine', 'machine_translated')).toBe('machine');
  });

  it('a post-edited machine segment surfaces as mt_postedited', () => {
    expect(dbMethodToDto('machine', 'post_edited')).toBe('mt_postedited');
    expect(dbMethodToDto('machine', 'back_translation_pending')).toBe('mt_postedited');
    expect(dbMethodToDto('machine', 'in_review')).toBe('mt_postedited');
    expect(dbMethodToDto('machine', 'approved')).toBe('mt_postedited');
  });

  it('DTO method maps to DB origin (mt_postedited collapses to machine)', () => {
    const cases: Array<[TranslationMethod, DbSegmentMethod]> = [
      ['human', 'human'],
      ['machine', 'machine'],
      ['mt_postedited', 'machine'],
    ];
    for (const [dto, db] of cases) {
      expect(dtoMethodToDb(dto)).toBe(db);
    }
  });
});

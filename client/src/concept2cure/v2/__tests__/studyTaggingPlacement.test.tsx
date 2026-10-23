// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StudyTaggingInputFields, studyTaggingPlacement } from '../surfaces/StudyTaggingInputFields';

afterEach(cleanup);
const empty = { studyId: '', stfFileTag: '' };
describe('placement reuses existing study coverage and naming', () => {
  it.each(['fda', 'US', 'FDA', undefined, 'unknown-region'])('requires both values for %s', (region) => {
    expect(studyTaggingPlacement('5.3.5.1', 'new', region, empty)).toMatchObject({ show: true, required: true, valid: false });
  });
  it('returns exact trimmed metadata without classifying or inferring a file-tag', () => {
    expect(studyTaggingPlacement('4.2.3.2', 'new', 'fda', { studyId: ' STUDY-101 ', stfFileTag: ' sponsor-reviewed-tag ' }))
      .toEqual({ show: true, required: true, valid: true, problem: null,
        payload: { studyId: 'STUDY-101', stfFileTag: 'sponsor-reviewed-tag' } });
  });
  it.each(['4.3', '5.2', '5.3.6', '5.4', '3.2.S.4.1'])('hides and omits metadata for %s', (section) => {
    expect(studyTaggingPlacement(section, 'new', 'fda', { studyId: 'bad/id', stfFileTag: 'stale' }))
      .toEqual({ show: false, required: false, valid: true, problem: null, payload: {} });
  });
  it('omits metadata on delete operations', () => {
    expect(studyTaggingPlacement('5.3.5.1', 'delete', 'fda', empty)).toMatchObject({ show: false, required: false, valid: true, payload: {} });
  });
  it('keeps other regions advisory and sends an optional partial pair explicitly', () => {
    expect(studyTaggingPlacement('5.3.5.1', 'new', 'ema', empty))
      .toEqual({ show: true, required: false, valid: true, problem: null, payload: {} });
    expect(studyTaggingPlacement('5.3.5.1', 'new', 'EU', { studyId: 'STUDY-101', stfFileTag: '' }))
      .toMatchObject({ valid: true, payload: { studyId: 'STUDY-101', stfFileTag: null } });
  });
  it.each([{ studyId: 'bad/id', stfFileTag: 'study-report-body' }, { studyId: 'STUDY-101', stfFileTag: 'x'.repeat(129) },
    { studyId: 'STUDY-101', stfFileTag: 'bad\ntag' }])('refuses supplied invalid metadata before a write: %j', (values) => {
    expect(studyTaggingPlacement('5.3.5.1', 'new', 'fda', values)).toMatchObject({ valid: false, problem: expect.any(String) });
  });
  it('uses the existing filename error for a supplied invalid id in an optional region too', () => {
    expect(studyTaggingPlacement('5.3.5.1', 'new', 'ema', { studyId: 'bad/id', stfFileTag: '' }).problem)
      .toMatch(/cannot form its Study Tagging File name/);
  });
});

describe('the extracted controlled Builder input pair', () => {
  it.each(['inline', 'dialog'] as const)('keeps accessible labels, field kit and controlled changes for %s', (variant) => {
    const onChange = vi.fn();
    render(<StudyTaggingInputFields value={empty} onChange={onChange} idPrefix="study" required variant={variant} />);
    const study = screen.getByLabelText('Study id') as HTMLInputElement;
    const tag = screen.getByLabelText('STF file-tag') as HTMLInputElement;
    expect(study.getAttribute('aria-required')).toBe('true');
    expect(tag.maxLength).toBe(128);
    expect(study.className).toBe(variant === 'inline' ? 'sc-subpick' : 'c2c-input');
    fireEvent.change(study, { target: { value: 'STUDY-101' } });
    fireEvent.change(tag, { target: { value: 'study-report-body' } });
    expect(onChange.mock.calls).toEqual([[{ studyId: 'STUDY-101', stfFileTag: '' }], [{ studyId: '', stfFileTag: 'study-report-body' }]]);
  });
  it('disables both existing inputs during a guarded write', () => {
    render(<StudyTaggingInputFields value={empty} onChange={vi.fn()} idPrefix="held" disabled />);
    expect((screen.getByLabelText('Study id') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('STF file-tag') as HTMLInputElement).disabled).toBe(true);
  });
});

// @vitest-environment jsdom
/**
 * A step's row and what its chevron opens (ANA-SUMMARY S3,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §3.3, §5 S3).
 *
 * The chevron opened `JSON.stringify(input)`, so ids reached the screen, and a
 * step with no label read its tool's name. A step's details are now the
 * server's facts, built from allow-listed fields, and its sentence when it did
 * not succeed; the inputs and the result stay on the call for the client's own
 * parsers and are never rendered. A tool with no label reads "Ran a step".
 * The engine glyph shows only when the step's generation capture saw no model.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AnaActivity } from '../AnaActivity';
import { showsEngineGlyph } from '../anaWorkModel';
import { I } from '../icons';
import type { AnaToolCall } from '../../components/ana/useAnaChat';

afterEach(cleanup);

const UUID = '3f2b8c1e-9d4a-4e6b-8c2f-1a5d7e9b0c3d';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Open every chevron in the record and return the text of every opened detail. */
function openedDetails(container: HTMLElement): string {
  const rows = Array.from(container.querySelectorAll<HTMLButtonElement>('button.ana-activity-row'));
  for (const row of rows) fireEvent.click(row);
  return Array.from(container.querySelectorAll('.ana-activity-detail'))
    .map((d) => d.textContent ?? '')
    .join('\n');
}

describe('S3 test 1 — redaction: no id in a step\'s opened details', () => {
  it('a step with input {document_id:<uuid>} and result {authoringDocId:<uuid>} shows no uuid anywhere', () => {
    const step: AnaToolCall = {
      name: 'draft_authoring_document',
      label: 'Created an authoring document',
      status: 'success',
      latencyMs: 2_400,
      input: { document_id: UUID, title: 'Clinical Overview' },
      result: JSON.stringify({ authoringDocId: UUID, programId: UUID, status: 'draft' }),
      facts: [{ name: 'Took', value: '2.4s' }],
    };
    const { container } = render(<AnaActivity streaming toolCalls={[step]} />);
    const details = openedDetails(container);
    expect.soft(details, 'an id in the opened details').not.toMatch(UUID_RE);
    expect.soft(container.textContent, 'an id anywhere in the record').not.toMatch(UUID_RE);
    expect.soft(container.querySelector('pre'), 'a raw payload block').toBeNull();
    expect(details).toContain('Took: 2.4s');
  });
});

describe('S3 test 3 — no tool names on screen', () => {
  it('a step with no label reads "Ran a step" in its row and its details, never "sentinel"', () => {
    const { container } = render(
      <AnaActivity
        streaming
        toolCalls={[{ name: 'sentinel_tool_xyz', label: '', status: 'success', latencyMs: 900, input: { q: 'x' } }]}
      />,
    );
    expect(screen.getByRole('button', { name: /Ran a step/ })).toBeTruthy();
    const details = openedDetails(container);
    expect(`${container.textContent}\n${details}`).not.toMatch(/sentinel/i);
  });

  it('a running step with no label reads "Running a step"', () => {
    const { container } = render(<AnaActivity streaming toolCalls={[{ name: 'sentinel_tool_xyz', label: '', status: 'running' }]} />);
    expect(container.textContent).toContain('Running a step');
    expect(container.textContent).not.toMatch(/sentinel/i);
  });
});

describe('S3 — the row: the server\'s label on line one, the preview muted beneath', () => {
  it('reads "Searched the Vault" with "shelf life" beneath it, and opens to the facts', () => {
    const { container } = render(
      <AnaActivity
        streaming
        toolCalls={[
          {
            name: 'search_project_documents',
            label: 'Searched the Vault',
            status: 'success',
            source: 'vault',
            preview: 'shelf life',
            latencyMs: 2_400,
            facts: [
              { name: 'Searched for', value: 'shelf life' },
              { name: 'Found', value: '12 matches' },
              { name: 'Took', value: '2.4s' },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: /Searched the Vault/ })).toBeTruthy();
    expect(container.querySelector('.ana-activity-preview')?.textContent).toBe('shelf life');
    const details = openedDetails(container);
    expect(details).toContain('Searched for: shelf life');
    expect(details).toContain('Found: 12 matches');
    expect(details).toContain('Took: 2.4s');
  });

  it('a step that did not succeed shows the server\'s sentence, never folded', () => {
    const { container } = render(
      <AnaActivity
        toolCalls={[
          {
            name: 'validate_ectd_package',
            label: 'Validating the eCTD package',
            status: 'error',
            message: "AnA couldn't finish validating the eCTD package and continued without it.",
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(container.querySelector('.ana-activity-note')?.textContent).toBe(
      "AnA couldn't finish validating the eCTD package and continued without it.",
    );
  });
});

describe('S3 test 6 — the engine glyph needs the capture to have seen no model', () => {
  const engine = (usedModel: boolean | null | undefined): AnaToolCall => ({
    name: 'compute_sample_size',
    label: 'Computed the sample size',
    status: 'success',
    source: 'engine',
    usedModel,
    facts: usedModel ? [{ name: 'Model', value: 'a model was used in this step' }] : [],
  });

  /** The markup of the engine glyph, to compare a row's glyph against. */
  const engineGlyph = () => {
    const { container, unmount } = render(<span>{I.terminal}</span>);
    const html = container.innerHTML;
    unmount();
    return html.replace(/^<span>|<\/span>$/g, '');
  };
  const glyphOf = (container: HTMLElement) => container.querySelector('.ana-activity-step .ana-activity-glyph')?.innerHTML;

  it('a step whose handler made a generation has no engine glyph, and says a model wrote part of it', () => {
    const glyph = engineGlyph();
    expect(showsEngineGlyph(engine(true))).toBe(false);
    const { container } = render(<AnaActivity streaming toolCalls={[engine(true)]} />);
    expect(glyphOf(container)).not.toBe(glyph);
    expect(openedDetails(container)).toContain('Model: a model was used in this step');
  });

  it('control: the same step whose capture saw no model shows the engine glyph', () => {
    const glyph = engineGlyph();
    const { container } = render(<AnaActivity streaming toolCalls={[engine(false)]} />);
    expect(glyphOf(container)).toBe(glyph);
  });

  it('shows only for a successful engine step whose capture saw none; unknown is not none', () => {
    expect(showsEngineGlyph(engine(false))).toBe(true);
    expect(showsEngineGlyph(engine(null))).toBe(false);
    expect(showsEngineGlyph(engine(undefined))).toBe(false);
    expect(showsEngineGlyph({ ...engine(false), source: 'vault' })).toBe(false);
    expect(showsEngineGlyph({ ...engine(false), status: 'error' })).toBe(false);
  });
});

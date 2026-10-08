// @vitest-environment jsdom
/**
 * QA 2026-10-08, walk 2, j5 (b): "Vault search result: action_ready." and
 * "Navigation result: navigation_ready." reached the conversation as AnA's
 * answer. A tool status code is rendered in words, in one place, wherever an
 * answer is shown: AnaMarkdown (the thread, the editor pane, eCTD co-author)
 * and the "AnA's reply is in the conversation" strip.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { AnaMarkdown } from '../AnaMarkdown';
import { LiveDriveOverlay } from '../LiveDriveOverlay';
import { readableReplyText } from '../anaReplyText';
import { INITIAL_DRIVE_STATE } from '../liveDrive';

afterEach(() => cleanup());

describe('tool status codes in AnA replies', () => {
  it('says known codes in words and leaves other identifiers alone', () => {
    expect(readableReplyText('Vault search result: action_ready.')).toBe('Vault search result: sent to the screen.');
    expect(readableReplyText('Navigation result: navigation_ready. You are on vault now.')).toBe(
      'Navigation result: screen opened. You are on vault now.',
    );
    expect(readableReplyText('The column action_ready_at and my_needs_project stay.')).toBe(
      'The column action_ready_at and my_needs_project stay.',
    );
  });

  it('an answer rendered by AnaMarkdown carries no status code', () => {
    const { container } = render(<AnaMarkdown text={'Open program: **action_ready**.'} />);
    expect(container.textContent?.trim()).toBe('Open program: sent to the screen.');
  });

  it("the reply strip on another screen carries no status code", () => {
    const { container } = render(
      <LiveDriveOverlay
        state={INITIAL_DRIVE_STATE}
        replyElsewhere="Vault search result: action_ready."
        onTakeOver={() => undefined}
        onStop={() => undefined}
      />,
    );
    expect(container.textContent).toContain('Vault search result: sent to the screen.');
    expect(container.textContent).not.toContain('action_ready');
  });
});

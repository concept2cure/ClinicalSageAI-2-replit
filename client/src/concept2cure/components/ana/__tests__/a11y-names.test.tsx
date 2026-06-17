// @vitest-environment jsdom
/**
 * Accessibility: every icon-only control on the AnA chat surface must expose an
 * accessible name (WCAG 2.2 SC 4.1.2). These tests assert names via role queries
 * so a screen-reader user — and procurement's axe scan — can operate the UI.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Composer } from '../Composer';
import { Message } from '../Message';

afterEach(cleanup);

describe('Composer accessible names', () => {
  it('names the textarea and the icon-only controls', () => {
    render(<Composer value="" onChange={() => {}} onSend={() => {}} />);
    // The composer input is a real labelled control, not a placeholder-only field.
    expect(screen.getByRole('textbox', { name: 'Message AnA' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Attach files' })).toBeTruthy();
    // With no onSelectedToolsChange the read-only Tools button renders.
    expect(screen.getByRole('button', { name: 'Tools' })).toBeTruthy();
    // Send has its name regardless of streaming state.
    expect(screen.getByRole('button', { name: 'Send message' })).toBeTruthy();
  });

  it('flips the send control name to a stop action while streaming', () => {
    render(<Composer value="hi" onChange={() => {}} onSend={() => {}} onStop={() => {}} isStreaming />);
    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeTruthy();
  });
});

describe('Message accessible names', () => {
  it('names the assistant response action buttons', () => {
    render(
      <Message
        role="assistant"
        text="Here is the answer."
        onCopy={() => {}}
        onRetry={() => {}}
        onFeedback={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'Copy response' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry response' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Good response' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bad response' })).toBeTruthy();
  });
});

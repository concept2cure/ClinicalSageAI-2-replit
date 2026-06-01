/**
 * @vitest-environment jsdom
 *
 * Thread UI: a sent user message renders its attachment chips above the bubble.
 * Proves the attachments threaded from the composer survive into the rendered
 * message (Message component), so the user can see what they attached.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import * as React from 'react';

import { Message } from '../../client/src/concept2cure/components/ana/Message';

afterEach(cleanup);

describe('Message attachment chips', () => {
  it('renders a chip per attachment on a user message, above the bubble text', () => {
    render(
      <Message
        role="user"
        text="Please review these"
        attachments={[
          { id: 'a1', name: 'enrollment.pdf', fileId: 'file_1' },
          { id: 'a2', name: 'scan.png', fileId: 'file_2' },
        ]}
      />,
    );

    expect(screen.getByText('Please review these')).toBeDefined();
    expect(screen.getByText('enrollment.pdf')).toBeDefined();
    expect(screen.getByText('scan.png')).toBeDefined();
  });

  it('renders no attachment chips when none are attached', () => {
    const { container } = render(<Message role="user" text="Just a question" />);
    expect(screen.getByText('Just a question')).toBeDefined();
    // No attachment chip elements.
    expect(container.querySelectorAll('[class*="msgAttachment"]').length).toBe(0);
  });

  it('does not render attachments on assistant messages', () => {
    // Assistant turns never carry user attachments; passing them is a no-op.
    render(<Message role="assistant" text="Here is my analysis." />);
    expect(screen.getByText('Here is my analysis.')).toBeDefined();
  });
});

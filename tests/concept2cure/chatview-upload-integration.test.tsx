/**
 * @vitest-environment jsdom
 *
 * Integration: drive a file upload through the REAL ChatView component tree.
 * This is the closest headless analogue to "upload a doc in the UI": it mounts
 * the actual ChatView → Composer → useChatUpload → Message chain and exercises
 * the genuine interaction (file input change → chip with read-label → send →
 * the sent message renders the attachment chip). Only `fetch` is mocked.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import * as React from 'react';

import { ChatView, type ChatMessageView } from '../../client/src/concept2cure/components/ana/ChatView';
import type { MessageAttachment } from '../../client/src/concept2cure/components/ana/useAnaChat';

beforeEach(() => {
  // jsdom doesn't implement scrollIntoView; ChatView calls it on new messages.
  if (!(Element.prototype as any).scrollIntoView) {
    (Element.prototype as any).scrollIntoView = vi.fn();
  } else {
    vi.spyOn(Element.prototype as any, 'scrollIntoView').mockImplementation(() => {});
  }
  (globalThis.fetch as any) = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ fileId: 'file_1', extractionMethod: 'utf8', extractionWords: 1240 }),
  });
});
afterEach(cleanup);

/**
 * A tiny stateful host mirroring how Ana wires ChatView: it owns the message
 * list and appends a user message (with attachments) on send — so we can assert
 * the rendered thread, not just the callback.
 */
function Host() {
  const [messages, setMessages] = React.useState<ChatMessageView[]>([]);
  const onSend = (text: string, attachments?: MessageAttachment[]) => {
    setMessages((prev) => [...prev, { id: `u-${prev.length}`, role: 'user', text, attachments }]);
  };
  return <ChatView messages={messages} onSend={onSend} projectId="proj_12" />;
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error('composer file input not found');
  return input;
}

describe('ChatView upload integration', () => {
  it('uploads via the file input, shows the read chip, and renders it on the sent message', async () => {
    render(<Host />);

    // 1. Attach a file through the real hidden <input type=file>.
    const file = new File(['patient enrollment data'], 'enrollment.txt', { type: 'text/plain' });
    await act(async () => {
      fireEvent.change(fileInput(), { target: { files: [file] } });
    });

    // 2. The composer chip shows the file and, once uploaded, the read-status.
    await waitFor(() => expect(screen.getByText('enrollment.txt')).toBeDefined());
    await waitFor(() => expect(screen.getByText('read · 1,240 words')).toBeDefined());
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/chat/upload', expect.objectContaining({ method: 'POST' }));

    // 3. Type a message and send (Enter).
    const textarea = screen.getByPlaceholderText('Reply to AnA…');
    fireEvent.change(textarea, { target: { value: 'Please review' } });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    });

    // 4. The sent user message renders, carrying its attachment chip + read-label.
    await waitFor(() => expect(screen.getByText('Please review')).toBeDefined());
    // Filename now appears on the rendered message (composer chips were cleared).
    expect(screen.getByText('enrollment.txt')).toBeDefined();
    expect(screen.getByText('read · 1,240 words')).toBeDefined();
  });

  it('rejects an unsupported file inline without uploading', async () => {
    render(<Host />);
    const bad = new File(['x'], 'malware.exe', { type: 'application/octet-stream' });
    await act(async () => {
      fireEvent.change(fileInput(), { target: { files: [bad] } });
    });
    // Appears both in the chip and the aria-live status region (a11y) — hence All.
    await waitFor(() => expect(screen.getAllByText(/unsupported file type/i).length).toBeGreaterThan(0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

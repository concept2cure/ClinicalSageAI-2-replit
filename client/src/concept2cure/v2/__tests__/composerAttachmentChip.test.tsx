// @vitest-environment jsdom
/**
 * What an attachment chip says about a file whose text could not be read.
 *
 * The upload answers `status: 'ready'` whether or not extraction produced any
 * text — a scanned PDF, an image with nothing OCR could read — and reports it
 * as `extractionWords: 0`. attachmentReadLabel returns null for that case, and
 * two composers filled the null with the literal 'read': "scan.pdf · read",
 * for a file nothing had read. The label is real here (only the hook's state
 * and the chat transport are stubbed), so this is the chip the user sees.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const ATTACHMENTS = [
  { id: 'a1', name: 'scan.pdf', status: 'ready', fileId: 'f1', extractionMethod: null, extractionWords: 0 },
  { id: 'a2', name: 'protocol.docx', status: 'ready', fileId: 'f2', extractionMethod: 'docx', extractionWords: 1240 },
];

vi.mock('../../hooks/useChatUpload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useChatUpload')>()),
  useChatUpload: () => ({
    attachments: ATTACHMENTS,
    uploading: false,
    statusMessage: '',
    addFiles: () => {},
    removeAttachment: () => {},
    clear: () => {},
  }),
}));

vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: [],
    isStreaming: false,
    isLoadingThread: false,
    send: vi.fn(),
    loadThread: vi.fn(async () => {}),
    threadId: null,
  }),
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import { EctdCoauthor } from '../surfaces/EctdCoauthor';

const props = { onAsk: () => {}, onNav: () => {}, onSend: () => {}, segment: 'mdx' } as any;

afterEach(() => cleanup());

describe.each([
  ['ConversationThread', ConversationThread],
  ['EctdCoauthor', EctdCoauthor],
] as Array<[string, React.ComponentType<any>]>)('%s attachment chip', (_name, Component) => {
  it('does not call a file "read" when no text was extracted from it', () => {
    const { container } = render(<Component {...props} />);
    const text = container.textContent ?? '';
    expect(text).toContain('scan.pdf');
    expect(text).not.toMatch(/scan\.pdf\s*·\s*read\b/);
    expect(text).toMatch(/scan\.pdf\s*·\s*no text extracted/);
  });

  it('still says what was read, and how much', () => {
    const { container } = render(<Component {...props} />);
    expect(container.textContent ?? '').toMatch(/protocol\.docx\s*·\s*read · 1,240 words/);
  });
});

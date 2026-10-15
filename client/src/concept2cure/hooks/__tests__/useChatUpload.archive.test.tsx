// @vitest-environment jsdom
/**
 * A .zip given to the Data Room's upload is opened in the browser, and each
 * file inside it reaches POST /api/chat/upload as its own upload, under its
 * own name and declared type, where the server checks it as any upload. What
 * was refused is a chip that says why, and is never sent. The archive itself
 * is never sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import JSZip from 'jszip';

vi.mock('../../../utils/authToken', () => ({ getAuthHeaders: () => ({ Authorization: 'Bearer t' }) }));

import { useChatUpload } from '../useChatUpload';

const sent: Array<{ name: string; type: string; projectId: string | null }> = [];

/* Every browser has Blob.arrayBuffer; jsdom's File does not. Read it the way jsdom can. */
if (!File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = function arrayBuffer(this: File) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: FormData }) => {
    const file = init.body.get('file') as File;
    sent.push({ name: file.name, type: file.type, projectId: init.body.get('projectId') as string | null });
    return new Response(JSON.stringify({ fileId: `f-${sent.length}`, extractionMethod: 'utf8', extractionWords: 3 }), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function zipFile(entries: Record<string, string>, name = 'study.zip'): Promise<File> {
  const zip = new JSZip();
  for (const [path, body] of Object.entries(entries)) zip.file(path, body);
  return new File([await zip.generateAsync({ type: 'uint8array' })], name, { type: 'application/zip' });
}

describe('a .zip in the Data Room', () => {
  it('sends each file inside as its own upload, and refuses the rest by name', async () => {
    const archive = await zipFile({
      'sdtm/ae.csv': 'STUDYID,DOMAIN\nX,AE\n', 'define.xml': '<ODM/>', '../escape.csv': 'x', 'nested.zip': 'y', 'notes.exe': 'z',
    });
    const { result } = renderHook(() => useChatUpload({ projectId: 'p-1' }));
    act(() => result.current.addFiles([archive]));
    await waitFor(() => expect(result.current.statusMessage).toMatch(/^study\.zip: 2 files sent as separate uploads, 3 not opened\./));

    expect(sent).toEqual([
      { name: 'ae.csv', type: 'text/csv', projectId: 'p-1' },
      { name: 'define.xml', type: 'application/xml', projectId: 'p-1' },
    ]);
    const chips = Object.fromEntries(result.current.attachments.map((a) => [a.name, a.status === 'error' ? a.error : a.status]));
    expect(chips).toEqual({
      'study.zip › ../escape.csv': 'Not opened: its path climbs out of the archive (..)',
      'study.zip › nested.zip': 'Not opened: an archive inside an archive is not opened; upload it on its own',
      'study.zip › sdtm/ae.csv': 'ready',
      'study.zip › define.xml': 'ready',
      // A type the Data Room does not take is not opened, as it would not be uploaded on its own.
      'study.zip › notes.exe': 'Not opened: the Data Room does not take .exe',
    });
  });

  it('an archive it cannot open is one chip that says so, and nothing is sent', async () => {
    const { result } = renderHook(() => useChatUpload({ projectId: 'p-1' }));
    act(() => result.current.addFiles([new File(['not a zip'], 'broken.zip')]));
    await waitFor(() => expect(result.current.attachments).toHaveLength(1));
    expect(result.current.attachments[0]).toMatchObject({ name: 'broken.zip', status: 'error', error: 'Not opened: it could not be read as a .zip archive.' });
    expect(sent).toEqual([]);
  });
});

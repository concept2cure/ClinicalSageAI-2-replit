// @vitest-environment jsdom
/**
 * The one drop zone (FileDropZone.tsx, MR-08 Stage 6 step 1): files and
 * folders, chosen or dropped, each with its path; reading stops at the cap and
 * says how many were left; and the two ways it is activated.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FileDropZone, pickedFromList, readDroppedEntries, type PickedFiles } from '../FileDropZone';

afterEach(cleanup);

type Entry = { isFile: boolean; isDirectory: boolean; name: string; fullPath: string; file?: unknown; createReader?: unknown };
const fileEntry = (fullPath: string): Entry => ({
  isFile: true, isDirectory: false, name: fullPath.split('/').pop()!, fullPath,
  file: (ok: (f: File) => void) => ok(new File([fullPath], fullPath.split('/').pop()!)),
});
/** A folder whose reader answers in batches of two, then an empty batch, as engines do. */
const dirEntry = (fullPath: string, children: Entry[]): Entry => ({
  isFile: false, isDirectory: true, name: fullPath.split('/').pop()!, fullPath,
  createReader: () => {
    let at = 0;
    return { readEntries: (ok: (es: Entry[]) => void) => { const batch = children.slice(at, at + 2); at += 2; ok(batch); } };
  },
});

const STUDY = dirEntry('/study-001', [
  fileEntry('/study-001/ae.xpt'),
  fileEntry('/study-001/dm.xpt'),
  dirEntry('/study-001/define', [fileEntry('/study-001/define/define.xml'), fileEntry('/study-001/define/define2-1.xsl')]),
  fileEntry('/study-001/csr.pdf'),
]);

describe('reading what was dropped', () => {
  it('reads every file under a dropped folder, depth first, with its path', async () => {
    const got = await readDroppedEntries([STUDY as never, fileEntry('/cover-letter.pdf') as never], 500);
    expect(got.files.map((f) => f.path)).toEqual([
      'study-001/ae.xpt', 'study-001/dm.xpt', 'study-001/define/define.xml', 'study-001/define/define2-1.xsl',
      'study-001/csr.pdf', 'cover-letter.pdf',
    ]);
    expect(got.unread).toBe(0);
  });

  it('stops at the cap and counts what it did not read', async () => {
    const got = await readDroppedEntries([STUDY as never], 3);
    expect(got.files).toHaveLength(3);
    expect(got.unread).toBe(2);
  });

  it("keeps a chosen folder's paths, and caps a long list", () => {
    const a = new File(['a'], 'ae.xpt');
    Object.defineProperty(a, 'webkitRelativePath', { value: 'study-001/ae.xpt' });
    const b = new File(['b'], 'loose.pdf');
    expect(pickedFromList([a, b], 500)).toEqual({ files: [{ file: a, path: 'study-001/ae.xpt' }, { file: b, path: 'loose.pdf' }], unread: 0 });
    expect(pickedFromList([a, b], 1).unread).toBe(1);
  });
});

describe('the zone', () => {
  it('as a button: Enter chooses files, and where folders are offered a dropped folder reaches the caller with paths', async () => {
    const onFiles = vi.fn((_p: PickedFiles) => {});
    render(<FileDropZone accept=".pdf" directory label="Add sources" onFiles={onFiles}>{() => <span>Drop here</span>}</FileDropZone>);
    const zone = screen.getByRole('button', { name: 'Add sources' });
    const input = screen.getByLabelText('Add sources: choose files') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    fireEvent.keyDown(zone, { key: 'Enter' });
    expect(click).toHaveBeenCalledTimes(1);
    fireEvent.drop(zone, { dataTransfer: { items: [{ webkitGetAsEntry: () => STUDY }], files: [] } });
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    expect(onFiles.mock.calls[0][0].files.map((f) => f.path)).toContain('study-001/define/define.xml');
  });

  it('with its own controls: a labelled group, no nested button, and a folder input that picks directories', () => {
    const onFiles = vi.fn();
    render(
      <FileDropZone accept=".pdf" directory activation="controls" label="Upload documents" onFiles={onFiles}>
        {({ chooseFolder }) => <button type="button" onClick={chooseFolder}>Upload a folder</button>}
      </FileDropZone>,
    );
    expect(screen.getByRole('group', { name: 'Upload documents' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Upload documents' })).toBeNull();
    const folder = screen.getByLabelText('Upload documents: choose a folder') as HTMLInputElement;
    expect(folder.hasAttribute('webkitdirectory')).toBe(true);
    const click = vi.spyOn(folder, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Upload a folder' }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('where folders are not offered (the Data Room), a drop gives the dropped files only, as before', async () => {
    const onFiles = vi.fn((_p: PickedFiles) => {});
    render(<FileDropZone accept=".pdf" label="Add sources" onFiles={onFiles}>{() => null}</FileDropZone>);
    const f = new File(['x'], 'protocol.pdf');
    fireEvent.drop(screen.getByRole('button', { name: 'Add sources' }), { dataTransfer: { items: [{ webkitGetAsEntry: () => STUDY }], files: [f] } });
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    expect(onFiles.mock.calls[0][0]).toEqual({ files: [{ file: f, path: 'protocol.pdf' }], unread: 0 });
  });

  it('a plain file drop with no entry API still reaches the caller', async () => {
    const onFiles = vi.fn((_p: PickedFiles) => {});
    render(<FileDropZone accept=".pdf" label="Add sources" onFiles={onFiles}>{() => null}</FileDropZone>);
    const f = new File(['x'], 'protocol.pdf');
    fireEvent.drop(screen.getByRole('button', { name: 'Add sources' }), { dataTransfer: { items: [{}], files: [f] } });
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    expect(onFiles.mock.calls[0][0]).toEqual({ files: [{ file: f, path: 'protocol.pdf' }], unread: 0 });
  });
});

// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { useVaultUpload, type VaultUploadFileStatus } from '../useVaultUpload';
import { stageFiles, VaultUploadStaging } from '../surfaces/VaultUploadStaging';
import { VaultUploadManifestControls } from '../surfaces/VaultUploadManifestControls';
import { applyManifest, manifestNote, manifestOf, parseManifest } from '../surfaces/vaultUploadManifest';
import { stubIngestXhr } from './_ingest-xhr-fake';

const FOLDERS = [{ id: 'module-3', label: 'Module 3 · Quality' }];
const staging = () => stageFiles({ files: [{ file: new File(['a'], 'a.pdf'), path: 'a.pdf' }, { file: new File(['b'], 'b.pdf'), path: 'b.pdf' }], unread: 0 }, 'OTHER');
const parsed = (text: string) => {
  const result = parseManifest(text);
  if (!result.ok) throw new Error(result.reason);
  return result.lines;
};
const panelProps = (data = staging()) => ({ staging: data, folders: FOLDERS, uploading: false, onChange: vi.fn(), onRemove: vi.fn(), onUpload: vi.fn(), onDone: vi.fn() });
const applyCsv = (text: string, name = 'library.csv') => fireEvent.change(screen.getByTestId('vault-stage-manifest-file'), { target: { files: [new File([text], name)] } });
const manifestBlock = () => within(screen.getByTestId('vault-stage-manifest'));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Vault upload review: honest results and spreadsheet recovery', () => {
  it('a full send with no reply is unknown in the row and batch, never claimed not recorded', async () => {
    stubIngestXhr(vi.fn(async () => { throw new Error('lost reply'); }));
    const { result } = renderHook(() => useVaultUpload('11111111-1111-4111-8111-111111111111'));
    const statuses: VaultUploadFileStatus[] = [];
    let outcome!: Awaited<ReturnType<typeof result.current.upload>>;
    await act(async () => { outcome = await result.current.upload([new File(['a'], 'a.pdf')], { onFileStatus: (_i, status) => statuses.push(status) }); });
    expect(outcome.succeeded).toEqual([]);
    expect(outcome.recorded).toEqual([]);
    expect(outcome.failed[0]).toMatchObject({ name: 'a.pdf', unknown: true });
    expect(statuses.at(-1)).toMatchObject({ state: 'refused', unknown: true });
    expect(result.current.note?.text).toMatch(/not known whether.*recorded/i);
    expect(result.current.note?.text).not.toMatch(/Not filed|Nothing partial was recorded/);
    const data = staging();
    data.rows[0].status = statuses.at(-1)!;
    data.rows = data.rows.slice(0, 1);
    render(<VaultUploadStaging {...panelProps(data)} />);
    expect(screen.getByTestId('vault-stage-row').textContent).toMatch(/not known whether.*recorded/i);
    expect(screen.getByTestId('vault-stage-live').textContent).toMatch(/not known whether.*recorded/i);
    expect(screen.getByTestId('vault-stage-live').textContent).not.toContain('not recorded');
  });

  it('tracks a full send even without a progress callback and preserves partial-send refusal', async () => {
    const { result } = renderHook(() => useVaultUpload('11111111-1111-4111-8111-111111111111'));
    stubIngestXhr(vi.fn(async () => { throw new Error('lost reply'); }));
    await act(async () => { expect((await result.current.upload([new File(['a'], 'a.pdf')])).failed[0]).toMatchObject({ unknown: true }); });
    stubIngestXhr(vi.fn(async () => { throw new Error('lost connection'); }), [0.5]);
    await act(async () => { expect((await result.current.upload([new File(['b'], 'b.pdf')])).failed[0]).not.toHaveProperty('unknown'); });
    expect(result.current.note?.text).toContain('Not filed');
  });



});

describe('Vault upload review: spreadsheet fields and controls', () => {
  it('refuses a File-only line rather than claiming its empty patch applied', () => {
    const outcome = applyManifest(staging().rows, parsed('File,Title\na.pdf,\n'), FOLDERS);
    expect(outcome.patches.size).toBe(0);
    expect(outcome.refused[0].reason).toMatch(/no fields|no values/);
    expect(manifestNote(outcome)).not.toContain('Manifest applied to');
  });

  it('names the chosen CSV and states the actual zero applied count', async () => {
    render(<VaultUploadManifestControls rows={staging().rows} folders={FOLDERS} busy={false} onChange={vi.fn()} />);
    applyCsv('File,Document type\na.pdf,Not a type\n');
    await waitFor(() => expect(manifestBlock().getByRole('alert').textContent).toContain('library.csv'));
    expect(manifestBlock().getByRole('alert').textContent).toMatch(/0 files/);
    expect(manifestBlock().getByRole('alert').textContent).not.toContain('Manifest applied to');
  });

  it('caps the details while keeping exact counts for large refused and unnamed lists', () => {
    const note = manifestNote({ patches: new Map(), refused: Array.from({ length: 40 }, (_, i) => ({ line: i + 2, file: `bad${i}.pdf`, reason: 'not allowed' })), unnamed: Array.from({ length: 40 }, (_, i) => `unnamed${i}.pdf`) });
    expect(note).toContain('40 lines');
    expect(note).toContain('40 files');
    expect(note).not.toContain('bad39.pdf');
    expect(note).not.toContain('unnamed39.pdf');
    expect(note).toMatch(/more/);
  });

  it('exports a UTF-8 BOM so spreadsheet folder labels retain their characters', () => {
    expect(manifestOf(staging().rows, FOLDERS).charCodeAt(0)).toBe(0xfeff);
  });

  it('refuses to apply a delayed file read once upload starts', async () => {
    const Reader = FileReader;
    let complete!: () => void;
    class HeldReader {
      result: string | ArrayBuffer | null = null;
      error = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsText(file: File) {
        const real = new Reader();
        real.onload = () => { this.result = real.result; complete = () => this.onload?.(); };
        real.readAsText(file);
      }
    }
    vi.stubGlobal('FileReader', HeldReader);
    const change = vi.fn();
    const rows = staging().rows;
    const { rerender } = render(<VaultUploadManifestControls rows={rows} folders={FOLDERS} busy={false} onChange={change} />);
    applyCsv('File,Title\na.pdf,Changed\n');
    await waitFor(() => expect(complete).toBeTypeOf('function'));
    rerender(<VaultUploadManifestControls rows={rows} folders={FOLDERS} busy onChange={change} />);
    await act(async () => complete());
    expect(change).not.toHaveBeenCalled();
    expect(manifestBlock().getByRole('alert').textContent).toMatch(/upload|Uploading/);
  });

  it('keeps its live regions mounted, then clears stale notes when upload starts', async () => {
    const rows = staging().rows;
    const { rerender } = render(<VaultUploadManifestControls rows={rows} folders={FOLDERS} busy={false} onChange={vi.fn()} />);
    const status = manifestBlock().getByRole('status');
    const alert = manifestBlock().getByRole('alert');
    expect(status.textContent).toBe('');
    expect(alert.textContent).toBe('');
    applyCsv('File,Title\na.pdf,Changed\n');
    await waitFor(() => expect(status.textContent).not.toBe(''));
    rerender(<VaultUploadManifestControls rows={rows} folders={FOLDERS} busy onChange={vi.fn()} />);
    expect(status.textContent).toBe('');
    expect(manifestBlock().getByRole('status')).toBe(status);
    expect(manifestBlock().getByRole('alert')).toBe(alert);
  });
});

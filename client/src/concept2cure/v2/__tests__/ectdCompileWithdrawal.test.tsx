// @vitest-environment jsdom
/* ── EctdCompile, WO-9 Click 6: a follow-up whose only act is a withdrawal ──────────────────
 * 2026-09-29 (W5/D7). Found by clicking it: sequence 0001 withdrew one filed leaf
 * and shipped no content file. The surface then (1) offered no download,
 * because "a package to hand over" was read as "rendered leaf files > 0";
 * (2) called its regional backbone "not well-formed XML" because it holds no
 * Module 1 leaf; and (3) would have called the package a working document. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { EctdCompile } from '../surfaces/EctdCompile';
import { props, PACKAGE, SPINE_COMPILE, serveSpineCompile } from './ectdCompile.fixtures';

const mockSpineCompile = (compile: Record<string, unknown>) => serveSpineCompile(apiRequest, compile);
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });


const WITHDRAWAL_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<ectd:ectd xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3.org/1999/xlink" dtd-version="3.2">
  <m1-administrative-information-and-prescribing-information>
    <leaf operation="new" checksum="aa" checksum-type="md5" xlink:href="m1/us/us-regional.xml" xlink:type="simple" ID="leaf-m1-regional-backbone">
      <title>Module 1 regional backbone (us-regional.xml)</title>
    </leaf>
  </m1-administrative-information-and-prescribing-information>
  <m3-quality><m3-2-body-of-data><m3-2-s-drug-substance>
    <leaf operation="delete" modified-file="../0000/index.xml#leaf-3-2-S-4-2-control" xlink:type="simple" ID="leaf-3-2-S-4-2-control">
      <title>Control of Drug Substance (CTD 3.2.S.4)</title>
    </leaf>
  </m3-2-s-drug-substance></m3-2-body-of-data></m3-quality>
</ectd:ectd>`;

const LEAFLESS_REGIONAL = `<?xml version="1.0" encoding="UTF-8"?>
<fda-regional:fda-regional dtd-version="3.3" xmlns:fda-regional="http://www.ich.org/fda" xmlns:xlink="http://www.w3.org/1999/xlink">
  <admin><applicant-info/></admin>
  <m1-regional>
  </m1-regional>
</fda-regional:fda-regional>`;

const WITHDRAWAL_COMPILE = {
  ...SPINE_COMPILE,
  sequenceNumber: '0001',
  xmlBackbone: WITHDRAWAL_INDEX,
  leafFilesRendered: 0,
  package: {
    ...PACKAGE,
    files: ['index-md5.txt', 'index.xml', 'm1/us/us-regional.xml', 'util/index-md5.txt'],
    regionalBackbone: { path: 'm1/us/us-regional.xml', xml: LEAFLESS_REGIONAL },
    pdfa: { pdfLeaves: 0, pdfaConverted: 0, allPdfA: true, notConverted: [] },
  },
  lifecycle: {
    priorSequence: '0000', priorState: 'rehearsal', unfiledPriorSequences: ['0000'], leftOut: [],
    operations: [{
      operation: 'delete', ctdSection: '3.2.S.4.2', fileName: 'control.pdf',
      href: '../0000/index.xml#leaf-3-2-S-4-2-control', modifiedFile: '../0000/index.xml#leaf-3-2-S-4-2-control',
    }],
  },
};

describe('EctdCompile — a follow-up whose only act is a withdrawal', () => {
  beforeEach(() => { (window as any).C2C_PROJECT = { id: 42 }; });

  async function compileWith(compile: Record<string, unknown>) {
    mockSpineCompile(compile);
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Compile eCTD/ }));
    return screen.findByRole('region', { name: 'Leaf hierarchy' });
  }

  it('can still be downloaded: it is a package, with no content file of its own', async () => {
    await compileWith(WITHDRAWAL_COMPILE);
    expect(screen.getByRole('button', { name: /Download package \(\.zip\)/ })).toBeTruthy();
  });

  it('is not called a working document: its backbone is the package\'s own', async () => {
    await compileWith(WITHDRAWAL_COMPILE);
    expect(screen.queryByText(/It is a working document/)).toBeNull();
  });

  it('says a well-formed backbone with no leaf carries none, rather than calling it malformed', async () => {
    const tree = await compileWith(WITHDRAWAL_COMPILE);
    expect(tree.textContent).not.toMatch(/not well-formed/);
    expect(tree.textContent).toMatch(/m1\/us\/us-regional\.xml — regional Module 1\s*It carries no leaves/);
  });

  it('reads a withdrawal as one: the leaf it withdraws, and no file', async () => {
    const tree = await compileWith(WITHDRAWAL_COMPILE);
    expect(tree.textContent).toMatch(/withdraws \.\.\/0000\/index\.xml#leaf-3-2-S-4-2-control/);
    expect(tree.textContent).not.toMatch(/supersedes/);
  });

  it('still says so when a backbone really is not well-formed', async () => {
    const tree = await compileWith({
      ...WITHDRAWAL_COMPILE,
      package: { ...WITHDRAWAL_COMPILE.package, regionalBackbone: { path: 'm1/us/us-regional.xml', xml: '<fda-regional><m1-regional>' } },
    });
    expect(tree.textContent).toMatch(/not well-formed XML/);
  });

  it('a draft compile — no package built — keeps the working-document caveat and offers no package', async () => {
    const draft: Record<string, unknown> = { ...SPINE_COMPILE, leafFilesRendered: 0 };
    delete draft.package;
    mockSpineCompile(draft);
    render(<EctdCompile {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Compile eCTD/ }));
    expect(await screen.findByText(/It is a working document/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Download package \(\.zip\)/ })).toBeNull();
  });
});

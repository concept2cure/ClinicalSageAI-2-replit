/**
 * Build a real FDA package through `packageEctdSubmission` and hand back its
 * us-regional.xml as a DOM, so tests assert element ORDER and nesting rather
 * than substrings. Shared by the applicant-info and Module 1 heading tests.
 */
import { expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import { DOMParser, type Document, type Element } from '@xmldom/xmldom';
import { packageEctdSubmission, type EctdLeaf } from '../../regional-packager';
import type { FdaApplicantContact } from '../../ectd-packager/types';
import type { SubmissionBundle } from '../../types';

export interface FdaPackOptions {
  /** Module 1 leaves, in the order the package lists them. Default: one 1.2 cover letter. */
  leaves?: { ctdSection: string; fileName: string }[];
  sponsorId?: string;
  sponsorName?: string;
  contacts?: FdaApplicantContact[];
  /** fileName → form type, declared under fda.forms with the SAME leaf object the package ships. */
  forms?: Record<string, string>;
}

export interface FdaPack {
  bundle: SubmissionBundle;
  xml: string;
  doc: Document;
}

const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');

export async function packFda(opts: FdaPackOptions = {}): Promise<FdaPack> {
  const { leaves: specs = [{ ctdSection: '1.2', fileName: 'cover.pdf' }], contacts, forms = {}, ...who } = opts;
  const identity = { sponsorId: '123456789', sponsorName: 'Acme Biologics Inc.', ...who };
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'fda-backbone-'));
  try {
    const leaves: EctdLeaf[] = [];
    for (const spec of specs) {
      const bytes = Buffer.from(`%PDF-1.7\n% ${spec.fileName}\n`);
      const sourcePath = path.join(work, spec.fileName);
      await fs.writeFile(sourcePath, bytes);
      leaves.push({ operation: 'new', ctdSection: spec.ctdSection, fileName: spec.fileName, md5: md5(bytes), title: spec.fileName, sourcePath });
    }
    const declared = Object.entries(forms).map(([fileName, formType]) => ({
      formType,
      leaf: leaves.find((l) => l.fileName === fileName)!,
    }));
    const bundle = await packageEctdSubmission({
      region: 'fda',
      applicationId: '123456',
      sequence: '0000',
      submissionType: 'original',
      sponsorId: identity.sponsorId,
      sponsorName: identity.sponsorName,
      productName: 'Acmeximab',
      leaves,
      outputDir: path.join(work, 'out'),
      environment: 'staging',
      fda: {
        applicationType: 'ind',
        ...(contacts ? { contacts } : {}),
        ...(declared.length ? { forms: declared } : {}),
      },
    });
    const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
    const xml = await zip.file('m1/us/us-regional.xml')!.async('string');
    return { bundle, xml, doc: new DOMParser().parseFromString(xml, 'text/xml') };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

/** The single element of this name in the document — fails when absent or repeated. */
export function only(doc: Document, name: string): Element {
  const found = doc.getElementsByTagName(name);
  expect(found.length, `<${name}> occurs ${found.length} times`).toBe(1);
  return found.item(0)!;
}

/** Element children's names, in document order. */
export const childNames = (el: Element): string[] =>
  Array.from(el.childNodes).filter((n) => n.nodeType === 1).map((n) => n.nodeName);

export const textOf = (el: Element): string => (el.textContent ?? '').trim();

/** A complete contact: both wrappers are written for it. */
export const FULL_CONTACT: FdaApplicantContact = {
  type: 'regulatory', name: 'Jane Smith', email: 'jane@example.com', phone: '+1 301 555 0100',
};

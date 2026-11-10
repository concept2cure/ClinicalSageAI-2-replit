/**
 * The converter does not request what a Word file links to (found 2026-11-10 while giving Vault versions a PDF
 * rendition, P-107 item 3; docs/evidence/SPINE/S6/2026-11-10-p107-renditions/04-linked-content-probe.txt).
 *
 * `convertDocxToPdf` had only ever run on Word files this platform built. A Vault rendition runs it on a file someone
 * uploaded. Measured with LibreOffice 24.2 and the converter's own flags: a linked image named by an external
 * relationship was requested over HTTP during the conversion, whatever type the relationship declared. So an upload
 * could make this server call an address inside its own network.
 *
 * The converter now starts LibreOffice with BlockUntrustedRefererLinks set in the profile it makes for each run, the
 * setting LibreOffice provides for exactly this. This runs the real converter against a listener on the loopback
 * address and asserts that nothing is requested and a PDF is still written. Where LibreOffice is not installed the
 * conversions are skipped and say so; the profile's content is checked everywhere.
 */
import { spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { convertDocxToPdf, looksLikePdf, OFFICE_PROFILE_SETTINGS } from '../pdf-converter';

const installed = spawnSync(process.env.LIBREOFFICE_BIN || 'libreoffice', ['--version'], { stdio: 'ignore' }).status === 0;
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

let listener: Server;
let port = 0;
const requested: string[] = [];

beforeAll(async () => {
  listener = createServer((req, res) => {
    requested.push(`${req.method} ${req.url}`);
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  port = (listener.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => listener.close(() => resolve()));
});

/** A Word file with one picture that is linked, not embedded: its relationship names an address outside the file. */
async function wordFileLinkingTo(target: string, relationshipType = 'image'): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${OFFICE}/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId5" Type="${OFFICE}/${relationshipType}" Target="${target}" TargetMode="External"/></Relationships>`);
  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    `xmlns:r="${OFFICE}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<w:body><w:p><w:r><w:t>Linked image probe</w:t></w:r></w:p><w:p><w:r><w:drawing>' +
    '<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="952500" cy="952500"/><wp:docPr id="1" name="Picture 1"/>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
    '<pic:nvPicPr><pic:cNvPr id="1" name="probe.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:link="rId5"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="952500" cy="952500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('the converter and a Word file that links to an address', () => {
  it('starts LibreOffice with linked content from an untrusted file blocked', () => {
    expect(OFFICE_PROFILE_SETTINGS).toContain('oor:path="/org.openoffice.Office.Common/Security/Scripting"');
    expect(OFFICE_PROFILE_SETTINGS).toMatch(/<prop oor:name="BlockUntrustedRefererLinks" oor:op="fuse"><value>true<\/value><\/prop>/);
  });

  it.skipIf(!installed)('requests nothing while converting a file with a linked image, and still writes the PDF', async () => {
    requested.length = 0;
    const { pdf } = await convertDocxToPdf(await wordFileLinkingTo(`http://127.0.0.1:${port}/linked-image.png`), { backend: 'libreoffice' });
    expect(looksLikePdf(pdf)).toBe(true);
    expect(requested).toEqual([]);
  }, 180_000);

  it.skipIf(!installed)('requests nothing when the linked image is declared as a hyperlink', async () => {
    requested.length = 0;
    const { pdf } = await convertDocxToPdf(await wordFileLinkingTo(`http://127.0.0.1:${port}/typed-as-hyperlink.png`, 'hyperlink'), { backend: 'libreoffice' });
    expect(looksLikePdf(pdf)).toBe(true);
    expect(requested).toEqual([]);
  }, 180_000);
});

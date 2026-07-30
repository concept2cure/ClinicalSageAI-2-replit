/**
 * eCTD v4.0 HL7 RPS `submissionUnit.xml` message serializer.
 *
 * Emits the single RPS submission-unit message that replaces the v3.2.2
 * `index.xml` + regional backbone. The message is an HL7 v3 `PORP_IN000001UV`
 * interaction (namespace `urn:hl7-org:rps`) carrying:
 *   - the Submission Unit (id UUID, submission-unit-type code + OID, title,
 *     statusCode, sequenceNumber),
 *   - its Submission (submission-type code) and Application (application-type
 *     code + center Application-Id OID + number),
 *   - a flat list of Contexts of Use (id UUID, CoU code + OID, statusCode,
 *     priorityNumber, documentReference, keywords, and — for lifecycle — a
 *     relatedContextOfUse pointing at the superseded CoU),
 *   - reusable Document objects (id UUID, title, media type, SHA-256 integrity).
 *
 * The message header carries the FDA Regional Implementation Guide OID.
 *
 * NORMATIVE AUTHORITY: the ICH eCTD v4.0 / HL7 RPS R2 message schema
 * (PORP_IN000001UV) is the definitive structure. This serializer emits the
 * element/attribute set the FDA v4.0 validation criteria reference and is
 * schema-validatable once the ICH RPS XSD is vendored (see xml-validator +
 * the util/schema drop-point). It escapes all text and is deterministic given
 * deterministic ids + creationTime.
 *
 * @module server/services/ectd/ectd4/rps-message-builder
 */

import {
  FDA_REGIONAL_IG_OID,
  FDA_APPLICATION_ID_OID,
} from '../controlled-vocab';
import { messageId as deriveMessageId } from './ids';
import type { RpsMessageInput, RpsContextOfUse, RpsDocument } from './types';

/** RPS message + regional namespaces. */
const RPS_NS = 'urn:hl7-org:rps';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function indent(block: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return block
    .split('\n')
    .map((line) => (line.length ? pad + line : line))
    .join('\n');
}

/** Render one document object. */
function documentElement(doc: RpsDocument): string {
  return `<document>
  <id root="${esc(doc.id)}"/>
  <title>${esc(doc.title)}</title>
  <text mediaType="${esc(doc.mediaType)}" integrityCheckAlgorithm="${esc(doc.checksumType)}" integrityCheck="${esc(doc.checksum)}">
    <reference value="${esc(doc.href)}"/>
  </text>
</document>`;
}

/** Render one context-of-use element (with keywords + lifecycle reference). */
function contextOfUseElement(cou: RpsContextOfUse): string {
  const parts: string[] = [];
  parts.push(`<id root="${esc(cou.id)}"/>`);
  parts.push(`<code code="${esc(cou.code)}" codeSystem="${esc(cou.codeSystem)}"/>`);
  if (cou.title) parts.push(`<title>${esc(cou.title)}</title>`);
  parts.push(`<statusCode code="${esc(cou.status)}"/>`);
  parts.push(`<priorityNumber value="${cou.priorityNumber}"/>`);
  // documentReference: the CoU presents exactly one document
  parts.push(`<documentReference>\n  <id root="${esc(cou.documentId)}"/>\n</documentReference>`);
  for (const kw of cou.keywords ?? []) {
    const value = kw.value ? `\n  <value>${esc(kw.value)}</value>` : '';
    parts.push(`<keyword>\n  <code code="${esc(kw.code)}" codeSystem="${esc(kw.codeSystem)}"/>${value}\n</keyword>`);
  }
  if (cou.relatedContextOfUseId) {
    parts.push(`<relatedContextOfUse>\n  <id root="${esc(cou.relatedContextOfUseId)}"/>\n</relatedContextOfUse>`);
  }
  return `<contextOfUse>\n${indent(parts.join('\n'), 2)}\n</contextOfUse>`;
}

/** Build the submissionUnit body (unit → submission → application + CoUs + documents). */
function submissionUnitElement(input: RpsMessageInput): string {
  const { submissionUnit: su, submission, application } = input;
  const appIdOid = FDA_APPLICATION_ID_OID[application.center];

  const applicationEl = `<application>
  <id root="${esc(appIdOid)}" extension="${esc(application.number)}"/>
  <code code="${esc(application.typeCode)}" codeSystem="2.16.840.1.113883.3.989.5.1.2.2.1.1.4"/>
</application>`;

  const submissionEl = `<submission>
  <code code="${esc(submission.typeCode)}" codeSystem="2.16.840.1.113883.3.989.5.1.2.2.1.12.5"/>${submission.number ? `\n  <id extension="${esc(submission.number)}"/>` : ''}
${indent(applicationEl, 2)}
</submission>`;

  const cous = input.contextsOfUse.map((c) => contextOfUseElement(c)).join('\n');
  const docs = input.documents.map((d) => documentElement(d)).join('\n');

  const body = [
    `<id root="${esc(su.id)}"/>`,
    `<code code="${esc(su.unitTypeCode)}" codeSystem="2.16.840.1.113883.3.989.5.1.2.2.1.13.2"/>`,
    `<title>${esc(su.title)}</title>`,
    `<statusCode code="${esc(su.status)}"/>`,
    `<sequenceNumber value="${esc(su.sequenceNumber)}"/>`,
    submissionEl,
    cous,
    docs,
  ].join('\n');

  return `<submissionUnit>\n${indent(body, 2)}\n</submissionUnit>`;
}

/**
 * Serialize a full eCTD v4.0 `submissionUnit.xml` RPS message.
 * `creationTime` should be supplied (YYYYMMDDHHMMSS) for reproducible output;
 * when omitted the epoch is used so the function stays pure/deterministic.
 */
export function buildRpsMessage(input: RpsMessageInput): string {
  const msgId =
    input.messageId ??
    deriveMessageId(input.application.number, input.submissionUnit.sequenceNumber);
  const creationTime = input.creationTime ?? '19700101000000';

  const su = indent(submissionUnitElement(input), 6);

  return `<?xml version="1.0" encoding="UTF-8"?>
<PORP_IN000001UV xmlns="${RPS_NS}" xmlns:xsi="${XSI_NS}" ITSVersion="XML_1.0">
  <id root="${esc(msgId)}"/>
  <creationTime value="${esc(creationTime)}"/>
  <interactionId root="${FDA_REGIONAL_IG_OID}" extension="PORP_IN000001UV"/>
  <processingCode code="P"/>
  <processingModeCode code="T"/>
  <acceptAckCode code="NE"/>
  <controlActProcess classCode="CACT" moodCode="EVN">
    <subject typeCode="SUBJ">
${su}
    </subject>
  </controlActProcess>
</PORP_IN000001UV>`;
}

/** The package-relative path of the RPS message within a v4.0 sequence. */
export const RPS_MESSAGE_PATH = 'submissionUnit.xml';

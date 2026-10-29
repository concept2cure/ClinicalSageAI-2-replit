/**
 * The signature block under a register row (MR-12 Stage 5 step 4; 21 CFR
 * 11.50): who approved the version in force, when and with what meaning, or
 * who retired a retired document. The words follow the server's verdict
 * (server/services/qms/register-signatures.ts): an approval whose content has
 * changed, or that was withdrawn, is never shown as standing, and a read that
 * failed is never shown as unsigned.
 *
 * @module client/src/concept2cure/quality/RegisterSignatureLine
 */
import * as React from 'react';
import { GovernedTimestamp } from '../_shared/components/GovernedTimestamp';
import { signatureMeaningLabel } from '../_shared/signatureMeaning';
import type { QmsDoc, RegisterSignature } from './data';

const APPROVAL_LEAD: Record<string, string> = {
  valid: 'Approved by',
  changed: 'Content changed after approval · approved by',
  withdrawn: 'Approval withdrawn · signed by',
};
const RETIREMENT_LEAD: Record<string, string> = { signed: 'Retired by', withdrawn: 'Retirement signature withdrawn · signed by' };

function Signed({ lead, s }: { lead: string; s: RegisterSignature }) {
  return (
    <span className="qms-signature-line" data-testid="qms-signature-line">
      {lead} <strong>{s.signerName || 'a signer with no printed name on record'}</strong>
      {' · '}<GovernedTimestamp value={s.signedAt} layout="inline" />
      {' · Meaning: ' + signatureMeaningLabel(s.meaning)}
    </span>
  );
}

function Plain({ text }: { text: string }) {
  return <span className="qms-signature-line" data-testid="qms-signature-line">{text}</span>;
}

export function RegisterSignatureLine({ doc }: { doc: QmsDoc }) {
  const r = doc.retirementSignature;
  if (doc.status === 'retired' && r) {
    if (RETIREMENT_LEAD[r.state]) return <Signed lead={RETIREMENT_LEAD[r.state]} s={r} />;
    if (r.state === 'unsigned') return <Plain text="Retired before retirement was signed: no retirement signature is on record." />;
    return <Plain text="The retirement signature could not be read." />;
  }
  const a = doc.approvalSignature;
  if (!a) return null;
  const version = a.version ? `v${a.version}` : 'this version';
  if (APPROVAL_LEAD[a.state]) return <Signed lead={`${version} · ${APPROVAL_LEAD[a.state]}`} s={a} />;
  if (a.state === 'unverified') return <Plain text={`The approval signature of ${version} could not be verified.`} />;
  return <Plain text="The approval signature could not be read." />;
}

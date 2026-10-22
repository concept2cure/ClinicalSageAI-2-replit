/** Existing eCTD Compile package/history DTD evidence, extracted without changing behavior. */
import React from 'react';
import type { DtdValidationEvidence } from '@shared/regulatory/ectd-dtd-validation';

export interface PackageDtdStatus {
  required: string[];
  present: string[];
  missing: string[];
  missingStylesheets?: string[];
  requiredStylesheets?: string[];
  presentStylesheets?: string[];
  selfContained: boolean;
  validation?: DtdValidationEvidence;
}

const isRecord = (value: unknown): value is Record<string, unknown> => value != null && typeof value === 'object' && !Array.isArray(value);
const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
function xmlEvidence(value: unknown): boolean {
  return isRecord(value) && typeof value.ran === 'boolean' && typeof value.valid === 'boolean' &&
    stringList(value.errors) && ['well-formed', 'dtd', 'xsd'].includes(String(value.mode));
}

/** Decode recorded execution evidence; a plausible aggregate flag is insufficient. */
function dtdEvidence(value: unknown): DtdValidationEvidence | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.passed !== 'boolean' ||
      !stringList(value.expectedFiles) || !Array.isArray(value.files) || !isRecord(value.integrity)) return null;
  const integrity = value.integrity;
  if (typeof integrity.ok !== 'boolean' || !stringList(integrity.verified) || !stringList(integrity.missingFiles) ||
      !stringList(integrity.unlistedFiles) || !Array.isArray(integrity.mismatched) ||
      !integrity.mismatched.every(item => isRecord(item) && typeof item.fileName === 'string' &&
        typeof item.expected === 'string' && typeof item.actual === 'string')) return null;
  if (!value.files.every(file => isRecord(file) && typeof file.relPath === 'string' && xmlEvidence(file.wellFormed) &&
      isRecord(file.doctype) && typeof file.doctype.valid === 'boolean' && stringList(file.doctype.errors) && xmlEvidence(file.dtd))) return null;
  return value as unknown as DtdValidationEvidence;
}

function completeDtdCoverage(evidence: DtdValidationEvidence | null): boolean {
  if (!evidence) return false;
  const expected = evidence.expectedFiles;
  return expected.length > 0 && expected.includes('index.xml') && new Set(expected).size === expected.length &&
    evidence.files.length === expected.length && new Set(evidence.files.map(file => file.relPath)).size === evidence.files.length &&
    expected.every(path => evidence.files.some(file => file.relPath === path));
}

function integrityVerified(integrity: DtdValidationEvidence['integrity']): boolean {
  return integrity.ok === true && integrity.verified.length > 0 && integrity.mismatched.length === 0 && integrity.missingFiles.length === 0 && integrity.unlistedFiles.length === 0;
}

function supportiveBytesVerified(recorded: Record<string, unknown> | null, integrity: DtdValidationEvidence['integrity']): boolean {
  if (!recorded || recorded.selfContained !== true) return false;
  const fields = ['required', 'present', 'missing', 'requiredStylesheets', 'presentStylesheets', 'missingStylesheets'];
  if (!fields.every(field => stringList(recorded[field]))) return false;
  const status = recorded as unknown as Required<PackageDtdStatus>;
  if (status.required.length === 0 || status.missing.length > 0 || status.missingStylesheets.length > 0) return false;
  return status.required.every(file => status.present.includes(file) && integrity.verified.includes(file)) &&
    status.requiredStylesheets.every(file => status.presentStylesheets.includes(file) && integrity.verified.includes(file));
}

function lintPassed(result: DtdValidationEvidence['files'][number]['dtd'], mode: 'well-formed' | 'dtd'): boolean {
  return result.ran === true && result.valid === true && result.mode === mode && result.errors.length === 0;
}

function dtdFilesPassed(evidence: DtdValidationEvidence): boolean {
  return evidence.files.every(file => lintPassed(file.wellFormed, 'well-formed') && file.doctype.valid === true &&
    file.doctype.errors.length === 0 && lintPassed(file.dtd, 'dtd'));
}

function DtdFileRows({ evidence }: { evidence: DtdValidationEvidence }) {
  return <>{evidence.expectedFiles.map(path => {
    const file = evidence.files.find(item => item.relPath === path);
    if (!file) return <tr key={path}><td className="mono">{path}</td><td colSpan={4}>No execution evidence — unverified.</td></tr>;
    const dtdRan = file.dtd.ran === true && file.dtd.mode === 'dtd';
    const diagnostics = [...file.wellFormed.errors, ...file.doctype.errors, ...file.dtd.errors];
    return <tr key={path}>
      <td className="mono">{path}</td>
      <td>{file.wellFormed.ran && file.wellFormed.mode === 'well-formed' ? file.wellFormed.valid ? 'Well-formed' : 'Invalid XML' : 'Not checked'}</td>
      <td>{file.doctype.valid ? 'Valid reference' : 'Invalid reference'}</td>
      <td>{dtdRan ? file.dtd.valid ? 'Ran · valid' : 'Ran · invalid' : 'Did not run · unverified'}</td>
      <td>{diagnostics.length > 0 ? <ul style={{ margin: 0, paddingLeft: 16 }}>{diagnostics.map((error, index) => <li key={index}>{error}</li>)}</ul> : '—'}</td>
    </tr>;
  })}</>;
}

function DtdIntegrityFacts({ integrity }: { integrity: DtdValidationEvidence['integrity'] }) {
  return <>
    <div style={{ marginTop: 6 }}>{integrityVerified(integrity) ? `Supportive-file integrity verified (${integrity.verified.length} files).` : 'Supportive-file integrity is unverified or failed.'}</div>
    <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
      {integrity.mismatched.map(item => <li key={`mismatch:${item.fileName}`}>Checksum mismatch: {item.fileName} (expected {item.expected}; actual {item.actual})</li>)}
      {integrity.missingFiles.map(path => <li key={`missing:${path}`}>Missing supportive file: {path}</li>)}
      {integrity.unlistedFiles.map(path => <li key={`unlisted:${path}`}>Supportive file not listed in integrity manifest: {path}</li>)}
    </ul>
  </>;
}

function dtdOutcomeLabel(passed: boolean, evidence: DtdValidationEvidence | null, complete: boolean): string {
  if (passed) return 'DTD validation passed';
  if (!evidence) return 'DTD validation not recorded — unverified.';
  if (!complete) return 'DTD validation evidence is incomplete — unverified.';
  return 'DTD validation has not passed — unverified.';
}

function packageDtdProof(status: unknown, packageSha256?: string | null) {
  const recorded = isRecord(status) ? status : null;
  const evidence = dtdEvidence(recorded?.validation);
  const hashKnown = typeof packageSha256 === 'string' && /^[a-f\d]{64}$/i.test(packageSha256);
  const complete = completeDtdCoverage(evidence);
  const passed = hashKnown && evidence?.passed === true && complete && dtdFilesPassed(evidence) &&
    integrityVerified(evidence.integrity) && supportiveBytesVerified(recorded, evidence.integrity);
  return { evidence, hashKnown, complete, passed };
}

/** Execution proof stays beside the package and its recorded history, never inferred from status. */
export function PackageDtdValidation({ status, packageSha256, label }: { status: unknown; packageSha256?: string | null; label: string }) {
  const { evidence, hashKnown, complete, passed } = packageDtdProof(status, packageSha256);
  return (
    <section aria-label={label} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', margin: '10px 0', fontSize: 12.5 }}>
      <div style={{ fontWeight: 600 }}>Package DTD validation</div>
      <div className={passed ? 'sp-tone-ok' : 'sp-tone-warn'}>
        {dtdOutcomeLabel(passed, evidence, complete)}
      </div>
      {hashKnown && <div>Package SHA-256 <span className="mono">{packageSha256}</span></div>}
      {evidence && (
        <>
          <table className="reg-tbl" style={{ marginTop: 6 }}>
            <thead><tr><th>XML file</th><th>XML structure</th><th>DOCTYPE</th><th>DTD execution</th><th>Diagnostics</th></tr></thead>
            <tbody><DtdFileRows evidence={evidence} /></tbody>
          </table>
          <DtdIntegrityFacts integrity={evidence.integrity} />
        </>
      )}
    </section>
  );
}

export function RegionalPackageFact({ pkg }: { pkg: { sha256?: string | null; dtdStatus?: unknown; regionalStatus?: unknown } }) {
  const status = isRecord(pkg.regionalStatus) ? pkg.regionalStatus : null;
  if (!status || typeof status.regionConformant !== 'boolean' || typeof status.file !== 'string') return <li className="sp-tone-warn">Regional backbone: unverified — no regional status was recorded.</li>;
  if (status.regionConformant && !packageDtdProof(pkg.dtdStatus, pkg.sha256).passed) return <li className="sp-tone-warn">Regional backbone: unverified — package DTD validation has not passed.</li>;
  return <li className={status.regionConformant ? undefined : 'sp-tone-warn'}>
    Regional backbone: {status.regionConformant ? 'conformant' : 'not conformant'} · <span className="mono">{status.file}</span>
    {typeof status.placeholderOf === 'string' && <> — placeholder using {status.placeholderOf}</>}
    {typeof status.conformanceGap === 'string' && <> — {status.conformanceGap}</>}
  </li>;
}


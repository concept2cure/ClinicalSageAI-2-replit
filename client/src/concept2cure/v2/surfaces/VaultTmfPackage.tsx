/**
 * The inspection package of a study's trial master file, shown as a document,
 * and the three figures it and the section state. Split out of
 * VaultTrialMasterFile.tsx (2026-11-10), in its folder.
 *
 * The retired eTMF screen showed the package it would generate: a cover, three
 * figures, the readiness verdict, the zone index, the open records and what
 * the package is. It is an open part of the section, beneath the records, with
 * the download in its bar. It is the index and the readiness picture, not the
 * documents, and says so.
 *
 * It states the section's verdict and no other. The verdict is computed once
 * by its caller (`tmfVerdict`) and handed in: the cover's label and part 1 are
 * read from that one value, so the document cannot say "inspection-ready"
 * under a verdict line that says "not determined". The retired screen's own
 * note on this: "one verdict variable for the whole surface, so the lens, the
 * cover badge and the headline cannot disagree about whether this file reads
 * clean".
 *
 * The document on screen is the read the section made. The download is built
 * by the server when it is asked for (a recorded download, refused when its
 * record cannot be written), in the scope on screen. It is offered in two
 * places, as the retired screen offered it: under the verdict, where the
 * section has had it since it was built, and in this document's bar. It is
 * one download with one state, and its outcome is said beside the button that
 * asked for it.
 */
import React, { useState } from 'react';
import { tmfArtifactName } from '@shared/constants/domain/tmf-reference-model';
import type { TmfCompletenessResult } from '../../../../../server/services/etmf/tmf-completeness';
import { I } from '../icons';
import {
  NOT_ASSESSED, PACKAGE_FAILED, READINESS_LABEL, SCOPE_LABEL, basisSentence, downloadInspectionPackage, readinessParagraph, scopeNoun,
  studyName, tmfFigures, unverifiedWords, type TmfNote, type TmfScope, type TmfStudy, type TmfVerdict,
} from './vaultTmf';

const REFERENCE_MODEL = 'DIA TMF Reference Model (ICH E6(R3) Appendix C)';
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/** The three figures, as words with their numbers: zones complete, records filed, records open. Nothing where the answer states none. */
export function TmfFiguresLine({ result, testId }: { result: TmfCompletenessResult; testId: string }) {
  const f = tmfFigures(result);
  if (!f) return null;
  // The spaces are for a reader of the text (a screen reader, a copy); the row's own gap spaces it on screen.
  const dot = <>{' '}<span className="vd-dr-arrow" aria-hidden="true">·</span>{' '}</>;
  return (
    <div className="vd-dr-stages" data-testid={testId}>
      <span className="vd-dr-stage">Zones complete <b>{f.zonesComplete}</b> of <b>{f.zoneCount}</b></span>
      {dot}
      <span className="vd-dr-stage">{capital(scopeNoun(result.scope))} filed <b>{f.filed}</b> of <b>{f.required}</b></span>
      {dot}
      <span className="vd-dr-stage">Open records <b>{f.open}</b>{f.open > 0 ? `, ${unverifiedWords(f.unverified)}` : ''}</span>
    </div>
  );
}

const zoneStatus = (required: number, open: number) => (required === 0 ? 'No record required' : open === 0 ? 'Complete' : `${open} open`);
const OPEN_STATE: Record<string, string> = {
  no_document: 'Filed with no document',
  unresolved: 'Filed against a Vault document that no longer exists',
  unverifiable: 'Filed against a reference outside the Vault',
};

/** The package's pages: cover, figures, then its four parts. */
function PackageDocument({ study, verdict, result, readOn }: { study: TmfStudy; verdict: TmfVerdict; result: TmfCompletenessResult; readOn: string }) {
  const open = result.zones.flatMap((z) => {
    const filedAs = new Map(z.unverified.map((u) => [u.code, u.evidence]));
    return z.missing.map((code) => ({ code, zone: z.number, state: OPEN_STATE[filedAs.get(code) ?? ''] ?? 'Not filed' }));
  });
  return (
    <>
      <p data-testid="vault-tmf-package-verdict" data-verdict={verdict}><strong>{READINESS_LABEL[verdict]}</strong></p>
      <h3>Trial master file inspection package</h3>
      <p data-testid="vault-tmf-package-cover">
        {studyName(study)} ({study.studyId}) · {REFERENCE_MODEL} · Scope: {SCOPE_LABEL[result.scope].toLowerCase()} · As read on {readOn}
      </p>
      <TmfFiguresLine result={result} testId="vault-tmf-package-figures" />

      <h4>1 Readiness verdict</h4>
      <p data-testid="vault-tmf-package-readiness">{readinessParagraph(verdict, result)}</p>

      <h4>2 Zone index</h4>
      {result.zones.length === 0 ? <p data-testid="vault-tmf-package-zones">The read listed no zone.</p> : (
        <table data-testid="vault-tmf-package-zones">
          <thead><tr><th scope="col">Zone</th><th scope="col">Name</th><th scope="col">Filed</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {result.zones.map((z) => (
              <tr key={z.number}>
                <td className="mono">{z.number}</td><td>{z.name}</td>
                <td className="mono">{z.present.length} of {z.required.length}</td><td>{zoneStatus(z.required.length, z.missing.length)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h4>3 Open records</h4>
      {open.length === 0 ? (
        <p data-testid="vault-tmf-package-open">
          {verdict === 'complete' ? `None. Every ${scopeNoun(result.scope, 1)} is filed.` : 'The read listed no open record by name.'}
        </p>
      ) : (
        <table data-testid="vault-tmf-package-open">
          <thead><tr><th scope="col">Zone</th><th scope="col">Record</th><th scope="col">Artifact code</th><th scope="col">State</th></tr></thead>
          <tbody>
            {open.map((r) => (
              <tr key={r.code}><td className="mono">{r.zone}</td><td>{tmfArtifactName(r.code)}</td><td className="mono">{r.code}</td><td>{r.state}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <h4>4 What this package is</h4>
      <p data-testid="vault-tmf-package-what">
        The index and the readiness picture of this study’s trial master file: a manifest, the completeness assessment, and an index of every filing
        with its zone, its record code, when it was filed, the document it refers to and what that reference was found to be. It is not the documents.
        They stay in the Vault, or in the system a filing refers to, and the package does not contain them. {basisSentence(result.basis)} {NOT_ASSESSED}{' '}
        The download is built when it is asked for, so it states the trial master file as it is then. It is a recorded download, with the SHA-256 of the file sent.
      </p>
    </>
  );
}

/** Where the download was asked for: under the verdict, or in the package document's bar. */
type PackagePlace = 'verdict' | 'document';

/** The package download for a study and a scope: one state for both of its buttons, and where its outcome is said. */
export function usePackageDownload(studyId: string, scope: TmfScope) {
  const [downloading, setDownloading] = useState(false);
  const [said, setSaid] = useState<{ note: TmfNote; at: PackagePlace } | null>(null);
  const download = async (at: PackagePlace) => {
    setDownloading(true);
    setSaid(null);
    let note: TmfNote;
    try {
      note = await downloadInspectionPackage(studyId, scope);
    } catch (e) {
      note = { tone: 'error', text: `${PACKAGE_FAILED} ${e instanceof Error && e.message ? e.message : 'The file could not be read.'}`, retry: true };
    }
    setSaid({ note, at });
    setDownloading(false);
  };
  return { downloading, said, download };
}
export type PackageDownload = ReturnType<typeof usePackageDownload>;

/** The download's button, in one of its two places. */
export function PackageDownloadButton({ pkg, at, testId }: { pkg: PackageDownload; at: PackagePlace; testId: string }) {
  return (
    <button type="button" className="btn ghost small" disabled={pkg.downloading} onClick={() => void pkg.download(at)} data-testid={testId}>
      {I.download} {pkg.downloading ? 'Building the package…' : 'Download the inspection package'}
    </button>
  );
}

/**
 * The download's outcome, said beside the button that asked for it: saved with
 * its SHA-256, or not, with the reason. Another try is offered where one can
 * change the outcome, never after a refusal.
 */
export function PackageDownloadNote({ pkg, at, testId }: { pkg: PackageDownload; at: PackagePlace; testId: string }) {
  if (!pkg.said || pkg.said.at !== at) return null;
  const { note } = pkg.said;
  return (
    <div className={note.tone === 'error' ? 'vd-dr-err' : 'vd-d-idx'} role={note.tone === 'error' ? 'alert' : 'status'} data-testid={testId}>
      {note.text}{' '}
      {note.retry ? <button type="button" className="btn ghost small" disabled={pkg.downloading} onClick={() => void pkg.download(at)}>Try again</button> : null}
    </div>
  );
}

interface PackageProps {
  study: TmfStudy; scope: TmfScope; result: TmfCompletenessResult;
  /** The section's one verdict, computed by the caller: this document states it and no other. */
  verdict: TmfVerdict;
  /** A read is in flight after a write: the document is not shown as current until it lands. */
  rereading: boolean;
  /** The section's one download, also offered under the verdict. */
  pkg: PackageDownload;
}

export function VaultTmfPackage({ study, scope, verdict, result, rereading, pkg }: PackageProps) {
  // The day this answer arrived: each read is a new answer, and the date does not move while it stays on screen.
  const [read, setRead] = useState(() => ({ result, on: today() }));
  if (read.result !== result) setRead({ result, on: today() });
  return (
    <div className="cm-doc vd-tmf-pkg" role="group" aria-label={`Inspection package, ${SCOPE_LABEL[scope].toLowerCase()}`} data-testid="vault-tmf-package">
      <div className="cm-doc-bar">
        <span className="cm-doc-kind">Inspection package · {SCOPE_LABEL[scope].toLowerCase()}</span>
        <div className="cm-doc-bar-r"><PackageDownloadButton pkg={pkg} at="document" testId="vault-tmf-download" /></div>
      </div>
      <div className="cm-doc-body">
        <PackageDownloadNote pkg={pkg} at="document" testId="vault-tmf-package-note" />
        <div className="cm-doc-render">
          {rereading ? <p role="status">Reading the trial master file again…</p> : <PackageDocument study={study} verdict={verdict} result={result} readOn={read.on} />}
        </div>
      </div>
    </div>
  );
}

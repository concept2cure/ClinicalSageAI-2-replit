/**
 * A run's Part 11 evidence: the seal read back and re-verified, and the data
 * the report rested on.
 *
 * ── WHY THIS SCREEN ─────────────────────────────────────────────────────────
 * The 2026-10-01 reporting review made sealing re-verifiable, as three
 * adversarial rounds recorded under
 * `docs/evidence/reviews/2026-10-01-reporting/fixes/seal-reverification/`:
 * `GET /runs/:id/seal` reads the finalization back off the audit chain and
 * checks four things against it — the chain row's position and HMAC, the
 * stored seal field by field, that the stored document still hashes to the
 * recorded seal with the same provenance atoms, and that the electronic
 * signature signed that seal. `GET /runs/:id/dependencies` records what each
 * provider contributed to the run and whether it blocked.
 *
 * Both routes fall inside the `/api/report-os/runs` prefix the surface already
 * claims, so both were callable the whole time — and nothing called either.
 * The canvas showed a signature line only for a finalize performed in that
 * same session, which is the one case where the reader already knows the
 * answer; re-opening a sealed report from the history showed nothing at all.
 * This is what an inspector actually asks for: not "is it signed" but "prove
 * the signature still matches the record, and show me where the numbers came
 * from".
 *
 * ── WHAT IT WILL NOT CLAIM ──────────────────────────────────────────────────
 * `not-verifiable` is rendered as its own state with its own words, never as a
 * quieter shade of verified and never as a failure. It means there is no
 * verified chain record to check against, so nothing is claimed either way —
 * rendering absence of evidence as evidence is how a broken chain stayed
 * invisible (SECURITY-8 in that review).
 *
 * @module client/src/concept2cure/v2/surfaces/InsightsRunEvidence
 */
import React, { useState } from 'react';

import { ErrorState, useLiveData } from '../dataConnect';
import { I } from '../icons';
import {
  DEPENDENCY_STATUS_LABEL,
  SEAL_CHECK_LABEL,
  SEAL_VERDICT,
  sealFactRows,
  signatureAbsent,
  signatureIsVerifiedAgainstSeal,
  whenText,
  type RunDependencyRow,
  type RunSealView,
} from './insightsLibraryModel';
import { isRowList, rowsOf } from './insightsLibraryShared';

/** The seal's four checks, each with the server's own written reason. */
function SealChecks({ view }: { view: RunSealView }) {
  const checks = view.verification?.checks ?? [];
  if (checks.length === 0) return null;
  return (
    <ul className="rl-ev-checks">
      {checks.map((c) => (
        <li key={c.check} className="rl-ev-check" data-ok={c.ok ? 'true' : 'false'}>
          <span className="rl-ev-check-h">
            {c.ok ? I.checkCircle : I.alertTriangle} {SEAL_CHECK_LABEL[c.check] ?? c.check}
          </span>
          {/* The server's sentence verbatim: it is more precise than any
              paraphrase, and it is what the evidence record should quote. */}
          <span className="rl-ev-check-d">{c.detail}</span>
        </li>
      ))}
    </ul>
  );
}

/** The signature manifestation (21 CFR 11.50) as it was recorded. */
function SignatureBlock({ view }: { view: RunSealView }) {
  const rows = sealFactRows(view);
  const absent = signatureAbsent(view);
  const verified = signatureIsVerifiedAgainstSeal(view);
  if (rows.length === 0 && !absent) return null;
  return (
    <>
      {/* No row at all is a different statement from a row with gaps, and the
          server knows which: it returns `signature: null` only after looking
          for a live row on a final run. */}
      {absent && (
        <p className="rl-sub" data-testid="rl-seal-no-signature">
          No electronic signature is recorded for this finalization.
        </p>
      )}
      {rows.length > 0 && (
        <dl className="rl-ev-dl">
          {rows.map((r) => (
            <React.Fragment key={r.term}>
              <dt>{r.term}</dt>
              <dd className={r.mono ? 'rl-ev-hash' : undefined}>{r.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
      {/* Only one thing is bound: that the signature manifest names the hash
          the chain recorded. The signer, time and meaning are separate columns
          that no check ties to the chain row, so an unverified seal must not
          let them read as a verified binding. */}
      {!absent && !verified && rows.length > 0 && (
        <p className="rl-sub" data-testid="rl-seal-sig-unverified">
          Shown as recorded. These values have not been verified against this seal.
        </p>
      )}
    </>
  );
}

/** The seal half: the verdict, what it means, the checks and the signature. */
function SealSection({ runId }: { runId: number }) {
  const [attempt, setAttempt] = useState(0);
  const url = `/api/report-os/runs/${runId}/seal`;
  const seal = useLiveData<RunSealView>(url, [url, attempt]);
  const view = seal.data;

  if (seal.loading) {
    return <p className="rl-sub">Reading the sealing record…</p>;
  }
  if (seal.error || !view) {
    return (
      <ErrorState
        title="Couldn't read the sealing record"
        message="The seal and its audit-chain record could not be read, so nothing is claimed about them."
        retry={() => setAttempt((n) => n + 1)}
        testId="rl-seal-error"
      />
    );
  }
  /* ORDER MATTERS, and the first draft of this panel got it wrong.
     `viewOf` sets `sealed` from the run's CURRENT status, so a run the audit
     chain records as finalized whose `report_runs.status` was later rewritten
     comes back `sealed: false` — with `verdict: 'mismatch'` and the check "The
     audit chain records this run as finalized, but the run is now marked X"
     (run-seal.ts readRunSeal). Testing `!sealed` first threw that away and
     said the run carries no seal, which is the opposite of what the server
     found: the chain holds a finalization and a signature row exists. That is
     the one case this panel exists to surface. So a verdict that is not
     `not-verifiable` is rendered before the unsealed branch is considered. */
  const verdictNow = view.verification?.verdict ?? 'not-verifiable';
  const chainSaysFinalized = !view.sealed && verdictNow === 'mismatch';

  if (!view.sealed && !chainSaysFinalized) {
    return (
      <p className="rl-sub" data-testid="rl-seal-unsealed">
        This run is not final, so it carries no seal and no electronic signature. Only a finalized run is
        sealed evidence.
      </p>
    );
  }

  const verdict = verdictNow;
  const words = SEAL_VERDICT[verdict] ?? SEAL_VERDICT['not-verifiable'];
  return (
    <div data-testid="rl-seal" data-verdict={verdict}>
      <div className="rl-ev-verdict" data-verdict={verdict}>
        {verdict === 'intact' ? I.shieldCheck : I.shieldAlert} {words.label}
      </div>
      <p className="rl-sub">{words.meaning}</p>
      {/* The specific contradiction, named: the chain holds a finalization for
          a run that no longer says it is final. Stating only the generic
          mismatch sentence would leave the reader to guess which record moved. */}
      {chainSaysFinalized && (
        <p className="rl-sub" data-testid="rl-seal-status-contradicts">
          The audit chain records this run as finalized, but the run itself is no longer marked final. The
          finalization record and the run disagree, and this panel does not choose between them.
        </p>
      )}
      <SealChecks view={view} />
      <SignatureBlock view={view} />
    </div>
  );
}

/** What the run read, and what it could not. */
function DependencySection({ runId }: { runId: number }) {
  const [attempt, setAttempt] = useState(0);
  const url = `/api/report-os/runs/${runId}/dependencies`;
  const deps = useLiveData<unknown>(url, [url, attempt], isRowList);
  const rows = rowsOf<RunDependencyRow>(deps.data);

  if (deps.loading) return <p className="rl-sub">Reading the run's sources…</p>;
  if (deps.error) {
    return (
      <ErrorState
        title="Couldn't read the run's sources"
        message="The providers this run recorded could not be read. Nothing is shown in their place."
        retry={() => setAttempt((n) => n + 1)}
        testId="rl-deps-error"
      />
    );
  }
  if (rows.length === 0) {
    return (
      <p className="rl-sub" data-testid="rl-deps-empty">
        This run recorded no provider observations, so there is nothing to show here. That is not the same as
        the run having read nothing — it is the absence of a record of what it read.
      </p>
    );
  }
  return (
    <table className="ro-table rl-table" data-testid="rl-deps">
      <caption className="rl-cap">
        {rows.length} provider observation{rows.length === 1 ? '' : 's'}, newest first
      </caption>
      <thead>
        <tr>
          <th scope="col">Source</th>
          <th scope="col">Outcome</th>
          <th scope="col">Observed</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d.id}>
            <td>{d.provider}</td>
            <td>
              {/* `ready` is the providers' healthy state; anything else is not a
                  pass, and an unknown value stays neutral rather than green. */}
              <span className="rl-tag" data-status={d.status === 'ready' ? 'final' : d.status === 'missing' ? 'failed' : 'draft'}>
                {DEPENDENCY_STATUS_LABEL[d.status] ?? d.status}
              </span>
              {/* The engine's own blocker sentence, never paraphrased. */}
              {d.blocker ? <div className="rl-cell-sub">{d.blocker}</div> : null}
            </td>
            <td>{whenText(d.observedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The evidence record for the run on screen, as a disclosure.
 *
 * A disclosure and not a hover: the canvas's accessibility suite already fixed
 * that for a report's sources, and the same reasoning applies here — an
 * inspector reads this, and a hover cannot be read by a keyboard, printed, or
 * quoted. Closed by default so it never displaces the report itself, and the
 * routes are only read once it is opened.
 */
export function RunEvidence({ runId }: { runId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="rl-ev"
      data-testid="rl-run-evidence"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="rl-ev-sum">
        {I.shieldCheck} Seal, signature and sources
      </summary>
      {/* Mounted only once opened, so the two reads are not made for every
          report a reader merely glances at. */}
      {open ? (
        <div className="rl-ev-body">
          <section aria-label="Seal and signature">
            <div className="ro-rep-eyebrow">Seal and signature</div>
            <SealSection runId={runId} />
          </section>
          <section aria-label="What this report read">
            <div className="ro-rep-eyebrow">What this report read</div>
            <DependencySection runId={runId} />
          </section>
        </div>
      ) : null}
    </details>
  );
}

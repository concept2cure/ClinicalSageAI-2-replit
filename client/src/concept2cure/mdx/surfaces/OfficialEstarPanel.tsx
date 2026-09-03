/**
 * OfficialEstarPanel — the ONE place the official FDA eSTAR PDF is produced
 * from, and the surface that says exactly what will be written into it.
 *
 * Three reads, one governed action:
 *   useEstarReadiness        can the descriptor be produced at all (template
 *                            vendored, field map populated)? Drives the
 *                            produce-gate: locked with the reason, never dead.
 *   useEstarOfficialFields   the "what will be written" preview — one row per
 *                            mapped field with the governed value and its
 *                            source in plain words. Unsourced keys get an input
 *                            the user may fill for this export only.
 *   useEstarExport           POST /official with useProgramData:true and only
 *                            the values actually typed. The response's
 *                            fieldReport is rendered as filled/blank counts,
 *                            the blank captions and any typed keys the server
 *                            dropped.
 *
 * Honest by construction: a failed field read renders ErrorState with the
 * reason in plain words, never an empty table — and offers retry only when a
 * retry could succeed (a 404 or 422 is not transient); a value the platform
 * does not hold is shown as blank and reported after the run, never guessed;
 * nothing typed here is stored. Entitlement lock mirrors K510Surface — a 403
 * NOT_ENTITLED shows the Locked pill and the real minimum tier in the
 * control's title.
 *
 * Two useFetchJson facts shape the render: it keeps the PREVIOUS payload in
 * `data` across a url change (only `loading` flips), and it starts loading:false
 * until its effect runs. So an in-flight field read is treated as "no field
 * list" — never another program's rows under this program's header — and a
 * readiness read with neither an answer nor an error is "checking", never
 * "not producible".
 */

import * as React from 'react';
import { EmptyState, ErrorState } from '../../v2/dataConnect';
import { I } from '../icons';
import type { Program } from '../data/programs';
import { useEstarReadiness } from '../hooks/useK510';
import {
  sourceWords,
  useEstarOfficialFields,
  type OfficialEstarType,
  type OfficialEstarVariant,
  type OfficialFieldView,
} from '../hooks/useEstarOfficialFields';
import { exportStatusLine, useEstarExport } from '../hooks/useEstarExport';

export interface OfficialEstarPanelProps {
  program: Program | null;
  variant: OfficialEstarVariant;
  type?: OfficialEstarType;
}

const fieldInputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  padding: '5px 8px',
  background: 'var(--bg-050)',
  border: '1px solid var(--border-100)',
  borderRadius: 6,
  color: 'var(--text-200)',
};

/**
 * The reason the Generate control is disabled, or null when it may fire. Pure
 * so the precedence (lock → no program → readiness checking → busy → not ready
 * → field list failed) is pinned by a test. The last step exists because a
 * readiness 200 next to a failed field read would otherwise leave Generate
 * live while the user has not seen what will be written.
 */
export function generateDisabledReason(input: {
  lockedTitle: string | null;
  hasProgram: boolean;
  readinessLoading: boolean;
  readinessError: string | null;
  ready: boolean;
  blockers: string[];
  busy: boolean;
  fieldsError: string | null;
}): string | null {
  if (input.lockedTitle) return input.lockedTitle;
  if (!input.hasProgram) return 'Open a program first — the administrative data is read from it';
  if (input.readinessLoading) return 'Checking official eSTAR availability…';
  if (input.busy) return 'Exporting…';
  if (!input.ready) {
    const why = input.blockers.length
      ? input.blockers.join(' · ')
      : input.readinessError
        ? 'availability could not be checked'
        : 'the official template or its field map is not available';
    return `Official eSTAR not yet producible — ${why}`;
  }
  if (input.fieldsError) return 'The field list could not be loaded — load it before generating';
  return null;
}

function captionOf(fields: OfficialFieldView[] | undefined, key: string): string {
  return fields?.find((f) => f.key === key)?.caption ?? key;
}

export function OfficialEstarPanel({ program, variant, type = '510k' }: OfficialEstarPanelProps) {
  const ident = program?.id ?? null;
  const readiness = useEstarReadiness(type, variant);
  const official = useEstarOfficialFields(ident, type, variant);
  const estarExport = useEstarExport();

  /* Values typed for THIS export only. Re-seeded empty on a program or variant
     switch so nothing typed under one device travels to the next — and the last
     export outcome is forgotten with them, so a previous program's
     "Downloaded … filled/blank" line and blank-caption list never sit under
     this program's header (the same rule the field list follows below). */
  const [typed, setTyped] = React.useState<Record<string, string>>({});
  const resetExport = estarExport.reset;
  React.useEffect(() => {
    setTyped({});
    resetExport();
  }, [ident, variant, resetExport]);

  const ready = readiness.readiness?.ready === true;
  const blockers = readiness.readiness?.blockers ?? [];
  /* useFetchJson reports loading:false until its effect runs, so the first
     painted frame has neither an answer nor an error. That is "not checked
     yet" — asserting "not producible" there would be a claim nothing made. */
  const readinessChecking =
    readiness.loading || (readiness.readiness === null && readiness.error === null);

  /* An in-flight field read is neither a list nor an error: useFetchJson keeps
     the previous program's payload in `data` while the next one loads, and a
     refresh after a failure keeps the old error until the retry settles. */
  const fields = official.loading ? null : official.fields;
  const fieldsError = official.loading ? null : official.error;

  /* Locked-never-dead (entitlements contract §4) — the same shape K510Surface
     uses for the draft package: only the entitlement gate's exact 403 sets
     blockedByEntitlement, so a role 403 never reads as a plan limitation. */
  const entitlementLocked = estarExport.outcome?.blockedByEntitlement === true;
  const lockedTitle = entitlementLocked
    ? estarExport.outcome?.requiredTier
      ? `Locked — requires the ${estarExport.outcome.requiredTier} plan (device assembly readiness)`
      : 'Locked — requires a higher plan (device assembly readiness)'
    : null;

  const disabledReason = generateDisabledReason({
    lockedTitle,
    hasProgram: !!program,
    readinessLoading: readinessChecking,
    readinessError: readiness.error,
    ready,
    blockers,
    busy: estarExport.busy,
    fieldsError,
  });

  const headerLine = !program
    ? 'The administrative data is read from the open program'
    : official.loading
      ? 'Loading the field list…'
      : fieldsError
        ? 'The field list could not be loaded'
        : fields
          ? `${fields.sourcedCount} of ${fields.mappedCount} fields have a governed source`
          : 'No field list yet';

  const exportStatus = exportStatusLine(estarExport.busy, estarExport.outcome);
  const report = estarExport.outcome?.ok ? estarExport.outcome.fieldReport : null;

  function onGenerate() {
    if (!program || disabledReason) return;
    void estarExport.exportOfficialEstar(
      { id: program.id, code: program.code, title: program.title },
      variant,
      { useProgramData: true, data: typed },
    );
  }

  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">Official eSTAR · administrative data</div>
          <div className="section-sub">{headerLine}</div>
        </div>
        <button
          className="section-more"
          disabled={disabledReason !== null}
          title={
            disabledReason ??
            'Produce the official FDA eSTAR PDF from the program’s governed records and the values entered below'
          }
          onClick={onGenerate}
        >
          Generate official eSTAR (PDF) {I.download}
        </button>
      </div>

      {readinessChecking && program ? (
        <div className="section-sub" role="status" style={{ marginTop: 4 }}>
          Checking official eSTAR availability…
        </div>
      ) : null}

      {!readinessChecking && !ready && program ? (
        <div className="section-sub" role="status" style={{ marginTop: 4 }}>
          <span className="status-pill review">Not yet producible</span>{' '}
          {blockers.length
            ? blockers.join(' · ')
            : readiness.error
              ? 'Official eSTAR availability could not be checked'
              : 'The official template or its field map is not available'}
        </div>
      ) : null}

      {exportStatus ? (
        <div className="section-sub" role="status" style={{ marginTop: 4 }}>
          {entitlementLocked ? (
            <span className="status-pill review" style={{ marginRight: 6 }}>
              Locked
            </span>
          ) : null}
          {exportStatus}
        </div>
      ) : null}

      {report ? (
        <div className="section-sub" role="status" style={{ marginTop: 4 }}>
          {report.blankKeys.length ? (
            <div>
              Left blank — the platform holds no value:{' '}
              {report.blankKeys.map((k) => captionOf(fields?.fields, k)).join(' · ')}
            </div>
          ) : null}
          {report.ignoredRequestKeys.length ? (
            <div>
              Entered values not written — a governed value took precedence or the field is not
              on the template: {report.ignoredRequestKeys.map((k) => captionOf(fields?.fields, k)).join(' · ')}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="panel" style={{ marginTop: 8 }}>
        <div className="panel-hdr">
          <div>
            <div className="t">Fields the template carries</div>
            <div className="s">
              Governed values are read-only and written as held. A value entered here is written
              to this export only and is not stored.
            </div>
          </div>
        </div>

        {!program ? (
          <EmptyState
            icon={I.circle}
            title="No program open"
            hint="The field list is held per program."
            regulation="Serves the FDA eSTAR administrative record (21 CFR 807)"
            testId="official-estar-idle"
          />
        ) : fieldsError ? (
          <ErrorState
            variant="panel"
            title="Could not load the field list"
            message={fieldsError}
            /* A 404 or 422 is not transient — offering "Try again" there is a
               promise the retry cannot keep. Only a failed read gets one. */
            retry={official.errorKind === 'failed' ? official.refresh : undefined}
            testId="official-estar-error"
          />
        ) : !fields ? (
          <EmptyState
            icon={I.database}
            busy
            title="Loading the field list"
            testId="official-estar-loading"
          />
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Field</th>
                <th>Value</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {fields.fields.map((f) => {
                const sourced = f.source !== null && f.value !== null;
                const inputId = `official-estar-${variant}-${f.key}`;
                return (
                  <tr key={f.key} data-sourced={sourced ? 'true' : 'false'}>
                    <td>
                      {sourced ? (
                        <span>{f.caption}</span>
                      ) : (
                        <label htmlFor={inputId}>{f.caption}</label>
                      )}
                    </td>
                    <td>
                      {sourced ? (
                        <span data-testid={`official-estar-value-${f.key}`}>{f.value}</span>
                      ) : (
                        <input
                          id={inputId}
                          style={fieldInputStyle}
                          value={typed[f.key] ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTyped((t) => ({ ...t, [f.key]: v }));
                          }}
                          aria-describedby={`${inputId}-note`}
                        />
                      )}
                    </td>
                    <td style={{ color: 'var(--text-300)', fontSize: 11 }}>
                      {sourced ? (
                        sourceWords(f.source)
                      ) : (
                        <span id={`${inputId}-note`}>Entered for this export only · not stored</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

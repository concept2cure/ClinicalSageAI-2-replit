/**
 * Protocol development — the Compliance tab.
 *
 * `docs/design/PROTOCOL_INTELLIGENCE.md`, direction three. `evaluateCompleteness()`
 * is five structural checks and is the entire deterministic compliance of protocol
 * development; a protocol can pass all five and be non-compliant with every standard
 * its own section templates cite. `protocol-rule-pack.ts` supplies that depth — one
 * finding per rule, each citing its clause — and this pane renders it.
 *
 * ── What this pane is ────────────────────────────────────────────────────────
 * Pure presentation of `doc.ruleFindings`, which arrives on the read the surface
 * already makes (GET /api/protocol-dev). It fetches nothing, computes nothing and
 * scores nothing. Every status, message and remediation below is the engine's own.
 *
 * ── THE HEADLINE IS THREE NUMBERS, NOT A PERCENTAGE ─────────────────────────
 * assessed / unmet / not assessed, side by side, never divided into one another.
 * A rule the protocol does not record enough to decide is `not-assessed`, and a
 * percentage computed over checks that did not run is the defect this codebase has
 * already been burned by — see the `requiredTotal === 0 ? 100` branch in
 * protocol-development-logic.ts, which reports a blank protocol as 100% complete.
 * There is no percentage anywhere on this pane and `protocolDevCompliance.test.tsx`
 * asserts the absence of the character itself.
 *
 * `not-assessed` is drawn in the neutral tone, never the success one, and reads in
 * words as "not assessed". Colour is never the only signal: every status is a word
 * before it is a colour.
 */
import React, { useMemo, useState } from 'react';
import * as PG from './ProtocolGov';
import { PaneHead, KV } from './ProtocolDevShared';

export type PdevRuleStatus = 'met' | 'unmet' | 'attention' | 'not-assessed';

export interface PdevRuleFindingView {
  ruleId: string;
  standard: string;
  clause: string;
  title: string;
  status: PdevRuleStatus;
  sev: string;
  message: string;
  remediation: string;
}

export interface PdevRuleFindingsView {
  findings: PdevRuleFindingView[];
  assessed: number;
  unmet: number;
  notAssessed: number;
}

/** The status as a WORD. `labelize` would render "Not-Assessed"; a reviewer
 *  reads "not assessed", and nothing here ever reads as a tick. */
const STATUS_WORD: Record<string, string> = {
  met: 'met',
  unmet: 'unmet',
  attention: 'attention',
  'not-assessed': 'not assessed',
};

/** Neutral for not-assessed — an unassessed rule is not a passed one. */
const STATUS_TONE: Record<string, string> = {
  met: 'ok',
  unmet: 'err',
  attention: 'warn',
  'not-assessed': 'idle',
};

const word = (s: string): string => STATUS_WORD[s] ?? s;

interface StandardGroupModel {
  standard: string;
  findings: PdevRuleFindingView[];
  unmet: number;
}

/**
 * Group by standard, standards carrying an unmet finding first.
 *
 * A stable partition rather than a sort over a computed score: within each
 * partition the engine's own order is preserved, so two runs of the same
 * evaluation render identically.
 */
export function groupByStandard(findings: PdevRuleFindingView[]): StandardGroupModel[] {
  const byStandard = new Map<string, PdevRuleFindingView[]>();
  for (const f of findings) {
    const key = f.standard || 'Standard not stated by the engine';
    const list = byStandard.get(key);
    if (list) list.push(f);
    else byStandard.set(key, [f]);
  }
  const groups: StandardGroupModel[] = [];
  for (const [standard, list] of byStandard) {
    groups.push({ standard, findings: list, unmet: list.filter((f) => f.status === 'unmet').length });
  }
  return [...groups.filter((g) => g.unmet > 0), ...groups.filter((g) => g.unmet === 0)];
}

/** How many of each status, for the group header — counted, never divided. */
function tally(findings: PdevRuleFindingView[]): string {
  const n = (s: PdevRuleStatus) => findings.filter((f) => f.status === s).length;
  return [
    `${n('unmet')} unmet`,
    `${n('attention')} attention`,
    `${n('met')} met`,
    `${n('not-assessed')} not assessed`,
  ].join(', ');
}

function FindingCard({ f }: { f: PdevRuleFindingView }) {
  return (
    <div
      className="pj-card"
      style={{ padding: 10, marginTop: 8 }}
      data-status={f.status}
      role="group"
      aria-label={[f.clause, f.title].filter(Boolean).join(' ')}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span className="pg-mono" style={{ fontSize: 11 }}>{f.clause || 'clause not stated'}</span>
        <b style={{ fontSize: 12 }}>{f.title}</b>
        <PG.StatusBadge label={word(f.status)} tone={STATUS_TONE[f.status] ?? 'idle'} />
      </div>
      {f.message && <div style={{ fontSize: 12, marginTop: 4 }}>{f.message}</div>}
      {f.remediation && (
        <div className="pde-basis" style={{ marginTop: 4 }}>{'What to do: ' + f.remediation}</div>
      )}
    </div>
  );
}

function StandardGroup({ g }: { g: StandardGroupModel }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="pj-card" style={{ padding: 12, marginTop: 10 }} data-standard={g.standard}>
      <button
        type="button"
        className="pde-rowbtn"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {`${g.standard} — ${g.findings.length} rule(s): ${tally(g.findings)}`}
      </button>
      {open && g.findings.map((f) => <FindingCard key={f.ruleId + f.clause} f={f} />)}
    </section>
  );
}

function Headline({ rf }: { rf: PdevRuleFindingsView }) {
  return (
    <div className="pj-card" style={{ padding: 12 }}>
      <div className="pj-card-h">
        <span className="t">Rules run against this protocol</span>
        <span className="s">Three counts, never one figure.</span>
      </div>
      <KV k="Rules assessed" v={String(rf.assessed)} />
      <KV k="Rules unmet" v={String(rf.unmet)} />
      <KV k="Rules not assessed" v={String(rf.notAssessed)} />
      <div className="pde-note">
        A rule the protocol does not record enough to decide is reported as not assessed and is
        never folded into the assessed count. These three are not divided into one another: a
        figure over rules that did not run would describe a protocol nobody checked as a clean one.
      </div>
    </div>
  );
}

/** `doc.ruleFindings`, or null when the record does not carry one. */
function readFindings(doc: Record<string, unknown>): PdevRuleFindingsView | null {
  const rf = doc.ruleFindings as PdevRuleFindingsView | undefined | null;
  if (!rf || typeof rf !== 'object' || !Array.isArray(rf.findings)) return null;
  return rf;
}

export interface ComplianceTabProps {
  doc: Record<string, unknown>;
}

export function ComplianceTab({ doc }: ComplianceTabProps) {
  const rf = readFindings(doc);
  const groups = useMemo(() => groupByStandard(rf?.findings ?? []), [rf]);

  return (
    <div className="pd-pane" role="region" aria-label="Compliance">
      <PaneHead
        title="Compliance"
        sub="The deterministic rule pack's findings on THIS DOCUMENT — ICH M11, E8(R1), E9/E9(R1), E6(R3), 21 CFR 312.23(a)(6), 50.25 and 56.111, 45 CFR 46 Subparts B/C/D, EU CTR 536/2014 Annex I and FDORA §3601. One finding per rule, each citing its clause. Nothing on this screen decides a status or computes a figure."
      />
      {!rf && (
        <div className="pde-note">
          This protocol record carries no rule evaluation, so nothing here has been checked. That is
          not a clean protocol — it is an unchecked one. Re-read the record, or ask why the rule pack
          did not run.
        </div>
      )}
      {rf && (
        <>
          <Headline rf={rf} />
          {groups.length === 0 && (
            <div className="pde-note">
              The rule pack returned no finding for this protocol kind, so no rule in the pack applies
              to it. Nothing has been judged compliant; nothing has been judged non-compliant.
            </div>
          )}
          {groups.map((g) => <StandardGroup key={g.standard} g={g} />)}
        </>
      )}
    </div>
  );
}

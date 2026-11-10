/**
 * The quality-record register kit: the config a register is built from, and the
 * small helpers its configurations share (QmsRecords.tsx renders them).
 *
 * @module client/src/concept2cure/quality/qmsRegisterKit
 */
import * as React from 'react';
import { type C2CFormConfig } from '../v2/C2CForm';
import type { RegisterContext } from './registerContext';
import type { EsigMeaning } from '../hooks/useEsignature';
import type { EsigSignedManifest } from '../_shared/components/EsignModal';

export type Tone = 'ok' | 'warn' | 'err';
export type PillTone = 'draft' | 'review' | 'effective' | 'muted' | 'err' | 'warn';

/** One row as AnA is told it (QualityApp's published surface context). */
export type RecordFacts = Record<string, string | number | null>;

/** What a register tells the Quality shell for AnA: its state, its counts and its rows, as read. */
export interface RecordRegisterContext {
  tab: string;
  title: string;
  noun: [string, string];
  state: 'loading' | 'failed' | 'ready';
  /** The rows read, or null while loading or after a failed read. */
  count: number | null;
  counts: Array<{ label: string; val: string; detail?: string }>;
  /** True when the read stopped at the server's cap: the register shows the most recent rows, and there may be more. */
  partial: boolean;
  /** What the register is, in a sentence (the configuration's `sub`). */
  about: string;
  records: RecordFacts[];
  /** True when more rows were read than are passed on. */
  truncated: boolean;
}

/** A cell, form or fact may read what the register read beside its rows (registerContext.ts). `text` marks a column of
 *  prose: it wraps at a readable width, while the facts beside it (numbers, dates, states) stay on one line (C11). */
export interface Column<R> { label: string; cell: (r: R, ctx: RegisterContext) => React.ReactNode; text?: true }
/** A register figure: its label and value, and `detail`, a fact beside it that the value does not already say (C12).
 *  The line shows it in brackets and AnA is told it: "Open: 3 (5 closed, 1 cancelled)". Until 2026-11-10 each figure
 *  carried a tile caption ("None", "On record") and the line dropped all of them, the facts among them. */
export interface KpiSpec { label: string; val: string; detail?: string; tone?: Tone }

/**
 * A decision the form collected, to be signed in the shared EsignModal. Nothing
 * is sent until the signature; `post` sends the decision with it.
 */
export interface SignedStep {
  action: string;
  target: string;
  /** What the signer attests, shown before they sign. */
  meta: string;
  rows: Array<{ label: string; value: string }>;
  meanings: EsigMeaning[];
  post: (input: { meaning: EsigMeaning; reason: string; password: string; totp?: string }) => Promise<EsigSignedManifest>;
  /** The register's notice once the signature has committed. */
  done: string;
}

export type RowAction<R> = {
  label: string;
  title: string;
  show?: (r: R) => boolean;
  form: (r: R, ctx: RegisterContext) => Omit<C2CFormConfig, 'notice'>;
} & (
  /** Returns the confirmation, or throws a refusal the drawer shows. */
  | { submit: (r: R, v: Record<string, string>) => Promise<string>; sign?: never }
  /** Returns the decision to sign, or throws a refusal the drawer shows. */
  | { sign: (r: R, v: Record<string, string>) => SignedStep; submit?: never }
);

export interface RegisterConfig<R extends { id: number | string }> {
  title: string;
  sub: string;
  /** Singular and plural, lower case. */
  noun: [string, string];
  listPath: string;
  /** The server's cap on the list read, and the order it keeps (C12): at the cap the register says it shows "the 100
   *  most recently updated CAPAs", not all of them. Absent, the read is the whole register. */
  readCap?: { rows: number; order: string };
  /** The record's number or name: its row's "More actions for …" and the group it opens say it. */
  name: (r: R) => string;
  columns: Column<R>[];
  kpis: (rows: R[], today: string) => KpiSpec[];
  createLabel: string;
  createForm: Omit<C2CFormConfig, 'notice'> | ((ctx: RegisterContext) => Omit<C2CFormConfig, 'notice'>);
  create: (v: Record<string, string>) => Promise<string>;
  /** The updates a row takes, where the server has them. */
  rowActions?: RowAction<R>[];
  ask: string;
  askRow: (r: R) => string;
  /** What AnA is told about a row: the register's own recorded values, nothing derived by a model. */
  facts: (r: R, ctx: RegisterContext) => RecordFacts;
  /** What else the register reads for its cells and forms. */
  needs?: { documents?: boolean };
  /** The CAPA sourceRefs kind this record is raised as: the register shows the
   *  CAPAs raised from each row, derived from the CAPA register. */
  capaSourceKind?: string;
  /** What a row opens to, under it; its first cell becomes the toggle. */
  /** The row's detail; `onChanged` takes the write's confirmation, which the register says as a toast (C3). */
  detail?: { label: string; render: (r: R, onChanged: (confirmation?: string) => void) => React.ReactNode };
}

export const optionsOf = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
/** D0's chip for a record's state (C11): effective is ok, a failure red, a warning amber, an ended record dimmed; a
 *  state in flight is neutral. Until 2026-11-10 Quality kept its own pill, amber for every state in progress. */
const PILL_CHIP: Record<PillTone, string> = { effective: ' tone-ok', err: ' tone-err', warn: ' tone-warn', muted: ' tone-dim', draft: '', review: '' };
export const pill = (tone: PillTone, text: string) => <span className={`rd-chip${PILL_CHIP[tone] ?? ''}`}>{text}</span>;
export const plural = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;
export const num = (s: string) => (s.trim() === '' ? undefined : Math.max(0, Math.trunc(Number(s))));

/** A refusal the drawer shows; the write was not attempted. */
export class Refused extends Error {}

/** A register's name inside a sentence: lower case, keeping acronyms ("CAPA", "SOP register", "management reviews"). */
export function inSentence(label: string): string {
  return label.split(' ').map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase())).join(' ');
}

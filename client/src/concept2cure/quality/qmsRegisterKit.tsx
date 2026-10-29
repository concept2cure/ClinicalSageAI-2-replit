/**
 * The quality-record register kit: the config a register is built from, and the
 * small helpers its configurations share (QmsRecords.tsx renders them).
 *
 * @module client/src/concept2cure/quality/qmsRegisterKit
 */
import * as React from 'react';
import { type C2CFormConfig } from '../v2/C2CForm';

export type Tone = 'ok' | 'warn' | 'err';
export type PillTone = 'draft' | 'review' | 'effective' | 'muted' | 'err';

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
  counts: Array<{ label: string; val: string }>;
  records: RecordFacts[];
  /** True when more rows were read than are passed on. */
  truncated: boolean;
}

export interface Column<R> { label: string; cell: (r: R) => React.ReactNode }
export interface KpiSpec { label: string; val: string; sub: string; tone?: Tone }

export type RowAction<R> = {
  label: string;
  title: string;
  show?: (r: R) => boolean;
  form: (r: R) => Omit<C2CFormConfig, 'notice'>;
  /** Returns the confirmation, or throws a refusal the drawer shows. */
  submit: (r: R, v: Record<string, string>) => Promise<string>;
};

export interface RegisterConfig<R extends { id: number | string }> {
  title: string;
  sub: string;
  /** Singular and plural, lower case. */
  noun: [string, string];
  listPath: string;
  grid: string;
  columns: Column<R>[];
  kpis: (rows: R[], today: string) => KpiSpec[];
  createLabel: string;
  createForm: Omit<C2CFormConfig, 'notice'>;
  create: (v: Record<string, string>) => Promise<string>;
  /** The updates a row takes, where the server has them. */
  rowActions?: RowAction<R>[];
  ask: string;
  askRow: (r: R) => string;
  /** What AnA is told about a row: the register's own recorded values, nothing derived by a model. */
  facts: (r: R) => RecordFacts;
  /** The CAPA sourceRefs kind this record is raised as: the register shows the
   *  CAPAs raised from each row, derived from the CAPA register. */
  capaSourceKind?: string;
  /** What a row opens to, under it; its first cell becomes the toggle. */
  detail?: { label: string; render: (r: R, onChanged: () => void) => React.ReactNode };
}

export const optionsOf = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
export const pill = (tone: PillTone, text: string) => <span className="qms-pill" data-tone={tone}>{text}</span>;
export const plural = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;
export const num = (s: string) => (s.trim() === '' ? undefined : Math.max(0, Math.trunc(Number(s))));

/** A refusal the drawer shows; the write was not attempted. */
export class Refused extends Error {}

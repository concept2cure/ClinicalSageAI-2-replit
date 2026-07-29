/**
 * Reusable structured data-entry (kit app/data-entry.jsx).
 *
 * The detailed intake layer behind every "add a record" drawer: a typed
 * field schema (text / textarea / select / segmented / date / number /
 * password) rendered as a right-side drawer, with required-field
 * validation and an optional governed (Part 11) note. Surfaces hold their
 * rows in state via useRows() and prepend the submitted record
 * optimistically (fresh-row highlight + confirm toast).
 *
 * C2CForm itself already lives in ../C2CForm (15+ kit surfaces import it
 * directly from there); this module re-exports it alongside the
 * toast/rows helpers that round out the kit file. Individual surfaces keep
 * their own local copy of useRows/useToast/C2CToast per the established
 * convention (see AgencyMeetings.tsx, ClinicalOps.tsx, CmcModule.tsx, …) —
 * this module is the faithful, centralized port of the kit source.
 */
import React, { useState } from 'react';
import { I } from '../icons';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig, C2CFormField, C2CFormFieldOption, C2CFormProps } from '../C2CForm';

export { C2CForm };
export type { C2CFormConfig, C2CFormField, C2CFormFieldOption, C2CFormProps };

export function C2CToast({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="de-toast">
      <span className="ico">{I.checkCircle}</span>
      {msg}
    </div>
  );
}

/** Rows in local state, newest first, with a transient _new highlight flag. */
export function useRows<T extends { _new?: boolean }>(seed: T[]): readonly [T[], (r: T) => void] {
  const [rows, setRows] = useState<T[]>(() => (seed || []).map((r) => ({ ...r })));
  const add = (r: T) => {
    const row = { ...r, _new: true };
    setRows((rs) => [row, ...rs]);
    setTimeout(() => setRows((rs) => rs.map((x) => (x === row ? { ...x, _new: false } : x))), 1500);
  };
  return [rows, add] as const;
}

/** Auto-dismissing toast. */
export function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const fire = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2400);
  };
  return [msg, fire];
}

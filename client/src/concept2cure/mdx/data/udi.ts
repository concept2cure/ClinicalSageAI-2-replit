/**
 * UDI and labeling row types — GUDID registry, label artifacts, symbol
 * glossary (ISO 15223-1), MRI conditional matrix.
 *
 * UDI = Unique Device Identifier. UDI-DI = device identifier (the static
 * part). UDI-PI = production identifier (lot / serial / mfg-date). GUDID
 * is the FDA's Global UDI Database. EUDAMED is the EU equivalent.
 *
 * ── 2026-10-14 ───────────────────────────────────────────────────────────────
 * This file held the kit's example UDI estate — five devices with published
 * GUDID and EUDAMED states, label artifacts, a symbol checklist, open issues
 * and an MRI matrix — rendered under sample mode. They are deleted with sample
 * mode; the row types they used to be inferred from are declared here.
 */

interface UdiRegistration {
  di: string;
  agency: string;
  status: string;
  submitted: string;
  acked: string;
}

export interface UdiDeviceRow {
  id: string;
  code: string;
  name: string;
  class: string;
  fda: UdiRegistration & { gmdn: string };
  eu: UdiRegistration & { risk: string };
  mri: string;
  rx: string;
  sterile: boolean;
  singleUse: boolean;
  labels: number;
  translations: number;
  open: number;
}

export interface UdiLabelRow {
  id: string;
  device: string;
  kind: string;
  region: string;
  lang: string;
  ver: string;
  size: string;
  status: string;
  updated: string;
}

export interface UdiSymbolRow {
  iso: string;
  name: string;
  glyph: string;
  required: string;
  present: boolean;
}

export interface UdiIssueRow {
  id: string;
  label: string;
  kind: string;
  severity: string;
  msg: string;
  since: string;
}

export interface UdiMriRow {
  device: string;
  mode: string;
  field: string;
  sar: string;
  gradient: string;
  tested: boolean;
  notes: string;
}

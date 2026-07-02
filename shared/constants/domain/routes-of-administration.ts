/**
 * Routes of Administration — canonical domain vocabulary.
 *
 * 19 routes aligned to FDA standard terminology for drug administration.
 * Used in dosing design, protocol specifications, and CMC sections.
 *
 * @module shared/constants/domain/routes-of-administration
 */

import type { QuestionOption } from '../../types/intelligence-questions.js';
import type { DomainEntry } from './index.js';

export type RouteOfAdministration =
  | 'oral'
  | 'intravenous'
  | 'subcutaneous'
  | 'intramuscular'
  | 'topical'
  | 'transdermal'
  | 'inhaled'
  | 'intranasal'
  | 'intradermal'
  | 'intrathecal'
  | 'intravitreal'
  | 'intraperitoneal'
  | 'rectal'
  | 'vaginal'
  | 'sublingual'
  | 'buccal'
  | 'ophthalmic'
  | 'otic'
  | 'other';

export const ROUTES_OF_ADMINISTRATION: DomainEntry<RouteOfAdministration>[] = [
  {
    value: 'oral',
    label: 'Oral',
    description: 'Administration by mouth for systemic or local GI effect.',
  },
  {
    value: 'intravenous',
    label: 'Intravenous (IV)',
    description: 'Direct injection or infusion into a vein for immediate systemic availability.',
  },
  {
    value: 'subcutaneous',
    label: 'Subcutaneous (SC)',
    description: 'Injection into the subcutaneous tissue layer beneath the skin.',
  },
  {
    value: 'intramuscular',
    label: 'Intramuscular (IM)',
    description: 'Injection into skeletal muscle for sustained systemic absorption.',
  },
  {
    value: 'topical',
    label: 'Topical',
    description: 'Application to the skin surface for local effect.',
  },
  {
    value: 'transdermal',
    label: 'Transdermal',
    description: 'Delivery through the skin via patch or other device for systemic effect.',
  },
  {
    value: 'inhaled',
    label: 'Inhaled / Pulmonary',
    description: 'Inhalation into the lungs for local or systemic effect.',
  },
  {
    value: 'intranasal',
    label: 'Intranasal',
    description: 'Administration into the nasal cavity for local or systemic effect.',
  },
  {
    value: 'intradermal',
    label: 'Intradermal (ID)',
    description: 'Injection into the dermis layer of the skin, e.g. for diagnostics or certain vaccines.',
  },
  {
    value: 'intrathecal',
    label: 'Intrathecal',
    description: 'Injection into the spinal canal subarachnoid space.',
  },
  {
    value: 'intravitreal',
    label: 'Intravitreal',
    description: 'Injection into the vitreous body of the eye.',
  },
  {
    value: 'intraperitoneal',
    label: 'Intraperitoneal',
    description: 'Injection or infusion into the peritoneal cavity.',
  },
  {
    value: 'rectal',
    label: 'Rectal',
    description: 'Administration into the rectum for local or systemic effect.',
  },
  {
    value: 'vaginal',
    label: 'Vaginal',
    description: 'Administration into the vaginal canal for local effect.',
  },
  {
    value: 'sublingual',
    label: 'Sublingual',
    description: 'Placement under the tongue for rapid mucosal absorption.',
  },
  {
    value: 'buccal',
    label: 'Buccal',
    description: 'Placement between the cheek and gum for mucosal absorption.',
  },
  {
    value: 'ophthalmic',
    label: 'Ophthalmic',
    description: 'Application to the eye surface (drops, ointment) for local effect.',
  },
  {
    value: 'otic',
    label: 'Otic',
    description: 'Administration into the ear canal for local effect.',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Route of administration not covered by the predefined categories.',
  },
];

/** Convert ROUTES_OF_ADMINISTRATION to QuestionOption[] for use in intelligence question flows. */
export function toQuestionOptions(): QuestionOption[] {
  return ROUTES_OF_ADMINISTRATION.map((e) => ({ value: e.value, label: e.label, description: e.description }));
}

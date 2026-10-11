/**
 * One neutral, monochrome line glyph per place a step of AnA's work acts on
 * (ANA-SUMMARY S4, docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §3.3;
 * product owner's decision: neutral glyphs, visible source names, no
 * third-party logos).
 *
 * The glyph is decoration (aria-hidden where it is drawn): the source's name
 * is always on the row as text, so nothing is said by the glyph alone. The
 * connected systems share one glyph and are told apart by their names; a
 * vendor's logo would claim an endorsement nobody gave.
 *
 * @module client/src/concept2cure/v2/anaSourceGlyphs
 */

import type React from 'react';
import type { StepSource } from '@shared/ana/step-verbs';
import { I } from './icons';

const SOURCE_GLYPHS: Readonly<Record<StepSource, React.ReactElement>> = {
  vault: I.vault,
  data_room: I.database,
  authoring: I.penLine,
  submissions: I.send,
  qms: I.shieldCheck,
  reports: I.barChart,
  project: I.folder,
  agency: I.building,
  literature: I.bookOpen,
  knowledge: I.book,
  connected: I.plug,
  google_drive: I.plug,
  box: I.plug,
  onedrive: I.plug,
  sharepoint: I.plug,
  veeva_vault: I.plug,
  mailbox: I.mail,
  web: I.globe,
  screen: I.eye,
  plan: I.list,
  engine: I.terminal,
};

/** The glyph for a step's source; a source the table does not know draws the project's. */
export function sourceGlyph(source: StepSource | undefined): React.ReactElement {
  return (source && SOURCE_GLYPHS[source]) || SOURCE_GLYPHS.project;
}

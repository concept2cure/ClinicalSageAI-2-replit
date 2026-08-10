/**
 * authoringHandoff — the one path from a specialist surface into the governed
 * authoring store.
 *
 * Three surfaces end with "Open in document editor": Biostatistics (a
 * statistical document), ReportEngine (a protocol analysis) and CmcModule (a
 * change-impact assessment). Each has to create a document, write its text as a
 * section, and only then navigate — because navigating first would take the
 * user to an editor that does not have their work.
 *
 * All three carried their own ~45-line copy of that sequence, identical down to
 * the `openingRef` double-click guard, the 401 branch, and the "Staying here so
 * you don't lose it" wording of the half-failed case. They differed in four
 * values (title, module, code, content) and one noun.
 *
 * That is a bad thing to have three of. The half-failure case in particular —
 * document created, section write failed — is the one that decides whether a
 * user loses work, and three copies of it is three chances for one to drift
 * into navigating away anyway. This module is the single copy; hosts supply the
 * four values and render the returned message.
 *
 * @module client/src/concept2cure/v2/authoringHandoff
 */

import { apiRequest } from '@/lib/queryClient';
import { unboundNotice } from './governanceNotice';

export interface AuthoringHandoff {
  title: string;
  /**
   * CTD module the document files under. REQUIRED, and deliberately not
   * defaulted here: the server falls back to 'M3' when it is omitted, which is
   * right for quality documentation and wrong for everything else. Making each
   * caller state it keeps that decision at the surface that knows the answer.
   */
  module: string;
  /**
   * Section code. Deliberately NOT a CTD number: the editor binds outline nodes
   * to sections by exact code match (`findSectionForNode` in `useFilingOutline`),
   * so a numeric code would assert a filing position these surfaces cannot know.
   */
  code: string;
  content: string;
  /**
   * What the user would call the thing on screen — "the document", "the
   * analysis", "the assessment". It appears in the failure messages, which
   * promise that it is still here.
   */
  subject: string;
}

export type AuthoringHandoffResult =
  /** Document and section both written. Safe to navigate. */
  | { ok: true; docId: string; message: string }
  /**
   * Nothing was written, or the document exists but its text does not. Either
   * way the caller must STAY PUT: navigating now would leave the user looking
   * at an editor that does not contain what they just made.
   */
  | { ok: false; message: string };

/**
 * Create a governed document and write `content` into it as one section.
 *
 * Never throws: every failure comes back as `{ ok: false, message }` with text
 * fit to show the user, so a caller cannot accidentally navigate on a rejected
 * promise.
 */
export async function saveToAuthoring(h: AuthoringHandoff): Promise<AuthoringHandoffResult> {
  try {
    // The same project scope the editor filters on, from the same runtime
    // channel every project-aware surface reads.
    const proj = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
    const programId = proj && typeof proj.id === 'string' ? proj.id : null;

    const dRes = await apiRequest('POST', '/api/authoring/docs', {
      title: h.title,
      module: h.module,
      ...(programId ? { client_program_id: programId } : {}),
    });
    const dJson = (await dRes.json().catch(() => null)) as
      | { document?: { id?: unknown }; governance?: unknown; error?: string }
      | null;
    if (!dRes.ok || !dJson?.document?.id) {
      return {
        ok: false,
        message:
          dRes.status === 401
            ? `Not opened — your session isn’t authenticated. Nothing was saved; ${h.subject} is still here.`
            : `Couldn’t create the document — ${dJson?.error ?? 'HTTP ' + dRes.status}. Nothing was saved; ${h.subject} is still here.`,
      };
    }

    const docId = String(dJson.document.id);
    const sRes = await apiRequest('POST', '/api/authoring/sections', {
      doc_id: docId,
      code: h.code,
      title: h.title,
      content: h.content,
    });
    const sJson = (await sRes.json().catch(() => null)) as
      | { section?: { id?: unknown }; error?: string }
      | null;
    if (!sRes.ok || !sJson?.section?.id) {
      // The document exists but is empty. Reporting ok:false is what keeps the
      // caller from navigating to it.
      return {
        ok: false,
        message: `The document was created but its text didn’t save — ${sJson?.error ?? 'HTTP ' + sRes.status}. Staying here so you don’t lose it.`,
      };
    }

    return {
      ok: true,
      docId,
      // Shown only when the host has no navigator wired: say where the work
      // went rather than appearing to do nothing.
      //
      // Plus, when the server declined to bind the new document to the open
      // project's governed filing, the reason it gave. The document is real and
      // the text is saved either way — but "saved" and "saved into the filing
      // you think you are writing" are different facts, and on a regulated
      // surface conflating them is the drift this binding exists to prevent.
      message:
        `Saved to the authoring store as “${h.title}” — open Document authoring to edit it.` +
        unboundNotice(dJson.governance),
    };
  } catch (e) {
    return {
      ok: false,
      message: `Couldn’t open in the editor — ${e instanceof Error ? e.message : String(e)}. Nothing was saved.`,
    };
  }
}

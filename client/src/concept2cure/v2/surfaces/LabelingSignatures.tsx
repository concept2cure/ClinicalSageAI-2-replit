/**
 * The Labeling screen's signatures: whether each still binds the label it
 * signed, and whether the signed-in user may sign a translation's approval
 * (D5, 2026-10-29; docs/evidence/D5-SIGNED-CONTENT-ON-SCREEN/2026-10-29/).
 *
 * Both come from one read, GET /api/mdx/labeling/:id:
 *   - `signedContent` on the document and on each translation
 *     (readSignedContentStates), drawn with the shared SignedContentLine;
 *   - `approvalSigner.state` on each translation, the approval's own
 *     separation-of-duties check asked in advance (signerIndependenceOf). Only
 *     'author' withholds Approve: the approval refuses a translation's creator.
 *     'unresolved' (no creator recorded) is signed by the server as not
 *     applicable, and 'unverified' (the check could not run, or was not read)
 *     offers Approve with no warning. Either way the signed PATCH decides.
 *
 * The translation board's row is drawn here (it was inline in Labeling.tsx)
 * because the row is what gains the signature state and the creator's note.
 *
 * @module client/src/concept2cure/v2/surfaces/LabelingSignatures
 */
import React from 'react';
import {
  SignedContentLine,
  UNAVAILABLE_FACET,
  showsSignedContent,
  signedContentFacetOf,
  signedContentForAna,
  signedContentWords,
  useSignedRecord,
  type SignedContentFacet,
  type SignedRecordRead,
} from '../SignedContentState';
import { LABEL_ENUMS } from '../fixtures/labeling-data';
import type { LabelTranslation } from '../fixtures/labeling-data';
import { TranslationStepControl } from './LabelingTranslationApproval';

export type ApprovalSigner = 'independent' | 'author' | 'unresolved' | 'unverified';
const SIGNERS: ReadonlySet<string> = new Set(['independent', 'author', 'unresolved', 'unverified']);

/** A labeling document is signed into these statuses (DOC_SIGNED_STATUS, mdx-labeling-approvals.ts). */
const DOC_SIGNED = new Set(['approved', 'effective', 'superseded']);

export interface LabelingSignatures {
  reading: boolean;
  document: SignedContentFacet;
  /** A translation's facet; `unavailable` for one the read did not carry. */
  translation: (id: string) => SignedContentFacet;
  /** 'unverified' for one the read did not carry: Approve is offered, and the server decides. */
  signerOf: (id: string) => ApprovalSigner;
}

type Row = Record<string, unknown>;
type Step = { id: string; status: string };

export function labelingSignaturesOf(read: SignedRecordRead): LabelingSignatures {
  const list = Array.isArray(read.record?.translations) ? (read.record.translations as Row[]) : [];
  const byId = new Map(list.filter((t) => t && typeof t === 'object').map((t) => [String(t.id), t]));
  return {
    reading: read.reading,
    document: read.facet,
    translation: (id) => (byId.has(id) ? signedContentFacetOf(byId.get(id)?.signedContent) : UNAVAILABLE_FACET),
    signerOf: (id) => {
      const s = (byId.get(id)?.approvalSigner as { state?: unknown } | undefined)?.state;
      return typeof s === 'string' && SIGNERS.has(s) ? (s as ApprovalSigner) : 'unverified';
    },
  };
}

/**
 * The document's GET, read again on Try again (`reads`) and on `refresh()`,
 * which the screen calls after a translation is added (it is the signed-in
 * user's) and after an approval is signed here (its state changed).
 */
export function useLabelingSignatures(docId: number | null, reads: number): LabelingSignatures & { refresh: () => void } {
  const [writes, setWrites] = React.useState(0);
  const read = useSignedRecord(docId ? '/api/mdx/labeling/' + docId : null, docId, [docId, reads, writes]);
  return React.useMemo(() => ({ ...labelingSignaturesOf(read), refresh: () => setWrites((n) => n + 1) }), [read]);
}

/** A translation in review that the signed-in user added: the approval would refuse them. */
export function ownTranslationInReview(t: Step, sigs: LabelingSignatures): boolean {
  return t.status === 'review' && sigs.signerOf(t.id) === 'author';
}

const ownNoteId = (id: string) => 'labeling-own-translation-' + id;

const OWN_TRANSLATION =
  'You added this translation, so you cannot approve it. Separation of duties requires a different colleague with signing rights to approve it.';

/** The document's signature, above the label's lead, when it is signed or expected to be. */
export function LabelingDocumentSignature({ status, sigs }: { status: string; sigs: LabelingSignatures }) {
  const facet = sigs.reading ? null : sigs.document;
  const expected = DOC_SIGNED.has(status);
  if (!showsSignedContent(facet, expected, sigs.reading)) return null;
  return (
    <div style={{ padding: '0 10px 12px' }}>
      <SignedContentLine facet={facet} expected={expected} reading={sigs.reading} label="Label signature" testId="labeling-document-signature" />
    </div>
  );
}

/** Below a translation's row: why its creator is not offered Approve, and its approval signature's state. */
function TranslationRowFoot({ t, sigs, own }: { t: Step; sigs: LabelingSignatures; own: boolean }) {
  const facet = sigs.reading ? null : sigs.translation(t.id);
  const expected = t.status === 'approved';
  if (!own && !showsSignedContent(facet, expected, sigs.reading)) return null;
  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
      {own && (
        <p id={ownNoteId(t.id)} className="scaf-note" role="note" style={{ margin: 0 }} data-testid="labeling-own-translation">
          {OWN_TRANSLATION}
        </p>
      )}
      <SignedContentLine facet={facet} expected={expected} reading={sigs.reading} label="Approval signature"
        testId={'labeling-translation-signature-' + t.id} />
    </div>
  );
}

const EN = LABEL_ENUMS;
const T_TONE: Record<string, string> = { approved: 'ok', review: 'warn', in_progress: 'ai', pending: 'idle', rejected: 'err' };
const enumLabel = (list: string[][], key: string) => (list.find((e) => e[0] === key) || [])[1] || key;

/** One translation on the board: language, method, status, its next step, and below it, its signature. */
export function TranslationRow({ t, sigs, canWrite, onApprove, onAdvance }: {
  t: LabelTranslation;
  sigs: LabelingSignatures;
  canWrite: boolean;
  onApprove: () => void;
  onAdvance: () => void;
}) {
  const own = canWrite && ownTranslationInReview(t, sigs);
  return (
    <div className="ct-row" style={{ gridTemplateColumns: '1.4fr 1fr 0.9fr 120px', alignItems: 'center' }} data-fresh={t._new || undefined}>
      <div className="vn"><span className="ct-strong">{t.name}</span> <span className="mono" style={{ fontSize: 11, color: 'var(--text-400)' }}>{t.language}</span></div>
      <div style={{ fontSize: 12, color: 'var(--text-300)' }}>
        {enumLabel(EN.method, t.method)}
        {t.btv && <span className="rd-chip tone-ok" style={{ marginLeft: 6, fontSize: 9 }}>back-trans verified</span>}
      </div>
      <div><span className={`rd-chip tone-${T_TONE[t.status] || 'idle'}`}>{enumLabel(EN.transStatus, t.status)}</span></div>
      <div style={{ textAlign: 'right' }}>
        <TranslationStepControl status={t.status} canWrite={canWrite} onApprove={onApprove} onAdvance={onAdvance} ownNoteId={own ? ownNoteId(t.id) : null} />
      </div>
      <TranslationRowFoot t={t} sigs={sigs} own={own} />
    </div>
  );
}

/** What the summary says of the signatures, as the screen shows them; '' or one or more sentences with a leading space. */
function signatureSentence(sigs: LabelingSignatures, docStatus: string, trans: ReadonlyArray<Step & { name: string }>, own: string[]): string {
  if (sigs.reading) return ' The signature states are still being read.';
  const parts: string[] = [];
  if (showsSignedContent(sigs.document, DOC_SIGNED.has(docStatus))) parts.push(`The label's signature: ${signedContentWords(sigs.document)}.`);
  const shown = trans.filter((t) => showsSignedContent(sigs.translation(t.id), t.status === 'approved'));
  if (shown.length) {
    parts.push(`Translation approval signatures: ${shown.map((t) => `${t.name}, ${signedContentWords(sigs.translation(t.id))}`).join('; ')}.`);
  }
  if (own.length) {
    parts.push(`The signed-in user added the ${own.join(', ')} translation${own.length === 1 ? '' : 's'} in review, so they cannot approve ${own.length === 1 ? 'it' : 'them'}; a different colleague with signing rights must.`);
  }
  return parts.length ? ' ' + parts.join(' ') : '';
}

type AnaShape = { summary: string; facts?: Record<string, unknown>; availableActions?: string[] };

/**
 * The screen's AnA context with its signatures added: the summary says them,
 * the document's and each translation's facts carry `signedContent` (and the
 * translation's `approvalSigner`), and the actions do not offer the approvals
 * the screen withholds.
 */
export function withLabelingSignatures<T extends AnaShape>(ctx: T, o: {
  sigs: LabelingSignatures; docStatus: string; trans: ReadonlyArray<Step & { name: string }>; canWrite: boolean;
}): T {
  const { sigs } = o;
  const own = o.trans.filter((t) => ownTranslationInReview(t, sigs)).map((t) => t.name);
  const facts = ctx.facts ?? {};
  const translations = Array.isArray(facts.translations) ? (facts.translations as Row[]) : [];
  const withheld = o.canWrite && own.length
    ? [`Not approve the ${own.join(', ')} translation${own.length === 1 ? '' : 's'}: the signed-in user added ${own.length === 1 ? 'it' : 'them'}, and a different colleague with signing rights must approve`]
    : [];
  return {
    ...ctx,
    summary: ctx.summary + signatureSentence(sigs, o.docStatus, o.trans, own),
    facts: {
      ...facts,
      document: { ...(facts.document as Row | undefined), signedContent: signedContentForAna(sigs.document, sigs.reading) },
      translations: translations.map((t) => ({
        ...t,
        signedContent: signedContentForAna(sigs.translation(String(t.id)), sigs.reading),
        approvalSigner: sigs.signerOf(String(t.id)),
      })),
    },
    availableActions: [...(ctx.availableActions ?? []), ...withheld],
  };
}

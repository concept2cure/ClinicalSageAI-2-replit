/**
 * Review and approval of a Vault version (VR-13, row D5).
 *
 * A version's lifecycle is its record on the one document lifecycle
 * (POST/advance/sign under /api/regulatory/documents). The Vault shows it
 * apart from filing: Not sent for review, In review, Approved or Superseded,
 * with each sign-off's printed name, meaning and time (UTC) as the signature
 * record holds them. A confirmed filing is not an approval.
 *
 * The current version offers the next step:
 *   - Send for review: confirmed first, because it names who started the
 *     record (an author, who then neither reviews nor approves it). The server
 *     takes the title, type and hash from the stored version;
 *   - Sign review and Approve: the shared Part 11 EsignModal (meaning, reason,
 *     password, and the authenticator code when one is enrolled), forwarded to
 *     the route, which re-verifies the signer in the transaction that records
 *     the sign-off. Approving supersedes the earlier approved versions, which
 *     the dialog names.
 *
 * The page says before anyone signs who may not act: the uploader, whoever
 * sent the version for review, the reviewer (for approval), and a role without
 * authoring rights. The server refuses all of them anyway (FD4's strict
 * default); this spares a credential check.
 */
import React, { useRef, useState } from 'react';
import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { EsignModal, type EsigSignedManifest, type EsignSigner } from '../../_shared/components/EsignModal';
import { useAuthUser, type AuthUser } from '@/services/portal/authService';
import { isAnnotationsShape, openAnnotationsSentence } from './VaultAnnotations';

export interface VaultSignOff {
  printedName: string | null;
  meaning: string;
  signedAt: string;
  signatureRef: string;
  signerId?: number | null;
}

export interface VaultVersionLifecycle {
  canonicalId: string;
  stage: string;
  creatorId?: number | null;
  review: VaultSignOff | null;
  approval: VaultSignOff | null;
}

/** The stages at which a version is its document's approved one. */
export const APPROVED_STAGES = ['approved', 'placed', 'packaged', 'submitted'];

const STAGE_LABEL: Record<string, string> = {
  authoring: 'Not sent for review',
  in_review: 'In review',
  approved: 'Approved',
  placed: 'Approved, placed in a submission',
  packaged: 'Approved, packaged',
  submitted: 'Approved, submitted',
  superseded: 'Superseded',
  withdrawn: 'Withdrawn',
};

/** A version's stage in words. No record means nobody has sent it for review. */
export function stageLabel(stage: string | null | undefined): string {
  if (!stage) return 'Not sent for review';
  return STAGE_LABEL[stage] ?? 'Stage not recognised';
}

function utc(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

function signOffLine(kind: 'Review' | 'Approval', s: VaultSignOff, retired: boolean): string {
  return (
    `${kind} signed by ${s.printedName ?? 'printed name not recorded'} · meaning: ${s.meaning.toLowerCase()} · ${utc(s.signedAt)}` +
    (retired ? ' · no longer current' : '')
  );
}

/** The stage and the sign-offs of one version, as the signature records hold them. */
export function LifecycleSummary({ lifecycle }: { lifecycle: VaultVersionLifecycle | null | undefined }) {
  const retired = lifecycle?.stage === 'superseded';
  return (
    <span className="vd-ver-lc" data-testid="vault-version-stage">
      {stageLabel(lifecycle?.stage)}
      {lifecycle?.review ? <span className="vd-ver-lc">{signOffLine('Review', lifecycle.review, retired)}</span> : null}
      {lifecycle?.approval ? <span className="vd-ver-lc">{signOffLine('Approval', lifecycle.approval, retired)}</span> : null}
    </span>
  );
}

// ── Writes: the one lifecycle route ─────────────────────────────────────────

const GATE_TEXT: Record<string, string> = {
  REVIEW_SIGNOFF_REQUIRED: "Approval needs a review sign-off on this version's current content. A reviewer signs the review first.",
  CONTENT_REQUIRED: 'This version has no stored content to review. Upload the file as a new version.',
  ILLEGAL_TRANSITION: "That step does not apply at this version's current stage. Reload to see its stage.",
};

const UNKNOWN_OUTCOME =
  "The connection dropped, so it is not known whether this was recorded. Reload the Vault and check the version's history before trying again.";

/** What a refusal says: the gate in words, else the server's own message. */
function refusalText(payload: unknown, fallback: string, failed: string): string {
  const blocked = (payload as { blockedBy?: unknown } | null)?.blockedBy;
  const gate = Array.isArray(blocked) ? blocked.map((c) => GATE_TEXT[String(c).split(':')[0]]).find(Boolean) : undefined;
  return gate ?? `${failed} ${redactInternals(serverMessage(payload), fallback)}`;
}

/** POST to the lifecycle route (named in full at each call, so the launch-scope gate sees it). */
async function lifecyclePost(url: string, body: Record<string, unknown>, failed: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await apiRequest('POST', url, body);
  } catch (e) {
    // apiRequest throws on every refusal but a 401; only a thrown non-API error is a dropped connection.
    if (e instanceof ApiRequestError) throw new Error(refusalText(e.payload, e.message, failed), { cause: e });
    throw new Error(UNKNOWN_OUTCOME, { cause: e });
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || json.ok === false) {
    throw new Error(refusalText(json, 'No reason was returned. Reload and try again.', failed));
  }
  return json;
}

/** Start the version's record (or find the one started) and send it for review. */
async function sendForReview(vaultId: string): Promise<void> {
  const failed = 'The version was not sent for review.';
  const started = await lifecyclePost(
    '/api/regulatory/documents',
    { sources: { vault_documents: { nativeId: vaultId, role: 'artifact' } } },
    failed,
  );
  await lifecyclePost(`/api/regulatory/documents/${encodeURIComponent(String(started.canonicalId))}/advance`, { to: 'in_review' }, failed);
}

type SignInput = { reason: string; password: string; totp?: string };

const signReview = (canonicalId: string, input: SignInput) =>
  lifecyclePost(
    `/api/regulatory/documents/${encodeURIComponent(canonicalId)}/sign`,
    { meaning: 'reviewed', reason: input.reason, password: input.password, mfaToken: input.totp },
    'The review was not signed.',
  );

const approve = (canonicalId: string, input: SignInput) =>
  lifecyclePost(
    `/api/regulatory/documents/${encodeURIComponent(canonicalId)}/advance`,
    { to: 'approved', reason: input.reason, password: input.password, mfaToken: input.totp },
    'The version was not approved.',
  );

// ── Who may take the next step ──────────────────────────────────────────────

/** Org roles that carry the regulatory-author grant the lifecycle route requires (server/middleware/auth.ts). */
const AUTHOR_ROLES = ['admin', 'owner', 'manager', 'member', 'editor', 'regulatory-author'];

function printedSigner(u: AuthUser | null): EsignSigner | undefined {
  const name = [u?.displayName, [u?.firstName, u?.lastName].filter(Boolean).join(' '), u?.email]
    .find((v) => typeof v === 'string' && v.trim().length > 0);
  return name ? { name: name.trim(), ...(u?.email ? { email: u.email } : {}) } : undefined;
}

type Step = 'send' | 'review' | 'approve' | null;

interface Actor {
  id: number | null;
  /** Known roles carry no authoring grant (unknown roles are left to the server). */
  cannotAuthor: boolean;
}

function stepOf(lifecycle: VaultVersionLifecycle | null | undefined): Step {
  const stage = lifecycle?.stage ?? null;
  if (!stage || stage === 'authoring') return 'send';
  if (stage !== 'in_review') return null;
  return lifecycle?.review ? 'approve' : 'review';
}

/** The next step for this version, and why this user cannot take it (if so). */
function nextStep(
  lifecycle: VaultVersionLifecycle | null | undefined,
  me: Actor,
  uploaderId: number | null | undefined,
): { step: Step; blocked: string | null } {
  const step = stepOf(lifecycle);
  if (!step) return { step, blocked: null };
  if (me.cannotAuthor) return { step, blocked: 'Your role does not send, review or approve documents. An organization admin can change your role.' };
  if (step === 'send' || me.id === null) return { step, blocked: null };
  const act = step === 'review' ? 'reviews' : 'approves';
  if (uploaderId === me.id) return { step, blocked: `You uploaded this version, so a different person ${act} it.` };
  if (lifecycle?.creatorId === me.id) return { step, blocked: `You sent this version for review, so a different person ${act} it.` };
  if (step === 'approve' && lifecycle?.review?.signerId === me.id) {
    return { step, blocked: 'You signed the review, so a different person approves it.' };
  }
  return { step, blocked: null };
}

function useActor(): { actor: Actor; authUser: AuthUser | null } {
  const authUser = useAuthUser();
  const roles = (authUser?.roles ?? []).map((r) => String(r).toLowerCase());
  return {
    authUser,
    actor: {
      id: authUser?.id && /^\d+$/.test(authUser.id) ? Number(authUser.id) : null,
      cannotAuthor: roles.length > 0 && !roles.some((r) => AUTHOR_ROLES.includes(r)),
    },
  };
}

// ── The actions on the current version ──────────────────────────────────────

/** Sending for review, confirmed: what it covers and what it means for who sent it. */
function SendForReviewConfirm({ versionLabel, hashPrefix, busy, onConfirm, onCancel }: {
  versionLabel: string;
  hashPrefix: string | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <span className="vd-ver-lc" role="group" aria-label="Confirm sending for review">
      <span className="vd-ver-m">
        {`Send ${versionLabel || 'this version'} for review? The review covers this version's stored file as it is now` +
          `${hashPrefix ? ` (SHA-256 ${hashPrefix}…)` : ''}. Because you start its review record, a different person reviews and approves it.`}
      </span>
      <span className="vd-ver-acts">
        <button className="sp-ask" disabled={busy} onClick={onConfirm}>Send for review</button>
        <button className="sp-ask" disabled={busy} onClick={onCancel}>Cancel</button>
      </span>
    </span>
  );
}

/** What the approval dialog says about the file and the versions it supersedes. */
function approveMeta(supersedes: string[]): string {
  return (
    "Your approval applies to this version's stored file as it is now. " +
    (supersedes.length > 0
      ? `${supersedes.join(', ')} ${supersedes.length === 1 ? 'becomes' : 'become'} superseded when you sign.`
      : 'No earlier version of this document is approved, so none is superseded.')
  );
}

/** The Part 11 dialog for a review or an approval, forwarded to the lifecycle route. */
function SignOffDialog({ signing, p, authUser, onClose, annotationNote }: {
  signing: 'review' | 'approve';
  p: ActionProps;
  authUser: AuthUser | null;
  onClose: () => void;
  /** What was open on the document when the dialog opened; undefined when no project was given to read it. */
  annotationNote?: string;
}) {
  const signed = useRef(false);
  const review = signing === 'review';
  const onSign = async (input: { meaning: string; reason: string; password: string; totp?: string }): Promise<EsigSignedManifest> => {
    const canonicalId = p.lifecycle!.canonicalId;
    const result = review ? await signReview(canonicalId, input) : await approve(canonicalId, input);
    signed.current = true;
    const at = (result.signature as { signedAt?: string } | undefined)?.signedAt ?? (result.auditEvent as { at?: string } | undefined)?.at ?? '';
    return { meaning: input.meaning as EsigSignedManifest['meaning'], reason: input.reason, signedAt: at };
  };
  return (
    <EsignModal
      open
      action={review ? 'Sign the review' : 'Approve this version'}
      target={`${p.title} ${p.versionLabel}`}
      targetMeta={
        (review
          ? "Your review applies to this version's stored file as it is now. A changed file is a new version and needs its own review."
          : approveMeta(p.supersedes)) +
        (annotationNote ? ` When this dialog opened: ${annotationNote} Signing does not resolve annotations; they stay on each version's record.` : '')
      }
      meanings={review ? ['review'] : ['approval']}
      defaultMeaning={review ? 'review' : 'approval'}
      signer={printedSigner(authUser)}
      requireMfa={authUser?.mfaEnabled === true}
      onClose={() => {
        onClose();
        // Re-read only when the server recorded a sign-off.
        if (signed.current) p.onChanged();
      }}
      onSign={onSign}
    />
  );
}

interface ActionProps {
  vaultId: string;
  versionLabel: string;
  title: string;
  lifecycle: VaultVersionLifecycle | null | undefined;
  uploaderId?: number | null;
  contentHash?: string | null;
  /** The earlier versions an approval would supersede, in words ("v1.0 (Approved, submitted)"). */
  supersedes: string[];
  /** Re-read the Vault: the server's record is what the page shows. */
  onChanged: () => void;
  /** The project, so the dialogs can read the document's open review annotations. */
  projectId?: string;
}

/** The open annotations on every version of the document, as a sentence; null when they could not be read. */
async function readOpenAnnotations(projectId: string, vaultId: string): Promise<string | null> {
  try {
    const res = await apiRequest('GET',
      `/api/c2c/project-vault/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(vaultId)}/annotations`);
    const body = (await res.json().catch(() => null)) as { data?: unknown } | null;
    return res.ok && isAnnotationsShape(body?.data) ? openAnnotationsSentence(body.data.openByVersion) : null;
  } catch {
    return null;
  }
}

export function VersionLifecycleActions(p: ActionProps) {
  const { actor, authUser } = useActor();
  const [signing, setSigning] = useState<'review' | 'approve' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [annotationNote, setAnnotationNote] = useState<string | undefined>(undefined);
  const { step, blocked } = nextStep(p.lifecycle, actor, p.uploaderId);
  if (!step) return null;

  /* What is open is read when the dialog is asked for, and said in it. It
     never blocks signing: no decision makes open annotations a refusal (FD13). */
  const openSignOff = async (which: 'review' | 'approve') => {
    if (p.projectId) {
      const note = await readOpenAnnotations(p.projectId, p.vaultId);
      setAnnotationNote(note ?? openAnnotationsSentence(null));
      setError(note === null ? 'Open annotations could not be read.' : null);
    }
    setSigning(which);
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendForReview(p.vaultId);
      setConfirming(false);
      p.onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The version was not sent for review.');
    } finally {
      setBusy(false);
    }
  };

  const label = step === 'send' ? 'Send for review' : step === 'review' ? 'Sign review' : 'Approve';
  return (
    <span className="vd-ver-acts">
      {!confirming && (
        <button
          className="sp-ask"
          disabled={busy || blocked !== null}
          onClick={() => (step === 'send' ? setConfirming(true) : void openSignOff(step))}
          aria-label={`${label}: ${p.title} ${p.versionLabel}`}
        >
          {label}
        </button>
      )}
      {confirming && (
        <SendForReviewConfirm
          versionLabel={p.versionLabel}
          hashPrefix={p.contentHash ? p.contentHash.slice(0, 12) : null}
          busy={busy}
          onConfirm={() => void send()}
          onCancel={() => setConfirming(false)}
        />
      )}
      {blocked ? <span className="vd-ver-m">{blocked}</span> : null}
      {error ? <span className="vd-dr-err" role="alert">{error}</span> : null}
      {signing && (
        <SignOffDialog signing={signing} p={p} authUser={authUser} annotationNote={annotationNote} onClose={() => setSigning(null)} />
      )}
    </span>
  );
}

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
 *   - Send for review: since RR1b (docs/design/REVIEW_ROUTING_2026-10-23.md)
 *     the route form (VaultReviewRoute.tsx) names the reviewers, the approver,
 *     the due dates and the reason; it says that whoever sends starts the
 *     record (an author, who then neither reviews nor approves it). The server
 *     takes the title, type and hash from the stored version and refuses a send
 *     without a route (REVIEW_ROUTE_REQUIRED);
 *   - on a named route only a named member whose turn it is signs, and the
 *     approver approves by signing on the route (POST …/sign, meaning
 *     approved); the sender, or an administrator, withdraws; the sender or a
 *     member whose turn it is returns it for revision. Since RR3 the sender or
 *     an administrator reassigns a member who has not signed, and a named
 *     member hands their own assignment back to the sender. A version in
 *     review with no route (it entered review before the cutover) keeps the
 *     steps below and offers Name reviewers;
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
 *
 * A version filed from Authoring whose approval carried (FD5 (c)) shows its
 * sign-offs as signed in Authoring: they are the Authoring signatures, named,
 * not new ones.
 */
import React, { useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { EsignModal, type EsigSignedManifest, type EsignSigner } from '../../_shared/components/EsignModal';
import { useAuthUser, type AuthUser } from '@/services/portal/authService';
import { isAnnotationsShape, openAnnotationsSentence } from './VaultAnnotations';
import { withExtendingRoles } from '@shared/constants/org-roles';
import { lifecyclePost } from './vaultLifecyclePost';
import {
  RouteActDialog,
  RouteForm,
  RouteRoundPanel,
  routeView,
  type RouteAct,
  type RouteFormMode,
  type RouteView,
} from './VaultReviewRoute';
import { approvalShare, type RouteRoundView } from '../reviewRoute/routeRound';

export interface VaultSignOff {
  printedName: string | null;
  meaning: string;
  signedAt: string;
  signatureRef: string;
  signerId?: number | null;
  /** 'authoring' when the sign-off is the Authoring signature this file renders the content of (FD5 (c)). */
  carriedFrom?: 'authoring';
}

export interface VaultVersionLifecycle {
  canonicalId: string;
  stage: string;
  creatorId?: number | null;
  review: VaultSignOff | null;
  approval: VaultSignOff | null;
  /**
   * RR2 records: on a routed version, every reviewer (and, once approved, every
   * approver) who signed on its round, oldest first. Absent or null on a
   * version with no route, whose line is `review` / `approval`.
   */
  reviewSignOffs?: VaultSignOff[] | null;
  approvalSignOffs?: VaultSignOff[] | null;
  /** The version's latest review route (RR1a's round read); null when it has none. */
  round?: RouteRoundView | null;
  /** The route could not be read: its reviewers are unknown, never "none" (RR1b). */
  roundUnread?: boolean;
}

/**
 * Who may sign here, as the server decides it (GET …/versions `signing`; QA
 * 2026-10-08, walk 2, j3). `canSign` is the reader's own authority from the
 * check the sign route applies; null when it could not be read, and then the
 * server decides. `signers` are the members whose role carries signing
 * authority; null when the list could not be read.
 */
export interface VaultSigningPosture {
  canSign: boolean | null;
  signers: Array<{ id: number; name: string }> | null;
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

/**
 * The review stages a reader filters the Vault by, each with the canonical
 * stages it covers (the search's lifecycleStage values; 'none' is a version with
 * no lifecycle record). The words are the ones a row already shows, so a filter
 * and the row it finds agree.
 */
export const VAULT_STAGE_CHOICES: ReadonlyArray<{ value: string; label: string; stages: readonly string[] }> = [
  { value: 'not_sent', label: STAGE_LABEL.authoring, stages: ['none', 'authoring'] },
  { value: 'in_review', label: STAGE_LABEL.in_review, stages: ['in_review'] },
  { value: 'approved', label: STAGE_LABEL.approved, stages: APPROVED_STAGES },
  { value: 'superseded', label: STAGE_LABEL.superseded, stages: ['superseded'] },
  { value: 'withdrawn', label: STAGE_LABEL.withdrawn, stages: ['withdrawn'] },
];

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
    `${kind} signed${s.carriedFrom === 'authoring' ? ' in Authoring' : ''} by ${s.printedName ?? 'printed name not recorded'} · meaning: ${s.meaning.toLowerCase()} · ${utc(s.signedAt)}` +
    (retired ? ' · no longer current' : '')
  );
}

/** Who signed a sign-off: on a routed version everyone on its round, otherwise the one stored sign-off. */
function signersOf(round: VaultSignOff[] | null | undefined, stored: VaultSignOff | null | undefined): VaultSignOff[] {
  if (round?.length) return round;
  return stored ? [stored] : [];
}

/** The stage and the sign-offs of one version, as the signature records hold them. */
export function LifecycleSummary({ lifecycle }: { lifecycle: VaultVersionLifecycle | null | undefined }) {
  const retired = lifecycle?.stage === 'superseded';
  const lines = (kind: 'Review' | 'Approval', signers: VaultSignOff[]) =>
    signers.map((s) => <span key={`${kind}-${s.signatureRef}`} className="vd-ver-lc">{signOffLine(kind, s, retired)}</span>);
  return (
    <span className="vd-ver-lc" data-testid="vault-version-stage">
      {stageLabel(lifecycle?.stage)}
      {lines('Review', signersOf(lifecycle?.reviewSignOffs, lifecycle?.review))}
      {lines('Approval', signersOf(lifecycle?.approvalSignOffs, lifecycle?.approval))}
    </span>
  );
}

// ── Writes: the one lifecycle route ─────────────────────────────────────────

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

/** On a named route the approver approves by signing on it; the server advances the version (RR1a, B8). */
const approveOnRoute = (canonicalId: string, input: SignInput) =>
  lifecyclePost(
    `/api/regulatory/documents/${encodeURIComponent(canonicalId)}/sign`,
    { meaning: 'approved', reason: input.reason, password: input.password, mfaToken: input.totp },
    'The version was not approved.',
  );

// ── Who may take the next step ──────────────────────────────────────────────

/** Org roles that carry the regulatory-author grant the lifecycle route requires (server/middleware/auth.ts).
 *  P-18: an approver and a reviewer carry it as the manager and member they extend. */
const AUTHOR_ROLES = withExtendingRoles(['admin', 'owner', 'manager', 'member', 'editor', 'regulatory-author']);

/** Whether a session's roles are all known to carry no authoring grant. Unknown roles are left to the server. */
export function rolesCannotAuthor(sessionRoles: readonly string[]): boolean {
  const roles = sessionRoles.map((r) => String(r).toLowerCase());
  return roles.length > 0 && !roles.some((r) => AUTHOR_ROLES.includes(r));
}

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
  /** An organization admin may withdraw a route they did not send (the server decides). */
  admin?: boolean;
}

function stepOf(lifecycle: VaultVersionLifecycle | null | undefined): Step {
  const stage = lifecycle?.stage ?? null;
  if (!stage || stage === 'authoring') return 'send';
  if (stage !== 'in_review') return null;
  return lifecycle?.review ? 'approve' : 'review';
}

/**
 * The server's answer, never the client's role list: a manager was offered
 * "Sign review", gave a reason and a password, and was refused only then (403,
 * §11.10(g); QA 2026-10-08, walk 2, j3). Unknown (null) is left to the server.
 */
function signingRefusal(step: 'review' | 'approve', signing: VaultSigningPosture | null | undefined): string | null {
  if (signing?.canSign !== false) return null;
  return `Your role does not carry signing authority (21 CFR Part 11 §11.10(g)), so you cannot ${step === 'review' ? 'sign the review of' : 'approve'} this version.`;
}

/** The next step for this version, and why this user cannot take it (if so). */
function nextStep(
  lifecycle: VaultVersionLifecycle | null | undefined,
  me: Actor,
  uploaderId: number | null | undefined,
  signing?: VaultSigningPosture | null,
): { step: Step; blocked: string | null } {
  const step = stepOf(lifecycle);
  if (!step) return { step, blocked: null };
  if (me.cannotAuthor) return { step, blocked: 'Your role does not send, review or approve documents. An organization admin can change your role.' };
  if (step === 'send') return { step, blocked: null };
  const noAuthority = signingRefusal(step, signing);
  if (noAuthority) return { step, blocked: noAuthority };
  if (me.id === null) return { step, blocked: null };
  const act = step === 'review' ? 'reviews' : 'approves';
  if (uploaderId === me.id) return { step, blocked: `You uploaded this version, so a different person ${act} it.` };
  if (lifecycle?.creatorId === me.id) return { step, blocked: `You sent this version for review, so a different person ${act} it.` };
  if (step === 'approve' && lifecycle?.review?.signerId === me.id) {
    return { step, blocked: 'You signed the review, so a different person approves it.' };
  }
  return { step, blocked: null };
}

/**
 * Who may take a review or approval step, by name: the members with signing
 * authority, less the people separation of duties excludes for this version.
 * Null when the list was not read; then nothing is claimed.
 */
export function whoMaySign(
  step: Step,
  lifecycle: VaultVersionLifecycle | null | undefined,
  uploaderId: number | null | undefined,
  signing: VaultSigningPosture | null | undefined,
): string | null {
  if ((step !== 'review' && step !== 'approve') || !signing || signing.signers === null) return null;
  const excluded = new Set<number>(
    [uploaderId, lifecycle?.creatorId, step === 'approve' ? lifecycle?.review?.signerId : null]
      .filter((v): v is number => typeof v === 'number'),
  );
  const names = signing.signers.filter((s) => !excluded.has(s.id)).map((s) => s.name);
  const act = step === 'review' ? 'sign the review' : 'approve it';
  if (names.length === 0) {
    return `No one in this organization can ${act}: no member other than ${step === 'review' ? 'its uploader and the person who sent it' : 'its uploader, sender and reviewer'} holds a role with signing authority. An organization admin can give a member a role that carries it.`;
  }
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
  return `Not assigned to one person. Can ${act}: ${list}.`;
}

/** The signed-in account's id, as the round names it. */
const accountIdOf = (authUser: AuthUser | null): number | null => (authUser?.id && /^\d+$/.test(authUser.id) ? Number(authUser.id) : null);

function useActor(): { actor: Actor; authUser: AuthUser | null } {
  const authUser = useAuthUser();
  return {
    authUser,
    actor: {
      id: accountIdOf(authUser),
      cannotAuthor: rolesCannotAuthor(authUser?.roles ?? []),
      admin: (authUser?.roles ?? []).some((r) => String(r).toLowerCase() === 'admin'),
    },
  };
}

// ── The actions on the current version ──────────────────────────────────────

/**
 * What the approval dialog says about the file and the versions it supersedes.
 * On a route with more approvers (RR2, NEW-4), which approval the reader's is:
 * the version is approved by the last one.
 */
function approveMeta(supersedes: string[], share: { k: number; n: number } | null): string {
  const when = share && share.k < share.n ? 'once every named approver has signed' : 'when you sign';
  return (
    (share && share.n > 1 ? `Your approval is ${share.k} of ${share.n} required: the version is approved once every named approver has signed. ` : '') +
    "Your approval applies to this version's stored file as it is now. " +
    (supersedes.length > 0
      ? `${supersedes.join(', ')} ${supersedes.length === 1 ? 'becomes' : 'become'} superseded ${when}.`
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
    const result = review ? await signReview(canonicalId, input)
      : p.routed ? await approveOnRoute(canonicalId, input) : await approve(canonicalId, input);
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
          : approveMeta(p.supersedes, p.lifecycle?.round ? approvalShare(p.lifecycle.round, accountIdOf(authUser)) : null)) +
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
  /** Who may sign here, as the server read it with the versions. */
  signing?: VaultSigningPosture | null;
  /** Set by the actions: the step is on a named route (the approver signs on it). */
  routed?: boolean;
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

/** What a version on a named route offers this reader (RR1b). */
interface RoutedPlan {
  step: Step;
  blocked: string | null;
  form: RouteFormMode | null;
  acts: RouteAct[];
}

/**
 * The route acts this reader is offered: the sender (or an admin) withdraws;
 * the sender, or a member whose turn it is, returns it; and (RR3) a named
 * member who has not signed hands their own assignment back, whether or not
 * their step is open. The server decides each again.
 */
function routeActsFor(round: RouteRoundView, me: Actor, myTurn: boolean): RouteAct[] {
  if (me.cannotAuthor) return [];
  const sender = me.id !== null && round.route.senderId === me.id;
  const acts: RouteAct[] = [];
  if (sender || me.admin) acts.push('withdraw');
  if (sender || myTurn) acts.push('return');
  if (round.members.some((m) => m.userId === me.id && m.outcome === 'pending')) acts.push('hand-back');
  return acts;
}

/**
 * The plan for a version in review on its route: a named member whose turn it
 * is signs; the sender (or an admin) withdraws; the sender, or a member whose
 * turn it is, returns it. A withdrawn route signs nothing and is sent again;
 * a version in review with no route offers Name reviewers beside today's steps.
 */
function routedPlan(view: RouteView, me: Actor, signing: VaultSigningPosture | null | undefined): RoutedPlan | null {
  if (view.kind === 'withdrawn') return { step: null, blocked: null, form: me.cannotAuthor ? null : 'resend', acts: [] };
  if (view.kind !== 'live') return null;
  const { round } = view;
  const mine = round.members.find((m) => m.userId === me.id && m.stepOpen && m.outcome === 'pending') ?? null;
  const acts = routeActsFor(round, me, mine !== null);
  if (!mine) return { step: null, blocked: null, form: null, acts };
  const step = mine.role === 'reviewer' ? 'review' : 'approve';
  return { step, blocked: signingRefusal(step, signing), form: null, acts };
}

const FORM_LABEL: Record<RouteFormMode, string> = { send: 'Send for review', resend: 'Send again', name: 'Name reviewers' };
const ACT_LABEL: Record<RouteAct, string> = { withdraw: 'Withdraw', return: 'Return for revision', 'hand-back': 'Hand back' };

/**
 * The version's route, as it stands: every member and what each has done, or
 * that its reviewers could not be read, and its naming history. On any
 * version with a round; reminders and reassignment (RR3) only on the current
 * one, when the page can re-read it.
 */
export function VersionRoute({ lifecycle, title, current, vaultId, onChanged }: {
  lifecycle: VaultVersionLifecycle | null | undefined;
  title: string;
  current: boolean;
  vaultId?: string;
  /** Re-read the Vault after a reassignment. */
  onChanged?: () => void;
}) {
  const { actor } = useActor();
  const reassign = current && vaultId && onChanged && lifecycle?.canonicalId && !actor.cannotAuthor
    ? { vaultId, canonicalId: lifecycle.canonicalId, admin: Boolean(actor.admin), onChanged }
    : undefined;
  return <RouteRoundPanel view={routeView(lifecycle)} meId={actor.id} title={title} canRemind={current} reassign={reassign} />;
}

/** Everything the current version offers this reader, decided before anything renders. */
interface ActionPlan {
  view: RouteView;
  step: Step;
  blocked: string | null;
  /** Send again (a withdrawn route) or Name reviewers (in review with none). */
  secondaryForm: RouteFormMode | null;
  acts: RouteAct[];
  /** "Not assigned to one person": a version in review with no route only. */
  who: string | null;
  routed: boolean;
  reviewComplete: boolean;
}

/** The steps of a version with no live or withdrawn route: today's, and Name reviewers when it is in review with none. */
function unroutedPlan(view: RouteView, p: ActionProps, actor: Actor): RoutedPlan {
  const legacy = nextStep(p.lifecycle, actor, p.uploaderId, p.signing);
  // A version in review whose reviewers could not be read offers no step: the server decides who is named.
  const unreadInReview = view.kind === 'unread' && p.lifecycle?.stage === 'in_review';
  return {
    step: unreadInReview ? null : legacy.step,
    blocked: legacy.blocked,
    form: view.kind === 'legacy' && !actor.cannotAuthor ? 'name' : null,
    acts: [],
  };
}

function actionPlan(p: ActionProps, actor: Actor): ActionPlan {
  const view = routeView(p.lifecycle);
  const routed = routedPlan(view, actor, p.signing);
  const plan = routed ?? unroutedPlan(view, p, actor);
  const step: Step = plan.step;
  return {
    view,
    step,
    blocked: plan.blocked,
    secondaryForm: plan.form,
    acts: plan.acts,
    who: view.kind === 'legacy' && step ? whoMaySign(step, p.lifecycle, p.uploaderId, p.signing) : null,
    routed: routed !== null,
    reviewComplete: (view.kind === 'live' || view.kind === 'withdrawn') && view.round.reviewComplete,
  };
}

function ActionButtons({ plan, p, onStep, onForm, onAct }: {
  plan: ActionPlan;
  p: ActionProps;
  onStep: (step: Exclude<Step, null>) => void;
  onForm: (mode: RouteFormMode) => void;
  onAct: (act: RouteAct) => void;
}) {
  const { step, secondaryForm } = plan;
  const label = step === 'send' ? 'Send for review' : step === 'review' ? 'Sign review' : 'Approve';
  const named = `${p.title} ${p.versionLabel}`;
  return (
    <>
      {step && (
        <button className="sp-ask" disabled={plan.blocked !== null} onClick={() => onStep(step)} aria-label={`${label}: ${named}`}>
          {label}
        </button>
      )}
      {secondaryForm && (
        <button className="sp-ask" onClick={() => onForm(secondaryForm)} aria-label={`${FORM_LABEL[secondaryForm]}: ${named}`}>
          {FORM_LABEL[secondaryForm]}
        </button>
      )}
      {plan.acts.map((a) => (
        <button key={a} className="sp-ask" onClick={() => onAct(a)} aria-label={`${ACT_LABEL[a]}: ${named}`}>
          {ACT_LABEL[a]}
        </button>
      ))}
    </>
  );
}

export function VersionLifecycleActions(p: ActionProps) {
  const { actor, authUser } = useActor();
  const [signing, setSigning] = useState<'review' | 'approve' | null>(null);
  const [form, setForm] = useState<RouteFormMode | null>(null);
  const [act, setAct] = useState<RouteAct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [annotationNote, setAnnotationNote] = useState<string | undefined>(undefined);
  const plan = actionPlan(p, actor);
  if (!plan.step && !plan.secondaryForm && plan.acts.length === 0) return null;

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
  const changed = () => {
    setForm(null);
    setAct(null);
    p.onChanged();
  };
  return (
    <span className="vd-ver-acts">
      <ActionButtons plan={plan} p={p} onForm={setForm} onAct={setAct}
        onStep={(step) => (step === 'send' ? setForm('send') : void openSignOff(step))} />
      {plan.blocked ? <span className="vd-ver-m">{plan.blocked}</span> : null}
      {plan.who ? <span className="vd-ver-m" data-testid="vault-who-may-sign">{plan.who}</span> : null}
      {plan.view.kind === 'withdrawn' ? <span className="vd-ver-m">This route was withdrawn: nothing is signed on this version until a new route is sent.</span> : null}
      {error ? <span className="vd-dr-err" role="alert">{error}</span> : null}
      {signing && (
        <SignOffDialog signing={signing} p={{ ...p, routed: plan.routed }} authUser={authUser} annotationNote={annotationNote} onClose={() => setSigning(null)} />
      )}
      {form && (
        <RouteForm mode={form} vaultId={p.vaultId} canonicalId={p.lifecycle?.canonicalId ?? null} title={p.title} versionLabel={p.versionLabel}
          hashPrefix={p.contentHash ? p.contentHash.slice(0, 12) : null} onClose={() => setForm(null)} onSent={changed} />
      )}
      {act && p.lifecycle && (
        <RouteActDialog act={act} canonicalId={p.lifecycle.canonicalId} title={`${p.title} ${p.versionLabel}`.trim()}
          reviewComplete={plan.reviewComplete} onClose={() => setAct(null)} onDone={changed} />
      )}
    </span>
  );
}

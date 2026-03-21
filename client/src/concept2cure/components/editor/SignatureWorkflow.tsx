/**
 * SignatureWorkflow — 21 CFR Part 11 compliant e-signature dialog for documents.
 *
 * Captures signer identity, meaning, password verification, and optional MFA.
 * Computes SHA-256 document hash and submits to /api/part11/signatures.
 * Displays existing signatures with verification details.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  Loader2,
  X,
  CheckCircle,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  FileDigit,
  User,
  Briefcase,
  Clock,
  Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCurrentUser } from '../../utils/getCurrentUser';

// ── Types ──────────────────────────────────────────────────────────────────────

type SignatureMeaning =
  | 'approval'
  | 'review'
  | 'authorship'
  | 'verification'
  | 'authorization'
  | 'acknowledgment'
  | 'responsibility';

interface ExistingSignature {
  id: string;
  signerName: string;
  signerTitle: string;
  meaning: string;
  signedAt: string;
  signatureHash: string;
  revoked: boolean;
}

export interface SignatureWorkflowProps {
  open: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
  documentVersion: number;
  documentContent: string;
  documentStatus?: string;
  onSignatureComplete?: (signature: ExistingSignature) => void;
}

export interface SignatureListProps {
  documentId: string;
  signatures: ExistingSignature[];
  loading?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const SIGNATURE_MEANINGS: { value: SignatureMeaning; label: string; description: string }[] = [
  { value: 'approval', label: 'Approved', description: 'I approve this document for release or next stage' },
  { value: 'review', label: 'Reviewed', description: 'I have reviewed this document thoroughly' },
  { value: 'authorship', label: 'Authored', description: 'I am the author or co-author of this document' },
  { value: 'verification', label: 'Verified', description: 'I have verified the data and content accuracy' },
  { value: 'authorization', label: 'Authorized', description: 'I authorize this document for its intended purpose' },
  { value: 'acknowledgment', label: 'Acknowledged', description: 'I acknowledge receipt and understanding' },
  { value: 'responsibility', label: 'Responsible', description: 'I take responsibility for the content' },
];

function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function computeDocumentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── SignatureWorkflow Dialog ───────────────────────────────────────────────────

export function SignatureWorkflow({
  open,
  onClose,
  documentId,
  documentTitle,
  documentVersion,
  documentContent,
  documentStatus,
  onSignatureComplete,
}: SignatureWorkflowProps) {
  const user = getCurrentUser();

  const [meaning, setMeaning] = useState<SignatureMeaning>('approval');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signerTitle, setSignerTitle] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [legalAcknowledged, setLegalAcknowledged] = useState(false);

  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [documentHash, setDocumentHash] = useState<string>('');

  // Compute document hash on open
  useEffect(() => {
    if (open && documentContent) {
      computeDocumentHash(documentContent).then(setDocumentHash);
    }
  }, [open, documentContent]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setPassword('');
      setMfaToken('');
      setLegalAcknowledged(false);
      setError(null);
      setSuccess(false);
      setSigning(false);
    }
  }, [open]);

  const canSign = useMemo(
    () => password.length >= 6 && legalAcknowledged && signerTitle.trim().length > 0,
    [password, legalAcknowledged, signerTitle],
  );

  const handleSign = useCallback(async () => {
    if (!canSign) return;
    setSigning(true);
    setError(null);

    try {
      const res = await fetch('/api/part11/signatures', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          documentId,
          documentVersion,
          documentContent,
          signerId: user.id,
          signerName: user.name,
          signerTitle: signerTitle.trim(),
          signerOrganization: 'ClinicalSageAI',
          meaning,
          password,
          ...(mfaToken ? { mfaToken } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || body?.message || `Signature failed (${res.status})`);
      }

      const data = await res.json();
      setSuccess(true);

      if (onSignatureComplete && data?.data?.signature) {
        const sig = data.data.signature;
        onSignatureComplete({
          id: sig.id,
          signerName: user.name,
          signerTitle: signerTitle.trim(),
          meaning,
          signedAt: sig.signedAt || new Date().toISOString(),
          signatureHash: sig.signatureHash || documentHash,
          revoked: false,
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Signature failed');
    } finally {
      setSigning(false);
    }
  }, [canSign, documentId, documentVersion, documentContent, user, signerTitle, meaning, password, mfaToken, documentHash, onSignatureComplete]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 bg-gradient-to-r from-indigo-50 to-violet-50">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-800">Electronic Signature</h2>
              <p className="text-[10px] text-zinc-500">21 CFR Part 11 Compliant</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-200 transition-colors">
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        {success ? (
          /* Success state */
          <div className="p-8 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-zinc-800 mb-1">Document Signed</h3>
            <p className="text-sm text-zinc-500 mb-2">
              Your electronic signature has been applied and recorded.
            </p>
            <div className="bg-zinc-50 rounded-lg p-3 text-left text-xs text-zinc-600 space-y-1">
              <div className="flex justify-between">
                <span className="text-zinc-400">Document</span>
                <span className="font-medium truncate ml-2">{documentTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Meaning</span>
                <span className="font-medium">{SIGNATURE_MEANINGS.find(m => m.value === meaning)?.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Hash</span>
                <span className="font-mono text-[10px]">{documentHash.slice(0, 16)}...</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          /* Signing form */
          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Document info */}
            <div className="bg-zinc-50 rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-zinc-400">Document</span>
                <span className="font-medium text-zinc-700 truncate ml-2">{documentTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Version</span>
                <span className="font-medium text-zinc-700">v{documentVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">SHA-256</span>
                <span className="font-mono text-[10px] text-zinc-500">
                  {documentHash ? `${documentHash.slice(0, 24)}...` : 'Computing...'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Status</span>
                <span className="font-medium text-zinc-700 capitalize">{documentStatus || 'draft'}</span>
              </div>
            </div>

            {/* Signer identity */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 mb-1">
                <User className="w-3 h-3" /> Signer
              </label>
              <div className="text-sm font-medium text-zinc-800">{user.name}</div>
              <div className="text-xs text-zinc-400">{user.email}</div>
            </div>

            {/* Title / Role */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 mb-1">
                <Briefcase className="w-3 h-3" /> Title / Role
              </label>
              <input
                type="text"
                value={signerTitle}
                onChange={e => setSignerTitle(e.target.value)}
                placeholder="e.g. QA Lead, Medical Writer, VP Regulatory"
                className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
              />
            </div>

            {/* Signature meaning */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 mb-1">
                <FileDigit className="w-3 h-3" /> Signature Meaning (§11.50)
              </label>
              <select
                value={meaning}
                onChange={e => setMeaning(e.target.value as SignatureMeaning)}
                className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none bg-white"
              >
                {SIGNATURE_MEANINGS.map(m => (
                  <option key={m.value} value={m.value}>
                    {m.label} — {m.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Password verification */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 mb-1">
                <Lock className="w-3 h-3" /> Password Verification (§11.100)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your account password"
                  className="w-full px-3 py-2 pr-9 text-sm border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* MFA (optional) */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 mb-1">
                <Hash className="w-3 h-3" /> MFA Code <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                type="text"
                value={mfaToken}
                onChange={e => setMfaToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                maxLength={6}
                className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none font-mono tracking-widest"
              />
            </div>

            {/* Legal acknowledgment */}
            <label className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={legalAcknowledged}
                onChange={e => setLegalAcknowledged(e.target.checked)}
                className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-200"
              />
              <span className="text-xs text-amber-800 leading-relaxed">
                I understand that this electronic signature is the legally binding equivalent of
                my handwritten signature, and that all signing activities are recorded in a
                tamper-evident audit trail per 21 CFR Part 11 §11.70.
              </span>
            </label>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSign}
                disabled={!canSign || signing}
                className={cn(
                  'flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-all',
                  canSign && !signing
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                    : 'bg-zinc-200 text-zinc-400 cursor-not-allowed',
                )}
              >
                {signing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                {signing ? 'Signing...' : 'Apply Signature'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SignatureList — Shows existing signatures on a document ─────────────────

export function SignatureList({ documentId, signatures, loading }: SignatureListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-zinc-400">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-xs">Loading signatures...</span>
      </div>
    );
  }

  if (signatures.length === 0) {
    return (
      <div className="text-center py-6">
        <Shield className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
        <p className="text-xs text-zinc-400">No signatures yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {signatures.map(sig => (
        <div
          key={sig.id}
          className={cn(
            'p-3 rounded-lg border text-xs',
            sig.revoked
              ? 'bg-red-50 border-red-200'
              : 'bg-emerald-50 border-emerald-200',
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className={cn('w-3.5 h-3.5', sig.revoked ? 'text-red-500' : 'text-emerald-600')} />
              <span className="font-medium text-zinc-700">{sig.signerName}</span>
            </div>
            <span className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-medium',
              sig.revoked
                ? 'bg-red-100 text-red-700'
                : 'bg-emerald-100 text-emerald-700',
            )}>
              {sig.revoked ? 'REVOKED' : 'VALID'}
            </span>
          </div>
          <div className="text-zinc-500 space-y-0.5">
            <div className="flex items-center gap-1">
              <Briefcase className="w-3 h-3" />
              {sig.signerTitle}
            </div>
            <div className="flex items-center gap-1">
              <FileDigit className="w-3 h-3" />
              Meaning: <span className="capitalize font-medium">{sig.meaning}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(sig.signedAt).toLocaleString()}
            </div>
            <div className="flex items-center gap-1 font-mono text-[10px] text-zinc-400">
              <Hash className="w-3 h-3" />
              {sig.signatureHash.slice(0, 20)}...
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default SignatureWorkflow;

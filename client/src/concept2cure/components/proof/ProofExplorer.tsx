/**
 * Proof Explorer
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProofExplorerProps {
  workflowRunId: string;
  className?: string;
}

interface ProofCertificateView {
  certificateId: string;
  workflowRunId: string;
  generatedAt: string;
  submissionType: string;
  proof: {
    pathProof: { proofId: string } | null;
    authorizationProofs: Array<{ proofId: string; type: string }>;
    documentIntegrityProof: { merkleRoot: string };
  };
}

export const ProofExplorer: React.FC<ProofExplorerProps> = ({ workflowRunId, className }) => {
  const [proof, setProof] = useState<ProofCertificateView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verification, setVerification] = useState<null | {
    valid: boolean;
    verificationTimeMs: number;
    failures?: Array<{ type: string; reason: string }>;
  }>(null);

  useEffect(() => {
    let isMounted = true;

    const loadCertificate = async () => {
      try {
        setError(null);
        setIsLoading(true);
        const response = await fetch(`/api/workflow/proofs/certificate/${workflowRunId}`);
        if (!response.ok) {
          throw new Error('Failed to load certificate');
        }
        const payload = await response.json().catch(() => ({}));
        if (payload?.success === false) {
          throw new Error(payload?.error?.message || payload?.error || 'Failed to load certificate');
        }
        const data = payload?.data ?? payload;
        if (isMounted) setProof(data);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unable to load proof');
          setProof(null);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadCertificate();

    return () => {
      isMounted = false;
    };
  }, [workflowRunId]);

  if (error) {
    return (
      <div
        role="alert"
        className={cn('rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700', className)}
      >
        {error}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn('rounded-xl border bg-white p-6 shadow-sm', className)}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-1/3 rounded bg-zinc-200" />
          <div className="h-3 w-1/2 rounded bg-zinc-100" />
          <div className="h-24 rounded bg-zinc-100" />
        </div>
      </div>
    );
  }

  if (!proof) return null;

  return (
    <div className={cn('rounded-2xl border bg-white p-6 shadow-sm', className)}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Proof Certificate</h2>
          <p className="text-sm text-gray-500">Run {proof.workflowRunId}</p>
        </div>
        {verification ? (
          <span
            className={cn(
              'flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium',
              verification.valid
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            )}
            role="status"
            aria-live="polite"
          >
            <CheckCircle2 size={16} />
            {verification.valid ? 'Verified' : 'Verification Failed'}
          </span>
        ) : (
          <span
            className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600"
            role="status"
            aria-live="polite"
          >
            <CheckCircle2 size={16} />
            Verification Pending
          </span>
        )}
      </header>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Execution Proof</p>
          <p className="mt-1 text-sm font-medium text-gray-800">{proof.proof.pathProof?.proofId}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Integrity Root</p>
          <p className="mt-1 text-sm font-medium text-gray-800">{proof.proof.documentIntegrityProof.merkleRoot}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Authorizations</p>
          <p className="mt-1 text-sm font-medium text-gray-800">
            {proof.proof.authorizationProofs.length} proofs
          </p>
        </div>
      </section>

      <section className="mt-6 flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-800">Verification</p>
          <p className="text-xs text-zinc-500">
            {verification
              ? `Status: ${verification.valid ? 'Valid' : 'Invalid'} • ${verification.verificationTimeMs}ms`
              : 'Run verification to confirm proof validity.'}
          </p>
          {verification?.failures?.length ? (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {verification.failures.map(f => `${f.type}: ${f.reason}`).join(' • ')}
            </p>
          ) : null}
        </div>
        <button
          onClick={async () => {
            if (!proof) return;
            setIsVerifying(true);
            try {
              const response = await fetch('/api/workflow/proofs/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(proof),
              });
              if (!response.ok) throw new Error('Verification failed');
              const payload = await response.json().catch(() => ({}));
              if (payload?.success === false) {
                throw new Error(payload?.error?.message || payload?.error || 'Verification failed');
              }
              const result = payload?.data ?? payload;
              setVerification(result);
            } catch (err) {
              setVerification({
                valid: false,
                verificationTimeMs: 0,
                failures: [{ type: 'VERIFY', reason: err instanceof Error ? err.message : 'Unknown error' }],
              });
            } finally {
              setIsVerifying(false);
            }
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          disabled={isVerifying}
          aria-busy={isVerifying}
          aria-live="polite"
        >
          {isVerifying ? 'Verifying…' : 'Verify Proof'}
        </button>
      </section>
    </div>
  );
};

export default ProofExplorer;

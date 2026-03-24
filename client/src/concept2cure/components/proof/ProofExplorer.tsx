/**
 * Proof Explorer
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';
import { DataStateWrapper, InlineLoading } from '@/components/ui/statesV2';

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
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verification, setVerification] = useState<null | {
    valid: boolean;
    verificationTimeMs: number;
    failures?: Array<{ type: string; reason: string }>;
  }>(null);

  const { data: proof, isLoading, error } = useQuery<ProofCertificateView>({
    queryKey: queryKeys.proof.certificate(workflowRunId),
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/workflow/proofs/certificate/${workflowRunId}`);
      const payload = await response.json().catch(() => ({}));
      if (payload?.success === false) {
        throw new Error(payload?.error?.message || payload?.error || 'Failed to load certificate');
      }
      return payload?.data ?? payload;
    },
    enabled: !!workflowRunId,
  });

  const handleVerify = async () => {
    if (!proof) return;
    setIsVerifying(true);
    try {
      const response = await apiRequest('POST', '/api/workflow/proofs/verify', proof);
      const payload = await response.json().catch(() => ({}));
      if (payload?.success === false) {
        throw new Error(payload?.error?.message || payload?.error || 'Verification failed');
      }
      setVerification(payload?.data ?? payload);
    } catch (err) {
      setVerification({
        valid: false,
        verificationTimeMs: 0,
        failures: [{ type: 'VERIFY', reason: err instanceof Error ? err.message : 'Unknown error' }],
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <DataStateWrapper<ProofCertificateView>
      isLoading={isLoading}
      error={error}
      data={proof ?? undefined}
      emptyTitle="No Proof Available"
      emptyDescription="No proof certificate found for this workflow run."
      testId="proof-explorer"
    >
      {(proofData) => (
        <div className={cn('rounded-xl border bg-white p-6 shadow-sm', className)}>
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Proof Certificate</h2>
              <p className="text-sm text-zinc-500">Run {proofData.workflowRunId}</p>
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
                className="flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-600"
                role="status"
                aria-live="polite"
              >
                <CheckCircle2 size={16} />
                Verification Pending
              </span>
            )}
          </header>

          <section className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Execution Proof</p>
              <p className="mt-1 text-sm font-medium text-zinc-900">{proofData.proof.pathProof?.proofId}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Integrity Root</p>
              <p className="mt-1 text-sm font-medium text-zinc-900">{proofData.proof.documentIntegrityProof.merkleRoot}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Authorizations</p>
              <p className="mt-1 text-sm font-medium text-zinc-900">
                {proofData.proof.authorizationProofs.length} proofs
              </p>
            </div>
          </section>

          <section className="mt-6 flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-900">Verification</p>
              <p className="text-xs text-zinc-500">
                {verification
                  ? `Status: ${verification.valid ? 'Valid' : 'Invalid'} \u2022 ${verification.verificationTimeMs}ms`
                  : 'Run verification to confirm proof validity.'}
              </p>
              {verification?.failures?.length ? (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {verification.failures.map(f => `${f.type}: ${f.reason}`).join(' \u2022 ')}
                </p>
              ) : null}
            </div>
            <button
              onClick={handleVerify}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
              disabled={isVerifying}
              aria-busy={isVerifying}
              aria-live="polite"
            >
              {isVerifying ? <><InlineLoading label="Verifying" testId="verify-loading" /> Verifying…</> : 'Verify Proof'}
            </button>
          </section>
        </div>
      )}
    </DataStateWrapper>
  );
};

export default ProofExplorer;

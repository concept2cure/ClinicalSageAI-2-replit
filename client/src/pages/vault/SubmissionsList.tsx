import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';

const fetchSubmissions = async () => {
  const token = localStorage.getItem('authToken') || localStorage.getItem('token') || 'demo-token';
  const response = await fetch('/api/vault/submissions', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to fetch submissions');
  }

  return response.json();
};

export default function SubmissionsList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['vault-submissions'],
    queryFn: fetchSubmissions,
  });

  const submissions = data?.data || [];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Liquid CER Submissions</h1>
          <p className="text-sm text-slate-500">Browse recent 510(k) submissions with Liquid CER data.</p>
        </div>
        <Link href="/vault">
          <span className="text-sm font-medium text-indigo-600 hover:text-indigo-500">Back to Vault</span>
        </Link>
      </div>

      {isLoading && <div className="text-sm text-slate-500">Loading submissions...</div>}
      {error && (
        <div className="text-sm text-red-600">
          {(error as Error).message || 'Failed to load submissions.'}
        </div>
      )}

      {!isLoading && submissions.length === 0 && (
        <div className="text-sm text-slate-500">No submissions found yet.</div>
      )}

      <div className="space-y-3">
        {submissions.map((submission: any) => (
          <div
            key={submission.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {submission.deviceName || 'Unnamed Device'}
              </p>
              <p className="text-xs text-slate-500">
                {submission.manufacturerName || 'Unknown Manufacturer'} · {submission.submissionId}
              </p>
            </div>
            <Link href={`/cerv2/${submission.id}`}>
              <span className="text-xs font-semibold text-indigo-600 hover:text-indigo-500">
                Open CERV2 →
              </span>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * ClaimsView - Simplified unified linking interface
 * Shows claims with ability to create new ones and link evidence
 */

import React from 'react';
import { Plus, Link2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useClaims, useCreateClaim, useUpdateClaimStatus } from '../../hooks/useCERv2Queries';

export default function ClaimsView({ programId, onSelect }) {
  const [error, setError] = React.useState('');
  const [claimText, setClaimText] = React.useState('');
  const [claimType, setClaimType] = React.useState('');
  const [showCreateForm, setShowCreateForm] = React.useState(false);

  const { data, isLoading, error: listError } = useClaims(programId, { enabled: Boolean(programId) });
  const createClaim = useCreateClaim(programId);
  const updateStatus = useUpdateClaimStatus(programId);
  const claims = data?.data || [];

  React.useEffect(() => {
    if (listError) {
      setError(listError?.message || 'Failed to load claims.');
    }
  }, [listError]);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!claimText.trim()) return;
    try {
      await createClaim.mutateAsync({ claimText: claimText.trim(), claimType: claimType || undefined });
      setClaimText('');
      setClaimType('');
      setShowCreateForm(false);
    } catch (err) {
      setError(err?.message || 'Failed to create claim.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Claims</h1>
          <p className="text-sm text-slate-500 mt-1">
            Define product claims and link supporting evidence
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Claim
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Create New Claim</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Claim Text
              </label>
              <textarea
                value={claimText}
                onChange={(e) => setClaimText(e.target.value)}
                placeholder="Enter your claim statement..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Type (optional)
              </label>
              <input
                value={claimType}
                onChange={(e) => setClaimType(e.target.value)}
                placeholder="e.g., safety, efficacy, performance"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Claim
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setClaimText('');
                  setClaimType('');
                }}
                className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Claims List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            All Claims ({claims.length})
          </h3>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="animate-spin h-8 w-8 border-4 border-slate-200 border-t-blue-600 rounded-full mx-auto mb-3"></div>
            Loading claims...
          </div>
        ) : claims.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <div className="text-slate-600 font-medium mb-1">No claims yet</div>
            <div className="text-sm text-slate-500 mb-4">Create your first claim to get started</div>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create First Claim
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {claims.map((claim) => (
              <div
                key={claim.claimId}
                className="flex items-start gap-4 p-4 border-2 border-transparent hover:border-blue-200 rounded-lg bg-slate-50 transition-all"
              >
                <div className="flex-1">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-900">
                        {claim.claimText}
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-slate-500">
                          Type: {claim.claimType || '—'}
                        </span>
                        <span className="text-xs text-slate-400">·</span>
                        <select
                          value={claim.status || 'draft'}
                          onChange={(event) =>
                            updateStatus.mutate({
                              claimId: claim.claimId,
                              status: event.target.value,
                            })
                          }
                          className="text-xs rounded-full border border-slate-200 px-2 py-0.5"
                        >
                          <option value="draft">draft</option>
                          <option value="validated">validated</option>
                          <option value="pending">pending</option>
                        </select>
                      </div>
                    </div>
                    {claim.needsReview && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded">
                        <AlertCircle className="h-3 w-3" />
                        Needs Review
                      </div>
                    )}
                  </div>
                </div>
                <button
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                  onClick={() => onSelect?.({ type: 'CLAIM', data: claim })}
                >
                  <Link2 className="h-4 w-4" />
                  Link Evidence
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

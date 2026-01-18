/**
 * OutcomesView - Simplified clinical outcomes view
 */

import React from 'react';
import { Target, Link2, CheckCircle2 } from 'lucide-react';
import { useOutcomes, useUpdateOutcomeStatus } from '../../hooks/useCERv2Queries';

export default function OutcomesView({ programId, onSelect }) {
  const [error, setError] = React.useState('');
  const { data, isLoading, error: listError } = useOutcomes(programId, { enabled: Boolean(programId) });
  const updateStatus = useUpdateOutcomeStatus(programId);
  const outcomes = data?.data || [];

  React.useEffect(() => {
    if (listError) {
      setError(listError?.message || 'Failed to load outcomes.');
    }
  }, [listError]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Clinical Outcomes</h1>
        <p className="text-sm text-slate-500 mt-1">
          Clinical endpoints and outcomes with evidence substantiation
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Outcomes List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            All Outcomes ({outcomes.length})
          </h3>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="animate-spin h-8 w-8 border-4 border-slate-200 border-t-blue-600 rounded-full mx-auto mb-3"></div>
            Loading outcomes...
          </div>
        ) : outcomes.length === 0 ? (
          <div className="p-12 text-center">
            <Target className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <div className="text-slate-600 font-medium mb-1">No outcomes yet</div>
            <div className="text-sm text-slate-500">Outcomes will appear here when configured</div>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {outcomes.map((outcome) => (
              <div
                key={outcome.outcomeId}
                className="flex items-start gap-4 p-4 border-2 border-transparent hover:border-blue-200 rounded-lg bg-slate-50 transition-all"
              >
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-900">
                    {outcome.name}
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-slate-500">
                      Timepoint: {outcome.timepoint || '—'}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <select
                      value={outcome.status || 'pending'}
                      onChange={(event) =>
                        updateStatus.mutate({
                          outcomeId: outcome.outcomeId,
                          status: event.target.value,
                        })
                      }
                      className="text-xs rounded-full border border-slate-200 px-2 py-0.5"
                    >
                      <option value="missing">missing</option>
                      <option value="pending">pending</option>
                      <option value="substantiated">substantiated</option>
                    </select>
                  </div>
                </div>
                <button
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                  onClick={() => onSelect?.({ type: 'OUTCOME', data: outcome })}
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

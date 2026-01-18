import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getCoverage, getReadiness } from '@/api/cerv2Workbench';

export default function WorkbenchOverview({ programId }) {
  const navigate = useNavigate();
  const [readiness, setReadiness] = React.useState(null);
  const [coverage, setCoverage] = React.useState(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!programId) return;
    getReadiness(programId)
      .then((payload) => setReadiness(payload.data))
      .catch((err) => setError(err?.message || 'Failed to load readiness.'));
    getCoverage(programId)
      .then((payload) => setCoverage(payload.data))
      .catch((err) => setError(err?.message || 'Failed to load coverage.'));
  }, [programId]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-900">Program Overview</div>
        <div className="mt-2 text-xs text-slate-500">
          Program ID: <span className="font-semibold text-slate-700">{programId}</span>
        </div>
        <div className="mt-4 text-xs text-slate-600">
          Use the Evidence Library to upload, organize, and tag the full evidence stack for your submission.
        </div>
        {coverage?.blockers?.length ? (
          <ul className="mt-3 list-disc pl-4 text-xs text-amber-600">
            {coverage.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-900">Readiness</div>
        {error && (
          <div className="mt-2 text-xs text-rose-500">{error}</div>
        )}
        {readiness ? (
          <div className="mt-3">
            <div className="text-2xl font-semibold text-slate-900">{readiness.score}%</div>
            <div className="mt-2 text-xs text-slate-500">
              Evidence files: {readiness.signals?.evidenceCount || 0}
            </div>
            <div className="text-xs text-slate-500">
              Evidence links: {readiness.signals?.linksCount || 0}
            </div>
            {readiness.blockers?.length ? (
              <ul className="mt-2 list-disc pl-4 text-xs text-amber-600">
                {readiness.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 text-xs text-slate-500">Loading readiness…</div>
        )}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-900">Coverage</div>
        {coverage ? (
          <div className="mt-3 space-y-3">
            {/* Claims Coverage - Clickable */}
            <button
              onClick={() => navigate(`/cerv2/programs/${programId}/claims?filter=missing-evidence`)}
              className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">Claims coverage</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {coverage.coverage?.claims?.percent || 0}%
                  </div>
                  <div className="text-xs text-slate-600">
                    {coverage.coverage?.claims?.covered || 0} / {coverage.coverage?.claims?.total || 0}
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
              </div>
            </button>

            {/* Standards - Clickable */}
            <button
              onClick={() => navigate(`/cerv2/programs/${programId}/standards?filter=missing-evidence`)}
              className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">Standards satisfied</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {coverage.coverage?.standards?.percent || 0}%
                  </div>
                  <div className="text-xs text-slate-600">
                    {coverage.coverage?.standards?.requirementsSatisfied || 0} /{' '}
                    {coverage.coverage?.standards?.requirementsTotal || 0}
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
              </div>
            </button>

            {/* Outcomes - Clickable */}
            <button
              onClick={() => navigate(`/cerv2/programs/${programId}/outcomes?filter=incomplete`)}
              className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">Outcomes substantiated</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {coverage.coverage?.outcomes?.percent || 0}%
                  </div>
                  <div className="text-xs text-slate-600">
                    {coverage.coverage?.outcomes?.substantiated || 0} /{' '}
                    {coverage.coverage?.outcomes?.total || 0}
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
              </div>
            </button>

            {(coverage.coverage?.claims?.needsReview ||
              coverage.coverage?.standards?.needsReview ||
              coverage.coverage?.outcomes?.needsReview) && (
              <div className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700">
                Needs review flagged
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 text-xs text-slate-500">Loading coverage…</div>
        )}
      </div>
    </div>
  );
}

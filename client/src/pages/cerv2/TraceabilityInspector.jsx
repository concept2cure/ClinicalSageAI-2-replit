import React from 'react';
import { useBulkLinkEvidence, useBulkUnlinkEvidence, useEvidence } from '../../hooks/useCERv2Queries';
import { evidenceApi } from '../../lib/cerv2WorkbenchContract';

const ENTITY_LABELS = {
  CLAIM: 'Claim',
  STANDARD_REQUIREMENT: 'Standard Requirement',
  OUTCOME: 'Outcome',
};

export default function TraceabilityInspector({ programId, entity }) {
  const [evidence, setEvidence] = React.useState([]);
  const [linkedIds, setLinkedIds] = React.useState(new Set());
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [busyId, setBusyId] = React.useState('');
  const [bulkMode, setBulkMode] = React.useState(false);
  const [selectedEvidenceIds, setSelectedEvidenceIds] = React.useState(new Set());

  const entityId =
    entity?.data?.id ||
    entity?.data?.claimId ||
    entity?.data?.standardId ||
    entity?.data?.outcomeId ||
    '';

  const { data, isLoading } = useEvidence(programId, {});
  const bulkLink = useBulkLinkEvidence(programId);
  const bulkUnlink = useBulkUnlinkEvidence(programId);

  React.useEffect(() => {
    setEvidence(data?.data || []);
  }, [data]);

  React.useEffect(() => {
    if (!programId || !entity || !entityId) return;
    setError('');
    evidenceApi
      .listLinks(programId, { entityType: entity.type, entityId })
      .then((linksPayload) => {
        setLinkedIds(new Set((linksPayload.data || []).map(String)));
      })
      .catch((err) => setError(err?.message || 'Failed to load evidence links.'));
  }, [programId, entity, entityId]);

  React.useEffect(() => {
    setSelectedEvidenceIds(new Set());
    setBulkMode(false);
  }, [entityId, entity?.type]);

  if (!entity) {
    return (
      <div className="text-xs text-slate-500">
        Select a claim, requirement, or outcome to manage evidence links.
      </div>
    );
  }

  const title = ENTITY_LABELS[entity.type] || 'Entity';

  const filteredEvidence = evidence.filter((item) =>
    item.name?.toLowerCase().includes(search.trim().toLowerCase())
  );

  const toggleLink = async (item) => {
    if (!entityId) return;
    setBusyId(item.evidenceId);
    try {
      if (linkedIds.has(String(item.evidenceId))) {
        await bulkUnlink.mutateAsync({
          evidenceIds: [item.evidenceId],
          entityType: entity.type,
          entityId,
        });
        const next = new Set(linkedIds);
        next.delete(String(item.evidenceId));
        setLinkedIds(next);
      } else {
        await bulkLink.mutateAsync({
          evidenceIds: [item.evidenceId],
          entityType: entity.type,
          entityId,
        });
        const next = new Set(linkedIds);
        next.add(String(item.evidenceId));
        setLinkedIds(next);
      }
    } catch (err) {
      setError(err?.message || 'Failed to update evidence link.');
    } finally {
      setBusyId('');
    }
  };

  const toggleSelected = (evidenceId) => {
    const next = new Set(selectedEvidenceIds);
    if (next.has(evidenceId)) {
      next.delete(evidenceId);
    } else {
      next.add(evidenceId);
    }
    setSelectedEvidenceIds(next);
  };

  const handleBulkLink = async () => {
    if (!entityId || selectedEvidenceIds.size === 0) return;
    try {
      await bulkLink.mutateAsync({
        evidenceIds: Array.from(selectedEvidenceIds),
        entityType: entity.type,
        entityId,
      });
      setSelectedEvidenceIds(new Set());
    } catch (err) {
      setError(err?.message || 'Failed to bulk link evidence.');
    }
  };

  const handleBulkUnlink = async () => {
    if (!entityId || selectedEvidenceIds.size === 0) return;
    try {
      await bulkUnlink.mutateAsync({
        evidenceIds: Array.from(selectedEvidenceIds),
        entityType: entity.type,
        entityId,
      });
      setSelectedEvidenceIds(new Set());
    } catch (err) {
      setError(err?.message || 'Failed to bulk unlink evidence.');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</div>
        <div className="mt-1 text-sm font-semibold text-slate-900">{entity.data?.name || entity.data?.claimText || entity.data?.requirement || 'Selected item'}</div>
        {entity.data?.needsReview ? (
          <div className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700">
            Needs Review
          </div>
        ) : null}
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-500">Evidence links</div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search evidence"
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
        />
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
          <button
            type="button"
            onClick={() => setBulkMode((prev) => !prev)}
            className="font-semibold text-indigo-600 hover:text-indigo-700"
          >
            {bulkMode ? 'Exit bulk mode' : 'Bulk link mode'}
          </button>
          {bulkMode ? (
            <span>{selectedEvidenceIds.size} selected</span>
          ) : null}
        </div>
        {bulkMode ? (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleBulkLink}
              disabled={selectedEvidenceIds.size === 0}
              className="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              Link selected
            </button>
            <button
              type="button"
              onClick={handleBulkUnlink}
              disabled={selectedEvidenceIds.size === 0}
              className="rounded-lg bg-rose-600 px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              Unlink selected
            </button>
          </div>
        ) : null}
        {error ? <div className="mt-2 text-xs text-rose-500">{error}</div> : null}
        <div className="mt-3 space-y-2 max-h-[420px] overflow-y-auto">
          {isLoading ? (
            <div className="text-xs text-slate-400">Loading evidence...</div>
          ) : filteredEvidence.length ? (
            filteredEvidence.map((item) => (
              <div key={item.evidenceId} className="rounded-xl border border-slate-200 bg-white p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-800">{item.name}</div>
                    <div className="text-[10px] text-slate-400">{item.folderPath}</div>
                  </div>
                  {bulkMode ? (
                    <input
                      type="checkbox"
                      checked={selectedEvidenceIds.has(item.evidenceId)}
                      onChange={() => toggleSelected(item.evidenceId)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleLink(item)}
                      disabled={busyId === item.evidenceId}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                        linkedIds.has(String(item.evidenceId))
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {linkedIds.has(String(item.evidenceId)) ? 'Linked' : 'Link'}
                    </button>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                  <span>{item.evidenceType}</span>
                  <a
                    href={evidenceApi.getDownloadUrl(programId, item.evidenceId)}
                    className="font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    Download
                  </a>
                </div>
              </div>
            ))
          ) : (
            <div className="text-xs text-slate-400">No evidence found.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * AuditTimeline Component (Iteration 2 - Enterprise Grade)
 * 
 * Event renderer registry pattern with:
 * - Dedicated ExportGeneratedCard with sha256/fingerprint/download
 * - React Query integration (auto-refresh after mutations)
 * - URL-backed filters
 * - Copy-to-clipboard for hashes
 * - No manual refetches required
 */

import { useState, useEffect, useMemo } from 'react';
import { Download, Upload, Link as LinkIcon, Unlink, FileText, Filter, X } from 'lucide-react';
import { useAudit } from '../../hooks/useCERv2Queries';
import { exportsApi } from '../../lib/cerv2WorkbenchContract';
import { truncateMiddle, formatBytes, formatTimestamp } from '../../lib/cerv2Utils';
import { CopyButton } from '../../components/cerv2/CopyButton';
import { LoadingState } from '../../components/cerv2/LoadingState';
import { EmptyState } from '../../components/cerv2/EmptyState';
import { ErrorState } from '../../components/cerv2/ErrorState';

/**
 * Event Renderer Registry
 * 
 * Each event type has a dedicated renderer component
 */
const eventRenderers = {
  EXPORT_GENERATED: ExportGeneratedCard,
  EVIDENCE_UPLOADED: EvidenceUploadedCard,
  EVIDENCE_LINKED_BULK: BulkLinkCard,
  EVIDENCE_UNLINKED_BULK: BulkUnlinkCard,
  STATUS_UPDATED: StatusUpdatedCard,
  // Fallback for other events
  DEFAULT: DefaultEventCard,
};

/**
 * Get event renderer
 */
function getEventRenderer(eventType) {
  return eventRenderers[eventType] || eventRenderers.DEFAULT;
}

/**
 * ExportGeneratedCard - Rich export event with sha256/fingerprint/download
 */
function ExportGeneratedCard({ event, programId }) {
  const { payload } = event;
  const { filename, sizeBytes, sha256, evidenceSetFingerprint, exportId } = payload;

  const handleDownload = () => {
    if (exportId) {
      const downloadUrl = exportsApi.getDownloadUrl(programId, exportId);
      window.location.href = downloadUrl;
    }
  };

  return (
    <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <Download className="h-5 w-5 text-purple-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-sm font-semibold text-purple-900">
              Export Generated
              {event.entityType && (
                <span className="ml-2 text-xs font-normal opacity-75">
                  · {event.entityType}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {formatTimestamp(event.createdAt)}
            </div>
          </div>

          <div className="space-y-3">
            {/* File info */}
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-purple-700">File:</span>{' '}
                <span className="font-semibold text-purple-900">{filename}</span>
              </div>
              <div>
                <span className="text-purple-700">Size:</span>{' '}
                <span className="font-semibold text-purple-900">{formatBytes(sizeBytes)}</span>
              </div>
            </div>

            {/* SHA256 */}
            {sha256 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-purple-700">SHA256:</span>
                <code className="text-xs font-mono text-purple-900">
                  {truncateMiddle(sha256, 32, 8)}
                </code>
                <CopyButton text={sha256} label="Copy SHA256" />
              </div>
            )}

            {/* Evidence Set Fingerprint */}
            {evidenceSetFingerprint && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-purple-700">Fingerprint:</span>
                <code className="text-xs font-mono text-purple-900">
                  {truncateMiddle(evidenceSetFingerprint, 32, 8)}
                </code>
                <CopyButton text={evidenceSetFingerprint} label="Copy fingerprint" />
              </div>
            )}

            {/* Download button */}
            {exportId && (
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download Export
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * EvidenceUploadedCard - Evidence upload event
 */
function EvidenceUploadedCard({ event }) {
  const { payload } = event;
  const { filename, sizeBytes } = payload;

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <Upload className="h-5 w-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-sm font-semibold text-blue-900">
              Evidence Uploaded
            </div>
            <div className="text-xs text-slate-500">
              {formatTimestamp(event.createdAt)}
            </div>
          </div>
          <div className="text-xs text-blue-700">
            <span className="font-semibold">{filename}</span>
            {sizeBytes && <span className="ml-2">({formatBytes(sizeBytes)})</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * BulkLinkCard - Bulk evidence linking event
 */
function BulkLinkCard({ event }) {
  const { payload } = event;
  const { count } = payload;

  return (
    <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <LinkIcon className="h-5 w-5 text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-sm font-semibold text-green-900">
              Bulk Evidence Linked
              {event.entityType && (
                <span className="ml-2 text-xs font-normal opacity-75">
                  · {event.entityType}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {formatTimestamp(event.createdAt)}
            </div>
          </div>
          {count && (
            <div>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                {count} {count === 1 ? 'item' : 'items'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * BulkUnlinkCard - Bulk evidence unlinking event
 */
function BulkUnlinkCard({ event }) {
  const { payload } = event;
  const { count } = payload;

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <Unlink className="h-5 w-5 text-red-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-sm font-semibold text-red-900">
              Bulk Evidence Unlinked
              {event.entityType && (
                <span className="ml-2 text-xs font-normal opacity-75">
                  · {event.entityType}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {formatTimestamp(event.createdAt)}
            </div>
          </div>
          {count && (
            <div>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                {count} {count === 1 ? 'item' : 'items'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * StatusUpdatedCard - Status change event
 */
function StatusUpdatedCard({ event }) {
  const { payload } = event;
  const { oldStatus, newStatus, notes } = payload;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <FileText className="h-5 w-5 text-slate-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-sm font-semibold text-slate-900">
              Status Updated
              {event.entityType && (
                <span className="ml-2 text-xs font-normal opacity-75">
                  · {event.entityType}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {formatTimestamp(event.createdAt)}
            </div>
          </div>
          <div className="text-xs text-slate-700">
            <span className="font-semibold">{oldStatus}</span>
            {' → '}
            <span className="font-semibold">{newStatus}</span>
          </div>
          {notes && (
            <div className="mt-2 text-xs text-slate-600 italic">
              "{notes}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * DefaultEventCard - Fallback for other events
 */
function DefaultEventCard({ event }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <FileText className="h-5 w-5 text-slate-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-sm font-semibold text-slate-900">
              {event.type}
              {event.entityType && (
                <span className="ml-2 text-xs font-normal opacity-75">
                  · {event.entityType}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {formatTimestamp(event.createdAt)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


/**
 * Main AuditTimeline Component
 */
export default function AuditTimeline({ programId }) {
  // URL-backed filters
  const [filterAction, setFilterAction] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFilterAction(params.get('action') || '');
    setFilterEntityType(params.get('entityType') || '');
    setFilterDateFrom(params.get('dateFrom') || '');
    setFilterDateTo(params.get('dateTo') || '');
  }, []);

  // Build filter object for query
  const filters = useMemo(() => {
    const f = {};
    if (filterAction) f.type = filterAction;
    if (filterEntityType) f.entityType = filterEntityType;
    return f;
  }, [filterAction, filterEntityType]);

  // React Query hook - automatically caches and refetches on mutations
  const { data, isLoading, error, refetch } = useAudit(programId, filters);

  const events = data?.items || [];

  // Client-side date filtering (could move to backend if needed)
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (filterDateFrom && new Date(event.createdAt) < new Date(filterDateFrom)) return false;
      if (filterDateTo && new Date(event.createdAt) > new Date(filterDateTo)) return false;
      return true;
    });
  }, [events, filterDateFrom, filterDateTo]);

  const activeFilterCount = [filterAction, filterEntityType, filterDateFrom, filterDateTo].filter(Boolean).length;

  const handleClearFilters = () => {
    setFilterAction('');
    setFilterEntityType('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  // Update URL params (shareable filters)
  useEffect(() => {
    const params = new URLSearchParams();
    if (filterAction) params.set('action', filterAction);
    if (filterEntityType) params.set('entityType', filterEntityType);
    if (filterDateFrom) params.set('dateFrom', filterDateFrom);
    if (filterDateTo) params.set('dateTo', filterDateTo);
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [filterAction, filterEntityType, filterDateFrom, filterDateTo]);

  const uniqueActions = [...new Set(events.map((e) => e.type))];
  const uniqueEntityTypes = [...new Set(events.map((e) => e.entityType).filter(Boolean))];

  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">Audit Timeline</div>
            <div className="text-xs text-slate-500">All events are stored server-side for traceability.</div>
          </div>
        </div>
        <LoadingState rows={3} columns={1} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">Audit Timeline</div>
            <div className="text-xs text-slate-500">All events are stored server-side for traceability.</div>
          </div>
        </div>
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-lg font-semibold text-slate-900">Audit Timeline</div>
          <div className="text-xs text-slate-500">All events are stored server-side for traceability.</div>
        </div>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="mb-4 p-4 rounded-2xl border border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Filters</span>
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
              {activeFilterCount}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Actions</option>
            {uniqueActions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
          <select
            value={filterEntityType}
            onChange={(e) => setFilterEntityType(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Entity Types</option>
            {uniqueEntityTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="From date"
          />
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="To date"
          />
        </div>
        {activeFilterCount > 0 && (
          <button
            onClick={handleClearFilters}
            className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
      </div>

      {/* Events list */}
      {filteredEvents.length === 0 ? (
        <EmptyState
          type="audit"
          title="No events yet"
          description={
            activeFilterCount > 0
              ? 'Try adjusting your filters'
              : 'Activity will appear here as you work'
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredEvents.map((event) => {
            const EventCard = getEventRenderer(event.type);
            return <EventCard key={event.id} event={event} programId={programId} />;
          })}
        </div>
      )}

      <div className="mt-6 text-center text-xs text-slate-400">
        Showing {filteredEvents.length} of {events.length} events
      </div>
    </div>
  );
}


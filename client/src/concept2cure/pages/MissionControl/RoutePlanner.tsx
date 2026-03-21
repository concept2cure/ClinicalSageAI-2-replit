/**
 * @fileoverview Route Planner — Regulatory strategy comparison & destination mapping
 * @module concept2cure/pages/MissionControl/RoutePlanner
 *
 * Destination cards, route strategy comparison, authority timeline,
 * submission readiness per route, region-specific requirements.
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { LIFECYCLE } from '../../components/ui/enterprise';
import {
  Compass,
  Globe,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ChevronDown,
  ChevronRight,
  MapPin,
  Target,
  ArrowRight,
  Building2,
  Calendar,
  Shield,
  FileText,
  Loader2,
} from 'lucide-react';
import {
  useDestinations,
  useCreateDestination,
  useRoutePlans,
  useCreateRoutePlan,
  useReadiness,
} from '../../hooks/useMissionControl';

interface RoutePlannerProps {
  programId: number | null;
}

const DESTINATION_TYPES: Record<string, { label: string; color: string; authority: string }> = {
  IND: { label: 'Investigational New Drug', color: 'text-blue-600', authority: 'FDA' },
  NDA: { label: 'New Drug Application', color: 'text-emerald-600', authority: 'FDA' },
  BLA: { label: 'Biologics License', color: 'text-violet-600', authority: 'FDA' },
  '510k': { label: '510(k) Clearance', color: 'text-amber-600', authority: 'FDA' },
  PMA: { label: 'Pre-Market Approval', color: 'text-red-600', authority: 'FDA' },
  'De-Novo': { label: 'De Novo Classification', color: 'text-teal-600', authority: 'FDA' },
  MAA: { label: 'Marketing Auth Application', color: 'text-blue-600', authority: 'EMA' },
  CE: { label: 'CE Marking', color: 'text-orange-600', authority: 'Notified Body' },
  PMDA: { label: 'PMDA Submission', color: 'text-pink-600', authority: 'PMDA' },
  'Health-Canada': { label: 'Health Canada', color: 'text-red-500', authority: 'Health Canada' },
  TGA: { label: 'TGA Submission', color: 'text-cyan-600', authority: 'TGA' },
};

const ROUTE_STATUS_COLORS: Record<string, string> = {
  planned: `${LIFECYCLE.not_started.bg} ${LIFECYCLE.not_started.text}`,
  active: `${LIFECYCLE.draft.bg} ${LIFECYCLE.draft.text}`,
  submitted: `${LIFECYCLE.in_review.bg} ${LIFECYCLE.in_review.text}`,
  'under-review': `${LIFECYCLE.in_review.bg} ${LIFECYCLE.in_review.text}`,
  approved: `${LIFECYCLE.approved.bg} ${LIFECYCLE.approved.text}`,
  rejected: 'bg-red-100 text-red-700',
};

export const RoutePlanner: React.FC<RoutePlannerProps> = ({ programId }) => {
  const [selectedDestId, setSelectedDestId] = useState<number | null>(null);
  const [showAddDest, setShowAddDest] = useState(false);
  const [showAddRoute, setShowAddRoute] = useState(false);
  const [newDest, setNewDest] = useState({ destinationType: 'IND', authority: 'FDA', region: 'US', targetDate: '' });
  const [newRoute, setNewRoute] = useState({ strategyName: '', pathway: 'standard', notes: '' });

  const { data: destinations = [], isLoading } = useDestinations(programId);
  const { data: routes = [] } = useRoutePlans(selectedDestId);
  const { data: readiness } = useReadiness(programId);
  const createDestination = useCreateDestination();
  const createRoute = useCreateRoutePlan();

  const selectedDest = useMemo(() => {
    return destinations.find((d: any) => d.id === selectedDestId) || null;
  }, [destinations, selectedDestId]);

  const handleAddDestination = () => {
    if (!programId || !newDest.destinationType) return;
    createDestination.mutate({
      programId,
      ...newDest,
    });
    setNewDest({ destinationType: 'IND', authority: 'FDA', region: 'US', targetDate: '' });
    setShowAddDest(false);
  };

  const handleAddRoute = () => {
    if (!selectedDestId || !newRoute.strategyName.trim()) return;
    createRoute.mutate({
      destinationId: selectedDestId,
      ...newRoute,
      status: 'planned',
    });
    setNewRoute({ strategyName: '', pathway: 'standard', notes: '' });
    setShowAddRoute(false);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#FAFAF9] overflow-hidden">
      {/* Header */}
      <div className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Compass className="w-5 h-5 text-blue-500" />
          <h1 className="text-base font-semibold text-zinc-900">Route Planner</h1>
          <span className="text-xs text-zinc-500">{destinations.length} destinations</span>
        </div>
        <button
          onClick={() => setShowAddDest(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Destination
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Destinations */}
        <div className="w-80 border-r bg-white overflow-y-auto">
          <div className="p-3 border-b">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Regulatory Destinations</h2>
          </div>
          {destinations.length === 0 ? (
            <div className="p-6 text-center">
              <Globe className="w-8 h-8 text-zinc-200 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">No destinations configured</p>
              <p className="text-xs text-zinc-400 mt-1">Add a destination to define your regulatory strategy</p>
            </div>
          ) : (
            <div className="divide-y">
              {destinations.map((dest: any) => {
                const destType = DESTINATION_TYPES[dest.destinationType] || { label: dest.destinationType, color: 'text-zinc-600', authority: dest.authority || '—' };
                const isActive = selectedDestId === dest.id;

                return (
                  <button
                    key={dest.id}
                    onClick={() => setSelectedDestId(dest.id)}
                    className={cn(
                      'w-full text-left p-4 transition-colors duration-150',
                      isActive ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-zinc-50'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Globe className={cn('w-4 h-4 mt-0.5 flex-shrink-0', destType.color)} />
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-semibold', destType.color)}>{dest.destinationType}</p>
                        <p className="text-xs text-zinc-600 mt-0.5">{destType.label}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-zinc-500 flex items-center gap-1">
                            <Building2 className="w-3 h-3" /> {destType.authority}
                          </span>
                          <span className="text-xs text-zinc-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {dest.region || 'US'}
                          </span>
                          {dest.targetDate && (
                            <span className="text-xs text-zinc-500 flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {new Date(dest.targetDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Route Details */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedDest ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Compass className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">Select a destination to plan routes</p>
                <p className="text-xs text-zinc-400 mt-1">Define regulatory pathways and submission strategies</p>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Destination Header */}
              <div className="bg-white rounded-xl border p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Globe className={cn('w-5 h-5', (DESTINATION_TYPES[selectedDest.destinationType] || {}).color || 'text-zinc-600')} />
                      <h2 className="text-lg font-semibold text-zinc-900">{selectedDest.destinationType}</h2>
                    </div>
                    <p className="text-sm text-zinc-600 mt-1">
                      {(DESTINATION_TYPES[selectedDest.destinationType] || {}).label || selectedDest.destinationType}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                      <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {selectedDest.authority || '—'}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {selectedDest.region || 'US'}</span>
                      {selectedDest.targetDate && (
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Target: {new Date(selectedDest.targetDate).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAddRoute(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Route
                  </button>
                </div>
              </div>

              {/* Routes */}
              {routes.length === 0 ? (
                <div className="bg-white rounded-xl border p-8 text-center">
                  <Compass className="w-8 h-8 text-zinc-200 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">No routes planned for this destination</p>
                  <p className="text-xs text-zinc-400 mt-1">Add a route to compare regulatory strategies</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {routes.map((route: any) => (
                    <div key={route.id} className="bg-white rounded-xl border p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-sm font-semibold text-zinc-900">{route.strategyName}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-zinc-500 capitalize">Pathway: {route.pathway}</span>
                            <span className={cn('text-xs px-1.5 py-0.5 rounded-full', ROUTE_STATUS_COLORS[route.status] || 'bg-zinc-100 text-zinc-600')}>
                              {route.status}
                            </span>
                          </div>
                        </div>
                        <Target className="w-4 h-4 text-zinc-400" />
                      </div>
                      {route.notes && (
                        <p className="text-xs text-zinc-600 mt-2 p-2 bg-zinc-50 rounded-lg">{route.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Readiness context */}
              {readiness && (
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Submission Readiness</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {readiness.dimensions && Object.entries(readiness.dimensions).slice(0, 6).map(([key, val]: [string, any]) => (
                      <div key={key} className="text-center">
                        <div className="relative w-12 h-12 mx-auto mb-1">
                          <svg viewBox="0 0 36 36" className="w-full h-full">
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                            <circle
                              cx="18" cy="18" r="15.9" fill="none"
                              stroke={(val as number) >= 0.7 ? '#10b981' : (val as number) >= 0.4 ? '#f59e0b' : '#ef4444'}
                              strokeWidth="3"
                              strokeDasharray={`${(val as number) * 100} ${100 - (val as number) * 100}`}
                              strokeDashoffset="25"
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-zinc-700">
                            {Math.round((val as number) * 100)}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-600 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Destination Modal */}
      {showAddDest && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowAddDest(false)}>
          <div className="bg-white rounded-xl border shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-zinc-900 mb-4">Add Destination</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">Destination Type</label>
                <select
                  value={newDest.destinationType}
                  onChange={e => {
                    const dt = e.target.value;
                    const info = DESTINATION_TYPES[dt] || {};
                    setNewDest(prev => ({ ...prev, destinationType: dt, authority: info.authority || prev.authority }));
                  }}
                  className="w-full text-xs px-2 py-2 border border-zinc-200 rounded-lg bg-white"
                >
                  {Object.entries(DESTINATION_TYPES).map(([key, val]) => (
                    <option key={key} value={key}>{key} — {val.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-700 mb-1 block">Region</label>
                  <select
                    value={newDest.region}
                    onChange={e => setNewDest(prev => ({ ...prev, region: e.target.value }))}
                    className="w-full text-xs px-2 py-2 border border-zinc-200 rounded-lg bg-white"
                  >
                    <option value="US">United States</option>
                    <option value="EU">European Union</option>
                    <option value="JP">Japan</option>
                    <option value="CA">Canada</option>
                    <option value="AU">Australia</option>
                    <option value="UK">United Kingdom</option>
                    <option value="CH">Switzerland</option>
                    <option value="CN">China</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-700 mb-1 block">Target Date</label>
                  <input
                    type="date"
                    value={newDest.targetDate}
                    onChange={e => setNewDest(prev => ({ ...prev, targetDate: e.target.value }))}
                    className="w-full text-xs px-2 py-2 border border-zinc-200 rounded-lg"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setShowAddDest(false)} className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-900">Cancel</button>
              <button onClick={handleAddDestination} className="px-4 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Route Modal */}
      {showAddRoute && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowAddRoute(false)}>
          <div className="bg-white rounded-xl border shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-zinc-900 mb-4">Add Route Strategy</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">Strategy Name</label>
                <input
                  type="text"
                  value={newRoute.strategyName}
                  onChange={e => setNewRoute(prev => ({ ...prev, strategyName: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                  placeholder="e.g. Fast-track IND pathway"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">Pathway</label>
                <select
                  value={newRoute.pathway}
                  onChange={e => setNewRoute(prev => ({ ...prev, pathway: e.target.value }))}
                  className="w-full text-xs px-2 py-2 border border-zinc-200 rounded-lg bg-white"
                >
                  <option value="standard">Standard</option>
                  <option value="accelerated">Accelerated</option>
                  <option value="priority">Priority Review</option>
                  <option value="breakthrough">Breakthrough</option>
                  <option value="fast-track">Fast Track</option>
                  <option value="orphan">Orphan Drug</option>
                  <option value="conditional">Conditional Approval</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-700 mb-1 block">Notes</label>
                <textarea
                  value={newRoute.notes}
                  onChange={e => setNewRoute(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none h-20 resize-none"
                  placeholder="Strategy rationale..."
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setShowAddRoute(false)} className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-900">Cancel</button>
              <button
                onClick={handleAddRoute}
                disabled={!newRoute.strategyName.trim()}
                className="px-4 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-60"
              >
                Add Route
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoutePlanner;

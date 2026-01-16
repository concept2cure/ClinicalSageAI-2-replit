import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { SystemStatusPanel } from './SystemStatusPanel';
import { IngestionStation } from './IngestionStation';
import { DeepIntelligenceViewer } from './DeepIntelligenceViewer';
import { SynapseComparator } from './SynapseComparator';

// --- TYPES ---
interface HunterStats {
  total: number;
  sources: Record<string, number>;
  last_updated: string;
}

interface StreamItem {
  id: string;
  source_system: string;
  insight: string;
  severity: string;
  created_at: string;
  tags?: string[];
}

interface AnalystResult {
  summary?: string;
  impact_assessment?: string;
  project_conflicts?:
    | string[]
    | Array<{ project_name?: string; project_id?: string; risk_rationale?: string }>;
  action_items?: string[];
  related_regulations?: string[];
  risk_level?: string;
}

interface GenomeEntry {
  csr_id: number;
  drug_name: string | null;
  study_id: string | null;
  regulatory_agency: string;
  extraction_confidence_score: number | null;
  created_at: string;
}

export const HunterCommandCenter: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'TACTICAL' | 'ROUTING' | 'INTEL'>(
    'DASHBOARD'
  );
  const [stats, setStats] = useState<HunterStats | null>(null);
  const [stream, setStream] = useState<StreamItem[]>([]);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [analysisById, setAnalysisById] = useState<Record<string, AnalystResult | null>>({});
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [genomeEntries, setGenomeEntries] = useState<GenomeEntry[]>([]);
  const [activeGenomeId, setActiveGenomeId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const lastCriticalAlertRef = useRef<number>(0);

  // Tactical State
  const [profileName, setProfileName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [sources, setSources] = useState({ sec: true, fda: true, trials: true, eu: true, canada: true });
  const [hunting, setHunting] = useState(false);

  // Routing State
  const [alerts, setAlerts] = useState({ slack: true, email: true, jira: false });
  const [threshold, setThreshold] = useState('HIGH');
  // --- ACTIONS ---
  const fetchStats = async () => {
    try {
      const tenantId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId');
      const res = await axios.get('/api/lumen/status', {
        headers: tenantId ? { 'x-organization-id': tenantId } : undefined,
      });
      setStats(res.data.intelligence);
      setLastSync(new Date().toISOString());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStream = async () => {
    try {
      const tenantId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId');
      const res = await axios.get('/api/lumen/stream', {
        params: { limit: 500 },
        headers: tenantId ? { 'x-organization-id': tenantId } : undefined,
      });
      setStream(res.data || []);
      setLastSync(new Date().toISOString());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchGenomeEntries = async () => {
    try {
      const res = await axios.get('/api/lumen/genome', { params: { limit: 12 } });
      setGenomeEntries(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchStream();
    fetchGenomeEntries();
    const interval = setInterval(() => {
      fetchStats();
      fetchStream();
      fetchGenomeEntries();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const playAlertSound = () => {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.volume = 0.4;
    audio.play().catch(() => {});
  };

  useEffect(() => {
    const criticalItems = stream.filter(item => item.severity === 'CRITICAL');
    if (!criticalItems.length) return;
    const latestCritical = criticalItems
      .map(item => new Date(item.created_at).getTime())
      .filter(timestamp => Number.isFinite(timestamp))
      .sort((a, b) => b - a)[0];

    if (!latestCritical) return;

    const isFresh = latestCritical > Date.now() - 10000;
    if (isFresh && latestCritical > lastCriticalAlertRef.current) {
      lastCriticalAlertRef.current = latestCritical;
      playAlertSound();
    }
  }, [stream]);

  const activeThreats = useMemo(
    () => stream.filter(item => item.severity === 'CRITICAL' || item.severity === 'HIGH').length,
    [stream]
  );

  const hasCriticalThreat = useMemo(
    () => stream.some(item => item.severity === 'CRITICAL'),
    [stream]
  );

  const velocityBars = useMemo(() => {
    const now = Date.now();
    const buckets = Array.from({ length: 24 }, () => 0);
    stream.forEach(item => {
      const timestamp = new Date(item.created_at).getTime();
      const hoursAgo = Math.floor((now - timestamp) / (1000 * 60 * 60));
      if (hoursAgo >= 0 && hoursAgo < 24) {
        buckets[23 - hoursAgo] += 1;
      }
    });
    const max = Math.max(1, ...buckets);
    return buckets.map((count, index) => ({
      h: Math.round((count / max) * 100),
      active: index === 23,
      count,
    }));
  }, [stream]);

  const sourceMatrix = useMemo(() => {
    return Object.entries(stats?.sources || {}).sort((a, b) => b[1] - a[1]);
  }, [stats]);

  const triggerHunt = async () => {
    setHunting(true);
    try {
      const tenantId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId');
      await axios.post(
        '/api/lumen/admin/force-hunt',
        { keywords, sources, profileName, alerts, threshold },
        {
          headers: tenantId ? { 'x-organization-id': tenantId } : undefined,
        }
      );
      setTimeout(() => {
        fetchStats();
        fetchStream();
      }, 5000);
    } catch (e) {
      console.error(e);
    } finally {
      setHunting(false);
    }
  };

  const requestAnalysis = async (item: StreamItem) => {
    setAnalyzingId(item.id);
    try {
      const tenantId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId');
      const res = await axios.post(
        '/api/lumen/analyze',
        {
          insight: item.insight,
          source: item.source_system,
        },
        {
          headers: tenantId ? { 'x-organization-id': tenantId } : undefined,
        }
      );
      setAnalysisById(prev => ({ ...prev, [item.id]: res.data }));
    } catch (error) {
      setAnalysisById(prev => ({ ...prev, [item.id]: null }));
    } finally {
      setAnalyzingId(null);
    }
  };

  const copyBriefing = (conflict: { project_id?: string; project_name?: string; risk_rationale?: string }) => {
    const text = `⚠️ REGULATORY ALERT\nProject: ${conflict.project_name || 'Unknown Project'}\nRisk: ${conflict.risk_rationale || 'Unknown risk'}\nSource: Lumen Cortex`;
    navigator.clipboard.writeText(text);
    if (conflict.project_id) {
      setCopiedId(conflict.project_id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  useEffect(() => {
    if (!expandedItem) return;
    if (analysisById[expandedItem] !== undefined) return;
    const item = stream.find(entry => entry.id === expandedItem);
    if (item) {
      requestAnalysis(item);
    }
  }, [expandedItem, stream, analysisById]);

  // --- SUB-COMPONENTS ---

  // A. Velocity Chart (CSS Bar Graph)
  const VelocityChart = () => {
    return (
      <div className="flex items-end justify-between h-16 gap-1 w-full mt-4 opacity-80">
        {velocityBars.map((bar, i) => (
          <div key={i} className="w-full bg-slate-700/50 rounded-sm relative group">
            <div
              style={{ height: `${bar.h}%` }}
              className={`absolute bottom-0 w-full rounded-sm transition-all duration-1000 ${
                bar.active
                  ? 'bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]'
                  : 'bg-slate-600 group-hover:bg-slate-500'
              }`}
            ></div>
            <span className="sr-only">{bar.count} events</span>
          </div>
        ))}
      </div>
    );
  };

  // B. "Executive Interceptor" Ticker
  const Ticker = () => {
    const keywordTokens = keywords
      .split(',')
      .map(token => token.trim().toLowerCase())
      .filter(Boolean);

    const alerts = stream.filter(item => {
      if (item.severity === 'CRITICAL' || item.severity === 'HIGH') return true;
      if (keywordTokens.length === 0) return false;
      const insight = item.insight.toLowerCase();
      return keywordTokens.some(token => insight.includes(token));
    });

    const displayItems = alerts.length > 0 ? alerts : stream.slice(0, 5);

    const getSourceStyle = (source: string) => {
      if (source.includes('SEC')) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
      if (source.includes('FDA')) return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
      if (source.includes('EU')) return 'text-purple-400 border-purple-500/30 bg-purple-500/10';
      return 'text-slate-400 border-slate-700 bg-slate-800';
    };

    return (
      <div className="fixed bottom-0 left-0 right-0 bg-[#020617] border-t border-slate-800 h-10 flex items-center overflow-hidden z-50 shadow-[0_-5px_20px_rgba(0,0,0,0.5)] group/ticker">
        <div
          className={`px-4 h-full flex items-center text-[10px] font-black tracking-[0.2em] z-20 shadow-xl relative overflow-hidden ${
            alerts.some(a => a.severity === 'CRITICAL')
              ? 'bg-red-700 text-white'
              : 'bg-blue-700 text-white'
          }`}
        >
          {alerts.some(a => a.severity === 'CRITICAL') && (
            <div className="absolute inset-0 bg-red-500 animate-ping opacity-20"></div>
          )}
          {alerts.some(a => a.severity === 'CRITICAL') ? 'THREAT DETECTED' : 'LIVE INTELLIGENCE'}
        </div>

        <div className="whitespace-nowrap animate-marquee flex items-center gap-0 group-hover/ticker:[animation-play-state:paused]">
          {[...displayItems, ...displayItems].map((item, i) => {
            const insight = item.insight.toLowerCase();
            const isTarget = keywordTokens.length > 0 && keywordTokens.some(token => insight.includes(token));
            const isFresh =
              new Date(item.created_at).getTime() > Date.now() - 60 * 60 * 1000;

            return (
              <div
                key={`${item.id}-${i}`}
                onClick={() => {
                  setActiveTab('INTEL');
                  setExpandedItem(item.id);
                }}
                className={`flex items-center gap-3 px-6 py-2 border-r border-slate-800/50 cursor-pointer transition-colors hover:bg-slate-900 ${
                  isTarget ? 'bg-yellow-900/10' : ''
                }`}
              >
                {isFresh && (
                  <span className="text-[9px] font-bold bg-red-600 text-white px-1.5 rounded animate-pulse">
                    NEW
                  </span>
                )}

                {isTarget && (
                  <span className="text-[9px] font-bold border border-yellow-500 text-yellow-500 px-1.5 rounded">
                    🎯 TARGET
                  </span>
                )}

                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getSourceStyle(
                    item.source_system
                  )}`}
                >
                  {item.source_system.split('_')[0]}
                </span>

                <span
                  className={`text-xs font-mono font-medium truncate max-w-[400px] ${
                    item.severity === 'CRITICAL'
                      ? 'text-red-300'
                      : isTarget
                        ? 'text-yellow-100'
                        : 'text-slate-400'
                  }`}
                >
                  {item.insight}
                </span>

                {item.severity === 'CRITICAL' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_5px_red]"></span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // --- RENDERERS ---

  const renderDashboard = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white/5 p-5 rounded-xl border border-white/10 backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
              <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
            </svg>
          </div>
          <div className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">
            Total Intelligence
          </div>
          <div className="text-4xl font-mono font-light text-white">
            {stats?.total.toLocaleString() || 0}
          </div>
          <div className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
            <span>▲ 12%</span> <span className="text-slate-500">vs last week</span>
          </div>
        </div>

        <div className="bg-white/5 p-5 rounded-xl border border-white/10 backdrop-blur-sm relative overflow-hidden">
          <div className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">
            Active Threats
          </div>
          <div
            className={`text-4xl font-mono font-light text-white ${
              activeThreats > 0 && hasCriticalThreat ? 'animate-heartbeat' : ''
            }`}
          >
            {activeThreats}
          </div>
          <div className="text-xs text-red-400 mt-2 flex items-center gap-1">
            <span>{hasCriticalThreat ? 'CRITICAL SIGNALS' : 'MONITORING'}</span>
            <span className="text-slate-500">updated {lastSync ? 'just now' : '—'}</span>
          </div>
        </div>

        <div className="bg-white/5 p-5 rounded-xl border border-white/10 backdrop-blur-sm col-span-2">
          <div className="flex justify-between items-center mb-2">
            <div className="text-slate-400 text-xs font-bold uppercase tracking-widest">
              Neural Velocity (24h)
            </div>
            <div className="flex gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse"></span>
              <span className="text-[10px] text-blue-400 font-mono">LIVE INGEST</span>
            </div>
          </div>
          <VelocityChart />
        </div>
      </div>

      <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700/50">
        <h3 className="text-sm font-bold text-slate-400 uppercase mb-4">
          Neural Net Connection Matrix
        </h3>
        {sourceMatrix.length === 0 ? (
          <div className="text-xs text-slate-500">No sources available yet.</div>
        ) : (
          <div className="flex justify-between items-center px-4">
            {sourceMatrix.map(([source, count]) => (
              <div
                key={source}
                className="flex flex-col items-center group cursor-pointer transition-transform hover:-translate-y-1"
              >
                <div
                  className={`h-3 w-3 rounded-full mb-3 shadow-[0_0_15px_rgba(59,130,246,0.6)] transition-all ${
                    count > 0
                      ? 'bg-emerald-500 shadow-emerald-500/50'
                      : 'bg-slate-600'
                  }`}
                ></div>
                <div className="text-xs font-mono text-slate-300 mb-1">{source}</div>
                <div className="text-[10px] text-slate-500 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded-full">
                  {count} recs
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700/50">
        <h3 className="text-sm font-bold text-slate-400 uppercase mb-4">Deep Intelligence Vault</h3>
        {genomeEntries.length === 0 ? (
          <div className="text-xs text-slate-500">No Deep Intelligence records yet.</div>
        ) : (
          <div className="space-y-3">
            {genomeEntries.map(entry => (
              <div
                key={entry.csr_id}
                className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-lg p-4"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="accent-blue-500 w-4 h-4 cursor-pointer"
                    checked={selectedIds.includes(entry.csr_id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedIds(prev => [...prev, entry.csr_id]);
                      } else {
                        setSelectedIds(prev => prev.filter(id => id !== entry.csr_id));
                      }
                    }}
                  />
                  <div>
                    <div className="text-xs text-slate-400 uppercase tracking-widest">
                      {entry.regulatory_agency}
                    </div>
                    <div className="text-sm text-white font-semibold">
                      {entry.drug_name || 'Unknown Drug'}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Study ID: {entry.study_id || '—'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setActiveGenomeId(entry.csr_id)}
                  className="text-xs font-bold text-blue-400 hover:text-blue-300"
                >
                  VIEW INTELLIGENCE
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <IngestionStation />
    </div>
  );

  const renderTactical = () => (
    <div className="grid grid-cols-3 gap-6 animate-in slide-in-from-right-4 duration-300">
      <div className="col-span-1 space-y-4 border-r border-slate-700/50 pr-6">
        <label className="block text-xs font-bold text-slate-500 uppercase">Hunt Profile</label>
        <input
          type="text"
          value={profileName}
          onChange={e => setProfileName(e.target.value)}
          placeholder="Optional profile name (for audit trail)"
          className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none hover:bg-slate-750 transition-colors"
        />

        <div className="p-4 bg-gradient-to-br from-blue-900/20 to-slate-900 border border-blue-500/20 rounded-lg">
          <h4 className="text-blue-400 text-xs font-bold uppercase mb-2 flex items-center gap-2">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Active Parameters
          </h4>
          <p className="text-xs text-slate-400 leading-relaxed font-mono">
            {'> TARGET: '}<span className="text-white">{keywords || 'ALL'}</span>
            <br />
            {'> SCOPE: '}
            {Object.entries(sources)
              .filter(([, v]) => v)
              .map(([k]) => k.toUpperCase())
              .join(', ')}
          </p>
        </div>
      </div>

      <div className="col-span-2 space-y-6">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
            Keywords & Syntax
          </label>
          <input
            type="text"
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-700 text-white font-mono text-sm rounded-lg p-4 focus:border-blue-500 transition-colors outline-none shadow-inner"
            placeholder="e.g. (pacemaker OR stent) AND NOT 'recall'"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-3">
            Jurisdiction Lock
          </label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(sources).map(([key, active]) => (
              <button
                key={key}
                onClick={() => setSources(prev => ({ ...prev, [key]: !active }))}
                className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all border ${
                  active
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
                    : 'bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700 hover:text-slate-400'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={triggerHunt}
          disabled={hunting}
          className="w-full py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-lg font-bold text-white shadow-xl hover:shadow-blue-500/20 transition-all disabled:opacity-50 relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
          <span className="relative flex items-center justify-center gap-2 tracking-widest">
            {hunting ? 'DEPLOYING AGENTS...' : 'INITIATE TACTICAL HUNT'}
          </span>
        </button>
      </div>
    </div>
  );

  const renderRouting = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="p-4 bg-yellow-900/10 border border-yellow-500/20 rounded-lg flex items-start gap-3">
        <span className="text-xl">⚠️</span>
        <div>
          <h4 className="text-yellow-500 font-bold text-sm">Escalation Protocol Active</h4>
          <p className="text-slate-400 text-xs mt-1">
            CRLs and Class I Recalls will bypass filters and trigger immediate{' '}
            <span className="text-white font-mono">P0_CRITICAL</span> paging.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['slack', 'email', 'jira'].map(channel => (
          <button
            key={channel}
            onClick={() =>
              setAlerts(prev => ({ ...prev, [channel]: !prev[channel as keyof typeof prev] }))
            }
            className={`bg-slate-900/60 border rounded-lg p-4 text-left transition-all ${
              alerts[channel as keyof typeof alerts]
                ? 'border-blue-500/60 text-white'
                : 'border-slate-800 text-slate-500'
            }`}
          >
            <div className="text-xs uppercase tracking-widest">{channel}</div>
            <div className="mt-2 text-sm">
              {alerts[channel as keyof typeof alerts] ? 'Enabled' : 'Disabled'}
            </div>
          </button>
        ))}
      </div>
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4">
        <label className="text-xs uppercase tracking-widest text-slate-500">Alert Threshold</label>
        <div className="mt-3 flex flex-wrap gap-2">
          {['ALL', 'MEDIUM', 'HIGH', 'CRITICAL'].map(level => (
            <button
              key={level}
              onClick={() => setThreshold(level)}
              className={`px-3 py-1.5 rounded border text-xs font-bold tracking-widest transition-colors ${
                threshold === level
                  ? 'border-blue-500 text-blue-300 bg-blue-500/10'
                  : 'border-slate-700 text-slate-500 hover:text-slate-300'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStream = () => (
    <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden min-h-[400px] flex flex-col">
      <div className="grid grid-cols-12 gap-4 p-3 border-b border-slate-700 bg-slate-950/50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
        <div className="col-span-1">Source</div>
        <div className="col-span-2">Time</div>
        <div className="col-span-1">Sev</div>
        <div className="col-span-8">Insight Payload</div>
      </div>
      <div className="divide-y divide-slate-800 overflow-y-auto flex-1 custom-scrollbar">
        {stream.length === 0 ? (
          <div className="p-6 text-sm text-slate-400">No intelligence records yet.</div>
        ) : (
          stream.map(item => (
            <React.Fragment key={item.id}>
            <div
              onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
              className={`grid grid-cols-12 gap-4 p-4 transition-colors cursor-pointer ${
                expandedItem === item.id ? 'bg-slate-800' : 'hover:bg-slate-800/30'
              }`}
            >
              <div className="col-span-1">
                <span className="text-[9px] font-bold bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
                  {item.source_system.split('_')[0]}
                </span>
              </div>
              <div className="col-span-2 text-xs text-slate-500 font-mono">
                {new Date(item.created_at).toLocaleTimeString()}
              </div>
              <div className="col-span-1">
                <span
                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                    item.severity === 'CRITICAL'
                      ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : 'bg-slate-700/50 text-slate-400 border-slate-600'
                  }`}
                >
                  {item.severity?.substring(0, 3) || 'INF'}
                </span>
              </div>
              <div className="col-span-8 text-sm text-slate-300 leading-snug">{item.insight}</div>
            </div>

            {expandedItem === item.id && (
              <div className="col-span-12 bg-slate-950/80 border-y border-blue-500/30 p-0 animate-in slide-in-from-top-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                  <svg className="w-32 h-32 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" />
                  </svg>
                </div>

                {analyzingId === item.id ? (
                  <div className="p-8 flex flex-col items-center justify-center gap-4">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100"></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200"></div>
                    </div>
                    <div className="font-mono text-xs text-blue-400">
                      CROSS-REFERENCING ACTIVE PROJECTS...
                    </div>
                  </div>
                ) : analysisById[item.id] ? (
                  <div className="flex flex-col md:flex-row">
                    <div className="flex-1 p-6 space-y-6">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded">
                            AUTO-GENERATED BRIEFING
                          </span>
                          <span className="text-xs text-slate-500 font-mono">
                            ID: {item.id.substring(0, 8)}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-white leading-tight">
                          {analysisById[item.id]?.summary}
                        </h3>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">
                            Impact Assessment
                          </h4>
                          <p className="text-sm text-slate-300 leading-relaxed border-l-2 border-slate-700 pl-3">
                            {analysisById[item.id]?.impact_assessment}
                          </p>
                        </div>

                        {analysisById[item.id]?.project_conflicts &&
                          analysisById[item.id]?.project_conflicts?.length ? (
                          <div
                            className={`border p-4 rounded-lg transition-all ${
                              analysisById[item.id]?.risk_level === 'CRITICAL'
                                ? 'bg-red-950/30 border-red-500/50 shadow-[0_0_15px_rgba(220,38,38,0.1)]'
                                : 'bg-orange-950/30 border-orange-500/50'
                            }`}
                          >
                            <h4
                              className={`text-xs font-bold uppercase mb-3 flex items-center gap-2 ${
                                analysisById[item.id]?.risk_level === 'CRITICAL'
                                  ? 'text-red-400'
                                  : 'text-orange-400'
                              }`}
                            >
                              <span className="animate-pulse text-lg">●</span>
                              {analysisById[item.id]?.risk_level || 'HIGH'} THREAT TO ACTIVE PIPELINE
                            </h4>

                            <ul className="space-y-4">
                              {analysisById[item.id]?.project_conflicts?.map((conflict, index) => {
                                if (typeof conflict === 'string') {
                                  return (
                                    <li
                                      key={`${item.id}-conflict-${index}`}
                                      className="text-xs text-slate-300"
                                    >
                                      {conflict}
                                    </li>
                                  );
                                }

                                return (
                                  <li
                                    key={`${item.id}-conflict-${index}`}
                                    className="flex flex-col gap-2 border-b border-white/5 pb-3 last:border-0 last:pb-0"
                                  >
                                    <div className="flex justify-between items-start">
                                      <span className="text-sm text-white font-bold tracking-wide">
                                        {conflict.project_name || 'Unknown Project'}
                                      </span>
                                      {conflict.project_id && (
                                        <span className="text-[10px] font-mono text-slate-500">
                                          ID: {conflict.project_id}
                                        </span>
                                      )}
                                    </div>

                                    <span className="text-xs text-slate-300 leading-relaxed bg-black/20 p-2 rounded border border-white/5">
                                      {conflict.risk_rationale || 'No rationale provided.'}
                                    </span>

                                    {conflict.project_id && (
                                      <div className="flex gap-2 mt-1">
                                        <button
                                          onClick={e => {
                                            e.stopPropagation();
                                            navigate(`/projects/${conflict.project_id}`, {
                                              state: {
                                                lumenAlert: {
                                                  id: item.id,
                                                  source: item.source_system,
                                                  severity: analysisById[item.id]?.risk_level,
                                                  rationale: conflict.risk_rationale,
                                                  actionItems: analysisById[item.id]?.action_items || [],
                                                },
                                              },
                                            });
                                          }}
                                          className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-bold px-3 py-2 rounded transition-all shadow-lg ${
                                            analysisById[item.id]?.risk_level === 'CRITICAL'
                                              ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/20'
                                              : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-900/20'
                                          }`}
                                        >
                                          <span>🚀</span> DEPLOY TO WAR ROOM
                                        </button>

                                        <button
                                          onClick={e => {
                                            e.stopPropagation();
                                            copyBriefing(conflict);
                                          }}
                                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-slate-700 transition-colors"
                                          title="Copy Briefing to Clipboard"
                                        >
                                          {copiedId === conflict.project_id ? '✓ COPIED' : '📋'}
                                        </button>
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ) : null}
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">
                          Regulatory Citations
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {analysisById[item.id]?.related_regulations?.map((regulation, index) => (
                            <button
                              key={`${item.id}-reg-${index}`}
                              className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded text-blue-300 border border-slate-700 transition-colors flex items-center gap-2 group"
                            >
                              <svg
                                className="w-3 h-3 opacity-50 group-hover:opacity-100"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                />
                              </svg>
                              {regulation}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="w-full md:w-80 bg-slate-900 border-l border-slate-800 p-6 flex flex-col justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-blue-400 uppercase mb-4 tracking-widest">
                          Recommended Actions
                        </h4>
                        <ul className="space-y-3">
                          {analysisById[item.id]?.action_items?.map((action, index) => (
                            <li
                              key={`${item.id}-action-${index}`}
                              className="flex gap-3 text-xs text-slate-300 group cursor-pointer hover:text-white"
                            >
                              <div className="w-4 h-4 rounded border border-slate-600 flex items-center justify-center group-hover:border-blue-500 group-hover:bg-blue-500/20 transition-all">
                                <div className="w-2 h-2 rounded-[1px] bg-transparent group-hover:bg-blue-400"></div>
                              </div>
                              <span className="flex-1 leading-snug">{action}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-2 mt-8">
                        <button className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded shadow-lg shadow-blue-900/50 transition-all flex items-center justify-center gap-2">
                          <span>⚡</span> EXECUTE MITIGATION PLAN
                        </button>
                        <button className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded border border-slate-700 transition-colors">
                          CREATE JIRA TICKET
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-red-400 text-xs text-center border-l-4 border-red-500 bg-red-900/10">
                    ANALYSIS SERVER ERROR. PLEASE RETRY.
                  </div>
                )}
              </div>
            )}
          </React.Fragment>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-[#0f172a] text-white rounded-2xl shadow-2xl border border-slate-800 overflow-hidden flex flex-col h-full min-h-[600px] font-sans relative">
      <div className="flex border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-10">
        {['DASHBOARD', 'TACTICAL', 'ROUTING', 'INTEL'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`flex-1 py-5 text-xs font-bold tracking-[0.15em] transition-all relative overflow-hidden ${
              activeTab === tab
                ? 'text-white bg-white/5'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>
            )}
          </button>
        ))}
      </div>

      <div className="p-8 flex-1 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-12">
        {lastSync && (
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-4">
            Last sync {new Date(lastSync).toLocaleTimeString()}
          </div>
        )}
        {activeTab === 'DASHBOARD' && renderDashboard()}
        {activeTab === 'TACTICAL' && renderTactical()}
        {activeTab === 'ROUTING' && renderRouting()}
        {activeTab === 'INTEL' && renderStream()}
      </div>

      <Ticker />

      <div className="mt-auto">
        <SystemStatusPanel />
      </div>

      {selectedIds.length > 1 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-full shadow-2xl z-40 flex items-center gap-4 animate-in slide-in-from-bottom-4">
          <span className="font-bold text-sm">{selectedIds.length} ASSETS SELECTED</span>
          <div className="h-4 w-[1px] bg-blue-400"></div>
          <button
            onClick={() => setShowCompare(true)}
            className="font-black text-sm hover:text-blue-200 transition-colors"
          >
            COMPARE COHORTS ➜
          </button>
        </div>
      )}

      {activeGenomeId && (
        <DeepIntelligenceViewer assetId={activeGenomeId} onClose={() => setActiveGenomeId(null)} />
      )}

      {showCompare && (
        <SynapseComparator ids={selectedIds} onClose={() => setShowCompare(false)} />
      )}

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </div>
  );
};

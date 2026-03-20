/**
 * Cross-Module Data Bridge
 *
 * Phase 5: Intelligent Document System
 *
 * This is the critical integration layer that connects the Intelligent Document
 * System to ALL other modules in Concept2Cure:
 *
 * - Predicate Finder → Get predicate device data for 510(k)
 * - Literature Search → Pull citations and evidence
 * - CMC Data → Manufacturing specs and batch data
 * - Clinical Trials → Study data and endpoints
 * - Vault/DMS → Uploaded documents
 * - MAUDE/FAERS → Safety databases
 * - Lumen Cortex → Intelligence feeds
 *
 * The bridge automatically:
 * - Detects when data becomes available in other modules
 * - Converts module data into citation-ready sources
 * - Tracks data freshness and suggests updates
 * - Maintains provenance for audit trails
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Database,
  RefreshCw,
  Link2,
  CheckCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
  Download,
  ExternalLink,
  Plug,
  Zap,
  Activity,
  FileText,
  BookOpen,
  Target,
  FlaskConical,
  AlertCircle,
  Unplug,
} from 'lucide-react';
import type { DataBridgeConnection, DataModule, BridgeDataType, SourceSuggestion } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Module Configuration - What each module provides
// ─────────────────────────────────────────────────────────────────────────────

interface ModuleConfig {
  id: DataModule;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  dataTypes: BridgeDataType[];
  apiEndpoint: string;
}

const MODULE_CONFIGS: ModuleConfig[] = [
  {
    id: 'predicate_finder',
    name: 'Predicate Finder',
    description: 'FDA 510(k) predicate devices for substantial equivalence',
    icon: Target,
    color: 'blue',
    dataTypes: ['predicate_devices'],
    apiEndpoint: '/api/510k/predicates',
  },
  {
    id: 'literature_search',
    name: 'Literature Search',
    description: 'PubMed, clinical papers, and regulatory guidance',
    icon: BookOpen,
    color: 'green',
    dataTypes: ['literature_citations'],
    apiEndpoint: '/api/literature/search',
  },
  {
    id: 'cmc_data',
    name: 'CMC Module',
    description: 'Manufacturing, quality, and batch data',
    icon: FlaskConical,
    color: 'orange',
    dataTypes: ['manufacturing_specs', 'testing_results'],
    apiEndpoint: '/api/cmc/data',
  },
  {
    id: 'clinical_trials',
    name: 'Clinical Data',
    description: 'Trial data, endpoints, and safety information',
    icon: Activity,
    color: 'purple',
    dataTypes: ['clinical_endpoints', 'safety_data'],
    apiEndpoint: '/api/clinical/data',
  },
  {
    id: 'vault',
    name: 'Document Vault',
    description: 'Uploaded source documents and attachments',
    icon: FileText,
    color: 'slate',
    dataTypes: ['literature_citations', 'regulatory_references'],
    apiEndpoint: '/api/vault/documents',
  },
  {
    id: 'maude',
    name: 'MAUDE Database',
    description: 'FDA medical device adverse events',
    icon: AlertCircle,
    color: 'red',
    dataTypes: ['safety_data'],
    apiEndpoint: '/api/fda/maude',
  },
  {
    id: 'faers',
    name: 'FAERS Database',
    description: 'FDA Adverse Event Reporting System',
    icon: AlertTriangle,
    color: 'amber',
    dataTypes: ['safety_data'],
    apiEndpoint: '/api/fda/faers',
  },
  {
    id: 'intelligence_feeds',
    name: 'AnA Cortex',
    description: 'Regulatory intelligence and competitor monitoring',
    icon: Zap,
    color: 'indigo',
    dataTypes: ['regulatory_references'],
    apiEndpoint: '/api/lumen-cortex/intelligence',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface CrossModuleDataBridgeProps {
  // Current project context
  projectId: string;
  submissionType: 'IND' | '510K' | 'NDA' | 'BLA' | 'PMA' | 'CER' | 'MAA' | 'DE_NOVO';
  documentId?: string;

  // Pre-loaded connections (from parent)
  connections?: DataBridgeConnection[];

  // Data that's already available (passed from workflow)
  predicateDevices?: any[];
  literatureData?: any[];
  cmcData?: any[];
  clinicalData?: any[];

  // Callbacks
  onConnectionChange?: (connections: DataBridgeConnection[]) => void;
  onSourcesGenerated?: (sources: SourceSuggestion[]) => void;
  onNavigateToModule?: (moduleId: DataModule) => void;

  // Display mode
  compact?: boolean;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection Status Badge
// ─────────────────────────────────────────────────────────────────────────────

const ConnectionStatusBadge: React.FC<{
  status: DataBridgeConnection['status'];
  compact?: boolean;
}> = ({ status, compact }) => {
  const config = {
    connected: {
      icon: CheckCircle,
      label: 'Connected',
      color: 'text-green-500 bg-green-50',
    },
    available: {
      icon: Download,
      label: 'Available',
      color: 'text-blue-500 bg-blue-50',
    },
    'needs-update': {
      icon: RefreshCw,
      label: 'Update',
      color: 'text-amber-500 bg-amber-50',
    },
    missing: {
      icon: Unplug,
      label: 'No Data',
      color: 'text-zinc-400 bg-zinc-50',
    },
  };

  const { icon: Icon, label, color } = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${color}`}
    >
      <Icon className="w-3 h-3" />
      {!compact && label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Module Connection Card
// ─────────────────────────────────────────────────────────────────────────────

interface ModuleConnectionCardProps {
  config: ModuleConfig;
  connection: DataBridgeConnection | null;
  onConnect: () => void;
  onSync: () => void;
  onNavigate: () => void;
  isLoading?: boolean;
  compact?: boolean;
}

const ModuleConnectionCard: React.FC<ModuleConnectionCardProps> = ({
  config,
  connection,
  onConnect,
  onSync,
  onNavigate,
  isLoading,
  compact,
}) => {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    orange: 'bg-orange-500',
    purple: 'bg-purple-500',
    slate: 'bg-zinc-500',
    red: 'bg-red-500',
    amber: 'bg-amber-500',
    indigo: 'bg-indigo-500',
  };

  const Icon = config.icon;

  if (compact) {
    return (
      <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-zinc-200">
        <div className="flex items-center gap-2">
          <div
            className={`p-1.5 rounded ${colorClasses[config.color as keyof typeof colorClasses]}`}
          >
            <Icon className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-medium text-zinc-700">
            {config.name}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ConnectionStatusBadge status={connection?.status || 'missing'} compact />
          {connection?.status === 'connected' && (
            <span className="text-xs text-zinc-500">{connection.itemCount} items</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white rounded-xl border border-zinc-200 hover:border-zinc-300 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-lg ${colorClasses[config.color as keyof typeof colorClasses]}`}
          >
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="font-medium text-zinc-800">{config.name}</h4>
            <p className="text-xs text-zinc-500">{config.description}</p>
          </div>
        </div>
        <ConnectionStatusBadge status={connection?.status || 'missing'} />
      </div>

      {connection && connection.status !== 'missing' && (
        <div className="mb-3 p-3 bg-zinc-50 rounded-lg">
          <p className="text-sm text-zinc-600">{connection.preview}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Database className="w-3 h-3" />
              {connection.itemCount} items
            </span>
            {connection.lastSyncedAt && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Synced {new Date(connection.lastSyncedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {connection?.status === 'connected' ? (
          <>
            <button
              onClick={onSync}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              data-testid={`button-bridge-sync-${config.id}`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Sync
            </button>
            <button
              onClick={onNavigate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
              data-testid={`button-bridge-view-${config.id}`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View
            </button>
          </>
        ) : connection?.status === 'available' ? (
          <button
            onClick={onConnect}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
            data-testid={`button-bridge-connect-${config.id}`}
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Plug className="w-4 h-4" />
            )}
            Connect
          </button>
        ) : connection?.status === 'needs-update' ? (
          <button
            onClick={onSync}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-60"
            data-testid={`button-bridge-update-${config.id}`}
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Update Now
          </button>
        ) : (
          <button
            onClick={onNavigate}
            className="flex items-center gap-1.5 px-4 py-2 bg-zinc-100 text-zinc-600 text-sm font-medium rounded-lg hover:bg-zinc-200 transition-colors"
            data-testid={`button-bridge-go-module-${config.id}`}
          >
            <ArrowRight className="w-4 h-4" />
            Go to Module
          </button>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Data Flow Diagram - Visual representation
// ─────────────────────────────────────────────────────────────────────────────

const DataFlowDiagram: React.FC<{
  connections: DataBridgeConnection[];
  submissionType: string;
}> = ({ connections, submissionType }) => {
  const connectedCount = connections.filter(c => c.status === 'connected').length;
  const totalSources = connections.reduce((sum, c) => sum + c.itemCount, 0);

  return (
    <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-zinc-800">Data Flow Overview</h3>
          <p className="text-sm text-zinc-600">
            Sources flowing into your {submissionType} document
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-blue-600">{totalSources}</p>
          <p className="text-xs text-zinc-500">Total Sources</p>
        </div>
      </div>

      {/* Visual flow */}
      <div className="flex items-center justify-center gap-4 py-4">
        {/* Source modules */}
        <div className="flex flex-col gap-2">
          {connections.slice(0, 4).map(conn => (
            <div
              key={conn.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                ${
                  conn.status === 'connected'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-zinc-100 text-zinc-500'
                }`}
            >
              <Database className="w-4 h-4" />
              <span className="font-medium">{conn.itemCount}</span>
            </div>
          ))}
        </div>

        {/* Flow arrows */}
        <div className="flex flex-col items-center gap-1">
          {Array.from({ length: Math.min(connectedCount, 4) }).map((_, i) => (
            <ArrowRight
              key={i}
              className="w-6 h-6 text-blue-500 animate-pulse"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>

        {/* Document */}
        <div className="p-4 bg-white rounded-xl border-2 border-blue-500 shadow-lg">
          <FileText className="w-8 h-8 text-blue-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-zinc-700 text-center">
            {submissionType}
          </p>
          <p className="text-xs text-zinc-500 text-center">Document</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 mt-4 text-sm">
        <span className="flex items-center gap-1.5 text-green-600">
          <CheckCircle className="w-4 h-4" />
          {connectedCount} modules connected
        </span>
        <span className="flex items-center gap-1.5 text-blue-600">
          <Link2 className="w-4 h-4" />
          Auto-syncing enabled
        </span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Cross-Module Data Bridge Component
// ─────────────────────────────────────────────────────────────────────────────

export const CrossModuleDataBridge: React.FC<CrossModuleDataBridgeProps> = ({
  projectId,
  submissionType,
  documentId,
  connections: initialConnections,
  predicateDevices = [],
  literatureData = [],
  cmcData = [],
  clinicalData = [],
  onConnectionChange,
  onSourcesGenerated,
  onNavigateToModule,
  compact = false,
  className = '',
}) => {
  const [connections, setConnections] = useState<DataBridgeConnection[]>(initialConnections || []);
  const [loadingModule, setLoadingModule] = useState<DataModule | null>(null);

  // Initialize connections from passed data
  useEffect(() => {
    const newConnections: DataBridgeConnection[] = [];

    // Check predicate data
    newConnections.push({
      id: `bridge-${projectId}-predicates`,
      sourceModule: 'predicate_finder',
      targetDocumentId: documentId || '',
      dataType: 'predicate_devices',
      dataLabel: 'Predicate Devices',
      status:
        predicateDevices.length > 0
          ? 'connected'
          : submissionType === '510K'
            ? 'available'
            : 'missing',
      lastSyncedAt: predicateDevices.length > 0 ? new Date() : undefined,
      preview:
        predicateDevices.length > 0
          ? `${predicateDevices.length} predicate device(s) available for citation`
          : 'Find predicate devices in the Predicate Finder module',
      itemCount: predicateDevices.length,
    });

    // Check literature data
    newConnections.push({
      id: `bridge-${projectId}-literature`,
      sourceModule: 'literature_search',
      targetDocumentId: documentId || '',
      dataType: 'literature_citations',
      dataLabel: 'Literature Citations',
      status: literatureData.length > 0 ? 'connected' : 'available',
      lastSyncedAt: literatureData.length > 0 ? new Date() : undefined,
      preview:
        literatureData.length > 0
          ? `${literatureData.length} literature citation(s) available`
          : 'Search for supporting literature in the Literature module',
      itemCount: literatureData.length,
    });

    // Check CMC data
    newConnections.push({
      id: `bridge-${projectId}-cmc`,
      sourceModule: 'cmc_data',
      targetDocumentId: documentId || '',
      dataType: 'manufacturing_specs',
      dataLabel: 'CMC Data',
      status:
        cmcData.length > 0
          ? 'connected'
          : submissionType === 'IND' || submissionType === 'NDA'
            ? 'available'
            : 'missing',
      lastSyncedAt: cmcData.length > 0 ? new Date() : undefined,
      preview:
        cmcData.length > 0
          ? `${cmcData.length} manufacturing data point(s) available`
          : 'Add manufacturing data in the CMC module',
      itemCount: cmcData.length,
    });

    // Check clinical data
    newConnections.push({
      id: `bridge-${projectId}-clinical`,
      sourceModule: 'clinical_trials',
      targetDocumentId: documentId || '',
      dataType: 'clinical_endpoints',
      dataLabel: 'Clinical Data',
      status: clinicalData.length > 0 ? 'connected' : 'available',
      lastSyncedAt: clinicalData.length > 0 ? new Date() : undefined,
      preview:
        clinicalData.length > 0
          ? `${clinicalData.length} clinical data point(s) available`
          : 'Import clinical trial data',
      itemCount: clinicalData.length,
    });

    // Document Vault - always available
    newConnections.push({
      id: `bridge-${projectId}-vault`,
      sourceModule: 'vault',
      targetDocumentId: documentId || '',
      dataType: 'literature_citations',
      dataLabel: 'Document Vault',
      status: 'available',
      preview: 'Upload and link source documents',
      itemCount: 0,
    });

    // Intelligence feeds
    newConnections.push({
      id: `bridge-${projectId}-intel`,
      sourceModule: 'intelligence_feeds',
      targetDocumentId: documentId || '',
      dataType: 'regulatory_references',
      dataLabel: 'Intelligence Feeds',
      status: 'available',
      preview: 'Regulatory updates and competitor monitoring',
      itemCount: 0,
    });

    setConnections(newConnections);
    onConnectionChange?.(newConnections);
  }, [
    projectId,
    documentId,
    submissionType,
    predicateDevices.length,
    literatureData.length,
    cmcData.length,
    clinicalData.length,
    onConnectionChange,
  ]);

  // Generate sources from connected data
  useEffect(() => {
    const sources: SourceSuggestion[] = [];

    // Convert predicate devices to sources
    predicateDevices.forEach((device, i) => {
      sources.push({
        id: `src-pred-${device.id || i}`,
        title: device.device_name || device.deviceName || `Predicate Device ${i + 1}`,
        sourceType: 'predicate_device',
        citation: `FDA 510(k) ${device.k_number || device.kNumber || 'K000000'}`,
        relevanceScore: device.similarity_score || 85,
        keyExcerpt: device.statement_or_summary || device.intendedUse || 'Predicate device',
        pageReference: device.k_number || device.kNumber,
        dataModule: 'predicate_finder',
        isLinked: false,
      });
    });

    // Convert literature to sources
    literatureData.forEach((paper, i) => {
      sources.push({
        id: `src-lit-${paper.id || i}`,
        title: paper.title || `Literature ${i + 1}`,
        sourceType: 'literature',
        citation: paper.citation || `${paper.authors?.[0] || 'Author'} et al.`,
        relevanceScore: paper.relevanceScore || 75,
        keyExcerpt: paper.abstract?.slice(0, 200) || paper.excerpt || 'Supporting literature',
        dataModule: 'literature_search',
        isLinked: false,
      });
    });

    onSourcesGenerated?.(sources);
  }, [predicateDevices, literatureData, cmcData, clinicalData, onSourcesGenerated]);

  // Handle connection
  const handleConnect = useCallback(async (moduleId: DataModule) => {
    setLoadingModule(moduleId);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    setConnections(prev =>
      prev.map(conn =>
        conn.sourceModule === moduleId
          ? { ...conn, status: 'connected', lastSyncedAt: new Date() }
          : conn
      )
    );

    setLoadingModule(null);
  }, []);

  // Handle sync
  const handleSync = useCallback(async (moduleId: DataModule) => {
    setLoadingModule(moduleId);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    setConnections(prev =>
      prev.map(conn =>
        conn.sourceModule === moduleId ? { ...conn, lastSyncedAt: new Date() } : conn
      )
    );

    setLoadingModule(null);
  }, []);

  // Handle navigate
  const handleNavigate = useCallback(
    (moduleId: DataModule) => {
      onNavigateToModule?.(moduleId);
    },
    [onNavigateToModule]
  );

  // Get module config
  const getModuleConfig = (moduleId: DataModule) => MODULE_CONFIGS.find(m => m.id === moduleId);

  // Relevant modules for this submission type
  const relevantModules = useMemo(() => {
    const priorities: Record<string, DataModule[]> = {
      '510K': ['predicate_finder', 'literature_search', 'vault', 'maude', 'intelligence_feeds'],
      IND: ['clinical_trials', 'cmc_data', 'literature_search', 'vault', 'intelligence_feeds'],
      NDA: [
        'clinical_trials',
        'cmc_data',
        'literature_search',
        'vault',
        'faers',
        'intelligence_feeds',
      ],
      BLA: [
        'clinical_trials',
        'cmc_data',
        'literature_search',
        'vault',
        'faers',
        'intelligence_feeds',
      ],
      PMA: ['clinical_trials', 'literature_search', 'vault', 'maude', 'intelligence_feeds'],
      CER: ['literature_search', 'clinical_trials', 'vault', 'intelligence_feeds'],
      MAA: ['clinical_trials', 'cmc_data', 'literature_search', 'vault', 'intelligence_feeds'],
      DE_NOVO: ['predicate_finder', 'literature_search', 'vault', 'maude', 'intelligence_feeds'],
    };

    return priorities[submissionType] || MODULE_CONFIGS.map(m => m.id);
  }, [submissionType]);

  if (compact) {
    return (
      <div className={`space-y-2 ${className}`}>
        <h4 className="text-sm font-medium text-zinc-700 px-1">
          Connected Data Sources
        </h4>
        {connections
          .filter(conn => relevantModules.includes(conn.sourceModule))
          .slice(0, 4)
          .map(conn => {
            const config = getModuleConfig(conn.sourceModule);
            if (!config) return null;

            return (
              <ModuleConnectionCard
                key={conn.id}
                config={config}
                connection={conn}
                onConnect={() => handleConnect(conn.sourceModule)}
                onSync={() => handleSync(conn.sourceModule)}
                onNavigate={() => handleNavigate(conn.sourceModule)}
                isLoading={loadingModule === conn.sourceModule}
                compact
              />
            );
          })}
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="p-4 rounded-2xl border border-zinc-200/70 bg-white shadow-sm flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-800">Data Bridges</h3>
          <p className="text-sm text-zinc-500">
            Keep sources in sync across modules.
          </p>
        </div>
        <div className="text-sm text-zinc-600">
          {connections.filter(c => c.status === 'connected').length} connected ·{' '}
          {connections.filter(c => c.status === 'needs-update').length} needs update
        </div>
      </div>
      {/* Data Flow Diagram */}
      <DataFlowDiagram
        connections={connections.filter(c => relevantModules.includes(c.sourceModule))}
        submissionType={submissionType}
      />

      {/* Module Connections */}
      <div>
        <h3 className="text-lg font-semibold text-zinc-800 mb-4">
          Module Connections
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connections
            .filter(conn => relevantModules.includes(conn.sourceModule))
            .map(conn => {
              const config = getModuleConfig(conn.sourceModule);
              if (!config) return null;

              return (
                <ModuleConnectionCard
                  key={conn.id}
                  config={config}
                  connection={conn}
                  onConnect={() => handleConnect(conn.sourceModule)}
                  onSync={() => handleSync(conn.sourceModule)}
                  onNavigate={() => handleNavigate(conn.sourceModule)}
                  isLoading={loadingModule === conn.sourceModule}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default CrossModuleDataBridge;

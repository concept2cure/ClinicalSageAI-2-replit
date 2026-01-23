/**
 * Neuro-Symbolic Dashboard
 * 
 * Visual interface for the Knowledge Graph and Multi-Agent Council.
 * Demonstrates the "Digital Regulatory Twin" concept.
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Brain,
  Network,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Users,
  GitBranch,
  Zap,
  Search,
  RefreshCw,
} from 'lucide-react';
import { knowledgeGraph, GraphStats } from '@/services/KnowledgeGraphClient';
import { draftingOrchestrator, DraftingSession } from '@/services/DraftingOrchestrator';

// Agent status component
const AgentStatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status) return <Badge variant="outline">Pending</Badge>;
  
  switch (status) {
    case 'COMPLETED':
      return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" /> Done</Badge>;
    case 'RUNNING':
      return <Badge className="bg-blue-500 animate-pulse"><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Running</Badge>;
    case 'FAILED':
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

// Graph Stats Panel
const GraphStatsPanel: React.FC<{ stats: GraphStats | undefined }> = ({ stats }) => {
  if (!stats) return null;
  
  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="text-center p-3 bg-slate-50 rounded-lg">
        <div className="text-2xl font-bold text-blue-600">{stats.totalAtoms}</div>
        <div className="text-xs text-slate-500">Data Atoms</div>
      </div>
      <div className="text-center p-3 bg-slate-50 rounded-lg">
        <div className="text-2xl font-bold text-purple-600">{stats.totalEdges}</div>
        <div className="text-xs text-slate-500">Graph Edges</div>
      </div>
      <div className="text-center p-3 bg-slate-50 rounded-lg">
        <div className="text-2xl font-bold text-emerald-600">{stats.totalEntities}</div>
        <div className="text-xs text-slate-500">Entities</div>
      </div>
      <div className="text-center p-3 bg-slate-50 rounded-lg">
        <div className="text-2xl font-bold text-amber-600">{stats.staleTraceabilityEntries}</div>
        <div className="text-xs text-slate-500">Stale Entries</div>
      </div>
    </div>
  );
};

// Council Workflow Visualization
const CouncilWorkflow: React.FC<{ session?: DraftingSession }> = ({ session }) => {
  const agents = [
    { role: 'DRAFTER', icon: '✍️', name: 'Drafter', desc: 'RAG-based drafting' },
    { role: 'STATISTICIAN', icon: '📊', name: 'Statistician', desc: 'Live data verification' },
    { role: 'CRITIC', icon: '🔍', name: 'Critic', desc: 'Red team review' },
    { role: 'SYNTHESIZER', icon: '🔄', name: 'Synthesizer', desc: 'Feedback synthesis' },
  ];

  const getAgentStatus = (role: string) => {
    if (!session) return 'pending';
    const statusMap: Record<string, string> = {
      DRAFTER: session.status === 'DRAFTING' ? 'RUNNING' : session.status !== 'INITIALIZED' ? 'COMPLETED' : 'pending',
      STATISTICIAN: session.status === 'VERIFYING' ? 'RUNNING' : ['REVIEWING', 'SYNTHESIZING', 'COMPLETED'].includes(session.status) ? 'COMPLETED' : 'pending',
      CRITIC: session.status === 'REVIEWING' ? 'RUNNING' : ['SYNTHESIZING', 'COMPLETED'].includes(session.status) ? 'COMPLETED' : 'pending',
      SYNTHESIZER: session.status === 'SYNTHESIZING' ? 'RUNNING' : session.status === 'COMPLETED' ? 'COMPLETED' : 'pending',
    };
    return statusMap[role] || 'pending';
  };

  return (
    <div className="flex items-center justify-between py-4">
      {agents.map((agent, idx) => (
        <React.Fragment key={agent.role}>
          <div className="flex flex-col items-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl ${
              getAgentStatus(agent.role) === 'RUNNING' ? 'bg-blue-100 animate-pulse' :
              getAgentStatus(agent.role) === 'COMPLETED' ? 'bg-green-100' : 'bg-slate-100'
            }`}>
              {agent.icon}
            </div>
            <div className="mt-2 text-sm font-medium">{agent.name}</div>
            <div className="text-xs text-slate-500">{agent.desc}</div>
            <AgentStatusBadge status={getAgentStatus(agent.role)} />
          </div>
          {idx < agents.length - 1 && (
            <div className="flex-1 h-0.5 bg-slate-200 mx-2 relative">
              <div className={`absolute top-0 left-0 h-full bg-green-500 transition-all duration-500 ${
                getAgentStatus(agents[idx + 1].role) !== 'pending' ? 'w-full' : 'w-0'
              }`} />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// Verification Log Panel
const VerificationLog: React.FC<{ verifications: any[] }> = ({ verifications }) => {
  if (!verifications || verifications.length === 0) {
    return <div className="text-slate-500 text-sm">No verifications yet</div>;
  }

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {verifications.map((v, idx) => (
        <div key={idx} className={`p-2 rounded text-sm ${
          v.status === 'DISCREPANCY' ? 'bg-red-50 border border-red-200' :
          v.status === 'VERIFIED' ? 'bg-green-50 border border-green-200' :
          'bg-slate-50 border border-slate-200'
        }`}>
          <div className="flex items-center gap-2">
            {v.status === 'DISCREPANCY' ? (
              <AlertTriangle className="w-4 h-4 text-red-500" />
            ) : v.status === 'VERIFIED' ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <Search className="w-4 h-4 text-slate-400" />
            )}
            <span className="font-medium">{v.claim_text || v.claim}</span>
          </div>
          {v.status === 'DISCREPANCY' && (
            <div className="mt-1 pl-6 text-xs">
              <span className="line-through text-red-500">{v.claimed_value || v.claimedValue}</span>
              {' → '}
              <span className="font-bold text-green-600">{v.actual_value || v.actualValue}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// Main Dashboard Component
export default function NeuroSymbolicDashboard() {
  const [activeSession, setActiveSession] = useState<DraftingSession | null>(null);
  const [verifications, setVerifications] = useState<any[]>([]);

  // Fetch graph stats
  const { data: graphStats, refetch: refetchStats } = useQuery({
    queryKey: ['neuro-symbolic', 'stats'],
    queryFn: () => knowledgeGraph.getStats(),
    refetchInterval: 30000,
  });

  // Fetch stale entries
  const { data: staleData } = useQuery({
    queryKey: ['neuro-symbolic', 'stale'],
    queryFn: () => knowledgeGraph.getStaleEntries(),
  });

  // Initialize session mutation
  const initSession = useMutation({
    mutationFn: (params: { sectionPath: string }) => 
      draftingOrchestrator.initializeSession(params),
    onSuccess: (data) => {
      setActiveSession({ 
        id: data.sessionId, 
        sectionPath: 'm2.7.3', 
        status: 'INITIALIZED',
        corrections: 0,
        issues: 0,
        log: ['Session initialized']
      });
    }
  });

  // Execute session mutation
  const executeSession = useMutation({
    mutationFn: (sessionId: string) => draftingOrchestrator.executeSession(sessionId),
    onSuccess: async (data) => {
      setActiveSession(data);
      // Fetch verifications
      const verData = await draftingOrchestrator.getVerifications(data.id);
      setVerifications(verData.verifications);
    }
  });

  const handleStartDemo = async () => {
    const result = await initSession.mutateAsync({ sectionPath: 'm2.7.3-clinical-summary' });
    // Auto-execute after initialization
    await executeSession.mutateAsync(result.sessionId);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-8 h-8 text-purple-600" />
            Neuro-Symbolic Regulatory Twin
          </h1>
          <p className="text-slate-500 mt-1">
            Combining Neural AI creativity with Symbolic graph logic for deterministic regulatory compliance
          </p>
        </div>
        <Button onClick={handleStartDemo} disabled={executeSession.isPending}>
          {executeSession.isPending ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Running Council...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              Demo: Draft m2.7.3
            </>
          )}
        </Button>
      </div>

      {/* Stats Row */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Network className="w-4 h-4" />
            Knowledge Graph Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <GraphStatsPanel stats={graphStats} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        {/* Council Workflow */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Multi-Agent Council Workflow
            </CardTitle>
            <CardDescription>
              Sequential agents: Drafter → Statistician (Live Data) → Critic (Red Team) → Synthesizer
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CouncilWorkflow session={activeSession || undefined} />
            
            {activeSession?.status === 'COMPLETED' && (
              <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-2 text-green-700 font-medium">
                  <CheckCircle2 className="w-5 h-5" />
                  Council Complete
                </div>
                <div className="mt-2 text-sm text-green-600">
                  {activeSession.corrections} corrections applied • {activeSession.issues} issues reviewed
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Verification Log */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-600" />
              Statistician Verification Log
            </CardTitle>
            <CardDescription>
              Live data binding checks against source databases
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VerificationLog verifications={verifications} />
            
            {activeSession && verifications.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 rounded text-xs">
                <strong>Log Example:</strong><br />
                "Statistician Agent corrected '45' to '42' based on source data."
              </div>
            )}
          </CardContent>
        </Card>

        {/* Traceability Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-amber-600" />
              Self-Healing Traceability Matrix
            </CardTitle>
            <CardDescription>
              Auto-detection of stale evidence when sources change
            </CardDescription>
          </CardHeader>
          <CardContent>
            {staleData?.count === 0 ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" />
                <span>All traceability entries current</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="w-5 h-5" />
                  <span>{staleData?.count} entries require review</span>
                </div>
                <div className="text-xs text-slate-500">
                  Sources have changed - dependent sections marked as SUSPECT
                </div>
              </div>
            )}
            
            <div className="mt-4 p-3 bg-slate-50 rounded text-xs">
              <strong>How it works:</strong><br />
              When Protocol v1 is updated, all draft sections linked via DERIVED_FROM edges 
              are automatically flagged for review. This prevents RTF rejections.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Architecture Explanation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">The Neuro-Symbolic Advantage</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 text-sm">
          <div className="p-3 bg-purple-50 rounded">
            <div className="font-medium text-purple-700">Neural (LLM)</div>
            <div className="text-slate-600 mt-1">
              Probabilistic • Creative drafting • Pattern recognition
            </div>
          </div>
          <div className="p-3 bg-blue-50 rounded">
            <div className="font-medium text-blue-700">Symbolic (Graph)</div>
            <div className="text-slate-600 mt-1">
              Deterministic • Fact-checking • Logic enforcement
            </div>
          </div>
          <div className="p-3 bg-green-50 rounded">
            <div className="font-medium text-green-700">Hybrid Result</div>
            <div className="text-slate-600 mt-1">
              Regulatory-grade output • Auditable • Zero hallucinations
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

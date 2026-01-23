/**
 * Drafting Orchestrator Service (Client-Side)
 * 
 * Manages the Multi-Agent Council workflow for regulatory document drafting.
 * Provides real-time progress updates and audit logs.
 */

import { apiRequest } from '../lib/queryClient';

export interface DraftingSession {
  id: string;
  sectionPath: string;
  status: 'INITIALIZED' | 'DRAFTING' | 'VERIFYING' | 'REVIEWING' | 'SYNTHESIZING' | 'COMPLETED' | 'FAILED';
  currentAgentRole?: string;
  draftText?: string;
  finalText?: string;
  corrections: number;
  issues: number;
  log: string[];
}

export interface Verification {
  claimText: string;
  claimedValue: string;
  actualValue: string | null;
  status: 'VERIFIED' | 'DISCREPANCY' | 'UNVERIFIABLE';
  correctedValue?: string;
}

export interface SessionProgress {
  sessionId: string;
  sectionPath: string;
  status: string;
  drafterStatus?: string;
  statisticianStatus?: string;
  criticStatus?: string;
  synthesizerStatus?: string;
  totalCorrections: number;
  totalIssuesFound: number;
  elapsedSeconds: number;
}

export class DraftingOrchestratorService {
  private baseUrl = '/api/neuro-symbolic';

  /**
   * Initialize a new drafting session
   */
  async initializeSession(params: {
    sectionPath: string;
    requirements?: Record<string, any>;
    contextAtomIds?: string[];
    programId?: string;
  }): Promise<{ sessionId: string }> {
    const response = await apiRequest('POST', `${this.baseUrl}/council/sessions`, params);
    return response.json();
  }

  /**
   * Execute the council workflow
   */
  async executeSession(sessionId: string): Promise<DraftingSession> {
    const response = await apiRequest('POST', `${this.baseUrl}/council/sessions/${sessionId}/execute`);
    return response.json();
  }

  /**
   * Get session progress
   */
  async getSessionProgress(sessionId: string): Promise<SessionProgress> {
    const response = await apiRequest('GET', `${this.baseUrl}/council/sessions/${sessionId}`);
    return response.json();
  }

  /**
   * Get verification results
   */
  async getVerifications(sessionId: string): Promise<{
    verifications: Verification[];
    summary: { totalClaims: number; verifiedCount: number; discrepancyCount: number };
    log: string[];
  }> {
    const response = await apiRequest('GET', `${this.baseUrl}/council/sessions/${sessionId}/verifications`);
    return response.json();
  }

  /**
   * Get list of registered agents
   */
  async getAgents(): Promise<{ agents: any[]; count: number }> {
    const response = await apiRequest('GET', `${this.baseUrl}/agents`);
    return response.json();
  }
}

// Singleton instance
export const draftingOrchestrator = new DraftingOrchestratorService();

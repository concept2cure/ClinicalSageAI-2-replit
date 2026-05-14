/**
 * AnA Cortex fallback client — pure async helper that POSTs a
 * stripped-down chat body to `/api/cortex/chat` when the AnA RI
 * primary path is unavailable.
 *
 * Extracted from AnaPersistentPanel.tsx as part of the staged split.
 * The Cortex endpoint is the degraded fallback: it has no
 * orchestration, memory injection, RIM interception, or evidence
 * validation — but it can still produce a usable text response when
 * AnA RI is down. The panel marks the result with `_fallback` so the
 * UI can flag the degraded capabilities to the user.
 *
 * @module client/src/concept2cure/components/chat/anaCortexClient
 */

interface ContextProfile {
  productType?: string;
  userRole?: string;
  screenName?: string;
  activeProject?: string;
  projectId?: string;
}

interface ConversationMessage {
  role: string;
  content: string;
}

interface CortexFallbackArgs {
  text: string;
  headers: Record<string, string>;
  chatMode: string;
  contextProfile?: ContextProfile;
  selectedProvider: string;
  conversationHistory: ConversationMessage[];
}

export interface CortexFallbackResult {
  /**
   * The unwrapped (`{success, data}`-aware) response payload from
   * Cortex with `_fallback` metadata attached. null when the request
   * failed.
   */
  rawData: Record<string, unknown> | null;
}

/**
 * Send the chat turn to the Cortex degraded endpoint. Returns
 * `{ rawData: null }` on any failure; the caller is expected to
 * surface that as the hard-fail UX.
 */
export async function requestCortexFallback({
  text,
  headers,
  chatMode,
  contextProfile,
  selectedProvider,
  conversationHistory,
}: CortexFallbackArgs): Promise<CortexFallbackResult> {
  try {
    const res = await fetch('/api/cortex/chat', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        message: text,
        chatMode,
        project_id: contextProfile?.projectId || undefined,
        submission_type: contextProfile?.productType || undefined,
        preferred_provider: selectedProvider !== 'auto' ? selectedProvider : undefined,
        context: {
          screen: contextProfile?.screenName,
          project: contextProfile?.activeProject,
          projectId: contextProfile?.projectId,
          productType: contextProfile?.productType,
          userRole: contextProfile?.userRole,
        },
        conversationHistory,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn(`[Cortex] ${res.status}: ${errBody.slice(0, 200)}`);
      return { rawData: null };
    }

    const rawData = await res.json();
    // Mark as fallback so the UI knows AnA RI capabilities (orchestration,
    // memory injection, RIM interception, evidence validation) are absent
    // from this response.
    if (rawData?.data) {
      rawData.data._fallback = {
        active: true,
        reason: 'ana_ri_unavailable',
        original_path: '/api/ana-ri/chat',
        degraded_capabilities: [
          'orchestration',
          'memory_injection',
          'rim_interception',
          'evidence_validation',
        ],
      };
    }
    return { rawData };
  } catch (err) {
    console.warn('[Cortex] Network error:', (err as Error)?.message);
    return { rawData: null };
  }
}

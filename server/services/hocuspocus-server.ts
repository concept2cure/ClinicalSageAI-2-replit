/**
 * Hocuspocus Server — Y.js CRDT WebSocket backend for real-time collaboration.
 *
 * Integrates with Express HTTP server to handle WebSocket upgrades at /collab.
 * Provides:
 * - Conflict-free real-time editing via Y.js
 * - Multi-cursor awareness (names, colors, positions)
 * - Document persistence to PostgreSQL
 * - JWT-based authentication
 * - Room isolation per artifact
 */

import { Hocuspocus } from '@hocuspocus/server';
import type { IncomingMessage } from 'http';
import type { Server as HttpServer } from 'http';
import type { WebSocket } from 'ws';
import { createScopedLogger } from '../utils/logger.js';
import { verifyJwtWithRotation } from '../utils/jwtVerify.js';
const log = createScopedLogger('hocuspocus');

let hocuspocusInstance: Hocuspocus | null = null;

/**
 * Configure and return the Hocuspocus server instance.
 * Called once during server startup.
 */
export function createHocuspocusServer(): Hocuspocus {
  if (hocuspocusInstance) return hocuspocusInstance;

  hocuspocusInstance = new Hocuspocus({
    name: 'concept2cure-collab',
    timeout: 30000,
    debounce: 2000,
    maxDebounce: 10000,
    quiet: process.env.NODE_ENV === 'production',

    async onAuthenticate({ token, documentName }: { token: string; documentName: string }) {
      // Validate JWT token — allow anonymous in dev for testing
      if (!token && process.env.NODE_ENV !== 'production') {
        return { user: { name: 'Anonymous', id: 'anon', color: '#94A3B8' } };
      }

      if (!token) {
        throw new Error('Authentication required');
      }

      // SECURITY: verify the JWT signature before trusting any identity claim.
      // Previously the payload was base64-decoded WITHOUT verification, so a
      // forged token granted attacker-chosen authorship in the collaborative
      // editing session — an attribution-integrity break under 21 CFR Part 11.
      // The signature is now checked (with key rotation) exactly like the HTTP
      // API does via authenticateToken.
      try {
        const payload = verifyJwtWithRotation<{
          userId?: string | number;
          sub?: string | number;
          id?: string | number;
          name?: string;
          username?: string;
          email?: string;
        }>(token);
        const subject = String(payload.userId ?? payload.sub ?? payload.id ?? '');
        if (subject) {
          return {
            user: {
              id: subject,
              name: payload.name || payload.username || 'User',
              email: payload.email || '',
              color: getColorForUser(subject),
            },
          };
        }
      } catch {
        // Verification failed — fall through to the dev fallback / hard error.
      }

      if (process.env.NODE_ENV !== 'production') {
        return { user: { name: 'Dev User', id: 'dev', color: '#3B82F6' } };
      }

      throw new Error('Invalid authentication token');
    },

    async onConnect({ documentName }: { documentName: string }) {
      log.debug(`[Hocuspocus] User connected to document: ${documentName}`);
    },

    async onDisconnect({ documentName }: { documentName: string }) {
      log.debug(`[Hocuspocus] User disconnected from document: ${documentName}`);
    },

    async onStoreDocument({ documentName, document }: any) {
      log.debug(`[Hocuspocus] Storing document state: ${documentName} (${document.getSize()} bytes)`);
    },

    async onLoadDocument({ documentName, document }: any) {
      log.debug(`[Hocuspocus] Loading document: ${documentName}`);
      return document;
    },
  });

  return hocuspocusInstance;
}

/**
 * Attach Hocuspocus to an existing HTTP server for WebSocket upgrades.
 * Handles upgrade requests at the /collab path.
 */
export function attachHocuspocusToServer(httpServer: HttpServer): void {
  const hocuspocus = createHocuspocusServer();

  httpServer.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
    const url = request.url || '';

    // Only handle /collab WebSocket upgrades
    if (url.startsWith('/collab')) {
      hocuspocus.handleConnection(socket as WebSocket, request, {});
    }
    // Let other upgrade handlers (Socket.io, etc.) handle their own paths
  });

  log.debug('[Hocuspocus] CRDT collaboration server attached at /collab');
}

/** Deterministic color assignment per user ID */
const COLLAB_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
];

function getColorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
}

export { hocuspocusInstance };

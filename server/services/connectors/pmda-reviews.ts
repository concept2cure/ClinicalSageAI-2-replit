/**
 * @fileoverview PMDA Review Reports Connector
 * Japanese Pharmaceuticals and Medical Devices Agency.
 *
 * No search is connected. PMDA publishes review reports as web pages and PDFs
 * with no search API, and nothing here reads them. Until 2026-10-01 `search`
 * answered every query with one result built from the query itself — "PMDA
 * Approved Drugs: <query>", relevanceScore 0.8 — which repository search
 * ranked beside real hits and deep research filed as primary-authority
 * regulatory intelligence. It now refuses, naming where to search by hand,
 * and callers report it as skipped.
 */

import {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';

const PMDA_REVIEWS_URL = 'https://www.pmda.go.jp/english/review-services/reviews/approved-information/drugs/0002.html';
const NOT_CONNECTED = `No PMDA search is connected: PMDA review reports have no search API and this connector does not read them. Search them at ${PMDA_REVIEWS_URL}.`;

export class PMDAConnector implements DataConnector {
  id = 'pmda_reviews';
  name = 'PMDA Review Reports';
  type = 'scraper' as const;
  requiresCredentials = false;
  requiredTier = 'professional';

  async status(): Promise<ConnectorHealth> {
    return { status: 'unavailable', lastChecked: new Date(), message: NOT_CONNECTED };
  }

  async search(_query: ConnectorQuery): Promise<ConnectorResult[]> {
    throw new Error(NOT_CONNECTED);
  }

  async fetch(_resourceId: string): Promise<ConnectorDocument> {
    throw new Error(NOT_CONNECTED);
  }

  async authenticate(_credentials: ConnectorCredentials): Promise<void> {}
}

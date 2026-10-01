/**
 * @fileoverview NMPA / CDE Connector
 * China National Medical Products Administration Center for Drug Evaluation.
 *
 * No search is connected: nothing here reads the CDE or NMPA databases. Until
 * 2026-10-01 `search` answered every query with one result built from the
 * query itself — "NMPA/CDE Approved Drugs: <query>", relevanceScore 0.7 —
 * which repository search ranked beside real hits and deep research filed as
 * primary-authority regulatory intelligence. It now refuses, naming where to
 * search by hand, and callers report it as skipped.
 */

import {
  DataConnector,
  ConnectorHealth,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';

const NOT_CONNECTED =
  'No NMPA / CDE search is connected: this connector does not read the CDE or NMPA databases. ' +
  'Search them at https://www.cde.org.cn/ or https://www.nmpa.gov.cn/.';

export class NMPACDEConnector implements DataConnector {
  id = 'nmpa_cde';
  name = 'NMPA / CDE';
  type = 'scraper' as const;
  requiresCredentials = false;
  requiredTier = 'professional';

  async status(): Promise<ConnectorHealth> {
    return { status: 'unavailable', lastChecked: new Date(), message: NOT_CONNECTED };
  }

  async search(): Promise<ConnectorResult[]> {
    throw new Error(NOT_CONNECTED);
  }

  async fetch(): Promise<ConnectorDocument> {
    throw new Error(NOT_CONNECTED);
  }

  async authenticate(_credentials: ConnectorCredentials): Promise<void> {}
}

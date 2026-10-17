/** Credentials, installed transport code and agency qualification are independent facts. */
export interface GatewayTransportReadiness {
  transport: string;
  implementation: 'implemented' | 'unverified' | 'unavailable';
  qualification: 'not_verified';
  qualified: false;
  reason: string;
  missingDependencies: string[];
}

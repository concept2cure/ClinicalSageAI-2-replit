declare module '@shared/schema' {
  export type RegulatoryAtom = {
    atomId: number;
    submissionId: string;
    atomType: string;
    atomData: unknown;
    complianceScore: number;
    applicableJurisdictions: string[];
  };
  
  export type User = {
    id: number;
    email: string;
    role: 'admin' | 'regulatory_lead' | 'user';
    organizationId: number;
  };
  
  export type AuditLog = {
    id: number;
    tableName: string;
    recordId: string;
    action: string;
    userId: number;
    timestamp: Date;
  };
}

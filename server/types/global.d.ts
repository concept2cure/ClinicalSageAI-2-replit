declare module '*services/ai/quality' {
  export function aiExtractSpecsFromText(text: string, productId?: string): Promise<any>;
  export function aiMapInstrumentCSV(csvData: any): Promise<any>;
  export function aiDeviationSummary(deviationData: any): Promise<any>;
  export function aiInterpretResult(testResult: any): Promise<any>;
  export function aiReleaseDecision(batchData: any): Promise<any>;
  export function aiDraftCOA(batchData: any): Promise<any>;
  export function aiNotificationText(eventData: any, context?: any): Promise<any>;
  export function cusum(data: number[], target?: number, k?: number, h?: number): any;
  export function nelson(data: number[]): any;
  export function stats(data: number[]): any;
  export function specCheck(value: number, spec: any): any;
  export function dissolutionStages(data: number[], Q: number): any;
  export function sstEvaluate(data: any, criteria: any): any;
  export function microEvaluate(data: any, limits: any): any;
}

declare module '*ai/quality' {
  export function aiReleaseDecision(batchData: any): Promise<any>;
  export function cusum(data: number[], target?: number, k?: number, h?: number): any;
  export function nelson(data: number[]): any;
}

declare module '*services/ai/qualityCoach.js' {
  export function aiQCCoach(ctx: any): Promise<any>;
  export function aiExplainHold(summary: any): Promise<any>;
}

declare module '*services/ai/whatif.js' {
  export function applyOverrides(summary: any, overrides?: any[]): any;
}

declare module '*services/ai/regulatory' {
  export function aiRiskSummary(programData: any): Promise<any>;
  export function aiNextActions(programData: any): Promise<any>;
  export function aiGateCheckFindings(data: any): Promise<any>;
  export function aiChangeClassify(changeData: any): Promise<any>;
  export function aiClassifyChange(changeData: any): Promise<any>;
  export function aiExtractQuestions(normalizedText: string, options?: any): Promise<any>;
  export function aiDraftResponse(
    questionText: string,
    evidence?: any,
    tone?: string
  ): Promise<any>;
  export function aiIRDraft(questionText: string, context?: any): Promise<any>;
}

declare module '*ai/regulatory' {
  export function aiRiskSummary(programData: any): Promise<any>;
  export function aiNextActions(programData: any): Promise<any>;
  export function aiGateCheckFindings(data: any): Promise<any>;
  export function aiChangeClassify(changeData: any): Promise<any>;
  export function aiClassifyChange(changeData: any): Promise<any>;
  export function aiExtractQuestions(normalizedText: string, options?: any): Promise<any>;
  export function aiDraftResponse(
    questionText: string,
    evidence?: any,
    tone?: string
  ): Promise<any>;
  export function aiIRDraft(questionText: string, context?: any): Promise<any>;
}

declare module '*services/ai/secDraft' {
  export function aiDraftSection(sectionData: any, context?: any): Promise<any>;
  export function aiClassifyChange(changeData: any): Promise<any>;
  export function aiExtractQuestions(documentText: string): Promise<any>;
  export function aiDraftResponse(questionData: any): Promise<any>;
}

declare module '*services/ai/strategy.js' {
  export function aiProposeControls(data: any): Promise<any>;
  export function aiDraftP34(data: any): Promise<any>;
}

declare module './services/auditService.js';
declare module './services/roleBasedAccess.js';
declare module './routes/cmc-dashboard.js';
declare module './api/enterprise/routes.js';
declare module './api/enterprise/rbac-routes.js';
declare module './routes/multiAgencyValidation.js';
declare module './routes/ind.js';
declare module './routes/docs.js';
declare module './routes/cmc-dashboard-simple.js';
declare module './routes/cmc-actions.js';
declare module './routes/cmc-tasks.js';
declare module './routes/analytical.js';
declare module './routes/analytical-database.js';
declare module './routes/analytical-enhanced.js';
declare module './routes/cmc-process.js';
declare module './routes/process-wizard.js';

declare module 'fast-xml-parser' {
  export class XMLBuilder {
    constructor(options?: any);
    build(obj: any): string;
  }
  export class XMLParser {
    constructor(options?: any);
    parse(xml: string): any;
  }
}

declare module '@google/generative-ai' {
  export class GoogleGenerativeAI {
    constructor(apiKey: string);
    getGenerativeModel(config: any): any;
  }
}

declare module '*.js' {
  const content: any;
  export default content;
}

declare module '*enhancedFaersService.js' {
  export class EnhancedFAERSClient {
    resolveToUnii(brandName: string): Promise<string | null>;
    resolveSubstanceName(brandName: string): Promise<string | null>;
    getAtcCodesForProduct(brandName: string): Promise<string[]>;
  }
  export function fetchFaersAnalysis(...args: any[]): Promise<any>;
}

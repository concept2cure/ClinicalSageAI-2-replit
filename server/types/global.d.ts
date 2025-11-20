declare module '*.js' {
  const content: any;
  export default content;
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
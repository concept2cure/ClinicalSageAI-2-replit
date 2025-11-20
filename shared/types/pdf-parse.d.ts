declare module 'pdf-parse' {
  interface PDFParseResult {
    text: string;
    numpages: number;
    info: {
      Title?: string;
      Author?: string;
      Creator?: string;
      Producer?: string;
      ModDate?: string;
      CreationDate?: string;
    };
    metadata?: any;
    version?: string;
  }

  function PDFParse(
    dataBuffer: Buffer,
    options?: {
      pagerender?: (pageData: any) => string;
      max?: number;
    }
  ): Promise<PDFParseResult>;

  export = PDFParse;
}

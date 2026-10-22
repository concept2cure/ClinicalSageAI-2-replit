declare module 'pdf-parse' {
  interface PDFParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: {
      PDFFormatVersion?: string;
      IsAcroFormPresent?: boolean;
      IsXFAPresent?: boolean;
      Title?: string;
      Author?: string;
      Subject?: string;
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
      version?: string;
    }
  ): Promise<PDFParseResult>;

  /** pdf-parse v2's named constructor, alongside the retained legacy callable type. */
  namespace PDFParse {
    interface PageTextResult {
      num: number;
      text: string;
    }
    interface TextResult {
      pages: PageTextResult[];
      text: string;
      total: number;
      getPageText(num: number): string;
    }
    interface TextParameters {
      partial?: number[];
      first?: number;
      last?: number;
      parseHyperlinks?: boolean;
      lineEnforce?: boolean;
      lineThreshold?: number;
      cellSeparator?: string;
      cellThreshold?: number;
      pageJoiner?: string;
      itemJoiner?: string;
      includeMarkedContent?: boolean;
      disableNormalization?: boolean;
    }
    class PDFParse {
      constructor(options: import('pdfjs-dist/types/src/display/api.js').DocumentInitParameters);
      getText(parameters?: TextParameters): Promise<TextResult>;
      destroy(): Promise<void>;
    }
  }

  export = PDFParse;
}

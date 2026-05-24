// Minimal vendor type stub for the untyped `xml2js` runtime dependency.
// Declares only the surface the codebase consumes (Builder + Parser). Mirrors
// the existing local-stub pattern (see server/types/pdfkit.d.ts) so we don't
// depend on an out-of-band @types/xml2js install that isn't in package.json.
declare module 'xml2js' {
  export interface BuilderOptions {
    headless?: boolean;
    rootName?: string;
    renderOpts?: { pretty?: boolean; indent?: string; newline?: string };
    xmldec?: { version?: string; encoding?: string; standalone?: boolean };
    cdata?: boolean;
    [key: string]: unknown;
  }

  export class Builder {
    constructor(options?: BuilderOptions);
    buildObject(rootObj: unknown): string;
  }

  export interface ParserOptions {
    explicitArray?: boolean;
    explicitRoot?: boolean;
    ignoreAttrs?: boolean;
    mergeAttrs?: boolean;
    trim?: boolean;
    [key: string]: unknown;
  }

  export class Parser {
    constructor(options?: ParserOptions);
    parseStringPromise(str: string): Promise<unknown>;
    parseString(str: string, cb: (err: Error | null, result: unknown) => void): void;
  }

  export function parseStringPromise(str: string, options?: ParserOptions): Promise<unknown>;
  export function parseString(
    str: string,
    cb: (err: Error | null, result: unknown) => void,
  ): void;
}

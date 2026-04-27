/**
 * Type declarations for third-party libraries without TypeScript definitions
 */

/// <reference lib="DOM" />

// ============================================================================
// Lodash Modules
// ============================================================================
declare module 'lodash/debounce' {
  interface DebounceSettings {
    leading?: boolean;
    maxWait?: number;
    trailing?: boolean;
  }

  interface DebouncedFunc<T extends (...args: any[]) => any> {
    (...args: Parameters<T>): ReturnType<T> | undefined;
    cancel(): void;
    flush(): ReturnType<T> | undefined;
  }

  function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait?: number,
    options?: DebounceSettings
  ): DebouncedFunc<T>;

  export default debounce;
}

declare module 'lodash/throttle' {
  interface ThrottleSettings {
    leading?: boolean;
    trailing?: boolean;
  }

  interface ThrottledFunc<T extends (...args: any[]) => any> {
    (...args: Parameters<T>): ReturnType<T> | undefined;
    cancel(): void;
    flush(): ReturnType<T> | undefined;
  }

  function throttle<T extends (...args: any[]) => any>(
    func: T,
    wait?: number,
    options?: ThrottleSettings
  ): ThrottledFunc<T>;

  export default throttle;
}

// ============================================================================
// Mammoth (DOCX to HTML converter)
// ============================================================================
declare module 'mammoth' {
  interface ConversionResult {
    value: string;
    messages: Array<{
      type: string;
      message: string;
      paragraph?: any;
    }>;
  }

  interface Options {
    styleMap?: string[];
    includeEmbeddedStyleMap?: boolean;
    includeDefaultStyleMap?: boolean;
    convertImage?: (image: any) => Promise<{ src: string }>;
    ignoreEmptyParagraphs?: boolean;
    idPrefix?: string;
    transformDocument?: (document: any) => any;
  }

  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer } | { path: string } | { buffer: Buffer },
    options?: Options
  ): Promise<ConversionResult>;
  export function convertToMarkdown(
    input: { arrayBuffer: ArrayBuffer } | { path: string } | { buffer: Buffer },
    options?: Options
  ): Promise<ConversionResult>;
  export function extractRawText(
    input: { arrayBuffer: ArrayBuffer } | { path: string } | { buffer: Buffer }
  ): Promise<ConversionResult>;

  export const images: {
    imgElement: (
      callback: (image: any) => Promise<{ src: string }>
    ) => (image: any) => Promise<{ src: string }>;
    dataUri: (image: any) => Promise<{ src: string }>;
  };
}

// ============================================================================
// File Saver
// ============================================================================
declare module 'file-saver' {
  export function saveAs(
    data: Blob | File | string,
    filename?: string,
    options?: { autoBom?: boolean }
  ): void;
}

declare module 'cheerio';

// ============================================================================
// Testing Library Extensions
// ============================================================================
declare namespace jest {
  interface Matchers<R> {
    toBeInTheDocument(): R;
    toHaveTextContent(text: string | RegExp): R;
    toBeVisible(): R;
    toBeDisabled(): R;
    toBeEnabled(): R;
    toHaveClass(className: string): R;
    toHaveStyle(style: Record<string, any>): R;
    toHaveAttribute(attr: string, value?: string): R;
    toHaveValue(value: string | string[] | number): R;
    toBeChecked(): R;
    toHaveFocus(): R;
  }
}

// ============================================================================
// HTML2Canvas
// ============================================================================
declare module 'html2canvas' {
  interface Html2CanvasOptions {
    allowTaint?: boolean;
    backgroundColor?: string | null;
    canvas?: HTMLCanvasElement;
    foreignObjectRendering?: boolean;
    imageTimeout?: number;
    ignoreElements?: (element: Element) => boolean;
    logging?: boolean;
    onclone?: (document: globalThis.Document, element: HTMLElement) => void;
    proxy?: string;
    removeContainer?: boolean;
    scale?: number;
    useCORS?: boolean;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    scrollX?: number;
    scrollY?: number;
    windowWidth?: number;
    windowHeight?: number;
  }

  function html2canvas(
    element: HTMLElement,
    options?: Html2CanvasOptions
  ): Promise<HTMLCanvasElement>;
  export default html2canvas;
}
// ============================================================================
// PDF Parse
// ============================================================================
declare module 'pdf-parse' {
  interface PDFData {
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
      CreationDate?: string;
      ModDate?: string;
    };
    metadata: any;
    text: string;
    version: string;
  }

  interface PDFOptions {
    pagerender?: (pageData: any) => string;
    max?: number;
    version?: string;
  }

  function pdfParse(dataBuffer: Buffer, options?: PDFOptions): Promise<PDFData>;
  export = pdfParse;
}

// ============================================================================
// Vitest Globals
// ============================================================================
declare const vi: {
  fn: <T extends (...args: any[]) => any>(
    implementation?: T
  ) => T & {
    mockResolvedValue: (value: any) => any;
    mockRejectedValue: (value: any) => any;
    mockImplementation: (fn: T) => any;
    mockReturnValue: (value: any) => any;
    mockClear: () => void;
    mockReset: () => void;
    mock: { calls: any[][]; results: any[] };
  };
  mock: (path: string, factory?: () => any) => void;
  unmock: (path: string) => void;
  resetModules: () => void;
  clearAllMocks: () => void;
  spyOn: <T extends object, M extends keyof T>(object: T, method: M) => any;
};

// ============================================================================
// Shepherd.js Tour Library
// ============================================================================
declare module 'shepherd.js' {
  export interface StepOptions {
    id?: string;
    title?: string;
    text?: string | HTMLElement;
    attachTo?: {
      element: string | HTMLElement;
      on: string;
    };
    beforeShowPromise?: () => Promise<void>;
    buttons?: Array<{
      text: string;
      action: () => void;
      classes?: string;
      secondary?: boolean;
    }>;
    classes?: string;
    advanceOn?: {
      selector: string;
      event: string;
    };
    cancelIcon?: {
      enabled: boolean;
    };
    scrollTo?:
      | boolean
      | {
          behavior?: 'auto' | 'smooth';
          block?: 'start' | 'center' | 'end' | 'nearest';
          inline?: 'start' | 'center' | 'end' | 'nearest';
        };
    when?: {
      show?: () => void;
      hide?: () => void;
    };
  }

  export interface TourOptions {
    defaultStepOptions?: Partial<StepOptions>;
    useModalOverlay?: boolean;
    confirmCancel?: boolean;
    confirmCancelMessage?: string;
    exitOnEsc?: boolean;
    keyboardNavigation?: boolean;
  }

  export class Tour {
    constructor(options?: TourOptions);
    addStep(options: StepOptions): this;
    addSteps(steps: StepOptions[]): this;
    back(): void;
    cancel(): void;
    complete(): void;
    getCurrentStep(): any;
    hide(): void;
    isActive(): boolean;
    next(): void;
    on(event: string, handler: () => void): void;
    off(event: string, handler?: () => void): void;
    once(event: string, handler: () => void): void;
    removeStep(id: string): void;
    show(id?: string | number): void;
    start(): void;
    steps: any[];
  }

  export default { Tour };
}

// ============================================================================
// jsonwebtoken
// ============================================================================
declare module 'jsonwebtoken' {
  export interface SignOptions {
    algorithm?: string;
    expiresIn?: string | number;
    notBefore?: string | number;
    audience?: string | string[];
    subject?: string;
    issuer?: string;
    jwtid?: string;
    mutatePayload?: boolean;
    noTimestamp?: boolean;
    header?: Record<string, unknown>;
    encoding?: string;
  }

  export interface VerifyOptions {
    algorithms?: string[];
    audience?: string | string[];
    clockTimestamp?: number;
    clockTolerance?: number;
    complete?: boolean;
    issuer?: string | string[];
    ignoreExpiration?: boolean;
    ignoreNotBefore?: boolean;
    jwtid?: string;
    nonce?: string;
    subject?: string;
    maxAge?: string | number;
  }

  export interface DecodeOptions {
    complete?: boolean;
    json?: boolean;
  }

  export interface JwtPayload {
    [key: string]: unknown;
    iss?: string;
    sub?: string;
    aud?: string | string[];
    exp?: number;
    nbf?: number;
    iat?: number;
    jti?: string;
  }

  export function sign(
    payload: string | Buffer | object,
    secretOrPrivateKey: string | Buffer,
    options?: SignOptions
  ): string;

  export function verify(
    token: string,
    secretOrPublicKey: string | Buffer,
    options?: VerifyOptions
  ): JwtPayload | string;

  export function decode(token: string, options?: DecodeOptions): null | JwtPayload | string;

  export class JsonWebTokenError extends Error {
    inner: Error;
    constructor(message: string, error?: Error);
  }

  export class TokenExpiredError extends JsonWebTokenError {
    expiredAt: Date;
    constructor(message: string, expiredAt: Date);
  }

  export class NotBeforeError extends JsonWebTokenError {
    date: Date;
    constructor(message: string, date: Date);
  }
}

// ============================================================================
// node-cron
// ============================================================================
declare module 'node-cron' {
  export interface ScheduleOptions {
    scheduled?: boolean;
    timezone?: string;
    name?: string;
    runOnInit?: boolean;
    recoverMissedExecutions?: boolean;
  }

  export interface ScheduledTask {
    start: () => void;
    stop: () => void;
  }

  export function schedule(
    expression: string,
    func: () => void | Promise<void>,
    options?: ScheduleOptions
  ): ScheduledTask;

  export function validate(expression: string): boolean;
  export function getTasks(): Map<string, ScheduledTask>;
}

// ============================================================================
// @google/generative-ai — stub for optional dependency
// ============================================================================
declare module '@google/generative-ai' {
  export class GoogleGenerativeAI {
    constructor(apiKey: string);
    getGenerativeModel(params: { model: string; [key: string]: unknown }): GenerativeModel;
  }

  export interface GenerativeModel {
    generateContent(prompt: string | unknown[]): Promise<GenerateContentResult>;
    startChat(params?: unknown): ChatSession;
  }

  export interface ChatSession {
    sendMessage(message: string): Promise<GenerateContentResult>;
  }

  export interface GenerateContentResult {
    response: {
      text: () => string;
      candidates?: unknown[];
    };
  }

  export enum HarmCategory {
    HARM_CATEGORY_HARASSMENT = 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH = 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT = 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_DANGEROUS_CONTENT = 'HARM_CATEGORY_DANGEROUS_CONTENT',
    HARM_CATEGORY_UNSPECIFIED = 'HARM_CATEGORY_UNSPECIFIED',
  }

  export enum HarmBlockThreshold {
    BLOCK_NONE = 'BLOCK_NONE',
    BLOCK_ONLY_HIGH = 'BLOCK_ONLY_HIGH',
    BLOCK_MEDIUM_AND_ABOVE = 'BLOCK_MEDIUM_AND_ABOVE',
    BLOCK_LOW_AND_ABOVE = 'BLOCK_LOW_AND_ABOVE',
    HARM_BLOCK_THRESHOLD_UNSPECIFIED = 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
  }

  export interface Part {
    text?: string;
    inlineData?: {
      mimeType: string;
      data: string;
    };
  }
}

// ============================================================================
// speakeasy — TOTP/HOTP one-time password library (no @types/speakeasy)
// ============================================================================
declare module 'speakeasy' {
  export interface GeneratedSecret {
    ascii: string;
    hex: string;
    base32: string;
    otpauth_url?: string;
  }

  export function generateSecret(options?: {
    length?: number;
    name?: string;
    issuer?: string;
    symbols?: boolean;
    otpauth_url?: boolean;
  }): GeneratedSecret;

  export namespace totp {
    export function generate(options: {
      secret: string;
      encoding?: 'ascii' | 'hex' | 'base32' | 'base64';
      algorithm?: 'sha1' | 'sha256' | 'sha512';
      digits?: number;
      step?: number;
      time?: number;
      counter?: number;
    }): string;

    export function verify(options: {
      secret: string;
      encoding?: 'ascii' | 'hex' | 'base32' | 'base64';
      token: string;
      algorithm?: 'sha1' | 'sha256' | 'sha512';
      digits?: number;
      step?: number;
      time?: number;
      counter?: number;
      window?: number;
    }): boolean;
  }

  export namespace hotp {
    export function generate(options: {
      secret: string;
      counter: number;
      encoding?: 'ascii' | 'hex' | 'base32' | 'base64';
      digits?: number;
    }): string;

    export function verify(options: {
      secret: string;
      counter: number;
      token: string;
      encoding?: 'ascii' | 'hex' | 'base32' | 'base64';
      digits?: number;
      window?: number;
    }): boolean;
  }
}

// ============================================================================
// qrcode — QR code generator (no @types/qrcode)
// ============================================================================
declare module 'qrcode' {
  export interface QRCodeRenderersOptions {
    margin?: number;
    scale?: number;
    width?: number;
    color?: { dark?: string; light?: string };
  }

  export function toDataURL(
    text: string,
    options?: QRCodeRenderersOptions
  ): Promise<string>;

  export function toString(
    text: string,
    options?: { type?: 'svg' | 'utf8' | 'terminal' } & QRCodeRenderersOptions
  ): Promise<string>;

  export function toFile(
    path: string,
    text: string,
    options?: { type?: 'png' | 'svg' } & QRCodeRenderersOptions
  ): Promise<void>;
}

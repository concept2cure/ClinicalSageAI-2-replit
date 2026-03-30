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
// jsPDF AutoTable Plugin
// ============================================================================
declare module 'jspdf-autotable' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  import type { jsPDF } from 'jspdf';

  interface AutoTableOptions {
    startY?: number;
    head?: any[][];
    body?: any[][];
    foot?: any[][];
    columns?: any[];
    margin?: { top?: number; right?: number; bottom?: number; left?: number } | number;
    styles?: any;
    headStyles?: any;
    bodyStyles?: any;
    footStyles?: any;
    alternateRowStyles?: any;
    columnStyles?: { [key: string]: any };
    theme?: 'striped' | 'grid' | 'plain';
    tableWidth?: 'auto' | 'wrap' | number;
    showHead?: 'everyPage' | 'firstPage' | 'never';
    showFoot?: 'everyPage' | 'lastPage' | 'never';
    tableLineColor?: number | number[];
    tableLineWidth?: number;
    didParseCell?: (data: any) => void;
    willDrawCell?: (data: any) => void;
    didDrawCell?: (data: any) => void;
    didDrawPage?: (data: any) => void;
  }

  // Extend jsPDF interface
  module 'jspdf' {
    interface jsPDF {
      autoTable: (options: AutoTableOptions) => jsPDF;
      lastAutoTable: {
        finalY: number;
        pageNumber: number;
        startPageNumber: number;
      };
    }
  }
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
declare module '@aws-sdk/client-s3';

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
// HuggingFace Inference Extensions
// ============================================================================
declare module '@huggingface/inference' {
  export class HuggingFaceInference {
    constructor(accessToken: string);
    textGeneration(params: {
      model: string;
      inputs: string;
      parameters?: {
        max_new_tokens?: number;
        temperature?: number;
        top_p?: number;
        do_sample?: boolean;
      };
    }): Promise<{ generated_text: string }>;
    invoke(text: string): Promise<string>;
    translation(params: { model: string; inputs: string }): Promise<{ translation_text: string }>;
  }
}

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

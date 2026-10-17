declare module 'pdfkit' {
  import { EventEmitter } from 'events';

  class PDFDocument extends EventEmitter {
    constructor(options?: PDFDocumentOptions);
    addPage(options?: PDFDocumentOptions): this;
    bufferedPageRange(): { start: number; count: number };
    switchToPage(pageNumber: number): this;
    pipe(destination: NodeJS.WritableStream): NodeJS.WritableStream;
    fontSize(size: number): this;
    font(font: string): this;
    registerFont(name: string, src: string | Uint8Array, family?: string): this;
    widthOfString(text: string, options?: TextOptions): number;
    openImage(source: PDFImageData): PDFImage;
    image(source: PDFImageData | PDFImage, options?: ImageOptions): this;
    image(source: PDFImageData | PDFImage, x?: number, y?: number, options?: ImageOptions): this;
    text(text: string, options?: TextOptions): this;
    text(text: string, x?: number, y?: number, options?: TextOptions): this;
    moveDown(lines?: number): this;
    moveUp(lines?: number): this;
    save(): this;
    restore(): this;
    rotate(angle: number, options?: { origin?: [number, number] }): this;
    translate(x: number, y: number): this;
    lineWidth(width: number): this;
    strokeColor(color: string): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    circle(x: number, y: number, radius: number): this;
    rect(x: number, y: number, width: number, height: number): this;
    fill(color?: string): this;
    stroke(color?: string): this;
    markContent(tag: string, options?: { actual?: string; alt?: string; lang?: string; expanded?: string }): this;
    endMarkedContent(): this;
    fillColor(color: string, opacity?: number): this;
    opacity(opacity: number): this;
    end(): void;
    page: {
      margins: {
        left: number;
        right: number;
        top: number;
        bottom: number;
      };
      width: number;
      height: number;
    };
  }

  type PDFImageData = string | Buffer | ArrayBuffer;
  /** Handle returned by PDFKit's PNG/JPEG decoder; reusable across PDF pages. */
  interface PDFImage {
    readonly width: number;
    readonly height: number;
    readonly label: string;
    readonly orientation?: number;
    embed(document: PDFDocument): void;
  }

  interface ImageOptions {
    width?: number;
    height?: number;
    scale?: number;
    fit?: [number, number];
    cover?: [number, number];
    align?: 'left' | 'center' | 'right';
    valign?: 'top' | 'center' | 'bottom';
    ignoreOrientation?: boolean;
  }

  interface PDFDocumentOptions {
    margin?: number;
    autoFirstPage?: boolean;
    margins?: {
      top?: number;
      bottom?: number;
      left?: number;
      right?: number;
    };
    info?: {
      Title?: string;
      Author?: string;
      Subject?: string;
      Keywords?: string;
      Creator?: string;
      Producer?: string;
      CreationDate?: Date;
      ModDate?: Date;
    };
    bufferPages?: boolean;
    layout?: 'portrait' | 'landscape';
    size?: string | [number, number];
  }

  interface TextOptions {
    features?: string[] | Record<string, boolean>;
    align?: 'left' | 'center' | 'right' | 'justify';
    width?: number;
    height?: number;
    lineBreak?: boolean;
    ellipsis?: boolean | string;
    columns?: number;
    columnGap?: number;
    indent?: number;
    paragraphGap?: number;
    lineGap?: number;
    fill?: boolean;
    stroke?: boolean;
    continued?: boolean;
    underline?: boolean;
    link?: string;
    oblique?: boolean;
    baseline?:
      | number
      | 'svg-middle'
      | 'middle'
      | 'svg-central'
      | 'mathematical'
      | 'ideographic'
      | 'alphabetic'
      | 'hanging'
      | 'top'
      | 'bottom';
  }

  export default PDFDocument;
}

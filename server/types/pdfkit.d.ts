declare module 'pdfkit' {
  import { EventEmitter } from 'events';
  import { Readable } from 'stream';

  class PDFDocument extends EventEmitter {
    constructor(options?: PDFDocumentOptions);
    addPage(options?: PDFDocumentOptions): this;
    bufferedPageRange(): { start: number; count: number };
    switchToPage(pageNumber: number): this;
    pipe(destination: NodeJS.WritableStream): NodeJS.WritableStream;
    fontSize(size: number): this;
    font(font: string): this;
    text(text: string, options?: TextOptions): this;
    text(text: string, x?: number, y?: number, options?: TextOptions): this;
    moveDown(lines?: number): this;
    moveUp(lines?: number): this;
    save(): this;
    restore(): this;
    rotate(angle: number, options?: { origin?: [number, number] }): this;
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

  interface PDFDocumentOptions {
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
    };
    bufferPages?: boolean;
    layout?: 'portrait' | 'landscape';
    size?: string | [number, number];
  }

  interface TextOptions {
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

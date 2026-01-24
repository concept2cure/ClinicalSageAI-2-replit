import { useEffect, useRef } from 'react';
import { pdfjs } from 'react-pdf';
import * as PDFAnnotate from 'pdf-annotate.js';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;

export default function AnnotatedViewer({ url }) {
  const container = useRef(null);

  useEffect(() => {
    if (!url) return;

    PDFAnnotate.UI.render({
      pdf: url,
      container: container.current,
      readOnly: false,
    });

    return () => {
      // Cleanup when component unmounts
      PDFAnnotate.UI.disableEdit();
    };
  }, [url]);

  return (
    <div ref={container} className="border rounded-lg shadow-inner max-h-[80vh] overflow-auto" />
  );
}

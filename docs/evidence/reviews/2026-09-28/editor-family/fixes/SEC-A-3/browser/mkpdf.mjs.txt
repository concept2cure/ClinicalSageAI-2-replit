// A minimal, valid one-page PDF with a visible line of text, offsets computed.
const objs = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  null,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
const text = 'BT /F1 28 Tf 30 100 Td (PDF RENDERED OK) Tj ET';
objs[3] = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
let out = '%PDF-1.4\n';
const offs = [];
objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
const xref = out.length;
out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
process.stdout.write(Buffer.from(out).toString('base64'));

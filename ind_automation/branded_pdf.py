from ind_automation import pii_filter
import io, os, datetime
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from PyPDF2 import PdfReader, PdfWriter

def build_cover(org):
    buf=io.BytesIO(); c=canvas.Canvas(buf,pagesize=letter)
    c.setFont('Helvetica-Bold',24); c.drawCentredString(310,650,'Compliance Insights Report')
    c.setFont('Helvetica',14); c.drawCentredString(310,620,org)
    c.setFont('Helvetica',10); c.drawCentredString(310,600,datetime.date.today().isoformat())
    logo=os.getenv('ORG_LOGO_URL');
    if logo: c.drawImage(logo,240,680,width=140,height=40,preserveAspectRatio=True,mask='auto')
    c.showPage(); c.save(); buf.seek(0); return buf

def add_footer(reader,writer,org):
    for page in reader.pages:
        packet=io.BytesIO(); c=canvas.Canvas(packet,pagesize=letter)
        c.setFont('Helvetica',8); c.drawCentredString(310,20,f'{org} – Confidential   Page {reader.pages.index(page)+1}')
        c.save(); packet.seek(0)
        footer_reader=PdfReader(packet); page.merge_page(footer_reader.pages[0]); writer.add_page(page)

def brand_pdf(snapshot_bytes, org):
    cover=PdfReader(build_cover(org))
    main=PdfReader(io.BytesIO(snapshot_bytes))
    writer=PdfWriter(); writer.add_page(cover.pages[0])
    add_footer(main,writer,org)
    buf=io.BytesIO(); content=buf.getvalue()
clean,_=pii_filter.redact(content.decode(errors="ignore"))
buf=io.BytesIO(clean.encode())
writer.write(buf); buf.seek(0); return buf

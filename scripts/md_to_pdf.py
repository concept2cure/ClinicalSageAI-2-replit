#!/usr/bin/env python3
"""Minimal markdown to PDF converter using reportlab.
Converts headings and paragraphs; suitable for CSR drafting purposes.
"""
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import inch

import markdown


def md_to_pdf(md_path, pdf_path):
    with open(md_path, 'r', encoding='utf-8') as fh:
        md_text = fh.read()
    # Convert markdown to basic HTML then to paragraphs
    html = markdown.markdown(md_text)
    # Simple split by newline paragraphs after stripping tags somewhat
    # Use reportlab Paragraph which accepts a subset of HTML
    doc = SimpleDocTemplate(pdf_path, pagesize=letter,
                            rightMargin=72,leftMargin=72,
                            topMargin=72,bottomMargin=72)
    styles = getSampleStyleSheet()
    story = []
    # Split by <h1>, <h2>, <h3>, and <p>
    # We will replace headings with strong paragraphs
    import re
    # Insert horizontal splits between block tags
    tokens = re.split(r'(?:<h1>|<h2>|<h3>|<p>|<ul>|<ol>)', html)
    # Very naive: create paragraphs from tokens
    for t in tokens:
        s = t.strip()
        if not s:
            continue
        # Remove closing tags
        s = re.sub(r'</h1>|</h2>|</h3>|</p>|</ul>|</ol>|<li>|</li>', '', s)
        # Replace remaining <strong> and <em> with simple tags
        s = s.replace('<strong>', '<b>').replace('</strong>', '</b>')
        s = s.replace('<em>', '<i>').replace('</em>', '</i>')
        # Replace list items
        s = s.replace('<li>', '• ')
        # Append paragraph
        story.append(Paragraph(s, styles['Normal']))
        story.append(Spacer(1, 0.12*inch))
    doc.build(story)
    print(f'Wrote PDF to {pdf_path}')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: md_to_pdf.py <input.md> <output.pdf>')
        sys.exit(2)
    md_to_pdf(sys.argv[1], sys.argv[2])

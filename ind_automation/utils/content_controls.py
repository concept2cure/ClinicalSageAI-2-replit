"""
Content Control injection for eCTD 4.0.
Uses Structured Document Tags (SDT) with eCTD 4.0 tag conventions.
"""

from docx.oxml import OxmlElement
from docx.oxml.ns import qn


def inject_sdt_to_paragraph(paragraph, tag: str, content: str, alias: str = None):
    """
    Inject SDT (Content Control) into paragraph.
    Tag format: eCTD 4.0 camelCase (e.g., "studyIdentifier", "pkCmaxValue")
    """
    # Clear paragraph
    paragraph._p.clear()

    # Create SDT
    sdt = OxmlElement('w:sdt')

    # Properties
    sdt_pr = OxmlElement('w:sdtPr')

    # Tag (machine-readable, eCTD 4.0 style)
    tag_el = OxmlElement('w:tag')
    tag_el.set(qn('w:val'), tag)
    sdt_pr.append(tag_el)

    # Alias (human-readable)
    if alias:
        alias_el = OxmlElement('w:alias')
        alias_el.set(qn('w:val'), alias)
        sdt_pr.append(alias_el)

    # ID
    id_el = OxmlElement('w:id')
    id_el.set(qn('w:val'), str(abs(hash(tag)) % (10**9)))
    sdt_pr.append(id_el)

    # Lock content (prevent accidental deletion in Word)
    lock = OxmlElement('w:lock')
    lock.set(qn('w:val'), 'sdtLocked')
    sdt_pr.append(lock)

    # Content
    sdt_content = OxmlElement('w:sdtContent')
    run = OxmlElement('w:r')
    text = OxmlElement('w:t')
    text.text = content
    run.append(text)
    sdt_content.append(run)

    sdt.append(sdt_pr)
    sdt.append(sdt_content)
    paragraph._p.append(sdt)

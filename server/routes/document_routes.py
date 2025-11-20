"""
Document rendering routes - provides PDF page access and document info
"""
import os
import fitz  # PyMuPDF
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response, JSONResponse
from sqlalchemy.orm import Session
from server.db import get_db
from server.models.csr import CSR

router = APIRouter(prefix="/api/documents")

def get_pdf_path(doc_id):
    """Get PDF path for a document - adapt to your storage structure"""
    # Try multiple potential locations
    paths = [
        f"./uploads/csrs/{doc_id}.pdf",
        f"./output/csrs/{doc_id}.pdf",
        f"./csrs/{doc_id}.pdf",
    ]
    
    for path in paths:
        if os.path.isfile(path):
            return path
            
    # If we have a database record with a path, use that
    db = next(get_db())
    doc = db.query(CSR).filter(CSR.id == doc_id).first()
    if doc and doc.pdf_path and os.path.isfile(doc.pdf_path):
        return doc.pdf_path
    
    # Default fallback - might not exist
    return f"./uploads/csrs/{doc_id}.pdf"

@router.get("/{doc_id}")
def get_document(doc_id: int, db: Session = Depends(get_db)):
    """Get document metadata and content"""
    doc = db.query(CSR).filter(CSR.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Return document with limited content preview
    return {
        "id": doc.id,
        "title": getattr(doc, "title", f"Document {doc.id}"),
        "content": doc.content[:10000] + ("..." if len(doc.content or "") > 10000 else ""),
        "has_pdf": os.path.isfile(get_pdf_path(doc_id))
    }

@router.get("/{doc_id}/page/{pg}.png")
def page_png(doc_id: int, pg: int):
    """Render a PDF page as PNG image"""
    try:
        # Find the PDF file
        pdf_path = get_pdf_path(doc_id)
        if not os.path.isfile(pdf_path):
            raise HTTPException(status_code=404, detail="PDF not found")
            
        # Open the PDF
        doc = fitz.open(pdf_path)
        
        # Check page number validity
        if pg < 1 or pg > len(doc):
            raise HTTPException(status_code=400, detail=f"Invalid page number. PDF has {len(doc)} pages")
            
        # Render the page with 2x resolution for better quality
        pix = doc[pg-1].get_pixmap(matrix=fitz.Matrix(2, 2))
        
        # Convert to PNG
        png_bytes = pix.tobytes("png")
        
        # Return the image
        return Response(content=png_bytes, media_type="image/png")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error rendering PDF: {str(e)}")
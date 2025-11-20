"""embed_delta.py – embed only changed/approved documents.
Usage: python -m scripts.embed_delta
Requires: openai, sqlalchemy, pgvector, pymupdf, tqdm
"""
import hashlib, re, fitz, os
from tqdm import tqdm
from sqlalchemy.orm import Session
from openai import OpenAI
from server.db import SessionLocal, engine, Base
from server.models.csr import CSR
from server.models.doc_chunk import DocChunk

EMBED_MODEL = "text-embedding-3-small"
TOKENS = 500  # ~500 tokens ≈ 350‑400 words
STRIP = re.compile(r"\s+")
client = OpenAI()

def sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()

def chunk_pages(pdf_path: str, words_per: int = TOKENS):
    """Yield (chunk_text, page_number) from a PDF."""
    try:
        doc = fitz.open(pdf_path)
        for page_i, page in enumerate(doc, 1):
            words = STRIP.sub(" ", page.get_text()).split()
            for i in range(0, len(words), words_per):
                chunk = " ".join(words[i : i + words_per])
                if chunk.strip():
                    yield chunk, page_i
    except Exception as e:
        print(f"Error processing PDF {pdf_path}: {e}")
        yield "Failed to extract PDF content", 1

def main():
    # Create extensions if needed
    try:
        engine.execute("CREATE EXTENSION IF NOT EXISTS pgvector;")
        engine.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        # Add hash column if not exists
        engine.execute("ALTER TABLE csrs ADD COLUMN IF NOT EXISTS hash VARCHAR;")
        # Add page column if not exists
        engine.execute("ALTER TABLE doc_chunks ADD COLUMN IF NOT EXISTS page INTEGER;")
        print("✓ Database extensions and columns created")
    except Exception as e:
        print(f"Database setup error (continuing anyway): {e}")
    
    # Ensure tables exist
    Base.metadata.create_all(engine)
    
    # Begin processing
    db: Session = SessionLocal()
    approved = db.query(CSR).filter(CSR.status == "approved").all()
    
    for d in tqdm(approved, desc="delta‑embed"):
        # Calculate content hash
        new_hash = sha256(d.content or "")
        
        # Skip if unchanged
        if new_hash == d.hash:
            print(f"Skipping document {d.id} - unchanged hash")
            continue
            
        # Delete existing chunks
        db.query(DocChunk).filter(DocChunk.doc_id == d.id).delete()
        
        # Get PDF path
        pdf_path = getattr(d, 'pdf_path', None)
        if not pdf_path:
            pdf_path = f"./uploads/csrs/{d.id}.pdf"  # Default path structure
        
        # Check if PDF exists
        if not os.path.isfile(pdf_path):
            print(f"Warning: PDF not found at {pdf_path}, skipping")
            continue
            
        # Process PDF pages
        chunk_count = 0
        for chunk, pg in chunk_pages(pdf_path):
            emb = client.embeddings.create(input=chunk, model=EMBED_MODEL).data[0].embedding
            db.add(DocChunk(doc_id=d.id, content=chunk, page=pg, embedding=emb))
            chunk_count += 1
            
        # Update document hash
        d.hash = new_hash
        
        # Commit
        db.commit()
        print(f"Processed document {d.id}: {chunk_count} chunks with page references")
    
    # Verify results
    total_chunks = db.query(DocChunk).count()
    print(f"✓ Delta embedding complete! Total chunks in database: {total_chunks}")
    db.close()

if __name__ == "__main__":
    main()
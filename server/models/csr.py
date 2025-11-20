from sqlalchemy import Column, Integer, String, Float, Date, JSON, ARRAY, Text
from server.db import Base  # your existing SQLAlchemy base

class CSR(Base):
    __tablename__ = "csrs"
    id          = Column(Integer, primary_key=True)
    title       = Column(String, nullable=False)
    therapeutic = Column(String)          # e.g. 'Oncology'
    protocol_id = Column(Integer)         # FK to protocols
    created_at  = Column(Date)
    content     = Column(Text)            # Document content
    pdf_path    = Column(String)          # Path to PDF file
    status      = Column(String)          # Document status (e.g., 'approved', 'draft')
    hash        = Column(String)          # SHA256 hash of content for delta embedding

class Benchmark(Base):
    __tablename__ = "csr_benchmarks"
    id          = Column(Integer, primary_key=True)
    metric      = Column(String, nullable=False)   # e.g. 'Median Enrollment Time'
    value       = Column(Float)                    # numeric or string (store text if mixed)
    unit        = Column(String, default="days")   # optional
    source_csr  = Column(Integer)                  # FK to CSR.id for traceability
    trend       = Column(JSON)                     # JSON array of {date, value} points for sparkline

class TrendPoint(Base):
    __tablename__ = "benchmark_trends"
    id          = Column(Integer, primary_key=True)
    benchmark_id = Column(Integer)                 # FK to benchmark.id
    date        = Column(String)                   # e.g. "2022-Q1"
    value       = Column(Float)                    # numeric value for that time period

class InsightModel(Base):
    __tablename__ = "ai_insight_models"
    id          = Column(Integer, primary_key=True)
    name        = Column(String, nullable=False)   # e.g. 'Drop-Out Risk Predictor'
    description = Column(String)
    version     = Column(String)
    created_at  = Column(Date)
    tags        = Column(ARRAY(String))            # Array of tag strings
    doc_url     = Column(String)                   # URL to documentation